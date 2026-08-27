import { z } from "zod";
import { ok, fail, withUser, rateLimit } from "@/lib/api";
import {
  getIdleState,
  buyUpgrade,
  equipItem,
  unequipItem,
  equipBest,
  sellItem,
  sellBelow,
  sellAllSpares,
  sellFiltered,
  forge,
  rebirth,
  buyRelic,
  strike,
  roar,
  breath,
  setAutoSell,
  buyChest,
  buySkin,
  buyBackdrop,
  claimCalendar,
  useBoost,
  buyBoost,
} from "@/lib/engine/idle";

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
  z.object({
    action: z.literal("equip"),
    itemId: z.string().min(1).max(64),
    /** Which cat wears it: 0 is your own, 1 the Pack, 2 the Pride. */
    cat: z.number().int().min(0).max(2).optional(),
  }),
  z.object({ action: z.literal("unequip"), itemId: z.string().min(1).max(64) }),
  z.object({ action: z.literal("equipBest"), cat: z.number().int().min(0).max(2).optional() }),
  z.object({ action: z.literal("sell"), itemId: z.string().min(1).max(64) }),
  z.object({ action: z.literal("sellBelow"), rarity: z.string().min(1).max(20) }),
  z.object({ action: z.literal("sellAll") }),
  z.object({
    action: z.literal("sellShown"),
    slot: z.string().max(20).optional(),
    rarity: z.string().max(20).optional(),
  }),
  z.object({ action: z.literal("rebirth") }),
  z.object({ action: z.literal("relic"), key: z.string().min(1).max(32) }),
  // The count is a claim, not a fact: the engine clamps it by elapsed time.
  z.object({ action: z.literal("strike"), count: z.number().int().min(1).max(40) }),
  z.object({ action: z.literal("roar") }),
  z.object({ action: z.literal("breath") }),
  z.object({ action: z.literal("autoSell"), rarity: z.string().max(20) }),
  z.object({ action: z.literal("chest") }),
  z.object({
    action: z.literal("skin"),
    key: z.string().min(1).max(32),
    cat: z.number().int().min(0).max(2).optional(),
  }),
  z.object({ action: z.literal("backdrop"), key: z.string().max(32) }),
  z.object({ action: z.literal("calendar") }),
  z.object({ action: z.literal("boost"), key: z.string().min(1).max(32) }),
  z.object({ action: z.literal("buyBoost"), key: z.string().min(1).max(32) }),
  z.object({ action: z.literal("forge"), rarity: z.string().min(1).max(20) }),
]);

export async function POST(request: Request) {
  return withUser(async (user) => {
    if (!rateLimit(`idle:${user.id}`, 400, 60_000)) return fail("RATE_LIMITED", 429);

    const body = Schema.safeParse(await request.json().catch(() => null));
    if (!body.success) return fail("INVALID_BODY", 400);

    const input = body.data;
    const result = await run(user.id, input);

    if (!result.ok) return fail(result.error, 409);

    // Forward whatever the action itself reported alongside the fresh state.
    // Returning only the state threw away the id of the piece a chest had just
    // created, which is the one thing the screen needed to show it.
    const { ok: _ok, ...reported } = result;
    return ok({ ...reported, state: await getIdleState(user.id) });
  });
}

function run(userId: string, input: z.infer<typeof Schema>) {
  switch (input.action) {
    case "upgrade":
      return buyUpgrade(userId, input.key);
    case "equip":
      return equipItem(userId, input.itemId, input.cat ?? 0);
    case "unequip":
      return unequipItem(userId, input.itemId);
    case "equipBest":
      return equipBest(userId, input.cat ?? 0);
    case "sell":
      return sellItem(userId, input.itemId);
    case "sellBelow":
      return sellBelow(userId, input.rarity);
    case "sellAll":
      return sellAllSpares(userId);
    case "sellShown":
      return sellFiltered(userId, input.slot, input.rarity);
    case "rebirth":
      return rebirth(userId);
    case "relic":
      return buyRelic(userId, input.key);
    case "strike":
      return strike(userId, input.count);
    case "roar":
      return roar(userId);
    case "breath":
      return breath(userId);
    case "autoSell":
      return setAutoSell(userId, input.rarity);
    case "chest":
      return buyChest(userId);
    case "skin":
      return buySkin(userId, input.key, input.cat ?? 0);
    case "backdrop":
      return buyBackdrop(userId, input.key);
    case "calendar":
      return claimCalendar(userId);
    case "boost":
      return useBoost(userId, input.key);
    case "buyBoost":
      return buyBoost(userId, input.key);
    case "forge":
      return forge(userId, input.rarity);
  }
}
