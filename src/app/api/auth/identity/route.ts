import { z } from "zod";
import { ok, fail, withUser } from "@/lib/api";
import { linkIdentity, identityStatus } from "@/lib/auth/identity";

/**
 * Farcaster and wallet linking.
 *
 * Present and typed, refused while the flags are off — an unverified external
 * identity is an account takeover waiting to happen, so the honest behaviour is
 * to say no rather than to store it.
 */

export async function GET() {
  return withUser(async () => ok({ providers: identityStatus() }));
}

const LinkSchema = z.object({
  provider: z.enum(["FARCASTER", "WALLET"]),
  externalId: z.string().min(1).max(128),
  proof: z.string().max(4096).optional(),
});

export async function POST(request: Request) {
  return withUser(async (user) => {
    const body = LinkSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return fail("INVALID_BODY", 400);

    const result = await linkIdentity(
      user.id,
      body.data.provider,
      body.data.externalId,
      body.data.proof,
    );
    if (!result.ok) return fail(result.reason, result.reason === "DISABLED" ? 503 : 400);
    return ok({ provider: result.provider, externalId: result.externalId });
  });
}
