import { z } from "zod";
import { ok, fail, withUser, rateLimit } from "@/lib/api";
import {
  getArmory,
  buyEquipment,
  upgradeEquipment,
  equipItem,
  unequipSlot,
} from "@/lib/engine/loadout";
import { SLOTS } from "@/lib/content/equipment";

/**
 * The Armory.
 *
 * Prices, rank requirements, shard balances and material counts are all checked
 * server-side inside a transaction. The client sends an intent, never an outcome.
 */

export async function GET() {
  return withUser(async (user) => ok(await getArmory(user.id)));
}

const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("buy"), defKey: z.string().min(1).max(64) }),
  z.object({ action: z.literal("upgrade"), defKey: z.string().min(1).max(64) }),
  z.object({ action: z.literal("equip"), defKey: z.string().min(1).max(64) }),
  z.object({ action: z.literal("unequip"), slot: z.enum(SLOTS as [string, ...string[]]) }),
]);

export async function POST(request: Request) {
  return withUser(async (user) => {
    if (!rateLimit(`armory:${user.id}`, 40, 60_000)) return fail("RATE_LIMITED", 429);

    const body = ActionSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return fail("INVALID_BODY", 400);

    const input = body.data;
    const result =
      input.action === "buy"
        ? await buyEquipment(user.id, input.defKey)
        : input.action === "upgrade"
          ? await upgradeEquipment(user.id, input.defKey)
          : input.action === "equip"
            ? await equipItem(user.id, input.defKey)
            : await unequipSlot(user.id, input.slot as (typeof SLOTS)[number]);

    if (!result.ok) return fail(result.error, 409);
    return ok(await getArmory(user.id));
  });
}
