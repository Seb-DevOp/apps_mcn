/**
 * Daily and weekly missions.
 *
 * Missions are assigned per player per period and stored server-side. Progress
 * is only ever moved by trusted server events (a scored game, a claimed chest),
 * never by a client saying "I did it".
 */

export type MissionScope = "DAILY" | "WEEKLY";

export type MissionGoal =
  | "OPEN_CHEST"
  | "PLAY_GAME"
  | "EARN_XP"
  | "GAME_SCORE"
  | "COLLECT_SHARDS"
  | "KEEP_STREAK"
  | "VISIT_VAULT"
  | "COLLECT_ITEMS";

export interface MissionReward {
  type: "XP" | "SHARD" | "ITEM";
  itemKey?: string;
  qty: number;
}

export interface MissionDefinition {
  key: string;
  scope: MissionScope;
  goalType: MissionGoal;
  goalTarget: number;
  nameEn: string;
  nameFr: string;
  rewards: MissionReward[];
  minRankOrder?: number;
  weight?: number;
}

export const DAILY_MISSIONS: MissionDefinition[] = [
  {
    key: "d-open-chest",
    scope: "DAILY",
    goalType: "OPEN_CHEST",
    goalTarget: 1,
    nameEn: "Open today's chest",
    nameFr: "Ouvrir le coffre du jour",
    rewards: [{ type: "XP", qty: 30 }],
    weight: 0, // always assigned — see pickDailyMissions
  },
  {
    key: "d-play-1",
    scope: "DAILY",
    goalType: "PLAY_GAME",
    goalTarget: 1,
    nameEn: "Play one Resonance run",
    nameFr: "Jouer une session de Résonance",
    rewards: [{ type: "XP", qty: 25 }, { type: "SHARD", qty: 5 }],
    weight: 0, // always assigned
  },
  {
    key: "d-play-3",
    scope: "DAILY",
    goalType: "PLAY_GAME",
    goalTarget: 3,
    nameEn: "Play three Resonance runs",
    nameFr: "Jouer trois sessions de Résonance",
    rewards: [{ type: "XP", qty: 60 }, { type: "ITEM", itemKey: "mat-stone-dust", qty: 2 }],
    weight: 120,
  },
  {
    key: "d-earn-150",
    scope: "DAILY",
    goalType: "EARN_XP",
    goalTarget: 150,
    nameEn: "Earn 150 XP today",
    nameFr: "Gagner 150 XP aujourd'hui",
    rewards: [{ type: "SHARD", qty: 12 }],
    weight: 120,
  },
  {
    key: "d-earn-400",
    scope: "DAILY",
    goalType: "EARN_XP",
    goalTarget: 400,
    nameEn: "Earn 400 XP today",
    nameFr: "Gagner 400 XP aujourd'hui",
    rewards: [{ type: "SHARD", qty: 25 }, { type: "ITEM", itemKey: "mat-gold-leaf", qty: 1 }],
    weight: 90,
    minRankOrder: 1,
  },
  {
    key: "d-score-600",
    scope: "DAILY",
    goalType: "GAME_SCORE",
    goalTarget: 600,
    nameEn: "Score 600 in a single run",
    nameFr: "Marquer 600 points en une session",
    rewards: [{ type: "XP", qty: 45 }, { type: "ITEM", itemKey: "mat-iron-thread", qty: 2 }],
    weight: 110,
  },
  {
    key: "d-score-1200",
    scope: "DAILY",
    goalType: "GAME_SCORE",
    goalTarget: 1200,
    nameEn: "Score 1200 in a single run",
    nameFr: "Marquer 1200 points en une session",
    rewards: [{ type: "XP", qty: 90 }, { type: "ITEM", itemKey: "mat-sapphire-shard", qty: 1 }],
    weight: 70,
    minRankOrder: 1,
  },
  {
    key: "d-shards-40",
    scope: "DAILY",
    goalType: "COLLECT_SHARDS",
    goalTarget: 40,
    nameEn: "Collect 40 Vault Shards",
    nameFr: "Récolter 40 Éclats du Vault",
    rewards: [{ type: "XP", qty: 50 }],
    weight: 100,
  },
  {
    key: "d-visit-vault",
    scope: "DAILY",
    goalType: "VISIT_VAULT",
    goalTarget: 1,
    nameEn: "Walk the Vault",
    nameFr: "Parcourir le Vault",
    rewards: [{ type: "XP", qty: 20 }, { type: "SHARD", qty: 4 }],
    weight: 110,
  },
  {
    key: "d-keep-streak",
    scope: "DAILY",
    goalType: "KEEP_STREAK",
    goalTarget: 1,
    nameEn: "Keep your streak alive",
    nameFr: "Maintenir votre série",
    rewards: [{ type: "XP", qty: 35 }],
    weight: 90,
  },
];

