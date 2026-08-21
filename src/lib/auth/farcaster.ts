import { createClient, Errors } from "@farcaster/quick-auth";
import { prisma } from "../db";
import { normalizeHandle, startSessionFor } from "./session";
import { ensureMissions } from "../engine/missions";
import { grantStarterEquipment } from "../engine/loadout";
import { track } from "../engine/analytics";

/**
 * Signing in from inside a Farcaster client.
 *
 * A player who opens the Mini App is already identified — their client knows
 * their FID. Asking them for a name, an address and a password twice would throw
 * away the only real advantage of the channel, so here the FID *is* the
 * registration: a real, persistent account, created without a form.
 *
 * That is not a step back to anonymous accounts. A Farcaster identity is verified
 * by Farcaster itself, which makes it stronger than an unconfirmed email — and
 * these players can still attach an address and a password later from the profile.
 */

const quickAuth = createClient();

/** Farcaster issues tokens for one domain; verification must pin the same one. */
export function appDomain(request: Request): string {
  const configured = process.env.APP_ORIGIN;
  if (configured) return new URL(configured).hostname;
  const host = request.headers.get("host") ?? "localhost:3000";
  return host.split(":")[0];
}

export type FarcasterSignInError = "BAD_TOKEN" | "DISABLED";

export interface FarcasterHints {
  /** From sdk.context.user — cosmetic only, never trusted as identity. */
  username?: string;
  displayName?: string;
}

export function farcasterEnabled(): boolean {
  return process.env.FARCASTER_AUTH_ENABLED === "true";
}

/**
 * Verifies a Quick Auth token and returns the account behind the FID, creating
 * one on first visit.
 *
 * The FID comes from the verified JWT and nothing else. The username the client
 * offers is used only to pick a nicer display name — if it were trusted as
 * identity, anyone could claim anyone's account.
 */
export async function signInWithFarcaster(
  request: Request,
  token: string,
  hints: FarcasterHints = {},
): Promise<
  { ok: true; userId: string; fid: string; created: boolean } | { ok: false; error: FarcasterSignInError }
> {
  if (!farcasterEnabled()) return { ok: false, error: "DISABLED" };

  let fid: string;
  try {
    const payload = await quickAuth.verifyJwt({
      token,
      domain: appDomain(request),
    });
    fid = String(payload.sub);
  } catch (error) {
    if (error instanceof Errors.InvalidTokenError) return { ok: false, error: "BAD_TOKEN" };
    return { ok: false, error: "BAD_TOKEN" };
  }

  const existing = await prisma.linkedIdentity.findUnique({
    where: { provider_externalId: { provider: "FARCASTER", externalId: fid } },
  });

  if (existing) {
    await startSessionFor(existing.userId);
    await track("account.signin", existing.userId, { method: "FARCASTER" });
    return { ok: true, userId: existing.userId, fid, created: false };
  }

  const handle = await pickHandle(hints.username ?? hints.displayName, fid);

  const user = await prisma.user.create({
    data: {
      handle,
      // No address and no password: the Farcaster identity is the credential.
      // Both can be added later from the profile, and changing them there works
      // because the current-password check is skipped when there is none.
      claimedAt: new Date(),
      locale: "en",
    },
  });

  await prisma.linkedIdentity.create({
    data: {
      userId: user.id,
      provider: "FARCASTER",
      externalId: fid,
      metaJson: JSON.stringify({
        username: hints.username ?? null,
        displayName: hints.displayName ?? null,
      }),
    },
  });

  await ensureMissions(user.id, user.rankKey);
  await grantStarterEquipment(user.id);
  await startSessionFor(user.id);
  await track("account.registered", user.id, { method: "FARCASTER" });

  return { ok: true, userId: user.id, fid, created: true };
}

/**
 * A name the player will recognise, without ever failing.
 *
 * Their Farcaster username first, then the same with the FID appended, then a
 * plain fallback — registration must never break because a name was taken.
 */
async function pickHandle(suggestion: string | undefined, fid: string): Promise<string> {
  const candidates = [
    normalizeHandle(suggestion ?? ""),
    `${normalizeHandle(suggestion ?? "").slice(0, 10)}${fid}`,
    `Guardian${fid}`,
  ];

  for (const candidate of candidates) {
    if (candidate.length < 3 || candidate.length > 18) continue;
    const taken = await prisma.user.findUnique({ where: { handle: candidate } });
    if (!taken) return candidate;
  }

  // Exhausted: append entropy rather than refuse a player at the door.
  return `Guardian${fid}${Math.floor(Math.random() * 1000)}`.slice(0, 18);
}
