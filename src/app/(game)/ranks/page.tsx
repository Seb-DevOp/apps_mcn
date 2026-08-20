import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { RANK_BY_KEY } from "@/lib/content/ranks";
import { RanksGallery } from "@/components/RanksGallery";

export const dynamic = "force-dynamic";

export default async function RanksPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");

  return (
    <RanksGallery xp={user.xp} currentOrder={RANK_BY_KEY[user.rankKey]?.order ?? 0} />
  );
}
