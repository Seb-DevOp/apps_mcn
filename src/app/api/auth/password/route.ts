import { z } from "zod";
import { ok, fail, withUser, rateLimit } from "@/lib/api";
import { changeEmail, changePassword } from "@/lib/auth/account";

/**
 * Changing the address or the password on the account currently being played.
 * Both require the current password: a stolen session must not become a
 * permanent takeover. Signing in lives in /api/auth/signin.
 */
const Schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("email"),
    current: z.string().min(1).max(200),
    email: z.string().min(3).max(254),
  }),
  z.object({
    action: z.literal("change"),
    current: z.string().min(1).max(200),
    next: z.string().min(1).max(200),
  }),
]);

export async function POST(request: Request) {
  return withUser(async (user) => {
    if (!rateLimit(`pw:${user.id}`, 10, 15 * 60_000)) return fail("RATE_LIMITED", 429);

    const body = Schema.safeParse(await request.json().catch(() => null));
    if (!body.success) return fail("INVALID_BODY", 400);

    const result =
      body.data.action === "email"
        ? await changeEmail(user.id, body.data.current, body.data.email)
        : await changePassword(user.id, body.data.current, body.data.next);

    if (!result.ok) return fail(result.error, 400);
    return ok({});
  });
}
