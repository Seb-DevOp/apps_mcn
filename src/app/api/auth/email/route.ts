import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, fail, rateLimit } from "@/lib/api";
import { getSessionUser, startSessionFor } from "@/lib/auth";
import { issueEmailToken, consumeEmailToken, sendEmail, buildLink, emailEnabled } from "@/lib/auth/email";
import { forceSetPassword } from "@/lib/auth/account";
import { normalizeEmail } from "@/lib/auth/password";

/**
 * Email verification and password reset.
 *
 * Delivery is inert until a provider is configured, and the response says so
 * plainly rather than pretending a message was sent. That is acceptable because
 * passkeys and recovery codes already cover "I lost access" — email is the
 * convenience layer, never the floor.
 */

const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("verify-request") }),
  z.object({ action: z.literal("verify-confirm"), token: z.string().min(10).max(200) }),
  z.object({ action: z.literal("reset-request"), email: z.string().min(3).max(254) }),
  z.object({
    action: z.literal("reset-confirm"),
    token: z.string().min(10).max(200),
    password: z.string().min(1).max(200),
  }),
]);

export async function POST(request: Request) {
  const body = Schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail("INVALID_BODY", 400);
  const input = body.data;

  if (input.action === "verify-request") {
    const user = await getSessionUser();
    if (!user) return fail("NO_SESSION", 401);
    if (!user.email) return fail("NO_EMAIL", 400);
    if (!rateLimit(`verify:${user.id}`, 5, 60 * 60_000)) return fail("RATE_LIMITED", 429);

    const token = await issueEmailToken(user.id, "VERIFY");
    const link = buildLink(request, "/account/confirm", token);
    const sent = await sendEmail({
      to: user.email,
      subject: "MCN — confirm your address",
      text: `Confirm the address on your Vault account:\n\n${link}\n\nThis link lasts 24 hours. If this was not you, ignore it.`,
    });

    return ok({ delivered: sent.ok, deliveryEnabled: emailEnabled() });
  }

  if (input.action === "verify-confirm") {
    const userId = await consumeEmailToken(input.token, "VERIFY");
    if (!userId) return fail("BAD_TOKEN", 400);
    await prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });
    return ok({});
  }

  if (input.action === "reset-request") {
    const forwarded = request.headers.get("x-forwarded-for") ?? "local";
    if (!rateLimit(`reset:${forwarded}`, 10, 60 * 60_000)) return fail("RATE_LIMITED", 429);

    const email = normalizeEmail(input.email);
    const user = await prisma.user.findUnique({ where: { email } });

    // Always the same answer: whether an address has an account is not public.
    if (user) {
      const token = await issueEmailToken(user.id, "RESET");
      const link = buildLink(request, "/account/reset", token);
      await sendEmail({
        to: email,
        subject: "MCN — reset your password",
        text: `Set a new password for your Vault account:\n\n${link}\n\nThis link lasts one hour. If this was not you, ignore it — nothing has changed.`,
      });
    }

    return ok({ deliveryEnabled: emailEnabled() });
  }

  // reset-confirm
  const userId = await consumeEmailToken(input.token, "RESET");
  if (!userId) return fail("BAD_TOKEN", 400);

  const result = await forceSetPassword(userId, input.password);
  if (!result.ok) return fail(`PASSWORD_${result.reason}`, 400);

  // Proving control of the inbox is enough to be let in.
  await startSessionFor(userId);
  return ok({});
}
