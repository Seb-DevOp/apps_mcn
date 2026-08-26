import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { idleStateForRequest } from "@/lib/engine/idle-request";
import { I18nProvider } from "@/components/I18nProvider";
import { BottomNav } from "@/components/BottomNav";
import { resourcesOf } from "@/lib/engine/resources";
import { ResourceBar } from "@/components/ResourceBar";

/**
 * Everything behind the Vault door.
 * A player with no session is sent back to the entrance rather than shown an
 * empty shell.
 */
export default async function GameLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/");

  // Read here rather than in each page: the bar is above every screen, and
  // reading the state is what advances the clock anyway.
  const state = await idleStateForRequest(user.id);

  return (
    <I18nProvider locale={user.locale}>
      <div className="shell">
        <ResourceBar initial={resourcesOf(state)} />
        {children}
      </div>
      <BottomNav />
    </I18nProvider>
  );
}
