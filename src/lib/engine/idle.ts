import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { randomInt } from "@/lib/rng";
import {
  SLOTS,
  RARITIES,
  UPGRADE_BY_KEY,
  UPGRADES,
  upgradeCost,
  levelInfo,
  itemStats,
  shapeFor,
  rarityWeights,
  BASE_DROP_CHANCE,
  OFFLINE_CAP_SECONDS,
  MIN_KILL_SECONDS,
  type Slot,
  type Rarity,
} from "@/lib/content/idle";
import { track } from "./analytics";

/**
 * The idle engine.
 *
 * Everything is computed from `lastTickAt`, never from a timer. Reading the state
 * *is* playing the game: the server takes the elapsed seconds, resolves what the
 * cat did with them, and writes the result. The client is only ever a display.
 *
 * That single decision gives three things at once — offline progress, an
 * unforgeable clock, and no background jobs to keep alive on a serverless host.
 */

/** A tick resolves at most this many kills. Reached only in absurd cases. */
const MAX_KILLS_PER_TICK = 3000;
/** And keeps at most this many drops, so one long absence cannot flood the table. */
const MAX_DROPS_PER_TICK = 25;

/** Base power of a cat wearing nothing at all — enough to clear the first floor. */
const BASE_POWER = 5;

/**
 * Gold still accrues while the cat is stuck on an enemy it cannot kill.
 *
 * Without this a wall is a dead end: no kills, no gold, no way to buy the upgrade
 * that would break the wall. With it, being stuck is a pause rather than a stop —
 * which is what "idle" is supposed to mean.
 */
const STALLED_INCOME_SHARE = 0.08;

export interface Upgrades {
  claws: number;
  fervour: number;
  instinct: number;
  fortune: number;
}

export interface DerivedStats {
  power: number;
  goldMultiplier: number;
  dropChance: number;
  passiveGoldPerSecond: number;
}

interface ItemRow {
  slot: string;
  power: number;
  goldBonus: number;
  equippedSlot: string | null;
}

export function parseUpgrades(json: string): Upgrades {
  const base: Upgrades = { claws: 0, fervour: 0, instinct: 0, fortune: 0 };
  try {
    const parsed = JSON.parse(json) as Partial<Upgrades>;
    for (const key of Object.keys(base) as (keyof Upgrades)[]) {
      const value = Number(parsed[key]);
      if (Number.isFinite(value) && value > 0) base[key] = Math.floor(value);
    }
  } catch {
    // A corrupt blob means a fresh cat, never a crash.
  }
  return base;
}

/**
 * What the cat is currently worth.
 *
 * Flat sources add first, then Fervour multiplies the total — so an upgrade that
 * looked small early keeps mattering later, which is what keeps a long game from
 * flattening out.
 */
export function derive(items: ItemRow[], upgrades: Upgrades, highestLevel: number): DerivedStats {
  const worn = items.filter((item) => item.equippedSlot);

  const flatPower = worn.reduce((sum, item) => sum + item.power, 0);
  const power =
    (BASE_POWER + flatPower + upgrades.claws * UPGRADE_BY_KEY.claws.perLevel) *
    (1 + upgrades.fervour * UPGRADE_BY_KEY.fervour.perLevel);

  const goldMultiplier =
    (1 + upgrades.instinct * UPGRADE_BY_KEY.instinct.perLevel) *
    (1 + worn.reduce((sum, item) => sum + item.goldBonus, 0));

  const dropChance = Math.min(
    0.75,
    BASE_DROP_CHANCE + upgrades.fortune * UPGRADE_BY_KEY.fortune.perLevel,
  );

  const passiveGoldPerSecond =
    levelInfo(highestLevel).goldReward * STALLED_INCOME_SHARE * goldMultiplier;

  return {
    power: Math.max(1, power),
    goldMultiplier,
    dropChance,
    passiveGoldPerSecond,
  };
}

export interface Drop {
  slot: Slot;
  floor: number;
  rarity: Rarity;
  shape: string;
  power: number;
  goldBonus: number;
  /** True when it beat what the cat was wearing and went straight on. */
  equipped: boolean;
}

export interface TickReport {
  seconds: number;
  /** Seconds not paid because the absence exceeded the cap. */
  discardedSeconds: number;
  goldEarned: number;
  kills: number;
  bossKills: number;
  levelsCleared: number;
  drops: Drop[];
}

function rollRarity(floor: number): Rarity {
  const weights = rarityWeights(floor);
  const total = weights.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = (randomInt(0, 1_000_000) / 1_000_000) * total;
  for (const entry of weights) {
    roll -= entry.weight;
    if (roll <= 0) return entry.rarity;
  }
  return RARITIES[0];
}

/**
 * Resolves elapsed time into progress. Pure: it reads no clock and writes no row,
 * which is what makes it testable and what lets the caller decide the boundaries.
 */
