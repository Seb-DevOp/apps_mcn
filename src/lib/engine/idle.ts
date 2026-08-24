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
  RELICS,
  RELIC_BY_KEY,
  relicCost,
  relicsForFloor,
  REBIRTH_MIN_FLOOR,
  STRIKE_DAMAGE_MULTIPLIER,
  MAX_STRIKES_PER_SECOND,
  ROAR_COOLDOWN_SECONDS,
  ROAR_DAMAGE_SECONDS,
  BREATH_COOLDOWN_SECONDS,
  BREATH_SHIELD_SECONDS,
  UNLOCKS,
  unlocked,
  sealBonus,
  rebirthFloorFor,
  eliteLevel,
  ELITE_CHANCE,
  chestPrice,
  chestFloorRarity,
  CHEST_PITY,
  SKINS,
  SKIN_BY_KEY,
  PACK_SHARE,
  isPackSlot,
  packSlot,
  type Affix,
  type RelicKey,
  type Slot,
  type Rarity,
} from "@/lib/content/idle";
import { track } from "./analytics";
import type { SealBonus } from "@/lib/content/idle";

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

export type Relics = Record<RelicKey, number>;

/** Permanent bonuses. Same shape as the gold upgrades, different lifetime. */
export function parseRelics(json: string): Relics {
  const base: Relics = { memory: 0, tenacity: 0, greed: 0, luck: 0 };
  try {
    const parsed = JSON.parse(json) as Partial<Relics>;
    for (const key of Object.keys(base) as RelicKey[]) {
      const value = Number(parsed[key]);
      if (Number.isFinite(value) && value > 0) base[key] = Math.floor(value);
    }
  } catch {
    // A corrupt blob costs the player their relics' effect, not their session.
  }
  return base;
}

const NO_RELICS: Relics = { memory: 0, tenacity: 0, greed: 0, luck: 0 };

