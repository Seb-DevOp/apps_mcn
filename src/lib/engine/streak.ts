import type { Prisma } from "@prisma/client";
import { dayKey, daysBetween } from "@/lib/time";

/**
 * Streaks, designed to be forgiving.
 *
 * Missing one day spends a Streak Shield instead of erasing weeks of returning.
 * Even a genuinely broken streak only resets the counter — it never removes XP,
 * items or rank. The goal is a reason to come back, not a punishment for a life.
 */

const MAX_SHIELDS = 2;
/** A shield is earned every 7 consecutive days. */
const SHIELD_EVERY = 7;

export interface StreakUpdate {
  currentStreak: number;
  bestStreak: number;
  totalActiveDays: number;
  streakShields: number;
  /** True the first time the player is seen today. */
  isNewDay: boolean;
  /** A missed day was absorbed by a shield rather than breaking the streak. */
  shieldUsed: boolean;
  /** The streak genuinely restarted. */
  broken: boolean;
}

export async function touchStreak(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<StreakUpdate> {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  const today = dayKey();

  if (user.lastActiveDay === today) {
    return {
      currentStreak: user.currentStreak,
      bestStreak: user.bestStreak,
      totalActiveDays: user.totalActiveDays,
      streakShields: user.streakShields,
      isNewDay: false,
      shieldUsed: false,
      broken: false,
    };
  }

  const gap = user.lastActiveDay ? daysBetween(user.lastActiveDay, today) : null;

  let currentStreak: number;
  let shields = user.streakShields;
  let shieldUsed = false;
  let broken = false;

  if (gap === null) {
    currentStreak = 1; // first ever day
  } else if (gap === 1) {
    currentStreak = user.currentStreak + 1;
  } else if (gap === 2 && shields > 0) {
    // Exactly one day missed and a shield available: the streak survives.
    currentStreak = user.currentStreak + 1;
    shields -= 1;
    shieldUsed = true;
  } else {
    currentStreak = 1;
    broken = true;
  }

  const totalActiveDays = user.totalActiveDays + 1;
  const bestStreak = Math.max(user.bestStreak, currentStreak);

  if (currentStreak > 0 && currentStreak % SHIELD_EVERY === 0 && shields < MAX_SHIELDS) {
    shields += 1;
  }

  await tx.user.update({
    where: { id: userId },
    data: {
      currentStreak,
      bestStreak,
      totalActiveDays,
      streakShields: shields,
      lastActiveDay: today,
      lastSeenAt: new Date(),
    },
  });

  return {
    currentStreak,
    bestStreak,
    totalActiveDays,
    streakShields: shields,
    isNewDay: true,
    shieldUsed,
    broken,
  };
}
