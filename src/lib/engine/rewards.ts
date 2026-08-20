import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dayKey } from "@/lib/time";
import { rankForXp, RANK_BY_KEY, RANKS } from "@/lib/content/ranks";
import { RANK_BADGE, ITEM_BY_KEY, type Rarity } from "@/lib/content/items";

/**
 * RewardService — the single place where a player's balance can change.
 *
 * Every route funnels through `applyRewards`, so there is exactly one code path
 * to audit, one place that writes the XP ledger, and one place that detects a
 * rank-up. Nothing here can be triggered by a client-supplied amount.
 *
 * `MCN` is a declared reward type from day one but is refused while
 * MCN_TOKEN_REWARDS_ENABLED is off — the architecture is ready, the payout is not.
 */

const RANKS_BY_ORDER = RANKS.slice().sort((a, b) => a.order - b.order);

export type RewardType = "XP" | "SHARD" | "ITEM" | "BOOST" | "COSMETIC" | "BADGE" | "MCN";

export interface Reward {
  type: RewardType;
  itemKey?: string | null;
  qty: number;
  rarity?: Rarity;
}

export interface RankUpInfo {
  fromKey: string;
  toKey: string;
}

export interface ApplyResult {
  rewards: Reward[];
  xpGained: number;
  shardsGained: number;
  rankUp: RankUpInfo | null;
  newXp: number;
  newShards: number;
  newRankKey: string;
}

export function mcnRewardsEnabled(): boolean {
  return process.env.MCN_TOKEN_REWARDS_ENABLED === "true";
}

/** Active multiplier for a stat, from the player's running boosts. Capped to stay sane. */
export async function activeMultiplier(
  tx: Prisma.TransactionClient,
  userId: string,
  statKey: "XP" | "SHARD" | "SCORE",
): Promise<number> {
  const boosts = await tx.userBoost.findMany({
    where: { userId, statKey, expiresAt: { gt: new Date() } },
  });
  if (boosts.length === 0) return 1;
  const combined = boosts.reduce((m, b) => m * b.multiplier, 1);
  return Math.min(combined, 2.5);
}

interface ApplyOptions {
  /** Where this came from — written to the XP ledger for audit and analytics. */
  source: "CHEST" | "GAME" | "MISSION" | "STREAK" | "RANKUP" | "ADMIN";
  refId?: string;
  /** Temporary boosts multiply XP/Shards. Rank-up gifts deliberately do not. */
  applyBoosts?: boolean;
  /** Internal: set while granting the rank-up gift so it cannot re-trigger itself. */
  noRankUpGift?: boolean;
}

/**
 * Applies a set of rewards inside an existing transaction.
 * Returns what actually landed, including any rank-up that this grant caused.
 */
