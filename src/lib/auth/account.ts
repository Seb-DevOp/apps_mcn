import { prisma } from "../db";
import { track } from "../engine/analytics";
import { hashPassword, verifyPassword, checkPassword, normalizeEmail, isEmailShaped } from "./password";
import { countRemainingCodes, consumeRecoveryCode } from "./recovery";
import { listPasskeys } from "./webauthn";
import { listIdentities, identityStatus } from "./identity";
import { emailEnabled } from "./email";

/**
 * Claiming an account.
 *
 * A player starts as a guest and never has to stop being one. Claiming is the
 * moment their progress stops depending on one browser's cookie — and it is
 * always an upgrade of the account they are already playing, never a new one, so
 * nothing is ever migrated or lost.
 */

export type ClaimError =
  | "EMAIL_TAKEN"
  | "EMAIL_INVALID"
  | "PASSWORD_TOO_SHORT"
  | "PASSWORD_TOO_LONG"
  | "PASSWORD_TOO_COMMON";

export async function setEmailAndPassword(
  userId: string,
  email: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: ClaimError }> {
  const normalized = normalizeEmail(email);
  if (!isEmailShaped(normalized)) return { ok: false, error: "EMAIL_INVALID" };

  const strength = checkPassword(password);
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

  const taken = await prisma.user.findFirst({
    where: { email: normalized, NOT: { id: userId } },
  });
  if (taken) return { ok: false, error: "EMAIL_TAKEN" };

  const passwordHash = await hashPassword(password);
  await prisma.user.update({
    where: { id: userId },
    data: {
      email: normalized,
      passwordHash,
      // A new address is unverified until it is proved, whatever the old one was.
      emailVerifiedAt: null,
    },
  });

  await markClaimed(userId);
  await track("account.claimed", userId, { method: "PASSWORD" });
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
 * Password sign-in.
 *
 * Always does the same work whether the address exists or not, so response time
 * cannot be used to discover which addresses have accounts.
 */
export async function signInWithPassword(
  email: string,
  password: string,
): Promise<string | null> {
  const normalized = normalizeEmail(email);
  const user = await prisma.user.findUnique({ where: { email: normalized } });

  const stored =
    user?.passwordHash ??
    // A dummy hash of the same shape, so a missing account costs the same time.
    "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

  const valid = await verifyPassword(password, stored);
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
  if (!user.passwordHash) return { ok: false, error: "NO_PASSWORD" };
  if (!(await verifyPassword(current, user.passwordHash))) {
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

  const methods = passkeys.length + (user.passwordHash ? 1 : 0);

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
    /** True while the account still lives and dies with this browser's cookie. */
    atRisk: methods === 0 && codesLeft === 0,
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
