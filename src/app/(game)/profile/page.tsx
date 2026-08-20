import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCollection } from "@/lib/engine/state";
import { walletCapabilities } from "@/lib/web3/wallet";
import { ProfileView } from "@/components/ProfileView";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect("/");

  const [collection, best, chestsOpened] = await Promise.all([
    getCollection(user.id),
    prisma.scoreEntry.aggregate({
      where: { userId: user.id, gameKey: "crystal-resonance" },
      _max: { score: true },
    }),
    prisma.chestOpening.count({ where: { userId: user.id } }),
  ]);

  const inventory = [
    ...collection.badges,
    ...collection.cosmetics,
    ...collection.boosts,
    ...collection.materials,
  ].map((entry) => ({ itemKey: entry.row.itemKey, quantity: entry.row.quantity }));

  return (
    <ProfileView
      player={{
        handle: user.handle,
        locale: user.locale,
        xp: user.xp,
        shards: user.shards,
        rankKey: user.rankKey,
        currentStreak: user.currentStreak,
        bestStreak: user.bestStreak,
        totalActiveDays: user.totalActiveDays,
      }}
      stats={{ bestScore: best._max.score ?? 0, chestsOpened }}
      inventory={inventory}
      activeBoosts={collection.activeBoosts.map((boost) => ({
        boostKey: boost.boostKey,
        expiresAt: boost.expiresAt.toISOString(),
      }))}
      wallet={{ capabilities: walletCapabilities(), address: user.walletAddress }}
    />
  );
}
