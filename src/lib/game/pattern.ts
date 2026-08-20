import { seededRandom } from "@/lib/seeded";

/**
 * CRYSTAL RESONANCE — the daily mini-game.
 *
 * Four crystals across the bottom of the screen. A ring closes on one of them;
 * you tap that crystal as the ring meets it. Tight timing scores more, chained
 * hits build a combo, gold crystals are worth double. One run is about 30 seconds
 * and works entirely with one thumb.
 *
 * This module is shared verbatim by the client and the server. The server hands
 * out a seed, the client renders the pattern that seed produces, and the server
 * rebuilds the very same pattern to score the submitted run. The client never
 * reports a score — only when it tapped.
 */

export const LANES = 4;

/** Taps further off than this are not a hit at all. */
export const HIT_WINDOW_MS = 220;
export const PERFECT_MS = 55;
export const GREAT_MS = 110;

export const POINTS = { perfect: 120, great: 75, good: 40 } as const;

/** Silence before the first crystal, so the player can settle in. */
export const LEAD_IN_MS = 1600;
/** Grace after the last crystal before the run ends. */
export const TAIL_MS = 1200;

export const DEFAULT_TARGETS = 28;

export type TargetKind = "NORMAL" | "GOLD";

export interface Target {
  i: number;
  /** Milliseconds from the start of the run. */
  at: number;
  lane: number;
  kind: TargetKind;
}

export interface Pattern {
  targets: Target[];
  durationMs: number;
}

/** Deterministic: the same seed always yields the same run, on any machine. */
export function buildPattern(seed: string, targetCount: number = DEFAULT_TARGETS): Pattern {
  const rand = seededRandom(seed);
  const targets: Target[] = [];

  let at = LEAD_IN_MS;
  let lastLane = -1;

  for (let i = 0; i < targetCount; i++) {
    const ramp = targetCount > 1 ? i / (targetCount - 1) : 0;
    // Tempo tightens from a comfortable 880ms down to a demanding 430ms.
    const interval = 880 - 450 * ramp;
    const jitter = (rand() - 0.5) * 120;

    // Avoid repeating a lane twice in a row: the run should read as movement.
    let lane = Math.floor(rand() * LANES);
    if (lane === lastLane) lane = (lane + 1 + Math.floor(rand() * (LANES - 1))) % LANES;
    lastLane = lane;

    const kind: TargetKind = rand() < 0.12 ? "GOLD" : "NORMAL";
    targets.push({ i, at: Math.round(at), lane, kind });
    at += Math.max(320, interval + jitter);
  }

  return {
    targets,
    durationMs: Math.round(at + TAIL_MS),
  };
}

export type HitTier = "PERFECT" | "GREAT" | "GOOD" | "MISS";

export function tierFor(deltaMs: number): HitTier {
  const d = Math.abs(deltaMs);
  if (d <= PERFECT_MS) return "PERFECT";
  if (d <= GREAT_MS) return "GREAT";
  if (d <= HIT_WINDOW_MS) return "GOOD";
  return "MISS";
}

export interface SubmittedHit {
  /** Index of the target that was tapped. */
  i: number;
  /** Signed milliseconds between the tap and the target's ideal moment. */
  dt: number;
}

export interface ScoreBreakdown {
  score: number;
  accuracy: number;
  bestCombo: number;
  perfect: number;
  great: number;
  good: number;
  missed: number;
}

/**
 * Authoritative scoring. Given the pattern and the taps, this is the only
 * function that decides what a run was worth — it runs on the server.
 */
export function scoreRun(pattern: Pattern, hits: SubmittedHit[]): ScoreBreakdown {
  const byIndex = new Map<number, number>();
  for (const hit of hits) {
    // A target can only be tapped once; a duplicate index is ignored, not stacked.
    if (!byIndex.has(hit.i)) byIndex.set(hit.i, hit.dt);
  }

  let score = 0;
  let combo = 0;
  let bestCombo = 0;
  const counts = { perfect: 0, great: 0, good: 0, missed: 0 };

  for (const target of pattern.targets) {
    const dt = byIndex.get(target.i);
    const tier = dt === undefined ? "MISS" : tierFor(dt);

    if (tier === "MISS") {
      combo = 0;
      counts.missed += 1;
      continue;
    }

    combo += 1;
    bestCombo = Math.max(bestCombo, combo);

    const base =
      tier === "PERFECT" ? POINTS.perfect : tier === "GREAT" ? POINTS.great : POINTS.good;
    const comboMultiplier = Math.min(1 + combo * 0.02, 2);
    const kindMultiplier = target.kind === "GOLD" ? 2 : 1;

    score += base * comboMultiplier * kindMultiplier;

    if (tier === "PERFECT") counts.perfect += 1;
    else if (tier === "GREAT") counts.great += 1;
    else counts.good += 1;
  }

  const landed = counts.perfect + counts.great + counts.good;
  return {
    score: Math.round(score),
    accuracy: pattern.targets.length ? landed / pattern.targets.length : 0,
    bestCombo,
    ...counts,
  };
}

/** Ceiling for a flawless run — used to reject impossible submissions outright. */
export function theoreticalMax(pattern: Pattern): number {
  let score = 0;
  let combo = 0;
  for (const target of pattern.targets) {
    combo += 1;
    score += POINTS.perfect * Math.min(1 + combo * 0.02, 2) * (target.kind === "GOLD" ? 2 : 1);
  }
  return Math.round(score);
}
