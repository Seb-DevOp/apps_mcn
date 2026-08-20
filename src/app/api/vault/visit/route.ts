import { prisma } from "@/lib/db";
import { ok, withUser, rateLimit, fail } from "@/lib/api";
import { progressMissions } from "@/lib/engine/missions";
import { touchStreak } from "@/lib/engine/streak";

/**
 * Walking the Vault counts as a daily action.
 *
 * Rate-limited and idempotent in effect: the mission goal is 1, so repeated calls
 * cannot farm it.
 */
export async function POST() {
  return withUser(async (user) => {
    if (!rateLimit(`visit:${user.id}`, 20, 60_000)) return fail("RATE_LIMITED", 429);

    await prisma.$transaction(async (tx) => {
      await touchStreak(tx, user.id);
      await progressMissions(tx, user.id, "VISIT_VAULT", 1, "set");
    });

    return ok({});
  });
}
