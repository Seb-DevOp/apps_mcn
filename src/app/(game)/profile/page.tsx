import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getAccountStatus } from "@/lib/auth/account";
import { idleStateForRequest } from "@/lib/engine/idle-request";
import { levelInfo, weaponFor } from "@/lib/content/idle";
import { ProfileView } from "@/components/ProfileView";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect("/");

  // Reading the idle state advances it, which is exactly right: time spent on the
  // profile page is time the cat spent descending.
  const [state, account] = await Promise.all([idleStateForRequest(user.id), getAccountStatus(user.id)]);

  return (
    <ProfileView
      player={{ handle: user.handle, locale: user.locale }}
      stats={{
        floor: levelInfo(state.highestLevel).floor,
        kills: state.kills,
        bossKills: state.bossKills,
        defeats: state.defeats,
        totalGold: state.totalGold,
        items: state.items.length,
      }}
      worn={state.items
        .filter((item) => item.equipped)
        .map((item) => ({
          slot: item.slot,
          shape: item.shape,
          rarity: item.rarity,
          weapon: weaponFor(item.id),
        }))}
      account={account}
    />
  );
}
