"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RARITY_STYLE, affixLabel, itemName, type Rarity, type Slot } from "@/lib/content/idle";
import type { IdleState } from "@/lib/engine/idle";
import { useI18n } from "./I18nProvider";
import { formatNumber } from "./format";

/**
 * WHAT JUST DROPPED
 *
 * A card per find, with the three things you can do about it.
 *
 * Deliberately not a blocking modal. The cat keeps fighting several enemies a
 * second, so a dialogue that had to be dismissed would be a wall every few
 * seconds; this slides in over the arena, stacks up to three, and takes itself
 * away after a while. Ignoring it is a valid answer and means "keep it" — the
 * safe default, since nothing is lost by leaving a piece in the bag.
 *
 * Offline finds never reach here. Coming back to twelve hours of absence and
 * being handed twenty-five cards one at a time is not a reward, so the welcome
 * report counts them and the bag holds them.
 */

export interface LootEntry {
  id: string;
  slot: Slot;
  floor: number;
  rarity: Rarity;
  /** True when the slot was bare and the piece went straight on. */
  equipped: boolean;
}

/** How long a card waits before deciding you meant "keep it". */
const LINGER_MS = 13_000;

export function LootPrompt({
  queue,
  items,
  busy,
  onAct,
  onDismiss,
}: {
  queue: LootEntry[];
  items: IdleState["items"];
  busy: string | null;
  onAct: (body: Record<string, unknown>, key: string) => void;
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--nav-height)+0.75rem)] z-40 flex justify-center px-3">
      <div className="flex w-full max-w-[var(--shell-max)] flex-col gap-2">
        <AnimatePresence initial={false}>
          {queue.map((entry) => (
            <Card
              key={entry.id}
              entry={entry}
              item={items.find((item) => item.id === entry.id) ?? null}
              busy={busy}
              onAct={onAct}
              onDismiss={onDismiss}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Card({
  entry,
  item,
  busy,
  onAct,
  onDismiss,
}: {
  entry: LootEntry;
  item: IdleState["items"][number] | null;
  busy: string | null;
  onAct: (body: Record<string, unknown>, key: string) => void;
  onDismiss: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const style = RARITY_STYLE[entry.rarity];

  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(entry.id), LINGER_MS);
    return () => window.clearTimeout(timer);
  }, [entry.id, onDismiss]);

  /**
   * The card goes when the question it asked has been answered.
   *
   * Selling removes the item, so its absence was already handled. Wearing does
   * not — the piece is still there, only worn — so the card sat open after
   * "Wear" with every button dead, waiting out its thirteen seconds.
   *
   * A piece that went straight on because the slot was bare is the exception: it
   * arrives already worn and is there to be read, not answered, so it keeps its
   * full time on screen.
   */
  useEffect(() => {
    if (!item) onDismiss(entry.id);
    else if (!entry.equipped && item.equipped) onDismiss(entry.id);
  }, [item, entry.id, entry.equipped, onDismiss]);

  if (!item) return null;

  const gain = item.gain ?? 1;
  const better = gain > 1.0001;
  const worn = item.equipped;
  const value = Math.max(1, Math.round(item.power * 4));

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      data-loot-card=""
      className="panel pointer-events-auto p-3"
      style={{
        borderColor: `${style.color}88`,
        boxShadow: `0 0 18px ${style.glow}, 0 10px 30px rgba(0,0,0,0.7)`,
        // Opaque, not the panel's usual translucency: this floats over the
        // upgrade grid, and a card you can read the page through is a card nobody
        // reads.
        background: "#0a1020",
        backdropFilter: "blur(6px)",
      }}
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: style.color, boxShadow: `0 0 8px ${style.color}` }}
        />
        <div className="min-w-0 flex-1">
          <p className="dim text-[0.58rem] uppercase tracking-widest">
            {worn ? t("loot.equipped") : t("loot.found")} · {t(`idle.slot.${entry.slot}`)}
          </p>
          <p className="truncate text-[0.82rem]" style={{ color: style.color }}>
            {itemName(entry.slot, entry.floor, entry.rarity, locale)}
          </p>
          <p className="tabular mt-0.5 text-[0.68rem] text-[var(--parchment)]">
            {formatNumber(item.power)}
            <span className="dim"> · </span>
            <span className="text-[#7ed08f]">{formatNumber(item.vitality)}</span>
          </p>
        </div>

        <span
          className="tabular shrink-0 rounded px-1.5 py-0.5 text-[0.7rem]"
          style={{
            background: better ? "rgba(126,208,143,0.14)" : "rgba(255,255,255,0.05)",
            color: better ? "#7ed08f" : "var(--text-faint)",
          }}
        >
          {worn
            ? "—"
            : better && Math.round((gain - 1) * 100) >= 1
              ? `+${Math.round((gain - 1) * 100)}%`
              : better
                ? t("loot.marginal")
                : t("loot.worse")}
        </span>
      </div>

      {item.affixes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.affixes.map((affix, index) => (
            <span
              key={`${affix.key}-${index}`}
              className="rounded px-1.5 py-0.5 text-[0.62rem]"
              style={{ background: "rgba(79,147,255,0.12)", color: "var(--sapphire-pale)" }}
            >
              {affixLabel(affix, locale)}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        <button
          type="button"
          className="btn btn-gold py-1.5 text-[0.68rem] disabled:opacity-40"
          disabled={worn || busy !== null}
          onClick={() => onAct({ action: "equip", itemId: entry.id }, entry.id)}
        >
          {t("idle.equip")}
        </button>
        <button
          type="button"
          className="btn btn-ghost py-1.5 text-[0.68rem] disabled:opacity-40"
          disabled={worn || busy !== null}
          onClick={() => onAct({ action: "sell", itemId: entry.id }, entry.id)}
        >
          {t("idle.sell")} +{formatNumber(value)}
        </button>
        <button
          type="button"
          className="btn btn-ghost py-1.5 text-[0.68rem]"
          onClick={() => onDismiss(entry.id)}
        >
          {t("loot.keep")}
        </button>
      </div>
    </motion.div>
  );
}
