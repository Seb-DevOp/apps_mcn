import { prisma } from "@/lib/db";
import { levelInfo } from "@/lib/content/idle";

/**
 * Three boards, on purpose.
 *
 * No single ranking should decide who matters. The deepest board belongs to
 * whoever pushed furthest, the Guardians board to whoever kept beating the thing
 * at the end of each floor, and the fortune board to whoever kept going longest.
 * Everyone has a table they can be good at.
 *
 * All three read the idle profile and nothing else: the old ladders ranked XP and
 * streaks, which no longer exist to be ranked.
 */

export type BoardKey = "depth" | "guardians" | "fortune";

export const BOARDS: BoardKey[] = ["depth", "guardians", "fortune"];

export interface BoardRow {
  position: number;
  userId: string;
  handle: string;
  /** The headline number for this board. */
  value: number;
  /** Deepest floor, shown on every board as the common yardstick. */
  floor: number;
  isViewer: boolean;
}

export interface BoardResult {
  board: BoardKey;
  rows: BoardRow[];
  /** The viewer's own row, when they are ranked but not in the visible top. */
  viewer: BoardRow | null;
  total: number;
}

const LIMIT = 25;

const ORDER: Record<BoardKey, "highestLevel" | "bossKills" | "totalGold"> = {
  depth: "highestLevel",
  guardians: "bossKills",
  fortune: "totalGold",
};

function toRow(
  profile: {
    userId: string;
    highestLevel: number;
    bossKills: number;
    totalGold: number;
    user: { handle: string };
  },
  board: BoardKey,
  position: number,
  viewerId: string | null,
): BoardRow {
  return {
    position,
    userId: profile.userId,
    handle: profile.user.handle,
    value:
      board === "depth"
        ? levelInfo(profile.highestLevel).floor
        : board === "guardians"
          ? profile.bossKills
          : Math.floor(profile.totalGold),
    floor: levelInfo(profile.highestLevel).floor,
    isViewer: profile.userId === viewerId,
  };
}

export async function getBoard(board: BoardKey, viewerId: string | null): Promise<BoardResult> {
  const field = ORDER[board];
  const where = { [field]: { gt: board === "depth" ? 1 : 0 } };

  const [profiles, total] = await Promise.all([
    prisma.idleProfile.findMany({
      where,
      // createdAt breaks ties: whoever got there first keeps the higher place.
      orderBy: [{ [field]: "desc" }, { createdAt: "asc" }],
      take: LIMIT,
      select: {
        userId: true,
        highestLevel: true,
        bossKills: true,
        totalGold: true,
        user: { select: { handle: true } },
      },
    }),
    prisma.idleProfile.count({ where }),
  ]);

  const rows = profiles.map((profile, index) => toRow(profile, board, index + 1, viewerId));

  return { board, rows, viewer: await viewerRow(board, viewerId, rows), total };
}

/**
 * The viewer's own line, when they did not make the visible top.
 *
 * Counting how many profiles beat them is one query and is exact, which matters:
 * a leaderboard that tells a player the wrong position about themselves is worse
 * than one that does not show them at all.
 */
async function viewerRow(
  board: BoardKey,
  viewerId: string | null,
  rows: BoardRow[],
): Promise<BoardRow | null> {
  if (!viewerId || rows.some((row) => row.isViewer)) return null;

  const profile = await prisma.idleProfile.findUnique({
    where: { userId: viewerId },
    select: {
      userId: true,
      highestLevel: true,
      bossKills: true,
      totalGold: true,
      user: { select: { handle: true } },
    },
  });
  if (!profile) return null;

  const field = ORDER[board];
  const own = profile[field];
  if (own <= (board === "depth" ? 1 : 0)) return null;

  const ahead = await prisma.idleProfile.count({ where: { [field]: { gt: own } } });
  return toRow(profile, board, ahead + 1, viewerId);
}
