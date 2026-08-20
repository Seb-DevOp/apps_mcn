import { z } from "zod";
import { ok, fail, rateLimit } from "@/lib/api";
import { startSessionFor } from "@/lib/auth";
import { signInWithIdentifier, signInWithRecoveryCode } from "@/lib/auth/account";

/**
 * Signing in without a session.
 *
 * The identifier is either the player's name or their address — both work, and
 * both fail the same way, so this endpoint never reveals which names or addresses
 * exist. Rate limited per source and per identifier, because this is the one
 * endpoint worth guessing at.
 */
const Schema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("password"),
    identifier: z.string().min(1).max(254),
    password: z.string().min(1).max(200),
  }),
  z.object({ method: z.literal("recovery"), code: z.string().min(4).max(40) }),
]);

export async function POST(request: Request) {
  const body = Schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail("INVALID_BODY", 400);

  const forwarded = request.headers.get("x-forwarded-for") ?? "local";
  if (!rateLimit(`signin:${forwarded}`, 20, 15 * 60_000)) return fail("RATE_LIMITED", 429);

  if (body.data.method === "password") {
    const target = body.data.identifier.trim().toLowerCase();
    // A second, tighter budget per identifier: one account cannot be ground down
    // by an attacker rotating through sources.
    if (!rateLimit(`signin-id:${target}`, 10, 15 * 60_000)) return fail("RATE_LIMITED", 429);

    const userId = await signInWithIdentifier(body.data.identifier, body.data.password);
    if (!userId) return fail("BAD_CREDENTIALS", 401);
    await startSessionFor(userId);
    return ok({});
  }

  const userId = await signInWithRecoveryCode(body.data.code);
  if (!userId) return fail("BAD_CREDENTIALS", 401);
  await startSessionFor(userId);
  return ok({ usedRecoveryCode: true });
}
