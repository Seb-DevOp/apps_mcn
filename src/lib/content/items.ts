/**
 * Item catalogue.
 *
 * Everything the player can hold is one flexible ItemDef — materials, fragments,
 * cosmetics, boosts, badges, keys. V2 equipment and any future NFT-backed item
 * plug into the same abstraction by adding a `type` and filling `meta`, so no
 * inventory migration is needed later.
 */

export type Rarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "MYTHIC" | "LEGENDARY";

export type ItemType =
  | "MATERIAL"
  | "FRAGMENT"
  | "COSMETIC"
  | "BOOST"
  | "BADGE"
  | "EQUIPMENT"
  | "KEY";

export interface ItemDefinition {
  key: string;
  type: ItemType;
  rarity: Rarity;
  nameEn: string;
  nameFr: string;
  descEn: string;
  descFr: string;
  icon: string;
  stackable?: boolean;
  meta?: Record<string, unknown>;
}

export const RARITY_ORDER: Rarity[] = [
  "COMMON",
  "UNCOMMON",
  "RARE",
  "EPIC",
  "MYTHIC",
  "LEGENDARY",
];

/** Rarity is never communicated by text colour alone — this drives glow, ring and particles too. */
export const RARITY_STYLE: Record<Rarity, { color: string; glow: string; label: string }> = {
  COMMON: { color: "#9aa6bf", glow: "rgba(154,166,191,0.35)", label: "Common" },
  UNCOMMON: { color: "#69c39a", glow: "rgba(105,195,154,0.40)", label: "Uncommon" },
  RARE: { color: "#4f93ff", glow: "rgba(79,147,255,0.50)", label: "Rare" },
  EPIC: { color: "#a06bff", glow: "rgba(160,107,255,0.50)", label: "Epic" },
  MYTHIC: { color: "#37d5ff", glow: "rgba(55,213,255,0.60)", label: "Mythic" },
  LEGENDARY: { color: "#f0c14b", glow: "rgba(240,193,75,0.65)", label: "Legendary" },
};

