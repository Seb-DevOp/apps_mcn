import type { Rarity } from "./items";

/**
 * EQUIPMENT — the spine of V2.
 *
 * Design rule, deliberately applied: every statistic here changes something the
 * game actually does. MCN has no combat, so "Power", "Defense" and "Stability"
 * would be decoration — and the brief is explicit that a weapon must feel useful
 * and that no progress may be fake. The four weapon classes therefore get their
 * distinct identities from real effects instead:
 *
 *   SCEPTER      progression  — XP and Vault Shards
 *   BOW          skill        — a wider timing window, higher scores
 *   SWORD        consistency  — absorbs missed notes, protects combos
 *   MAGIC_SWORD  economy      — shards and richer daily chests
 *
 * Combat statistics arrive the day a combat mini-game does, not before.
 */

export type EquipSlot = "WEAPON" | "ARMOR" | "RELIC" | "CLOAK" | "ACCESSORY";

export type WeaponClass = "SCEPTER" | "BOW" | "SWORD" | "MAGIC_SWORD";

/**
 * Every field maps to one concrete effect in the engine:
 *  - xpBonus / shardBonus  multiply rewards (through the shared multiplier cap)
 *  - scoreBonus            multiplies the mini-game score the server recomputes
 *  - precisionMs           widens the hit window, so timing is genuinely easier
 *  - comboGuard            misses absorbed per run before the combo breaks
 *  - chestFortune          extra weighted draws on the Daily Chest
 */
export interface EquipStats {
  xpBonus?: number;
  shardBonus?: number;
  scoreBonus?: number;
  precisionMs?: number;
  comboGuard?: number;
  chestFortune?: number;
}

export type AbilityKey = "crystal-pulse" | "eagle-eye" | "guardian-strike" | "arcane-surge";

export interface AbilityDef {
  key: AbilityKey;
  nameEn: string;
  nameFr: string;
  descEn: string;
  descFr: string;
  /** How long the effect lasts once triggered, in milliseconds. */
  durationMs: number;
  effect: EquipStats;
}

/**
 * Abilities are triggered once per run, by the player, at a moment of their
 * choosing. The client reports when; the server replays the same window over the
 * same pattern, so the bonus cannot be claimed twice or stretched.
 */
export const ABILITIES: Record<AbilityKey, AbilityDef> = {
  "crystal-pulse": {
    key: "crystal-pulse",
    nameEn: "Crystal Pulse",
    nameFr: "Pulsation de Cristal",
    descEn: "The crystals answer: doubled score for 8 seconds.",
    descFr: "Les cristaux répondent : score doublé pendant 8 secondes.",
    durationMs: 8000,
    effect: { scoreBonus: 1.0 },
  },
  "eagle-eye": {
    key: "eagle-eye",
    nameEn: "Eagle Eye",
    nameFr: "Œil d'Aigle",
    descEn: "Time slows: +80ms timing window for 8 seconds.",
    descFr: "Le temps ralentit : fenêtre de +80 ms pendant 8 secondes.",
    durationMs: 8000,
    effect: { precisionMs: 80 },
  },
  "guardian-strike": {
    key: "guardian-strike",
    nameEn: "Guardian Strike",
    nameFr: "Frappe du Gardien",
    descEn: "Nothing breaks your combo for 8 seconds.",
    descFr: "Rien ne brise votre combo pendant 8 secondes.",
    durationMs: 8000,
    effect: { comboGuard: 99 },
  },
  "arcane-surge": {
    key: "arcane-surge",
    nameEn: "Arcane Surge",
    nameFr: "Déferlante Arcanique",
    descEn: "+60% score and +40ms window for 8 seconds.",
    descFr: "+60% de score et +40 ms de fenêtre pendant 8 secondes.",
    durationMs: 8000,
    effect: { scoreBonus: 0.6, precisionMs: 40 },
  },
};

export interface EquipmentDefinition {
  key: string;
  slot: EquipSlot;
  weaponClass?: WeaponClass;
  rarity: Rarity;
  nameEn: string;
  nameFr: string;
  descEn: string;
  descFr: string;
  icon: string;
  /** Statistics at level 1. Higher levels scale them by LEVEL_GROWTH. */
  base: EquipStats;
  maxLevel: number;
  /** Vault Shards. V2 sells equipment for earned currency only. */
  shardPrice: number;
  requiredRankOrder: number;
  ability?: AbilityKey;
}

