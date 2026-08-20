import { z } from "zod";
import { ok, fail, withUser, rateLimit } from "@/lib/api";
import { getForge, craftEquipment, dismantleEquipment } from "@/lib/engine/forge";

/**
 * The Forge.
 *
 * Recipes, held parts and shard balances are all re-checked inside the
 * transaction that spends them. The client asks; the server decides.
 */

export async function GET() {
  return withUser(async (user) => ok(await getForge(user.id)));
}

const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("craft"), defKey: z.string().min(1).max(64) }),
  z.object({ action: z.literal("dismantle"), defKey: z.string().min(1).max(64) }),
]);

export async function POST(request: Request) {
  return withUser(async (user) => {
    if (!rateLimit(`forge:${user.id}`, 30, 60_000)) return fail("RATE_LIMITED", 429);

    const body = ActionSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return fail("INVALID_BODY", 400);

    const result =
      body.data.action === "craft"
        ? await craftEquipment(user.id, body.data.defKey)
        : await dismantleEquipment(user.id, body.data.defKey);

    if (!result.ok) return fail(result.error, 409);
    return ok({ forge: await getForge(user.id) });
  });
}
