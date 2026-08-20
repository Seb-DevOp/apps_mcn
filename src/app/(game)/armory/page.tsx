import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getArmory } from "@/lib/engine/loadout";
import { getForge } from "@/lib/engine/forge";
import { ArmoryShell } from "@/components/ArmoryShell";

export const dynamic = "force-dynamic";

export default async function ArmoryPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");

  const [armory, forge] = await Promise.all([getArmory(user.id), getForge(user.id)]);
  return <ArmoryShell armory={armory} forge={forge} />;
}
