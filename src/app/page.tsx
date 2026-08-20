import { redirect } from "next/navigation";
import { getSessionUser, suggestHandle } from "@/lib/auth";
import { Onboarding } from "@/components/Onboarding";

export default async function EntrancePage() {
  const user = await getSessionUser();
  if (user) redirect("/vault");

  return <Onboarding suggested={suggestHandle()} />;
}
