import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getPlayerState } from "@/lib/engine/state";
import { VaultHome } from "@/components/VaultHome";

// The hub is personal and time-sensitive: never cached.
export const dynamic = "force-dynamic";

export default async function VaultPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");

  const state = await getPlayerState(user);
  return <VaultHome state={state} />;
}
