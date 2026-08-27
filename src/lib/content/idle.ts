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

/**
 * Eight tiers, read by colour before they are read by name: grey, green, blue,
 * violet, orange, red, diamond, and the one above them.
 *
 * The top two do not exist for a new cat. They are what a life brings back —
 * the odds below open them as rebirths accumulate, so the ladder is a reason to
 * spend a life rather than a list that was always there.
 */
export type Rarity =
  | "COMMON"
  | "UNCOMMON"
  | "RARE"
  | "EPIC"
  | "MYTHIC"
  | "LEGENDARY"
  | "DIAMOND"
  | "SOVEREIGN"
  | "ASTRAL"
  | "ORIGIN";

export const RARITIES: Rarity[] = [
  "COMMON",
  "UNCOMMON",
  "RARE",
  "EPIC",
  "MYTHIC",
  "LEGENDARY",
  "DIAMOND",
  "SOVEREIGN",
  "ASTRAL",
  "ORIGIN",
];

/** How much a rarity multiplies an item's numbers. */
export const RARITY_MULTIPLIER: Record<Rarity, number> = {
  COMMON: 1,
  UNCOMMON: 1.35,
  RARE: 1.8,
  EPIC: 2.5,
  MYTHIC: 3.4,
  LEGENDARY: 4.6,
  DIAMOND: 6.2,
  SOVEREIGN: 8.4,
  ASTRAL: 11.3,
  ORIGIN: 15.3,
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
/**
 * A floor costs what it always cost. The Guardian now owns almost all of it.
 *
 * The five ordinary chambers used to be three tenths of a floor's health, which
 * at depth is minutes each — long fights against things that were never the
 * point. They are 35 % of what they were, and the Guardian absorbs exactly what
 * they gave up: a floor is the same climb, spent almost entirely on the one
 * enemy that is supposed to stop you. Gold per kill is untouched, so income per
 * floor is untouched with it.
 */
const HP_BASE = 4.2;
const HP_GROWTH = 1.19;
const GOLD_BASE = 4;
const GOLD_GROWTH = 1.16;
const BOSS_HP_MULTIPLIER = 26;
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
 * Attack, Attack Speed and Critical Damage are the three uncapped offence stats.
 * They share an exponent of ~0.09 each, summing to the ~0.27 the pacing needs:
 * adding a third uncapped multiplier without lowering all three would have made
 * progress accelerate instead of decelerate, and an idle game whose floors get
 * cheaper is over.
 *
 * Health answers a different curve (incoming damage grows at 1.152 per level,
 * enemy health at 1.19) so it is matched against that instead — being "equal" to
 * Attack would leave the cat unable to survive what it can already kill.
 *
 * Only Critical Chance stops, and not by choice: it is a probability, and 100% is
 * arithmetic rather than a design decision. Its maximum level is exactly the one
 * that reaches certainty, so nothing is ever sold that does nothing.
 *
 * Double Strike deliberately keeps going past 100%: beyond certainty each whole
 * point is one more guaranteed blow. Its effect is linear in levels bought, which
 * is logarithmic in gold, so it stays worth buying for ever without disturbing
 * the long-run curve the three exponentials set.
 *
 * `npm run balance` checks that every one of the six is the best buy at some
 * point rather than a trap nobody should ever take.
 */
export const UPGRADES: UpgradeDef[] = [
  {
    key: "attack",
    nameEn: "Attack",
    nameFr: "Attaque",
    descEn: "×1.10 damage",
    descFr: "×1,10 dégâts",
    baseCost: 30,
    costGrowth: 2.88,
    perLevel: 0.1,
    axis: "OFFENCE",
    icon: "sword",
  },
  {
    key: "health",
    nameEn: "Health",
    nameFr: "Points de Vie",
    descEn: "×1.12 health",
    descFr: "×1,12 vie",
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
    descEn: "×1.06 attacks/s",
    descFr: "×1,06 attaques/s",
    baseCost: 45,
    costGrowth: 1.91,
    perLevel: 0.06,
    axis: "OFFENCE",
    icon: "boost-xp",
  },
  {
    key: "crit",
    nameEn: "Critical Chance",
    nameFr: "Chance Critique",
    descEn: "+1% crit chance",
    descFr: "+1 % critique",
    baseCost: 25,
    costGrowth: 1.27,
    perLevel: 0.01,
    // Ninety-five, not a round hundred: the cat starts at 5 %, so 95 levels of
    // one point is exactly the level that reaches certainty. Levels past that
    // would take gold and change nothing, which is the one thing an upgrade
    // must never do.
    maxLevel: 95,
    axis: "OFFENCE",
    icon: "aura",
  },
  {
    key: "critDamage",
    nameEn: "Critical Damage",
    nameFr: "Dégâts Critiques",
    descEn: "×1.08 critical damage",
    descFr: "×1,08 dégâts critiques",
    baseCost: 150,
    costGrowth: 2.35,
    perLevel: 0.08,
    axis: "OFFENCE",
    icon: "legend",
  },
  {
    key: "double",
    nameEn: "Double Strike",
    nameFr: "Double Coup",
    descEn: "+2% double strike",
    descFr: "+2 % coup double",
    baseCost: 60,
    costGrowth: 1.55,
    perLevel: 0.02,
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
  // Deliberately not "Royal": the highest pieces are already named Royale, and a
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
  DIAMOND: { en: "Adamant", fr: { ms: "Adamantin", fs: "Adamantine", mp: "Adamantins", fp: "Adamantines" } },
  SOVEREIGN: { en: "Sovereign", fr: "du Souverain" },
  ASTRAL: { en: "Astral", fr: { ms: "Astral", fs: "Astrale", mp: "Astraux", fp: "Astrales" } },
  ORIGIN: { en: "Origin", fr: "de l'Origine" },
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
/**
 * Rarity odds, by depth and by lives spent.
 *
 * Depth has always opened the middle of the ladder. Lives open the top of it:
 * Diamond does not exist before the second rebirth and Sovereign before the
 * fourth, and every life after that shifts the whole distribution upward by
 * thinning the commons. That is what makes a rebirth change what the game *looks*
 * like rather than only how fast its numbers move.
 */
/** The life a rarity first becomes possible at. Below it, the weight is zero. */
const RARITY_UNLOCK: Record<Rarity, number> = {
  COMMON: 0,
  UNCOMMON: 0,
  RARE: 0,
  EPIC: 0,
  MYTHIC: 0,
  LEGENDARY: 0,
  DIAMOND: 2,
  SOVEREIGN: 4,
  ASTRAL: 6,
  ORIGIN: 8,
};

/** How wide the window is. Roughly three colours fall inside it at once. */
const RARITY_SPREAD = 2.3;

/**
 * Rarity odds: a window that slides up, not a set of ceilings.
 *
 * The old table capped the middle and thinned only the bottom, which meant the
 * mode parked on Rare for ever — a bag full of one colour at floor 30 and the
 * same bag full of the same colour at floor 300. Depth and lives now move the
 * *centre* of the distribution instead, so what fills the bag is always the
 * colour of the moment and every colour eventually stops dropping.
 *
 * Two tiers were added above Sovereign for the same reason: a window that keeps
 * sliding needs somewhere to slide to.
 */
export function rarityWeights(
  floor: number,
  rebirths = 0,
): { rarity: Rarity; weight: number }[] {
  const depth = Math.max(0, floor - 1);
  const lives = Math.max(0, rebirths);
  // Which rung of the ladder is the most common find right now.
  const centre = depth * 0.055 + lives * 0.25;

  return RARITIES.map((rarity, tier) => {
    if (lives < RARITY_UNLOCK[rarity]) return { rarity, weight: 0 };
    const distance = tier - centre;
    return {
      rarity,
      weight: 100 * Math.exp(-(distance * distance) / RARITY_SPREAD),
    };
  });
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

// ---------------------------------------------------------------------------
// How a rarity looks
// ---------------------------------------------------------------------------

/**
 * Colour is the fastest thing a player reads about a drop — before the name,
 * before the numbers. It lives here with the rarities themselves rather than in a
 * catalogue of items that the Descent no longer has.
 */
export const RARITY_STYLE: Record<Rarity, { color: string; glow: string }> = {
  COMMON: { color: "#9aa6bf", glow: "rgba(154,166,191,0.35)" },
  UNCOMMON: { color: "#69c39a", glow: "rgba(105,195,154,0.40)" },
  RARE: { color: "#4f93ff", glow: "rgba(79,147,255,0.50)" },
  EPIC: { color: "#a06bff", glow: "rgba(160,107,255,0.50)" },
  MYTHIC: { color: "#ff8f3d", glow: "rgba(255,143,61,0.55)" },
  LEGENDARY: { color: "#ff4d5e", glow: "rgba(255,77,94,0.60)" },
  DIAMOND: { color: "#8ef0ff", glow: "rgba(142,240,255,0.75)" },
  // The one above them all reads as gold rather than as another hue: a ladder
  // that ends on one more colour ends quietly.
  SOVEREIGN: { color: "#ffd76a", glow: "rgba(255,215,106,0.9)" },
  // Past gold there is nowhere left to go in hue, so the last two go in
  // brightness instead: white, then the one colour the ladder never used.
  ASTRAL: { color: "#f2f6ff", glow: "rgba(242,246,255,0.95)" },
  ORIGIN: { color: "#ff5ce0", glow: "rgba(255,92,224,0.95)" },
};

// ---------------------------------------------------------------------------
// Affixes: what makes one piece different from another
// ---------------------------------------------------------------------------

/**
 * A piece can carry bonuses to the same six statistics the shop sells.
 *
 * They are deliberately **not scaled by floor**. Power and vitality already grow
 * 1.75× per floor; a percentage that grew with depth as well would compound twice
 * and outrun the enemy curve within a few floors. As a flat multiplier on top of
 * an exponential, affixes are a ceiling the player approaches by collecting rather
 * than a second exponential — which is exactly what a chase should be.
 */
export type AffixKey = UpgradeKey;

export interface Affix {
  key: AffixKey;
  value: number;
}

/** How many bonuses a piece of this rarity carries. */
export const AFFIX_SLOTS: Record<Rarity, number> = {
  COMMON: 0,
  UNCOMMON: 1,
  RARE: 1,
  EPIC: 2,
  MYTHIC: 2,
  LEGENDARY: 3,
  DIAMOND: 4,
  SOVEREIGN: 5,
  // Six is the ceiling: there are six statistics, and two helpings of one on a
  // single piece read as one bigger number.
  ASTRAL: 6,
  ORIGIN: 6,
};

const AFFIX_SCALE: Record<Rarity, number> = {
  COMMON: 0,
  UNCOMMON: 1,
  RARE: 1.7,
  EPIC: 2.5,
  MYTHIC: 3.5,
  LEGENDARY: 5,
  DIAMOND: 6.8,
  SOVEREIGN: 9,
  ASTRAL: 12,
  ORIGIN: 16,
};

/**
 * Value of one bonus at scale 1. Percentages for the multiplying statistics,
 * absolute points for the two that are already probabilities.
 */
const AFFIX_BASE: Record<AffixKey, number> = {
  attack: 0.04,
  health: 0.04,
  speed: 0.03,
  crit: 0.015,
  critDamage: 0.05,
  double: 0.03,
};

/** Bonuses stack by addition across pieces, so a full set is a sum, not a product. */
export const AFFIX_KEYS: AffixKey[] = ["attack", "health", "speed", "crit", "critDamage", "double"];

export function affixValue(key: AffixKey, rarity: Rarity): number {
  return Math.round(AFFIX_BASE[key] * AFFIX_SCALE[rarity] * 1000) / 1000;
}

/** Which of the six a bonus reads as, and how it should be written. */
export function affixLabel(affix: Affix, locale: string): string {
  const def = UPGRADE_BY_KEY[affix.key];
  const name = locale === "fr" ? def.nameFr : def.nameEn;
  // All six read as percentages, because that is how the shop describes the same
  // statistics — "+2 % chance the blow lands twice" and "+0.02 extra strikes" are
  // the same number, and only one of them is a sentence. Critical Chance and
  // Double Strike keep a decimal: their steps are small enough that rounding to
  // whole points would print several different bonuses as the same figure, and a
  // bare "+3" alongside them reads as three whole blows rather than three percent.
  const fine = affix.key === "crit" || affix.key === "double";
  const written = fine
    ? `+${(affix.value * 100).toFixed(1)} %`
    : `+${Math.round(affix.value * 100)} %`;
  return `${written} ${name}`;
}

/** Parses the stored blob. A corrupt one means a plain item, never a crash. */
export function parseAffixes(json: string): Affix[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (entry): entry is Affix =>
          typeof entry === "object" &&
          entry !== null &&
          AFFIX_KEYS.includes((entry as Affix).key) &&
          Number.isFinite((entry as Affix).value),
      )
      .slice(0, 3);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Rebirth: the second arc
// ---------------------------------------------------------------------------

/**
 * A cat has nine lives, and the Vault takes them one at a time.
 *
 * The first arc decelerates by design — each floor costs more than the last —
 * which is what makes an idle game last, and also what eventually turns a wall
 * into an ending. Rebirth turns that wall into a decision instead: spend the run,
 * keep what it taught you, and start again stronger.
 *
 * Relics are granted on **record depth only**. Granting them per run would make
 * rebirthing at the shallowest allowed floor a farm, and a farm is the opposite
 * of a reason to push.
 */
export const REBIRTH_MIN_FLOOR = 15;

/**
 * Relics owed for a record depth.
 *
 * Exponential in the floor, and it has to be. A polynomial reward against an
 * exponential difficulty is the same mistake the additive upgrades made at the
 * start: measured over a week it left rebirth worth exactly one floor, because
 * what a life costs grows 2.84x per floor while what it paid grew like a square.
 *
 * 1.55 per floor stays comfortably under that 2.84, so relics shorten the climb
 * back without ever outrunning the Vault — each life is worth more than the last,
 * and none of them is worth the whole game.
 */
export function relicsForFloor(floor: number): number {
  if (floor < REBIRTH_MIN_FLOOR) return 0;
  return Math.floor(Math.pow(1.55, floor - REBIRTH_MIN_FLOOR + 1));
}

export type RelicKey = "memory" | "tenacity" | "greed" | "luck";

export interface RelicDef {
  key: RelicKey;
  nameEn: string;
  nameFr: string;
  /** What it acts on, so a screen can say "×2.65 damage" and not just "+15%". */
  unitEn: string;
  unitFr: string;
  descEn: string;
  descFr: string;
  baseCost: number;
  costGrowth: number;
  perLevel: number;
  maxLevel?: number;
  icon: string;
}

/**
 * What a life is worth once it is over.
 *
 * These survive every rebirth, which is the whole point: the gold upgrades reset
 * so there is something to spend gold on again, and these are what makes the next
 * run faster than the last.
 */
export const RELICS: RelicDef[] = [
  {
    key: "memory",
    nameEn: "Memory",
    nameFr: "Mémoire",
    unitEn: "damage",
    unitFr: "dégâts",
    descEn: "+15% damage",
    descFr: "+15 % dégâts",
    baseCost: 1,
    costGrowth: 1.35,
    perLevel: 0.15,
    icon: "core",
  },
  {
    key: "tenacity",
    nameEn: "Tenacity",
    nameFr: "Ténacité",
    unitEn: "health",
    unitFr: "vie",
    descEn: "+15% health",
    descFr: "+15 % vie",
    baseCost: 1,
    costGrowth: 1.35,
    perLevel: 0.15,
    icon: "velvet",
  },
  {
    key: "greed",
    nameEn: "Greed",
    nameFr: "Avidité",
    unitEn: "gold",
    unitFr: "or",
    descEn: "+25% gold",
    descFr: "+25 % or",
    baseCost: 2,
    costGrowth: 1.4,
    perLevel: 0.25,
    icon: "gold",
  },
  {
    key: "luck",
    nameEn: "Fortune",
    nameFr: "Chance",
    unitEn: "drop chance",
    unitFr: "de butin",
    descEn: "+3% drop chance",
    descFr: "+3 % de butin",
    baseCost: 3,
    costGrowth: 1.4,
    perLevel: 0.03,
    maxLevel: 21,
    icon: "key",
  },
];

export const RELIC_BY_KEY: Record<string, RelicDef> = Object.fromEntries(
  RELICS.map((relic) => [relic.key, relic]),
);

export function relicCost(def: RelicDef, level: number): number {
  return Math.ceil(def.baseCost * Math.pow(def.costGrowth, level));
}

// ---------------------------------------------------------------------------
// The two things a player can do with their hands
// ---------------------------------------------------------------------------

/**
 * Tapping the enemy hurts it.
 *
 * Worth a great deal in the first minutes, when the cat swings once a second,
 * and almost nothing by the time it swings twenty times — which is the right
 * shape. It gives a reason to open the app without ever becoming the reason to
 * keep it open, and it cannot outrun the idle curve because it is capped by how
 * fast a thumb moves.
 */
export const STRIKE_DAMAGE_MULTIPLIER = 2;
/** The server clamps to this, so a script gains nothing a fast tapper would not. */
export const MAX_STRIKES_PER_SECOND = 8;

/**
 * The Roar: twenty-five seconds of the cat's own damage, delivered at once.
 *
 * A share of current output rather than a fixed number, so it stays meaningful at
 * every depth without ever being the thing that clears a floor on its own.
 *
 * What matters is the ratio of these two numbers, not either alone: pressed on
 * every cooldown, the Roar adds `damage / cooldown` to sustained output. At sixty
 * seconds over a hundred and eighty it was adding a third of the cat's entire
 * damage for one tap every three minutes, which made an idle game reward sitting
 * on the screen. Fourteen per cent rewards attention without punishing absence.
 */
export const ROAR_COOLDOWN_SECONDS = 180;
export const ROAR_DAMAGE_SECONDS = 25;

// ---------------------------------------------------------------------------
// The ladder: what each life brings back
// ---------------------------------------------------------------------------

/**
 * Each rebirth asks for a deeper record than the last.
 *
 * Without this the record advances a little, a life is spent, and the whole
 * five-rung ladder is climbed in two days — which is the opposite of spreading
 * it. Twelve floors per rung puts the rungs at 15, 27, 39, 51 and 63 — measured, that
 * is about a week of uninterrupted idling for the fifth and rather longer for
 * anyone who sleeps. The requirement keeps growing afterwards, so late lives
 * stay rare too.
 */
/**
 * The ten rungs, written down rather than computed.
 *
 * A formula cannot say this shape. The first five are where they have always
 * been — twelve floors apart, the fifth a month of play — and the last five sit
 * four floors apart in the band where the climb slows to a crawl: measured, a
 * record reaches 51 on the first day, 64 in a week, 71 in a month and 80 in six.
 * Spacing the tail evenly with the head would have put the tenth rung at floor
 * 135, which no measured player reaches in a year.
 *
 * Past the tenth there is no rung left to buy, only relics, so the requirement
 * keeps stepping by four for anyone who wants to keep spending lives.
 */
const REBIRTH_FLOORS = [15, 27, 39, 51, 63, 74, 80, 86, 91, 96];

export function rebirthFloorFor(rebirths: number): number {
  const index = Math.max(0, Math.floor(rebirths));
  if (index < REBIRTH_FLOORS.length) return REBIRTH_FLOORS[index];
  return REBIRTH_FLOORS[REBIRTH_FLOORS.length - 1] + 4 * (index - REBIRTH_FLOORS.length + 1);
}

export type UnlockKey =
  | "flair"
  | "seals"
  | "breath"
  | "elites"
  | "pack"
  | "instinct"
  | "forge"
  | "rage"
  | "shortcut"
  | "horde";

export interface UnlockDef {
  key: UnlockKey;
  /** Lives that must have been spent before this exists. */
  rebirths: number;
  nameEn: string;
  nameFr: string;
  descEn: string;
  descFr: string;
  icon: string;
}

/**
 * Five rungs, each a system rather than a multiplier.
 *
 * A rebirth that only made numbers larger would be a chore with a ceremony
 * around it; one that hands over something the game could not do before is worth
 * spending a life on. After the fifth, rebirth keeps paying relics for ever —
 * stopping it would leave a single decelerating arc, which is the problem the
 * whole second arc exists to solve.
 */
export const UNLOCKS: UnlockDef[] = [
  {
    key: "flair",
    rebirths: 1,
    nameEn: "The Nose",
    nameFr: "Le Flair",
    descEn: "Anything below a rarity you choose sells itself as it drops.",
    descFr: "Tout ce qui tombe sous une rareté choisie se vend tout seul.",
    icon: "gold",
  },
  {
    key: "seals",
    rebirths: 2,
    nameEn: "The Seals",
    nameFr: "Les Sceaux",
    descEn: "Worn pieces that share a rarity strengthen each other.",
    descFr: "Les pièces portées qui partagent une rareté se renforcent entre elles.",
    icon: "sigil",
  },
  {
    key: "breath",
    rebirths: 3,
    nameEn: "The Breath",
    nameFr: "Le Souffle",
    descEn: "Heal completely and take nothing for ten seconds.",
    descFr: "Soin complet, et plus rien n'atteint le chat pendant dix secondes.",
    icon: "essence",
  },
  {
    key: "elites",
    rebirths: 4,
    nameEn: "The Elites",
    nameFr: "Les Élites",
    descEn: "Some enemies come back wrong. Far harder, and they always leave something good.",
    descFr: "Certains ennemis reviennent difformes. Bien plus coriaces, et ils laissent toujours quelque chose.",
    icon: "crown",
  },
  {
    key: "pack",
    rebirths: 5,
    nameEn: "The Pack",
    nameFr: "La Meute",
    descEn: "A second cat, dressed from what the first one left in the bag.",
    descFr: "Un second chat, habillé de ce que le premier a laissé dans le sac.",
    icon: "badge",
  },
  {
    key: "instinct",
    rebirths: 6,
    nameEn: "Instinct",
    nameFr: "L'Instinct",
    descEn: "The cat wears whatever it finds that is better, by itself.",
    descFr: "Le chat porte de lui-même ce qu'il trouve de meilleur.",
    icon: "aura",
  },
  {
    key: "forge",
    rebirths: 7,
    nameEn: "The Forge",
    nameFr: "La Forge",
    descEn: "Three spares of one rarity become one piece of the rarity above.",
    descFr: "Trois rechanges d'une rareté deviennent une pièce du rang au-dessus.",
    icon: "ore",
  },
  {
    key: "rage",
    rebirths: 8,
    nameEn: "Fury",
    nameFr: "La Rage",
    descEn: "Every kill without falling makes the next one harder. A defeat empties it.",
    descFr: "Chaque ennemi tué sans tomber renforce le suivant. Une défaite vide tout.",
    icon: "sword",
  },
  {
    key: "shortcut",
    rebirths: 9,
    nameEn: "The Shortcut",
    nameFr: "Le Raccourci",
    descEn: "A new life no longer starts at the bottom, but halfway up your record.",
    descFr: "Une nouvelle vie ne repart plus du bas, mais à mi-chemin de ton record.",
    icon: "key",
  },
  {
    key: "horde",
    rebirths: 10,
    nameEn: "The Pride",
    nameFr: "La Horde",
    descEn: "A third cat. The bag has been waiting for it.",
    descFr: "Un troisième chat. Le sac l'attendait.",
    icon: "crown",
  },
];

// ---------------------------------------------------------------------------
// What the last five rungs are made of
// ---------------------------------------------------------------------------

/**
 * Fury: what a kill streak is worth.
 *
 * Fifty kills to reach the ceiling, and a defeat empties it. It rewards the
 * floor a cat can *hold* rather than the one it can reach — the first thing in
 * the game that makes a death loop cost something beyond the seconds it wastes.
 */
export const RAGE_STEP = 0.02;
export const RAGE_CAP = 2;

/** Fury's multiplier for a streak of this length. */
export function rageFactor(killsSinceDefeat: number): number {
  return Math.min(RAGE_CAP, 1 + Math.max(0, killsSinceDefeat) * RAGE_STEP);
}

/**
 * The Shortcut: where a new life begins.
 *
 * Halfway up the record rather than at the bottom. It is self-correcting and
 * needs no safety net: a cat that starts above what it can hold falls, and the
 * defeat rule already walks it back down a floor at a time until it finds
 * ground it can fight on.
 */
export const SHORTCUT_SHARE = 0.5;

export function shortcutFloor(bestFloor: number): number {
  return Math.max(1, Math.floor(bestFloor * SHORTCUT_SHARE));
}

/**
 * The Forge: three into one.
 *
 * It takes the three *best* spares of a rarity rather than the three worst, and
 * returns their floor one rarity higher. Feeding it junk would make it a button
 * that turns nothing into nothing at depth, where a piece's floor matters far
 * more than its colour.
 */
export const FORGE_COST = 3;

export function unlocked(key: UnlockKey, rebirths: number): boolean {
  const def = UNLOCKS.find((entry) => entry.key === key);
  return def !== undefined && rebirths >= def.rebirths;
}

// ---------------------------------------------------------------------------
// The Seals: worn pieces that agree
// ---------------------------------------------------------------------------

/**
 * How much a matching set is worth, by how many pieces match.
 *
 * Three is the first rung on purpose: two matching pieces happen by accident,
 * and a bonus you get by accident teaches nothing. From three it becomes a
 * reason to keep a slightly weaker piece — which is the first time the bag has
 * ever argued with the recommendation button, and the point of the system.
 */
const SEAL_STEPS = [0, 0, 0, 0.08, 0.15, 0.25, 0.4];

export interface SealBonus {
  count: number;
  rarity: Rarity | null;
  bonus: number;
}

/**
 * What a given number of matching pieces of a given rarity is worth.
 *
 * Exported so the bag can show the rung above the one you are on. A set bonus
 * you cannot see the next step of is a set bonus nobody sets out to complete.
 */
export function sealBonusFor(rarity: Rarity, count: number): number {
  if (count < 3) return 0;
  // Rarer sets are worth more, so a full common set never beats four legendaries.
  return SEAL_STEPS[Math.min(count, 6)] * (1 + RARITIES.indexOf(rarity) * 0.16);
}

/** The highest rung any worn rarity reaches. */
export function sealBonus(worn: Rarity[]): SealBonus {
  let best: SealBonus = { count: 0, rarity: null, bonus: 0 };

  for (const rarity of RARITIES) {
    const count = worn.filter((entry) => entry === rarity).length;
    const bonus = sealBonusFor(rarity, count);
    if (bonus > best.bonus) best = { count, rarity, bonus };
  }

  return best;
}

// ---------------------------------------------------------------------------
// The Breath
// ---------------------------------------------------------------------------

export const BREATH_COOLDOWN_SECONDS = 120;
/**
 * Ten, and it was fifteen.
 *
 * Measured over two hours at every chamber around a cat's limit, re-casting the
 * Breath the moment it was ready: fifteen seconds and ten seconds hold exactly
 * the same chambers. Only one chamber in the whole ladder separates ten from
 * five, and past that the shield stops deciding anything — it postpones a death
 * that arrives anyway.
 *
 * The reason is the curve, not the number. Damage grows 1.152 per chamber and
 * 2.34 per floor, so the band where "a little more invulnerability" flips the
 * outcome is one chamber wide. Fifteen seconds bought nothing over ten but the
 * appearance of a stronger spell.
 *
 * What the Breath is actually for is the full heal and the cancelled recovery.
 */
export const BREATH_SHIELD_SECONDS = 10;

// ---------------------------------------------------------------------------
// The Elites, and the Pack
// ---------------------------------------------------------------------------

/**
 * Some enemies come back wrong.
 *
 * Multipliers rather than a separate table: an Elite is the chamber it stands in,
 * made harder, so it stays in proportion at every depth without a second curve to
 * keep in step with the first. It always leaves something, and something better
 * than the floor would normally give.
 */
export const ELITE_CHANCE = 0.09;
export const ELITE_HP_MULTIPLIER = 6;
export const ELITE_DAMAGE_MULTIPLIER = 1.35;
export const ELITE_GOLD_MULTIPLIER = 5;

/** What an Elite does to the chamber it occupies. */
export function eliteLevel(info: LevelInfo): LevelInfo {
  return {
    ...info,
    enemyHp: Math.round(info.enemyHp * ELITE_HP_MULTIPLIER),
    enemyDamage: Math.round(info.enemyDamage * ELITE_DAMAGE_MULTIPLIER * 10) / 10,
    goldReward: Math.round(info.goldReward * ELITE_GOLD_MULTIPLIER),
  };
}

/**
 * The second cat.
 *
 * It fights with the same upgrades and relics as the first — it is the same
 * player, after all — but only a share of what that comes to reaches the fight.
 * A full second cat would double every number on the screen and halve the meaning
 * of the first one; a third of one turns the bottom of the bag into something
 * worth dressing.
 *
 * Its pieces live in the same table, marked by a prefix on the worn slot. That
 * keeps the database's own one-piece-per-slot guarantee doing the work for both
 * cats, with no second constraint to keep in step.
 */
export const PACK_SHARE = 0.35;
export const PACK_PREFIX = "PACK:";
/** The third cat. Its own prefix, so one unique index still covers all three. */
export const HORDE_PREFIX = "PACK2:";

/** How many cats a player has: one, plus the two the ladder gives back. */
export function catCount(rebirths: number): number {
  return 1 + (unlocked("pack", rebirths) ? 1 : 0) + (unlocked("horde", rebirths) ? 1 : 0);
}

/** The prefix a given cat's worn pieces carry. The first cat has none. */
export function catPrefix(cat: number): string {
  return cat === 2 ? HORDE_PREFIX : cat === 1 ? PACK_PREFIX : "";
}

/** Which cat a stored slot belongs to. */
export function catOfSlot(worn: string | null): number {
  if (typeof worn !== "string") return 0;
  if (worn.startsWith(HORDE_PREFIX)) return 2;
  if (worn.startsWith(PACK_PREFIX)) return 1;
  return 0;
}

/** Where a piece is stored when a cat other than the first is wearing it. */
export function packSlot(slot: Slot, cat = 1): string {
  return `${catPrefix(cat)}${slot}`;
}

/** True for any cat but the first. */
export function isPackSlot(worn: string | null): boolean {
  return catOfSlot(worn) > 0;
}

// ---------------------------------------------------------------------------
// The shop
// ---------------------------------------------------------------------------

/**
 * Every tenth chest is guaranteed.
 *
 * Randomness that can be unlucky forty times in a row is not a shop, it is a
 * grievance. The counter is stored and shown, so the guarantee is a promise the
 * player can watch approaching rather than a claim in a description.
 */
export const CHEST_PITY = 10;

/** What a guaranteed chest floors the roll at, by how many lives were spent. */
export function chestFloorRarity(rebirths: number): Rarity {
  if (rebirths >= 9) return "ORIGIN";
  if (rebirths >= 7) return "ASTRAL";
  if (rebirths >= 4) return "SOVEREIGN";
  if (rebirths >= 2) return "LEGENDARY";
  return "EPIC";
}

export interface SkinDef {
  /** Given by the calendar rather than sold. Never listed with a price. */
  calendar?: boolean;
  /**
   * Something drawn on top that moves.
   *
   * Every other coat is five colours and nothing else, which is what keeps a
   * new one a row in a table rather than a second drawing to maintain. These
   * two are the exception the price pays for: wings that beat, a halo that
   * breathes, a tail that flicks.
   */
  effect?: "halo" | "horns" | "haze" | "shine" | "psychic";
  key: string;
  nameEn: string;
  nameFr: string;
  price: number;
  fur: string;
  furDark: string;
  furDeep: string;
  furLight: string;
  ear: string;
  eyes: string;
}

/**
 * Coats, priced along the curve rather than on a flat list.
 *
 * Priced in gems, which do not inflate — so the rungs can be close together and
 * still mean something. In gold this ladder had to climb by a factor of ten a
 * rung just to stay ahead of the currency, and even then the top of it was
 * bought in an afternoon. Here the numbers are small, the spacing is gentle, and
 * a coat is a fortnight of Guardians rather than an accident of depth.
 */

// ---------------------------------------------------------------------------
// The calendar
// ---------------------------------------------------------------------------

/**
 * THIRTY DOORS, ONE A DAY
 *
 * The state is a count, not a grid. A player who misses Tuesday opens door
 * seven on Wednesday — nothing resets, nothing is lost, and the only thing a
 * missed day costs is the day. That is deliberate: a calendar that punishes an
 * absence is a calendar that punishes a holiday, and this game already asks
 * nothing of a player who closes it.
 *
 * The day boundary is UTC, like every other daily thing here. A device clock is
 * a lever anyone can pull, and one global midnight gives everyone the same
 * rhythm.
 */
export const CALENDAR_DAYS = 30;

export type CalendarKind = "GEMS" | "GOLD" | "BOOST" | "SKIN";

export interface CalendarDay {
  day: number;
  kind: CalendarKind;
  /** Gems, or minutes of the player's own income, or one boost of this key. */
  amount: number;
  boost?: BoostKey;
}

/**
 * What each door holds.
 *
 * Gems are a fixed number because gems do not inflate — a Guardian pays the same
 * at floor 3 and floor 300, which is what lets a price mean something. Gold
 * cannot be fixed for the same reason inverted: it is exponential, so a number
 * that matters on day one is a rounding error by floor forty. Gold is therefore
 * paid in **minutes of the cat's own current income**, which is worth the same
 * amount of progress whenever it is opened.
 */
export const CALENDAR: CalendarDay[] = [
  { day: 1, kind: "GEMS", amount: 3 },
  { day: 2, kind: "GOLD", amount: 15 },
  { day: 3, kind: "BOOST", amount: 1, boost: "gold" },
  { day: 4, kind: "GEMS", amount: 5 },
  { day: 5, kind: "GOLD", amount: 30 },
  { day: 6, kind: "BOOST", amount: 1, boost: "damage" },
  { day: 7, kind: "GEMS", amount: 8 },
  { day: 8, kind: "GOLD", amount: 45 },
  { day: 9, kind: "BOOST", amount: 1, boost: "loot" },
  { day: 10, kind: "GEMS", amount: 12 },
  { day: 11, kind: "GOLD", amount: 60 },
  { day: 12, kind: "BOOST", amount: 1, boost: "gold" },
  { day: 13, kind: "GEMS", amount: 15 },
  { day: 14, kind: "GOLD", amount: 90 },
  // The middle of the month is the prize, and it is the only thing on this table
  // that cannot be bought: six coats, one per calendar, six months of them.
  { day: 15, kind: "SKIN", amount: 1 },
  { day: 16, kind: "GEMS", amount: 10 },
  { day: 17, kind: "BOOST", amount: 1, boost: "damage" },
  { day: 18, kind: "GOLD", amount: 60 },
  { day: 19, kind: "GEMS", amount: 12 },
  { day: 20, kind: "GEMS", amount: 20 },
  { day: 21, kind: "BOOST", amount: 1, boost: "loot" },
  { day: 22, kind: "GOLD", amount: 90 },
  { day: 23, kind: "GEMS", amount: 15 },
  { day: 24, kind: "BOOST", amount: 1, boost: "gold" },
  { day: 25, kind: "GEMS", amount: 25 },
  { day: 26, kind: "GOLD", amount: 120 },
  { day: 27, kind: "BOOST", amount: 1, boost: "damage" },
  { day: 28, kind: "GEMS", amount: 20 },
  { day: 29, kind: "GOLD", amount: 150 },
  { day: 30, kind: "GEMS", amount: 60 },
];

/**
 * The coat behind door fifteen, one per calendar.
 *
 * Six of them, which is six months of calendars planned in advance. Past the
 * sixth the door pays gems instead — a promise of "a new coat every month for
 * ever" is one nobody can keep, and an empty door on month seven would be worse
 * than an honest handful of gems.
 */
export const CALENDAR_SKINS = ["aurora", "obsidian", "sakura", "abyss", "solstice", "nebula"];

/** What door fifteen pays once the six coats have all been given. */
export const CALENDAR_SKIN_FALLBACK_GEMS = 80;

/** The coat owed for a calendar, or null when there is none left to give. */
export function calendarSkinFor(cycle: number): string | null {
  return CALENDAR_SKINS[cycle] ?? null;
}

export function calendarDay(day: number): CalendarDay {
  return CALENDAR[Math.min(Math.max(1, day), CALENDAR_DAYS) - 1];
}

// ---------------------------------------------------------------------------
// Boosts
// ---------------------------------------------------------------------------

export type BoostKey = "gold" | "damage" | "loot";

export interface BoostDef {
  key: BoostKey;
  nameEn: string;
  nameFr: string;
  descEn: string;
  descFr: string;
  /** Seconds it runs for once started. */
  seconds: number;
  /**
   * Gems, for the shop.
   *
   * Priced against the chest, which is six: a boost is worth a handful of
   * chests, not a coat. Gold is deliberately the dearest of the three — it is
   * the one that compounds, since gold buys upgrades that buy floors, where
   * damage and loot only make the next twenty minutes better.
   */
  price: number;
  icon: string;
}

/** Everything a boost multiplies, it doubles. One number to remember. */
export const BOOST_FACTOR = 2;

/**
 * Three boosts, and deliberately not four.
 *
 * "Damage x2" and "attack speed x2" are the same multiplier: power is damage
 * times attacks per second, so doubling either doubles exactly the same number.
 * Two buttons with one effect is a menu that lies, so the third slot went to
 * loot instead, which multiplies something no other boost touches.
 */
export const BOOSTS: BoostDef[] = [
  {
    key: "gold",
    nameEn: "Greed",
    nameFr: "Avidité",
    descEn: "x2 gold",
    descFr: "×2 or",
    seconds: 30 * 60,
    price: 45,
    icon: "gold",
  },
  {
    key: "damage",
    nameEn: "Fury",
    nameFr: "Fureur",
    descEn: "x2 damage",
    descFr: "×2 dégâts",
    seconds: 20 * 60,
    price: 30,
    icon: "sword",
  },
  {
    key: "loot",
    nameEn: "Scent",
    nameFr: "Odorat",
    descEn: "x2 find chance",
    descFr: "×2 chance de butin",
    seconds: 20 * 60,
    price: 30,
    icon: "key",
  },
];

export const BOOST_BY_KEY: Record<string, BoostDef> = Object.fromEntries(
  BOOSTS.map((boost) => [boost.key, boost]),
);

// ---------------------------------------------------------------------------
// What a cat stands against
// ---------------------------------------------------------------------------

/**
 * Profile backdrops.
 *
 * Cosmetic, priced in gems like the coats, and all of them animated: a still
 * picture behind a breathing cat reads as a mistake, the eye takes the cat for
 * a sticker on a wall. They survive a rebirth for the same reason coats do —
 * making a player buy the same wall twice is not a gold sink.
 */
export interface BackdropDef {
  key: string;
  nameEn: string;
  nameFr: string;
  price: number;
}

export const BACKDROPS: BackdropDef[] = [
  { key: "stars", nameEn: "Starfield", nameFr: "Champ d'étoiles", price: 150 },
  { key: "aurora", nameEn: "Aurora", nameFr: "Aurore", price: 300 },
  { key: "embers", nameEn: "Embers", nameFr: "Braises", price: 500 },
  { key: "abyss", nameEn: "The Abyss", nameFr: "L'Abysse", price: 800 },
  { key: "gilded", nameEn: "The Hoard", nameFr: "Le Trésor", price: 1200 },
];

export const BACKDROP_BY_KEY: Record<string, BackdropDef> = Object.fromEntries(
  BACKDROPS.map((entry) => [entry.key, entry]),
);

export const SKINS: SkinDef[] = [
  {
    key: "classic",
    nameEn: "Maine Coon",
    nameFr: "Maine Coon",
    price: 0,
    fur: "#8b8072",
    furDark: "#655c50",
    furDeep: "#4d463c",
    furLight: "#b3a894",
    ear: "#c2949a",
    eyes: "#8fd14f",
  },
  {
    key: "ember",
    nameEn: "Ember",
    nameFr: "Braise",
    price: 40,
    fur: "#c2703a",
    furDark: "#94502a",
    furDeep: "#6b3a1e",
    furLight: "#e0a06a",
    ear: "#d99a86",
    eyes: "#ffd05e",
  },
  {
    key: "shadow",
    nameEn: "Shadow",
    nameFr: "Ombre",
    price: 90,
    fur: "#3a3a42",
    furDark: "#26262c",
    furDeep: "#17171b",
    furLight: "#55555f",
    ear: "#7a5a62",
    eyes: "#ffb03d",
  },
  {
    key: "snow",
    nameEn: "Snow",
    nameFr: "Neige",
    price: 180,
    fur: "#e2e0da",
    furDark: "#c2bfb6",
    furDeep: "#9d9a91",
    furLight: "#f6f5f1",
    ear: "#e8b4bc",
    eyes: "#5ec8ff",
  },
  {
    key: "siamese",
    nameEn: "Siamese",
    nameFr: "Siamois",
    price: 320,
    fur: "#ddd0b8",
    furDark: "#6b5a4a",
    furDeep: "#453a30",
    furLight: "#f0e6d2",
    ear: "#c99a92",
    eyes: "#4f93ff",
  },
  {
    key: "spectre",
    nameEn: "Spectre",
    nameFr: "Fantôme",
    price: 550,
    effect: "haze",
    fur: "#6f86a8",
    furDark: "#4a5c78",
    furDeep: "#2f3c52",
    furLight: "#9fb6d4",
    ear: "#8fa8c4",
    eyes: "#b9f0ff",
  },
  {
    key: "gilded",
    nameEn: "Gilded",
    nameFr: "Doré",
    price: 900,
    effect: "shine",
    fur: "#d4a94e",
    furDark: "#a67f30",
    furDeep: "#75581e",
    furLight: "#f3d68f",
    ear: "#e0b98a",
    eyes: "#ffffff",
  },
  {
    key: "vault",
    nameEn: "Vault Heart",
    nameFr: "Cœur du Vault",
    price: 1500,
    effect: "psychic",
    fur: "#5a4b9c",
    furDark: "#3d3270",
    furDeep: "#26204a",
    furLight: "#8f7fd4",
    ear: "#a98fd4",
    eyes: "#8ef0ff",
  },
  {
    key: "seraph",
    nameEn: "Seraph",
    nameFr: "Séraphin",
    price: 2000,
    effect: "halo",
    fur: "#f2ead7",
    furDark: "#d6c9ab",
    furDeep: "#b3a684",
    furLight: "#fffaf0",
    ear: "#f4c9c9",
    eyes: "#8ed7ff",
  },
  {
    key: "imp",
    nameEn: "Imp",
    nameFr: "Diablotin",
    price: 2000,
    effect: "horns",
    fur: "#8e2b2b",
    furDark: "#6a1d1d",
    furDeep: "#451111",
    furLight: "#c4453f",
    ear: "#e0705f",
    eyes: "#ffd23d",
  },
  {
    key: "aurora",
    nameEn: "Aurora",
    nameFr: "Aurore",
    price: 0,
    // Behind a door, never behind a price: the calendar is the only way in.
    calendar: true,
    fur: "#4c7f8f",
    furDark: "#31586a",
    furDeep: "#203c4c",
    furLight: "#7fc0cd",
    ear: "#a8d8e0",
    eyes: "#c8ff6a",
  },
  {
    key: "obsidian",
    nameEn: "Obsidian",
    nameFr: "Obsidienne",
    price: 0,
    // Behind a door, never behind a price: the calendar is the only way in.
    calendar: true,
    fur: "#2a2f3d",
    furDark: "#1b1f29",
    furDeep: "#101319",
    furLight: "#454d63",
    ear: "#6d5f77",
    eyes: "#ff7a3d",
  },
  {
    key: "sakura",
    nameEn: "Sakura",
    nameFr: "Sakura",
    price: 0,
    // Behind a door, never behind a price: the calendar is the only way in.
    calendar: true,
    fur: "#e8bcc6",
    furDark: "#c78d9c",
    furDeep: "#a06a79",
    furLight: "#f6dde2",
    ear: "#f2b8c6",
    eyes: "#5fd18f",
  },
  {
    key: "abyss",
    nameEn: "Abyss",
    nameFr: "Abysse",
    price: 0,
    // Behind a door, never behind a price: the calendar is the only way in.
    calendar: true,
    fur: "#2f3a72",
    furDark: "#212a55",
    furDeep: "#141a38",
    furLight: "#5566a8",
    ear: "#7a6fa8",
    eyes: "#ffd45e",
  },
  {
    key: "solstice",
    nameEn: "Solstice",
    nameFr: "Solstice",
    price: 0,
    // Behind a door, never behind a price: the calendar is the only way in.
    calendar: true,
    fur: "#efe0bd",
    furDark: "#cdb98d",
    furDeep: "#a8926a",
    furLight: "#fbf3e0",
    ear: "#e8c7a8",
    eyes: "#ff9d3d",
  },
  {
    key: "nebula",
    nameEn: "Nebula",
    nameFr: "Nébuleuse",
    price: 0,
    // Behind a door, never behind a price: the calendar is the only way in.
    calendar: true,
    fur: "#6b3f8f",
    furDark: "#4c2b66",
    furDeep: "#331d47",
    furLight: "#a06fc9",
    ear: "#c58fd8",
    eyes: "#e8fbff",
  },
];

export const SKIN_BY_KEY: Record<string, SkinDef> = Object.fromEntries(
  SKINS.map((skin) => [skin.key, skin]),
);

// ---------------------------------------------------------------------------
// Gems: a currency that does not inflate
// ---------------------------------------------------------------------------

/**
 * Gold multiplies by a thousand every eight floors, which makes any gold price
 * either unaffordable or free depending only on when it is read. That was
 * patched twice — the chest billed against the current floor, the coats raised
 * a thousandfold — and both were the same symptom.
 *
 * Gems are the fix rather than the patch. They come from Guardians, one floor at
 * a time, so they accumulate **linearly** with progress. A price in gems means
 * the same thing on floor five and on floor five hundred, which is the only way
 * a shop ladder stays a ladder.
 *
 * They survive a rebirth: cosmetics bought once should stay bought, and a
 * currency wiped every life would be a currency nobody spends.
 */
export function gemsForGuardian(floor: number): number {
  // Higher Guardians are rarer — the climb decelerates by design — so each one
  // is worth more. Without this the gem rate would fall away exactly when the
  // shop starts having something worth saving for.
  return 1 + Math.floor(floor / 8);
}

/** An Elite is not a Guardian, but it is not nothing either. */
export const ELITE_GEMS = 1;

/**
 * One price, forever. This is the whole point of the currency: it does not need
 * to be recalculated against anything.
 */
export const CHEST_GEMS = 6;

// ---------------------------------------------------------------------------
// What lives on each floor
// ---------------------------------------------------------------------------

/**
 * Ten creatures, assigned to the sixteen chambers.
 *
 * A single silhouette for every floor made the Vault feel like one room with
 * different wallpaper. Tying the creature to the chamber it stands in does the
 * opposite of that for the cost of nine more drawings — a Forge has cinders in
 * it, an Ossuary has bones, and the player learns where they are from the fight
 * rather than from the caption.
 *
 * They stay deliberately simpler than the cat. The cat is what the player dresses
 * and watches; an enemy drawn to the same level of detail would compete with it
 * for the eye, and the eye should be on the thing that is progressing.
 */
export type EnemyKind =
  | "wraith"
  | "crawler"
  | "cinder"
  | "shard"
  | "tome"
  | "bloom"
  | "void"
  | "sentinel"
  | "bones"
  | "storm";

/** One per chamber, in the same order as the backdrops. */
const ENEMY_BY_CHAMBER: EnemyKind[] = [
  "wraith", // The Crypt
  "crawler", // The Hollows
  "cinder", // The Forge
  "shard", // The Rime
  "tome", // The Stacks
  "bloom", // The Overgrowth
  "void", // The Abyss
  "sentinel", // The Gilded Hall
  "crawler", // The Mire
  "shard", // The Geode
  "bones", // The Ossuary
  "tome", // The Sanctum
  "sentinel", // The Ruin
  "storm", // The Tempest
  "wraith", // The Necropolis
  "storm", // The Vault Core
];

export function enemyKindFor(floor: number): EnemyKind {
  return ENEMY_BY_CHAMBER[(Math.max(1, floor) - 1) % ENEMY_BY_CHAMBER.length];
}

const ENEMY_NAMES: Record<EnemyKind, { en: string; fr: string }> = {
  wraith: { en: "Wraith", fr: "Spectre" },
  crawler: { en: "Crawler", fr: "Rampant" },
  cinder: { en: "Cinder", fr: "Braise" },
  shard: { en: "Shard", fr: "Éclat" },
  tome: { en: "Tome", fr: "Grimoire" },
  bloom: { en: "Bloom", fr: "Floraison" },
  void: { en: "Void", fr: "Vide" },
  sentinel: { en: "Sentinel", fr: "Sentinelle" },
  bones: { en: "Bones", fr: "Ossements" },
  storm: { en: "Storm", fr: "Orage" },
};

/** What the health bar calls the thing. The Guardian and the Elite outrank it. */
export function enemyName(kind: EnemyKind, locale: string): string {
  const names = ENEMY_NAMES[kind];
  return locale === "fr" ? names.fr : names.en;
}

// ---------------------------------------------------------------------------
// What a piece looks like
// ---------------------------------------------------------------------------

/**
 * The hands hold a weapon, and there are four of them.
 *
 * Which one a piece is comes from its own id rather than from a column: the
 * choice has no effect on any number, so storing it would be a migration for a
 * decision the id already makes — and deriving it means every screen showing the
 * same piece shows the same weapon, for ever, without asking the database.
 */
export type WeaponKind = "sword" | "staff" | "bow" | "shield";

const WEAPONS: WeaponKind[] = ["sword", "staff", "bow", "shield"];

export function weaponFor(id: string): WeaponKind {
  let hash = 0;
  for (let index = 0; index < id.length; index++) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return WEAPONS[hash % WEAPONS.length];
}

/**
 * Three finishes across eight rarities: bare wood and steel, blue runes, blue
 * fire. The art came in threes, so the ladder reads in threes — a Sovereign
 * blade is on fire and a common one is not, which is the whole job of a finish.
 */
export function weaponFinish(rarity: Rarity): "plain" | "runed" | "flame" {
  const tier = RARITIES.indexOf(rarity);
  if (tier >= 5) return "flame";
  if (tier >= 2) return "runed";
  return "plain";
}

export function weaponIcon(id: string, rarity: Rarity): string {
  return weaponIconFor(weaponFor(id), rarity);
}

/**
 * The same picture, from the kind rather than from the id.
 *
 * The cat knows what it is holding but not which row it came from — a worn
 * piece carries its kind, not its identifier — and both screens have to end up
 * with the same file.
 */
export function weaponIconFor(kind: WeaponKind, rarity: Rarity): string {
  return `/weapons/${kind}-${weaponFinish(rarity)}.webp`;
}
