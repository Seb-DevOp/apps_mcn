import { prisma } from "@/lib/db";

/**
 * Wallet & MCN token layer — present, typed, and deliberately inert in V1.
 *
 * MCN The Vault is a progression game that lives next to the MCN ecosystem, not a
 * staking dashboard with a game bolted on. So V1 ships the seams — a link step, a
 * balance read, a claim path — with every one of them refusing to act until the
 * flags are switched on and the real thirdweb/Base wiring lands in V3.
 *
 * Nothing here ever gates gameplay. A player without a wallet loses nothing.
 */

export interface WalletCapabilities {
  /** Can the UI offer "Connect Wallet" at all? */
  connectEnabled: boolean;
  /** Are MCN token payouts live? Off until legal and technical review completes. */
  tokenRewardsEnabled: boolean;
  chain: string;
  tokenAddress: string | null;
}

export function walletCapabilities(): WalletCapabilities {
  return {
    connectEnabled: process.env.NEXT_PUBLIC_WALLET_ENABLED === "true",
    tokenRewardsEnabled: process.env.MCN_TOKEN_REWARDS_ENABLED === "true",
    chain: process.env.NEXT_PUBLIC_MCN_CHAIN ?? "base",
    tokenAddress: process.env.MCN_TOKEN_ADDRESS || null,
  };
}

export type LinkResult =
  | { ok: true; address: string }
  | { ok: false; reason: "DISABLED" | "INVALID_ADDRESS" | "BAD_SIGNATURE" | "TAKEN" };

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

/**
 * Links a wallet to the player's account.
 *
 * V3 must verify a signed nonce before this writes anything — the signature
 * parameter is already in the contract so no caller has to change. Until the
 * flag is on, the whole path refuses rather than storing an unverified address.
 */
export async function linkWallet(
  userId: string,
  address: string,
  signature?: string,
): Promise<LinkResult> {
  const caps = walletCapabilities();
  if (!caps.connectEnabled) return { ok: false, reason: "DISABLED" };
  if (!EVM_ADDRESS.test(address)) return { ok: false, reason: "INVALID_ADDRESS" };

  // V3: recover the signer from `signature` over a server-issued nonce and
  // require it to equal `address`. Refusing outright is safer than pretending.
  if (!signature) return { ok: false, reason: "BAD_SIGNATURE" };

  const normalized = address.toLowerCase();
  const taken = await prisma.user.findFirst({
    where: { walletAddress: normalized, NOT: { id: userId } },
  });
  if (taken) return { ok: false, reason: "TAKEN" };

  await prisma.user.update({
    where: { id: userId },
    data: { walletAddress: normalized, walletChain: caps.chain, walletLinkedAt: new Date() },
  });
  return { ok: true, address: normalized };
}

/**
 * MCN balance for a linked wallet.
 * Returns null while token reads are disabled — the UI shows "not connected"
 * rather than a fabricated number.
 */
export async function getMcnBalance(address: string | null): Promise<string | null> {
  const caps = walletCapabilities();
  if (!caps.tokenRewardsEnabled || !caps.tokenAddress || !address) return null;

  // V3: read balanceOf via viem/thirdweb against Base and format with the
  // token's decimals. Intentionally unimplemented rather than mocked.
  return null;
}

/** Pending MCN grants recorded by the engine. Always empty while the flag is off. */
export async function pendingGrants(userId: string) {
  return prisma.rewardGrant.findMany({
    where: { userId, rewardType: "MCN" },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}
