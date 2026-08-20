import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dayKey, weekKey } from "@/lib/time";
import { seededRandom } from "@/lib/rng";
import {
  DAILY_MISSIONS,
  WEEKLY_MISSIONS,
  MISSION_BY_KEY,
  type MissionDefinition,
  type MissionGoal,
} from "@/lib/content/missions";
import { RANK_BY_KEY } from "@/lib/content/ranks";
import { ITEM_BY_KEY } from "@/lib/content/items";
import { applyRewards, type Reward } from "./rewards";

const DAILY_SLOTS = 4;
const WEEKLY_SLOTS = 3;

/**
 * Mission selection is deterministic per player per period.
 *
 * The same player always sees the same missions for a given day, even across
 * devices or after a server restart, without storing a "seed" anywhere.
 */
function pick(defs: MissionDefinition[], slots: number, seed: string, rankOrder: number) {
  const pinned = defs.filter((m) => (m.weight ?? 100) === 0 && (m.minRankOrder ?? 0) <= rankOrder);
  const candidates = defs.filter(
    (m) => (m.weight ?? 100) > 0 && (m.minRankOrder ?? 0) <= rankOrder,
  );

  const rand = seededRandom(seed);
  const chosen = [...pinned];
  const pool = [...candidates];

  while (chosen.length < slots && pool.length > 0) {
    const total = pool.reduce((sum, m) => sum + (m.weight ?? 100), 0);
    let roll = rand() * total;
    let index = 0;
    for (let i = 0; i < pool.length; i++) {
      roll -= pool[i].weight ?? 100;
      if (roll <= 0) {
        index = i;
        break;
      }
    }
    chosen.push(pool.splice(index, 1)[0]);
  }
  return chosen.slice(0, Math.max(slots, pinned.length));
}

/** Creates today's and this week's missions if they do not exist yet. Idempotent. */
export async function ensureMissions(userId: string, rankKey: string) {
  const rankOrder = RANK_BY_KEY[rankKey]?.order ?? 0;
  const today = dayKey();
  const week = weekKey();

  const daily = pick(DAILY_MISSIONS, DAILY_SLOTS, `${userId}:${today}`, rankOrder);
  const weekly = pick(WEEKLY_MISSIONS, WEEKLY_SLOTS, `${userId}:${week}`, rankOrder);

  const rows = [
    ...daily.map((m) => ({ def: m, periodKey: today })),
    ...weekly.map((m) => ({ def: m, periodKey: week })),
  ];

  await prisma.$transaction(
    rows.map(({ def, periodKey }) =>
      prisma.userMission.upsert({
        where: { userId_missionKey_periodKey: { userId, missionKey: def.key, periodKey } },
        create: {
          userId,
          missionKey: def.key,
          scope: def.scope,
          periodKey,
          target: def.goalTarget,
          progress: 0,
        },
        update: {},
      }),
    ),
  );
}

export type ProgressMode = "increment" | "max" | "set";

/**
 * Moves mission progress. Only ever called from trusted server code after a real
 * action has been recorded — a chest row written, a run scored, XP granted.
 */
export async function progressMissions(
  tx: Prisma.TransactionClient,
  userId: string,
  goalType: MissionGoal,
  value: number,
  mode: ProgressMode = "increment",
) {
  if (value <= 0) return;
  const periods = [dayKey(), weekKey()];

  const missions = await tx.userMission.findMany({
    where: { userId, periodKey: { in: periods }, claimedAt: null },
  });

  for (const mission of missions) {
    const def = MISSION_BY_KEY[mission.missionKey];
    if (!def || def.goalType !== goalType) continue;

    let progress: number;
    if (mode === "increment") progress = mission.progress + value;
    else if (mode === "max") progress = Math.max(mission.progress, value);
    else progress = value;

    progress = Math.min(progress, mission.target);
    if (progress === mission.progress) continue;

    await tx.userMission.update({
      where: { id: mission.id },
      data: {
        progress,
        completedAt:
          progress >= mission.target && !mission.completedAt ? new Date() : mission.completedAt,
      },
    });
  }
}

/**
 * Advances the goals that any reward payout can move — XP earned, shards
 * collected, materials gathered. Called once per grant so no engine path has to
 * remember the individual mission goal names.
 */
export async function progressFromRewards(
  tx: Prisma.TransactionClient,
  userId: string,
  rewards: { type: string; itemKey?: string | null; qty: number }[],
) {
  const xp = rewards.filter((r) => r.type === "XP").reduce((sum, r) => sum + r.qty, 0);
  const shards = rewards.filter((r) => r.type === "SHARD").reduce((sum, r) => sum + r.qty, 0);
  const collectibles = rewards
    .filter((r) => {
      const def = r.itemKey ? ITEM_BY_KEY[r.itemKey] : undefined;
      return def?.type === "MATERIAL" || def?.type === "FRAGMENT";
    })
    .reduce((sum, r) => sum + r.qty, 0);

  await progressMissions(tx, userId, "EARN_XP", xp, "increment");
  await progressMissions(tx, userId, "COLLECT_SHARDS", shards, "increment");
  await progressMissions(tx, userId, "COLLECT_ITEMS", collectibles, "increment");
}

export interface ClaimResult {
  ok: boolean;
  error?: "NOT_FOUND" | "NOT_COMPLETE" | "ALREADY_CLAIMED";
  rewards?: Reward[];
  rankUp?: { fromKey: string; toKey: string } | null;
}

export async function claimMission(userId: string, userMissionId: string): Promise<ClaimResult> {
  return prisma.$transaction(async (tx) => {
    const mission = await tx.userMission.findFirst({
      where: { id: userMissionId, userId },
    });
    if (!mission) return { ok: false, error: "NOT_FOUND" as const };
    if (mission.claimedAt) return { ok: false, error: "ALREADY_CLAIMED" as const };
    if (mission.progress < mission.target) return { ok: false, error: "NOT_COMPLETE" as const };

    const def = MISSION_BY_KEY[mission.missionKey];
    if (!def) return { ok: false, error: "NOT_FOUND" as const };

    // Claim first: the unique row + this write make double-claiming impossible
    // even if two requests arrive at the same moment.
    await tx.userMission.update({
      where: { id: mission.id },
      data: { claimedAt: new Date() },
    });

    const rewards: Reward[] = def.rewards.map((r) => ({
      type: r.type,
      itemKey: r.itemKey ?? null,
      qty: r.qty,
    }));

    const result = await applyRewards(tx, userId, rewards, {
      source: "MISSION",
      refId: mission.missionKey,
      applyBoosts: true,
    });

    await tx.dailyActivity.upsert({
      where: { userId_day: { userId, day: dayKey() } },
      create: { userId, day: dayKey(), missionsClaimed: 1 },
      update: { missionsClaimed: { increment: 1 } },
    });

    return { ok: true, rewards: result.rewards, rankUp: result.rankUp };
  });
}
