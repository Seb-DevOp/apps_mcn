import { z } from "zod";
import { ok, fail, withUser } from "@/lib/api";
import { linkWallet, walletCapabilities, getMcnBalance, pendingGrants } from "@/lib/web3/wallet";

const LinkSchema = z.object({
  address: z.string().min(10).max(64),
  signature: z.string().max(512).optional(),
});

export async function GET() {
  return withUser(async (user) => {
    const caps = walletCapabilities();
    return ok({
      capabilities: caps,
      address: user.walletAddress,
      balance: await getMcnBalance(user.walletAddress),
      grants: caps.tokenRewardsEnabled ? await pendingGrants(user.id) : [],
    });
  });
}

export async function POST(request: Request) {
  return withUser(async (user) => {
    const body = LinkSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return fail("INVALID_BODY", 400);

    const result = await linkWallet(user.id, body.data.address, body.data.signature);
    if (!result.ok) return fail(result.reason, result.reason === "DISABLED" ? 503 : 400);
    return ok({ address: result.address });
  });
}
