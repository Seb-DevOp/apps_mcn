"use client";

import { motion } from "framer-motion";
import { RANKS } from "@/lib/content/ranks";
import { CHEST_BY_KEY } from "@/lib/content/chests";
import { useI18n } from "./I18nProvider";
import { RankPortrait } from "./RankVisuals";
import { ChestArt } from "./ChestArt";

/**
 * The six ranks, in order.
 *
 * Seeing the whole ladder is part of the pull: the player can look at Vault Keeper
 * and Legend long before they can reach them, and can see exactly which chest each
 * one carries.
 */
export function RanksGallery({ xp, currentOrder }: { xp: number; currentOrder: number }) {
  const { t, L } = useI18n();

  return (
    <main className="pt-5">
      <header className="text-center">
        <p className="eyebrow">{t("app.subtitle")}</p>
        <h1 className="display gold-text mt-0.5 text-2xl">{t("rank.allTitle")}</h1>
        <p className="dim mt-1 text-xs">{t("rank.allSubtitle")}</p>
      </header>

      <div className="mt-5 space-y-5">
        {RANKS.map((rank, index) => {
          const locked = rank.order > currentOrder;
          const chest = CHEST_BY_KEY[rank.chestTypeKey];

          return (
            <motion.section
              key={rank.key}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06 }}
              className={`panel overflow-hidden ${rank.order === currentOrder ? "panel-gilded" : ""}`}
            >
              <RankPortrait rank={rank} locked={locked} height={210} />

              <div className="relative -mt-9 px-4 pb-4">
                <p className="display text-center text-lg">
                  <span className="mr-2">{rank.emoji}</span>
                  <span className={locked ? "text-[var(--text-dim)]" : "gold-text"}>
                    {L(rank.nameEn, rank.nameFr).toUpperCase()}
                  </span>
                </p>
                <p className="dim mt-1 text-center text-[0.72rem] italic">
                  {L(rank.taglineEn, rank.taglineFr)}
                </p>

                <p className="tabular mt-2 text-center text-xs text-[var(--sapphire-pale)]">
                  {rank.minXp === 0
                    ? `0 XP`
                    : t("rank.unlockedAt", { xp: rank.minXp.toLocaleString() })}
                  {locked && (
                    <span className="dim">
                      {" · "}
                      {Math.max(0, rank.minXp - xp).toLocaleString()} XP
                    </span>
                  )}
                </p>

                <div className="mt-4 flex items-center gap-3 rounded-xl border border-[rgba(201,162,77,0.18)] bg-[rgba(5,8,15,0.4)] p-3">
                  <div className="shrink-0 opacity-90" style={{ filter: locked ? "grayscale(0.7)" : undefined }}>
                    <ChestArt visual={chest.visual} tier={rank.order} size={84} />
                  </div>
                  <div className="min-w-0">
                    <p className="eyebrow">{t("rank.chestFor")}</p>
                    <p className="display truncate text-sm text-[var(--parchment)]">
                      {L(chest.nameEn, chest.nameFr)}
                    </p>
                    <p className="dim text-[0.68rem]">{L(chest.descEn, chest.descFr)}</p>
                  </div>
                </div>

                <p className="eyebrow mt-4">{t("rank.unlocks")}</p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {rank.unlocksEn.map((_, i) => (
                    <li
                      key={i}
                      className="rounded-md border border-[rgba(79,147,255,0.25)] bg-[rgba(79,147,255,0.08)] px-2 py-1 text-[0.68rem] text-[var(--sapphire-pale)]"
                    >
                      {L(rank.unlocksEn[i], rank.unlocksFr[i])}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.section>
          );
        })}
      </div>

      <p className="dim mt-6 text-center text-xs italic">
        {L(
          "Oria stands above the ranks. She is not a rank you can take.",
          "Oria se tient au-dessus des rangs. Elle n'est pas un rang que l'on peut prendre.",
        )}
      </p>
    </main>
  );
}
