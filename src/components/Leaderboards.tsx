"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { BoardKey, BoardResult, BoardRow } from "@/lib/engine/leaderboard";
import { useI18n } from "./I18nProvider";
import { TrophyIcon } from "./ui/Icons";

/**
 * Four boards, deliberately.
 *
 * Total XP rewards persistence, best run rewards skill, the weekly board gives
 * newcomers a table that resets, and the streak board rewards simply showing up.
 * No single number decides who counts.
 */
const BOARDS: { key: BoardKey; labelKey: string }[] = [
  { key: "xp", labelKey: "leaderboard.xp" },
  { key: "score", labelKey: "leaderboard.score" },
  { key: "weekly", labelKey: "leaderboard.weekly" },
  { key: "streak", labelKey: "leaderboard.streak" },
];

export function Leaderboards() {
  const { t } = useI18n();
  const [board, setBoard] = useState<BoardKey>("xp");
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

      <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
        {BOARDS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setBoard(entry.key)}
            data-active={board === entry.key}
            className="min-h-10 shrink-0 rounded-full border border-[rgba(201,162,77,0.2)] bg-[rgba(23,32,62,0.5)] px-4 text-xs transition data-[active=true]:border-[rgba(240,208,137,0.6)] data-[active=true]:bg-[rgba(201,162,77,0.14)] data-[active=true]:text-[var(--gold-bright)]"
          >
            {t(entry.labelKey)}
          </button>
        ))}
      </div>

      {loading && <p className="dim mt-6 text-center text-sm">{t("common.loading")}</p>}

      {!loading && data && data.rows.length === 0 && (
        <p className="dim mt-8 text-center text-sm">{t("leaderboard.empty")}</p>
      )}

      {!loading && data && data.rows.length > 0 && (
        <>
          <p className="dim mt-3 text-center text-xs">
            {t("leaderboard.players", { count: data.total })}
          </p>

          <ol className="mt-3 space-y-1.5">
            {data.rows.map((row, index) => (
              <Row key={row.userId} row={row} index={index} />
            ))}
          </ol>

          {/* The viewer always sees their own line, however far down it sits. */}
          {data.viewer && !data.rows.some((row) => row.isViewer) && (
            <>
              <p className="dim my-2 text-center text-xs">···</p>
              <Row row={data.viewer} index={0} />
            </>
          )}
        </>
      )}
    </main>
  );
}

function Row({ row, index }: { row: BoardRow; index: number }) {
  const { t } = useI18n();
  const podium = row.position <= 3;

  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.4) }}
      className={`panel flex items-center gap-3 px-3 py-2.5 ${row.isViewer ? "panel-sapphire" : ""}`}
    >
      <span
        className="tabular display w-7 shrink-0 text-center text-sm"
        style={{ color: podium ? "var(--gold-bright)" : "var(--text-dim)" }}
      >
        {row.position}
      </span>

      {podium && <TrophyIcon size={16} className="shrink-0 text-[var(--gold)]" />}

      <span className="min-w-0 flex-1 truncate text-sm text-[var(--parchment)]">
        <span className="mr-1.5">{row.rankEmoji}</span>
        {row.handle}
        {row.isViewer && (
          <span className="ml-2 rounded bg-[rgba(79,147,255,0.2)] px-1.5 py-0.5 text-[0.6rem] uppercase tracking-wider text-[var(--sapphire-pale)]">
            {t("leaderboard.you")}
          </span>
        )}
      </span>

      <span className="tabular display shrink-0 text-sm text-[var(--gold-bright)]">
        {row.value.toLocaleString()}
      </span>
    </motion.li>
  );
}