export interface DerivedStats {
  /** Damage of one ordinary blow. */
  hitDamage: number;
  attacksPerSecond: number;
  critChance: number;
  critMultiplier: number;
  /** Expected extra blows per swing. Unbounded: past 1 they are guaranteed. */
  extraStrikes: number;
  /** The matching set currently worn, if any — shown, not just applied. */
  seal: SealBonus;
  /** What the second cat contributes, already folded into `power`. */
  packPower: number;
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
  rarity: string;
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
export function derive(
  items: ItemRow[],
  upgrades: Upgrades,
  relics: Relics = NO_RELICS,
  /** Lives spent, because some of what the cat can do was brought back by them. */
  rebirths = 0,
  /** False while deriving the second cat, so it cannot recurse into a third. */
  withPack = true,
): DerivedStats {
  const worn = items.filter((item) => item.equippedSlot && !isPackSlot(item.equippedSlot));
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
  /**
   * Relics multiply on top of everything else and survive the rebirth that wipes
   * the rest. They are the only thing in the game that does.
   *
   * Their effect **adds** with the count, where every other multiplier in the
   * game compounds — and that inversion is deliberate. Relics owed grow
   * exponentially with the record floor, so the number of levels a player can
   * afford grows linearly with it; compounding on top of that would buy a fixed
   * *fraction* of the record every life, which makes the record itself geometric.
   * Measured, that ran to floor 366 in two days. Adding instead buys a head start
   * that grows slowly and never becomes the whole game.
   */
  const relic = (key: RelicKey) => 1 + relics[key] * RELIC_BY_KEY[key].perLevel;

  // Matching rarities across worn pieces. Zero until the second life brings the
  // Seals back, and zero below three matching — two happen by accident, and a
  // bonus you get by accident teaches nothing.
  const seal = unlocked("seals", rebirths)
    ? sealBonus(worn.map((item) => item.rarity as Rarity))
    : { count: 0, rarity: null, bonus: 0 };

  const hitDamage =
    (BASE_ATTACK_DAMAGE + worn.reduce((sum, item) => sum + item.power, 0)) *
    Math.pow(1 + per("attack"), level("attack")) *
    (1 + bonus("attack")) *
    relic("memory") *
    (1 + seal.bonus);

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
    (1 + bonus("health")) *
    relic("tenacity") *
    (1 + seal.bonus);

  // Healing is deliberately not purchasable. Bought without limit it eventually
  // exceeds any damage at any depth, and an immortal cat has no losing condition
  // left to play against.
  const regen = maxHp * BASE_REGEN_SHARE;

  /**
   * The second cat fights with the same upgrades and relics — it is the same
   * player — but only a share of what that comes to reaches the fight. A full
   * second cat would double every number on screen and halve the meaning of the
   * first; a third of one turns the bottom of the bag into something worth
   * dressing.
   */
  const packItems = withPack ? items.filter((item) => isPackSlot(item.equippedSlot)) : [];
  const packPower =
    packItems.length > 0 && unlocked("pack", rebirths)
      ? derive(
          packItems.map((item) => ({ ...item, equippedSlot: item.slot })),
          upgrades,
          relics,
          rebirths,
          false,
        ).power * PACK_SHARE
      : 0;

  const goldMultiplier =
    (1 + worn.reduce((sum, item) => sum + item.goldBonus, 0)) * relic("greed");

  const dropChance = Math.min(
    0.75,
    BASE_DROP_CHANCE + relics.luck * RELIC_BY_KEY.luck.perLevel,
  );

  return {
    hitDamage,
    attacksPerSecond,
    critChance,
    critMultiplier,
    extraStrikes,
    seal,
    packPower,
    power: Math.max(1, power + packPower),
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
export function scoreWith(
  items: ItemRow[],
  upgrades: Upgrades,
  candidate: ItemRow,
  relics: Relics = NO_RELICS,
  rebirths = 0,
): number {
  // Everything else the cat is wearing, minus whatever occupies this slot today.
  const rest = items.filter((item) => item.equippedSlot && item.slot !== candidate.slot);
  return combatScore(
    derive([...rest, { ...candidate, equippedSlot: candidate.slot }], upgrades, relics, rebirths),
  );
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
  /** True when the Nose turned it into gold instead. */
  sold: boolean;
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
  /** Finds the Nose turned into gold before they reached the bag. */
  autoSold: number;
  autoGold: number;
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

function rollRarity(floor: number, rebirths: number): Rarity {
  const weights = rarityWeights(floor, rebirths);
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
    elite: boolean;
    hp: number;
    recoverFor: number;
    shieldFor: number;
    highestLevel: number;
  },
  stats: DerivedStats,
  /** Elites only exist once a fourth life has brought them back. */
  elitesOpen = false,
  /** Lives spent — the top two rarities do not exist below theirs. */
  rebirths = 0,
): TickReport & {
  level: number;
  enemyHp: number;
  elite: boolean;
  hp: number;
  recoverFor: number;
  shieldFor: number;
  highestLevel: number;
} {
  let { level, enemyHp, elite, hp, recoverFor, shieldFor, highestLevel } = state;
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

    // An Elite is rolled when the enemy walks in, not when the state is read —
    // otherwise refreshing the page would be a reroll.
    if (enemyHp <= 0) {
      elite = elitesOpen && Math.random() < ELITE_CHANCE;
    }
    const info = elite ? eliteLevel(levelInfo(level)) : levelInfo(level);
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
    // While the Breath holds, the enemy's half of that rate is simply absent.
    const shielded = shieldFor > 0;
    const netHealth = shielded ? stats.regen : stats.regen - info.enemyDamage;
    const timeToFall = netHealth < 0 ? hp / -netHealth : Number.POSITIVE_INFINITY;

    // The shield running out is an event like any other: the rates change when it
    // does, so the step has to stop there rather than average across it.
    const decidedAt = Math.min(
      timeToKill,
      timeToFall,
      shielded ? shieldFor : Number.POSITIVE_INFINITY,
    );

    if (remaining < decidedAt) {
      // The tick runs out mid-fight: carry the wound and the enemy's wound over.
      enemyHp = Math.max(0.0001, enemyHp - stats.power * remaining);
      hp = clampHp(hp + netHealth * remaining);
      if (shielded) shieldFor = Math.max(0, shieldFor - remaining);
      remaining = 0;
      break;
    }

    if (shielded && shieldFor < timeToKill && shieldFor < timeToFall) {
      // Nothing died and nobody fell — the Breath simply stopped. Chip what the
      // cat managed in that window and let the loop reprice the fight.
      remaining -= shieldFor;
      enemyHp = Math.max(0.0001, enemyHp - stats.power * shieldFor);
      hp = clampHp(hp + netHealth * shieldFor);
      shieldFor = 0;
      continue;
    }

    if (shielded) shieldFor = Math.max(0, shieldFor - decidedAt);

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
      elite = false;
      hp = stats.maxHp;
      recoverFor = RECOVERY_SECONDS;
      shieldFor = 0;
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

    const guaranteed = info.isBoss || elite;
    if (drops.length < MAX_DROPS_PER_TICK && (guaranteed || Math.random() < stats.dropChance)) {
      const slot = SLOTS[randomInt(0, SLOTS.length - 1)];
      // An Elite always leaves something, and something better than the floor
      // would otherwise give — one tier up, which is the whole reward for the
      // six times the health.
      const rolled = rollRarity(info.floor, rebirths);
      const rarity = elite
        ? RARITIES[Math.min(RARITIES.length - 1, RARITIES.indexOf(rolled) + 1)]
        : rolled;
      const stats2 = itemStats(slot, info.floor, rarity);
      drops.push({
        slot,
        floor: info.floor,
        rarity,
        id: "",
        shape: shapeFor(slot, info.floor),
        power: stats2.power,
        vitality: stats2.vitality,
        goldBonus: stats2.goldBonus,
        affixes: rollAffixes(rarity),
        equipped: false,
        sold: false,
      });
    }

    level += 1;
    levelsCleared += 1;
    highestLevel = Math.max(highestLevel, level);
    enemyHp = 0;
    elite = false;
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
    autoSold: 0,
    autoGold: 0,
    drops,
    level,
    enemyHp,
    elite,
    hp,
    recoverFor,
    shieldFor,
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
          autoSold: 0,
          autoGold: 0,
          drops: [],
        } as TickReport,
      };
    }

