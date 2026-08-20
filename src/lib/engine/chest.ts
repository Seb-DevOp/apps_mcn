import { prisma } from "@/lib/db";
import { dayKey } from "@/lib/time";
import { randomInt, weightedPick } from "@/lib/rng";
import { RANK_BY_KEY } from "@/lib/content/ranks";
import { CHEST_BY_KEY, streakCycleDay, type ChestDef } from "@/lib/content/chests";
import { ITEM_BY_KEY, type Rarity } from "@/lib/content/items";
import { applyRewards, type Reward } from "./rewards";
import { progressMissions, progressFromRewards } from "./missions";
import { touchStreak, type StreakUpdate } from "./streak";
import { getEquippedStats } from "./loadout";

/**
 * The Daily Chest.
 *
 * Rewards are rolled on the server from pools stored in the database. The client
 * sends nothing but "open" — it cannot influence the outcome, and the unique
 * (userId, day) row makes a second open on the same day impossible even under a
 * burst of concurrent requests.
 *
 * The chest is never empty: guaranteed entries are granted before any weighted
 * draw happens.
 */

export interface ChestResult {
  ok: boolean;
  error?: "ALREADY_OPENED";
  chestKey?: string;
  streakDay?: number;
  rewards?: Reward[];
  rankUp?: { fromKey: string; toKey: string } | null;
  streak?: StreakUpdate;
  /** Highest rarity in the drop — drives how loud the opening animation gets. */
  peakRarity?: Rarity;
}

const RARITY_RANK: Record<Rarity, number> = {
  COMMON: 0,
  UNCOMMON: 1,
  RARE: 2,
  EPIC: 3,
  MYTHIC: 4,
  LEGENDARY: 5,
};

function rollChest(chest: ChestDef, bonusDraws: number, xpMultiplier: number): Reward[] {
  const rewards: Reward[] = [];

  // 1. Guaranteed entries — the "you always get something" promise.
  for (const entry of chest.entries.filter((e) => e.guaranteed)) {
    const qty = randomInt(entry.minQty, entry.maxQty);
    rewards.push({
      type: entry.rewardType,
      itemKey: entry.itemKey ?? null,
      qty: entry.rewardType === "XP" ? Math.round(qty * xpMultiplier) : qty,
      rarity: entry.rarity,
    });
  }

  // 2. Weighted draws from the transparent pool.
  const pool = chest.entries.filter((e) => !e.guaranteed && e.weight > 0);
  const draws = chest.draws + bonusDraws;
  for (let i = 0; i < draws; i++) {
    const entry = weightedPick(pool);
    if (!entry) continue;
    rewards.push({
      type: entry.rewardType,
      itemKey: entry.itemKey ?? null,
      qty: randomInt(entry.minQty, entry.maxQty),
      rarity: entry.rarity,
    });
  }

  // Safety net: if a pool were ever misconfigured, still hand out XP.
  if (rewards.length === 0) {
    rewards.push({ type: "XP", qty: Math.max(10, Math.round(20 * xpMultiplier)), rarity: "COMMON" });
  }

  return mergeRewards(rewards);
}

/** Two draws of the same thing read better as one line: "Sapphire Shard ×3". */
function mergeRewards(rewards: Reward[]): Reward[] {
  const merged: Reward[] = [];
  for (const reward of rewards) {
    const existing = merged.find((r) => r.type === reward.type && r.itemKey === reward.itemKey);
    if (existing) existing.qty += reward.qty;
    else merged.push({ ...reward });
  }
  return merged;
}

export async function openDailyChest(userId: string): Promise<ChestResult> {
  const day = dayKey();

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.chestOpening.findUnique({
        where: { userId_day: { userId, day } },
      });
      if (existing) return { ok: false, error: "ALREADY_OPENED" as const };

      // Opening the chest is what marks the day as played.
      const streak = await touchStreak(tx, userId);

      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      const rank = RANK_BY_KEY[user.rankKey] ?? RANK_BY_KEY.wanderer;
      const chest = CHEST_BY_KEY[rank.chestTypeKey];
      const cycle = streakCycleDay(streak.currentStreak);

      // Relics and magic swords buy extra draws from the same transparent pool.
      const gear = await getEquippedStats(tx, userId);

      // Claim the day before rolling: the unique constraint is the lock.
      await tx.chestOpening.create({
        data: {
          userId,
          chestTypeKey: chest.key,
          day,
          streakDay: cycle.day,
          rewardsJson: "[]",
        },
      });

      const rolled = rollChest(chest, cycle.bonusDraws + gear.chestFortune, cycle.xpMultiplier);

      // First chest ever earns a badge — a small, permanent memory of day one.
      const chestCount = await tx.chestOpening.count({ where: { userId } });
      if (chestCount === 1) {
        rolled.push({ type: "BADGE", itemKey: "badge-first-light", qty: 1, rarity: "COMMON" });
      }
      if (streak.currentStreak === 7) {
        rolled.push({ type: "BADGE", itemKey: "badge-seven-days", qty: 1, rarity: "RARE" });
      }

      const result = await applyRewards(tx, userId, rolled, {
        source: "CHEST",
        refId: chest.key,
        applyBoosts: true,
      });

      await tx.chestOpening.update({
        where: { userId_day: { userId, day } },
        data: { rewardsJson: JSON.stringify(result.rewards) },
      });

      await tx.dailyActivity.upsert({
        where: { userId_day: { userId, day } },
        create: { userId, day, chestOpened: true },
        update: { chestOpened: true },
      });

      await tx.user.update({ where: { id: userId }, data: { lastChestDay: day } });

      await progressMissions(tx, userId, "OPEN_CHEST", 1, "increment");
      await progressMissions(tx, userId, "KEEP_STREAK", streak.currentStreak, "max");
      await progressFromRewards(tx, userId, result.rewards);

      const peakRarity = result.rewards.reduce<Rarity>((peak, r) => {
        const rarity = r.rarity ?? ITEM_BY_KEY[r.itemKey ?? ""]?.rarity ?? "COMMON";
        return RARITY_RANK[rarity] > RARITY_RANK[peak] ? rarity : peak;
      }, "COMMON");

      return {
        ok: true,
        chestKey: chest.key,
        streakDay: cycle.day,
        rewards: result.rewards,
        rankUp: result.rankUp,
        streak,
        peakRarity,
      };
    });
  } catch (error) {
    // Unique (userId, day) violation from a concurrent open.
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return { ok: false, error: "ALREADY_OPENED" };
    }
    throw error;
  }
}

/** Has today's chest already been taken? */
export async function chestStatus(userId: string) {
  const day = dayKey();
  const opening = await prisma.chestOpening.findUnique({
    where: { userId_day: { userId, day } },
  });
  return {
    availableToday: !opening,
    openedAt: opening?.createdAt ?? null,
    lastRewards: opening ? (JSON.parse(opening.rewardsJson) as Reward[]) : null,
  };
}
