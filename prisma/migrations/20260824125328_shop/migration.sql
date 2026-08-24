-- AlterTable
ALTER TABLE "IdleProfile" ADD COLUMN     "chestsOpened" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "skinKey" TEXT NOT NULL DEFAULT 'classic',
ADD COLUMN     "skinsJson" TEXT NOT NULL DEFAULT '[]';
