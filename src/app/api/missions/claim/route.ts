import { z } from "zod";
import { ok, fail, withUser, rateLimit } from "@/lib/api";
import { claimMission } from "@/lib/engine/missions";
import { track } from "@/lib/engine/rewards";

const ClaimSchema = z.object({ missionId: z.string().min(1).max(64) });

export async function POST(request: Request) {
  return withUser(async (user) => {
    if (!rateLimit(`claim:${user.id}`, 30, 60_000)) return fail("RATE_LIMITED", 429);

    const body = ClaimSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return fail("INVALID_BODY", 400);

    const result = await claimMission(user.id, body.data.missionId);
    if (!result.ok) return fail(result.error ?? "FAILED", 409);

    await track("mission.claimed", user.id, { missionId: body.data.missionId });
    return ok(result);
  });
}
