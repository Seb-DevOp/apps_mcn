import { z } from "zod";
import { destroySession, getSessionUser } from "@/lib/auth";
import { registerAccount } from "@/lib/auth/register";
import { ok, fail, rateLimit } from "@/lib/api";

/**
 * Creating an account.
 *
 * Registration is required to enter: name, address and password. Nothing about
 * the account is anonymous, so a player's progress belongs to them from the first
 * chest rather than to one browser's cookie.
 */
const RegisterSchema = z.object({
  handle: z.string().min(1).max(40),
  email: z.string().min(3).max(254),
  password: z.string().min(1).max(200),
  passwordConfirm: z.string().min(1).max(200),
  locale: z.enum(["en", "fr"]).optional().default("en"),
});

export async function POST(request: Request) {
  const existing = await getSessionUser();
  if (existing) return ok({ handle: existing.handle, alreadySignedIn: true });

  const forwarded = request.headers.get("x-forwarded-for") ?? "local";
  if (!rateLimit(`signup:${forwarded}`, 10, 60 * 60_000)) {
    return fail("RATE_LIMITED", 429);
  }

  const body = RegisterSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return fail("INVALID_BODY", 400);

  const result = await registerAccount(body.data);
  if (!result.ok) return fail("INVALID_FIELDS", 400, { errors: result.errors });

  return ok({ handle: result.handle });
}

export async function DELETE() {
  await destroySession();
  return ok({});
}
