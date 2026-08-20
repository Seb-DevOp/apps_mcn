"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CHAMBERS, LORE } from "@/lib/content/vault";
import { RANKS } from "@/lib/content/ranks";
import { useI18n } from "./I18nProvider";
import { McnCrest } from "./ui/Icons";

/**
 * Walking the Vault.
 *
 * Every player always sees three things at once: chambers they have entered, the
 * one door just out of reach, and doors far beyond it. The locked hints are real
 * requirements — "Requires Royal Guardian" means exactly that — because a fake
 * teaser only works once.
 */
export function VaultExplorer({ rankOrder, whisper }: { rankOrder: number; whisper: { en: string; fr: string } }) {
  const { t, L } = useI18n();
  const [openLore, setOpenLore] = useState<string | null>(null);

  // Being here counts as walking the Vault today.
  useEffect(() => {
    void fetch("/api/vault/visit", { method: "POST" }).catch(() => {});
  }, []);

  const seen = CHAMBERS.filter((c) => c.requiredRankOrder <= rankOrder).length;
  const found = LORE.filter((l) => l.requiredRankOrder <= rankOrder).length;

  return (
    <main className="pt-5">
      <header className="text-center">
        <p className="eyebrow">{t("app.subtitle")}</p>
        <h1 className="display gold-text mt-0.5 text-2xl">{t("explore.title")}</h1>
        <p className="dim mt-1 text-xs">{t("explore.subtitle", { seen })}</p>
      </header>

      <section className="panel mt-4 border-l-2 border-l-[var(--sapphire)] p-4">
        <p className="eyebrow">{t("home.whisperTitle")}</p>
        <p className="mt-1.5 text-sm italic text-[var(--parchment)]">{L(whisper.en, whisper.fr)}</p>
      </section>

      {/* --- Chambers ------------------------------------------------------ */}
      <div className="mt-4 space-y-3">
        {CHAMBERS.map((chamber, index) => {
          const locked = chamber.requiredRankOrder > rankOrder;
          return (
            <motion.article
              key={chamber.key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="panel relative overflow-hidden p-4"
              style={{
                borderColor: locked ? "rgba(201,162,77,0.12)" : `${chamber.hue}66`,
              }}
            >
              {/* Doorway light, dead when the chamber is sealed. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-0 w-28"
                style={{
                  background: locked
                    ? "none"
                    : `radial-gradient(circle at 100% 50%, ${chamber.hue}33, transparent 70%)`,
                }}
              />

              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p
                    className="display text-sm"
                    style={{ color: locked ? "var(--text-dim)" : "var(--parchment)" }}
                  >
                    {L(chamber.nameEn, chamber.nameFr)}
                  </p>
                  <p className="dim mt-1 text-xs italic">
                    {locked
                      ? L(chamber.lockedHintEn, chamber.lockedHintFr)
                      : L(chamber.descEn, chamber.descFr)}
                  </p>
                </div>
                <span className="shrink-0 text-lg" aria-hidden>
                  {locked ? "🔒" : RANKS[chamber.requiredRankOrder]?.emoji}
                </span>
              </div>
            </motion.article>
          );
        })}
      </div>

      {/* --- Lore ---------------------------------------------------------- */}
      <section className="mt-7">
        <div className="flex items-baseline justify-between">
          <h2 className="display text-sm text-[var(--parchment)]">{t("explore.loreTitle")}</h2>
          <span className="tabular text-xs text-[var(--gold)]">
            {t("explore.loreFound", { found, total: LORE.length })}
          </span>
        </div>

        <div className="mt-3 space-y-2">
          {LORE.map((record) => {
            const locked = record.requiredRankOrder > rankOrder;
            const rank = RANKS[record.requiredRankOrder];
            return (
              <button
                key={record.key}
                type="button"
                disabled={locked}
                onClick={() => setOpenLore(record.key)}
                className="panel flex w-full items-center justify-between gap-3 p-3 text-left disabled:opacity-55"
              >
                <span className="min-w-0">
                  <span className="display block truncate text-sm text-[var(--parchment)]">
                    {locked ? "— — —" : L(record.titleEn, record.titleFr)}
                  </span>
                  {locked && (
                    <span className="dim block text-[0.68rem]">
                      {t("explore.loreLocked", { rank: L(rank.nameEn, rank.nameFr) })}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-[var(--gold)]">{locked ? "🔒" : "›"}</span>
              </button>
            );
          })}
        </div>
      </section>

      <p className="eyebrow mt-6 text-center">{t("app.oriaWatching")}</p>

      {/* --- Lore reader --------------------------------------------------- */}
      <AnimatePresence>
        {openLore && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpenLore(null)}
            className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[rgba(3,6,14,0.93)] px-5 py-10"
          >
            {(() => {
              const record = LORE.find((l) => l.key === openLore);
              if (!record) return null;
              return (
                <motion.div
                  initial={{ scale: 0.94, y: 16 }}
                  animate={{ scale: 1, y: 0 }}
                  onClick={(event) => event.stopPropagation()}
                  className="panel panel-gilded w-full max-w-sm p-6"
                >
                  <McnCrest size={26} className="mx-auto text-[var(--gold)] candle" />
                  <h3 className="display mt-3 text-center text-lg text-[var(--parchment)]">
                    {L(record.titleEn, record.titleFr)}
                  </h3>
                  <p className="mt-4 text-sm leading-relaxed text-[var(--text-dim)]">
                    {L(record.bodyEn, record.bodyFr)}
                  </p>
                  <button
                    type="button"
                    onClick={() => setOpenLore(null)}
                    className="btn btn-ghost mt-6 w-full"
                  >
                    {t("common.close")}
                  </button>
                </motion.div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
