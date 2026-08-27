"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { BoardKey, BoardResult, BoardRow } from "@/lib/engine/leaderboard";
import { CatCanvas } from "./CatCanvas";
import { useI18n } from "./I18nProvider";
import { formatNumber } from "./format";
import { TrophyIcon } from "./ui/Icons";

/**
 * Five boards, deliberately.
 *
 * Since rebirth there are two different ways to be deep: Depth is the furthest
 * one life ever got, Distance is how much Vault has been walked across all of
 * them. One rewards a single enormous run, the other a dozen spent lives, and
 * ranking only the record would have made every life after the first invisible.
 */
const BOARDS: { key: BoardKey; labelKey: string }[] = [
  { key: "depth", labelKey: "leaderboard.depth" },
  { key: "distance", labelKey: "leaderboard.distance" },
  { key: "lives", labelKey: "leaderboard.lives" },
  { key: "guardians", labelKey: "leaderboard.guardians" },
  { key: "fortune", labelKey: "leaderboard.fortune" },
  { key: "chests", labelKey: "leaderboard.chests" },
];

/** Gold, silver, bronze. The only three places that get a colour of their own. */
const MEDALS = ["#f3d68f", "#cfd8e3", "#d09a63"];

export function Leaderboards() {
  const { t } = useI18n();
  const [board, setBoard] = useState<BoardKey>("depth");
  const [data, setData] = useState<BoardResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/leaderboard?board=${board}`)
      .then((response) => response.json())
      .then((payload) => {
        if (!cancelled && payload.ok) setData(payload as BoardResult);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [board]);

  return (
    <main className="pt-5">
      <header className="text-center">
        <p className="eyebrow">{t("app.subtitle")}</p>
        <h1 className="display gold-text mt-0.5 text-2xl">{t("leaderboard.title")}</h1>
      </header>

      {/*
        A grid, not a scrolling row.

        Five tabs scrolled sideways and the fifth was already half off the edge;
        the sixth was past it entirely, with nothing on screen to suggest there
        was anything to scroll to. A board nobody can find is a board that does
        not exist — two rows of three fit the width and are all visible at once.
      */}
      <div className="mt-4 grid grid-cols-3 gap-1.5">
        {BOARDS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setBoard(entry.key)}
            className="panel truncate px-1.5 py-1.5 text-[0.62rem] uppercase tracking-[0.08em] transition"
            style={{
              borderColor: board === entry.key ? "rgba(201,162,77,0.6)" : undefined,
              color: board === entry.key ? "var(--gold-bright)" : "var(--text-dim)",
              background: board === entry.key ? "rgba(201,162,77,0.08)" : undefined,
            }}
          >
            {t(entry.labelKey)}
          </button>
        ))}
      </div>

      <p className="dim mt-3 text-center text-[0.7rem] italic">{t(`leaderboard.${board}.hint`)}</p>

      {loading && !data ? (
        <p className="dim mt-8 text-center text-sm">{t("common.loading")}</p>
      ) : !data || data.rows.length === 0 ? (
        <p className="dim mt-8 text-center text-sm">{t("leaderboard.empty")}</p>
      ) : (
        <>
          <Podium rows={data.rows.slice(0, 3)} board={board} />

          <div className="mt-4 space-y-1.5">
            {data.rows.slice(3).map((row, index) => (
              <Row key={row.userId} row={row} board={board} index={index} />
            ))}
          </div>

          {data.viewer && (
            <>
              <p className="dim mt-5 text-center text-[0.66rem] uppercase tracking-widest">
                {t("leaderboard.you")}
              </p>
              <div className="mt-1.5">
                <Row row={data.viewer} board={board} index={0} />
              </div>
            </>
          )}

          <p className="dim mt-5 text-center text-[0.68rem]">
            {t("leaderboard.total", { n: data.total })}
          </p>
        </>
      )}
    </main>
  );
}

/**
 * THE PODIUM
 *
 * Three cats, wearing what they were actually wearing when the board was read.
 *
 * A leaderboard of handles and numbers says who won and nothing about what
 * winning looks like. The cat is the whole game — the coat is bought, the six
 * pieces are found and chosen — so the top three are drawn rather than listed,
 * and a player scrolling past can see what a Sovereign set on a Void coat looks
 * like before they have one.
 *
 * Second, first, third, left to right: the middle is the tallest place on a
 * podium, and reading order is not rank order once there is a shape to read.
 */
function Podium({ rows, board }: { rows: BoardRow[]; board: BoardKey }) {
  const { t } = useI18n();
  const [first, second, third] = rows;
  const places = [second, first, third].filter(Boolean) as BoardRow[];
  if (places.length === 0) return null;

  return (
    <div className="mt-4 flex items-end justify-center gap-2">
      {places.map((row) => {
        const rank = row.position;
        const medal = MEDALS[rank - 1] ?? "var(--text-faint)";
        const top = rank === 1;
        return (
          <motion.div
            key={row.userId}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: (rank === 1 ? 0 : rank) * 0.06 }}
            className="flex min-w-0 flex-1 flex-col items-center"
          >
            {/* The winner is drawn larger and is the only one still breathing:
                a podium where all three are the same size is a list in a row. */}
            <CatCanvas
              worn={row.cat?.worn ?? []}
              size={top ? 96 : 74}
              breathing={top}
              skin={row.cat?.skin ?? "classic"}
            />
            <div
              className="panel w-full px-1.5 pb-2 text-center"
              style={{
                borderColor: `${medal}66`,
                background: row.isViewer ? "rgba(201,162,77,0.1)" : `${medal}0f`,
                paddingTop: top ? "0.6rem" : "0.35rem",
              }}
            >
              <p
                className="tabular text-[0.9rem] leading-none"
                style={{ color: medal, textShadow: `0 0 10px ${medal}55` }}
              >
                {rank}
              </p>
              <p className="mt-1 truncate text-[0.68rem] text-[var(--parchment)]">{row.handle}</p>
              <p className="gold-text tabular mt-0.5 text-[0.7rem] leading-tight">
                {valueLabel(row, board, t)}
              </p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/**
 * The headline number, in the unit its board counts in.
 *
 * "floor 700" and "700 floors" are different claims: one is a place, the other
 * a distance. Shared by the podium and the list so the two can never disagree.
 */
function valueLabel(row: BoardRow, board: BoardKey, t: (key: string, vars?: Record<string, string | number>) => string) {
  switch (board) {
    case "depth":
      return t("leaderboard.floorValue", { n: formatNumber(row.value) });
    case "distance":
      return t("leaderboard.distanceValue", { n: formatNumber(row.value) });
    case "lives":
      return t(row.value === 1 ? "leaderboard.lifeValue" : "leaderboard.livesValue", {
        n: row.value,
      });
    case "chests":
      return t("leaderboard.chestValue", { n: formatNumber(row.value) });
    default:
      return formatNumber(row.value);
  }
}

function Row({ row, board, index }: { row: BoardRow; board: BoardKey; index: number }) {
  const { t } = useI18n();
  const podium = row.position <= 3;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 10) * 0.025 }}
      className="panel flex items-center gap-3 px-3 py-2"
      style={{
        borderColor: row.isViewer ? "rgba(201,162,77,0.6)" : undefined,
        background: row.isViewer ? "rgba(201,162,77,0.07)" : undefined,
      }}
    >
      <span
        className="tabular w-7 shrink-0 text-center text-[0.8rem]"
        style={{ color: podium ? "var(--gold-bright)" : "var(--text-faint)" }}
      >
        {row.position}
      </span>

      {podium && (
        <span className="text-[var(--gold)]">
          <TrophyIcon size={16} />
        </span>
      )}

      <span className="min-w-0 flex-1 truncate text-[0.82rem] text-[var(--parchment)]">
        {row.handle}
      </span>

      <span className="text-right">
        <span className="tabular gold-text block text-[0.85rem]">
          {valueLabel(row, board, t)}
        </span>
        {/* Depth and lives under every board: the headline number alone says
            nothing about what kind of player produced it. */}
        <span className="dim tabular block text-[0.6rem]">
          {t(row.lives === 1 ? "leaderboard.contextOne" : "leaderboard.context", {
            floor: row.floor,
            lives: row.lives,
          })}
        </span>
      </span>
    </motion.div>
  );
}
