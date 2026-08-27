import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { idleStateForRequest } from "@/lib/engine/idle-request";
import { IdlePanelShell } from "@/components/IdlePanelShell";

/**
 * The thirty doors, on their own page.
 *
 * It lived at the top of the shop, which is a screen a player opens to spend
 * something — the wrong home for the one thing here that expires whether or not
 * anyone is shopping. The bar at the top of every screen points at this.
 */
export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/");

  return <IdlePanelShell initial={await idleStateForRequest(user.id)} panel="CALENDAR" />;
}
