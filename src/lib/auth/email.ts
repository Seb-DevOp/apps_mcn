import crypto from "node:crypto";
import { prisma } from "../db";

/**
 * Email verification and password reset.
 *
 * Same discipline as the wallet layer: the whole path exists and is typed, but
 * delivery is inert until a provider key is configured. Nothing here ever claims
 * an email was sent when it was not.
 *
 * That is safe because a passkey and recovery codes already cover "I lost access".
 * Email is a convenience, not the floor.
 */

const TOKEN_TTL: Record<TokenKind, number> = {
  VERIFY: 24 * 3_600_000,
  RESET: 60 * 60_000,
};

export type TokenKind = "VERIFY" | "RESET";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export type SendResult =
  | { ok: true; provider: string }
  | { ok: false; reason: "DISABLED" | "PROVIDER_ERROR" };

export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/**
 * Sends through Resend when configured.
 *
 * In development with no provider, the message is printed to the server log so
 * the flow is testable end to end. That never happens in production: a reset link
 * in a log file is a way into an account.
 */
export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  if (!emailEnabled()) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`\n[email:disabled] to=${message.to}\n${message.subject}\n${message.text}\n`);
    }
    return { ok: false, reason: "DISABLED" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
      }),
    });
    if (!response.ok) return { ok: false, reason: "PROVIDER_ERROR" };
    return { ok: true, provider: "resend" };
  } catch {
    return { ok: false, reason: "PROVIDER_ERROR" };
  }
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("base64url");
}

/**
 * Issues a single-use token and returns the plaintext for the link.
 * Only the hash is stored, so the database never holds a usable token.
 */
export async function issueEmailToken(userId: string, kind: TokenKind): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");

  await prisma.$transaction(async (tx) => {
    // One live token per purpose: requesting a new link invalidates the old one.
    await tx.emailToken.deleteMany({ where: { userId, kind, usedAt: null } });
    await tx.emailToken.create({
      data: {
        userId,
        kind,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + TOKEN_TTL[kind]),
      },
    });
  });

  return token;
}

export async function consumeEmailToken(
  token: string,
  kind: TokenKind,
): Promise<string | null> {
  const tokenHash = hashToken(token);

  const spent = await prisma.emailToken.updateMany({
    where: { tokenHash, kind, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (spent.count === 0) return null;

  const row = await prisma.emailToken.findUnique({ where: { tokenHash } });
  return row?.userId ?? null;
}

/** Absolute link a player can follow from their inbox. */
export function buildLink(request: Request, path: string, token: string): string {
  const configured = process.env.APP_ORIGIN;
  const origin =
    configured ??
    (() => {
      const host = request.headers.get("host") ?? "localhost:3000";
      const proto =
        request.headers.get("x-forwarded-proto") ??
        (host.startsWith("localhost") ? "http" : "https");
      return `${proto}://${host}`;
    })();
  return `${origin}${path}?token=${encodeURIComponent(token)}`;
}
