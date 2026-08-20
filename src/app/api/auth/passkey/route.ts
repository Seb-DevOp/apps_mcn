import { z } from "zod";
import { ok, fail, rateLimit } from "@/lib/api";
import { getSessionUser, startSessionFor } from "@/lib/auth";
import {
  passkeyRegistrationOptions,
  verifyPasskeyRegistration,
  passkeyAuthenticationOptions,
  verifyPasskeyAuthentication,
  removePasskey,
} from "@/lib/auth/webauthn";
import { markClaimed } from "@/lib/auth/account";
import { track } from "@/lib/engine/analytics";

/**
 * Passkeys.
 *
 * Registration attaches a key to the account already being played, so claiming an
 * account never means starting over. Authentication needs no session at all —
 * that is the whole point: it is how a player gets back in on a new device.
 */

const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("register-options") }),
  z.object({
    action: z.literal("register-verify"),
    response: z.record(z.string(), z.unknown()),
    deviceLabel: z.string().max(60).optional(),
  }),
  z.object({ action: z.literal("login-options") }),
  z.object({ action: z.literal("login-verify"), response: z.record(z.string(), z.unknown()) }),
  z.object({ action: z.literal("remove"), credentialRowId: z.string().min(1).max(64) }),
]);

export async function POST(request: Request) {
  const body = Schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail("INVALID_BODY", 400);
  const input = body.data;

  // --- Anonymous paths: signing in from a device with no session -----------
  if (input.action === "login-options") {
    const forwarded = request.headers.get("x-forwarded-for") ?? "local";
    if (!rateLimit(`pk-login:${forwarded}`, 30, 10 * 60_000)) return fail("RATE_LIMITED", 429);
    return ok({ options: await passkeyAuthenticationOptions(request) });
  }

  if (input.action === "login-verify") {
    const forwarded = request.headers.get("x-forwarded-for") ?? "local";
    if (!rateLimit(`pk-verify:${forwarded}`, 30, 10 * 60_000)) return fail("RATE_LIMITED", 429);

    const result = await verifyPasskeyAuthentication(
      request,
      input.response as unknown as Parameters<typeof verifyPasskeyAuthentication>[1],
    );
    if (!result.ok) return fail(result.error, 401);

    await startSessionFor(result.userId);
    await track("account.signin", result.userId, { method: "PASSKEY" });
    return ok({});
  }

  // --- Everything else needs the session it is modifying -------------------
  const user = await getSessionUser();
  if (!user) return fail("NO_SESSION", 401);

  if (input.action === "register-options") {
    if (!rateLimit(`pk-reg:${user.id}`, 20, 60 * 60_000)) return fail("RATE_LIMITED", 429);
    return ok({ options: await passkeyRegistrationOptions(request, user.id, user.handle) });
  }

  if (input.action === "register-verify") {
    const result = await verifyPasskeyRegistration(
      request,
      user.id,
      input.response as unknown as Parameters<typeof verifyPasskeyRegistration>[2],
      input.deviceLabel,
    );
    if (!result.ok) return fail(result.error, 400);

    await markClaimed(user.id);
    await track("account.claimed", user.id, { method: "PASSKEY" });
    return ok({});
  }

  const removed = await removePasskey(user.id, input.credentialRowId);
  if (!removed.ok) return fail(removed.error, 409);
  return ok({});
}