    const relics = parseRelics(profile.relicsJson);
    const stats = derive(items, upgrades, relics, profile.rebirths);
    const result = simulate(
      seconds,
      {
        level: profile.level,
        enemyHp: profile.enemyHp,
        elite: profile.enemyElite,
        hp: profile.hp,
        recoverFor: profile.recoverFor,
        shieldFor: profile.shieldFor,
        highestLevel: profile.highestLevel,
      },
      stats,
      unlocked("elites", profile.rebirths),
      profile.rebirths,
    );

    // Store the drops. Only an *empty* slot fills itself.
    //
    // Everything better used to go on automatically, which made the whole
    // equipment system invisible: pieces arrived, replaced themselves and were
    // never looked at. Filling a bare slot is still automatic, because a cat
    // wearing nothing has no decision to make and a new player should see the
    // first six pieces appear on it. After that, choosing is the game.
    const wornBySlot = new Map(items.filter((i) => i.equippedSlot).map((i) => [i.slot, i]));

    // The Nose. A find below the chosen rarity never reaches the bag at all —
    // it is turned into gold where it lies, which is the whole point of not
    // having to open the bag after every absence.
    const sellBelowIndex =
      unlocked("flair", profile.rebirths) && profile.autoSellBelow
        ? RARITIES.indexOf(profile.autoSellBelow as Rarity)
        : -1;
    let autoSold = 0;
    let autoGold = 0;

