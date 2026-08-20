import { z } from "zod";
import { ok, fail, rateLimit } from "@/lib/api";
import { startSessionFor } from "@/lib/auth";
import { signInWithPassword, signInWithRecoveryCode } from "@/lib/auth/account";
import { normalizeEmail } from "@/lib/auth/password";

/**
 * Signing in without a session.
 *
 * Both methods answer the same way on failure — no hint about whether an address
 * exists — and both are rate limited per address and per source, because this is
 * the one endpoint worth guessing at.
 */
const Schema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("password"),
    email: z.string().min(3).max(254),
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
    const target = normalizeEmail(body.data.email);
    // A second, tighter budget per address: one account cannot be ground down
    // by an attacker rotating through addresses from many sources.
    if (!rateLimit(`signin-email:${target}`, 10, 15 * 60_000)) return fail("RATE_LIMITED", 429);

    const userId = await signInWithPassword(target, body.data.password);
    if (!userId) return fail("BAD_CREDENTIALS", 401);
    await startSessionFor(userId);
    return ok({});
  }

  const userId = await signInWithRecoveryCode(body.data.code);
  if (!userId) return fail("BAD_CREDENTIALS", 401);
  await startSessionFor(userId);
  return ok({ usedRecoveryCode: true });
}
