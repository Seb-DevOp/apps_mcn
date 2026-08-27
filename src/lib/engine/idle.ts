import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dayKey, msUntilNextDay } from "@/lib/time";
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
  sealBonusFor,
  BOOSTS,
  BOOST_BY_KEY,
  BOOST_FACTOR,
  CALENDAR,
  CALENDAR_DAYS,
  CALENDAR_SKIN_FALLBACK_GEMS,
  calendarDay,
  calendarSkinFor,
  type BoostKey,
  rebirthFloorFor,
  eliteLevel,
  ELITE_CHANCE,
  gemsForGuardian,
  ELITE_GEMS,
  CHEST_GEMS,
  chestFloorRarity,
  CHEST_PITY,
  SKINS,
  SKIN_BY_KEY,
  PACK_SHARE,
  FORGE_COST,
  rageFactor,
  shortcutFloor,
  catCount,
  catOfSlot,
  catPrefix,
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

/** The coats the extra cats wear. Missing entries mean "same as the first". */
export function parseCatSkins(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 2).map((entry) => (typeof entry === "string" ? entry : ""));
  } catch {
    // A corrupt blob costs the player a colour, not their cats.
    return [];
  }
}

export type Boosts = Record<BoostKey, number>;

/**
 * Seconds left on the running boost.
 *
 * The truth is an absolute end time, never a countdown written back on every
 * tick: a stored countdown drifts with the tick rate and stops entirely while
 * the game is closed, which is the one thing an idle game must not do.
 */
export function boostSecondsLeft(profile: { boostKey: string; boostUntil: Date }): number {
  if (!profile.boostKey) return 0;
  return Math.max(0, (profile.boostUntil.getTime() - Date.now()) / 1000);
}

/**
 * What a running boost does to a blow struck by hand.
 *
 * The boost lives in `simulate` rather than in `derive`, which keeps item
 * comparisons honest — and left the two things the player does with their own
 * thumb outside it. "x2 damage" that doubles everything except the damage you
 * deal yourself is a label that lies.
 */
export function damageBoostFactor(profile: { boostKey: string; boostUntil: Date }): number {
  return profile.boostKey === "damage" && boostSecondsLeft(profile) > 0 ? BOOST_FACTOR : 1;
}

/** How many of each boost are held. Same shape and same forgiveness as upgrades. */
export function parseBoosts(json: string): Boosts {
  const base: Boosts = { gold: 0, damage: 0, loot: 0 };
  try {
    const parsed = JSON.parse(json) as Partial<Boosts>;
    for (const key of Object.keys(base) as BoostKey[]) {
      const value = Number(parsed[key]);
      if (Number.isFinite(value) && value > 0) base[key] = Math.floor(value);
    }
  } catch {
    // A corrupt blob costs the player their unspent boosts, not their session.
  }
  return base;
}

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
  /**
   * One share per extra cat, each derived from what it is actually wearing.
   *
   * Summed rather than averaged: a third cat in nothing adds nothing, and a
   * third cat in the bag's leftovers adds a third of what those leftovers are
   * worth. The bag has three floors to furnish now instead of two.
   */
  const packPower = withPack
    ? [1, 2].reduce((total, cat) => {
        if (cat >= catCount(rebirths)) return total;
        const worn = items.filter((item) => catOfSlot(item.equippedSlot) === cat);
        if (worn.length === 0) return total;
        return (
          total +
          derive(
            worn.map((item) => ({ ...item, equippedSlot: item.slot })),
            upgrades,
            relics,
            rebirths,
            false,
          ).power *
            PACK_SHARE
        );
      }, 0)
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
 *
 * The **square root** of that product, though, and the root is the whole point.
 *
 * A raw product is a squared quantity: it is measured in damage-times-health,
 * so a piece 4.7 times better moves it by twenty-two, and the screen read
 * "120No became 2.6Dc" for a single swap. Nobody can hold that. The geometric
 * mean is the same ranking — a square root is monotonic, so the recommendation
 * button and every arrow keep their order — expressed in the units the six
 * statistics are already in. The gain a piece promises becomes the factor the
 * cat actually gets stronger by, rather than its square.
 */
