import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser, suggestHandle } from "@/lib/auth";
import { Onboarding } from "@/components/Onboarding";
import { FarcasterGate } from "@/components/FarcasterGate";

const ORIGIN = process.env.APP_ORIGIN ?? "https://apps-mcn.vercel.app";

/**
 * Shared into a Farcaster cast, this page becomes a launchable card rather than
 * a plain link. `fc:frame` is the older name for the same tag and is kept so
 * clients that have not moved on still render it.
 */
const embed = {
  version: "1",
  imageUrl: `${ORIGIN}/share/embed.png`,
  button: {
    title: "Enter the Vault",
    action: {
      type: "launch_miniapp",
      url: `${ORIGIN}/vault`,
      name: "MCN — The Vault",
      splashImageUrl: `${ORIGIN}/icons/splash-200.png`,
      splashBackgroundColor: "#05080F",
    },
  },
};

export const metadata: Metadata = {
  other: {
    "fc:miniapp": JSON.stringify(embed),
    "fc:frame": JSON.stringify(embed),
  },
};

export default async function EntrancePage() {
  const user = await getSessionUser();
  if (user) redirect("/vault");

  return (
    <FarcasterGate locale="en">
      <Onboarding suggested={suggestHandle()} />
    </FarcasterGate>
  );
}
