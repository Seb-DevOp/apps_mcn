import { prisma } from "@/lib/db";
import { dayKey, weekKey } from "@/lib/time";
import { randomSeed } from "@/lib/rng";
import {
  buildPattern,
  scoreRun,
  theoreticalMax,
  DEFAULT_TARGETS,
  HIT_WINDOW_MS,
  type SubmittedHit,
  type RunModifiers,
} from "@/lib/game/pattern";
import { applyRewards, track, type Reward } from "./rewards";
import { progressMissions, progressFromRewards } from "./missions";
import { touchStreak } from "./streak";
import { getEquippedStats, getEquippedAbility } from "./loadout";

/**
 * Mini-game sessions.
 *
 * The server issues a seed, then re-derives the whole pattern to score the run.
 * The client submits nothing but tap timings. On top of that:
 *
 *   - a run cannot be submitted twice (status flips before scoring),
 *   - a run cannot be submitted faster than it takes to play (wall-clock check),
 *   - runs are rate-limited per hour and per day,
 *   - XP per run is capped, and repeat runs pay less, so grinding cannot inflate
 *     the economy.
 *
 * Known limit, stated plainly: a determined attacker can still forge plausible
 * tap timings from a browser. V1 keeps the damage bounded (caps, diminishing
 * returns, flagged submissions) rather than pretending the web client is trusted.
 * Hardening beyond this belongs with the V3 blockchain/reward work.
 */

const MAX_RUNS_PER_HOUR = 30;
const MAX_XP_PER_RUN = 150;

/** Repeat runs still pay — just less. Keeps a long session pleasant, not exploitable. */
function diminishingFactor(runsToday: number): number {
  if (runsToday < 5) return 1;
  if (runsToday < 10) return 0.5;
  if (runsToday < 20) return 0.2;
  return 0.05;
}

export interface StartResult {
  ok: boolean;
  error?: "RATE_LIMITED";
  sessionId?: string;
  seed?: string;
  targets?: number;
  retryAfterSeconds?: number;
  /** Mirrors what the server will apply, so the run looks like it plays. */
  modifiers?: { precisionMs: number; comboGuard: number; scoreBonus: number };
  ability?: { key: string; nameEn: string; nameFr: string; durationMs: number } | null;
}

export async function startRun(userId: string): Promise<StartResult> {
  const hourAgo = new Date(Date.now() - 3_600_000);
  const recent = await prisma.gameSession.count({
    where: { userId, createdAt: { gt: hourAgo } },
  });
  if (recent >= MAX_RUNS_PER_HOUR) {
    return { ok: false, error: "RATE_LIMITED", retryAfterSeconds: 600 };
  }

  const seed = randomSeed();
  const pattern = buildPattern(seed, DEFAULT_TARGETS);

  const session = await prisma.gameSession.create({
    data: {
      userId,
      seed,
      targets: DEFAULT_TARGETS,
      // Generous: a player may be interrupted mid-run and come back to it.
      expiresAt: new Date(Date.now() + pattern.durationMs + 10 * 60_000),
    },
  });

  const [gear, ability] = await Promise.all([
    getEquippedStats(prisma, userId),
    getEquippedAbility(userId),
  ]);

  return {
    ok: true,
    sessionId: session.id,
    seed,
    targets: DEFAULT_TARGETS,
    modifiers: {
      precisionMs: gear.precisionMs,
      comboGuard: gear.comboGuard,
      scoreBonus: gear.scoreBonus,
    },
    ability: ability
      ? {
          key: ability.key,
          nameEn: ability.nameEn,
          nameFr: ability.nameFr,
          durationMs: ability.durationMs,
        }
      : null,
  };
}

export interface SubmitResult {
  ok: boolean;
  error?: "NOT_FOUND" | "ALREADY_SUBMITTED" | "EXPIRED" | "TOO_FAST" | "INVALID";
  score?: number;
  accuracy?: number;
  bestCombo?: number;
  perfect?: number;
  great?: number;
  good?: number;
  missed?: number;
  xpAwarded?: number;
  shardsAwarded?: number;
  reduced?: boolean;
  runsToday?: number;
  personalBest?: boolean;
  rewards?: Reward[];
  rankUp?: { fromKey: string; toKey: string } | null;
}

