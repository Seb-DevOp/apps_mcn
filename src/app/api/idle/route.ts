import { z } from "zod";
import { ok, fail, withUser, rateLimit } from "@/lib/api";
import { getIdleState, buyUpgrade, equipItem, sellItem, sellAllSpares } from "@/lib/engine/idle";

/**
 * The whole game in one endpoint.
 *
 * Reading advances the clock, so GET is not idempotent here by design — it is the
 * tick. Every action settles time first, then applies itself, so gold earned while
 * away is spendable the instant the player comes back.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  return withUser(async (user) => ok({ state: await getIdleState(user.id) }));
}

const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("upgrade"), key: z.string().min(1).max(32) }),
  z.object({ action: z.literal("equip"), itemId: z.string().min(1).max(64) }),
  z.object({ action: z.literal("sell"), itemId: z.string().min(1).max(64) }),
  z.object({ action: z.literal("sellAll") }),
]);

export async function POST(request: Request) {
  return withUser(async (user) => {
    if (!rateLimit(`idle:${user.id}`, 120, 60_000)) return fail("RATE_LIMITED", 429);

    const body = Schema.safeParse(await request.json().catch(() => null));
    if (!body.success) return fail("INVALID_BODY", 400);

    const input = body.data;
    const result =
      input.action === "upgrade"
        ? await buyUpgrade(user.id, input.key)
        : input.action === "equip"
          ? await equipItem(user.id, input.itemId)
          : input.action === "sell"
            ? await sellItem(user.id, input.itemId)
            : await sellAllSpares(user.id);

    if (!result.ok) return fail(result.error, 409);
    return ok({ state: await getIdleState(user.id) });
  });
}
