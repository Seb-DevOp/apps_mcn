import { getSessionUser } from "@/lib/auth";
import { TokenAction } from "@/components/TokenAction";

// Reachable without a session — that is the whole point of a reset link.
export const dynamic = "force-dynamic";

export default async function ResetPage() {
  const user = await getSessionUser();
  return <TokenAction kind="RESET" locale={user?.locale ?? "en"} />;
}
