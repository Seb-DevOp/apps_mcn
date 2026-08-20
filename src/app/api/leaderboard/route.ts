import { getSessionUser } from "@/lib/auth";
import { ok, fail } from "@/lib/api";
import { getBoard, type BoardKey } from "@/lib/engine/leaderboard";

const BOARDS: BoardKey[] = ["xp", "score", "weekly", "streak"];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const board = url.searchParams.get("board") as BoardKey | null;
  if (board && !BOARDS.includes(board)) return fail("UNKNOWN_BOARD", 400);

  const user = await getSessionUser();
  const result = await getBoard(board ?? "xp", user?.id ?? null);
  return ok(result);
}
