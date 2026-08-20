/**
 * The Vault itself: chambers, lore, and the daily whisper.
 *
 * V1 keeps this content static and rank-gated. V2 turns the locked chambers into
 * real rooms with missions and mysteries of their own — the gating and the
 * "what is behind that door?" tension already work here.
 */

export interface ChamberDef {
  key: string;
  requiredRankOrder: number;
  nameEn: string;
  nameFr: string;
  descEn: string;
  descFr: string;
  /** Shown while locked — a real requirement, never a fake teaser. */
  lockedHintEn: string;
  lockedHintFr: string;
  hue: string;
}

export const CHAMBERS: ChamberDef[] = [
  {
    key: "entry-hall",
    requiredRankOrder: 0,
    nameEn: "The Entry Hall",
    nameFr: "Le Hall d'Entrée",
    descEn: "Candlelight on wet stone. Banners you do not yet have the right to wear.",
    descFr: "Lueur des chandelles sur la pierre humide. Des bannières que vous n'avez pas encore le droit de porter.",
    lockedHintEn: "",
    lockedHintFr: "",
    hue: "#3a4a72",
  },
  {
    key: "guardian-chamber",
    requiredRankOrder: 1,
    nameEn: "Guardian Chamber",
    nameFr: "Chambre des Gardiens",
    descEn: "Where new Guardians are given their first crystal.",
    descFr: "Là où les nouveaux Gardiens reçoivent leur premier cristal.",
    lockedHintEn: "Requires Guardian.",
    lockedHintFr: "Nécessite le rang Gardien.",
    hue: "#2f5fbf",
  },
  {
    key: "royal-chamber",
    requiredRankOrder: 2,
    nameEn: "Royal Chamber",
    nameFr: "Chambre Royale",
    descEn: "Gold, velvet, and a door nobody talks about.",
    descFr: "Or, velours, et une porte dont personne ne parle.",
    lockedHintEn: "Requires Royal Guardian.",
    lockedHintFr: "Nécessite le rang Gardien Royal.",
    hue: "#2a4fd6",
  },
  {
    key: "elite-hall",
    requiredRankOrder: 3,
    nameEn: "Elite Hall",
    nameFr: "Hall d'Élite",
    descEn: "Weapons on pedestals, each one with a name carved beneath it.",
    descFr: "Des armes sur des socles, chacune avec un nom gravé en dessous.",
    lockedHintEn: "Requires Elite Guardian.",
    lockedHintFr: "Nécessite le rang Gardien d'Élite.",
    hue: "#3b73e8",
  },
  {
    key: "keeper-sanctum",
    requiredRankOrder: 4,
    nameEn: "Vault Keeper Sanctum",
    nameFr: "Sanctuaire du Gardien du Vault",
    descEn: "The blue light has no source here. It simply is.",
    descFr: "Ici, la lumière bleue n'a pas de source. Elle est, simplement.",
    lockedHintEn: "Requires Vault Keeper.",
    lockedHintFr: "Nécessite le rang Gardien du Vault.",
    hue: "#2f8dff",
  },
  {
    key: "legendary-sanctum",
    requiredRankOrder: 5,
    nameEn: "Legendary Sanctum",
    nameFr: "Sanctuaire Légendaire",
    descEn: "Oria waits here. She has waited a long time.",
    descFr: "Oria attend ici. Elle attend depuis longtemps.",
    lockedHintEn: "Requires Legend.",
    lockedHintFr: "Nécessite le rang Légende.",
    hue: "#5eb0ff",
  },
];

export interface LoreDef {
  key: string;
  requiredRankOrder: number;
  titleEn: string;
  titleFr: string;
  bodyEn: string;
  bodyFr: string;
}

