import { z } from "zod";
import { ok, fail, rateLimit } from "@/lib/api";
import { signInWithFarcaster, farcasterEnabled } from "@/lib/auth/farcaster";

/**
 * Quick Auth sign-in, used automatically when the app runs inside a Farcaster
 * client. The token proves the FID; everything else in the body is a cosmetic
 * hint the server is free to ignore.
 */
const Schema = z.object({
  token: z.string().min(20).max(4096),
  username: z.string().max(64).optional(),
  displayName: z.string().max(64).optional(),
});

export async function POST(request: Request) {
  if (!farcasterEnabled()) return fail("DISABLED", 503);

  const forwarded = request.headers.get("x-forwarded-for") ?? "local";
  if (!rateLimit(`fc-auth:${forwarded}`, 30, 10 * 60_000)) return fail("RATE_LIMITED", 429);

  const body = Schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail("INVALID_BODY", 400);

  const result = await signInWithFarcaster(request, body.data.token, {
    username: body.data.username,
    displayName: body.data.displayName,
  });
  if (!result.ok) return fail(result.error, result.error === "DISABLED" ? 503 : 401);

  return ok({ created: result.created });
}