export function simulate(
  seconds: number,
  state: { level: number; enemyHp: number; highestLevel: number },
  stats: DerivedStats,
): TickReport & { level: number; enemyHp: number; highestLevel: number } {
  let { level, enemyHp, highestLevel } = state;
  let remaining = seconds;
  let goldEarned = stats.passiveGoldPerSecond * seconds;
  let kills = 0;
  let bossKills = 0;
  let levelsCleared = 0;
  const drops: Drop[] = [];

  for (let guard = 0; guard < MAX_KILLS_PER_TICK && remaining > 0; guard++) {
    const info = levelInfo(level);
    if (enemyHp <= 0) enemyHp = info.enemyHp;

    const timeToKill = Math.max(MIN_KILL_SECONDS, enemyHp / stats.power);

    if (remaining < timeToKill) {
      // Not enough time to finish this one: chip away and stop.
      enemyHp = Math.max(0.0001, enemyHp - stats.power * remaining);
      remaining = 0;
      break;
    }

    remaining -= timeToKill;
    goldEarned += info.goldReward * stats.goldMultiplier;
    kills += 1;
    if (info.isBoss) bossKills += 1;

    const guaranteed = info.isBoss;
    if (drops.length < MAX_DROPS_PER_TICK && (guaranteed || Math.random() < stats.dropChance)) {
      const slot = SLOTS[randomInt(0, SLOTS.length - 1)];
      const rarity = rollRarity(info.floor);
      const rolled = itemStats(slot, info.floor, rarity);
      drops.push({
        slot,
        floor: info.floor,
        rarity,
        shape: shapeFor(slot, info.floor),
        power: rolled.power,
        goldBonus: rolled.goldBonus,
        equipped: false,
      });
    }

    level += 1;
    levelsCleared += 1;
    highestLevel = Math.max(highestLevel, level);
    enemyHp = 0;
  }

  return {
    seconds,
    discardedSeconds: 0,
    goldEarned,
    kills,
    bossKills,
    levelsCleared,
    drops,
    level,
    enemyHp,
    highestLevel,
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

async function loadOrCreate(tx: Prisma.TransactionClient, userId: string) {
  const existing = await tx.idleProfile.findUnique({ where: { userId } });
  if (existing) return existing;
  return tx.idleProfile.create({
    data: { userId, enemyHp: levelInfo(1).enemyHp },
  });
}

/**
 * Advances the game to now and returns everything a screen needs.
 *
 * Called on every read, which is deliberate: there is no other tick, so a player
 * who never opens the app simply banks time until they do.
 */
export async function getIdleState(userId: string) {
  const { profile, items, report } = await prisma.$transaction(async (tx) => {
    const profile = await loadOrCreate(tx, userId);
    const items = await tx.idleItem.findMany({ where: { userId } });
    const upgrades = parseUpgrades(profile.upgradesJson);

    const now = new Date();
    const rawSeconds = Math.max(0, (now.getTime() - profile.lastTickAt.getTime()) / 1000);
    const seconds = Math.min(rawSeconds, OFFLINE_CAP_SECONDS);
    const discardedSeconds = rawSeconds - seconds;

    if (seconds < 0.5) {
      return {
        profile,
        items,
        report: {
          seconds: 0,
          discardedSeconds,
          goldEarned: 0,
          kills: 0,
          bossKills: 0,
          levelsCleared: 0,
          drops: [],
        } as TickReport,
      };
    }

    const stats = derive(items, upgrades, profile.highestLevel);
    const result = simulate(
      seconds,
      { level: profile.level, enemyHp: profile.enemyHp, highestLevel: profile.highestLevel },
      stats,
    );

    // Store the drops, equipping anything that beats what is worn. An idle game
    // that requires manual sorting after every absence is not idle.
    const wornBySlot = new Map(items.filter((i) => i.equippedSlot).map((i) => [i.slot, i]));
    for (const drop of result.drops) {
      const worn = wornBySlot.get(drop.slot);
      const better = !worn || drop.power > worn.power;

      if (better && worn) {
        await tx.idleItem.update({ where: { id: worn.id }, data: { equippedSlot: null } });
      }

      const created = await tx.idleItem.create({
        data: {
          userId,
          slot: drop.slot,
          floor: drop.floor,
          rarity: drop.rarity,
          shape: drop.shape,
          power: drop.power,
          goldBonus: drop.goldBonus,
          equippedSlot: better ? drop.slot : null,
        },
      });
      drop.equipped = better;
      if (better) wornBySlot.set(drop.slot, created);
    }

    const updated = await tx.idleProfile.update({
      where: { userId },
      data: {
        level: result.level,
        highestLevel: result.highestLevel,
        enemyHp: result.enemyHp,
        gold: profile.gold + result.goldEarned,
        totalGold: profile.totalGold + result.goldEarned,
        kills: profile.kills + result.kills,
        bossKills: profile.bossKills + result.bossKills,
        lastTickAt: now,
      },
    });

    const freshItems = await tx.idleItem.findMany({ where: { userId } });
    return {
      profile: updated,
      items: freshItems,
      report: { ...result, discardedSeconds } as TickReport,
    };
  });

  return view(profile, items, report);
}

function view(
  profile: { level: number; highestLevel: number; enemyHp: number; gold: number; totalGold: number; kills: number; bossKills: number; upgradesJson: string },
  items: (ItemRow & { id: string; floor: number; rarity: string; shape: string; foundAt: Date })[],
  report: TickReport,
) {
  const upgrades = parseUpgrades(profile.upgradesJson);
  const stats = derive(items, upgrades, profile.highestLevel);
  const info = levelInfo(profile.level);
  const enemyHp = profile.enemyHp > 0 ? profile.enemyHp : info.enemyHp;

  return {
    level: info,
    enemyHp,
    enemyHpMax: info.enemyHp,
    highestLevel: profile.highestLevel,
    gold: profile.gold,
    totalGold: profile.totalGold,
    kills: profile.kills,
    bossKills: profile.bossKills,
    stats,
    /** Seconds to kill the current enemy at the current power — the wall, made visible. */
    secondsToKill: Math.max(MIN_KILL_SECONDS, enemyHp / stats.power),
    upgrades: UPGRADES.map((def) => ({
      key: def.key,
      level: upgrades[def.key as keyof Upgrades],
      cost: upgradeCost(def, upgrades[def.key as keyof Upgrades]),
      affordable: profile.gold >= upgradeCost(def, upgrades[def.key as keyof Upgrades]),
      nameEn: def.nameEn,
      nameFr: def.nameFr,
      descEn: def.descEn,
      descFr: def.descFr,
      icon: def.icon,
    })),
    items: items.map((item) => ({
      id: item.id,
      slot: item.slot as Slot,
      floor: item.floor,
      rarity: item.rarity as Rarity,
      shape: item.shape,
      power: item.power,
      goldBonus: item.goldBonus,
      equipped: Boolean(item.equippedSlot),
    })),
    report,
    offlineCapSeconds: OFFLINE_CAP_SECONDS,
  };
}

export type IdleState = Awaited<ReturnType<typeof getIdleState>>;

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type IdleError = "UNKNOWN_UPGRADE" | "NOT_ENOUGH_GOLD" | "NOT_FOUND" | "ALREADY_EQUIPPED";

export async function buyUpgrade(userId: string, key: string) {
  const def = UPGRADE_BY_KEY[key];
  if (!def) return { ok: false as const, error: "UNKNOWN_UPGRADE" as const };

  // Settle time first: gold earned while away must be spendable immediately.
  await getIdleState(userId);

  const result = await prisma.$transaction(async (tx) => {
    const profile = await tx.idleProfile.findUniqueOrThrow({ where: { userId } });
    const upgrades = parseUpgrades(profile.upgradesJson);
    const level = upgrades[key as keyof Upgrades];
    const cost = upgradeCost(def, level);

    if (profile.gold < cost) return { ok: false as const, error: "NOT_ENOUGH_GOLD" as const };

    upgrades[key as keyof Upgrades] = level + 1;
    await tx.idleProfile.update({
      where: { userId },
      data: { gold: profile.gold - cost, upgradesJson: JSON.stringify(upgrades) },
    });
    return { ok: true as const, level: level + 1, spent: cost };
  });

  if (result.ok) await track("idle.upgrade", userId, { key, level: result.level });
  return result;
}

export async function equipItem(userId: string, itemId: string) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.idleItem.findFirst({ where: { id: itemId, userId } });
    if (!item) return { ok: false as const, error: "NOT_FOUND" as const };
    if (item.equippedSlot) return { ok: false as const, error: "ALREADY_EQUIPPED" as const };

    // Free the slot first — the unique index allows only one worn piece per slot.
    await tx.idleItem.updateMany({
      where: { userId, equippedSlot: item.slot },
      data: { equippedSlot: null },
    });
    await tx.idleItem.update({ where: { id: item.id }, data: { equippedSlot: item.slot } });
    return { ok: true as const };
  });
}

