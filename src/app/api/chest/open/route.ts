import { ok, fail, withUser, rateLimit } from "@/lib/api";
import { openDailyChest } from "@/lib/engine/chest";
import { track } from "@/lib/engine/rewards";

/**
 * The client sends nothing. Everything about the drop is decided server-side,
 * and the one-chest-per-day rule is a database constraint, not a UI state.
 */
export async function POST() {
  return withUser(async (user) => {
    if (!rateLimit(`chest:${user.id}`, 10, 60_000)) return fail("RATE_LIMITED", 429);

    const result = await openDailyChest(user.id);
    if (!result.ok) return fail(result.error ?? "FAILED", 409);

    await track("chest.opened", user.id, {
      chest: result.chestKey,
      streakDay: result.streakDay,
      peakRarity: result.peakRarity,
      rankUp: result.rankUp?.toKey ?? null,
    });

    return ok(result);
  });
}
