/**
 * Seeds the configuration tables from the TypeScript content files.
 *
 * The content files are the source of truth in V1; the database rows are what the
 * running game reads. That indirection is deliberate: the V2 admin panel edits the
 * rows (thresholds, weights, prices, missions) without a redeploy, and re-running
 * this seed restores the designed defaults.
 *
 * Safe to run repeatedly.
 */

import { PrismaClient } from "@prisma/client";
import { RANKS } from "../src/lib/content/ranks";
import { CHESTS } from "../src/lib/content/chests";
import { ITEMS } from "../src/lib/content/items";
import { DAILY_MISSIONS, WEEKLY_MISSIONS } from "../src/lib/content/missions";

const prisma = new PrismaClient();

async function seedRanks() {
  for (const rank of RANKS) {
    const data = {
      order: rank.order,
      emoji: rank.emoji,
      nameEn: rank.nameEn,
      nameFr: rank.nameFr,
      minXp: rank.minXp,
      artPath: rank.artPath ?? "",
      accentColor: rank.accentColor,
      taglineEn: rank.taglineEn,
      taglineFr: rank.taglineFr,
      chestTypeKey: rank.chestTypeKey,
    };
    await prisma.rankConfig.upsert({
      where: { key: rank.key },
      create: { key: rank.key, ...data },
      update: data,
    });
  }
  console.log(`  ranks: ${RANKS.length}`);
}

async function seedItems() {
  for (const item of ITEMS) {
    const data = {
      type: item.type,
      rarity: item.rarity,
      nameEn: item.nameEn,
      nameFr: item.nameFr,
      descEn: item.descEn,
      descFr: item.descFr,
      icon: item.icon,
      stackable: item.stackable ?? true,
      metaJson: JSON.stringify(item.meta ?? {}),
    };
    await prisma.itemDef.upsert({
      where: { key: item.key },
      create: { key: item.key, ...data },
      update: data,
    });
  }
  console.log(`  items: ${ITEMS.length}`);
}

async function seedChests() {
  let entries = 0;
  for (const chest of CHESTS) {
    const data = {
      rankKey: chest.rankKey,
      tier: chest.tier,
      nameEn: chest.nameEn,
      nameFr: chest.nameFr,
      descEn: chest.descEn,
      descFr: chest.descFr,
    };
    await prisma.chestType.upsert({
      where: { key: chest.key },
      create: { key: chest.key, ...data },
      update: data,
    });

    // Pools are replaced wholesale so removing an entry in content removes it here.
    await prisma.rewardPoolEntry.deleteMany({ where: { chestTypeKey: chest.key } });
    await prisma.rewardPoolEntry.createMany({
      data: chest.entries.map((entry) => ({
        chestTypeKey: chest.key,
        rewardType: entry.rewardType,
        itemKey: entry.itemKey ?? null,
        minQty: entry.minQty,
        maxQty: entry.maxQty,
        weight: entry.weight,
        rarity: entry.rarity,
        guaranteed: entry.guaranteed ?? false,
      })),
    });
    entries += chest.entries.length;
  }
  console.log(`  chests: ${CHESTS.length} (${entries} reward entries)`);
}

async function seedMissions() {
  const all = [...DAILY_MISSIONS, ...WEEKLY_MISSIONS];
  for (const mission of all) {
    const data = {
      scope: mission.scope,
      goalType: mission.goalType,
      goalTarget: mission.goalTarget,
      nameEn: mission.nameEn,
      nameFr: mission.nameFr,
      rewardsJson: JSON.stringify(mission.rewards),
      minRankOrder: mission.minRankOrder ?? 0,
      weight: mission.weight ?? 100,
      active: true,
    };
    await prisma.missionDef.upsert({
      where: { key: mission.key },
      create: { key: mission.key, ...data },
      update: data,
    });
  }
  console.log(`  missions: ${all.length}`);
}

async function seedConfig() {
  const config: Record<string, unknown> = {
    "season.current": { key: "season-1", nameEn: "Season One", nameFr: "Saison Un" },
    "economy.maxXpPerRun": 150,
    "economy.diminishingAfterRuns": 5,
    // Kept in the database so V3 can flip it without a deploy — still gated by
    // the server environment flag on top.
    "web3.mcnRewardsEnabled": false,
  };
  for (const [key, value] of Object.entries(config)) {
    await prisma.appConfig.upsert({
      where: { key },
      create: { key, valueJson: JSON.stringify(value) },
      update: { valueJson: JSON.stringify(value) },
    });
  }
  console.log(`  config: ${Object.keys(config).length}`);
}

/**
 * A handful of demo Guardians so the leaderboard is not an empty table during a
 * demo. Opt-in via SEED_DEMO=true: production should start with real players only,
 * and this seed runs on every deploy.
 */
async function seedDemoGuardians() {
  if (process.env.SEED_DEMO !== "true") return;

  const demo = [
    { handle: "OriaWatches", xp: 52400, streak: 96 },
    { handle: "SapphireVigil", xp: 31200, streak: 74 },
    { handle: "GildedWhisker", xp: 18900, streak: 51 },
    { handle: "NorthernMane", xp: 12400, streak: 43 },
    { handle: "CandleWarden", xp: 8100, streak: 30 },
    { handle: "MarbleCoon", xp: 5200, streak: 22 },
    { handle: "AshenSigil", xp: 3400, streak: 17 },
    { handle: "CobaltTabby", xp: 2100, streak: 12 },
    { handle: "QuietKeystone", xp: 1450, streak: 9 },
    { handle: "EmberPaw", xp: 760, streak: 6 },
    { handle: "WinterCrest", xp: 380, streak: 4 },
    { handle: "LanternTorch", xp: 140, streak: 2 },
  ];

  const { rankForXp } = await import("../src/lib/content/ranks");
  let created = 0;

  for (const guardian of demo) {
    const existing = await prisma.user.findUnique({ where: { handle: guardian.handle } });
    if (existing) continue;

    const user = await prisma.user.create({
      data: {
        handle: guardian.handle,
        xp: guardian.xp,
        shards: Math.round(guardian.xp / 8),
        rankKey: rankForXp(guardian.xp).key,
        currentStreak: guardian.streak,
        bestStreak: guardian.streak,
        totalActiveDays: guardian.streak + 5,
      },
    });

    await prisma.scoreEntry.create({
      data: {
        userId: user.id,
        gameKey: "crystal-resonance",
        score: 600 + Math.round(guardian.xp / 18),
        weekKey: new Date().toISOString().slice(0, 4) + "-W00",
      },
    });
    created += 1;
  }
  if (created > 0) console.log(`  demo guardians: ${created}`);
}

async function main() {
  console.log("Seeding MCN — THE VAULT");
  await seedRanks();
  await seedItems();
  await seedChests();
  await seedMissions();
  await seedConfig();
  await seedDemoGuardians();
  console.log("Done. The Vault is filling.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
