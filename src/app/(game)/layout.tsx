import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { I18nProvider } from "@/components/I18nProvider";
import { BottomNav } from "@/components/BottomNav";

/**
 * Everything behind the Vault door.
 * A player with no session is sent back to the entrance rather than shown an
 * empty shell.
 */
export default async function GameLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/");

  return (
    <I18nProvider locale={user.locale}>
      <div className="shell">{children}</div>
      <BottomNav />
    </I18nProvider>
  );
}
