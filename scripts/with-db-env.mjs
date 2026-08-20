#!/usr/bin/env node
/**
 * Runs a command with the database URLs normalised first.
 *
 * Hosting providers each name their Postgres variables differently — the Vercel
 * Neon integration alone can inject DATABASE_URL, POSTGRES_PRISMA_URL,
 * DATABASE_URL_UNPOOLED and POSTGRES_URL_NON_POOLING depending on its version.
 * Prisma's `env()` has no fallback syntax, so this wrapper resolves them once and
 * hands the result to prisma. A missing variable name is then never the reason a
 * deploy fails.
 *
 *   node scripts/with-db-env.mjs prisma migrate deploy
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

// Prisma loads .env itself, but this wrapper runs before it and has to resolve the
// connection variables first. Hosted environments have no .env file — hence the guard.
if (existsSync(".env")) {
  try {
    process.loadEnvFile(".env");
  } catch {
    // Malformed or unreadable .env: fall through to the real environment.
  }
}

/** Pooled connection — what the running application uses. */
const POOLED = ["DATABASE_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL"];

/** Direct connection — migrations cannot run through a pooler. */
const DIRECT = [
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
  "DIRECT_DATABASE_URL",
  "DATABASE_URL",
];

function firstSet(names) {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return { name, value };
  }
  return null;
}

/**
 * Neon's pooler is PgBouncer in transaction mode: it does not support the
 * advisory locks Prisma Migrate needs, so running migrations through it fails.
 * When only a pooled URL is available, derive the direct host from it — on Neon
 * the two differ by the "-pooler" suffix alone.
 */
function deriveDirect(url) {
  return url.includes("-pooler") ? url.replace("-pooler", "") : null;
}

const pooled = firstSet(POOLED);
let direct = firstSet(DIRECT.filter((name) => !POOLED.includes(name)));

if (!direct && pooled) {
  const derived = deriveDirect(pooled.value);
  if (derived) direct = { name: `${pooled.name} (pooler suffix removed)`, value: derived };
}

if (!pooled) {
  console.error(
    `[db-env] No database URL found. Set one of: ${POOLED.join(", ")}.\n` +
      `         Locally, put DATABASE_URL in .env; on Vercel, add it to the project's environment variables.`,
  );
  process.exit(1);
}

const env = { ...process.env, DATABASE_URL: pooled.value };
env.DATABASE_URL_UNPOOLED = direct ? direct.value : pooled.value;

// Never print the URLs themselves — only which variable each one came from.
console.log(
  `[db-env] pooled ← ${pooled.name} · direct ← ${direct ? direct.name : pooled.name}`,
);

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("[db-env] Nothing to run. Usage: node scripts/with-db-env.mjs <command> [args…]");
  process.exit(1);
}

const child = spawn(command, args, {
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code) => process.exit(code ?? 1));
child.on("error", (error) => {
  console.error(`[db-env] Could not run "${command}": ${error.message}`);
  process.exit(1);
});
