import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getArmory } from "@/lib/engine/loadout";
import { ArmoryView } from "@/components/ArmoryView";

export const dynamic = "force-dynamic";

export default async function ArmoryPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");

  return <ArmoryView initial={await getArmory(user.id)} />;
}
