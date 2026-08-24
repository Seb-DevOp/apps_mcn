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
  floorStart,
  floorOf,
  LEVELS_PER_FLOOR,
  BASE_DROP_CHANCE,
  OFFLINE_CAP_SECONDS,
  MIN_KILL_SECONDS,
  BASE_MAX_HP,
  BASE_REGEN_SHARE,
  BASE_ATTACK_DAMAGE,
  BASE_ATTACK_SPEED,
  BASE_CRIT_CHANCE,
  BASE_CRIT_MULTIPLIER,
  BASE_DOUBLE_CHANCE,
  RECOVERY_SECONDS,
  AFFIX_KEYS,
  AFFIX_SLOTS,
  affixValue,
  parseAffixes,
  type Affix,
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

/**
 * A tick resolves at most this many steps — a fight or a recovery each.
 *
 * Generous on purpose: a cat that keeps dying spends two steps per attempt, so a
 * tight cap would silently stop simulating a long absence part-way through. The
 * loop body is a handful of multiplications, so the guard costs nothing.
 */
const MAX_STEPS_PER_TICK = 25_000;
/** And keeps at most this many drops, so one long absence cannot flood the table. */
const MAX_DROPS_PER_TICK = 25;

export interface Upgrades {
  attack: number;
  health: number;
  speed: number;
  crit: number;
  critDamage: number;
  double: number;
}

export interface DerivedStats {
  /** Damage of one ordinary blow. */
  hitDamage: number;
  attacksPerSecond: number;
  critChance: number;
  critMultiplier: number;
  /** Expected extra blows per swing. Unbounded: past 1 they are guaranteed. */
  extraStrikes: number;
  /** The product of all four — what the fight is actually resolved with. */
  power: number;
  maxHp: number;
  /** Health returned per second. Also the reason weak enemies stop mattering. */
  regen: number;
  goldMultiplier: number;
  dropChance: number;
}

interface ItemRow {
  slot: string;
  power: number;
  vitality: number;
  goldBonus: number;
  affixesJson: string;
  equippedSlot: string | null;
}

