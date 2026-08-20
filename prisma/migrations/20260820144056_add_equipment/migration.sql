-- CreateTable
CREATE TABLE "EquipmentDef" (
    "key" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "weaponClass" TEXT,
    "rarity" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameFr" TEXT NOT NULL,
    "descEn" TEXT NOT NULL,
    "descFr" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "baseStatsJson" TEXT NOT NULL,
    "maxLevel" INTEGER NOT NULL DEFAULT 5,
    "shardPrice" INTEGER NOT NULL,
    "requiredRankOrder" INTEGER NOT NULL DEFAULT 0,
    "abilityKey" TEXT,

    CONSTRAINT "EquipmentDef_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "UserEquipment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "defKey" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "equippedSlot" TEXT,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserEquipment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserEquipment_userId_idx" ON "UserEquipment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserEquipment_userId_defKey_key" ON "UserEquipment"("userId", "defKey");

-- CreateIndex
CREATE UNIQUE INDEX "UserEquipment_userId_equippedSlot_key" ON "UserEquipment"("userId", "equippedSlot");

-- AddForeignKey
ALTER TABLE "UserEquipment" ADD CONSTRAINT "UserEquipment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEquipment" ADD CONSTRAINT "UserEquipment_defKey_fkey" FOREIGN KEY ("defKey") REFERENCES "EquipmentDef"("key") ON DELETE CASCADE ON UPDATE CASCADE;