/** Spares turn back into gold, so a full bag is never a chore. */
export async function sellItem(userId: string, itemId: string) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.idleItem.findFirst({ where: { id: itemId, userId } });
    if (!item) return { ok: false as const, error: "NOT_FOUND" as const };
    if (item.equippedSlot) return { ok: false as const, error: "ALREADY_EQUIPPED" as const };

    const value = Math.max(1, Math.round(item.power * 4));
    await tx.idleItem.delete({ where: { id: item.id } });
    await tx.idleProfile.update({
      where: { userId },
      data: { gold: { increment: value } },
    });
    return { ok: true as const, gold: value };
  });
}

/** Sells every spare at once. The bag-management button. */
export async function sellAllSpares(userId: string) {
  return prisma.$transaction(async (tx) => {
    const spares = await tx.idleItem.findMany({ where: { userId, equippedSlot: null } });
    if (spares.length === 0) return { ok: true as const, gold: 0, sold: 0 };

    const value = spares.reduce((sum, item) => sum + Math.max(1, Math.round(item.power * 4)), 0);
    await tx.idleItem.deleteMany({ where: { userId, equippedSlot: null } });
    await tx.idleProfile.update({ where: { userId }, data: { gold: { increment: value } } });
    return { ok: true as const, gold: value, sold: spares.length };
  });
}
