import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { idleStateForRequest } from "@/lib/engine/idle-request";
import { IdleGame } from "@/components/IdleGame";

/**
 * Reading the state advances it, so this page must never be cached: a cached
 * descent is a descent that stopped.
 */
export const dynamic = "force-dynamic";

export default async function DescentPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");

  return <IdleGame initial={await idleStateForRequest(user.id)} />;
}
