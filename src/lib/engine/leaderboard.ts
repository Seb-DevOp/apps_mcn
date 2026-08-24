import { prisma } from "@/lib/db";
import { levelInfo, LEVELS_PER_FLOOR } from "@/lib/content/idle";

/**
 * Five boards, on purpose.
 *
 * No single ranking should decide who matters, and since rebirth arrived there
 * are two genuinely different ways to be deep. **Depth** is the furthest a cat
 * ever got in one life; **Distance** is how much Vault it has walked across all
 * of them. A player who pushes one enormous run tops the first; one who has spent
 * a dozen lives tops the second. Reporting only the record would have made every
 * life after the first invisible.
 *
 * All five read the idle profile and nothing else.
 */

export type BoardKey = "depth" | "distance" | "lives" | "guardians" | "fortune";

export const BOARDS: BoardKey[] = ["depth", "distance", "lives", "guardians", "fortune"];

export interface BoardRow {
  position: number;
  userId: string;
  handle: string;
  /** The headline number for this board, already in the unit it is displayed in. */
  value: number;
  /** Deepest floor and lives spent, shown on every board as common context. */
  floor: number;
  lives: number;
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

type Field = "highestLevel" | "totalLevels" | "rebirths" | "bossKills" | "totalGold";

const ORDER: Record<BoardKey, Field> = {
  depth: "highestLevel",
  distance: "totalLevels",
  lives: "rebirths",
  guardians: "bossKills",
  fortune: "totalGold",
};

/** The smallest value worth ranking. Below it a player has not started. */
const FLOOR: Record<BoardKey, number> = {
  depth: 1,
  distance: 0,
  lives: 0,
  guardians: 0,
  fortune: 0,
};

interface ProfileShape {
  userId: string;
  highestLevel: number;
  totalLevels: number;
  rebirths: number;
  bossKills: number;
  totalGold: number;
  user: { handle: string };
}

const SELECT = {
  userId: true,
  highestLevel: true,
  totalLevels: true,
  rebirths: true,
  bossKills: true,
  totalGold: true,
  user: { select: { handle: true } },
} as const;

function valueFor(profile: ProfileShape, board: BoardKey): number {
  switch (board) {
    case "depth":
      return levelInfo(profile.highestLevel).floor;
    // Chambers are what the engine counts; floors are what a player reads.
    case "distance":
      return Math.floor(profile.totalLevels / LEVELS_PER_FLOOR);
    case "lives":
      return profile.rebirths;
    case "guardians":
      return profile.bossKills;
    case "fortune":
      return Math.floor(profile.totalGold);
  }
}

function toRow(
  profile: ProfileShape,
  board: BoardKey,
  position: number,
  viewerId: string | null,
): BoardRow {
  return {
    position,
    userId: profile.userId,
    handle: profile.user.handle,
    value: valueFor(profile, board),
    floor: levelInfo(profile.highestLevel).floor,
    lives: profile.rebirths,
    isViewer: profile.userId === viewerId,
  };
}

export async function getBoard(board: BoardKey, viewerId: string | null): Promise<BoardResult> {
  const field = ORDER[board];
  const where = { [field]: { gt: FLOOR[board] } };

  const [profiles, total] = await Promise.all([
    prisma.idleProfile.findMany({
      where,
      // createdAt breaks ties: whoever got there first keeps the higher place.
      orderBy: [{ [field]: "desc" }, { createdAt: "asc" }],
      take: LIMIT,
      select: SELECT,
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
    select: SELECT,
  });
  if (!profile) return null;

  const field = ORDER[board];
  const own = profile[field];
  if (own <= FLOOR[board]) return null;

  const ahead = await prisma.idleProfile.count({ where: { [field]: { gt: own } } });
  return toRow(profile, board, ahead + 1, viewerId);
}
