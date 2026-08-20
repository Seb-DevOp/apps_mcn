import crypto from "node:crypto";
import { prisma } from "../db";

/**
 * Recovery codes.
 *
 * The floor under every other method. A player who loses their phone, forgets
 * their password and never verified an email still has one way back in — which is
 * the whole point of asking them to keep the codes somewhere safe.
 *
 * Only hashes are stored. Losing the database does not leak a way into accounts,
 * and neither does reading it.
 */

const CODE_COUNT = 6;
/** Crockford-style alphabet: no 0/O, no 1/I/L — these get read aloud and retyped. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const GROUPS = 3;
const GROUP_LENGTH = 4;

function generateCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < GROUPS; g++) {
    let group = "";
    for (let i = 0; i < GROUP_LENGTH; i++) {
      group += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join("-");
}

/** Codes are high-entropy random, so a plain fast hash is the right tool here. */
function hashCode(code: string): string {
  return crypto.createHash("sha256").update(normalizeCode(code)).digest("base64url");
}

export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Replaces every unused code with a fresh set and returns the plaintext once.
 * The caller must show them immediately — they are never recoverable afterwards.
 */
export async function issueRecoveryCodes(userId: string): Promise<string[]> {
  const codes = Array.from({ length: CODE_COUNT }, generateCode);

  await prisma.$transaction(async (tx) => {
    await tx.recoveryCode.deleteMany({ where: { userId, usedAt: null } });
    await tx.recoveryCode.createMany({
      data: codes.map((code) => ({ userId, codeHash: hashCode(code) })),
    });
  });

  return codes;
}

export async function countRemainingCodes(userId: string): Promise<number> {
  return prisma.recoveryCode.count({ where: { userId, usedAt: null } });
}

/**
 * Spends a code and returns the account it belongs to.
 *
 * The update is conditional on the code still being unused, so two simultaneous
 * attempts cannot both succeed.
 */
export async function consumeRecoveryCode(code: string): Promise<string | null> {
  const codeHash = hashCode(code);

  const spent = await prisma.recoveryCode.updateMany({
    where: { codeHash, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (spent.count === 0) return null;

  const row = await prisma.recoveryCode.findUnique({ where: { codeHash } });
  return row?.userId ?? null;
}
