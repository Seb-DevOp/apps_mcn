/**
 * MCN — THE VAULT · idle progression
 *
 * A cat walks deeper into the Vault on its own. Five chambers, then a Guardian
 * of that floor, then five more. Gold accrues whether or not anyone is watching,
 * equipment drops, and better equipment means deeper floors.
 *
 * The whole game is a pure function of (state, elapsed seconds). Nothing ticks on
 * a timer anywhere: progress is computed when it is asked for. That is what makes
 * offline progress fall out for free, and it is also what makes the game
 * cheat-proof — the client cannot claim time it did not spend, because the server
 * reads the clock.
 */

export type Slot = "HEAD" | "SHOULDERS" | "CHEST" | "HANDS" | "LEGS" | "TRINKET";

export const SLOTS: Slot[] = ["HEAD", "SHOULDERS", "CHEST", "HANDS", "LEGS", "TRINKET"];

export type Rarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "MYTHIC" | "LEGENDARY";

export const RARITIES: Rarity[] = [
  "COMMON",
  "UNCOMMON",
  "RARE",
  "EPIC",
  "MYTHIC",
  "LEGENDARY",
];

/** How much a rarity multiplies an item's numbers. */
export const RARITY_MULTIPLIER: Record<Rarity, number> = {
  COMMON: 1,
  UNCOMMON: 1.35,
  RARE: 1.8,
  EPIC: 2.5,
  MYTHIC: 3.4,
  LEGENDARY: 4.6,
};

// ---------------------------------------------------------------------------
// The floor structure: five chambers, then a Guardian
// ---------------------------------------------------------------------------

export const LEVELS_PER_FLOOR = 6;
export const BOSS_POSITION = 6;

export interface LevelInfo {
  /** Global level number, starting at 1 and never resetting. */
  level: number;
  /** Which floor of the Vault, starting at 1. */
  floor: number;
  /** 1..6 within the floor. */
  position: number;
  isBoss: boolean;
  enemyHp: number;
  /** Damage the enemy deals per second. The cat can lose. */
  enemyDamage: number;
  goldReward: number;
}

/**
 * Enemy strength and reward both grow geometrically, but reward grows slightly
 * slower than health. That gap is the whole tension of an idle game: raw progress
 * stalls, and upgrading is what unsticks it.
 */
const HP_BASE = 12;
const HP_GROWTH = 1.19;
const GOLD_BASE = 4;
const GOLD_GROWTH = 1.16;
const BOSS_HP_MULTIPLIER = 7;
const BOSS_GOLD_MULTIPLIER = 9;

/**
 * Enemies hit back.
 *
 * Without this the game has no failure state at all: watching the clock would be
 * a winning strategy, and nothing the player buys would ever be the difference
 * between passing and not passing. Damage grows a little slower than enemy health
 * so that raw power stalls first and survival stalls second — two different walls
 * asking for two different purchases.
 */
const DMG_BASE = 0.9;
const DMG_GROWTH = 1.152;
const BOSS_DMG_MULTIPLIER = 1.7;

export function levelInfo(level: number): LevelInfo {
  const n = Math.max(1, Math.floor(level));
  const floor = Math.floor((n - 1) / LEVELS_PER_FLOOR) + 1;
  const position = ((n - 1) % LEVELS_PER_FLOOR) + 1;
  const isBoss = position === BOSS_POSITION;

  const hp = HP_BASE * Math.pow(HP_GROWTH, n - 1) * (isBoss ? BOSS_HP_MULTIPLIER : 1);
  const gold = GOLD_BASE * Math.pow(GOLD_GROWTH, n - 1) * (isBoss ? BOSS_GOLD_MULTIPLIER : 1);
  const damage = DMG_BASE * Math.pow(DMG_GROWTH, n - 1) * (isBoss ? BOSS_DMG_MULTIPLIER : 1);

  return {
    level: n,
    floor,
    position,
    isBoss,
    enemyHp: Math.round(hp),
    enemyDamage: Math.round(damage * 10) / 10,
    goldReward: Math.round(gold),
  };
}

