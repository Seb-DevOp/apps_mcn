import { getSessionUser } from "@/lib/auth";
import { TokenAction } from "@/components/TokenAction";

export const dynamic = "force-dynamic";

export default async function ConfirmPage() {
  const user = await getSessionUser();
  return <TokenAction kind="CONFIRM" locale={user?.locale ?? "en"} />;
}