export const LORE: LoreDef[] = [
  {
    key: "lore-first-door",
    requiredRankOrder: 0,
    titleEn: "The First Door",
    titleFr: "La Première Porte",
    bodyEn: "The Vault was not built to keep treasure in. It was built to keep patience out. Only those who returned, day after day, were ever shown the second door.",
    bodyFr: "Le Vault n'a pas été bâti pour enfermer un trésor. Il a été bâti pour éloigner l'impatience. Seuls ceux qui revenaient, jour après jour, ont vu la seconde porte.",
  },
  {
    key: "lore-oria",
    requiredRankOrder: 1,
    titleEn: "Oria",
    titleFr: "Oria",
    bodyEn: "She is not a rank you can reach. She is the reason the ranks exist. Silver fur, a small gold crown, and eyes that have counted every Guardian who ever came back.",
    bodyFr: "Elle n'est pas un rang que l'on peut atteindre. Elle est la raison pour laquelle les rangs existent. Fourrure argentée, petite couronne d'or, et des yeux qui ont compté chaque Gardien revenu.",
  },
  {
    key: "lore-blue-crystal",
    requiredRankOrder: 2,
    titleEn: "Why the Crystals Are Blue",
    titleFr: "Pourquoi les Cristaux Sont Bleus",
    bodyEn: "The old Guardians say the crystals took their colour from the sky above the Vault, on the one night the roof was open. Nobody has explained the sound they make.",
    bodyFr: "Les anciens Gardiens disent que les cristaux ont pris la couleur du ciel au-dessus du Vault, la seule nuit où le toit fut ouvert. Personne n'a expliqué le son qu'ils émettent.",
  },
  {
    key: "lore-lost-guardian",
    requiredRankOrder: 3,
    titleEn: "The Guardian Who Did Not Return",
    titleFr: "Le Gardien Qui N'est Pas Revenu",
    bodyEn: "One record ends mid-sentence. The name was scratched out, but the streak count beside it was never corrected: two thousand and eleven days.",
    bodyFr: "Un registre s'interrompt au milieu d'une phrase. Le nom a été rayé, mais le compte de la série à côté n'a jamais été corrigé : deux mille onze jours.",
  },
  {
    key: "lore-deep-vault",
    requiredRankOrder: 4,
    titleEn: "Below the Sanctum",
    titleFr: "Sous le Sanctuaire",
    bodyEn: "Keepers are told there is nothing below the Sanctum. Keepers are also given a key.",
    bodyFr: "On dit aux Gardiens du Vault qu'il n'y a rien sous le Sanctuaire. On leur donne aussi une clé.",
  },
  {
    key: "lore-legend",
    requiredRankOrder: 5,
    titleEn: "What the Vault Is Filling With",
    titleFr: "Ce Dont le Vault se Remplit",
    bodyEn: "Not gold. Gold was only ever the decoration. Quiet strength never rushes — and the Vault is filling.",
    bodyFr: "Pas d'or. L'or n'a jamais été que la décoration. La force tranquille ne se presse jamais — et le Vault se remplit.",
  },
];

/**
 * Daily whisper — a one-line hook that changes every day. It sets up the full
 * mystery system in V2 without promising anything V1 cannot deliver.
 */
export const WHISPERS: { en: string; fr: string }[] = [
  { en: "A candle in the Entry Hall was lit by someone else.", fr: "Une chandelle du Hall d'Entrée a été allumée par quelqu'un d'autre." },
  { en: "A crystal that was dull yesterday is humming today.", fr: "Un cristal terne hier bourdonne aujourd'hui." },
  { en: "One of the banners has been rehung the other way around.", fr: "L'une des bannières a été raccrochée à l'envers." },
  { en: "There is a new mark on the second door. It is fresh.", fr: "Il y a une nouvelle marque sur la seconde porte. Elle est fraîche." },
  { en: "Oria was seen near the Royal Chamber before dawn.", fr: "Oria a été vue près de la Chambre Royale avant l'aube." },
  { en: "A weapon is missing from its pedestal. Nobody reported it.", fr: "Une arme manque sur son socle. Personne ne l'a signalé." },
  { en: "The floor near the Sanctum is warm, and it should not be.", fr: "Le sol près du Sanctuaire est tiède, et il ne devrait pas l'être." },
  { en: "Someone added a line to the Guardian records last night.", fr: "Quelqu'un a ajouté une ligne aux registres des Gardiens cette nuit." },
  { en: "The blue light moved before you did.", fr: "La lumière bleue a bougé avant vous." },
  { en: "A key was left on the stone. It fits nothing you have found.", fr: "Une clé a été laissée sur la pierre. Elle n'ouvre rien de ce que vous connaissez." },
  { en: "The Vault is quieter than usual. That is not reassuring.", fr: "Le Vault est plus silencieux que d'habitude. Ce n'est pas rassurant." },
  { en: "Your name appears in a record you have never read.", fr: "Votre nom apparaît dans un registre que vous n'avez jamais lu." },
  { en: "Something behind the Elite Hall answered a knock.", fr: "Quelque chose derrière le Hall d'Élite a répondu à un coup frappé." },
  { en: "The candles burned all night and lost no wax.", fr: "Les chandelles ont brûlé toute la nuit sans perdre de cire." },
];

/** Deterministic per-day pick so every player sees the same whisper that day. */
export function whisperForDay(day: string): { en: string; fr: string } {
  let hash = 0;
  for (let i = 0; i < day.length; i++) hash = (hash * 31 + day.charCodeAt(i)) >>> 0;
  return WHISPERS[hash % WHISPERS.length];
}
