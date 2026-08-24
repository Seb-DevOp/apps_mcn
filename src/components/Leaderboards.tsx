"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { BoardKey, BoardResult, BoardRow } from "@/lib/engine/leaderboard";
import { useI18n } from "./I18nProvider";
import { formatNumber } from "./format";
import { TrophyIcon } from "./ui/Icons";

/**
 * Three boards, deliberately.
 *
 * Depth rewards whoever pushed furthest, Guardians reward whoever kept beating
 * the thing at the end of each floor, and fortune rewards whoever kept going
 * longest. No single number decides who counts.
 */
const BOARDS: { key: BoardKey; labelKey: string }[] = [
  { key: "depth", labelKey: "leaderboard.depth" },
  { key: "guardians", labelKey: "leaderboard.guardians" },
  { key: "fortune", labelKey: "leaderboard.fortune" },
];

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

      <div className="mt-4 grid grid-cols-3 gap-2">
        {BOARDS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setBoard(entry.key)}
            className="panel py-2 text-[0.7rem] uppercase tracking-widest transition"
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
          <div className="mt-4 space-y-1.5">
            {data.rows.map((row, index) => (
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
          {board === "depth"
            ? t("leaderboard.floorValue", { n: row.value })
            : formatNumber(row.value)}
        </span>
        {board !== "depth" && (
          <span className="dim tabular block text-[0.62rem]">
            {t("leaderboard.floorValue", { n: row.floor })}
          </span>
        )}
      </span>
    </motion.div>
  );
}
