"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { IdleState } from "@/lib/engine/idle";
import { useI18n } from "./I18nProvider";
import { formatFactor, formatNumber } from "./format";
import { ItemIcon } from "./ui/Icons";

/**
 * REBIRTH
 *
 * The first arc decelerates on purpose — each floor costs more than the last —
 * which is what makes an idle game last and also what eventually turns a wall
 * into an ending. This turns the wall into a decision: spend the run, keep what
 * it taught you, start again stronger.
 *
 * Relics are paid on **record depth only**. Paying per run would make rebirthing
 * at the shallowest allowed floor a farm, and a farm is the opposite of a reason
 * to go deeper. The screen says so rather than letting a player discover it by
 * being disappointed.
 */
export function IdleRebirth({
  state,
  busy,
  act,
}: {
  state: IdleState;
  busy: string | null;
  act: (body: Record<string, unknown>, key: string) => void;
}) {
  const { t, L, locale } = useI18n();
  const [confirming, setConfirming] = useState(false);

  /**
   * A relic's effect, in the form it actually takes.
   *
   * Three of the four multiply — damage, health, gold — and Fortune does not:
   * it adds percentage points to a probability. Writing "×1.21 drop chance"
   * would be a lie in the shape of a number.
   */
  const effect = (
    relic: IdleState["relicShop"][number],
    value: number = relic.held,
    withUnit = true,
  ) => {
    // The unit is dropped on the right-hand side of an arrow: "×2.65 damage →
    // ×2.80" says the same thing as repeating it and fits on one line.
    const unit = withUnit ? ` ${locale === "fr" ? relic.unitFr : relic.unitEn}` : "";
    return relic.factor
      ? `×${formatFactor(value)}${unit}`
      : `+${Math.round(value * 100)} %${unit}`;
  };

  const { rebirth } = state;
  const worthIt = rebirth.owed > 0;

  return (
    <div className="pb-4">
      <section className="panel panel-gilded mt-4 p-4 text-center">
        <p className="eyebrow">{t("rebirth.livesSpent", { n: rebirth.rebirths })}</p>
        <p className="gold-text tabular mt-2 text-3xl">{formatNumber(rebirth.relics)}</p>
        <p className="dim text-[0.68rem] uppercase tracking-widest">{t("rebirth.relics")}</p>

        <p className="dim mt-4 text-[0.74rem] leading-snug">{t("rebirth.intro")}</p>

        <div className="mt-4 grid grid-cols-2 gap-2 text-center">
          <div className="panel px-2 py-2">
            <p className="dim text-[0.58rem] uppercase tracking-widest">{t("rebirth.record")}</p>
            <p className="tabular mt-1 text-[0.95rem] text-[var(--parchment)]">
              {rebirth.bestFloor}
            </p>
          </div>
          <div className="panel px-2 py-2">
            <p className="dim text-[0.58rem] uppercase tracking-widest">{t("rebirth.owed")}</p>
            <p
              className="tabular mt-1 text-[0.95rem]"
              style={{ color: worthIt ? "var(--gold-bright)" : "var(--text-faint)" }}
            >
              {formatNumber(rebirth.owed)}
            </p>
            {/* What is owed is a difference — this record's worth, less what has
                already been paid for it. On its own it reads as a total, and a
                total is what makes a number look either enormous or insulting. */}
            <p className="dim text-[0.55rem] leading-tight">
              {t("rebirth.owedOf", {
                total: formatNumber(rebirth.total),
                floor: rebirth.bestFloor,
              })}
            </p>
          </div>
        </div>

        {!rebirth.ready ? (
          <p className="mt-4 text-[0.72rem] italic text-[var(--candle)]">
            {t("rebirth.tooShallow", { n: rebirth.minFloor })}
          </p>
        ) : !worthIt ? (
          <p className="mt-4 text-[0.72rem] italic text-[var(--candle)]">
            {t("rebirth.noRecord")}
          </p>
        ) : confirming ? (
          <div className="mt-4">
            <p className="text-[0.74rem] leading-snug text-[#ffb0a0]">{t("rebirth.warning")}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="btn btn-ghost py-2 text-[0.75rem]"
                onClick={() => setConfirming(false)}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="btn btn-gold py-2 text-[0.75rem]"
                disabled={busy !== null}
                onClick={() => {
                  setConfirming(false);
                  act({ action: "rebirth" }, "rebirth");
                }}
              >
                {t("rebirth.confirm", { n: rebirth.owed })}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-gold mt-4 w-full py-2.5"
            disabled={busy !== null}
            onClick={() => setConfirming(true)}
          >
            {t("rebirth.spend", { n: rebirth.owed })}
          </button>
        )}
      </section>

      {/*
        What the relics already bought are doing, at a glance.

        The shop is three sections down and its cards used to say only what one
        more level costs, so a player who had spent four lives' worth had no way
        to see what any of it was worth. This is the same number the fight is
        resolved with.
      */}
      {state.relicShop.some((relic) => relic.level > 0) && (
        <section className="panel mt-3 p-3">
          <p className="dim text-[0.58rem] uppercase tracking-widest">{t("rebirth.held")}</p>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
            {state.relicShop
              .filter((relic) => relic.level > 0)
              .map((relic) => (
                <div key={relic.key} className="flex items-center gap-2">
                  <span className="shrink-0 text-[var(--gold)]">
                    <ItemIcon icon={relic.icon} size={15} />
                  </span>
                  <span className="dim min-w-0 flex-1 truncate text-[0.64rem]">
                    {L(relic.nameEn, relic.nameFr)}
                    <span className="tabular"> {relic.level}</span>
                  </span>
                  <span className="tabular shrink-0 text-[0.7rem] text-[var(--gold-bright)]">
                    {effect(relic)}
                  </span>
                </div>
              ))}
          </div>
        </section>
      )}

      <h2 className="eyebrow mt-6">{t("rebirth.shop")}</h2>
      <p className="dim mt-1 text-[0.68rem] italic">{t("rebirth.shopHint")}</p>

      <div className="mt-2 grid grid-cols-2 gap-2">
        {state.relicShop.map((relic, index) => {
          const affordable = relic.affordable && !relic.maxed;
          return (
            <motion.button
              key={relic.key}
              type="button"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              disabled={!affordable || busy !== null}
              onClick={() => act({ action: "relic", key: relic.key }, relic.key)}
              className="panel p-3 text-left transition disabled:opacity-45"
              style={affordable ? { borderColor: "rgba(201,162,77,0.45)" } : undefined}
            >
              <div className="flex items-center gap-2">
                <span className="text-[var(--gold)]">
                  <ItemIcon icon={relic.icon} size={18} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[0.78rem] text-[var(--parchment)]">
                  {L(relic.nameEn, relic.nameFr)}
                </span>
                <span className="tabular dim text-[0.7rem]">{relic.level}</span>
              </div>
              {relic.level > 0 && (
                <p className="tabular mt-1 text-[0.72rem] text-[var(--gold-bright)]">
                  {effect(relic)}
                  {!relic.maxed && (
                    <span className="dim"> → {effect(relic, relic.next, false)}</span>
                  )}
                </p>
              )}
              <p className="dim mt-1 text-[0.62rem] leading-snug">
                {L(relic.descEn, relic.descFr)}
              </p>
              <p className="gold-text tabular mt-2 text-[0.72rem]">
                {relic.maxed ? t("idle.maxed") : t("rebirth.cost", { n: formatNumber(relic.cost) })}
              </p>
            </motion.button>
          );
        })}
      </div>
      <h2 className="eyebrow mt-6">{t("rebirth.ladder")}</h2>
      <p className="dim mt-1 text-[0.68rem] italic">{t("rebirth.ladderHint")}</p>

      <div className="mt-2 space-y-1.5">
        {state.unlocks.map((entry) => (
          <div
            key={entry.key}
            className="panel flex items-start gap-2.5 p-2.5"
            style={{
              borderColor: entry.open ? "rgba(201,162,77,0.45)" : undefined,
              opacity: entry.open ? 1 : 0.55,
            }}
          >
            <span
              className="mt-0.5 shrink-0"
              style={{ color: entry.open ? "var(--gold)" : "var(--text-faint)" }}
            >
              <ItemIcon icon={entry.icon} size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.78rem] text-[var(--parchment)]">
                {L(entry.nameEn, entry.nameFr)}
              </p>
              <p className="dim text-[0.65rem] leading-snug">{L(entry.descEn, entry.descFr)}</p>
            </div>
            <span className="tabular shrink-0 text-[0.65rem]" style={{ color: "var(--text-faint)" }}>
              {entry.open ? t("rebirth.open") : t("rebirth.atLife", { n: entry.rebirths })}
            </span>
          </div>
        ))}
      </div>

    </div>
  );
}
