import { prisma } from "@/lib/db";
import { weekKey } from "@/lib/time";
import { rankForXp } from "@/lib/content/ranks";

/**
 * Several boards, on purpose.
 *
 * No single ranking should decide who matters. A precise player tops the score
 * board, a loyal player tops the streak board, a steady player tops XP. Everyone
 * has a table they can be good at.
 */

export type BoardKey = "xp" | "score" | "weekly" | "streak";

export interface BoardRow {
  position: number;
  userId: string;
  handle: string;
  rankKey: string;
  rankEmoji: string;
  value: number;
  isViewer: boolean;
}

export interface BoardResult {
  board: BoardKey;
  rows: BoardRow[];
  viewer: BoardRow | null;
  /** Total players ranked on this board. */
  total: number;
}

const LIMIT = 25;

export async function getBoard(board: BoardKey, viewerId: string | null): Promise<BoardResult> {
  if (board === "xp" || board === "streak") {
    const orderBy = board === "xp" ? { xp: "desc" as const } : { bestStreak: "desc" as const };
    const users = await prisma.user.findMany({
      where: board === "xp" ? { xp: { gt: 0 } } : { bestStreak: { gt: 0 } },
      orderBy: [orderBy, { createdAt: "asc" }],
      take: LIMIT,
      select: { id: true, handle: true, xp: true, bestStreak: true, rankKey: true },
    });

    const rows: BoardRow[] = users.map((u, index) => ({
      position: index + 1,
      userId: u.id,
      handle: u.handle,
      rankKey: u.rankKey,
      rankEmoji: rankForXp(u.xp).emoji,
      value: board === "xp" ? u.xp : u.bestStreak,
      isViewer: u.id === viewerId,
    }));

    const total = await prisma.user.count({
      where: board === "xp" ? { xp: { gt: 0 } } : { bestStreak: { gt: 0 } },
    });
    const viewer = await viewerRow(board, viewerId, rows);
    return { board, rows, viewer, total };
  }

  // Score boards: a player's single best run, all time or this week.
  const where =
    board === "weekly"
      ? { gameKey: "crystal-resonance", weekKey: weekKey() }
      : { gameKey: "crystal-resonance" };

  const grouped = await prisma.scoreEntry.groupBy({
    by: ["userId"],
    where,
    _max: { score: true },
    orderBy: { _max: { score: "desc" } },
    take: LIMIT,
  });

  const users = await prisma.user.findMany({
    where: { id: { in: grouped.map((g) => g.userId) } },
    select: { id: true, handle: true, xp: true, rankKey: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  const rows: BoardRow[] = grouped.map((g, index) => {
    const user = byId.get(g.userId);
    return {
      position: index + 1,
      userId: g.userId,
      handle: user?.handle ?? "—",
      rankKey: user?.rankKey ?? "wanderer",
      rankEmoji: rankForXp(user?.xp ?? 0).emoji,
      value: g._max.score ?? 0,
      isViewer: g.userId === viewerId,
    };
  });

  const distinct = await prisma.scoreEntry.groupBy({ by: ["userId"], where });
  const viewer = await viewerRow(board, viewerId, rows);
  return { board, rows, viewer, total: distinct.length };
}

/**
 * The viewer's own line, always shown even when they are far below the top —
 * seeing your real position is more motivating than not appearing at all.
 */
async function viewerRow(
  board: BoardKey,
  viewerId: string | null,
  rows: BoardRow[],
): Promise<BoardRow | null> {
  if (!viewerId) return null;
  const inTop = rows.find((r) => r.userId === viewerId);
  if (inTop) return inTop;

  const user = await prisma.user.findUnique({
    where: { id: viewerId },
    select: { id: true, handle: true, xp: true, bestStreak: true, rankKey: true },
  });
  if (!user) return null;

  let value = 0;
  let position = 0;

  if (board === "xp") {
    value = user.xp;
    position = (await prisma.user.count({ where: { xp: { gt: user.xp } } })) + 1;
  } else if (board === "streak") {
    value = user.bestStreak;
    position = (await prisma.user.count({ where: { bestStreak: { gt: user.bestStreak } } })) + 1;
  } else {
    const where =
      board === "weekly"
        ? { userId: viewerId, gameKey: "crystal-resonance", weekKey: weekKey() }
        : { userId: viewerId, gameKey: "crystal-resonance" };
    const best = await prisma.scoreEntry.aggregate({ where, _max: { score: true } });
    value = best._max.score ?? 0;
    if (value === 0) return null;

    const better = await prisma.scoreEntry.groupBy({
      by: ["userId"],
      where:
        board === "weekly"
          ? { gameKey: "crystal-resonance", weekKey: weekKey(), score: { gt: value } }
          : { gameKey: "crystal-resonance", score: { gt: value } },
    });
    position = better.length + 1;
  }

  if (value === 0) return null;

  return {
    position,
    userId: user.id,
    handle: user.handle,
    rankKey: user.rankKey,
    rankEmoji: rankForXp(user.xp).emoji,
    value,
    isViewer: true,
  };
}