/**
 * Level curve.
 *
 * The brief's example (+10 / +15 / +22 / +31 / +45) accelerates by roughly 1.45x
 * per level. That shape is kept, but scaled down: these statistics are
 * percentages feeding a multiplier that is capped globally, so a raw 4.5x would
 * simply push every item into the ceiling and make choices meaningless.
 */
export const LEVEL_GROWTH = [1, 1.35, 1.75, 2.2, 2.75];
export const MAX_LEVEL = LEVEL_GROWTH.length;

/** Upgrade cost multiplier for reaching level 2, 3, 4, 5. */
const UPGRADE_COST_CURVE = [0, 0.35, 0.65, 1.15, 1.9];

/** Material consumed by upgrades, by item rarity. */
const UPGRADE_MATERIAL: Record<Rarity, string> = {
  COMMON: "mat-stone-dust",
  UNCOMMON: "mat-gold-leaf",
  RARE: "mat-sapphire-shard",
  EPIC: "mat-arcane-core",
  MYTHIC: "mat-vault-essence",
  LEGENDARY: "mat-celestial-ore",
};

export interface UpgradeCost {
  shards: number;
  itemKey: string;
  quantity: number;
}

/**
 * What it costs to take an item from `level` to `level + 1`.
 *
 * Deliberately no XP cost, despite the brief listing one: rank is derived from
 * total XP, so spending XP would demote the player. A progression system must
 * never take away the rank it just gave.
 */
export function upgradeCost(def: EquipmentDefinition, level: number): UpgradeCost | null {
  if (level >= def.maxLevel) return null;
  const step = UPGRADE_COST_CURVE[level] ?? UPGRADE_COST_CURVE.at(-1)!;
  return {
    shards: Math.round(def.shardPrice * step),
    itemKey: UPGRADE_MATERIAL[def.rarity],
    quantity: 1 + level,
  };
}

/** Statistics of an item at a given level. */
export function statsAtLevel(def: EquipmentDefinition, level: number): EquipStats {
  const growth = LEVEL_GROWTH[Math.min(level, def.maxLevel) - 1] ?? 1;
  const out: EquipStats = {};
  for (const [key, value] of Object.entries(def.base) as [keyof EquipStats, number][]) {
    // Whole-number stats (guards, draws) grow in steps, not fractions.
    out[key] =
      key === "comboGuard" || key === "chestFortune"
        ? Math.round(value * growth)
        : Math.round(value * growth * 1000) / 1000;
  }
  return out;
}

// ---------------------------------------------------------------------------
// THE ARMORY
// ---------------------------------------------------------------------------

