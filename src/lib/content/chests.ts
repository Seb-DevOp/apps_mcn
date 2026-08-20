/**
 * The evolving Daily Chest.
 *
 * One free chest per day. The chest a player opens is decided by their rank, so
 * ranking up permanently improves the daily reward — that is the single strongest
 * reason to climb.
 *
 * Two rules are enforced by the engine, not by luck:
 *   1. A chest ALWAYS yields something (guaranteed entries are rolled first).
 *   2. Weights live in the database and are shown to the player. No hidden odds.
 */

import type { Rarity } from "./items";

export interface PoolEntryDef {
  rewardType: "XP" | "SHARD" | "ITEM" | "BOOST" | "COSMETIC" | "BADGE";
  itemKey?: string;
  minQty: number;
  maxQty: number;
  weight: number;
  rarity: Rarity;
  /** Guaranteed entries are granted on every open, outside the weighted draw. */
  guaranteed?: boolean;
}

export interface ChestDef {
  key: string;
  rankKey: string;
  tier: number;
  nameEn: string;
  nameFr: string;
  descEn: string;
  descFr: string;
  /** Weighted draws performed on top of the guaranteed entries. */
  draws: number;
  /** Visual DNA consumed by the chest component. */
  visual: {
    body: string;
    trim: string;
    crystal: string;
    ambient: string;
    ornaments: number;
  };
  entries: PoolEntryDef[];
}