/** A floor is only cleared once its Guardian falls. */
export function floorOf(level: number): number {
  return levelInfo(level).floor;
}

/** The first chamber of the floor a level belongs to — where a beaten cat wakes up. */
export function floorStart(level: number): number {
  return (floorOf(level) - 1) * LEVELS_PER_FLOOR + 1;
}

// ---------------------------------------------------------------------------
// Upgrades: the gold sink
// ---------------------------------------------------------------------------

export type UpgradeKey =
  | "attack"
  | "health"
  | "speed"
  | "crit"
  | "critDamage"
  | "double";

export interface UpgradeDef {
  key: UpgradeKey;
  nameEn: string;
  nameFr: string;
  descEn: string;
  descFr: string;
  baseCost: number;
  costGrowth: number;
  /** What one level adds. Interpreted by `derive`. */
  perLevel: number;
  /** Where the upgrade stops, for the ones that would break the game uncapped. */
  maxLevel?: number;
  /** Which side of the fight it changes — used to compare like with like. */
  axis: "OFFENCE" | "SURVIVAL";
  icon: string;
}

/**
 * Six statistics, and one rule about them.
 *
 * Damage per second is a product, not a sum:
 *
 *   dps = damage × speed × (1 + crit × (critDamage − 1)) × (1 + double)
 *
 * which means "as strong as each other" has an exact meaning. For an upgrade
 * whose level n multiplies its factor by m and whose level n costs base·c^n, the
 * multiplier bought with a budget G is (G/base)^(ln m / ln c). That exponent —
 * and nothing else — decides how strong an upgrade is in the long run, so two
 * uncapped upgrades are equal exactly when their ln m / ln c match.
 *
 * Attack and Critical Damage are the two uncapped offence stats and share an
 * exponent of ~0.14. Health answers a different curve (incoming damage grows at
 * 1.17 per level, enemy health at 1.19) so it is matched against that instead —
 * being "equal" to Attack would leave the cat unable to survive what it can
 * already kill.
 *
 * Speed, Critical Chance and Double Strike are capped: each buys a bounded total
 * multiplier, so they cannot change the long-run curve at all. They are priced so
 * that the whole ladder costs about what the same multiplier costs on Attack —
 * which makes them the better purchase early, and finished later. That is a shape,
 * not an advantage, and `npm run balance` checks that every one of the six is the
 * best buy at some point rather than a trap nobody should ever take.
 */
export const UPGRADES: UpgradeDef[] = [
  {
    key: "attack",
    nameEn: "Attack",
    nameFr: "Attaque",
    descEn: "×1.10 damage per hit, per level. Never stops being worth it.",
    descFr: "×1,10 de dégâts par coup et par niveau. Ne cesse jamais de payer.",
    baseCost: 30,
    costGrowth: 2,
    perLevel: 0.1,
    axis: "OFFENCE",
    icon: "sword",
  },
  {
    key: "health",
    nameEn: "Health",
    nameFr: "Points de Vie",
    descEn: "×1.12 health per level. The only answer to a Guardian that hits hard.",
    descFr: "×1,12 de vie par niveau. La seule réponse à un Gardien qui frappe fort.",
    baseCost: 40,
    costGrowth: 1.46,
    perLevel: 0.12,
    axis: "SURVIVAL",
    icon: "velvet",
  },
  {
    key: "speed",
    nameEn: "Attack Speed",
    nameFr: "Vitesse",
    descEn: "+0.1 attacks per second. From one blow a second up to five.",
    descFr: "+0,1 attaque par seconde. D'un coup par seconde jusqu'à cinq.",
    baseCost: 45,
    costGrowth: 1.36,
    perLevel: 0.1,
    maxLevel: 40,
    axis: "OFFENCE",
    icon: "boost-xp",
  },
  {
    key: "crit",
    nameEn: "Critical Chance",
    nameFr: "Chance Critique",
    descEn: "+1.5% chance to strike critically. Worthless without critical damage.",
    descFr: "+1,5 % de chance de coup critique. Sans intérêt sans dégâts critiques.",
    baseCost: 25,
    costGrowth: 1.27,
    perLevel: 0.015,
    maxLevel: 45,
    axis: "OFFENCE",
    icon: "aura",
  },
  {
    key: "critDamage",
    nameEn: "Critical Damage",
    nameFr: "Dégâts Critiques",
    descEn: "×1.08 on a critical hit, per level. Grows with how often you crit.",
    descFr: "×1,08 sur un coup critique, par niveau. Vaut ce que vaut ta chance critique.",
    baseCost: 150,
    costGrowth: 1.78,
    perLevel: 0.08,
    axis: "OFFENCE",
    icon: "legend",
  },
  {
    key: "double",
    nameEn: "Double Strike",
    nameFr: "Double Coup",
    descEn: "+2% chance the blow lands twice. Doubles the critical with it.",
    descFr: "+2 % de chance que le coup parte deux fois. Double aussi le critique.",
    baseCost: 60,
    costGrowth: 1.33,
    perLevel: 0.02,
    maxLevel: 45,
    axis: "OFFENCE",
    icon: "magic-sword",
  },
];