export function parseUpgrades(json: string): Upgrades {
  const base: Upgrades = {
    attack: 0,
    health: 0,
    speed: 0,
    crit: 0,
    critDamage: 0,
    double: 0,
  };
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
export function derive(items: ItemRow[], upgrades: Upgrades): DerivedStats {
  const worn = items.filter((item) => item.equippedSlot);
  const level = (key: keyof Upgrades) => upgrades[key];
  const per = (key: keyof Upgrades) => UPGRADE_BY_KEY[key].perLevel;

  // Bonuses stack by addition across worn pieces. Multiplying them would let a
  // full set of six compound into a factor nothing else in the game can answer;
  // added, a set is a sum the player can read off the screen and predict.
  const woreAffixes = worn.flatMap((item) => parseAffixes(item.affixesJson));
  const bonus = (key: keyof Upgrades) =>
    woreAffixes.reduce((sum, affix) => (affix.key === key ? sum + affix.value : sum), 0);

  // Equipment adds flat damage; Attack multiplies whatever that came to. A stat
  // that only added would be worthless by floor ten, and one that only multiplied
  // would make found gear pointless — both together is what keeps looting and
  // spending worth doing at the same time.
  const hitDamage =
    (BASE_ATTACK_DAMAGE + worn.reduce((sum, item) => sum + item.power, 0)) *
    Math.pow(1 + per("attack"), level("attack")) *
    (1 + bonus("attack"));

  const attacksPerSecond =
    BASE_ATTACK_SPEED * Math.pow(1 + per("speed"), level("speed")) * (1 + bonus("speed"));

  // A probability, so certainty is its ceiling. That is arithmetic, not a design
  // decision, and the upgrade's last level is exactly the one that reaches it.
  const critChance = Math.min(
    1,
    BASE_CRIT_CHANCE + level("crit") * per("crit") + bonus("crit"),
  );

  const critMultiplier =
    BASE_CRIT_MULTIPLIER *
    Math.pow(1 + per("critDamage"), level("critDamage")) *
    (1 + bonus("critDamage"));

  /**
   * Extra blows per swing, as an expectation.
   *
   * Below one it reads as a chance of striking twice. Past one it keeps its
   * meaning without a ceiling: 2.4 is two more certain blows and a 40% chance of
   * a third. Linear in levels bought — logarithmic in gold — so it never stops
   * paying and never disturbs the curve the exponential stats set.
   */
  const extraStrikes = BASE_DOUBLE_CHANCE + level("double") * per("double") + bonus("double");

  // The four offence stats meet here, and only here. Expected damage per second
  // is their product, which is why each of them is worth buying and why none of
  // them replaces another.
  const power =
    hitDamage *
    attacksPerSecond *
    (1 + critChance * (critMultiplier - 1)) *
    (1 + extraStrikes);

  const maxHp =
    (BASE_MAX_HP + worn.reduce((sum, item) => sum + item.vitality, 0)) *
    Math.pow(1 + per("health"), level("health")) *
    (1 + bonus("health"));

  // Healing is deliberately not purchasable. Bought without limit it eventually
  // exceeds any damage at any depth, and an immortal cat has no losing condition
  // left to play against.
  const regen = maxHp * BASE_REGEN_SHARE;

  const goldMultiplier = 1 + worn.reduce((sum, item) => sum + item.goldBonus, 0);
  const dropChance = BASE_DROP_CHANCE;

  return {
    hitDamage,
    attacksPerSecond,
    critChance,
    critMultiplier,
    extraStrikes,
    power: Math.max(1, power),
    maxHp: Math.max(1, maxHp),
    regen,
    goldMultiplier,
    dropChance,
  };
}

/**
 * One number for "is this cat stronger".
 *
 * Damage and health answer different curves and cannot be added, but a floor is
 * cleared by doing enough of one before running out of the other — so their
 * product is what a piece of equipment actually moves. It is a heuristic and is
 * named as one, but it is the same heuristic everywhere: what the recommendation
 * button optimises is exactly what the arrow next to an item promises.
 */
export function combatScore(stats: DerivedStats): number {
  return stats.power * stats.maxHp;
}

/**
 * What wearing this piece would do to that number, as a ratio.
 *
 * Computed by deriving the whole cat twice rather than comparing the item's own
 * numbers: with bonuses in play a weaker piece carrying +20% health can easily
 * beat a stronger plain one, and only the full derivation knows that.
 */
export function scoreWith(items: ItemRow[], upgrades: Upgrades, candidate: ItemRow): number {
  // Everything else the cat is wearing, minus whatever occupies this slot today.
  const rest = items.filter((item) => item.equippedSlot && item.slot !== candidate.slot);
  return combatScore(derive([...rest, { ...candidate, equippedSlot: candidate.slot }], upgrades));
}

export interface Drop {
  /** Filled in once the row exists, so the loot prompt can act on it. */
  id: string;
  slot: Slot;
  floor: number;
  rarity: Rarity;
  shape: string;
  power: number;
  vitality: number;
  goldBonus: number;
  affixes: Affix[];
  /** True when it went straight on — which now only happens on a bare slot. */
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
  /** How many times the cat was carried back to the start of its floor. */
  defeats: number;
  /** Guardians felled, each one healing the cat outright. */
  heals: number;
  drops: Drop[];
}

/**
 * Picks distinct bonuses for a piece. Distinct on purpose: two helpings of the
 * same statistic on one item read as one bigger number, which wastes the slot
 * that was supposed to make this piece different from the last one.
 */
function rollAffixes(rarity: Rarity): Affix[] {
  const slots = AFFIX_SLOTS[rarity];
  if (slots === 0) return [];

  const pool = [...AFFIX_KEYS];
  const picked: Affix[] = [];
  for (let n = 0; n < slots && pool.length > 0; n++) {
    const [key] = pool.splice(randomInt(0, pool.length - 1), 1);
    picked.push({ key, value: affixValue(key, rarity) });
  }
  return picked;
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
  state: {
    level: number;
    enemyHp: number;
    hp: number;
    recoverFor: number;
    highestLevel: number;
  },
  stats: DerivedStats,
): TickReport & {
  level: number;
  enemyHp: number;
  hp: number;
  recoverFor: number;
  highestLevel: number;
} {
  let { level, enemyHp, hp, recoverFor, highestLevel } = state;
  let remaining = seconds;
  // Gold comes from kills and from nothing else. Waiting is not an income.
  let goldEarned = 0;
  let kills = 0;
  let bossKills = 0;
  let levelsCleared = 0;
  let defeats = 0;
  let heals = 0;
  // Starts at one, not zero: a tick that opens on a defeat should not be read as
  // a fruitless loop, or a player checking in on a hard Guardian would be dropped
  // a floor for looking.
  let killsSinceDefeat = 1;
  const drops: Drop[] = [];

  const clampHp = (value: number) => Math.min(stats.maxHp, Math.max(0.0001, value));
  hp = clampHp(hp > 0 ? hp : stats.maxHp);

  for (let guard = 0; guard < MAX_STEPS_PER_TICK && remaining > 0; guard++) {
    // Lying down after a loss. Healing happens here too, unopposed.
    if (recoverFor > 0) {
      const spent = Math.min(remaining, recoverFor);
      recoverFor -= spent;
      remaining -= spent;
      hp = clampHp(hp + stats.regen * spent);
      continue;
    }

    const info = levelInfo(level);
    if (enemyHp <= 0) enemyHp = info.enemyHp;

    // Both sides grow exponentially, so at absurd depth both overflow to
    // Infinity and their ratio becomes NaN. Falling back to the floor keeps the
    // loop finite instead of silently producing a broken save.
    const ratio = enemyHp / stats.power;
    const timeToKill = Number.isFinite(ratio)
      ? Math.max(MIN_KILL_SECONDS, ratio)
      : MIN_KILL_SECONDS;

    // Regeneration and the enemy's damage are one net rate. Positive means the
    // cat is winning the exchange of blows and cannot lose this fight at all.
    const netHealth = stats.regen - info.enemyDamage;
    const timeToFall = netHealth < 0 ? hp / -netHealth : Number.POSITIVE_INFINITY;

    const decidedAt = Math.min(timeToKill, timeToFall);

    if (remaining < decidedAt) {
      // The tick runs out mid-fight: carry the wound and the enemy's wound over.
      enemyHp = Math.max(0.0001, enemyHp - stats.power * remaining);
      hp = clampHp(hp + netHealth * remaining);
      remaining = 0;
      break;
    }

    if (timeToFall < timeToKill) {
      // Beaten. Back to the first chamber of this floor, full health, but the
      // clock has been spent and the floor has to be walked again.
      remaining -= timeToFall;
      defeats += 1;

      // Falling twice without a single kill in between means the floor's own
      // first chamber is out of reach, and since gold only comes from kills the
      // cat would loop there for ever with no way to buy its way out. Dropping a
      // floor puts it back among enemies it can actually beat.
      const retreatTo = killsSinceDefeat === 0 ? Math.max(1, floorOf(level) - 1) : floorOf(level);
      level = (retreatTo - 1) * LEVELS_PER_FLOOR + 1;
      killsSinceDefeat = 0;

      enemyHp = 0;
      hp = stats.maxHp;
      recoverFor = RECOVERY_SECONDS;
      continue;
    }

    remaining -= timeToKill;
    hp = clampHp(hp + netHealth * timeToKill);
    goldEarned += info.goldReward * stats.goldMultiplier;
    kills += 1;
    killsSinceDefeat += 1;

    // A Guardian's fall is the floor's reward: the cat walks on at full health.
    // Without it the next floor opens on a cat that is already half dead, which
    // turns every boss into a wall on the chamber after it rather than on itself.
    if (info.isBoss) {
      bossKills += 1;
      hp = stats.maxHp;
      heals += 1;
    }

    const guaranteed = info.isBoss;
    if (drops.length < MAX_DROPS_PER_TICK && (guaranteed || Math.random() < stats.dropChance)) {
      const slot = SLOTS[randomInt(0, SLOTS.length - 1)];
      const rarity = rollRarity(info.floor);
      const rolled = itemStats(slot, info.floor, rarity);
      drops.push({
        slot,
        floor: info.floor,
        rarity,
        id: "",
        shape: shapeFor(slot, info.floor),
        power: rolled.power,
        vitality: rolled.vitality,
        goldBonus: rolled.goldBonus,
        affixes: rollAffixes(rarity),
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
    defeats,
    heals,
    drops,
    level,
    enemyHp,
    hp,
    recoverFor,
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
    data: { userId, enemyHp: levelInfo(1).enemyHp, hp: BASE_MAX_HP },
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
          defeats: 0,
          heals: 0,
          drops: [],
        } as TickReport,
      };
    }

    const stats = derive(items, upgrades);
    const result = simulate(
      seconds,
      {
        level: profile.level,
        enemyHp: profile.enemyHp,
        hp: profile.hp,
        recoverFor: profile.recoverFor,
        highestLevel: profile.highestLevel,
      },
      stats,
    );

    // Store the drops. Only an *empty* slot fills itself.
    //
    // Everything better used to go on automatically, which made the whole
    // equipment system invisible: pieces arrived, replaced themselves and were
    // never looked at. Filling a bare slot is still automatic, because a cat
    // wearing nothing has no decision to make and a new player should see the
    // first six pieces appear on it. After that, choosing is the game.
    const wornBySlot = new Map(items.filter((i) => i.equippedSlot).map((i) => [i.slot, i]));
    for (const drop of result.drops) {
      const bareSlot = !wornBySlot.has(drop.slot);

      const created = await tx.idleItem.create({
        data: {
          userId,
          slot: drop.slot,
          floor: drop.floor,
          rarity: drop.rarity,
          shape: drop.shape,
          power: drop.power,
          vitality: drop.vitality,
          goldBonus: drop.goldBonus,
          affixesJson: JSON.stringify(drop.affixes),
          equippedSlot: bareSlot ? drop.slot : null,
        },
      });
      drop.id = created.id;
      drop.equipped = bareSlot;
      if (bareSlot) wornBySlot.set(drop.slot, created);
    }

    const updated = await tx.idleProfile.update({
      where: { userId },
      data: {
        level: result.level,
        highestLevel: result.highestLevel,
        enemyHp: result.enemyHp,
        hp: result.hp,
        recoverFor: result.recoverFor,
        defeats: profile.defeats + result.defeats,
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
  profile: {
    level: number;
    highestLevel: number;
    enemyHp: number;
    hp: number;
    recoverFor: number;
    defeats: number;
    gold: number;
    totalGold: number;
    kills: number;
    bossKills: number;
    upgradesJson: string;
  },
  items: (ItemRow & { id: string; floor: number; rarity: string; shape: string; foundAt: Date })[],
  report: TickReport,
) {
  const upgrades = parseUpgrades(profile.upgradesJson);
  const stats = derive(items, upgrades);
  const info = levelInfo(profile.level);
  const enemyHp = profile.enemyHp > 0 ? profile.enemyHp : info.enemyHp;
  const hp = Math.min(stats.maxHp, profile.hp > 0 ? profile.hp : stats.maxHp);

  const baseline = combatScore(stats);

  const secondsToKill = Math.max(MIN_KILL_SECONDS, enemyHp / stats.power);
  const netHealth = stats.regen - info.enemyDamage;
  const secondsToFall = netHealth < 0 ? hp / -netHealth : Number.POSITIVE_INFINITY;

  return {
    level: info,
    enemyHp,
    enemyHpMax: info.enemyHp,
    hp,
    highestLevel: profile.highestLevel,
    gold: profile.gold,
    totalGold: profile.totalGold,
    kills: profile.kills,
    bossKills: profile.bossKills,
    defeats: profile.defeats,
    recoverFor: profile.recoverFor,
    stats,
    /** Seconds to kill the current enemy at the current power — the wall, made visible. */
    secondsToKill,
    /**
     * Seconds before the cat falls, or Infinity when it heals faster than it is
     * hurt. Comparing the two numbers is the whole verdict on a fight, so the
     * screen can name the problem instead of leaving the player to guess.
     */
    secondsToFall,
    outcome:
      secondsToFall < secondsToKill
        ? ("LOSING" as const)
        : secondsToKill > 90
          ? ("SLOW" as const)
          : ("WINNING" as const),
    upgrades: UPGRADES.map((def) => ({
      key: def.key,
      level: upgrades[def.key as keyof Upgrades],
      cost: upgradeCost(def, upgrades[def.key as keyof Upgrades]),
      maxed: def.maxLevel !== undefined && upgrades[def.key as keyof Upgrades] >= def.maxLevel,
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
      vitality: item.vitality,
      goldBonus: item.goldBonus,
      affixes: parseAffixes(item.affixesJson),
      // What wearing it would multiply the cat by. Above one is an upgrade, and
      // the screen can say so without the player doing the arithmetic.
      gain: item.equippedSlot ? 1 : scoreWith(items, upgrades, item) / baseline,
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

export type IdleError =
  | "UNKNOWN_UPGRADE"
  | "NOT_ENOUGH_GOLD"
  | "MAXED"
  | "NOT_FOUND"
  | "ALREADY_EQUIPPED";

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

    if (def.maxLevel !== undefined && level >= def.maxLevel) {
      return { ok: false as const, error: "MAXED" as const };
    }
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

/**
 * Wears the best piece the bag holds, slot by slot.
 *
 * "Best" is power, and that is enough: within one slot, power and vitality are
 * generated from the same floor and rarity, so they never disagree about which
 * piece is the better one.
 */
export async function equipBest(userId: string) {
  return prisma.$transaction(async (tx) => {
    const items = await tx.idleItem.findMany({ where: { userId } });
    const profile = await tx.idleProfile.findUnique({ where: { userId } });
    const upgrades = parseUpgrades(profile?.upgradesJson ?? "{}");
    let changed = 0;

    // One slot at a time, keeping each choice before making the next: bonuses
    // add across the whole set, so the best hat depends on what is already on the
    // shoulders. Solving all six at once would be the honest answer and a far
    // larger search; taking them in order, with the previous picks kept, gets the
    // same result in practice for a bag this size.
    const worn = [...items];

    for (const slot of SLOTS) {
      const forSlot = items.filter((item) => item.slot === slot);
      if (forSlot.length === 0) continue;

      const best = forSlot.reduce((a, b) =>
        scoreWith(worn, upgrades, b) > scoreWith(worn, upgrades, a) ? b : a,
      );
      if (best.equippedSlot) continue;

      for (const item of worn) {
        if (item.slot === slot) item.equippedSlot = item.id === best.id ? slot : null;
      }

      // The slot has to be emptied first: the unique index allows exactly one
      // worn piece per slot, and it is the database that enforces it.
      await tx.idleItem.updateMany({
        where: { userId, equippedSlot: slot },
        data: { equippedSlot: null },
      });
      await tx.idleItem.update({ where: { id: best.id }, data: { equippedSlot: slot } });
      changed += 1;
    }

    return { ok: true as const, changed };
  });
}

/**
 * Sells every spare below a rarity. The bag fills with commons far faster than
 * with anything worth reading, and clearing them one by one is not a game.
 */
export async function sellBelow(userId: string, rarity: string) {
  const threshold = RARITIES.indexOf(rarity as Rarity);
  if (threshold < 0) return { ok: false as const, error: "NOT_FOUND" as const };

  const below = RARITIES.slice(0, threshold);
  if (below.length === 0) return { ok: true as const, gold: 0, sold: 0 };

  return prisma.$transaction(async (tx) => {
    const spares = await tx.idleItem.findMany({
      where: { userId, equippedSlot: null, rarity: { in: below } },
    });
    if (spares.length === 0) return { ok: true as const, gold: 0, sold: 0 };

    const value = spares.reduce((sum, item) => sum + Math.max(1, Math.round(item.power * 4)), 0);
    await tx.idleItem.deleteMany({ where: { id: { in: spares.map((item) => item.id) } } });
    await tx.idleProfile.update({ where: { userId }, data: { gold: { increment: value } } });
    return { ok: true as const, gold: value, sold: spares.length };
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
