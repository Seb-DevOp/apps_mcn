import type { Rarity } from "./items";
import type { EquipmentDefinition, WeaponClass } from "./equipment";

/**
 * THE FORGE
 *
 * Two roads to the same weapon, on purpose:
 *
 *   Buy   — shards, immediately, for the player who has been playing a lot.
 *   Forge — fragments and materials, for the player who has been *collecting*.
 *
 * That is what makes the Daily Chest's fragments matter. A free player who never
 * has enough shards still reaches the same gear by turning up and gathering, which
 * is exactly what the brief asks: crafting is the collector's path, not a
 * consolation prize.
 *
 * Recipes are derived rather than hand-written, so a new weapon in the catalogue
 * is craftable the moment it is added — with no chance of an unbalanced one-off.
 */

/** Weapon fragments, by class. Non-weapon slots are forged from materials alone. */
const CLASS_FRAGMENT: Record<WeaponClass, string> = {
  SCEPTER: "frag-scepter",
  BOW: "frag-bow",
  SWORD: "frag-blade",
  MAGIC_SWORD: "frag-arcane-blade",
};

/** Material consumed by the Forge, by rarity. Same ladder the upgrades use. */
const FORGE_MATERIAL: Record<Rarity, string> = {
  COMMON: "mat-stone-dust",
  UNCOMMON: "mat-gold-leaf",
  RARE: "mat-sapphire-shard",
  EPIC: "mat-arcane-core",
  MYTHIC: "mat-vault-essence",
  LEGENDARY: "mat-celestial-ore",
};

const FRAGMENT_COUNT: Record<Rarity, number> = {
  COMMON: 2,
  UNCOMMON: 4,
  RARE: 6,
  EPIC: 10,
  MYTHIC: 16,
  LEGENDARY: 24,
};

const MATERIAL_COUNT: Record<Rarity, number> = {
  COMMON: 2,
  UNCOMMON: 3,
  RARE: 4,
  EPIC: 6,
  MYTHIC: 8,
  LEGENDARY: 10,
};

/** Crystal Keys gate the two highest tiers, which is what Keys are for. */
const KEY_COUNT: Partial<Record<Rarity, number>> = { MYTHIC: 1, LEGENDARY: 2 };

/** Forging costs a fraction of the shard price — the rest is paid in patience. */
const SHARD_SHARE = 0.3;

export interface RecipeLine {
  itemKey: string;
  quantity: number;
}

export interface Recipe {
  shards: number;
  lines: RecipeLine[];
}

export function recipeFor(def: EquipmentDefinition): Recipe {
  const lines: RecipeLine[] = [];

  if (def.weaponClass) {
    lines.push({
      itemKey: CLASS_FRAGMENT[def.weaponClass],
      quantity: FRAGMENT_COUNT[def.rarity],
    });
  }

  lines.push({ itemKey: FORGE_MATERIAL[def.rarity], quantity: MATERIAL_COUNT[def.rarity] });

  // A Legendary is never assembled from ordinary parts.
  if (def.rarity === "LEGENDARY") {
    lines.push({ itemKey: "frag-legend", quantity: 2 });
  }

  const keys = KEY_COUNT[def.rarity];
  if (keys) lines.push({ itemKey: "key-crystal", quantity: keys });

  return { shards: Math.round(def.shardPrice * SHARD_SHARE), lines };
}

/**
 * What a duplicate becomes.
 *
 * A second copy of a weapon you already own is never dropped on the floor: it
 * comes apart into the fragments it was made of. Collecting stays worthwhile even
 * once the collection is complete.
 */
export function duplicateYield(def: EquipmentDefinition): RecipeLine[] {
  const recipe = recipeFor(def);
  return recipe.lines
    .filter((line) => line.itemKey !== "key-crystal") // keys are never returned
    .map((line) => ({ itemKey: line.itemKey, quantity: Math.max(1, Math.floor(line.quantity / 2)) }));
}

/**
 * What dismantling a piece you own returns.
 *
 * Deliberately below what it cost: half the parts and none of the shards, plus a
 * small share of what was spent on its levels. Melting a weapon down and forging
 * it again must always be a loss, or the Forge becomes a laundry.
 */
export function dismantleYield(
  def: EquipmentDefinition,
  level: number,
): { lines: RecipeLine[]; shards: number } {
  const lines = duplicateYield(def);
  // Levels are refunded as shards only, at 40% of the shard half of their cost.
  const levelsPaid = Math.max(0, level - 1);
  const shards = Math.round(def.shardPrice * 0.35 * levelsPaid * 0.4);
  return { lines, shards };
}

/**
 * Equipment drop weights are per mille, so a table total *is* its drop chance and
 * the odds sheet can print the real number without a second calculation.
 */
export const EQUIPMENT_DROP_DENOMINATOR = 1000;

/** Equipment rare enough that the Vault itself hands it out, by chest tier. */
export const CHEST_EQUIPMENT_DROPS: Record<string, { defKey: string; weight: number }[]> = {
  "chest-elite": [
    { defKey: "bow-guardian", weight: 24 },
    { defKey: "sword-guardian-blade", weight: 24 },
    { defKey: "armor-guardian-mail", weight: 20 },
  ],
  "chest-keeper": [
    { defKey: "bow-royal-longbow", weight: 22 },
    { defKey: "sword-royal-guardian", weight: 22 },
    { defKey: "magic-crystal-blade", weight: 16 },
    { defKey: "relic-ember", weight: 18 },
  ],
  "chest-legend": [
    { defKey: "bow-elite-crystal", weight: 20 },
    { defKey: "sword-elite-guardian", weight: 20 },
    { defKey: "magic-arcane-blade", weight: 16 },
    { defKey: "relic-sapphire", weight: 14 },
  ],
};
