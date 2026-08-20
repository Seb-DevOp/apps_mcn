-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "shards" INTEGER NOT NULL DEFAULT 0,
    "rankKey" TEXT NOT NULL DEFAULT 'wanderer',
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "bestStreak" INTEGER NOT NULL DEFAULT 0,
    "totalActiveDays" INTEGER NOT NULL DEFAULT 0,
    "lastActiveDay" TEXT,
    "streakShields" INTEGER NOT NULL DEFAULT 1,
    "lastChestDay" TEXT,
    "walletAddress" TEXT,
    "walletChain" TEXT,
    "walletLinkedAt" TIMESTAMP(3),
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RankConfig" (
    "key" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "emoji" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameFr" TEXT NOT NULL,
    "minXp" INTEGER NOT NULL,
    "artPath" TEXT NOT NULL,
    "accentColor" TEXT NOT NULL,
    "taglineEn" TEXT NOT NULL,
    "taglineFr" TEXT NOT NULL,
    "chestTypeKey" TEXT NOT NULL,

    CONSTRAINT "RankConfig_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ChestType" (
    "key" TEXT NOT NULL,
    "rankKey" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameFr" TEXT NOT NULL,
    "descEn" TEXT NOT NULL,
    "descFr" TEXT NOT NULL,

    CONSTRAINT "ChestType_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "RewardPoolEntry" (
    "id" TEXT NOT NULL,
    "chestTypeKey" TEXT NOT NULL,
    "rewardType" TEXT NOT NULL,
    "itemKey" TEXT,
    "minQty" INTEGER NOT NULL DEFAULT 1,
    "maxQty" INTEGER NOT NULL DEFAULT 1,
    "weight" INTEGER NOT NULL DEFAULT 100,
    "rarity" TEXT NOT NULL DEFAULT 'COMMON',
    "guaranteed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RewardPoolEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemDef" (
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "rarity" TEXT NOT NULL DEFAULT 'COMMON',
    "nameEn" TEXT NOT NULL,
    "nameFr" TEXT NOT NULL,
    "descEn" TEXT NOT NULL DEFAULT '',
    "descFr" TEXT NOT NULL DEFAULT '',
    "icon" TEXT NOT NULL DEFAULT 'crystal',
    "stackable" BOOLEAN NOT NULL DEFAULT true,
    "metaJson" TEXT NOT NULL DEFAULT '{}',

    CONSTRAINT "ItemDef_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "MissionDef" (
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "goalType" TEXT NOT NULL,
    "goalTarget" INTEGER NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameFr" TEXT NOT NULL,
    "rewardsJson" TEXT NOT NULL DEFAULT '[]',
    "minRankOrder" INTEGER NOT NULL DEFAULT 0,
    "weight" INTEGER NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MissionDef_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AppConfig" (
    "key" TEXT NOT NULL,
    "valueJson" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBoost" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "boostKey" TEXT NOT NULL,
    "statKey" TEXT NOT NULL,
    "multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.25,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBoost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChestOpening" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chestTypeKey" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "streakDay" INTEGER NOT NULL DEFAULT 1,
    "rewardsJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChestOpening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserMission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "missionKey" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "target" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserMission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameKey" TEXT NOT NULL DEFAULT 'crystal-resonance',
    "seed" TEXT NOT NULL,
    "targets" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "score" INTEGER NOT NULL DEFAULT 0,
    "accuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bestCombo" INTEGER NOT NULL DEFAULT 0,
    "xpAwarded" INTEGER NOT NULL DEFAULT 0,
    "shardsAwarded" INTEGER NOT NULL DEFAULT 0,
    "clientDurationMs" INTEGER NOT NULL DEFAULT 0,
    "invalidReason" TEXT,

    CONSTRAINT "GameSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameKey" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "weekKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XpLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XpLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "xpEarned" INTEGER NOT NULL DEFAULT 0,
    "chestOpened" BOOLEAN NOT NULL DEFAULT false,
    "missionsClaimed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "propsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rewardType" TEXT NOT NULL,
    "itemKey" TEXT,
    "amount" TEXT NOT NULL DEFAULT '0',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "txHash" TEXT,
    "chain" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");

-- CreateIndex
CREATE INDEX "User_xp_idx" ON "User"("xp");

-- CreateIndex
CREATE INDEX "User_currentStreak_idx" ON "User"("currentStreak");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RankConfig_order_key" ON "RankConfig"("order");

-- CreateIndex
CREATE UNIQUE INDEX "ChestType_rankKey_key" ON "ChestType"("rankKey");

-- CreateIndex
CREATE INDEX "RewardPoolEntry_chestTypeKey_idx" ON "RewardPoolEntry"("chestTypeKey");

-- CreateIndex
CREATE INDEX "InventoryItem_userId_idx" ON "InventoryItem"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_userId_itemKey_key" ON "InventoryItem"("userId", "itemKey");

-- CreateIndex
CREATE INDEX "UserBoost_userId_expiresAt_idx" ON "UserBoost"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "ChestOpening_userId_idx" ON "ChestOpening"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChestOpening_userId_day_key" ON "ChestOpening"("userId", "day");

-- CreateIndex
CREATE INDEX "UserMission_userId_scope_periodKey_idx" ON "UserMission"("userId", "scope", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "UserMission_userId_missionKey_periodKey_key" ON "UserMission"("userId", "missionKey", "periodKey");

-- CreateIndex
CREATE INDEX "GameSession_userId_createdAt_idx" ON "GameSession"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ScoreEntry_gameKey_score_idx" ON "ScoreEntry"("gameKey", "score");

-- CreateIndex
CREATE INDEX "ScoreEntry_weekKey_score_idx" ON "ScoreEntry"("weekKey", "score");

-- CreateIndex
CREATE INDEX "XpLedger_userId_createdAt_idx" ON "XpLedger"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "DailyActivity_day_idx" ON "DailyActivity"("day");

-- CreateIndex
CREATE UNIQUE INDEX "DailyActivity_userId_day_key" ON "DailyActivity"("userId", "day");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_name_createdAt_idx" ON "AnalyticsEvent"("name", "createdAt");

-- CreateIndex
CREATE INDEX "RewardGrant_userId_status_idx" ON "RewardGrant"("userId", "status");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardPoolEntry" ADD CONSTRAINT "RewardPoolEntry_chestTypeKey_fkey" FOREIGN KEY ("chestTypeKey") REFERENCES "ChestType"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_itemKey_fkey" FOREIGN KEY ("itemKey") REFERENCES "ItemDef"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBoost" ADD CONSTRAINT "UserBoost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChestOpening" ADD CONSTRAINT "ChestOpening_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChestOpening" ADD CONSTRAINT "ChestOpening_chestTypeKey_fkey" FOREIGN KEY ("chestTypeKey") REFERENCES "ChestType"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMission" ADD CONSTRAINT "UserMission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreEntry" ADD CONSTRAINT "ScoreEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XpLedger" ADD CONSTRAINT "XpLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyActivity" ADD CONSTRAINT "DailyActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardGrant" ADD CONSTRAINT "RewardGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

