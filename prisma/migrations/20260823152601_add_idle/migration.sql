-- CreateTable
CREATE TABLE "IdleProfile" (
    "userId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "highestLevel" INTEGER NOT NULL DEFAULT 1,
    "enemyHp" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gold" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalGold" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "kills" INTEGER NOT NULL DEFAULT 0,
    "bossKills" INTEGER NOT NULL DEFAULT 0,
    "upgradesJson" TEXT NOT NULL DEFAULT '{}',
    "lastTickAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdleProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "IdleItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "floor" INTEGER NOT NULL,
    "rarity" TEXT NOT NULL,
    "shape" TEXT NOT NULL,
    "power" DOUBLE PRECISION NOT NULL,
    "goldBonus" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "equippedSlot" TEXT,
    "foundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdleItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IdleItem_userId_slot_idx" ON "IdleItem"("userId", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "IdleItem_userId_equippedSlot_key" ON "IdleItem"("userId", "equippedSlot");

-- AddForeignKey
ALTER TABLE "IdleProfile" ADD CONSTRAINT "IdleProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdleItem" ADD CONSTRAINT "IdleItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

