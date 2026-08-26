import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { idleStateForRequest } from "@/lib/engine/idle-request";
import { IdlePanelShell } from "@/components/IdlePanelShell";

/** Reading the state advances it, so this page must never be cached. */
export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/");

  return <IdlePanelShell initial={await idleStateForRequest(user.id)} panel="REBIRTH" />;
}
