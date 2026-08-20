import { prisma } from "../db";
import { track } from "../engine/analytics";
import { hashPassword, verifyPassword, checkPassword, normalizeEmail, isEmailShaped } from "./password";
import { countRemainingCodes, consumeRecoveryCode } from "./recovery";
import { listPasskeys } from "./webauthn";
import { listIdentities, identityStatus } from "./identity";
import { emailEnabled } from "./email";

/**
 * Living with an account.
 *
 * Registration happens once, at the door (see ./register). Everything here is
 * what comes afterwards: signing back in, changing the address or the password,
 * and telling the profile screen how recoverable the account actually is.
 */

export type ClaimError =
  | "EMAIL_TAKEN"
  | "EMAIL_INVALID"
  | "PASSWORD_TOO_SHORT"
  | "PASSWORD_TOO_LONG"
  | "PASSWORD_TOO_COMMON";

/**
 * Changing the address on an account.
 *
 * The current password is required whenever the account has one. Without that
 * check, anyone holding a session cookie could point the account at their own
 * inbox and reset the password from there — a session becoming a permanent
 * takeover.
 */
export async function changeEmail(
  userId: string,
  currentPassword: string,
  email: string,
): Promise<{ ok: true } | { ok: false; error: ClaimError | "WRONG_PASSWORD" | "NO_PASSWORD" }> {
  const normalized = normalizeEmail(email);
  if (!isEmailShaped(normalized)) return { ok: false, error: "EMAIL_INVALID" };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  // Accounts created before registration became mandatory have no password.
  // There is nothing to prove ownership against, so the current-password check is
  // skipped for them — the session is the only credential they have ever had.
  if (user.passwordHash && !(await verifyPassword(currentPassword, user.passwordHash))) {
    return { ok: false, error: "WRONG_PASSWORD" };
  }

  const taken = await prisma.user.findFirst({
    where: { email: normalized, NOT: { id: userId } },
  });
  if (taken) return { ok: false, error: "EMAIL_TAKEN" };

  await prisma.user.update({
    where: { id: userId },
    data: {
      email: normalized,
      // A new address is unverified until it is proved, whatever the old one was.
      emailVerifiedAt: null,
    },
  });

  await markClaimed(userId);
  await track("account.emailChanged", userId, {});
  return { ok: true };
}

/** The account stops being anonymous the first time any method is attached. */
export async function markClaimed(userId: string) {
  await prisma.user.updateMany({
    where: { id: userId, claimedAt: null },
    data: { claimedAt: new Date() },
  });
}

/**
 * A dummy hash of the right shape, so a missing account costs the same time as a
 * real one and response timing never reveals which names or addresses exist.
 */
const DECOY_HASH =
  "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

/**
 * Password sign-in by name or address.
 *
 * Players remember the name they chose far more reliably than which address they
 * used, so either works. An "@" is the only thing that decides which column to
 * look in — names cannot contain one.
 */
export async function signInWithIdentifier(
  identifier: string,
  password: string,
): Promise<string | null> {
  const value = identifier.trim();

  const user = value.includes("@")
    ? await prisma.user.findUnique({ where: { email: normalizeEmail(value) } })
    : await prisma.user.findUnique({ where: { handle: value.slice(0, 40) } });

  const valid = await verifyPassword(password, user?.passwordHash ?? DECOY_HASH);
  if (!valid || !user?.passwordHash) return null;

  await track("account.signin", user.id, { method: "PASSWORD" });
  return user.id;
}

export async function signInWithRecoveryCode(code: string): Promise<string | null> {
  const userId = await consumeRecoveryCode(code);
  if (userId) await track("account.signin", userId, { method: "RECOVERY" });
  return userId;
}

export async function changePassword(
  userId: string,
  current: string,
  next: string,
): Promise<{ ok: true } | { ok: false; error: ClaimError | "WRONG_PASSWORD" | "NO_PASSWORD" }> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  // Accounts created before registration became mandatory have no password.
  // There is nothing to prove ownership against, so the current-password check is
  // skipped for them — the session is the only credential they have ever had.
  if (user.passwordHash && !(await verifyPassword(current, user.passwordHash))) {
    return { ok: false, error: "WRONG_PASSWORD" };
  }

  const strength = checkPassword(next);
  if (!strength.ok) {
    return {
      ok: false,
      error:
        strength.reason === "TOO_LONG"
          ? "PASSWORD_TOO_LONG"
          : strength.reason === "TOO_COMMON"
            ? "PASSWORD_TOO_COMMON"
            : "PASSWORD_TOO_SHORT",
    };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(next) },
  });
  await markClaimed(userId);
  return { ok: true };
}

/** Used by the reset flow, which has already proved ownership through the token. */
export async function forceSetPassword(userId: string, password: string) {
  const strength = checkPassword(password);
  if (!strength.ok) return { ok: false as const, reason: strength.reason };
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password), emailVerifiedAt: new Date() },
  });
  await markClaimed(userId);
  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// What the profile screen needs to render the security section
// ---------------------------------------------------------------------------

export async function getAccountStatus(userId: string) {
  const [user, passkeys, codesLeft, identities] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    listPasskeys(userId),
    countRemainingCodes(userId),
    listIdentities(userId),
  ]);

  // Every account has a password now, so the question is no longer "can they get
  // back in at all" but "what happens the day they forget it". With no passkey,
  // no codes and no email delivery, the answer is nothing — and that is worth
  // saying out loud.
  const canRecover =
    passkeys.length > 0 || codesLeft > 0 || (Boolean(user.email) && emailEnabled());

  return {
    claimed: Boolean(user.claimedAt),
    email: user.email,
    emailVerified: Boolean(user.emailVerifiedAt),
    hasPassword: Boolean(user.passwordHash),
    passkeys: passkeys.map((key) => ({
      id: key.id,
      label: key.deviceLabel,
      createdAt: key.createdAt.toISOString(),
      lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    })),
    recoveryCodesLeft: codesLeft,
    /** True when a forgotten password would leave no way back in. */
    atRisk: !canRecover,
    emailDeliveryEnabled: emailEnabled(),
    identities: identities.map((row) => ({
      provider: row.provider,
      externalId: row.externalId,
      linkedAt: row.linkedAt.toISOString(),
    })),
    identityProviders: identityStatus(),
  };
}

export type AccountStatus = Awaited<ReturnType<typeof getAccountStatus>>;
