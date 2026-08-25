/**
 * Balance probe for the Descent.
 *
 * Runs the real engine over simulated hours and answers two questions that no
 * amount of reading the numbers can:
 *
 *   1. Does the game dead-end? A floor the cat can never leave, however long it
 *      is left alone, is a broken idle game rather than a hard one.
 *   2. Is any of the six upgrades a trap? "None stronger than another" only means
 *      something if every one of them is the best purchase at some point. An
 *      upgrade the player should never buy is a lie on the screen.
 *
 * The player it simulates is deliberate but not clever: it buys whichever upgrade
 * gives the most improvement per gold right now, switching to survival whenever
 * the cat is losing its current fight. Real players do better; if the game works
 * for this one, it works.
 *
 *   npm run balance [hours]
 */
import {
  UPGRADES,
  RELICS,
  upgradeCost,
  relicCost,
  relicsForFloor,
  levelInfo,
  BASE_MAX_HP,
  rebirthFloorFor,
  unlocked,
  type UpgradeKey,
} from "../src/lib/content/idle";
import {
  derive,
  scoreWith,
  simulate,
  type Relics,
  type Upgrades,
} from "../src/lib/engine/idle";

interface Worn {
  slot: string;
  rarity: string;
  power: number;
  vitality: number;
  goldBonus: number;
  affixesJson: string;
  equippedSlot: string | null;
}

const upgrades: Upgrades = {
  attack: 0,
  health: 0,
  speed: 0,
  crit: 0,
  critDamage: 0,
  double: 0,
};

let items: Worn[] = [];
let gold = 0;
let level = 1;
let highestLevel = 1;
let enemyHp = levelInfo(1).enemyHp;
let hp = BASE_MAX_HP;
let recoverFor = 0;
let shieldFor = 0;
let elite = false;
let defeats = 0;
let gems = 0;

// --- Rebirth ---------------------------------------------------------------
const relics: Relics = { memory: 0, tenacity: 0, greed: 0, luck: 0 };
let relicBank = 0;
let relicsEarned = 0;
let rebirths = 0;
/** Minutes since the record last moved. A stalled run is one worth spending. */
let stalledFor = 0;
// `npm run balance 48 norebirth` measures the same hours without the second arc,
// which is the only way to know whether the second arc is worth having.
const REBIRTH_AFTER_STALLED = process.argv[3] === "norebirth" ? Infinity : 45;

const spent: Record<string, number> = {};
const chosen: Record<string, number> = {};
const firstBought: Record<string, number> = {};
const lastBought: Record<string, number> = {};
for (const def of UPGRADES) {
  spent[def.key] = 0;
  chosen[def.key] = 0;
}

const MINUTE = 60;
const HOURS = Number(process.argv[2] ?? 12);
const marks = new Map<number, number>();

/** What one more level of this upgrade would multiply its own axis by. */
function marginalGain(key: UpgradeKey): number {
  const trial: Upgrades = { ...upgrades, [key]: upgrades[key] + 1 };
  const before = derive(items, upgrades, relics, rebirths);
  const after = derive(items, trial, relics, rebirths);
  const def = UPGRADES.find((entry) => entry.key === key)!;
  return def.axis === "SURVIVAL" ? after.maxHp / before.maxHp : after.power / before.power;
}

for (let minute = 1; minute <= HOURS * 60; minute++) {
  const stats = derive(items, upgrades, relics, rebirths);
  const result = simulate(
    MINUTE,
    { level, enemyHp, elite, hp, recoverFor, shieldFor, highestLevel },
    stats,
    unlocked("elites", rebirths),
    rebirths,
  );

  level = result.level;
  enemyHp = result.enemyHp;
  hp = result.hp;
  recoverFor = result.recoverFor;
  shieldFor = result.shieldFor;
  elite = result.elite;
  highestLevel = result.highestLevel;
  gold += result.goldEarned;
  defeats += result.defeats;
  gems += result.gemsEarned;

  // Nothing equips itself any more, so the simulated player does what the
  // recommendation button does: wear it if the whole cat comes out stronger.
  for (const drop of result.drops) {
    const candidate: Worn = {
      slot: drop.slot,
      rarity: drop.rarity,
      power: drop.power,
      vitality: drop.vitality,
      goldBonus: drop.goldBonus,
      affixesJson: JSON.stringify(drop.affixes),
      equippedSlot: null,
    };
    const now = derive(items, upgrades, relics, rebirths);
    if (scoreWith(items, upgrades, candidate, relics) > now.power * now.maxHp) {
      items = items.filter((item) => item.equippedSlot !== drop.slot);
      items.push({ ...candidate, equippedSlot: drop.slot });
    }
  }

  for (let spree = 0; spree < 60; spree++) {
    const now = derive(items, upgrades, relics, rebirths);
    const info = levelInfo(level);
    const net = now.regen - info.enemyDamage;
    const timeToFall = net < 0 ? now.maxHp / -net : Number.POSITIVE_INFINITY;
    const timeToKill = info.enemyHp / now.power;
    // A player who reads the screen buys health *before* the cat starts dying, not
    // after. Keeping a margin of two is what an attentive one actually does, and
    // it is the difference between a game with defeats in it and a game of them.
    const exposed = timeToFall < timeToKill * 2;

    const options = UPGRADES.filter((def) => {
      if (def.maxLevel !== undefined && upgrades[def.key] >= def.maxLevel) return false;
      if (upgradeCost(def, upgrades[def.key]) > gold) return false;
      return exposed ? def.axis === "SURVIVAL" : true;
    }).map((def) => {
      const cost = upgradeCost(def, upgrades[def.key]);
      // Improvement per gold, on a log scale so multipliers compare honestly.
      return { def, cost, value: Math.log(marginalGain(def.key)) / cost };
    });

    if (options.length === 0) break;
    options.sort((a, b) => b.value - a.value);
    const best = options[0];

    gold -= best.cost;
    spent[best.def.key] += best.cost;
    chosen[best.def.key] += 1;
    upgrades[best.def.key] += 1;
    if (firstBought[best.def.key] === undefined) firstBought[best.def.key] = minute;
    lastBought[best.def.key] = minute;
  }

  const floor = levelInfo(highestLevel).floor;
  if (marks.has(floor)) {
    stalledFor += 1;
  } else {
    marks.set(floor, minute);
    stalledFor = 0;
  }

  // A run that has not moved its record in forty-five minutes has given what it
  // had. Spending it is the whole second arc.
  const owed = Math.max(0, relicsForFloor(floor) - relicsEarned);
  if (stalledFor >= REBIRTH_AFTER_STALLED && owed > 0 && floor >= rebirthFloorFor(rebirths)) {
    relicBank += owed;
    relicsEarned += owed;
    rebirths += 1;
    stalledFor = 0;

    level = 1;
    enemyHp = levelInfo(1).enemyHp;
    hp = 0;
    recoverFor = 0;
    gold = 0;
    items = [];
    for (const key of Object.keys(upgrades) as (keyof Upgrades)[]) upgrades[key] = 0;
  }

  // Relics are spent as soon as they are held: hoarding them helps nobody.
  for (let spree = 0; spree < 40; spree++) {
    const options = RELICS.filter((def) => {
      if (def.maxLevel !== undefined && relics[def.key] >= def.maxLevel) return false;
      return relicCost(def, relics[def.key]) <= relicBank;
    }).sort((a, b) => relicCost(a, relics[a.key]) - relicCost(b, relics[b.key]));
    if (options.length === 0) break;
    relicBank -= relicCost(options[0], relics[options[0].key]);
    relics[options[0].key] += 1;
  }
}

