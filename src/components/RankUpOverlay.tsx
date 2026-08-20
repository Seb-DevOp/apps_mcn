"use client";

import { motion, AnimatePresence } from "framer-motion";
import { RANK_BY_KEY } from "@/lib/content/ranks";
import { CHEST_BY_KEY } from "@/lib/content/chests";
import { useI18n } from "./I18nProvider";
import { RankPortrait } from "./RankVisuals";
import { McnCrest } from "./ui/Icons";

/**
 * The rank-up moment.
 *
 * The screen darkens, the Vault crystal wakes, the new portrait arrives, and the
 * player is told — first — that their Daily Chest has permanently improved. That
 * single line is the strongest reason to keep climbing, so it leads the list.
 *
 * Oria closes the sequence. She is never a rank the player can take; she is the
 * one who acknowledges them.
 */
export function RankUpOverlay({
  toRankKey,
  onClose,
}: {
  toRankKey: string | null;
  onClose: () => void;
}) {
  const { t, L } = useI18n();
  const rank = toRankKey ? RANK_BY_KEY[toRankKey] : null;

  return (
    <AnimatePresence>
      {rank && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[rgba(2,4,10,0.93)] px-5 py-10"
        >
          {/* Vault crystal waking behind the figure. */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.4, ease: "easeOut" }}
            style={{
              background: `radial-gradient(60% 50% at 50% 30%, ${rank.accentColor}55, transparent 70%)`,
            }}
          />

          <motion.div
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.7 }}
            className="relative w-full max-w-sm"
          >
            <motion.p
              initial={{ opacity: 0, letterSpacing: "0.5em" }}
              animate={{ opacity: 1, letterSpacing: "0.28em" }}
              transition={{ delay: 0.15, duration: 1 }}
              className="display text-center text-sm uppercase text-[var(--gold)]"
            >
              {t("rankup.title")}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5, duration: 0.8 }}
              className="panel panel-gilded mt-5 overflow-hidden"
            >
              <RankPortrait rank={rank} height={260} priority />

              <div className="relative -mt-10 px-5 pb-5">
                <p className="display text-center text-2xl">
                  <span className="mr-2">{rank.emoji}</span>
                  <span className="gold-text">{L(rank.nameEn, rank.nameFr).toUpperCase()}</span>
                </p>
                <p className="dim mt-1 text-center text-sm italic">
                  {L(rank.taglineEn, rank.taglineFr)}
                </p>

                <div className="panel-sapphire mt-5 rounded-xl border p-3 text-center">
                  <p className="display text-sm text-[var(--sapphire-pale)]">
                    {t("rankup.chestEvolved")}
                  </p>
                  <p className="dim mt-1 text-xs">
                    {L(
                      CHEST_BY_KEY[rank.chestTypeKey]?.nameEn ?? "",
                      CHEST_BY_KEY[rank.chestTypeKey]?.nameFr ?? "",
                    )}
                  </p>
                </div>

                <p className="eyebrow mt-5">{t("rankup.unlocked")}</p>
                <ul className="mt-2 space-y-1.5">
                  {rank.unlocksEn.map((_, index) => (
                    <motion.li
                      key={index}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.9 + index * 0.12 }}
                      className="flex items-center gap-2 text-sm text-[var(--parchment)]"
                    >
                      <span className="text-[var(--gold)]">✦</span>
                      {L(rank.unlocksEn[index], rank.unlocksFr[index])}
                    </motion.li>
                  ))}
                </ul>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.6, duration: 1 }}
              className="mt-5 flex flex-col items-center gap-3"
            >
              <div className="flex items-center gap-2">
                <McnCrest size={20} className="text-[var(--gold)] candle" />
                <p className="eyebrow">{t("app.oriaWatching")}</p>
              </div>
              <button type="button" onClick={onClose} className="btn btn-gold w-full">
                {t("rankup.continue")}
              </button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
