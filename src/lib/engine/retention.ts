import { prisma } from "@/lib/db";

/**
 * Data retention.
 *
 * Three tables grow with every action a player takes and are worth nothing after
 * a few months: raw analytics events, finished game sessions, and the XP ledger.
 * Left alone they are what fills a database, not the players themselves.
 *
 * The rule that governs everything here: **purging must never change a number a
 * player can see.** So the things a player's screens read from are kept —
 * ChestOpening (chests opened), DailyActivity (active days and retention), User
 * (xp, shards, streaks), InventoryItem, UserEquipment — and each player's
 * all-time best run survives regardless of age.
 */

/** Raw events. Retention curves are read from DailyActivity, which is kept. */
const ANALYTICS_DAYS = 90;

/** Finished runs. The score that matters already lives in ScoreEntry. */
const GAME_SESSION_DAYS = 90;

/** Audit trail for reward grants. Long enough to investigate, not forever. */
const LEDGER_DAYS = 180;

/** Score history beyond this is only useful as "your best ever", which is kept. */
const SCORE_DAYS = 8 * 7;

export interface PurgeReport {
  analyticsEvents: number;
  gameSessions: number;
  xpLedger: number;
  scoreEntries: number;
  sessions: number;
  authChallenges: number;
  emailTokens: number;
  tookMs: number;
}

function daysAgo(days: number, now: Date): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

export async function purgeOldData(now: Date = new Date()): Promise<PurgeReport> {
  const startedAt = Date.now();

  const [analyticsEvents, gameSessions, xpLedger, sessions, authChallenges, emailTokens] =
    await Promise.all([
      prisma.analyticsEvent.deleteMany({
        where: { createdAt: { lt: daysAgo(ANALYTICS_DAYS, now) } },
      }),
      prisma.gameSession.deleteMany({
        where: { createdAt: { lt: daysAgo(GAME_SESSION_DAYS, now) } },
      }),
      prisma.xpLedger.deleteMany({
        where: { createdAt: { lt: daysAgo(LEDGER_DAYS, now) } },
      }),
      // Expired sessions accumulate one row per sign-in and are dead weight.
      prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
      prisma.authChallenge.deleteMany({ where: { expiresAt: { lt: now } } }),
      prisma.emailToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    ]);

  /**
   * Old score rows, except each player's best.
   *
   * The profile and the leaderboard both read a player's all-time maximum, so
   * deleting the row that holds it would silently lower a number they have
   * already seen. The subquery keeps exactly one row per player and game.
   */
  const scoreCutoff = daysAgo(SCORE_DAYS, now);
  const scoreEntries = await prisma.$executeRaw`
    DELETE FROM "ScoreEntry"
    WHERE "createdAt" < ${scoreCutoff}
      AND id NOT IN (
        SELECT DISTINCT ON ("userId", "gameKey") id
        FROM "ScoreEntry"
        ORDER BY "userId", "gameKey", score DESC, "createdAt" ASC
      )
  `;

  return {
    analyticsEvents: analyticsEvents.count,
    gameSessions: gameSessions.count,
    xpLedger: xpLedger.count,
    scoreEntries,
    sessions: sessions.count,
    authChallenges: authChallenges.count,
    emailTokens: emailTokens.count,
    tookMs: Date.now() - startedAt,
  };
}

/** Sizes, so the effect of a purge can actually be seen. */
export async function databaseFootprint() {
  const rows = await prisma.$queryRaw<{ tbl: string; bytes: bigint }[]>`
    SELECT c.relname AS tbl, pg_total_relation_size(c.oid) AS bytes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY 2 DESC
    LIMIT 10
  `;
  const total = await prisma.$queryRaw<{ bytes: bigint }[]>`
    SELECT pg_database_size(current_database()) AS bytes
  `;

  return {
    totalBytes: Number(total[0]?.bytes ?? 0),
    tables: rows.map((row) => ({ table: row.tbl, bytes: Number(row.bytes) })),
  };
}
