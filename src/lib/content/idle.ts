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
    descEn: "×1.10 damage per hit, per level. Never stops being worth it.",
    descFr: "×1,10 de dégâts par coup et par niveau. Ne cesse jamais de payer.",
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
    descEn: "×1.06 attacks per second, per level. No ceiling.",
    descFr: "×1,06 attaque par seconde et par niveau. Sans plafond.",
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
    descEn: "+1.5% chance to strike critically. Stops at certainty, and nowhere earlier.",
    descFr: "+1,5 % de chance de coup critique. S'arrête à la certitude, pas avant.",
    baseCost: 25,
    costGrowth: 1.27,
    perLevel: 0.015,
    maxLevel: 64,
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
    costGrowth: 2.35,
    perLevel: 0.08,
    axis: "OFFENCE",
    icon: "legend",
  },
  {
    key: "double",
    nameEn: "Double Strike",
    nameFr: "Double Coup",
    descEn: "+2% chance the blow lands twice. Past 100%, every whole point is another certain blow.",
    descFr: "+2 % de chance que le coup parte deux fois. Au-delà de 100 %, chaque point entier est un coup de plus garanti.",
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
  MYTHIC: { color: "#37d5ff", glow: "rgba(55,213,255,0.60)" },
  LEGENDARY: { color: "#f0c14b", glow: "rgba(240,193,75,0.65)" },
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
};

const AFFIX_SCALE: Record<Rarity, number> = {
  COMMON: 0,
  UNCOMMON: 1,
  RARE: 1.7,
  EPIC: 2.5,
  MYTHIC: 3.5,
  LEGENDARY: 5,
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
    descEn: "+15% damage per relic. Everything the cat learned about hitting.",
    descFr: "+15 % de dégâts par relique. Tout ce que le chat a appris à frapper.",
    baseCost: 1,
    costGrowth: 1.35,
    perLevel: 0.15,
    icon: "core",
  },
  {
    key: "tenacity",
    nameEn: "Tenacity",
    nameFr: "Ténacité",
    descEn: "+15% health per relic. Everything it learned about not dying.",
    descFr: "+15 % de vie par relique. Tout ce qu'il a appris à ne pas mourir.",
    baseCost: 1,
    costGrowth: 1.35,
    perLevel: 0.15,
    icon: "velvet",
  },
  {
    key: "greed",
    nameEn: "Greed",
    nameFr: "Avidité",
    descEn: "+25% gold per relic. The run pays for its own upgrades sooner.",
    descFr: "+25 % d'or par relique. La partie finance ses améliorations plus tôt.",
    baseCost: 2,
    costGrowth: 1.4,
    perLevel: 0.25,
    icon: "gold",
  },
  {
    key: "luck",
    nameEn: "Fortune",
    nameFr: "Chance",
    descEn: "+3% chance a fallen enemy leaves something. Stops at three in four.",
    descFr: "+3 % de chance qu'un ennemi vaincu laisse quelque chose. S'arrête à trois sur quatre.",
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
 * The Roar: one minute of the cat's own damage, delivered at once.
 *
 * A share of current output rather than a fixed number, so it stays meaningful at
 * every depth without ever being the thing that clears a floor on its own.
 */
export const ROAR_COOLDOWN_SECONDS = 180;
export const ROAR_DAMAGE_SECONDS = 60;
