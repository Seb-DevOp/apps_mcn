-- AlterTable
ALTER TABLE "IdleProfile" ADD COLUMN     "backdropKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "backdropsJson" TEXT NOT NULL DEFAULT '[]';