export const EQUIPMENT: EquipmentDefinition[] = [
  // --- SCEPTERS · progression ---------------------------------------------
  {
    key: "scepter-wanderer",
    slot: "WEAPON",
    weaponClass: "SCEPTER",
    rarity: "COMMON",
    nameEn: "Wanderer's Scepter",
    nameFr: "Sceptre du Vagabond",
    descEn: "Worn wood, a chip of blue crystal. It still answers.",
    descFr: "Bois usé, un éclat de cristal bleu. Il répond encore.",
    icon: "scepter",
    base: { xpBonus: 0.04 },
    maxLevel: MAX_LEVEL,
    shardPrice: 300,
    requiredRankOrder: 0,
    ability: "crystal-pulse",
  },
  {
    key: "scepter-guardian-crystal",
    slot: "WEAPON",
    weaponClass: "SCEPTER",
    rarity: "UNCOMMON",
    nameEn: "Guardian Crystal Scepter",
    nameFr: "Sceptre de Cristal du Gardien",
    descEn: "Issued to every Guardian on the day they are named.",
    descFr: "Remis à chaque Gardien le jour où il est nommé.",
    icon: "scepter",
    base: { xpBonus: 0.06, shardBonus: 0.04 },
    maxLevel: MAX_LEVEL,
    shardPrice: 900,
    requiredRankOrder: 1,
    ability: "crystal-pulse",
  },
  {
    key: "scepter-royal",
    slot: "WEAPON",
    weaponClass: "SCEPTER",
    rarity: "RARE",
    nameEn: "Royal Scepter",
    nameFr: "Sceptre Royal",
    descEn: "Gold over sapphire. It is heavier than it looks.",
    descFr: "Or sur saphir. Il est plus lourd qu'il n'y paraît.",
    icon: "scepter",
    base: { xpBonus: 0.09, shardBonus: 0.06 },
    maxLevel: MAX_LEVEL,
    shardPrice: 2600,
    requiredRankOrder: 2,
    ability: "crystal-pulse",
  },
  {
    key: "scepter-elite-arcane",
    slot: "WEAPON",
    weaponClass: "SCEPTER",
    rarity: "EPIC",
    nameEn: "Elite Arcane Scepter",
    nameFr: "Sceptre Arcanique d'Élite",
    descEn: "The crystal has stopped needing light of its own.",
    descFr: "Le cristal n'a plus besoin de lumière propre.",
    icon: "scepter",
    base: { xpBonus: 0.12, shardBonus: 0.08 },
    maxLevel: MAX_LEVEL,
    shardPrice: 7500,
    requiredRankOrder: 3,
    ability: "crystal-pulse",
  },
  {
    key: "scepter-keeper",
    slot: "WEAPON",
    weaponClass: "SCEPTER",
    rarity: "MYTHIC",
    nameEn: "Vault Keeper Scepter",
    nameFr: "Sceptre du Gardien du Vault",
    descEn: "Carried only by those trusted with the deepest doors.",
    descFr: "Porté seulement par ceux à qui l'on confie les portes profondes.",
    icon: "scepter",
    base: { xpBonus: 0.15, shardBonus: 0.1, chestFortune: 1 },
    maxLevel: MAX_LEVEL,
    shardPrice: 18000,
    requiredRankOrder: 4,
    ability: "crystal-pulse",
  },
  {
    key: "scepter-celestial",
    slot: "WEAPON",
    weaponClass: "SCEPTER",
    rarity: "LEGENDARY",
    nameEn: "Legendary Celestial Scepter",
    nameFr: "Sceptre Céleste Légendaire",
    descEn: "The sky above the Vault, held in one hand.",
    descFr: "Le ciel au-dessus du Vault, tenu d'une main.",
    icon: "scepter",
    base: { xpBonus: 0.19, shardBonus: 0.13, chestFortune: 1 },
    maxLevel: MAX_LEVEL,
    shardPrice: 45000,
    requiredRankOrder: 5,
    ability: "crystal-pulse",
  },

  // --- BOWS · skill --------------------------------------------------------
  {
    key: "bow-guardian",
    slot: "WEAPON",
    weaponClass: "BOW",
    rarity: "UNCOMMON",
    nameEn: "Guardian Bow",
    nameFr: "Arc du Gardien",
    descEn: "Patient wood. It rewards a steady hand.",
    descFr: "Bois patient. Il récompense la main sûre.",
    icon: "bow",
    base: { precisionMs: 12, scoreBonus: 0.05 },
    maxLevel: MAX_LEVEL,
    shardPrice: 900,
    requiredRankOrder: 1,
    ability: "eagle-eye",
  },
  {
    key: "bow-royal-longbow",
    slot: "WEAPON",
    weaponClass: "BOW",
    rarity: "RARE",
    nameEn: "Royal Longbow",
    nameFr: "Arc Long Royal",
    descEn: "Drawn slowly, released exactly.",
    descFr: "Bandé lentement, relâché exactement.",
    icon: "bow",
    base: { precisionMs: 18, scoreBonus: 0.08 },
    maxLevel: MAX_LEVEL,
    shardPrice: 2600,
    requiredRankOrder: 2,
    ability: "eagle-eye",
  },
  {
    key: "bow-elite-crystal",
    slot: "WEAPON",
    weaponClass: "BOW",
    rarity: "EPIC",
    nameEn: "Elite Crystal Bow",
    nameFr: "Arc de Cristal d'Élite",
    descEn: "The string hums a half-second before you decide to shoot.",
    descFr: "La corde vibre une demi-seconde avant que vous ne décidiez de tirer.",
    icon: "bow",
    base: { precisionMs: 25, scoreBonus: 0.11 },
    maxLevel: MAX_LEVEL,
    shardPrice: 7500,
    requiredRankOrder: 3,
    ability: "eagle-eye",
  },
  {
    key: "bow-vault-hunter",
    slot: "WEAPON",
    weaponClass: "BOW",
    rarity: "MYTHIC",
    nameEn: "Vault Hunter Bow",
    nameFr: "Arc du Chasseur du Vault",
    descEn: "Made for the ones who go looking, not the ones who guard.",
    descFr: "Fait pour ceux qui cherchent, pas pour ceux qui gardent.",
    icon: "bow",
    base: { precisionMs: 32, scoreBonus: 0.14 },
    maxLevel: MAX_LEVEL,
    shardPrice: 18000,
    requiredRankOrder: 4,
    ability: "eagle-eye",
  },
  {
    key: "bow-celestial",
    slot: "WEAPON",
    weaponClass: "BOW",
    rarity: "LEGENDARY",
    nameEn: "Legendary Celestial Bow",
    nameFr: "Arc Céleste Légendaire",
    descEn: "It has never missed. Nobody knows whose hand it favours next.",
    descFr: "Il n'a jamais manqué. Nul ne sait quelle main il favorisera ensuite.",
    icon: "bow",
    base: { precisionMs: 40, scoreBonus: 0.18 },
    maxLevel: MAX_LEVEL,
    shardPrice: 45000,
    requiredRankOrder: 5,
    ability: "eagle-eye",
  },

  // --- SWORDS · consistency -----------------------------------------------
  {
    key: "sword-guardian-blade",
    slot: "WEAPON",
    weaponClass: "SWORD",
    rarity: "UNCOMMON",
    nameEn: "Guardian Blade",
    nameFr: "Lame du Gardien",
    descEn: "Plain steel, kept sharp for a very long time.",
    descFr: "Acier simple, tenu affûté depuis très longtemps.",
    icon: "sword",
    base: { comboGuard: 1, scoreBonus: 0.05 },
    maxLevel: MAX_LEVEL,
    shardPrice: 900,
    requiredRankOrder: 1,
    ability: "guardian-strike",
  },
  {
    key: "sword-royal-guardian",
    slot: "WEAPON",
    weaponClass: "SWORD",
    rarity: "RARE",
    nameEn: "Royal Guardian Sword",
    nameFr: "Épée du Gardien Royal",
    descEn: "Ceremonial, and entirely functional.",
    descFr: "Cérémonielle, et parfaitement fonctionnelle.",
    icon: "sword",
    base: { comboGuard: 1, scoreBonus: 0.09 },
    maxLevel: MAX_LEVEL,
    shardPrice: 2600,
    requiredRankOrder: 2,
    ability: "guardian-strike",
  },
  {
    key: "sword-elite-guardian",
    slot: "WEAPON",
    weaponClass: "SWORD",
    rarity: "EPIC",
    nameEn: "Elite Guardian Sword",
    nameFr: "Épée du Gardien d'Élite",
    descEn: "The ornate one. You have seen it in the Elite Hall.",
    descFr: "L'ouvragée. Vous l'avez vue au Hall d'Élite.",
    icon: "sword",
    base: { comboGuard: 2, scoreBonus: 0.12 },
    maxLevel: MAX_LEVEL,
    shardPrice: 7500,
    requiredRankOrder: 3,
    ability: "guardian-strike",
  },
  {
    key: "sword-vault-blade",
    slot: "WEAPON",
    weaponClass: "SWORD",
    rarity: "MYTHIC",
    nameEn: "Vault Blade",
    nameFr: "Lame du Vault",
    descEn: "Forged inside, and never taken out until now.",
    descFr: "Forgée à l'intérieur, et jamais sortie jusqu'ici.",
    icon: "sword",
    base: { comboGuard: 2, scoreBonus: 0.16 },
    maxLevel: MAX_LEVEL,
    shardPrice: 18000,
    requiredRankOrder: 4,
    ability: "guardian-strike",
  },
  {
    key: "sword-legendary-guardian",
    slot: "WEAPON",
    weaponClass: "SWORD",
    rarity: "LEGENDARY",
    nameEn: "Legendary Guardian Blade",
    nameFr: "Lame Légendaire du Gardien",
    descEn: "The blade of the Guardian whose record ends mid-sentence.",
    descFr: "La lame du Gardien dont le registre s'interrompt en pleine phrase.",
    icon: "sword",
    base: { comboGuard: 3, scoreBonus: 0.2 },
    maxLevel: MAX_LEVEL,
    shardPrice: 45000,
    requiredRankOrder: 5,
    ability: "guardian-strike",
  },

  // --- MAGIC SWORDS · economy, and the rarest class ------------------------
  {
    key: "magic-crystal-blade",
    slot: "WEAPON",
    weaponClass: "MAGIC_SWORD",
    rarity: "RARE",
    nameEn: "Crystal Blade",
    nameFr: "Lame de Cristal",
    descEn: "Half sword, half crystal, and it is not clear which half leads.",
    descFr: "Moitié épée, moitié cristal, et l'on ne sait laquelle mène.",
    icon: "magic-sword",
    base: { shardBonus: 0.1, scoreBonus: 0.05, chestFortune: 1 },
    maxLevel: MAX_LEVEL,
    shardPrice: 3200,
    requiredRankOrder: 2,
    ability: "arcane-surge",
  },
  {
    key: "magic-arcane-blade",
    slot: "WEAPON",
    weaponClass: "MAGIC_SWORD",
    rarity: "EPIC",
    nameEn: "Arcane Blade",
    nameFr: "Lame Arcanique",
    descEn: "The runes rearrange when nobody is reading them.",
    descFr: "Les runes se réordonnent quand personne ne les lit.",
    icon: "magic-sword",
    base: { shardBonus: 0.14, scoreBonus: 0.08, chestFortune: 1 },
    maxLevel: MAX_LEVEL,
    shardPrice: 8500,
    requiredRankOrder: 3,
    ability: "arcane-surge",
  },
  {
    key: "magic-royal-arcane",
    slot: "WEAPON",
    weaponClass: "MAGIC_SWORD",
    rarity: "MYTHIC",
    nameEn: "Royal Arcane Sword",
    nameFr: "Épée Arcanique Royale",
    descEn: "Blue fire along gold. The Kingdom's own answer.",
    descFr: "Feu bleu le long de l'or. La réponse même du Royaume.",
    icon: "magic-sword",
    base: { shardBonus: 0.18, scoreBonus: 0.11, chestFortune: 1 },
    maxLevel: MAX_LEVEL,
    shardPrice: 20000,
    requiredRankOrder: 4,
    ability: "arcane-surge",
  },
  {
    key: "magic-vault-sword",
    slot: "WEAPON",
    weaponClass: "MAGIC_SWORD",
    rarity: "MYTHIC",
    nameEn: "Vault Magic Sword",
    nameFr: "Épée Magique du Vault",
    descEn: "It is warm. Keepers are told not to ask why.",
    descFr: "Elle est tiède. On dit aux Gardiens de ne pas demander pourquoi.",
    icon: "magic-sword",
    base: { shardBonus: 0.16, scoreBonus: 0.14, chestFortune: 2 },
    maxLevel: MAX_LEVEL,
    shardPrice: 24000,
    requiredRankOrder: 4,
    ability: "arcane-surge",
  },
  {
    key: "magic-celestial-blade",
    slot: "WEAPON",
    weaponClass: "MAGIC_SWORD",
    rarity: "LEGENDARY",
    nameEn: "Legendary Celestial Blade",
    nameFr: "Lame Céleste Légendaire",
    descEn: "Oria has seen this blade before. She has not said where.",
    descFr: "Oria a déjà vu cette lame. Elle n'a pas dit où.",
    icon: "magic-sword",
    base: { shardBonus: 0.22, scoreBonus: 0.16, chestFortune: 2 },
    maxLevel: MAX_LEVEL,
    shardPrice: 52000,
    requiredRankOrder: 5,
    ability: "arcane-surge",
  },

  // --- ARMOR · protects the combo -----------------------------------------
  {
    key: "armor-guardian-mail",
    slot: "ARMOR",
    rarity: "UNCOMMON",
    nameEn: "Guardian Mail",
    nameFr: "Cotte du Gardien",
    descEn: "Leather and iron thread. Quiet when you move.",
    descFr: "Cuir et fil de fer. Silencieuse quand on bouge.",
    icon: "stone",
    base: { comboGuard: 1, shardBonus: 0.04 },
    maxLevel: MAX_LEVEL,
    shardPrice: 1100,
    requiredRankOrder: 1,
  },
  {
    key: "armor-royal-cuirass",
    slot: "ARMOR",
    rarity: "RARE",
    nameEn: "Royal Cuirass",
    nameFr: "Cuirasse Royale",
    descEn: "Gilded at the seams, where nobody looks.",
    descFr: "Dorée aux coutures, là où nul ne regarde.",
    icon: "stone",
    base: { comboGuard: 1, shardBonus: 0.07 },
    maxLevel: MAX_LEVEL,
    shardPrice: 3000,
    requiredRankOrder: 2,
  },
  {
    key: "armor-keeper-plate",
    slot: "ARMOR",
    rarity: "EPIC",
    nameEn: "Keeper's Plate",
    nameFr: "Plastron du Gardien du Vault",
    descEn: "Set with a crystal that dims when the Vault is displeased.",
    descFr: "Serti d'un cristal qui pâlit quand le Vault est contrarié.",
    icon: "stone",
    base: { comboGuard: 2, shardBonus: 0.1 },
    maxLevel: MAX_LEVEL,
    shardPrice: 8200,
    requiredRankOrder: 3,
  },

  // --- CLOAKS · experience -------------------------------------------------
  {
    key: "cloak-traveller",
    slot: "CLOAK",
    rarity: "COMMON",
    nameEn: "Traveller's Cloak",
    nameFr: "Cape du Voyageur",
    descEn: "Frayed at the hem. It has been somewhere.",
    descFr: "Effrangée à l'ourlet. Elle a été quelque part.",
    icon: "velvet",
    base: { xpBonus: 0.03 },
    maxLevel: MAX_LEVEL,
    shardPrice: 320,
    requiredRankOrder: 0,
  },
  {
    key: "cloak-royal-velvet",
    slot: "CLOAK",
    rarity: "RARE",
    nameEn: "Royal Velvet Cloak",
    nameFr: "Cape de Velours Royal",
    descEn: "Deep blue, gold thread, worn only inside the walls.",
    descFr: "Bleu profond, fil d'or, portée seulement à l'intérieur des murs.",
    icon: "velvet",
    base: { xpBonus: 0.07 },
    maxLevel: MAX_LEVEL,
    shardPrice: 2900,
    requiredRankOrder: 2,
  },
  {
    key: "cloak-vault-mantle",
    slot: "CLOAK",
    rarity: "MYTHIC",
    nameEn: "Mantle of the Vault",
    nameFr: "Manteau du Vault",
    descEn: "The blue light collects in its folds and stays there.",
    descFr: "La lumière bleue s'amasse dans ses plis et y reste.",
    icon: "velvet",
    base: { xpBonus: 0.13, shardBonus: 0.05 },
    maxLevel: MAX_LEVEL,
    shardPrice: 19000,
    requiredRankOrder: 4,
  },

  // --- RELICS · richer chests ----------------------------------------------
  {
    key: "relic-ember",
    slot: "RELIC",
    rarity: "UNCOMMON",
    nameEn: "Ember Reliquary",
    nameFr: "Reliquaire de Braise",
    descEn: "Warm to hold. It makes chests more generous.",
    descFr: "Tiède en main. Il rend les coffres plus généreux.",
    icon: "core",
    base: { chestFortune: 1 },
    maxLevel: MAX_LEVEL,
    shardPrice: 1400,
    requiredRankOrder: 1,
  },
  {
    key: "relic-sapphire",
    slot: "RELIC",
    rarity: "EPIC",
    nameEn: "Sapphire Reliquary",
    nameFr: "Reliquaire de Saphir",
    descEn: "Sealed. Something inside moves when the lid does.",
    descFr: "Scellé. Quelque chose bouge dedans quand le couvercle bouge.",
    icon: "core",
    base: { chestFortune: 1, shardBonus: 0.08 },
    maxLevel: MAX_LEVEL,
    shardPrice: 8800,
    requiredRankOrder: 3,
  },
  {
    key: "relic-crown",
    slot: "RELIC",
    rarity: "LEGENDARY",
    nameEn: "Crown Reliquary",
    nameFr: "Reliquaire de la Couronne",
    descEn: "Only Legends are handed one, and only once.",
    descFr: "Seules les Légendes en reçoivent un, et une seule fois.",
    icon: "crown",
    base: { chestFortune: 2, shardBonus: 0.12, xpBonus: 0.06 },
    maxLevel: MAX_LEVEL,
    shardPrice: 48000,
    requiredRankOrder: 5,
  },

  // --- ACCESSORIES · timing ------------------------------------------------
  {
    key: "accessory-iron-band",
    slot: "ACCESSORY",
    rarity: "COMMON",
    nameEn: "Iron Band",
    nameFr: "Anneau de Fer",
    descEn: "Steadies the hand. Barely, but measurably.",
    descFr: "Stabilise la main. À peine, mais mesurablement.",
    icon: "thread",
    base: { precisionMs: 8 },
    maxLevel: MAX_LEVEL,
    shardPrice: 340,
    requiredRankOrder: 0,
  },
  {
    key: "accessory-gilded-band",
    slot: "ACCESSORY",
    rarity: "RARE",
    nameEn: "Gilded Band",
    nameFr: "Anneau Doré",
    descEn: "Guardians tap it once before a difficult run.",
    descFr: "Les Gardiens le tapotent une fois avant une session difficile.",
    icon: "gold",
    base: { precisionMs: 14, scoreBonus: 0.04 },
    maxLevel: MAX_LEVEL,
    shardPrice: 3100,
    requiredRankOrder: 2,
  },
  {
    key: "accessory-starlit-band",
    slot: "ACCESSORY",
    rarity: "MYTHIC",
    nameEn: "Starlit Band",
    nameFr: "Anneau Étoilé",
    descEn: "Cut from the night the Vault roof was open.",
    descFr: "Taillé dans la nuit où le toit du Vault fut ouvert.",
    icon: "sigil",
    base: { precisionMs: 24, scoreBonus: 0.08 },
    maxLevel: MAX_LEVEL,
    shardPrice: 19500,
    requiredRankOrder: 4,
  },
];

