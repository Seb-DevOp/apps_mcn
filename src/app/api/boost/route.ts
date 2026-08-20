import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, fail, withUser, rateLimit } from "@/lib/api";
import { ITEM_BY_KEY } from "@/lib/content/items";
import { track } from "@/lib/engine/rewards";

const ActivateSchema = z.object({ itemKey: z.string().min(1).max(64) });

/**
 * Activating a boost is the player's choice, never automatic — a booster they
 * saved for a big session should not burn itself on a two-minute visit.
 * Effect and duration are shown before the tap and taken from the item itself.
 */
export async function POST(request: Request) {
  return withUser(async (user) => {
    if (!rateLimit(`boost:${user.id}`, 20, 60_000)) return fail("RATE_LIMITED", 429);

    const body = ActivateSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return fail("INVALID_BODY", 400);

    const def = ITEM_BY_KEY[body.data.itemKey];
    if (!def || def.type !== "BOOST") return fail("NOT_A_BOOST", 400);

    const meta = (def.meta ?? {}) as {
      statKey?: "XP" | "SHARD" | "SCORE";
      multiplier?: number;
      durationHours?: number;
    };
    const statKey = meta.statKey ?? "XP";
    const multiplier = meta.multiplier ?? 1.25;
    const durationHours = meta.durationHours ?? 24;

    type Outcome =
      | { ok: false; error: "NOT_OWNED" | "ALREADY_ACTIVE" }
      | { ok: true; expiresAt: Date };

    const result: Outcome = await prisma.$transaction(async (tx): Promise<Outcome> => {
      const owned = await tx.inventoryItem.findUnique({
        where: { userId_itemKey: { userId: user.id, itemKey: def.key } },
      });
      if (!owned || owned.quantity < 1) return { ok: false, error: "NOT_OWNED" };

      const alreadyRunning = await tx.userBoost.findFirst({
        where: { userId: user.id, boostKey: def.key, expiresAt: { gt: new Date() } },
      });
      if (alreadyRunning) return { ok: false, error: "ALREADY_ACTIVE" };

      await tx.inventoryItem.update({
        where: { id: owned.id },
        data: { quantity: { decrement: 1 } },
      });

      const boost = await tx.userBoost.create({
        data: {
          userId: user.id,
          boostKey: def.key,
          statKey,
          multiplier,
          expiresAt: new Date(Date.now() + durationHours * 3_600_000),
        },
      });
      return { ok: true, expiresAt: boost.expiresAt };
    });

    if (!result.ok) return fail(result.error, 409);

    await track("boost.activated", user.id, { itemKey: def.key });
    return ok({ expiresAt: result.expiresAt, statKey, multiplier });
  });
}
