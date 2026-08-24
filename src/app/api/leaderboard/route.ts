import { getSessionUser } from "@/lib/auth";
import { ok, fail } from "@/lib/api";
import { getBoard, BOARDS, type BoardKey } from "@/lib/engine/leaderboard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const board = url.searchParams.get("board") as BoardKey | null;
  if (board && !BOARDS.includes(board)) return fail("UNKNOWN_BOARD", 400);

  const user = await getSessionUser();
  return ok(await getBoard(board ?? "depth", user?.id ?? null));
}
