import { ok, withUser } from "@/lib/api";
import { getAccountStatus } from "@/lib/auth/account";

export async function GET() {
  return withUser(async (user) => ok({ status: await getAccountStatus(user.id) }));
}
