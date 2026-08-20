import { z } from "zod";
import { ok, fail, withUser } from "@/lib/api";
import { submitRun } from "@/lib/engine/game";

const SubmitSchema = z.object({
  sessionId: z.string().min(1).max(64),
  durationMs: z.number().int().min(0).max(3_600_000),
  /** Taps into empty lanes. Reported by the client and penalised server-side. */
  strays: z.number().int().min(0).max(2000).optional().default(0),
  /** When the weapon ability was triggered, in ms from the start of the run. */
  abilityAtMs: z.number().int().min(0).max(600000).nullable().optional().default(null),
  hits: z
    .array(
      z.object({
        i: z.number().int().min(0).max(500),
        dt: z.number().int().min(-2000).max(2000),
      }),
    )
    .max(500),
});

export async function POST(request: Request) {
  return withUser(async (user) => {
    const body = SubmitSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return fail("INVALID_BODY", 400);

    const result = await submitRun(
      user.id,
      body.data.sessionId,
      body.data.hits,
      body.data.durationMs,
      body.data.strays,
      body.data.abilityAtMs ?? null,
    );
    if (!result.ok) return fail(result.error ?? "FAILED", 409);
    return ok(result);
  });
}
