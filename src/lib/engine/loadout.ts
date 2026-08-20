import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { RANK_BY_KEY } from "@/lib/content/ranks";
import { ITEM_BY_KEY } from "@/lib/content/items";
import {
  EQUIPMENT,
  EQUIPMENT_BY_KEY,
  SLOTS,
  STARTER_EQUIPMENT,
  statsAtLevel,
  sumStats,
  capStats,
  upgradeCost,
  ABILITIES,
  type EquipSlot,
  type EquipStats,
  type EquipmentDefinition,
} from "@/lib/content/equipment";
import { track } from "./analytics";

/**
 * THE LOADOUT
 *
 * Owning gear changes nothing on its own — only what is *worn* counts, and the
 * server is the only thing that decides what is worn. Every bonus applied
 * anywhere in the engine is read from these rows, never from the client.
 */

export type LoadoutStats = Required<EquipStats>;

export const EMPTY_STATS: LoadoutStats = {
  xpBonus: 0,
  shardBonus: 0,
  scoreBonus: 0,
  precisionMs: 0,
  comboGuard: 0,
  chestFortune: 0,
};

/** Combined, capped statistics of everything the player currently wears. */
export async function getEquippedStats(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<LoadoutStats> {
  const worn = await tx.userEquipment.findMany({
    where: { userId, equippedSlot: { not: null } },
  });
  if (worn.length === 0) return EMPTY_STATS;

  const stats = worn.flatMap((row) => {
    const def = EQUIPMENT_BY_KEY[row.defKey];
    return def ? [statsAtLevel(def, row.level)] : [];
  });
  return capStats(sumStats(stats));
}

/** The ability of the equipped weapon, if it has one. */
export async function getEquippedAbility(userId: string) {
  const weapon = await prisma.userEquipment.findFirst({
    where: { userId, equippedSlot: "WEAPON" },
  });
  if (!weapon) return null;
  const def = EQUIPMENT_BY_KEY[weapon.defKey];
  if (!def?.ability) return null;
  const ability = ABILITIES[def.ability];
  return { ...ability, weaponKey: def.key };
}

// ---------------------------------------------------------------------------
// Armory state
// ---------------------------------------------------------------------------

export interface ArmoryEntry {
  def: EquipmentDefinition;
  owned: boolean;
  level: number;
  equippedSlot: EquipSlot | null;
  stats: EquipStats;
  /** Statistics one level up — shown so an upgrade is never a blind purchase. */
  nextStats: EquipStats | null;
  upgrade: { shards: number; itemKey: string; quantity: number; owned: number } | null;
  affordable: boolean;
  rankLocked: boolean;
}

export async function getArmory(userId: string) {
  const [user, owned, materials] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.userEquipment.findMany({ where: { userId } }),
    prisma.inventoryItem.findMany({ where: { userId } }),
  ]);

  const ownedByKey = new Map(owned.map((row) => [row.defKey, row]));
  const materialCount = new Map(materials.map((row) => [row.itemKey, row.quantity]));
  const rankOrder = RANK_BY_KEY[user.rankKey]?.order ?? 0;

  const entries: ArmoryEntry[] = EQUIPMENT.map((def) => {
    const row = ownedByKey.get(def.key);
    const level = row?.level ?? 1;
    const cost = row ? upgradeCost(def, level) : null;

    return {
      def,
      owned: Boolean(row),
      level,
      equippedSlot: (row?.equippedSlot as EquipSlot | null) ?? null,
      stats: statsAtLevel(def, level),
      nextStats: row && level < def.maxLevel ? statsAtLevel(def, level + 1) : null,
      upgrade: cost
        ? { ...cost, owned: materialCount.get(cost.itemKey) ?? 0 }
        : null,
      affordable: user.shards >= def.shardPrice,
      rankLocked: def.requiredRankOrder > rankOrder,
    };
  });

  const equippedStats = capStats(
    sumStats(
      owned
        .filter((row) => row.equippedSlot)
        .flatMap((row) => {
          const def = EQUIPMENT_BY_KEY[row.defKey];
          return def ? [statsAtLevel(def, row.level)] : [];
        }),
    ),
  );

  return {
    shards: user.shards,
    rankOrder,
    entries,
    equippedStats,
    slots: SLOTS,
  };
}

export type ArmoryState = Awaited<ReturnType<typeof getArmory>>;

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type ActionError =
  | "UNKNOWN_ITEM"
  | "ALREADY_OWNED"
  | "NOT_OWNED"
  | "RANK_LOCKED"
  | "NOT_ENOUGH_SHARDS"
  | "NOT_ENOUGH_MATERIALS"
  | "MAX_LEVEL";