export const UPGRADE_BY_KEY: Record<string, UpgradeDef> = Object.fromEntries(
  UPGRADES.map((u) => [u.key, u]),
);

/** Cost of taking an upgrade from `level` to `level + 1`. */
export function upgradeCost(def: UpgradeDef, level: number): number {
  return Math.ceil(def.baseCost * Math.pow(def.costGrowth, level));
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export interface ItemStats {
  power: number;
  /** Health the piece adds. Armour is what turns a wall into a purchase. */
  vitality: number;
  goldBonus: number;
}

/**
 * Items are generated rather than hand-listed.
 *
 * An idle game has no last floor, so a fixed catalogue would run out. Deriving
 * an item from (slot, floor, rarity) means floor 400 is as furnished as floor 4,
 * and no single drop can be accidentally out of line with its neighbours.
 */
const SLOT_POWER_SHARE: Record<Slot, number> = {
  HEAD: 0.9,
  SHOULDERS: 0.85,
  CHEST: 1.25,
  HANDS: 0.8,
  LEGS: 0.95,
  TRINKET: 0.7,
};

/** Plate protects more than a bracelet does, and the chest protects most. */
const SLOT_VITALITY_SHARE: Record<Slot, number> = {
  HEAD: 1,
  SHOULDERS: 0.9,
  CHEST: 1.6,
  HANDS: 0.6,
  LEGS: 1.2,
  TRINKET: 0.5,
};

const SLOT_GOLD_SHARE: Record<Slot, number> = {
  HEAD: 0,
  SHOULDERS: 0,
  CHEST: 0,
  HANDS: 0.02,
  LEGS: 0,
  TRINKET: 0.06,
};

export function itemStats(slot: Slot, floor: number, rarity: Rarity): ItemStats {
  // Enemy health multiplies by roughly 2.8 per floor, so equipment that grew at
  // 1.34 fell behind immediately and every wall became permanent. It grows nearly
  // as fast as the Vault now: gear alone almost keeps up, and the upgrades are
  // what close the remaining gap.
  const scale = Math.pow(1.75, Math.max(0, floor - 1));
  const multiplier = RARITY_MULTIPLIER[rarity];
  return {
    power: Math.max(1, Math.round(6 * SLOT_POWER_SHARE[slot] * scale * multiplier)),
    vitality: Math.max(1, Math.round(11 * SLOT_VITALITY_SHARE[slot] * scale * multiplier)),
    goldBonus: Math.round(SLOT_GOLD_SHARE[slot] * multiplier * 100) / 100,
  };
}

/**
 * The drawing used for this piece. Higher floors reach for grander shapes, so a
 * cat visibly changes silhouette as it descends rather than only changing colour.
 */
export const SLOT_SHAPES: Record<Slot, string[]> = {
  HEAD: ["band", "cap", "helm", "horned", "crowned"],
  SHOULDERS: ["pads", "plates", "spiked", "winged", "regal"],
  CHEST: ["tunic", "mail", "plate", "runed", "royal"],
  HANDS: ["wraps", "bracers", "gauntlets", "clawed", "arcane"],
  LEGS: ["cloth", "greaves", "plated", "runed", "royal"],
  TRINKET: ["cord", "pendant", "gem", "sigil", "crown"],
};

export function shapeFor(slot: Slot, floor: number): string {
  const shapes = SLOT_SHAPES[slot];
  const index = Math.min(shapes.length - 1, Math.floor((floor - 1) / 3));
  return shapes[index];
}

/**
 * French carries gender and number on the adjective, so a name cannot be built by
 * concatenation alone: "Bandes Usé" is wrong where "Bandes Usées" is right. Each
 * French noun therefore travels with its own agreement, and the qualifier picks
 * the matching form. English needs none of this and keeps a plain list.
 */
type Agreement = "ms" | "fs" | "mp" | "fp";

const SLOT_NAMES: Record<Slot, { en: string[]; fr: [string, Agreement][] }> = {
  HEAD: {
    en: ["Headband", "Cap", "Helm", "Horned Helm", "Crowned Helm"],
    fr: [
      ["Bandeau", "ms"],
      ["Coiffe", "fs"],
      ["Heaume", "ms"],
      ["Heaume Cornu", "ms"],
      ["Heaume Couronné", "ms"],
    ],
  },
  SHOULDERS: {
    en: ["Pads", "Pauldrons", "Spiked Pauldrons", "Winged Pauldrons", "Regal Pauldrons"],
    fr: [
      ["Épaulières", "fp"],
      ["Spallières", "fp"],
      ["Spallières à Pointes", "fp"],
      ["Spallières Ailées", "fp"],
      ["Spallières Royales", "fp"],
    ],
  },
  CHEST: {
    en: ["Tunic", "Mail", "Breastplate", "Runed Plate", "Royal Cuirass"],
    fr: [
      ["Tunique", "fs"],
      ["Cotte de Mailles", "fs"],
      ["Plastron", "ms"],
      ["Plastron Runique", "ms"],
      ["Cuirasse Royale", "fs"],
    ],
  },
  HANDS: {
    en: ["Wraps", "Bracers", "Gauntlets", "Clawed Gauntlets", "Arcane Gauntlets"],
    fr: [
      ["Bandes", "fp"],
      ["Brassards", "mp"],
      ["Gantelets", "mp"],
      ["Gantelets Griffus", "mp"],
      ["Gantelets Arcaniques", "mp"],
    ],
  },
  LEGS: {
    en: ["Leggings", "Greaves", "Plated Greaves", "Runed Greaves", "Royal Greaves"],
    fr: [
      ["Jambières", "fp"],
      ["Grèves", "fp"],
      ["Grèves Plaquées", "fp"],
      ["Grèves Runiques", "fp"],
      ["Grèves Royales", "fp"],
    ],
  },
  TRINKET: {
    en: ["Cord", "Pendant", "Gemstone", "Sigil", "Crown Jewel"],
    fr: [
      ["Cordon", "ms"],
      ["Pendentif", "ms"],
      ["Gemme", "fs"],
      ["Sceau", "ms"],
      ["Joyau de Couronne", "ms"],
    ],
  },
};

/**
 * The four agreed forms, or a single invariable string for the qualifiers that
 * are really nouns in disguise ("du Gardien" never changes shape).
 */
const RARITY_QUALIFIER: Record<Rarity, { en: string; fr: Record<Agreement, string> | string }> = {
  COMMON: { en: "Worn", fr: { ms: "Usé", fs: "Usée", mp: "Usés", fp: "Usées" } },
  UNCOMMON: { en: "Guardian", fr: "du Gardien" },
  // Deliberately not "Royal": the deepest pieces are already named Royale, and a
  // "Cuirasse Royale Royale" is nobody's idea of a reward.
  RARE: { en: "Noble", fr: { ms: "Noble", fs: "Noble", mp: "Nobles", fp: "Nobles" } },
  EPIC: {
    en: "Arcane",
    fr: { ms: "Arcanique", fs: "Arcanique", mp: "Arcaniques", fp: "Arcaniques" },
  },
  MYTHIC: { en: "Vault", fr: "du Vault" },
  LEGENDARY: {
    en: "Celestial",
    fr: { ms: "Céleste", fs: "Céleste", mp: "Célestes", fp: "Célestes" },
  },
};

export function itemName(slot: Slot, floor: number, rarity: Rarity, locale: string) {
  const index = Math.min(SLOT_NAMES[slot].en.length - 1, Math.floor((floor - 1) / 3));

  if (locale !== "fr") {
    return `${RARITY_QUALIFIER[rarity].en} ${SLOT_NAMES[slot].en[index]}`;
  }

  const [base, agreement] = SLOT_NAMES[slot].fr[index];
  const qualifier = RARITY_QUALIFIER[rarity].fr;
  // French puts the qualifier after the noun, and agrees it with that noun.
  return `${base} ${typeof qualifier === "string" ? qualifier : qualifier[agreement]}`;
}

// ---------------------------------------------------------------------------
// Drops
// ---------------------------------------------------------------------------

/** Base chance that an ordinary enemy leaves something. Bosses always do. */
export const BASE_DROP_CHANCE = 0.11;

/**
 * Rarity odds, by how far past its floor the drop is. Deeper floors do not make
 * common items rarer so much as they make great ones possible.
 */
export function rarityWeights(floor: number): { rarity: Rarity; weight: number }[] {
  const depth = Math.max(0, floor - 1);
  return [
    { rarity: "COMMON", weight: Math.max(8, 60 - depth * 3) },
    { rarity: "UNCOMMON", weight: 25 },
    { rarity: "RARE", weight: Math.min(30, 10 + depth * 1.5) },
    { rarity: "EPIC", weight: Math.min(20, 3 + depth * 1.1) },
    { rarity: "MYTHIC", weight: Math.min(12, depth * 0.6) },
    { rarity: "LEGENDARY", weight: Math.min(6, depth * 0.25) },
  ];
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/**
 * How much absence is paid out.
 *
 * Twelve hours is the usual idle compromise: long enough that a night's sleep is
 * fully rewarded, short enough that the game still asks to be opened. Anything
 * beyond it is simply not accrued, and the screen says so rather than pretending.
 */
export const OFFLINE_CAP_SECONDS = 12 * 3600;

/** A kill can never resolve faster than this, however strong the cat gets. */
export const MIN_KILL_SECONDS = 0.2;

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------

/** A bare cat, before anything is worn or bought. */
export const BASE_MAX_HP = 60;
export const BASE_ATTACK_DAMAGE = 5;
export const BASE_ATTACK_SPEED = 1;
export const BASE_CRIT_CHANCE = 0.05;
export const BASE_CRIT_MULTIPLIER = 2;
export const BASE_DOUBLE_CHANCE = 0;

/**
 * Healing is a share of total health, not a flat number.
 *
 * A flat rate is worthless by floor ten — enemy damage is exponential and a
 * constant is not — so the cat would heal 1.5 a second against blows of four
 * thousand. As a share, healing inherits every point of health the player buys or
 * finds, and stays meaningful at any depth.
 */
export const BASE_REGEN_SHARE = 0.02;


/**
 * How long the cat lies down after losing, before picking itself up at the start
 * of the floor. Not only flavour: it stops a hopeless fight from re-running
 * thousands of times inside one tick at almost no cost in time.
 */
export const RECOVERY_SECONDS = 4;

/**
 * Blows land on a beat rather than as a continuous drain.
 *
 * The maths stays continuous — a fight is still resolved in closed form — but
 * both sides *show* discrete hits at these intervals, with the per-blow damage
 * derived from the same rate. Identical average, legible fight.
 */
export const ATTACK_INTERVAL = 0.75;
export const ENEMY_ATTACK_INTERVAL = 1.05;
