#!/usr/bin/env node
/**
 * Portable PostgreSQL for local development.
 *
 * Starts a real PostgreSQL server from a downloaded binary — no Docker, no system
 * install, no shared credentials. Anyone who clones the repository can run the
 * whole stack, migrations included, without being handed access to Neon.
 *
 *   node scripts/dev-db.mjs start   # boots it and prints the connection string
 *   node scripts/dev-db.mjs stop
 *
 * The cluster lives under the OS temp directory (override with DEV_DB_DIR), never
 * inside the project. This is a development tool only: production runs on Neon.
 */

import EmbeddedPostgres from "embedded-postgres";
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const ROOT = process.cwd();
// Deliberately outside the project: a synced folder (OneDrive, Dropbox) will
// happily copy the files of a running cluster out from under it.
const BASE_DIR = process.env.DEV_DB_DIR ?? path.join(os.tmpdir(), "mcn-vault-devdb");
const DATA_DIR = path.join(BASE_DIR, "data");
const STATE_FILE = path.join(BASE_DIR, "state.json");
const PORT = Number(process.env.DEV_DB_PORT ?? 55432);
const USER = "mcn";
const PASSWORD = "mcn-local-dev";
const DATABASE = "mcn_vault";

export const CONNECTION = `postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DATABASE}`;

function makeServer() {
  return new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: USER,
    password: PASSWORD,
    port: PORT,
    persistent: true,
    // Windows initdb defaults to the system locale (WIN1252 in France), which
    // cannot store the rank emojis. The Vault is UTF-8 everywhere.
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
  });
}

async function start() {
  mkdirSync(path.dirname(DATA_DIR), { recursive: true });
  const fresh = !existsSync(path.join(DATA_DIR, "PG_VERSION"));
  const server = makeServer();

  if (fresh) {
    console.log("[dev-db] initialising a new cluster (first run downloads PostgreSQL)…");
    await server.initialise();
  }

  await server.start();

  if (fresh) {
    await server.createDatabase(DATABASE);
    console.log(`[dev-db] created database "${DATABASE}"`);
  }

  writeFileSync(STATE_FILE, JSON.stringify({ port: PORT, startedAt: Date.now() }, null, 2));
  console.log(`[dev-db] running on port ${PORT}`);
  console.log(`[dev-db] DATABASE_URL=${CONNECTION}`);
  return server;
}

async function stop() {
  const server = makeServer();
  try {
    await server.stop();
    console.log("[dev-db] stopped");
  } catch (error) {
    console.log(`[dev-db] not running (${error.message})`);
  }
}

const command = process.argv[2] ?? "start";

if (command === "start") {
  const server = await start();
  // Keep the process alive so the server stays up while tests run.
  if (process.argv.includes("--detach")) {
    process.exit(0);
  }
  const shutdown = async () => {
    await server.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
} else if (command === "stop") {
  await stop();
} else if (command === "url") {
  console.log(CONNECTION);
} else {
  console.error(`[dev-db] unknown command "${command}". Use start | stop | url.`);
  process.exit(1);
}