export async function applyRewards(
  tx: Prisma.TransactionClient,
  userId: string,
  rewards: Reward[],
  options: ApplyOptions,
): Promise<ApplyResult> {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });

  const xpMultiplier = options.applyBoosts ? await activeMultiplier(tx, userId, "XP") : 1;
  const shardMultiplier = options.applyBoosts ? await activeMultiplier(tx, userId, "SHARD") : 1;

  const granted: Reward[] = [];
  let xpGained = 0;
  let shardsGained = 0;
  let itemsGained = 0;

  for (const reward of rewards) {
    if (reward.qty <= 0) continue;

    if (reward.type === "MCN") {
      // Never silently swallowed and never silently paid: recorded as DISABLED
      // so the intent is auditable when the module is switched on in V3/V4.
      await tx.rewardGrant.create({
        data: {
          userId,
          rewardType: "MCN",
          amount: String(reward.qty),
          status: mcnRewardsEnabled() ? "PENDING" : "DISABLED",
          chain: process.env.NEXT_PUBLIC_MCN_CHAIN ?? "base",
        },
      });
      continue;
    }

    if (reward.type === "XP") {
      const amount = Math.round(reward.qty * xpMultiplier);
      xpGained += amount;
      granted.push({ ...reward, qty: amount });
      continue;
    }

    if (reward.type === "SHARD") {
      const amount = Math.round(reward.qty * shardMultiplier);
      shardsGained += amount;
      granted.push({ ...reward, qty: amount });
      continue;
    }

    // ITEM / BOOST / COSMETIC / BADGE all resolve to one inventory row.
    if (!reward.itemKey) continue;
    const def = ITEM_BY_KEY[reward.itemKey];
    if (!def) continue;

    const existing = await tx.inventoryItem.findUnique({
      where: { userId_itemKey: { userId, itemKey: reward.itemKey } },
    });

    // Non-stackable items (badges, cosmetics) are never duplicated in V1.
    // V2 turns extra copies into Forge fragments instead of dropping them.
    if (existing && def.stackable === false) {
      continue;
    }

    await tx.inventoryItem.upsert({
      where: { userId_itemKey: { userId, itemKey: reward.itemKey } },
      create: { userId, itemKey: reward.itemKey, quantity: reward.qty },
      update: { quantity: { increment: reward.qty } },
    });
    itemsGained += reward.qty;
    granted.push(reward);
  }

  const newXp = user.xp + xpGained;
  const newShards = user.shards + shardsGained;
  const previousRank = RANK_BY_KEY[user.rankKey] ?? rankForXp(user.xp);
  const earnedRank = rankForXp(newXp);
  const rankUp =
    earnedRank.order > previousRank.order
      ? { fromKey: previousRank.key, toKey: earnedRank.key }
      : null;

  await tx.user.update({
    where: { id: userId },
    data: { xp: newXp, shards: newShards, rankKey: earnedRank.key, lastSeenAt: new Date() },
  });

  if (xpGained !== 0) {
    await tx.xpLedger.create({
      data: { userId, amount: xpGained, source: options.source, refId: options.refId },
    });
  }

  const day = dayKey();
  await tx.dailyActivity.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day, xpEarned: xpGained },
    update: { xpEarned: { increment: xpGained } },
  });

  let finalShards = newShards;
  const rankUpGifts: Reward[] = [];

  // Reaching a rank unlocks several things at once. The permanently better daily
  // chest is the real prize; the badge and shards make the moment land.
  // A single grant can cross more than one threshold, so every rank passed pays out.
  if (rankUp && !options.noRankUpGift) {
    for (let order = previousRank.order + 1; order <= earnedRank.order; order++) {
      const gifts = rankUpGiftFor(order);
      if (gifts.length === 0) continue;
      const giftResult = await applyRewards(tx, userId, gifts, {
        source: "RANKUP",
        refId: `rank:${order}`,
        noRankUpGift: true,
      });
      rankUpGifts.push(...giftResult.rewards);
      finalShards = giftResult.newShards;
    }
  }

  return {
    rewards: [...granted, ...rankUpGifts],
    xpGained,
    shardsGained,
    rankUp,
    newXp,
    newShards: finalShards,
    newRankKey: earnedRank.key,
  };
}

function rankUpGiftFor(order: number): Reward[] {
  const rank = RANKS_BY_ORDER[order];
  if (!rank) return [];
  const rewards: Reward[] = [{ type: "SHARD", qty: 25 * (order + 1) }];
  const badge = RANK_BADGE[rank.key];
  if (badge) {
    rewards.push({ type: "BADGE", itemKey: badge, qty: 1, rarity: ITEM_BY_KEY[badge]?.rarity });
  }
  return rewards;
}

/** Fire-and-forget analytics. Never blocks or fails a gameplay action. */
export async function track(name: string, userId: string | null, props: Record<string, unknown> = {}) {
  try {
    await prisma.analyticsEvent.create({
      data: { userId, name, propsJson: JSON.stringify(props) },
    });
  } catch {
    // Analytics must never break a player's session.
  }
}
