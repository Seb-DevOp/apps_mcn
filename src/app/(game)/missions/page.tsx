import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getPlayerState } from "@/lib/engine/state";
import { MissionsBoard } from "@/components/MissionsBoard";

export const dynamic = "force-dynamic";

export default async function MissionsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");

  const state = await getPlayerState(user);
  return (
    <MissionsBoard
      daily={state.missions.daily}
      weekly={state.missions.weekly}
      resetMs={state.chest.msUntilReset}
    />
  );
}