export const EQUIPMENT_BY_KEY: Record<string, EquipmentDefinition> = Object.fromEntries(
  EQUIPMENT.map((e) => [e.key, e]),
);

export const SLOTS: EquipSlot[] = ["WEAPON", "ARMOR", "RELIC", "CLOAK", "ACCESSORY"];

export const WEAPON_CLASSES: WeaponClass[] = ["SCEPTER", "BOW", "SWORD", "MAGIC_SWORD"];

/** Granted free on account creation, so the Loadout is never an empty room. */
export const STARTER_EQUIPMENT = ["scepter-wanderer"];

/** Combines the statistics of every equipped piece. */
export function sumStats(list: EquipStats[]): Required<EquipStats> {
  const total: Required<EquipStats> = {
    xpBonus: 0,
    shardBonus: 0,
    scoreBonus: 0,
    precisionMs: 0,
    comboGuard: 0,
    chestFortune: 0,
  };
  for (const stats of list) {
    for (const [key, value] of Object.entries(stats) as [keyof EquipStats, number][]) {
      total[key] += value;
    }
  }
  return total;
}

/**
 * Hard ceilings, so no combination of gear, levels and boosters can break the
 * economy or trivialise the mini-game. Gear should feel powerful, never absolute.
 */
export const STAT_CAPS: Required<EquipStats> = {
  xpBonus: 0.6,
  shardBonus: 0.6,
  scoreBonus: 0.6,
  precisionMs: 90,
  comboGuard: 4,
  chestFortune: 3,
};

export function capStats(stats: Required<EquipStats>): Required<EquipStats> {
  return {
    xpBonus: Math.min(stats.xpBonus, STAT_CAPS.xpBonus),
    shardBonus: Math.min(stats.shardBonus, STAT_CAPS.shardBonus),
    scoreBonus: Math.min(stats.scoreBonus, STAT_CAPS.scoreBonus),
    precisionMs: Math.min(stats.precisionMs, STAT_CAPS.precisionMs),
    comboGuard: Math.min(stats.comboGuard, STAT_CAPS.comboGuard),
    chestFortune: Math.min(stats.chestFortune, STAT_CAPS.chestFortune),
  };
}