    for (const drop of result.drops) {
      const bareSlot = !wornBySlot.has(drop.slot);

      if (!bareSlot && sellBelowIndex > 0 && RARITIES.indexOf(drop.rarity) < sellBelowIndex) {
        autoSold += 1;
        autoGold += Math.max(1, Math.round(drop.power * 4));
        drop.sold = true;
        continue;
      }

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

    result.autoSold = autoSold;
    result.autoGold = autoGold;

    const updated = await tx.idleProfile.update({
      where: { userId },
      data: {
        level: result.level,
        highestLevel: result.highestLevel,
        enemyHp: result.enemyHp,
        enemyElite: result.elite,
        hp: result.hp,
        recoverFor: result.recoverFor,
        shieldFor: result.shieldFor,
        defeats: profile.defeats + result.defeats,
        gold: profile.gold + result.goldEarned + autoGold,
        totalGold: profile.totalGold + result.goldEarned + autoGold,
        kills: profile.kills + result.kills,
        bossKills: profile.bossKills + result.bossKills,
        totalLevels: profile.totalLevels + result.levelsCleared,
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
    enemyElite: boolean;
    hp: number;
    recoverFor: number;
    defeats: number;
    gold: number;
    totalGold: number;
    kills: number;
    bossKills: number;
    upgradesJson: string;
    relics: number;
    relicsEarned: number;
    rebirths: number;
    relicsJson: string;
    lastRoarAt: Date;
    lastBreathAt: Date;
    shieldFor: number;
    autoSellBelow: string;
    chestsOpened: number;
    skinKey: string;
    skinsJson: string;
  },
  items: (ItemRow & { id: string; floor: number; rarity: string; shape: string; foundAt: Date })[],
  report: TickReport,
) {
  const upgrades = parseUpgrades(profile.upgradesJson);
  const relics = parseRelics(profile.relicsJson);
  const stats = derive(items, upgrades, relics, profile.rebirths);
  const base = levelInfo(profile.level);
  const info = profile.enemyElite ? eliteLevel(base) : base;
  const enemyHp = profile.enemyHp > 0 ? profile.enemyHp : info.enemyHp;
  const hp = Math.min(stats.maxHp, profile.hp > 0 ? profile.hp : stats.maxHp);

  const baseline = combatScore(stats);

  const secondsToKill = Math.max(MIN_KILL_SECONDS, enemyHp / stats.power);
  const netHealth = stats.regen - info.enemyDamage;
  const secondsToFall = netHealth < 0 ? hp / -netHealth : Number.POSITIVE_INFINITY;

  return {
    level: info,
    elite: profile.enemyElite,
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
    /** Rebirth: what a life is worth, and whether one can be spent yet. */
    rebirth: (() => {
      const bestFloor = levelInfo(profile.highestLevel).floor;
      const owed = Math.max(0, relicsForFloor(bestFloor) - profile.relicsEarned);
      return {
        relics: profile.relics,
        earned: profile.relicsEarned,
        rebirths: profile.rebirths,
        bestFloor,
        minFloor: rebirthFloorFor(profile.rebirths),
        /** Granted the moment a life is spent — zero until a record is beaten. */
        owed,
        ready: bestFloor >= rebirthFloorFor(profile.rebirths),
      };
    })(),

    relicShop: RELICS.map((def) => ({
      key: def.key,
      level: relics[def.key],
      cost: relicCost(def, relics[def.key]),
      maxed: def.maxLevel !== undefined && relics[def.key] >= def.maxLevel,
      affordable: profile.relics >= relicCost(def, relics[def.key]),
      nameEn: def.nameEn,
      nameFr: def.nameFr,
      descEn: def.descEn,
      descFr: def.descFr,
      icon: def.icon,
    })),

    /** The five rungs, and which of them this cat has climbed. */
    unlocks: UNLOCKS.map((def) => ({
      key: def.key,
      rebirths: def.rebirths,
      open: profile.rebirths >= def.rebirths,
      nameEn: def.nameEn,
      nameFr: def.nameFr,
      descEn: def.descEn,
      descFr: def.descFr,
      icon: def.icon,
    })),

    shop: {
      chestPrice: chestPrice(profile.level),
      chestsOpened: profile.chestsOpened,
      /** How many more before the guaranteed one. Shown, not implied. */
      untilGuaranteed: CHEST_PITY - (profile.chestsOpened % CHEST_PITY),
      guaranteedRarity: chestFloorRarity(profile.rebirths),
      pity: CHEST_PITY,
      skinKey: profile.skinKey,
      skins: SKINS.map((skin) => ({
        key: skin.key,
        nameEn: skin.nameEn,
        nameFr: skin.nameFr,
        price: skin.price,
        owned: skin.price === 0 || parseSkins(profile.skinsJson).includes(skin.key),
        worn: profile.skinKey === skin.key,
      })),
    },

    autoSellBelow: profile.autoSellBelow,
    shieldFor: profile.shieldFor,
    breathIn: Math.max(
      0,
      BREATH_COOLDOWN_SECONDS - (Date.now() - profile.lastBreathAt.getTime()) / 1000,
    ),
    breathCooldown: BREATH_COOLDOWN_SECONDS,

    /** Seconds left on the Roar, so the button can show a ring rather than a lie. */
    roarIn: Math.max(
      0,
      ROAR_COOLDOWN_SECONDS - (Date.now() - profile.lastRoarAt.getTime()) / 1000,
    ),
    roarCooldown: ROAR_COOLDOWN_SECONDS,

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
      /** Which cat wears it, when one does. */
      onPack: isPackSlot(item.equippedSlot),
      // What wearing it would multiply the cat by. Above one is an upgrade, and
      // the screen can say so without the player doing the arithmetic.
      gain: item.equippedSlot ? 1 : scoreWith(items, upgrades, item, relics, profile.rebirths) / baseline,
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

export async function equipItem(userId: string, itemId: string, onPack = false) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.idleItem.findFirst({ where: { id: itemId, userId } });
    if (!item) return { ok: false as const, error: "NOT_FOUND" as const };
    if (item.equippedSlot) return { ok: false as const, error: "ALREADY_EQUIPPED" as const };

    if (onPack) {
      const profile = await tx.idleProfile.findUnique({ where: { userId } });
      if (!unlocked("pack", profile?.rebirths ?? 0)) {
        return { ok: false as const, error: "LOCKED" as const };
      }
    }

    const target = onPack ? packSlot(item.slot as Slot) : item.slot;

    // Free the slot first — the unique index allows only one worn piece per slot,
    // and the prefix makes that one index cover both cats.
    await tx.idleItem.updateMany({
      where: { userId, equippedSlot: target },
      data: { equippedSlot: null },
    });
    await tx.idleItem.update({ where: { id: item.id }, data: { equippedSlot: target } });
    return { ok: true as const };
  });
}

/** Takes a piece off whichever cat is wearing it, back into the bag. */
export async function unequipItem(userId: string, itemId: string) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.idleItem.findFirst({ where: { id: itemId, userId } });
    if (!item) return { ok: false as const, error: "NOT_FOUND" as const };
    await tx.idleItem.update({ where: { id: item.id }, data: { equippedSlot: null } });
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
    const relics = parseRelics(profile?.relicsJson ?? "{}");
    const rebirths = profile?.rebirths ?? 0;
    let changed = 0;

    // One slot at a time, keeping each choice before making the next: bonuses
    // add across the whole set, so the best hat depends on what is already on the
    // shoulders. Solving all six at once would be the honest answer and a far
    // larger search; taking them in order, with the previous picks kept, gets the
    // same result in practice for a bag this size.
    const worn = [...items];

    for (const slot of SLOTS) {
      const forSlot = items.filter((item) => item.slot === slot && !isPackSlot(item.equippedSlot));
      if (forSlot.length === 0) continue;

      const best = forSlot.reduce((a, b) =>
        scoreWith(worn, upgrades, b, relics, rebirths) > scoreWith(worn, upgrades, a, relics, rebirths)
          ? b
          : a,
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

// ---------------------------------------------------------------------------
// Rebirth, and the two things a player does with their hands
// ---------------------------------------------------------------------------

/**
 * Spends a life.
 *
 * Level, gold, gold upgrades and every piece of equipment go. Relics, the relics
 * already spent, and the record depth stay — the record because relics are owed
 * on it, so wiping it would let the same floor be sold twice.
 *
 * Relics are granted for beating the record and for nothing else. Paying per run
 * would make rebirthing at floor fifteen a farm, and a farm is the opposite of a
 * reason to go deeper.
 */
export async function rebirth(userId: string) {
  // Settle the clock first: the last seconds before a rebirth might be the ones
  // that set the record it pays for.
  await getIdleState(userId);

  return prisma.$transaction(async (tx) => {
    const profile = await tx.idleProfile.findUniqueOrThrow({ where: { userId } });
    const bestFloor = levelInfo(profile.highestLevel).floor;

    if (bestFloor < rebirthFloorFor(profile.rebirths)) {
      return { ok: false as const, error: "TOO_SHALLOW" as const };
    }

    const owed = Math.max(0, relicsForFloor(bestFloor) - profile.relicsEarned);

    await tx.idleItem.deleteMany({ where: { userId } });
    await tx.idleProfile.update({
      where: { userId },
      data: {
        level: 1,
        enemyHp: levelInfo(1).enemyHp,
        hp: 0,
        recoverFor: 0,
        gold: 0,
        upgradesJson: "{}",
        relics: profile.relics + owed,
        relicsEarned: profile.relicsEarned + owed,
        rebirths: profile.rebirths + 1,
        lastTickAt: new Date(),
      },
    });

    await track("idle.rebirth", userId, { floor: bestFloor, relics: owed });
    return { ok: true as const, relics: owed, floor: bestFloor };
  });
}

/** Spends relics on something that outlives every future rebirth. */
export async function buyRelic(userId: string, key: string) {
  const def = RELIC_BY_KEY[key];
  if (!def) return { ok: false as const, error: "UNKNOWN_UPGRADE" as const };

  return prisma.$transaction(async (tx) => {
    const profile = await tx.idleProfile.findUniqueOrThrow({ where: { userId } });
    const relics = parseRelics(profile.relicsJson);
    const level = relics[key as RelicKey];

    if (def.maxLevel !== undefined && level >= def.maxLevel) {
      return { ok: false as const, error: "MAXED" as const };
    }
    const cost = relicCost(def, level);
    if (profile.relics < cost) return { ok: false as const, error: "NOT_ENOUGH_RELICS" as const };

    relics[key as RelicKey] = level + 1;
    await tx.idleProfile.update({
      where: { userId },
      data: { relics: profile.relics - cost, relicsJson: JSON.stringify(relics) },
    });
    return { ok: true as const, level: level + 1 };
  });
}

/**
 * Taps. The enemy takes them; the kill itself is left to the next tick.
 *
 * Wounding the enemy and letting `simulate` finish it keeps every reward — gold,
 * the level, the drop, the Guardian's heal — flowing through the one path that
 * grants them. Resolving the kill here would mean a second copy of that logic,
 * and two copies of a reward path is how a game ends up paying twice.
 *
 * The count is clamped by the time since the last tap, so a script gains nothing
 * a fast thumb would not.
 */
export async function strike(userId: string, count: number) {
  const state = await getIdleState(userId);

  return prisma.$transaction(async (tx) => {
    const profile = await tx.idleProfile.findUniqueOrThrow({ where: { userId } });
    const now = new Date();
    const elapsed = Math.max(0, (now.getTime() - profile.lastStrikeAt.getTime()) / 1000);
    const allowed = Math.floor(Math.min(count, elapsed * MAX_STRIKES_PER_SECOND + 1));
    if (allowed <= 0) return { ok: true as const, damage: 0, landed: 0 };

    const damage = state.stats.hitDamage * STRIKE_DAMAGE_MULTIPLIER * allowed;
    await tx.idleProfile.update({
      where: { userId },
      data: {
        enemyHp: Math.max(0.0001, profile.enemyHp - damage),
        lastStrikeAt: now,
      },
    });
    return { ok: true as const, damage, landed: allowed };
  });
}

/** The Roar: one minute of the cat's own damage, at once, every three minutes. */
export async function roar(userId: string) {
  const state = await getIdleState(userId);

  return prisma.$transaction(async (tx) => {
    const profile = await tx.idleProfile.findUniqueOrThrow({ where: { userId } });
    const now = new Date();
    const since = (now.getTime() - profile.lastRoarAt.getTime()) / 1000;
    if (since < ROAR_COOLDOWN_SECONDS) {
      return { ok: false as const, error: "COOLING_DOWN" as const };
    }

    const damage = state.stats.power * ROAR_DAMAGE_SECONDS;
    await tx.idleProfile.update({
      where: { userId },
      data: {
        enemyHp: Math.max(0.0001, profile.enemyHp - damage),
        lastRoarAt: now,
      },
    });
    return { ok: true as const, damage };
  });
}

/**
 * The Breath: heal completely, and let nothing land for fifteen seconds.
 *
 * The immunity is stored as seconds owed rather than an expiry timestamp,
 * because the tick resolver works in elapsed spans and not in wall clock — the
 * same reason everything else here does.
 */
export async function breath(userId: string) {
  await getIdleState(userId);

  return prisma.$transaction(async (tx) => {
    const profile = await tx.idleProfile.findUniqueOrThrow({ where: { userId } });
    if (!unlocked("breath", profile.rebirths)) {
      return { ok: false as const, error: "LOCKED" as const };
    }

    const since = (Date.now() - profile.lastBreathAt.getTime()) / 1000;
    if (since < BREATH_COOLDOWN_SECONDS) {
      return { ok: false as const, error: "COOLING_DOWN" as const };
    }

    const items = await tx.idleItem.findMany({ where: { userId } });
    const stats = derive(
      items,
      parseUpgrades(profile.upgradesJson),
      parseRelics(profile.relicsJson),
      profile.rebirths,
    );

    await tx.idleProfile.update({
      where: { userId },
      data: {
        hp: stats.maxHp,
        shieldFor: BREATH_SHIELD_SECONDS,
        recoverFor: 0,
        lastBreathAt: new Date(),
      },
    });
    return { ok: true as const };
  });
}

/** Chooses what the Nose sells on sight. An empty string keeps everything. */
export async function setAutoSell(userId: string, rarity: string) {
  const valid = rarity === "" || RARITIES.includes(rarity as Rarity);
  if (!valid) return { ok: false as const, error: "NOT_FOUND" as const };

  return prisma.$transaction(async (tx) => {
    const profile = await tx.idleProfile.findUniqueOrThrow({ where: { userId } });
    if (!unlocked("flair", profile.rebirths)) {
      return { ok: false as const, error: "LOCKED" as const };
    }
    await tx.idleProfile.update({ where: { userId }, data: { autoSellBelow: rarity } });
    return { ok: true as const };
  });
}

// ---------------------------------------------------------------------------
// The shop
// ---------------------------------------------------------------------------

/**
 * Buys one chest: a piece from the floor you have reached, rolled on your own
 * odds — the ones lives have opened, not a separate table.
 *
 * Every tenth is guaranteed to floor at a rarity your rebirths have earned.
 * Randomness that can be unlucky forty times running is not a shop, it is a
 * grievance, and the counter is shown so the promise can be watched arriving.
 */
export async function buyChest(userId: string) {
  await getIdleState(userId);

  return prisma.$transaction(async (tx) => {
    const profile = await tx.idleProfile.findUniqueOrThrow({ where: { userId } });
    const price = chestPrice(profile.level);
    if (profile.gold < price) return { ok: false as const, error: "NOT_ENOUGH_GOLD" as const };

    const guaranteed = (profile.chestsOpened + 1) % CHEST_PITY === 0;
    // The floor you are on, for the same reason as the price: buying a record
    // floor piece at a first floor price is a rebirth away from free.
    const floor = levelInfo(profile.level).floor;

    const rolled = rollRarity(floor, profile.rebirths);
    const rarity = guaranteed
      ? RARITIES[
          Math.max(
            RARITIES.indexOf(rolled),
            RARITIES.indexOf(chestFloorRarity(profile.rebirths)),
          )
        ]
      : rolled;

    const slot = SLOTS[randomInt(0, SLOTS.length - 1)];
    const stats = itemStats(slot, floor, rarity);

    const item = await tx.idleItem.create({
      data: {
        userId,
        slot,
        floor,
        rarity,
        shape: shapeFor(slot, floor),
        power: stats.power,
        vitality: stats.vitality,
        goldBonus: stats.goldBonus,
        affixesJson: JSON.stringify(rollAffixes(rarity)),
        equippedSlot: null,
      },
    });

    await tx.idleProfile.update({
      where: { userId },
      data: { gold: profile.gold - price, chestsOpened: profile.chestsOpened + 1 },
    });

    await track("idle.chest", userId, { rarity, guaranteed });
    return { ok: true as const, itemId: item.id, rarity, guaranteed };
  });
}

/** Buys a coat, or puts one already owned back on. */
export async function buySkin(userId: string, key: string) {
  const def = SKIN_BY_KEY[key];
  if (!def) return { ok: false as const, error: "NOT_FOUND" as const };

  return prisma.$transaction(async (tx) => {
    const profile = await tx.idleProfile.findUniqueOrThrow({ where: { userId } });
    const owned = parseSkins(profile.skinsJson);

    if (owned.includes(key) || def.price === 0) {
      await tx.idleProfile.update({ where: { userId }, data: { skinKey: key } });
      return { ok: true as const, worn: true };
    }

    if (profile.gold < def.price) return { ok: false as const, error: "NOT_ENOUGH_GOLD" as const };

    await tx.idleProfile.update({
      where: { userId },
      data: {
        gold: profile.gold - def.price,
        skinKey: key,
        skinsJson: JSON.stringify([...owned, key]),
      },
    });
    return { ok: true as const, worn: true };
  });
}

/** A corrupt blob costs the player their wardrobe display, not their session. */
export function parseSkins(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}
