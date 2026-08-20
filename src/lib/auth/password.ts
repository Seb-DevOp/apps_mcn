import crypto from "node:crypto";

/**
 * Password hashing with scrypt.
 *
 * scrypt is in Node's standard library and is memory-hard, so there is no native
 * binary to fail on a serverless build and no third-party dependency in the path
 * that protects players' accounts. Parameters and salt travel inside the stored
 * value, so they can be raised later without invalidating existing hashes.
 */

const N = 16384; // CPU/memory cost
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password.normalize("NFKC"),
      salt,
      KEY_LENGTH,
      { N, r: R, p: P, maxmem: 256 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_BYTES);
  const key = await scrypt(password, salt);
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, n, r, p, saltB64, keyB64] = parts;
  const salt = Buffer.from(saltB64, "base64url");
  const expected = Buffer.from(keyB64, "base64url");

  const key = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(
      password.normalize("NFKC"),
      salt,
      expected.length,
      { N: Number(n), r: Number(r), p: Number(p), maxmem: 256 * 1024 * 1024 },
      (error, derived) => (error ? reject(error) : resolve(derived)),
    );
  }).catch(() => null);

  if (!key || key.length !== expected.length) return false;
  return crypto.timingSafeEqual(key, expected);
}

export interface PasswordCheck {
  ok: boolean;
  reason?: "TOO_SHORT" | "TOO_LONG" | "TOO_COMMON";
}

/**
 * Deliberately light rules.
 *
 * Length is the only requirement that reliably helps; forced symbol classes push
 * people towards "Password1!" and a sticky note. A short deny-list catches the
 * handful of passwords that are always tried first.
 */
const TOO_COMMON = new Set([
  "password",
  "123456",
  "12345678",
  "123456789",
  "qwerty",
  "azerty",
  "motdepasse",
  "iloveyou",
  "guardian",
  "mcnvault",
  "thevault",
]);

export function checkPassword(password: string): PasswordCheck {
  const value = password.normalize("NFKC");
  if (value.length < 10) return { ok: false, reason: "TOO_SHORT" };
  if (value.length > 200) return { ok: false, reason: "TOO_LONG" };
  if (TOO_COMMON.has(value.toLowerCase())) return { ok: false, reason: "TOO_COMMON" };
  return { ok: true };
}

/** Normalised form used for lookups, so casing never splits an account in two. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/;

export function isEmailShaped(email: string): boolean {
  const value = normalizeEmail(email);
  return value.length <= 254 && EMAIL_SHAPE.test(value);
}
