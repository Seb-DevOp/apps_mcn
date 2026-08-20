import { prisma } from "@/lib/db";
import { RANK_BY_KEY } from "@/lib/content/ranks";
import {
  EQUIPMENT,
  EQUIPMENT_BY_KEY,
  STARTER_EQUIPMENT,
  type EquipmentDefinition,
} from "@/lib/content/equipment";
import { recipeFor, dismantleYield, type Recipe, type RecipeLine } from "@/lib/content/forge";
import { track } from "./analytics";

/**
 * THE FORGE
 *
 * The collector's road to the same weapons the Armory sells. Everything is
 * checked and spent inside one transaction: the client asks to forge, the server
 * decides whether the parts were really there.
 */

export interface ForgeEntry {
  def: EquipmentDefinition;
  owned: boolean;
  level: number;
  recipe: Recipe;
  /** Every line of the recipe with what the player actually holds. */
  lines: { itemKey: string; needed: number; owned: number }[];
  shardsOk: boolean;
  partsOk: boolean;
  rankLocked: boolean;
  craftable: boolean;
  /** What breaking it down would return, for pieces already owned. */
  dismantle: { lines: RecipeLine[]; shards: number } | null;
  /** Starter gear is never dismantled — see `dismantleEquipment`. */
  protected: boolean;
}

export async function getForge(userId: string) {
  const [user, owned, inventory] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.userEquipment.findMany({ where: { userId } }),
    prisma.inventoryItem.findMany({ where: { userId } }),
  ]);

  const ownedByKey = new Map(owned.map((row) => [row.defKey, row]));
  const held = new Map(inventory.map((row) => [row.itemKey, row.quantity]));
  const rankOrder = RANK_BY_KEY[user.rankKey]?.order ?? 0;

  const entries: ForgeEntry[] = EQUIPMENT.map((def) => {
    const row = ownedByKey.get(def.key);
    const recipe = recipeFor(def);
    const lines = recipe.lines.map((line) => ({
      itemKey: line.itemKey,
      needed: line.quantity,
      owned: held.get(line.itemKey) ?? 0,
    }));

    const partsOk = lines.every((line) => line.owned >= line.needed);
    const shardsOk = user.shards >= recipe.shards;
    const rankLocked = def.requiredRankOrder > rankOrder;
    const isProtected = STARTER_EQUIPMENT.includes(def.key);

    return {
      def,
      owned: Boolean(row),
      level: row?.level ?? 1,
      recipe,
      lines,
      shardsOk,
      partsOk,
      rankLocked,
      craftable: !row && partsOk && shardsOk && !rankLocked,
      dismantle: row && !isProtected ? dismantleYield(def, row.level) : null,
      protected: isProtected,
    };
  });

  return { shards: user.shards, rankOrder, entries };
}

export type ForgeState = Awaited<ReturnType<typeof getForge>>;

export type ForgeError =
  | "UNKNOWN_ITEM"
  | "ALREADY_OWNED"
  | "NOT_OWNED"
  | "RANK_LOCKED"
  | "NOT_ENOUGH_SHARDS"
  | "MISSING_PARTS"
  | "PROTECTED";

export async function craftEquipment(
  userId: string,
  defKey: string,
): Promise<{ ok: true } | { ok: false; error: ForgeError }> {
  const def = EQUIPMENT_BY_KEY[defKey];
  if (!def) return { ok: false, error: "UNKNOWN_ITEM" };

  const recipe = recipeFor(def);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (def.requiredRankOrder > (RANK_BY_KEY[user.rankKey]?.order ?? 0)) {
      return { ok: false as const, error: "RANK_LOCKED" as const };
    }

    const existing = await tx.userEquipment.findUnique({
      where: { userId_defKey: { userId, defKey } },
    });
    if (existing) return { ok: false as const, error: "ALREADY_OWNED" as const };
    if (user.shards < recipe.shards) {
      return { ok: false as const, error: "NOT_ENOUGH_SHARDS" as const };
    }

    // Check every line before spending any of it.
    const rows = await tx.inventoryItem.findMany({
      where: { userId, itemKey: { in: recipe.lines.map((l) => l.itemKey) } },
    });
    const held = new Map(rows.map((row) => [row.itemKey, row]));
    for (const line of recipe.lines) {
      const row = held.get(line.itemKey);
      if (!row || row.quantity < line.quantity) {
        return { ok: false as const, error: "MISSING_PARTS" as const };
      }
    }

    for (const line of recipe.lines) {
      await tx.inventoryItem.update({
        where: { id: held.get(line.itemKey)!.id },
        data: { quantity: { decrement: line.quantity } },
      });
    }
    if (recipe.shards > 0) {
      await tx.user.update({
        where: { id: userId },
        data: { shards: { decrement: recipe.shards } },
      });
    }
    await tx.userEquipment.create({ data: { userId, defKey } });

    return { ok: true as const };
  });

  if (result.ok) await track("equipment.forged", userId, { defKey, rarity: def.rarity });
  return result;
}

/**
 * Breaks a piece back down into parts.
 *
 * Always returns less than it cost — half the parts, none of the forging shards —
 * so melting down and re-forging can never be used to launder materials.
 *
 * Starter gear is refused: it is re-granted to anyone who owns nothing, so
 * allowing it to be dismantled would let a player mint fragments from thin air.
 */
export async function dismantleEquipment(
  userId: string,
  defKey: string,
): Promise<{ ok: true; lines: RecipeLine[]; shards: number } | { ok: false; error: ForgeError }> {
  const def = EQUIPMENT_BY_KEY[defKey];
  if (!def) return { ok: false, error: "UNKNOWN_ITEM" };
  if (STARTER_EQUIPMENT.includes(defKey)) return { ok: false, error: "PROTECTED" };

  const result = await prisma.$transaction(async (tx) => {
    const row = await tx.userEquipment.findUnique({
      where: { userId_defKey: { userId, defKey } },
    });
    if (!row) return { ok: false as const, error: "NOT_OWNED" as const };

    const yielded = dismantleYield(def, row.level);

    await tx.userEquipment.delete({ where: { id: row.id } });

    for (const line of yielded.lines) {
      await tx.inventoryItem.upsert({
        where: { userId_itemKey: { userId, itemKey: line.itemKey } },
        create: { userId, itemKey: line.itemKey, quantity: line.quantity },
        update: { quantity: { increment: line.quantity } },
      });
    }
    if (yielded.shards > 0) {
      await tx.user.update({
        where: { id: userId },
        data: { shards: { increment: yielded.shards } },
      });
    }

    return { ok: true as const, ...yielded };
  });

  if (result.ok) await track("equipment.dismantled", userId, { defKey, level: def.maxLevel });
  return result;
}
