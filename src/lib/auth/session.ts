import crypto from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "../db";

/**
 * Guest-first authentication.
 *
 * A player never needs an email, a password or a wallet to enter the Vault.
 * They get a signed, httpOnly session cookie; the account behind it is a real
 * server-side row, so progression is authoritative from the very first tap.
 * Email / Farcaster / wallet sign-in can later attach to the same User row.
 */

const COOKIE_NAME = "mcn_session";
const SESSION_DAYS = 365;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 16) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET must be set to a strong value in production");
    }
    return "insecure-development-secret";
  }
  return value;
}

function sign(sessionId: string): string {
  return crypto.createHmac("sha256", secret()).update(sessionId).digest("base64url");
}

function pack(sessionId: string): string {
  return `${sessionId}.${sign(sessionId)}`;
}

function unpack(raw: string | undefined): string | null {
  if (!raw) return null;
  const idx = raw.lastIndexOf(".");
  if (idx <= 0) return null;
  const id = raw.slice(0, idx);
  const mac = raw.slice(idx + 1);
  const expected = sign(id);
  // Constant-time compare so a forged cookie cannot be tuned byte by byte.
  if (mac.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  return id;
}

export type SessionUser = Awaited<ReturnType<typeof getSessionUser>>;

export async function getSessionUser() {
  const store = await cookies();
  const sessionId = unpack(store.get(COOKIE_NAME)?.value);
  if (!sessionId) return null;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}

/** Throwing variant for API routes that must have a player. */
export async function requireUser() {
  const user = await getSessionUser();
  if (!user) {
    throw new AuthError();
  }
  return user;
}

export class AuthError extends Error {
  constructor() {
    super("NO_SESSION");
    this.name = "AuthError";
  }
}

const ADJECTIVES = [
  "Quiet", "Amber", "Sapphire", "Northern", "Velvet", "Gilded", "Ashen",
  "Silent", "Lantern", "Marble", "Cobalt", "Solemn", "Ember", "Winter",
];
const NOUNS = [
  "Paw", "Crest", "Candle", "Banner", "Shard", "Vigil", "Coon", "Warden",
  "Sigil", "Whisker", "Keystone", "Torch", "Tabby", "Mane",
];

export function suggestHandle(): string {
  const a = ADJECTIVES[crypto.randomInt(0, ADJECTIVES.length)];
  const n = NOUNS[crypto.randomInt(0, NOUNS.length)];
  return `${a}${n}${crypto.randomInt(100, 1000)}`;
}

export function normalizeHandle(input: string): string {
  return input
    .trim()
    .replace(/[^\p{L}\p{N}_. -]/gu, "")
    .replace(/\s+/g, " ")
    .slice(0, 18);
}

/**
 * Issues a session cookie for an existing account.
 *
 * Used by every sign-in path — passkey, password, recovery code — so there is one
 * place where a session comes into being. Only callable from a route handler.
 */
export async function startSessionFor(userId: string) {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const session = await prisma.session.create({ data: { userId, expiresAt } });

  const store = await cookies();
  store.set(COOKIE_NAME, pack(session.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  return session;
}

export async function destroySession() {
  const store = await cookies();
  const sessionId = unpack(store.get(COOKIE_NAME)?.value);
  if (sessionId) {
    await prisma.session.deleteMany({ where: { id: sessionId } });
  }
  store.delete(COOKIE_NAME);
}