export function combatScore(stats: DerivedStats): number {
  return Math.sqrt(stats.power * stats.maxHp);
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
  /** Gems the Guardians and Elites left. */
  gemsEarned: number;
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
    /** The boost running, if one is, and the seconds it has left. */
    boostKey: string;
    boostFor: number;
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
  boostKey: string;
  boostFor: number;
} {
  let { level, enemyHp, elite, hp, recoverFor, shieldFor, highestLevel } = state;
  let { boostKey, boostFor } = state;
  let remaining = seconds;
  // Gold comes from kills and from nothing else. Waiting is not an income.
  let goldEarned = 0;
  let kills = 0;
  let bossKills = 0;
  let levelsCleared = 0;
  let defeats = 0;
  let heals = 0;
  let gemsEarned = 0;
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
      boostFor = Math.max(0, boostFor - spent);
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
    /**
     * What the running boost multiplies, and nothing else.
     *
     * Deliberately applied here rather than in `derive`: derived stats are what
     * the cat *is*, and they are what item comparisons and the combat score are
     * built on. A boost that leaked into `derive` would make every "+18 %" in
     * the bag swing by a factor of two for twenty minutes.
     */
    /**
     * Fury, if a life has been spent on it.
     *
     * Read fresh every iteration because the streak grows with every kill — it
     * is the one multiplier in the fight that the fight itself moves. Capped, so
     * a cat that has not fallen in an hour is twice as strong and never more.
     */
    const rage = unlocked("rage", rebirths) ? rageFactor(killsSinceDefeat) : 1;

    const boosted = boostFor > 0;
    const power =
      (boosted && boostKey === "damage" ? stats.power * BOOST_FACTOR : stats.power) * rage;
    const goldMultiplier =
      boosted && boostKey === "gold" ? stats.goldMultiplier * BOOST_FACTOR : stats.goldMultiplier;
    const dropChance =
      boosted && boostKey === "loot"
        ? Math.min(1, stats.dropChance * BOOST_FACTOR)
        : stats.dropChance;

    const ratio = enemyHp / power;
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
    // Three things can end a step: the enemy dies, the cat falls, or one of the
    // two timers runs out. Averaging across a timer would pay the boost for
    // seconds it did not cover.
    const decidedAt = Math.min(
      timeToKill,
      timeToFall,
      shielded ? shieldFor : Number.POSITIVE_INFINITY,
      boosted ? boostFor : Number.POSITIVE_INFINITY,
    );

    if (remaining < decidedAt) {
      // The tick runs out mid-fight: carry the wound and the enemy's wound over.
      enemyHp = Math.max(0.0001, enemyHp - power * remaining);
      hp = clampHp(hp + netHealth * remaining);
      if (shielded) shieldFor = Math.max(0, shieldFor - remaining);
      if (boosted) boostFor = Math.max(0, boostFor - remaining);
      remaining = 0;
      break;
    }

    if (decidedAt < timeToKill && decidedAt < timeToFall) {
      // Nothing died and nobody fell — a timer simply stopped. Chip what the cat
      // managed in that window and let the loop reprice the fight at the new
      // rates.
      remaining -= decidedAt;
      enemyHp = Math.max(0.0001, enemyHp - power * decidedAt);
      hp = clampHp(hp + netHealth * decidedAt);
      if (shielded) shieldFor = Math.max(0, shieldFor - decidedAt);
      if (boosted) boostFor = Math.max(0, boostFor - decidedAt);
      continue;
    }

    if (shielded) shieldFor = Math.max(0, shieldFor - decidedAt);
    if (boosted) boostFor = Math.max(0, boostFor - decidedAt);

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
    goldEarned += info.goldReward * goldMultiplier;
    kills += 1;
    killsSinceDefeat += 1;

    // A Guardian's fall is the floor's reward: the cat walks on at full health.
    // Without it the next floor opens on a cat that is already half dead, which
    // turns every boss into a wall on the chamber after it rather than on itself.
    if (info.isBoss) {
      bossKills += 1;
      hp = stats.maxHp;
      heals += 1;
      gemsEarned += gemsForGuardian(info.floor);
    }
    if (elite) gemsEarned += ELITE_GEMS;

    const guaranteed = info.isBoss || elite;
    if (drops.length < MAX_DROPS_PER_TICK && (guaranteed || Math.random() < dropChance)) {
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
    gemsEarned,
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
    boostKey,
    boostFor,
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
          gemsEarned: 0,
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
        boostKey: profile.boostKey,
        boostFor: boostSecondsLeft(profile),
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
    const wornBySlot = new Map(
      items.filter((i) => i.equippedSlot && !isPackSlot(i.equippedSlot)).map((i) => [i.slot, i]),
    );

    /**
     * Instinct gives back what the first five lives took away.
     *
     * Everything better used to go on by itself, which made the whole equipment
     * system invisible — so it was removed and choosing became the game. Five
     * lives of choosing is enough to have learnt it; after that, opening a bag
     * to do what the recommendation button would have done is not a decision,
     * it is a chore.
     */
    const instinct = unlocked("instinct", profile.rebirths);
    const baseScore = combatScore(stats);
    // Only the fields a derivation reads: the rows themselves carry ids and
    // dates that a score has no use for.
    let dressed: ItemRow[] = items;

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

      // Better than what is on, when Instinct is awake. The verdict is the one
      // the bag and the recommendation button already use, so the three can never
      // disagree about what "better" means.
      const candidate = {
        slot: drop.slot,
        power: drop.power,
        vitality: drop.vitality,
        goldBonus: drop.goldBonus,
        rarity: drop.rarity,
        affixesJson: JSON.stringify(drop.affixes),
        equippedSlot: null as string | null,
      };
      const wear =
        bareSlot ||
        (instinct &&
          scoreWith(dressed, upgrades, candidate, relics, profile.rebirths) > baseScore);

      if (wear && !bareSlot) {
        const previous = wornBySlot.get(drop.slot);
        if (previous) {
          await tx.idleItem.update({ where: { id: previous.id }, data: { equippedSlot: null } });
        }
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
          equippedSlot: wear ? drop.slot : null,
        },
      });
      drop.id = created.id;
      drop.equipped = wear;
      if (wear) {
        wornBySlot.set(drop.slot, created);
        // The next drop of this tick has to be judged against the cat wearing
        // this one, or two finds in one tick would both be measured against a
        // cat that no longer exists.
        dressed = [
          ...dressed.map((item) =>
            item.equippedSlot === drop.slot ? { ...item, equippedSlot: null } : item,
          ),
          { ...candidate, equippedSlot: drop.slot },
        ];
      }
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
        gems: profile.gems + result.gemsEarned,
        gemsEarned: profile.gemsEarned + result.gemsEarned,
        // A boost that ran out during the tick is cleared here rather than left
        // for every reader to subtract two dates for themselves.
        boostKey: boostSecondsLeft(profile) > 0 ? profile.boostKey : "",
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
    calendarDay: number;
    calendarCycle: number;
    calendarDayKey: string;
    boostsJson: string;
    boostKey: string;
    boostUntil: Date;
    gems: number;
    gemsEarned: number;
    chestsOpened: number;
    skinKey: string;
    skinsJson: string;
    catSkinsJson: string;
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

    /**
     * One number for how strong the cat is, so every other number can be read
     * against it.
     *
     * It is `combatScore` — the same product the recommendation button optimises
     * and the same one each spare's `gain` is a ratio of. Showing it turns "+18 %"
     * into a quantity: the player can see what a piece is worth without owning the
     * arithmetic, and can see a piece that would cost them power just as plainly.
     */
    score: baseline,

    /**
     * The matching set, and the rung above it.
     *
     * `sealBonus` only ever returns the best one, which is the right answer for
     * the fight and a useless one for the bag: it cannot say "one more Epic and
     * this doubles". Every rarity actually worn is listed with what it pays now
     * and what one more piece would pay.
     */
    seals: {
      open: unlocked("seals", profile.rebirths),
      active: stats.seal,
      worn: RARITIES.map((rarity) => {
        const count = items.filter(
          (item) => item.equippedSlot && !isPackSlot(item.equippedSlot) && item.rarity === rarity,
        ).length;
        return {
          rarity,
          count,
          bonus: sealBonusFor(rarity, count),
          /** What the next matching piece would be worth. Six is the last rung. */
          next: count < 6 ? sealBonusFor(rarity, count + 1) : null,
        };
      }).filter((tier) => tier.count > 0),
    },

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
        /**
         * Everything this record is worth, paid and unpaid.
         *
         * Shown next to `owed` because on its own `owed` is a difference, and a
         * difference read as a total is what makes a hundred relics look either
         * enormous or insulting depending on the player's guess.
         */
        total: relicsForFloor(bestFloor),
        ready: bestFloor >= rebirthFloorFor(profile.rebirths),
      };
    })(),

    /**
     * The relic shop, and what the levels already bought are actually worth.
     *
     * A card that only says "+15% damage per level" leaves the player to
     * multiply in their head, which nobody does — so relics were bought blind
     * and their effect never seen. `held` is the number the fight uses.
     *
     * Three of them multiply and Fortune does not: it adds percentage points to
     * a probability, so it is reported as points and flagged.
     */
    relicShop: RELICS.map((def) => {
      const level = relics[def.key];
      const value = (at: number) => (def.key === "luck" ? at * def.perLevel : 1 + at * def.perLevel);
      return {
        key: def.key,
        level,
        cost: relicCost(def, level),
        maxed: def.maxLevel !== undefined && level >= def.maxLevel,
        affordable: profile.relics >= relicCost(def, level),
        held: value(level),
        next: value(level + 1),
        /** True when `held` reads as a multiplier rather than as points. */
        factor: def.key !== "luck",
        nameEn: def.nameEn,
        nameFr: def.nameFr,
        unitEn: def.unitEn,
        unitFr: def.unitFr,
        descEn: def.descEn,
        descFr: def.descFr,
        icon: def.icon,
      };
    }),

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
      gems: profile.gems,
      gemsEarned: profile.gemsEarned,
      chestPrice: CHEST_GEMS,
      chestsOpened: profile.chestsOpened,
      /** How many more before the guaranteed one. Shown, not implied. */
      untilGuaranteed: CHEST_PITY - (profile.chestsOpened % CHEST_PITY),
      guaranteedRarity: chestFloorRarity(profile.rebirths),
      pity: CHEST_PITY,
      skinKey: profile.skinKey,
      /** One entry per extra cat; an empty string means it wears the first's. */
      catSkins: parseCatSkins(profile.catSkinsJson),
      // A calendar coat appears here only once it has been won: listing one at
      // a price of zero would read as a free coat nobody had bothered to take.
      skins: SKINS.filter(
        (skin) => !skin.calendar || parseSkins(profile.skinsJson).includes(skin.key),
      ).map((skin) => ({
        key: skin.key,
        nameEn: skin.nameEn,
        nameFr: skin.nameFr,
        price: skin.price,
        calendar: skin.calendar ?? false,
        owned: skin.price === 0 || parseSkins(profile.skinsJson).includes(skin.key),
        worn: profile.skinKey === skin.key,
      })),
    },

    /**
     * The thirty doors, and which one is next.
     *
     * A missed day costs the day and nothing else, so this is a count rather
     * than a grid of dates: door seven is door seven whether it is opened on
     * Tuesday or a fortnight later. What the screen still needs is *when* the
     * next one can be opened, which is the next UTC midnight.
     */
    calendar: {
      day: profile.calendarDay,
      cycle: profile.calendarCycle,
      claimable: profile.calendarDayKey !== dayKey(),
      /** Seconds to the next UTC midnight — only meaningful once claimed. */
      nextInSeconds: Math.round(msUntilNextDay() / 1000),
      total: CALENDAR_DAYS,
      /** The coat this calendar is holding at door fifteen, if any is left. */
      skin: calendarSkinFor(profile.calendarCycle),
      days: CALENDAR.map((entry) => ({
        day: entry.day,
        kind: entry.kind,
        amount: entry.amount,
        boost: entry.boost ?? null,
        opened: entry.day < profile.calendarDay,
        next: entry.day === profile.calendarDay,
      })),
    },

    boosts: {
      owned: parseBoosts(profile.boostsJson),
      active: profile.boostKey
        ? { key: profile.boostKey, secondsLeft: Math.round(boostSecondsLeft(profile)) }
        : null,
      catalogue: BOOSTS.map((def) => ({
        key: def.key,
        seconds: def.seconds,
        factor: BOOST_FACTOR,
        price: def.price,
        affordable: profile.gems >= def.price,
        nameEn: def.nameEn,
        nameFr: def.nameFr,
        descEn: def.descEn,
        descFr: def.descFr,
        icon: def.icon,
      })),
    },

    /** How many cats the ladder has given back, including the first. */
    cats: catCount(profile.rebirths),
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
      /** 0 for the player's own cat, 1 and 2 for the Pack and the Pride. */
      cat: catOfSlot(item.equippedSlot),
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
  | "NOT_ENOUGH_GEMS"
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