export const CHESTS: ChestDef[] = [
  {
    key: "chest-wanderer",
    rankKey: "wanderer",
    tier: 0,
    nameEn: "Wanderer Chest",
    nameFr: "Coffre du Vagabond",
    descEn: "Dark wood, aged metal, one small blue crystal.",
    descFr: "Bois sombre, métal vieilli, un petit cristal bleu.",
    draws: 1,
    visual: { body: "#2a2620", trim: "#6b5836", crystal: "#5b8fd6", ambient: "#3a3428", ornaments: 1 },
    entries: [
      { rewardType: "XP", minQty: 60, maxQty: 110, weight: 0, rarity: "COMMON", guaranteed: true },
      { rewardType: "SHARD", minQty: 3, maxQty: 8, weight: 340, rarity: "COMMON" },
      { rewardType: "ITEM", itemKey: "mat-stone-dust", minQty: 1, maxQty: 3, weight: 300, rarity: "COMMON" },
      { rewardType: "ITEM", itemKey: "mat-iron-thread", minQty: 1, maxQty: 2, weight: 220, rarity: "COMMON" },
      { rewardType: "ITEM", itemKey: "mat-gold-leaf", minQty: 1, maxQty: 1, weight: 100, rarity: "UNCOMMON" },
      { rewardType: "ITEM", itemKey: "frag-blade", minQty: 1, maxQty: 1, weight: 40, rarity: "UNCOMMON" },
    ],
  },
  {
    key: "chest-guardian",
    rankKey: "guardian",
    tier: 1,
    nameEn: "Guardian Chest",
    nameFr: "Coffre du Gardien",
    descEn: "Dark navy and gold, a larger sapphire set in the lid.",
    descFr: "Bleu marine et or, un saphir plus grand serti dans le couvercle.",
    draws: 2,
    visual: { body: "#141c33", trim: "#9c7c3c", crystal: "#4f93ff", ambient: "#1b2647", ornaments: 2 },
    entries: [
      { rewardType: "XP", minQty: 150, maxQty: 240, weight: 0, rarity: "COMMON", guaranteed: true },
      { rewardType: "SHARD", minQty: 8, maxQty: 18, weight: 300, rarity: "COMMON" },
      { rewardType: "ITEM", itemKey: "mat-stone-dust", minQty: 2, maxQty: 4, weight: 220, rarity: "COMMON" },
      { rewardType: "ITEM", itemKey: "mat-gold-leaf", minQty: 1, maxQty: 3, weight: 200, rarity: "UNCOMMON" },
      { rewardType: "ITEM", itemKey: "frag-blade", minQty: 1, maxQty: 2, weight: 130, rarity: "UNCOMMON" },
      { rewardType: "ITEM", itemKey: "frag-bow", minQty: 1, maxQty: 2, weight: 130, rarity: "UNCOMMON" },
      { rewardType: "ITEM", itemKey: "mat-sapphire-shard", minQty: 1, maxQty: 1, weight: 70, rarity: "RARE" },
      { rewardType: "BOOST", itemKey: "boost-xp-24h", minQty: 1, maxQty: 1, weight: 35, rarity: "UNCOMMON" },
    ],
  },
  {
    key: "chest-royal",
    rankKey: "royal-guardian",
    tier: 2,
    nameEn: "Royal Chest",
    nameFr: "Coffre Royal",
    descEn: "Royal blue lacquer, ornate gold, a large sapphire crystal.",
    descFr: "Laque bleu royal, or ouvragé, un grand cristal de saphir.",
    draws: 2,
    visual: { body: "#16255c", trim: "#d4af5a", crystal: "#3b7dff", ambient: "#22357a", ornaments: 3 },
    entries: [
      { rewardType: "XP", minQty: 350, maxQty: 550, weight: 0, rarity: "UNCOMMON", guaranteed: true },
      { rewardType: "SHARD", minQty: 20, maxQty: 40, weight: 280, rarity: "UNCOMMON" },
      { rewardType: "ITEM", itemKey: "mat-gold-leaf", minQty: 2, maxQty: 5, weight: 220, rarity: "UNCOMMON" },
      { rewardType: "ITEM", itemKey: "mat-sapphire-shard", minQty: 1, maxQty: 3, weight: 190, rarity: "RARE" },
      { rewardType: "ITEM", itemKey: "mat-royal-velvet", minQty: 1, maxQty: 2, weight: 150, rarity: "RARE" },
      { rewardType: "ITEM", itemKey: "frag-scepter", minQty: 1, maxQty: 2, weight: 120, rarity: "RARE" },
      { rewardType: "BOOST", itemKey: "boost-shard-12h", minQty: 1, maxQty: 1, weight: 60, rarity: "RARE" },
      { rewardType: "COSMETIC", itemKey: "cos-candle-sigil", minQty: 1, maxQty: 1, weight: 25, rarity: "UNCOMMON" },
    ],
  },
  {
    key: "chest-elite",
    rankKey: "elite-guardian",
    tier: 3,
    nameEn: "Elite Chest",
    nameFr: "Coffre d'Élite",
    descEn: "Reinforced, gold-banded, the crystal already glowing before you touch it.",
    descFr: "Renforcé, cerclé d'or, le cristal brille avant même qu'on le touche.",
    draws: 3,
    visual: { body: "#0f1e4d", trim: "#e8c366", crystal: "#2f8dff", ambient: "#1d3a8f", ornaments: 4 },
    entries: [
      { rewardType: "XP", minQty: 700, maxQty: 1100, weight: 0, rarity: "RARE", guaranteed: true },
      { rewardType: "SHARD", minQty: 45, maxQty: 90, weight: 260, rarity: "RARE" },
      { rewardType: "ITEM", itemKey: "mat-sapphire-shard", minQty: 2, maxQty: 5, weight: 220, rarity: "RARE" },
      { rewardType: "ITEM", itemKey: "mat-royal-velvet", minQty: 1, maxQty: 3, weight: 180, rarity: "RARE" },
      { rewardType: "ITEM", itemKey: "frag-arcane-blade", minQty: 1, maxQty: 2, weight: 130, rarity: "EPIC" },
      { rewardType: "ITEM", itemKey: "mat-arcane-core", minQty: 1, maxQty: 2, weight: 110, rarity: "EPIC" },
      { rewardType: "BOOST", itemKey: "boost-xp-24h", minQty: 1, maxQty: 2, weight: 70, rarity: "UNCOMMON" },
      { rewardType: "ITEM", itemKey: "key-crystal", minQty: 1, maxQty: 1, weight: 30, rarity: "EPIC" },
    ],
  },
  {
    key: "chest-keeper",
    rankKey: "vault-keeper",
    tier: 4,
    nameEn: "Vault Keeper Chest",
    nameFr: "Coffre du Gardien du Vault",
    descEn: "Golden architecture, floating particles, ancient Vault symbols turning slowly.",
    descFr: "Architecture dorée, particules flottantes, symboles anciens qui tournent lentement.",
    draws: 3,
    visual: { body: "#0a1840", trim: "#f2d07f", crystal: "#37d5ff", ambient: "#1746c4", ornaments: 5 },
    entries: [
      { rewardType: "XP", minQty: 1600, maxQty: 2600, weight: 0, rarity: "EPIC", guaranteed: true },
      { rewardType: "SHARD", minQty: 110, maxQty: 200, weight: 240, rarity: "EPIC" },
      { rewardType: "ITEM", itemKey: "mat-arcane-core", minQty: 2, maxQty: 4, weight: 210, rarity: "EPIC" },
      { rewardType: "ITEM", itemKey: "frag-arcane-blade", minQty: 1, maxQty: 3, weight: 180, rarity: "EPIC" },
      { rewardType: "ITEM", itemKey: "mat-vault-essence", minQty: 1, maxQty: 2, weight: 120, rarity: "MYTHIC" },
      { rewardType: "ITEM", itemKey: "key-crystal", minQty: 1, maxQty: 2, weight: 90, rarity: "EPIC" },
      { rewardType: "BOOST", itemKey: "boost-shard-12h", minQty: 1, maxQty: 2, weight: 80, rarity: "RARE" },
      { rewardType: "COSMETIC", itemKey: "cos-sapphire-aura", minQty: 1, maxQty: 1, weight: 20, rarity: "EPIC" },
    ],
  },
  {
    key: "chest-legend",
    rankKey: "legend",
    tier: 5,
    nameEn: "Legend Chest",
    nameFr: "Coffre de Légende",
    descEn: "Ancient gold and deep royal blue, held together by light rather than hinges.",
    descFr: "Or ancien et bleu royal profond, tenu par la lumière plutôt que par des charnières.",
    draws: 4,
    visual: { body: "#08122f", trim: "#ffd980", crystal: "#5eb0ff", ambient: "#2a5cf0", ornaments: 6 },
    entries: [
      { rewardType: "XP", minQty: 3000, maxQty: 4500, weight: 0, rarity: "LEGENDARY", guaranteed: true },
      { rewardType: "SHARD", minQty: 250, maxQty: 450, weight: 230, rarity: "MYTHIC" },
      { rewardType: "ITEM", itemKey: "mat-vault-essence", minQty: 2, maxQty: 4, weight: 200, rarity: "MYTHIC" },
      { rewardType: "ITEM", itemKey: "mat-celestial-ore", minQty: 1, maxQty: 2, weight: 140, rarity: "LEGENDARY" },
      { rewardType: "ITEM", itemKey: "frag-legend", minQty: 1, maxQty: 2, weight: 110, rarity: "LEGENDARY" },
      { rewardType: "ITEM", itemKey: "key-crystal", minQty: 2, maxQty: 3, weight: 100, rarity: "EPIC" },
      { rewardType: "BOOST", itemKey: "boost-xp-24h", minQty: 2, maxQty: 3, weight: 90, rarity: "UNCOMMON" },
      { rewardType: "COSMETIC", itemKey: "cos-crown-mark", minQty: 1, maxQty: 1, weight: 15, rarity: "LEGENDARY" },
    ],
  },
];