const stats = derive(items, upgrades, relics, rebirths);
const here = levelInfo(level);
const totalSpent = Object.values(spent).reduce((sum, value) => sum + value, 0);

console.log(`après ${HOURS} h de jeu passif`);
console.log(`  étage atteint      ${levelInfo(highestLevel).floor}`);
console.log(`  défaites           ${defeats}`);
console.log(`  gemmes gagnées     ${gems}`);
console.log(`  renaissances       ${rebirths} · prochaine à l étage ${rebirthFloorFor(rebirths)}`);
console.log(
  `  reliques           ${RELICS.map((def) => `${def.nameFr} ${relics[def.key]}`).join(" · ")}`,
);
console.log(`  dégâts par coup    ${stats.hitDamage.toExponential(2)}`);
console.log(`  attaques / s       ${stats.attacksPerSecond.toFixed(2)}`);
console.log(
  `  critique           ${(stats.critChance * 100).toFixed(0)} % · ×${stats.critMultiplier.toFixed(1)}`,
);
console.log(`  coups par frappe   ${(1 + stats.extraStrikes).toFixed(2)}`);
console.log(`  dps effectif       ${stats.power.toExponential(2)}`);
console.log(`  vie                ${stats.maxHp.toExponential(2)} (+${stats.regen.toExponential(2)}/s)`);
console.log(`  dégâts subis ici   ${here.enemyDamage.toExponential(2)}/s`);

console.log("\nrépartition de l'or, et rôle de chaque statistique :");
for (const def of UPGRADES) {
  const share = totalSpent > 0 ? (spent[def.key] / totalSpent) * 100 : 0;
  const capped = def.maxLevel !== undefined && upgrades[def.key] >= def.maxLevel;
  const exponent = Math.log(1 + def.perLevel) / Math.log(def.costGrowth);
  const window =
    firstBought[def.key] === undefined
      ? "jamais acheté"
      : `${firstBought[def.key]}→${lastBought[def.key]} min`;
  console.log(
    `  ${def.nameFr.padEnd(18)} niv ${String(upgrades[def.key]).padStart(4)}` +
      `${capped ? " (max)" : "     "} · ${share.toFixed(1).padStart(5)} % de l'or` +
      ` · ${window.padEnd(16)}` +
      (def.maxLevel === undefined ? ` · exposant ${exponent.toFixed(3)}` : ""),
  );
}

const traps = UPGRADES.filter((def) => chosen[def.key] === 0);
console.log(
  traps.length
    ? `\nPIÈGES : ${traps.map((def) => def.nameFr).join(", ")} — jamais le meilleur achat`
    : "\naucun piège : les six ont été le meilleur achat à un moment",
);

console.log("\npremière arrivée par étage (minute) :");
const rows = [...marks.entries()].sort((a, b) => a[0] - b[0]);
const step = Math.max(1, Math.ceil(rows.length / 20));
for (const [floor, minute] of rows.filter((_, index) => index % step === 0)) {
  console.log(`  étage ${String(floor).padStart(3)} → ${minute} min`);
}
if (rows.length > 0) {
  const [floor, minute] = rows[rows.length - 1];
  console.log(`  étage ${String(floor).padStart(3)} → ${minute} min  (dernier)`);
}

const net = stats.regen - here.enemyDamage;
const stuck = net < 0 && stats.maxHp / -net < here.enemyHp / stats.power;
console.log(
  stuck
    ? "\nétat final : le chat perd son combat actuel — il doit redescendre farmer son étage"
    : "\nétat final : le chat gagne son combat actuel",
);
