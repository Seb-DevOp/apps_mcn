import { notFound } from "next/navigation";
import { getPublicProfile } from "@/lib/engine/profile";
import { PlayerProfile } from "@/components/PlayerProfile";

/**
 * Someone else's cat, reached from their name on a board.
 *
 * Not cached: a profile that lags a day behind the leaderboard it was opened
 * from is a profile that contradicts the page that linked to it.
 */
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const profile = await getPublicProfile(decodeURIComponent(handle));
  if (!profile) notFound();

  return <PlayerProfile profile={profile} />;
}
