import { ok, fail } from "@/lib/api";
import { purgeOldData, databaseFootprint } from "@/lib/engine/retention";

/**
 * Nightly retention purge, triggered by Vercel Cron.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` when that variable is set on
 * the project. Without it the route refuses: a public endpoint that deletes rows
 * is not something to leave open, even when everything it deletes is expendable.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorised(request)) return fail("FORBIDDEN", 403);

  const before = await databaseFootprint();
  const report = await purgeOldData();
  const after = await databaseFootprint();

  return ok({
    report,
    freedBytes: Math.max(0, before.totalBytes - after.totalBytes),
    totalBytes: after.totalBytes,
  });
}