export const CHEST_BY_KEY: Record<string, ChestDef> = Object.fromEntries(
  CHESTS.map((c) => [c.key, c]),
);

/**
 * The seven-day streak cycle.
 *
 * Deliberately forgiving: a missed day spends a Streak Shield instead of wiping
 * the streak, and even a broken streak restarts the cycle rather than removing
 * anything the player already owns.
 */
export interface StreakDayDef {
  day: number;
  /** Multiplier applied to the chest's guaranteed XP. */
  xpMultiplier: number;
  /** Extra weighted draws on top of the chest's own. */
  bonusDraws: number;
  labelEn: string;
  labelFr: string;
}

export const STREAK_CYCLE: StreakDayDef[] = [
  { day: 1, xpMultiplier: 1.0, bonusDraws: 0, labelEn: "XP", labelFr: "XP" },
  { day: 2, xpMultiplier: 1.05, bonusDraws: 0, labelEn: "XP + material", labelFr: "XP + matériau" },
  { day: 3, xpMultiplier: 1.1, bonusDraws: 1, labelEn: "XP + shards", labelFr: "XP + éclats" },
  { day: 4, xpMultiplier: 1.15, bonusDraws: 1, labelEn: "XP + fragment", labelFr: "XP + fragment" },
  { day: 5, xpMultiplier: 1.25, bonusDraws: 1, labelEn: "Rare material", labelFr: "Matériau rare" },
  { day: 6, xpMultiplier: 1.5, bonusDraws: 1, labelEn: "Large XP", labelFr: "Gros XP" },
  { day: 7, xpMultiplier: 2.0, bonusDraws: 2, labelEn: "Vault reward", labelFr: "Récompense du Vault" },
];

/** Position in the 7-day cycle for a given streak length (1-indexed, wraps). */
export function streakCycleDay(currentStreak: number): StreakDayDef {
  const n = Math.max(1, currentStreak);
  const index = ((n - 1) % 7) + 1;
  return STREAK_CYCLE[index - 1];
}
