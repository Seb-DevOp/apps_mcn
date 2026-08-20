import crypto from "node:crypto";

/**
 * Two different kinds of randomness, kept apart on purpose.
 *
 * - Reward draws use the OS CSPRNG. Unpredictable, server-only.
 * - Mini-game spawn patterns use a seeded PRNG. The server stores the seed and
 *   can replay the exact pattern when it re-scores a submitted run, so the client
 *   never gets to decide what happened.
 */

// --- Cryptographic randomness (rewards) ------------------------------------

export function randomInt(min: number, max: number): number {
  if (max <= min) return min;
  return crypto.randomInt(min, max + 1);
}

export function randomSeed(): string {
  return crypto.randomBytes(16).toString("hex");
}

/** Weighted pick. Weights are stored in the DB and shown to the player. */
export function weightedPick<T extends { weight: number }>(entries: T[]): T | null {
  const pool = entries.filter((e) => e.weight > 0);
  if (pool.length === 0) return null;
  const total = pool.reduce((sum, e) => sum + e.weight, 0);
  let roll = crypto.randomInt(0, total);
  for (const entry of pool) {
    roll -= entry.weight;
    if (roll < 0) return entry;
  }
  return pool[pool.length - 1];
}

// --- Seeded randomness (mini-game patterns) --------------------------------

// Lives in ./seeded so the browser can import it without pulling in node:crypto.
export { seededRandom } from "./seeded";