export const WEEKLY_MISSIONS: MissionDefinition[] = [
  {
    key: "w-play-15",
    scope: "WEEKLY",
    goalType: "PLAY_GAME",
    goalTarget: 15,
    nameEn: "Complete 15 runs this week",
    nameFr: "Terminer 15 sessions cette semaine",
    rewards: [
      { type: "XP", qty: 350 },
      { type: "ITEM", itemKey: "mat-sapphire-shard", qty: 2 },
    ],
    weight: 100,
  },
  {
    key: "w-chest-5",
    scope: "WEEKLY",
    goalType: "OPEN_CHEST",
    goalTarget: 5,
    nameEn: "Open 5 daily chests",
    nameFr: "Ouvrir 5 coffres quotidiens",
    rewards: [
      { type: "XP", qty: 300 },
      { type: "ITEM", itemKey: "mat-gold-leaf", qty: 3 },
    ],
    weight: 100,
  },
  {
    key: "w-earn-2500",
    scope: "WEEKLY",
    goalType: "EARN_XP",
    goalTarget: 2500,
    nameEn: "Earn 2,500 XP this week",
    nameFr: "Gagner 2 500 XP cette semaine",
    rewards: [
      { type: "SHARD", qty: 150 },
      { type: "ITEM", itemKey: "frag-scepter", qty: 1 },
    ],
    weight: 100,
  },
  {
    key: "w-streak-5",
    scope: "WEEKLY",
    goalType: "KEEP_STREAK",
    goalTarget: 5,
    nameEn: "Return 5 days this week",
    nameFr: "Revenir 5 jours cette semaine",
    rewards: [
      { type: "XP", qty: 400 },
      { type: "ITEM", itemKey: "boost-xp-24h", qty: 1 },
    ],
    weight: 100,
  },
  {
    key: "w-collect-10",
    scope: "WEEKLY",
    goalType: "COLLECT_ITEMS",
    goalTarget: 10,
    nameEn: "Collect 10 materials or fragments",
    nameFr: "Récolter 10 matériaux ou fragments",
    rewards: [
      { type: "XP", qty: 250 },
      { type: "SHARD", qty: 80 },
    ],
    weight: 100,
  },
  {
    key: "w-score-2000",
    scope: "WEEKLY",
    goalType: "GAME_SCORE",
    goalTarget: 2000,
    nameEn: "Score 2000 in a single run",
    nameFr: "Marquer 2000 points en une session",
    rewards: [
      { type: "XP", qty: 500 },
      { type: "ITEM", itemKey: "key-crystal", qty: 1 },
    ],
    weight: 80,
    minRankOrder: 2,
  },
];

export const ALL_MISSIONS = [...DAILY_MISSIONS, ...WEEKLY_MISSIONS];

export const MISSION_BY_KEY: Record<string, MissionDefinition> = Object.fromEntries(
  ALL_MISSIONS.map((m) => [m.key, m]),
);

/** Missions with weight 0 are pinned: every player gets them every day. */
export const PINNED_DAILY = DAILY_MISSIONS.filter((m) => (m.weight ?? 100) === 0);
