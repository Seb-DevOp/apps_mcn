import { prisma } from "../db";

/**
 * External identities — Farcaster and wallet.
 *
 * Built now, switched off now. The table, the service and the call sites all
 * exist so that turning either on in V3 is a flag and a verification function,
 * not a migration and a refactor.
 *
 * Every entry point refuses while its flag is off. None of them is ever required
 * to play, to keep an account, or to sign back in — the brief is explicit that a
 * wallet must never be a condition of playing, and passkeys already cover
 * long-term account recovery on their own.
 */

export type IdentityProvider = "FARCASTER" | "WALLET";

export interface ProviderStatus {
  provider: IdentityProvider;
  enabled: boolean;
  /** What still has to happen before this can be switched on. */
  pending: string;
}

export function identityStatus(): ProviderStatus[] {
  return [
    {
      provider: "FARCASTER",
      enabled: process.env.FARCASTER_AUTH_ENABLED === "true",
      pending: "Sign-In With Farcaster verification and a registered Mini App domain",
    },
    {
      provider: "WALLET",
      enabled: process.env.NEXT_PUBLIC_WALLET_ENABLED === "true",
      pending: "signature verification against a server-issued nonce",
    },
  ];
}

export function isProviderEnabled(provider: IdentityProvider): boolean {
  return identityStatus().find((entry) => entry.provider === provider)?.enabled ?? false;
}

export type LinkResult =
  | { ok: true; provider: IdentityProvider; externalId: string }
  | { ok: false; reason: "DISABLED" | "BAD_PROOF" | "TAKEN" | "INVALID_ID" };

/**
 * Proof of ownership, whatever the provider.
 *
 * V3 fills these in:
 *   FARCASTER — signing in is already live and lives in ./farcaster, which
 *               verifies a Quick Auth token. This path stays shut: it is for
 *               attaching an identity to an account that is already signed in,
 *               which needs its own proof and has no caller yet.
 *   WALLET    — recover the signer from `proof` over a server-issued nonce and
 *               require it to equal `externalId`.
 *
 * Until then the function refuses rather than storing an unverified identity,
 * which is the only honest behaviour: an unverified link is an account takeover
 * waiting to happen.
 */
async function verifyProof(
  provider: IdentityProvider,
  externalId: string,
  proof: string | undefined,
): Promise<boolean> {
  if (!proof) return false;
  void provider;
  void externalId;
  return false;
}

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const FARCASTER_FID = /^[0-9]{1,12}$/;

function normalizeExternalId(provider: IdentityProvider, externalId: string): string | null {
  if (provider === "WALLET") {
    return EVM_ADDRESS.test(externalId) ? externalId.toLowerCase() : null;
  }
  return FARCASTER_FID.test(externalId) ? externalId : null;
}

export async function linkIdentity(
  userId: string,
  provider: IdentityProvider,
  externalId: string,
  proof?: string,
): Promise<LinkResult> {
  if (!isProviderEnabled(provider)) return { ok: false, reason: "DISABLED" };

  const normalized = normalizeExternalId(provider, externalId);
  if (!normalized) return { ok: false, reason: "INVALID_ID" };

  if (!(await verifyProof(provider, normalized, proof))) {
    return { ok: false, reason: "BAD_PROOF" };
  }

  const taken = await prisma.linkedIdentity.findUnique({
    where: { provider_externalId: { provider, externalId: normalized } },
  });
  if (taken && taken.userId !== userId) return { ok: false, reason: "TAKEN" };

  await prisma.linkedIdentity.upsert({
    where: { provider_externalId: { provider, externalId: normalized } },
    create: { userId, provider, externalId: normalized },
    update: { userId },
  });

  return { ok: true, provider, externalId: normalized };
}

/** Signing in through an external identity. Disabled for the same reasons. */
export async function findUserByIdentity(
  provider: IdentityProvider,
  externalId: string,
  proof?: string,
): Promise<string | null> {
  if (!isProviderEnabled(provider)) return null;

  const normalized = normalizeExternalId(provider, externalId);
  if (!normalized) return null;
  if (!(await verifyProof(provider, normalized, proof))) return null;

  const row = await prisma.linkedIdentity.findUnique({
    where: { provider_externalId: { provider, externalId: normalized } },
  });
  return row?.userId ?? null;
}

export async function listIdentities(userId: string) {
  return prisma.linkedIdentity.findMany({
    where: { userId },
    select: { provider: true, externalId: true, linkedAt: true },
  });
}
