/**
 * The six official MCN ranks.
 *
 * The artwork files in /public/ranks are AUTHORITATIVE. Do not redesign them,
 * do not swap one rank's art onto another, and never let a lower rank read as
 * more prestigious than a higher one.
 *
 * All six are delivered. If a future rank ever arrives without art, leave its
 * `artPath` null: the UI falls back to a crest placeholder rather than borrowing
 * another rank's portrait, which would break the hierarchy above.
 */

export type RankKey =
  | "wanderer"
  | "guardian"
  | "royal-guardian"
  | "elite-guardian"
  | "vault-keeper"
  | "legend";

export interface RankDef {
  key: RankKey;
  order: number;
  emoji: string;
  nameEn: string;
  nameFr: string;
  /** XP required to hold this rank. */
  minXp: number;
  artPath: string | null;
  /** Drives crystal glow + border treatment across the whole UI. */
  accentColor: string;
  taglineEn: string;
  taglineFr: string;
  chestTypeKey: string;
  /** What the player newly gains when reaching this rank (shown in the rank-up sequence). */
  unlocksEn: string[];
  unlocksFr: string[];
}

export const RANKS: RankDef[] = [
  {
    key: "wanderer",
    order: 0,
    emoji: "⚜️",
    nameEn: "Wanderer",
    nameFr: "Vagabond",
    minXp: 0,
    artPath: "/ranks/wanderer.png",
    accentColor: "#7c8db5",
    taglineEn: "The journey begins at the Vault door.",
    taglineFr: "Le voyage commence à la porte du Vault.",
    chestTypeKey: "chest-wanderer",
    unlocksEn: ["Wanderer Chest", "Daily missions", "The Entry Hall"],
    unlocksFr: ["Coffre du Vagabond", "Missions quotidiennes", "Le Hall d'Entrée"],
  },
  {
    key: "guardian",
    order: 1,
    emoji: "🐾",
    nameEn: "Guardian",
    nameFr: "Gardien",
    minXp: 500,
    artPath: "/ranks/guardian.png",
    accentColor: "#4f7fd4",
    taglineEn: "The Vault has noticed you.",
    taglineFr: "Le Vault vous a remarqué.",
    chestTypeKey: "chest-guardian",
    unlocksEn: ["Guardian Chest", "Guardian Chamber", "Crystal materials", "Guardian badge"],
    unlocksFr: ["Coffre du Gardien", "Chambre des Gardiens", "Matériaux de cristal", "Badge Gardien"],
  },
  {
    key: "royal-guardian",
    order: 2,
    emoji: "🛡️",
    nameEn: "Royal Guardian",
    nameFr: "Gardien Royal",
    minXp: 2000,
    artPath: "/ranks/royal-guardian.png",
    accentColor: "#2d5cc4",
    taglineEn: "You wear the colours of the Kingdom.",
    taglineFr: "Vous portez les couleurs du Royaume.",
    chestTypeKey: "chest-royal",
    unlocksEn: ["Royal Chest", "Royal Chamber", "Rare materials", "Royal title"],
    unlocksFr: ["Coffre Royal", "Chambre Royale", "Matériaux rares", "Titre Royal"],
  },
  {
    key: "elite-guardian",
    order: 3,
    emoji: "⭐",
    nameEn: "Elite Guardian",
    nameFr: "Gardien d'Élite",
    minXp: 6000,
    artPath: "/ranks/elite-guardian.png",
    accentColor: "#3b73e8",
    taglineEn: "Few are trusted this far.",
    taglineFr: "Peu reçoivent une telle confiance.",
    chestTypeKey: "chest-elite",
    unlocksEn: ["Elite Chest", "Elite Hall", "Epic fragments", "Elite title"],
    unlocksFr: ["Coffre d'Élite", "Hall d'Élite", "Fragments épiques", "Titre d'Élite"],
  },
  {
    key: "vault-keeper",
    order: 4,
    emoji: "💎",
    nameEn: "Vault Keeper",
    nameFr: "Gardien du Vault",
    minXp: 15000,
    artPath: "/ranks/vault-keeper.png",
    accentColor: "#2f8dff",
    taglineEn: "The deepest doors answer to you.",
    taglineFr: "Les portes les plus profondes vous répondent.",
    chestTypeKey: "chest-keeper",
    unlocksEn: ["Vault Keeper Chest", "Keeper Sanctum", "Mythic fragments", "Crystal Keys"],
    unlocksFr: ["Coffre du Gardien du Vault", "Sanctuaire du Gardien", "Fragments mythiques", "Clés de Cristal"],
  },
  {
    key: "legend",
    order: 5,
    emoji: "👑",
    nameEn: "Legend",
    nameFr: "Légende",
    minXp: 40000,
    artPath: "/ranks/legend.png",
    accentColor: "#5eb0ff",
    taglineEn: "Your name is written into the Vault itself.",
    taglineFr: "Votre nom est gravé dans le Vault lui-même.",
    chestTypeKey: "chest-legend",
    unlocksEn: ["Legend Chest", "Legendary Sanctum", "Legendary materials", "Legend crown"],
    unlocksFr: ["Coffre de Légende", "Sanctuaire Légendaire", "Matériaux légendaires", "Couronne de Légende"],
  },
];

export const RANK_BY_KEY: Record<string, RankDef> = Object.fromEntries(
  RANKS.map((r) => [r.key, r]),
);

/** Highest rank whose XP threshold the player has reached. */
export function rankForXp(xp: number): RankDef {
  let current = RANKS[0];
  for (const r of RANKS) if (xp >= r.minXp) current = r;
  return current;
}

export function nextRank(key: string): RankDef | null {
  const current = RANK_BY_KEY[key] ?? RANKS[0];
  return RANKS[current.order + 1] ?? null;
}

/**
 * Progress toward the next rank. Never fabricated — `remaining` is always a
 * real XP requirement the player can verify against the thresholds.
 */
export function rankProgress(xp: number) {
  const current = rankForXp(xp);
  const next = RANKS[current.order + 1] ?? null;
  if (!next) {
    return { current, next: null, ratio: 1, earned: 0, span: 0, remaining: 0 };
  }
  const span = next.minXp - current.minXp;
  const earned = xp - current.minXp;
  return {
    current,
    next,
    ratio: Math.max(0, Math.min(1, earned / span)),
    earned,
    span,
    remaining: Math.max(0, next.minXp - xp),
  };
}
