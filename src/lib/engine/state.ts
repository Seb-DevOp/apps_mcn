import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dayKey, weekKey, msUntilNextDay, isVaultFriday } from "@/lib/time";
import { rankProgress, RANK_BY_KEY, RANKS } from "@/lib/content/ranks";
import { CHEST_BY_KEY, streakCycleDay, STREAK_CYCLE } from "@/lib/content/chests";
import { MISSION_BY_KEY } from "@/lib/content/missions";
import { whisperForDay, CHAMBERS, LORE } from "@/lib/content/vault";
import { ITEM_BY_KEY } from "@/lib/content/items";
import { ensureMissions, MISSIONS_PER_PERIOD } from "./missions";
import { chestStatus } from "./chest";
import { EQUIPMENT_BY_KEY, statsAtLevel, sumStats, capStats } from "@/lib/content/equipment";

/**
 * One assembled snapshot of everything the Vault hub needs.
 *
 * Built server-side in a single pass so the home screen paints in one go — the
 * daily session should feel instant on a phone.
 */

export interface MissionView {
  id: string;
  key: string;
  scope: "DAILY" | "WEEKLY";
  nameEn: string;
  nameFr: string;
  progress: number;
  target: number;
  complete: boolean;
  claimed: boolean;
  rewards: { type: "XP" | "SHARD" | "ITEM"; itemKey?: string; qty: number }[];
}

export async function getPlayerState(user: User) {
  const periods = [dayKey(), weekKey()];
  const missionQuery = {
    where: { userId: user.id, periodKey: { in: periods } },
    orderBy: { createdAt: "asc" },
  } as const;

  const [chest, foundMissions, bestScore, chestsOpened, worn] = await Promise.all([
    chestStatus(user.id),
    prisma.userMission.findMany(missionQuery),
    prisma.scoreEntry.aggregate({
      where: { userId: user.id, gameKey: "crystal-resonance" },
      _max: { score: true },
    }),
    prisma.chestOpening.count({ where: { userId: user.id } }),
    prisma.userEquipment.findMany({ where: { userId: user.id, equippedSlot: { not: null } } }),
  ]);

  // Assigning missions is a seven-statement transaction. It only needs to happen
  // on the first visit of a new day or week — running it on every page view cost
  // seconds of round trips on a hosted database for no change at all.
  let missions = foundMissions;
  if (missions.length < MISSIONS_PER_PERIOD) {
    await ensureMissions(user.id, user.rankKey);
    missions = await prisma.userMission.findMany(missionQuery);
  }

  const progress = rankProgress(user.xp);
  const rank = RANK_BY_KEY[user.rankKey] ?? progress.current;
  const chestDef = CHEST_BY_KEY[rank.chestTypeKey];

  const missionViews: MissionView[] = missions.flatMap<MissionView>((m) => {
    const def = MISSION_BY_KEY[m.missionKey];
    if (!def) return [];
    return [
      {
        id: m.id,
        key: m.missionKey,
        scope: m.scope as "DAILY" | "WEEKLY",
        nameEn: def.nameEn,
        nameFr: def.nameFr,
        progress: m.progress,
        target: m.target,
        complete: m.progress >= m.target,
        claimed: Boolean(m.claimedAt),
        rewards: def.rewards.map((r) => ({ type: r.type, itemKey: r.itemKey, qty: r.qty })),
      },
    ];
  });

  const daily = missionViews.filter((m) => m.scope === "DAILY");
  const chambersSeen = CHAMBERS.filter((c) => c.requiredRankOrder <= rank.order).length;
  const loreFound = LORE.filter((l) => l.requiredRankOrder <= rank.order).length;

  return {
    player: {
      id: user.id,
      handle: user.handle,
      locale: user.locale,
      xp: user.xp,
      shards: user.shards,
      rankKey: rank.key,
      currentStreak: user.currentStreak,
      bestStreak: user.bestStreak,
      totalActiveDays: user.totalActiveDays,
      streakShields: user.streakShields,
      walletAddress: user.walletAddress,
    },
    rank: {
      current: progress.current,
      next: progress.next,
      ratio: progress.ratio,
      earned: progress.earned,
      span: progress.span,
      remaining: progress.remaining,
    },
    chest: {
      key: chestDef.key,
      visual: chestDef.visual,
      nameEn: chestDef.nameEn,
      nameFr: chestDef.nameFr,
      descEn: chestDef.descEn,
      descFr: chestDef.descFr,
      availableToday: chest.availableToday,
      lastRewards: chest.lastRewards,
      streakDay: streakCycleDay(Math.max(1, user.currentStreak + (chest.availableToday ? 1 : 0))).day,
      cycle: STREAK_CYCLE,
      msUntilReset: msUntilNextDay(),
    },
    missions: {
      daily,
      weekly: missionViews.filter((m) => m.scope === "WEEKLY"),
      dailyDone: daily.filter((m) => m.claimed).length,
      dailyTotal: daily.length,
    },
    vault: {
      whisper: whisperForDay(dayKey()),
      chambersSeen,
      chambersTotal: CHAMBERS.length,
      loreFound,
      loreTotal: LORE.length,
      isVaultFriday: isVaultFriday(),
    },
    loadout: {
      count: worn.length,
      weapon: (() => {
        const row = worn.find((w) => w.equippedSlot === "WEAPON");
        const def = row ? EQUIPMENT_BY_KEY[row.defKey] : undefined;
        return def ? { nameEn: def.nameEn, nameFr: def.nameFr, icon: def.icon, rarity: def.rarity, level: row!.level } : null;
      })(),
      stats: capStats(
        sumStats(
          worn.flatMap((row) => {
            const def = EQUIPMENT_BY_KEY[row.defKey];
            return def ? [statsAtLevel(def, row.level)] : [];
          }),
        ),
      ),
    },
    stats: {
      bestScore: bestScore._max.score ?? 0,
      chestsOpened,
    },
    ranks: RANKS,
  };
}

export type PlayerState = Awaited<ReturnType<typeof getPlayerState>>;

/** Inventory grouped the way the profile screen shows it. */
export async function getCollection(userId: string) {
  const rows = await prisma.inventoryItem.findMany({
    where: { userId, quantity: { gt: 0 } },
    orderBy: { lastAt: "desc" },
  });

  const boosts = await prisma.userBoost.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
  });

  const withDefs = rows
    .map((row) => ({ row, def: ITEM_BY_KEY[row.itemKey] }))
    .filter((entry): entry is { row: (typeof rows)[number]; def: NonNullable<typeof entry.def> } =>
      Boolean(entry.def),
    );

  return {
    badges: withDefs.filter((e) => e.def.type === "BADGE"),
    cosmetics: withDefs.filter((e) => e.def.type === "COSMETIC"),
    boosts: withDefs.filter((e) => e.def.type === "BOOST"),
    materials: withDefs.filter((e) => ["MATERIAL", "FRAGMENT", "KEY"].includes(e.def.type)),
    activeBoosts: boosts,
  };
}
