/**
 * Balance probe for the Descent.
 *
 * Runs the real engine over simulated hours under a deliberately dumb player —
 * "buy the cheapest thing I can afford, every minute" — and prints where the
 * walls land. The point is not to find the optimal curve but to prove there is no
 * dead end: a floor the cat can never leave, however long it is left alone, is a
 * broken idle game rather than a hard one.
 *
 *   npm run balance
 */
import {
  UPGRADES,
  upgradeCost,
  itemStats,
  levelInfo,
  shapeFor,
  BASE_MAX_HP,
  type Rarity,
  type Slot,
} from "../src/lib/content/idle";
import { derive, simulate, type Upgrades } from "../src/lib/engine/idle";

const SLOTS: Slot[] = ["HEAD", "SHOULDERS", "CHEST", "HANDS", "LEGS", "TRINKET"];

interface Worn {
  slot: string;
  power: number;
  vitality: number;
  goldBonus: number;
  equippedSlot: string | null;
}

const upgrades: Upgrades = {
  claws: 0,
  fervour: 0,
  instinct: 0,
  fortune: 0,
  hide: 0,
  mending: 0,
};

let items: Worn[] = [];
let gold = 0;
let level = 1;
let highestLevel = 1;
let enemyHp = levelInfo(1).enemyHp;
let hp = BASE_MAX_HP;
let recoverFor = 0;
let defeats = 0;

const MINUTE = 60;
const HOURS = Number(process.argv[2] ?? 6);
const marks = new Map<number, number>(); // floor -> minute first reached

for (let minute = 1; minute <= HOURS * 60; minute++) {
  const stats = derive(items, upgrades, highestLevel);
  const result = simulate(MINUTE, { level, enemyHp, hp, recoverFor, highestLevel }, stats);

  level = result.level;
  enemyHp = result.enemyHp;
  hp = result.hp;
  recoverFor = result.recoverFor;
  highestLevel = result.highestLevel;
  gold += result.goldEarned;
  defeats += result.defeats;

  for (const drop of result.drops) {
    const worn = items.find((item) => item.equippedSlot === drop.slot);
    if (!worn || drop.power > worn.power) {
      items = items.filter((item) => item.equippedSlot !== drop.slot);
      items.push({
        slot: drop.slot,
        power: drop.power,
        vitality: drop.vitality,
        goldBonus: drop.goldBonus,
        equippedSlot: drop.slot,
      });
    }
  }

  // The dumb player: cheapest affordable upgrade, as often as possible.
  for (let spree = 0; spree < 40; spree++) {
    const options = UPGRADES.map((def) => ({
      def,
      cost: upgradeCost(def, upgrades[def.key as keyof Upgrades]),
    }))
      .filter((option) => option.cost <= gold)
      .filter(
        (option) =>
          option.def.maxLevel === undefined ||
          upgrades[option.def.key as keyof Upgrades] < option.def.maxLevel,
      )
      .sort((a, b) => a.cost - b.cost);
    if (options.length === 0) break;
    gold -= options[0].cost;
    upgrades[options[0].def.key as keyof Upgrades] += 1;
  }

  const floor = levelInfo(highestLevel).floor;
  if (!marks.has(floor)) marks.set(floor, minute);
}

const stats = derive(items, upgrades, highestLevel);
const here = levelInfo(level);

console.log(`après ${HOURS} h de jeu passif, joueur naïf`);
console.log(`  étage atteint      ${levelInfo(highestLevel).floor}`);
console.log(`  défaites           ${defeats}`);
console.log(`  puissance          ${stats.power.toFixed(0)}/s`);
console.log(`  vie                ${stats.maxHp.toFixed(0)} (+${stats.regen.toFixed(1)}/s)`);
console.log(`  dégâts subis ici   ${here.enemyDamage.toFixed(1)}/s`);
console.log(`  or en poche        ${Math.round(gold)}`);
console.log(
  `  améliorations      ${Object.entries(upgrades)
    .map(([key, value]) => `${key} ${value}`)
    .join(" · ")}`,
);
console.log(`  équipé             ${items.length}/6 emplacements`);

console.log("\npremière arrivée par étage (minute) :");
const rows = [...marks.entries()].sort((a, b) => a[0] - b[0]);
for (const [floor, minute] of rows) {
  const previous = rows[rows.indexOf([floor, minute] as never) - 1];
  void previous;
  console.log(`  étage ${String(floor).padStart(3)} → ${minute} min`);
}

// A floor that took more than a quarter of the whole run to leave is a wall
// worth naming out loud.
const walls = rows
  .map(([floor, minute], index) => ({
    floor,
    spent: (rows[index + 1]?.[1] ?? HOURS * 60) - minute,
  }))
  .filter((entry) => entry.spent > (HOURS * 60) / 4);

console.log(
  walls.length
    ? `\nmurs : ${walls.map((w) => `étage ${w.floor} (${w.spent} min)`).join(", ")}`
    : "\nmurs : aucun étage n'a retenu le chat plus d'un quart de la partie",
);

// Sample the future: can the current build still be blocked forever?
const stuck = (() => {
  const info = levelInfo(highestLevel);
  const net = stats.regen - info.enemyDamage;
  const toKill = info.enemyHp / stats.power;
  const toFall = net < 0 ? stats.maxHp / -net : Infinity;
  return toFall < toKill;
})();
console.log(
  stuck
    ? "état final : le chat perd son combat actuel — l'or passif doit le débloquer"
    : "état final : le chat gagne son combat actuel",
);