export async function buyEquipment(
  userId: string,
  defKey: string,
): Promise<{ ok: true } | { ok: false; error: ActionError }> {
  const def = EQUIPMENT_BY_KEY[defKey];
  if (!def) return { ok: false, error: "UNKNOWN_ITEM" };

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const rankOrder = RANK_BY_KEY[user.rankKey]?.order ?? 0;

    if (def.requiredRankOrder > rankOrder) return { ok: false as const, error: "RANK_LOCKED" as const };
    if (user.shards < def.shardPrice) return { ok: false as const, error: "NOT_ENOUGH_SHARDS" as const };

    const existing = await tx.userEquipment.findUnique({
      where: { userId_defKey: { userId, defKey } },
    });
    if (existing) return { ok: false as const, error: "ALREADY_OWNED" as const };

    // Charge before granting: a failure must never leave free equipment behind.
    await tx.user.update({
      where: { id: userId },
      data: { shards: { decrement: def.shardPrice } },
    });
    await tx.userEquipment.create({ data: { userId, defKey } });

    return { ok: true as const };
  });

  if (result.ok) await track("equipment.bought", userId, { defKey, price: def.shardPrice });
  return result;
}

export async function upgradeEquipment(
  userId: string,
  defKey: string,
): Promise<{ ok: true; level: number } | { ok: false; error: ActionError }> {
  const def = EQUIPMENT_BY_KEY[defKey];
  if (!def) return { ok: false, error: "UNKNOWN_ITEM" };

  const result = await prisma.$transaction(async (tx) => {
    const row = await tx.userEquipment.findUnique({
      where: { userId_defKey: { userId, defKey } },
    });
    if (!row) return { ok: false as const, error: "NOT_OWNED" as const };

    const cost = upgradeCost(def, row.level);
    if (!cost) return { ok: false as const, error: "MAX_LEVEL" as const };

    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.shards < cost.shards) return { ok: false as const, error: "NOT_ENOUGH_SHARDS" as const };

    const material = await tx.inventoryItem.findUnique({
      where: { userId_itemKey: { userId, itemKey: cost.itemKey } },
    });
    if (!material || material.quantity < cost.quantity) {
      return { ok: false as const, error: "NOT_ENOUGH_MATERIALS" as const };
    }

    await tx.user.update({ where: { id: userId }, data: { shards: { decrement: cost.shards } } });
    await tx.inventoryItem.update({
      where: { id: material.id },
      data: { quantity: { decrement: cost.quantity } },
    });
    const updated = await tx.userEquipment.update({
      where: { id: row.id },
      data: { level: { increment: 1 } },
    });

    return { ok: true as const, level: updated.level };
  });

  if (result.ok) await track("equipment.upgraded", userId, { defKey, level: result.level });
  return result;
}

export async function equipItem(
  userId: string,
  defKey: string,
): Promise<{ ok: true; slot: EquipSlot } | { ok: false; error: ActionError }> {
  const def = EQUIPMENT_BY_KEY[defKey];
  if (!def) return { ok: false, error: "UNKNOWN_ITEM" };

  return prisma.$transaction(async (tx) => {
    const row = await tx.userEquipment.findUnique({
      where: { userId_defKey: { userId, defKey } },
    });
    if (!row) return { ok: false as const, error: "NOT_OWNED" as const };

    // Free the slot first — the unique index allows only one item per slot.
    await tx.userEquipment.updateMany({
      where: { userId, equippedSlot: def.slot },
      data: { equippedSlot: null },
    });
    await tx.userEquipment.update({
      where: { id: row.id },
      data: { equippedSlot: def.slot },
    });

    return { ok: true as const, slot: def.slot };
  });
}

export async function unequipSlot(userId: string, slot: EquipSlot) {
  await prisma.userEquipment.updateMany({
    where: { userId, equippedSlot: slot },
    data: { equippedSlot: null },
  });
  return { ok: true as const };
}

/**
 * Grants the starter gear and equips it, so a new player opens the Armory to a
 * loadout rather than an empty room.
 */
export async function grantStarterEquipment(userId: string) {
  for (const defKey of STARTER_EQUIPMENT) {
    const def = EQUIPMENT_BY_KEY[defKey];
    if (!def) continue;
    await prisma.userEquipment.upsert({
      where: { userId_defKey: { userId, defKey } },
      create: { userId, defKey, equippedSlot: def.slot },
      update: {},
    });
  }
}

/** Human-readable material name for the upgrade panel. */
export function materialName(itemKey: string, locale: string) {
  const def = ITEM_BY_KEY[itemKey];
  if (!def) return itemKey;
  return locale === "fr" ? def.nameFr : def.nameEn;
}
