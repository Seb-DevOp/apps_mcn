import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { RANK_BY_KEY } from "@/lib/content/ranks";
import { whisperForDay } from "@/lib/content/vault";
import { dayKey } from "@/lib/time";
import { VaultExplorer } from "@/components/VaultExplorer";

export const dynamic = "force-dynamic";

export default async function ExplorePage() {
  const user = await getSessionUser();
  if (!user) redirect("/");

  const rankOrder = RANK_BY_KEY[user.rankKey]?.order ?? 0;
  return <VaultExplorer rankOrder={rankOrder} whisper={whisperForDay(dayKey())} />;
}
