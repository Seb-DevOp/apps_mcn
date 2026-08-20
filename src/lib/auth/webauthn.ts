import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import { prisma } from "../db";

/**
 * Passkeys.
 *
 * The private key never leaves the player's phone, and the platform syncs it
 * through iCloud Keychain or Google Password Manager — so a passkey survives a
 * lost device without us ever holding a secret that could be stolen from us.
 *
 * Verification is delegated to @simplewebauthn: hand-rolling attestation and
 * signature checking is exactly the kind of code that looks right and is not.
 */

const RP_NAME = "MCN — The Vault";
const CHALLENGE_TTL_MS = 5 * 60_000;

/**
 * A passkey is bound to a domain. The relying-party ID therefore has to be the
 * real host — and must never be taken from an attacker-controllable header alone,
 * hence the explicit APP_ORIGIN in production.
 */
export function relyingParty(request: Request): { rpID: string; origin: string } {
  const configured = process.env.APP_ORIGIN;
  if (configured) {
    const url = new URL(configured);
    return { rpID: url.hostname, origin: url.origin };
  }

  const host = request.headers.get("host") ?? "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return { rpID: host.split(":")[0], origin: `${proto}://${host}` };
}

async function storeChallenge(challenge: string, kind: "REGISTER" | "AUTHENTICATE", userId?: string) {
  await prisma.authChallenge.create({
    data: {
      challenge,
      kind,
      userId: userId ?? null,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    },
  });
  // Opportunistic cleanup; challenges are worthless once expired.
  await prisma.authChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}

/** Consumes a challenge: a replayed response finds nothing and is refused. */
async function takeChallenge(challenge: string, kind: "REGISTER" | "AUTHENTICATE") {
  const row = await prisma.authChallenge.findUnique({ where: { challenge } });
  if (!row || row.kind !== kind || row.expiresAt < new Date()) return null;
  await prisma.authChallenge.delete({ where: { id: row.id } });
  return row;
}

// ---------------------------------------------------------------------------
// Registration — adding a passkey to the account the player is already using
// ---------------------------------------------------------------------------

export async function passkeyRegistrationOptions(request: Request, userId: string, handle: string) {
  const { rpID } = relyingParty(request);
  const existing = await prisma.credential.findMany({ where: { userId } });

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userID: new TextEncoder().encode(userId),
    userName: handle,
    userDisplayName: handle,
    attestationType: "none",
    // Offering an existing key again would silently overwrite it on some platforms.
    excludeCredentials: existing.map((credential) => ({ id: credential.credentialId })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  await storeChallenge(options.challenge, "REGISTER", userId);
  return options;
}

export async function verifyPasskeyRegistration(
  request: Request,
  userId: string,
  response: RegistrationResponseJSON,
  deviceLabel?: string,
): Promise<{ ok: true } | { ok: false; error: "BAD_CHALLENGE" | "NOT_VERIFIED" }> {
  const { rpID, origin } = relyingParty(request);

  const challengeValue = response.response.clientDataJSON
    ? JSON.parse(Buffer.from(response.response.clientDataJSON, "base64url").toString()).challenge
    : "";
  const stored = await takeChallenge(challengeValue, "REGISTER");
  if (!stored || stored.userId !== userId) return { ok: false, error: "BAD_CHALLENGE" };

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: challengeValue,
    expectedOrigin: origin,
    expectedRPID: rpID,
  }).catch(() => null);

  if (!verification?.verified || !verification.registrationInfo) {
    return { ok: false, error: "NOT_VERIFIED" };
  }

  const { credential } = verification.registrationInfo;
  await prisma.credential.create({
    data: {
      userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter,
      transports: (credential.transports ?? []).join(","),
      deviceLabel: deviceLabel?.slice(0, 60) ?? null,
    },
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Authentication — proving ownership of an account from any device
// ---------------------------------------------------------------------------

export async function passkeyAuthenticationOptions(request: Request) {
  const { rpID } = relyingParty(request);

  // No allowCredentials: the platform offers whichever passkey it holds for this
  // site, so the player never has to type who they are first.
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
  });

  await storeChallenge(options.challenge, "AUTHENTICATE");
  return options;
}

export async function verifyPasskeyAuthentication(
  request: Request,
  response: AuthenticationResponseJSON,
): Promise<
  { ok: true; userId: string } | { ok: false; error: "BAD_CHALLENGE" | "UNKNOWN_KEY" | "NOT_VERIFIED" }
> {
  const { rpID, origin } = relyingParty(request);

  const challengeValue = JSON.parse(
    Buffer.from(response.response.clientDataJSON, "base64url").toString(),
  ).challenge as string;

  const stored = await takeChallenge(challengeValue, "AUTHENTICATE");
  if (!stored) return { ok: false, error: "BAD_CHALLENGE" };

  const credential = await prisma.credential.findUnique({
    where: { credentialId: response.id },
  });
  if (!credential) return { ok: false, error: "UNKNOWN_KEY" };

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challengeValue,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: credential.credentialId,
      publicKey: new Uint8Array(Buffer.from(credential.publicKey, "base64url")),
      counter: credential.counter,
      transports: credential.transports
        ? (credential.transports.split(",") as never)
        : undefined,
    },
  }).catch(() => null);

  if (!verification?.verified) return { ok: false, error: "NOT_VERIFIED" };

  // The counter is the platform's own replay guard; keeping it current matters.
  await prisma.credential.update({
    where: { id: credential.id },
    data: {
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: new Date(),
    },
  });

  return { ok: true, userId: credential.userId };
}

export async function listPasskeys(userId: string) {
  return prisma.credential.findMany({
    where: { userId },
    select: { id: true, deviceLabel: true, createdAt: true, lastUsedAt: true },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Removing a passkey is refused when it is the only way left into the account —
 * a player should never be able to lock themselves out with one tap.
 */
export async function removePasskey(
  userId: string,
  credentialRowId: string,
): Promise<{ ok: true } | { ok: false; error: "NOT_FOUND" | "LAST_METHOD" }> {
  const [row, count, user, codes] = await Promise.all([
    prisma.credential.findFirst({ where: { id: credentialRowId, userId } }),
    prisma.credential.count({ where: { userId } }),
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.recoveryCode.count({ where: { userId, usedAt: null } }),
  ]);

  if (!row) return { ok: false, error: "NOT_FOUND" };

  const hasOtherMethod = count > 1 || Boolean(user.passwordHash) || codes > 0;
  if (!hasOtherMethod) return { ok: false, error: "LAST_METHOD" };

  await prisma.credential.delete({ where: { id: row.id } });
  return { ok: true };
}