export const ITEMS: ItemDefinition[] = [
  // --- Materials: the base of the future Forge ---------------------------
  {
    key: "mat-stone-dust",
    type: "MATERIAL",
    rarity: "COMMON",
    nameEn: "Vault Stone Dust",
    nameFr: "Poussière de Pierre",
    descEn: "Ground from the old Vault walls. The Forge starts here.",
    descFr: "Issue des vieux murs du Vault. La Forge commence ici.",
    icon: "stone",
  },
  {
    key: "mat-iron-thread",
    type: "MATERIAL",
    rarity: "COMMON",
    nameEn: "Iron Thread",
    nameFr: "Fil de Fer",
    descEn: "Guardian leatherwork is stitched with it.",
    descFr: "Le cuir des Gardiens en est cousu.",
    icon: "thread",
  },
  {
    key: "mat-gold-leaf",
    type: "MATERIAL",
    rarity: "UNCOMMON",
    nameEn: "Antique Gold Leaf",
    nameFr: "Feuille d'Or Ancien",
    descEn: "Thin enough to gild a blade, rare enough to be counted.",
    descFr: "Assez fine pour dorer une lame, assez rare pour être comptée.",
    icon: "gold",
  },
  {
    key: "mat-sapphire-shard",
    type: "MATERIAL",
    rarity: "RARE",
    nameEn: "Sapphire Shard",
    nameFr: "Éclat de Saphir",
    descEn: "It hums when the Vault is close.",
    descFr: "Il vibre quand le Vault est proche.",
    icon: "crystal",
  },
  {
    key: "mat-royal-velvet",
    type: "MATERIAL",
    rarity: "RARE",
    nameEn: "Royal Velvet",
    nameFr: "Velours Royal",
    descEn: "Woven for capes that outlive their Guardians.",
    descFr: "Tissé pour des capes qui survivent à leurs Gardiens.",
    icon: "velvet",
  },
  {
    key: "mat-arcane-core",
    type: "MATERIAL",
    rarity: "EPIC",
    nameEn: "Arcane Core",
    nameFr: "Cœur Arcanique",
    descEn: "Still warm. Nobody agrees on why.",
    descFr: "Encore tiède. Personne ne s'accorde sur la raison.",
    icon: "core",
  },
  {
    key: "mat-vault-essence",
    type: "MATERIAL",
    rarity: "MYTHIC",
    nameEn: "Vault Essence",
    nameFr: "Essence du Vault",
    descEn: "The blue light itself, held still.",
    descFr: "La lumière bleue elle-même, immobilisée.",
    icon: "essence",
  },
  {
    key: "mat-celestial-ore",
    type: "MATERIAL",
    rarity: "LEGENDARY",
    nameEn: "Celestial Ore",
    nameFr: "Minerai Céleste",
    descEn: "Found once, remembered forever.",
    descFr: "Trouvé une fois, dont on se souvient toujours.",
    icon: "ore",
  },

  // --- Fragments: collect them now, forge them in V2 ---------------------
  {
    key: "frag-blade",
    type: "FRAGMENT",
    rarity: "UNCOMMON",
    nameEn: "Blade Fragment",
    nameFr: "Fragment de Lame",
    descEn: "Part of a sword that has not been forged yet.",
    descFr: "Morceau d'une épée qui n'a pas encore été forgée.",
    icon: "sword",
    meta: { forgeFamily: "sword" },
  },
  {
    key: "frag-bow",
    type: "FRAGMENT",
    rarity: "UNCOMMON",
    nameEn: "Bowstring Fragment",
    nameFr: "Fragment de Corde d'Arc",
    descEn: "Cut from a Guardian bow that never missed.",
    descFr: "Coupé sur un arc de Gardien qui ne manquait jamais.",
    icon: "bow",
    meta: { forgeFamily: "bow" },
  },
  {
    key: "frag-scepter",
    type: "FRAGMENT",
    rarity: "RARE",
    nameEn: "Scepter Fragment",
    nameFr: "Fragment de Sceptre",
    descEn: "The crystal remembers the hand that held it.",
    descFr: "Le cristal se souvient de la main qui le tenait.",
    icon: "scepter",
    meta: { forgeFamily: "scepter" },
  },
  {
    key: "frag-arcane-blade",
    type: "FRAGMENT",
    rarity: "EPIC",
    nameEn: "Arcane Blade Fragment",
    nameFr: "Fragment de Lame Arcanique",
    descEn: "Magic swords are never found whole.",
    descFr: "Les épées magiques ne se trouvent jamais entières.",
    icon: "magic-sword",
    meta: { forgeFamily: "magic-sword" },
  },
  {
    key: "frag-legend",
    type: "FRAGMENT",
    rarity: "LEGENDARY",
    nameEn: "Legendary Fragment",
    nameFr: "Fragment Légendaire",
    descEn: "One of very few. The Forge will know what to do.",
    descFr: "L'un des très rares. La Forge saura quoi en faire.",
    icon: "legend",
    meta: { forgeFamily: "legendary" },
  },

  // --- Keys: gate the locked content that keeps curiosity alive ----------
  {
    key: "key-crystal",
    type: "KEY",
    rarity: "EPIC",
    nameEn: "Crystal Key",
    nameFr: "Clé de Cristal",
    descEn: "Opens something that is not open yet.",
    descFr: "Ouvre quelque chose qui ne l'est pas encore.",
    icon: "key",
  },

  // --- Boosts: temporary, always explicit about duration and effect ------
  {
    key: "boost-xp-24h",
    type: "BOOST",
    rarity: "UNCOMMON",
    nameEn: "XP Boost",
    nameFr: "Boost d'XP",
    descEn: "+25% XP for 24 hours.",
    descFr: "+25% d'XP pendant 24 heures.",
    icon: "boost-xp",
    stackable: true,
    meta: { statKey: "XP", multiplier: 1.25, durationHours: 24 },
  },
  {
    key: "boost-shard-12h",
    type: "BOOST",
    rarity: "RARE",
    nameEn: "Crystal Boost",
    nameFr: "Boost de Cristaux",
    descEn: "+30% Vault Shards for 12 hours.",
    descFr: "+30% d'Éclats du Vault pendant 12 heures.",
    icon: "boost-shard",
    stackable: true,
    meta: { statKey: "SHARD", multiplier: 1.3, durationHours: 12 },
  },

  // --- Cosmetics: status without power ----------------------------------
  {
    key: "cos-candle-sigil",
    type: "COSMETIC",
    rarity: "UNCOMMON",
    nameEn: "Candlelight Sigil",
    nameFr: "Sceau de Chandelle",
    descEn: "A warm mark beside your name.",
    descFr: "Une marque chaude à côté de votre nom.",
    icon: "sigil",
    stackable: false,
  },
  {
    key: "cos-sapphire-aura",
    type: "COSMETIC",
    rarity: "EPIC",
    nameEn: "Sapphire Aura",
    nameFr: "Aura de Saphir",
    descEn: "Your profile crest glows blue.",
    descFr: "Votre blason brille en bleu.",
    icon: "aura",
    stackable: false,
  },
  {
    key: "cos-crown-mark",
    type: "COSMETIC",
    rarity: "LEGENDARY",
    nameEn: "Crown Mark",
    nameFr: "Marque de Couronne",
    descEn: "Only Legends carry it.",
    descFr: "Seules les Légendes la portent.",
    icon: "crown",
    stackable: false,
  },

  // --- Badges: proof of what you did ------------------------------------
  {
    key: "badge-first-light",
    type: "BADGE",
    rarity: "COMMON",
    nameEn: "First Light",
    nameFr: "Première Lueur",
    descEn: "You opened your first chest.",
    descFr: "Vous avez ouvert votre premier coffre.",
    icon: "badge",
    stackable: false,
  },
  {
    key: "badge-seven-days",
    type: "BADGE",
    rarity: "RARE",
    nameEn: "Seven Days of Vigil",
    nameFr: "Sept Jours de Veille",
    descEn: "A seven-day streak. Oria noticed.",
    descFr: "Sept jours de série. Oria l'a remarqué.",
    icon: "badge",
    stackable: false,
  },
  {
    key: "badge-guardian",
    type: "BADGE",
    rarity: "UNCOMMON",
    nameEn: "Mark of the Guardian",
    nameFr: "Marque du Gardien",
    descEn: "Earned by reaching Guardian.",
    descFr: "Obtenue en atteignant Gardien.",
    icon: "badge",
    stackable: false,
  },
  {
    key: "badge-royal",
    type: "BADGE",
    rarity: "RARE",
    nameEn: "Royal Seal",
    nameFr: "Sceau Royal",
    descEn: "Earned by reaching Royal Guardian.",
    descFr: "Obtenu en atteignant Gardien Royal.",
    icon: "badge",
    stackable: false,
  },
  {
    key: "badge-elite",
    type: "BADGE",
    rarity: "EPIC",
    nameEn: "Elite Insignia",
    nameFr: "Insigne d'Élite",
    descEn: "Earned by reaching Elite Guardian.",
    descFr: "Obtenu en atteignant Gardien d'Élite.",
    icon: "badge",
    stackable: false,
  },
  {
    key: "badge-keeper",
    type: "BADGE",
    rarity: "MYTHIC",
    nameEn: "Keeper's Crest",
    nameFr: "Blason du Gardien du Vault",
    descEn: "Earned by reaching Vault Keeper.",
    descFr: "Obtenu en atteignant Gardien du Vault.",
    icon: "badge",
    stackable: false,
  },
  {
    key: "badge-legend",
    type: "BADGE",
    rarity: "LEGENDARY",
    nameEn: "Legend Crown",
    nameFr: "Couronne de Légende",
    descEn: "The highest mark a player can carry.",
    descFr: "La plus haute marque qu'un joueur puisse porter.",
    icon: "crown",
    stackable: false,
  },
];

export const ITEM_BY_KEY: Record<string, ItemDefinition> = Object.fromEntries(
  ITEMS.map((i) => [i.key, i]),
);

/** Badge granted on reaching each rank (rank-up hands out several things at once). */
export const RANK_BADGE: Record<string, string> = {
  guardian: "badge-guardian",
  "royal-guardian": "badge-royal",
  "elite-guardian": "badge-elite",
  "vault-keeper": "badge-keeper",
  legend: "badge-legend",
};
