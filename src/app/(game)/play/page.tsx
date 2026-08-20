import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CrystalResonance } from "@/components/CrystalResonance";

export const dynamic = "force-dynamic";

export default async function PlayPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");

  const best = await prisma.scoreEntry.aggregate({
    where: { userId: user.id, gameKey: "crystal-resonance" },
    _max: { score: true },
  });

  return <CrystalResonance bestScore={best._max.score ?? 0} />;
}