export async function equipItem(userId: string, itemId: string, cat = 0) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.idleItem.findFirst({ where: { id: itemId, userId } });
    if (!item) return { ok: false as const, error: "NOT_FOUND" as const };
    if (item.equippedSlot) return { ok: false as const, error: "ALREADY_EQUIPPED" as const };

    // Cat 0 is the player's own; 1 and 2 are the two the ladder gives back,
    // and each has to have been paid for.
    if (cat > 0) {
      const profile = await tx.idleProfile.findUnique({ where: { userId } });
      if (cat >= catCount(profile?.rebirths ?? 0)) {
        return { ok: false as const, error: "LOCKED" as const };
      }
    }

    const target = cat > 0 ? packSlot(item.slot as Slot, cat) : item.slot;

    // Free the slot first — the unique index allows only one worn piece per slot,
    // and the prefix makes that one index cover all three cats.
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
export async function equipBest(userId: string, cat = 0) {
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
      // What this cat could wear: the spares, plus what it already has on. A
      // piece on another cat is not a spare — it is busy.
      const forSlot = items.filter(
        (item) =>
          item.slot === slot &&
          (item.equippedSlot === null || catOfSlot(item.equippedSlot) === cat),
      );
      if (forSlot.length === 0) continue;

      const best = forSlot.reduce((a, b) =>
        scoreWith(worn, upgrades, b, relics, rebirths) > scoreWith(worn, upgrades, a, relics, rebirths)
          ? b
          : a,
      );
      const target = cat > 0 ? packSlot(slot, cat) : slot;
      if (best.equippedSlot === target) continue;

      for (const item of worn) {
        if (item.slot === slot && catOfSlot(item.equippedSlot) === cat) {
          item.equippedSlot = item.id === best.id ? target : null;
        }
      }

      // The slot has to be emptied first: the unique index allows exactly one
      // worn piece per slot per cat, and it is the database that enforces it.
      await tx.idleItem.updateMany({
        where: { userId, equippedSlot: target },
        data: { equippedSlot: null },
      });
      await tx.idleItem.update({ where: { id: best.id }, data: { equippedSlot: target } });
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

    /**
     * The Shortcut: where the new life begins.
     *
     * Halfway up the record rather than at the bottom, once a life has been
     * spent on it. It needs no safety net: a cat that starts above what it can
     * hold falls, and the defeat rule already walks it back down a floor at a
     * time until it finds ground it can fight on.
     *
     * Read against the life being spent, not the one just ended.
     */
    const startLevel = unlocked("shortcut", profile.rebirths + 1)
      ? (shortcutFloor(bestFloor) - 1) * LEVELS_PER_FLOOR + 1
      : 1;

    const owed = Math.max(0, relicsForFloor(bestFloor) - profile.relicsEarned);

    await tx.idleItem.deleteMany({ where: { userId } });
    await tx.idleProfile.update({
      where: { userId },
      data: {
        level: startLevel,
        enemyHp: levelInfo(startLevel).enemyHp,
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

    const damage =
      state.stats.hitDamage * STRIKE_DAMAGE_MULTIPLIER * allowed * damageBoostFactor(profile);
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

    const damage = state.stats.power * ROAR_DAMAGE_SECONDS * damageBoostFactor(profile);
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
 * The Breath: heal completely, and let nothing land for ten seconds.
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

/**
 * Opens today's door.
 *
 * Server-side in every part that matters: which door is next, whether today has
 * already been used, and what the door holds. The client is told the table so it
 * can draw it, and is never asked what it thinks it should get.
 *
 * Gold is paid as minutes of the cat's *own* income at the moment of opening.
 * A fixed number of gold is either an insult or an exploit depending on the
 * floor, because gold is exponential in depth and a calendar is not.
 */
export async function claimCalendar(userId: string) {
  // Settle time first: the gold rate this pays is the rate the cat has now.
  await getIdleState(userId);

  return prisma.$transaction(async (tx) => {
    const profile = await tx.idleProfile.findUniqueOrThrow({ where: { userId } });
    const today = dayKey();
    if (profile.calendarDayKey === today) {
      return { ok: false as const, error: "ALREADY_TODAY" as const };
    }

    const door = calendarDay(profile.calendarDay);
    const boosts = parseBoosts(profile.boostsJson);
    const skins = parseSkins(profile.skinsJson);

    let gems = 0;
    let gold = 0;
    let skin: string | null = null;
    let boost: BoostKey | null = null;

    if (door.kind === "GEMS") {
      gems = door.amount;
    } else if (door.kind === "GOLD") {
      const items = await tx.idleItem.findMany({ where: { userId } });
      const stats = derive(
        items,
        parseUpgrades(profile.upgradesJson),
        parseRelics(profile.relicsJson),
        profile.rebirths,
      );
      const info = levelInfo(profile.level);
      const secondsToKill = Math.max(MIN_KILL_SECONDS, info.enemyHp / stats.power);
      const perSecond = (info.goldReward * stats.goldMultiplier) / secondsToKill;
      gold = perSecond * door.amount * 60;
    } else if (door.kind === "BOOST" && door.boost) {
      boost = door.boost;
      boosts[boost] += door.amount;
    } else if (door.kind === "SKIN") {
      const owed = calendarSkinFor(profile.calendarCycle);
      // Past the sixth calendar there is no coat left to give, and an empty door
      // would be worse than an honest handful of gems.
      if (owed && !skins.includes(owed)) skin = owed;
      else gems = CALENDAR_SKIN_FALLBACK_GEMS;
    }

    const finished = profile.calendarDay >= CALENDAR_DAYS;

    await tx.idleProfile.update({
      where: { userId },
      data: {
        calendarDayKey: today,
        // The thirty-first day is the first day of the next calendar.
        calendarDay: finished ? 1 : profile.calendarDay + 1,
        calendarCycle: finished ? profile.calendarCycle + 1 : profile.calendarCycle,
        gems: profile.gems + gems,
        gemsEarned: profile.gemsEarned + gems,
        gold: profile.gold + gold,
        totalGold: profile.totalGold + gold,
        boostsJson: JSON.stringify(boosts),
        skinsJson: skin ? JSON.stringify([...skins, skin]) : profile.skinsJson,
      },
    });

    return {
      ok: true as const,
      day: profile.calendarDay,
      kind: door.kind,
      gems,
      gold,
      skin,
      boost,
      finished,
    };
  });
}

/**
 * Buys one boost with gems.
 *
 * The same currency as the chest and the coats, for the same reason: gems come
 * from Guardians one floor at a time, so a price here means the same thing at
 * every depth. Bought boosts go into the same pocket the calendar fills, and
 * are started from the arena like any other.
 */
export async function buyBoost(userId: string, key: string) {
  const def = BOOST_BY_KEY[key];
  if (!def) return { ok: false as const, error: "UNKNOWN_BOOST" as const };

  await getIdleState(userId);

  return prisma.$transaction(async (tx) => {
    const profile = await tx.idleProfile.findUniqueOrThrow({ where: { userId } });
    if (profile.gems < def.price) {
      return { ok: false as const, error: "NOT_ENOUGH_GEMS" as const };
    }

    const boosts = parseBoosts(profile.boostsJson);
    boosts[def.key] += 1;

    await tx.idleProfile.update({
      where: { userId },
      data: { gems: profile.gems - def.price, boostsJson: JSON.stringify(boosts) },
    });
    return { ok: true as const, boost: def.key };
  });
}

/**
 * Starts one of the held boosts.
 *
 * One at a time, and never extended: two multipliers on the same number is a
 * stack nobody can read, and letting a second one restart the clock would turn
 * "twenty minutes" into "twenty minutes from whenever you last tapped".
 */
export async function useBoost(userId: string, key: string) {
  const def = BOOST_BY_KEY[key];
  if (!def) return { ok: false as const, error: "UNKNOWN_BOOST" as const };

  // Settle time first: the seconds before the boost are worth what they were.
  await getIdleState(userId);

  return prisma.$transaction(async (tx) => {
    const profile = await tx.idleProfile.findUniqueOrThrow({ where: { userId } });
    if (boostSecondsLeft(profile) > 0) {
      return { ok: false as const, error: "BOOST_RUNNING" as const };
    }

    const boosts = parseBoosts(profile.boostsJson);
    if (boosts[def.key] <= 0) return { ok: false as const, error: "NOT_OWNED" as const };
    boosts[def.key] -= 1;

    await tx.idleProfile.update({
      where: { userId },
      data: {
        boostsJson: JSON.stringify(boosts),
        boostKey: def.key,
        boostUntil: new Date(Date.now() + def.seconds * 1000),
      },
    });
    return { ok: true as const };
  });
}

/**
 * Sells exactly what the bag is showing.
 *
 * The Nose only ever stops *new* junk; a bag that has been filling for a week
 * needs a broom, and the two that existed swept either everything below a rarity
 * or everything full stop. Neither could take "all my Epics", which is the pile
 * a player actually wants gone.
 *
 * The filters do the choosing and the server does the selecting: the client
 * sends the slot and the rarity it is looking at, never a list of ids, so there
 * is nothing to forge and nothing equipped can be caught by it.
 */
export async function sellFiltered(userId: string, slot?: string, rarity?: string) {
  await getIdleState(userId);

  return prisma.$transaction(async (tx) => {
    const doomed = await tx.idleItem.findMany({
      where: {
        userId,
        equippedSlot: null,
        ...(slot ? { slot } : {}),
        ...(rarity ? { rarity } : {}),
      },
      select: { id: true, power: true },
    });
    if (doomed.length === 0) return { ok: false as const, error: "NOT_FOUND" as const };

    const gold = doomed.reduce((sum, item) => sum + Math.max(1, Math.round(item.power * 4)), 0);
    await tx.idleItem.deleteMany({ where: { id: { in: doomed.map((item) => item.id) } } });
    const profile = await tx.idleProfile.update({
      where: { userId },
      data: { gold: { increment: gold }, totalGold: { increment: gold } },
      select: { gold: true },
    });

    return { ok: true as const, sold: doomed.length, gold, purse: profile.gold };
  });
}

/**
 * Three spares of a rarity become one of the rarity above.
 *
 * It takes the three **best** spares rather than the three worst, and returns
 * their best floor one colour higher. Fed junk it would be a button that turns
 * nothing into nothing at depth, where a piece's floor is worth far more than
 * its colour — so it costs the three you would actually have worn next.
 *
 * The slot is rolled rather than chosen. A forge that let you aim would be a
 * way to fill six slots with Sovereigns in an afternoon; one that surprises you
 * is a reason to keep forging.
 */
export async function forge(userId: string, rarity: string) {
  const tier = RARITIES.indexOf(rarity as Rarity);
  if (tier < 0 || tier >= RARITIES.length - 1) {
    return { ok: false as const, error: "NOT_FOUND" as const };
  }

  await getIdleState(userId);

  return prisma.$transaction(async (tx) => {
    const profile = await tx.idleProfile.findUniqueOrThrow({ where: { userId } });
    if (!unlocked("forge", profile.rebirths)) {
      return { ok: false as const, error: "LOCKED" as const };
    }

    const fuel = await tx.idleItem.findMany({
      where: { userId, equippedSlot: null, rarity },
      orderBy: { floor: "desc" },
      take: FORGE_COST,
      select: { id: true, floor: true },
    });
    if (fuel.length < FORGE_COST) {
      return { ok: false as const, error: "NOT_ENOUGH" as const };
    }

    const floor = Math.max(...fuel.map((item) => item.floor));
    const nextRarity = RARITIES[tier + 1];
    const slot = SLOTS[randomInt(0, SLOTS.length - 1)];
    const stats = itemStats(slot, floor, nextRarity);

    await tx.idleItem.deleteMany({ where: { id: { in: fuel.map((item) => item.id) } } });
    const created = await tx.idleItem.create({
      data: {
        userId,
        slot,
        floor,
        rarity: nextRarity,
        shape: shapeFor(slot, floor),
        power: stats.power,
        vitality: stats.vitality,
        goldBonus: stats.goldBonus,
        affixesJson: JSON.stringify(rollAffixes(nextRarity)),
        equippedSlot: null,
      },
    });

    return { ok: true as const, itemId: created.id, rarity: nextRarity, floor };
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
    if (profile.gems < CHEST_GEMS) {
      return { ok: false as const, error: "NOT_ENOUGH_GEMS" as const };
    }

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
      data: { gems: profile.gems - CHEST_GEMS, chestsOpened: profile.chestsOpened + 1 },
    });

    await track("idle.chest", userId, { rarity, guaranteed });
    return { ok: true as const, itemId: item.id, rarity, guaranteed };
  });
}

/** Buys a coat, or puts one already owned back on. */
export async function buySkin(userId: string, key: string, cat = 0) {
  const def = SKIN_BY_KEY[key];
  if (!def) return { ok: false as const, error: "NOT_FOUND" as const };

  return prisma.$transaction(async (tx) => {
    const profile = await tx.idleProfile.findUniqueOrThrow({ where: { userId } });
    const owned = parseSkins(profile.skinsJson);

    // A calendar coat has no price, which without this line would mean anyone
    // could ask for one and be given it. Free is not the same as unearned.
    if (def.calendar && !owned.includes(key)) {
      return { ok: false as const, error: "NOT_FOUND" as const };
    }

    /**
     * Which cat puts it on.
     *
     * A coat is bought once and worn by whichever cat the player is dressing —
     * paying three times for the same colour would be a gold sink pretending to
     * be a wardrobe.
     */
    const wear = async () => {
      if (cat === 0) {
        await tx.idleProfile.update({ where: { userId }, data: { skinKey: key } });
        return;
      }
      const coats = parseCatSkins(profile.catSkinsJson);
      while (coats.length < 2) coats.push("");
      coats[cat - 1] = key;
      await tx.idleProfile.update({ where: { userId }, data: { catSkinsJson: JSON.stringify(coats) } });
    };

    if (owned.includes(key) || def.price === 0) {
      await wear();
      return { ok: true as const, worn: true };
    }

    if (profile.gems < def.price) {
      return { ok: false as const, error: "NOT_ENOUGH_GEMS" as const };
    }

    // Buy it, then put it on whichever cat asked. Writing `skinKey` here was
    // the one path that ignored the cat, so the first time an escort was given
    // a colour nobody owned yet, the player's own cat wore it instead.
    await tx.idleProfile.update({
      where: { userId },
      data: {
        gems: profile.gems - def.price,
        skinsJson: JSON.stringify([...owned, key]),
      },
    });
    await wear();
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
