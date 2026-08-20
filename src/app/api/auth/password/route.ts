import { z } from "zod";
import { ok, fail, withUser, rateLimit } from "@/lib/api";
import { setEmailAndPassword, changePassword } from "@/lib/auth/account";

/**
 * Attaching or changing a password on the account currently being played.
 * Signing in with one lives in /api/auth/signin, which needs no session.
 */
const Schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("claim"),
    email: z.string().min(3).max(254),
    password: z.string().min(1).max(200),
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
      body.data.action === "claim"
        ? await setEmailAndPassword(user.id, body.data.email, body.data.password)
        : await changePassword(user.id, body.data.current, body.data.next);

    if (!result.ok) return fail(result.error, 400);
    return ok({});
  });
}