export async function submitRun(
  userId: string,
  sessionId: string,
  hits: SubmittedHit[],
  clientDurationMs: number,
  strays = 0,
  abilityAtMs: number | null = null,
): Promise<SubmitResult> {
  const session = await prisma.gameSession.findFirst({ where: { id: sessionId, userId } });
  if (!session) return { ok: false, error: "NOT_FOUND" };
  if (session.status !== "OPEN") return { ok: false, error: "ALREADY_SUBMITTED" };
  if (session.expiresAt < new Date()) {
    await prisma.gameSession.update({
      where: { id: session.id },
      data: { status: "EXPIRED" },
    });
    return { ok: false, error: "EXPIRED" };
  }

  const pattern = buildPattern(session.seed, session.targets);

  // Wall-clock check: the run cannot have taken less time than the pattern lasts.
  // This is what stops a script from opening a session and answering instantly.
  const elapsed = Date.now() - session.createdAt.getTime();
  if (elapsed < pattern.durationMs * 0.8) {
    await prisma.gameSession.update({
      where: { id: session.id },
      data: { status: "REJECTED", invalidReason: "TOO_FAST", submittedAt: new Date() },
    });
    await track("game.rejected", userId, { reason: "TOO_FAST", elapsed, sessionId });
    return { ok: false, error: "TOO_FAST" };
  }

  // Flip the status before scoring: a replayed submission finds it closed.
  const claimed = await prisma.gameSession.updateMany({
    where: { id: session.id, status: "OPEN" },
    data: { status: "SCORED", submittedAt: new Date() },
  });
  if (claimed.count === 0) return { ok: false, error: "ALREADY_SUBMITTED" };

  // Sanitise the submission before it reaches the scorer.
  const clean: SubmittedHit[] = [];
  const seen = new Set<number>();
  for (const hit of Array.isArray(hits) ? hits.slice(0, session.targets * 2) : []) {
    const i = Number(hit?.i);
    const dt = Number(hit?.dt);
    if (!Number.isInteger(i) || i < 0 || i >= session.targets) continue;
    if (!Number.isFinite(dt) || Math.abs(dt) > HIT_WINDOW_MS * 3) continue;
    if (seen.has(i)) continue;
    seen.add(i);
    clean.push({ i, dt });
  }

  // Modifiers come from the equipment actually worn, read now, server-side.
  // The client's only say is *when* it triggered its ability.
  const gear = await getEquippedStats(prisma, userId);
  const equippedAbility = await getEquippedAbility(userId);

  const modifiers: RunModifiers = {
    precisionMs: gear.precisionMs,
    comboGuard: gear.comboGuard,
    scoreBonus: gear.scoreBonus,
  };
  if (
    equippedAbility &&
    typeof abilityAtMs === "number" &&
    abilityAtMs >= 0 &&
    abilityAtMs <= pattern.durationMs
  ) {
    modifiers.ability = {
      atMs: abilityAtMs,
      durationMs: equippedAbility.durationMs,
      effect: equippedAbility.effect,
    };
  }

  const raw = scoreRun(pattern, clean, modifiers);
  // Stray taps cost points: the run should reward timing, not tapping speed.
  const strayPenalty = Math.min(raw.score, Math.max(0, Math.round(strays)) * 25);
  const breakdown = { ...raw, score: raw.score - strayPenalty };

  // Impossible scores are refused outright; merely excellent ones are kept and flagged.
  if (breakdown.score > theoreticalMax(pattern, modifiers)) {
    await prisma.gameSession.update({
      where: { id: session.id },
      data: { status: "REJECTED", invalidReason: "IMPOSSIBLE_SCORE" },
    });
    return { ok: false, error: "INVALID" };
  }
  const flawless = breakdown.perfect >= session.targets * 0.98 && session.targets >= 20;
  if (flawless) {
    await track("game.flagged", userId, { reason: "NEAR_PERFECT", score: breakdown.score, sessionId });
  }

  const today = dayKey();
  const runsToday = await prisma.gameSession.count({
    where: { userId, status: "SCORED", submittedAt: { gte: new Date(`${today}T00:00:00.000Z`) } },
  });
  const factor = diminishingFactor(runsToday - 1);

  const xpAwarded = Math.max(
    breakdown.score > 0 ? 5 : 0,
    Math.min(MAX_XP_PER_RUN, Math.round((breakdown.score / 20) * factor)),
  );
  const shardsAwarded = Math.round((breakdown.score / 40) * factor);

  const result = await prisma.$transaction(async (tx) => {
    // Playing also counts as showing up today, so a player who skips the chest
    // but plays a run still keeps their streak.
    await touchStreak(tx, userId);

    const rewards: Reward[] = [];
    if (xpAwarded > 0) rewards.push({ type: "XP", qty: xpAwarded });
    if (shardsAwarded > 0) rewards.push({ type: "SHARD", qty: shardsAwarded });

    const applied = await applyRewards(tx, userId, rewards, {
      source: "GAME",
      refId: session.id,
      applyBoosts: true,
    });

    await tx.gameSession.update({
      where: { id: session.id },
      data: {
        score: breakdown.score,
        accuracy: breakdown.accuracy,
        bestCombo: breakdown.bestCombo,
        xpAwarded: applied.xpGained,
        shardsAwarded: applied.shardsGained,
        clientDurationMs: Math.max(0, Math.min(Number(clientDurationMs) || 0, 3_600_000)),
        invalidReason: flawless ? "FLAGGED_NEAR_PERFECT" : null,
      },
    });

    await tx.scoreEntry.create({
      data: {
        userId,
        gameKey: session.gameKey,
        score: breakdown.score,
        weekKey: weekKey(),
      },
    });

    await tx.dailyActivity.upsert({
      where: { userId_day: { userId, day: today } },
      create: { userId, day: today, gamesPlayed: 1 },
      update: { gamesPlayed: { increment: 1 } },
    });

    await progressMissions(tx, userId, "PLAY_GAME", 1, "increment");
    await progressMissions(tx, userId, "GAME_SCORE", breakdown.score, "max");
    await progressFromRewards(tx, userId, applied.rewards);

    return applied;
  });

  const best = await prisma.scoreEntry.aggregate({
    where: { userId, gameKey: session.gameKey },
    _max: { score: true },
  });

  await track("game.scored", userId, {
    score: breakdown.score,
    accuracy: Number(breakdown.accuracy.toFixed(3)),
    runsToday,
    factor,
  });

  return {
    ok: true,
    score: breakdown.score,
    accuracy: breakdown.accuracy,
    bestCombo: breakdown.bestCombo,
    perfect: breakdown.perfect,
    great: breakdown.great,
    good: breakdown.good,
    missed: breakdown.missed,
    xpAwarded: result.xpGained,
    shardsAwarded: result.shardsGained,
    reduced: factor < 1,
    runsToday,
    personalBest: (best._max.score ?? 0) <= breakdown.score,
    rewards: result.rewards,
    rankUp: result.rankUp,
  };
}
