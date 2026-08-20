import { ok, fail, withUser, rateLimit } from "@/lib/api";
import { issueRecoveryCodes } from "@/lib/auth/recovery";
import { markClaimed } from "@/lib/auth/account";

/**
 * Issues a fresh set of recovery codes and returns them once.
 *
 * Any previous unused codes are destroyed in the same transaction, so a player
 * can never be unsure which list is the live one.
 */
export async function POST() {
  return withUser(async (user) => {
    if (!rateLimit(`recovery:${user.id}`, 5, 60 * 60_000)) return fail("RATE_LIMITED", 429);

    const codes = await issueRecoveryCodes(user.id);
    await markClaimed(user.id);
    return ok({ codes });
  });
}
