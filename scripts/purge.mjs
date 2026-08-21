#!/usr/bin/env node
/**
 * Runs the retention purge by hand, against whatever DATABASE_URL is configured.
 * Same code path the nightly cron uses.
 *
 *   npm run db:purge
 */
import { purgeOldData, databaseFootprint } from "../src/lib/engine/retention.ts";

const before = await databaseFootprint();
const report = await purgeOldData();
const after = await databaseFootprint();

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2) + " MB";

console.log("Retention purge");
for (const [key, value] of Object.entries(report)) {
  if (key === "tookMs") continue;
  console.log(`  ${key.padEnd(16)} ${value} rows`);
}
console.log(`  ${"took".padEnd(16)} ${report.tookMs} ms`);
console.log(`\n  database ${mb(before.totalBytes)} → ${mb(after.totalBytes)}`);
console.log("\n  largest tables");
for (const row of after.tables.slice(0, 5)) {
  console.log(`    ${row.table.padEnd(18)} ${mb(row.bytes)}`);
}

process.exit(0);
