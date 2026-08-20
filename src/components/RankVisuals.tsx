"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import type { RankDef } from "@/lib/content/ranks";
import { useI18n } from "./I18nProvider";
import { McnCrest, XpIcon } from "./ui/Icons";

/**
 * Rank artwork.
 *
 * The six delivered images are authoritative and are never recoloured, cropped
 * across ranks or swapped between ranks. Elite Guardian has no artwork yet, so it
 * gets an honest placeholder instead of borrowing another rank's portrait — which
 * would break the "a higher rank always looks stronger" rule.
 */
export function RankPortrait({
  rank,
  locked = false,
  height = 240,
  priority = false,
}: {
  rank: RankDef;
  locked?: boolean;
  height?: number;
  priority?: boolean;
}) {
  const { t, L } = useI18n();

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl"
      style={{ height }}
      aria-label={L(rank.nameEn, rank.nameFr)}
    >
      {/* Chamber light behind the figure, tinted by the rank's accent. */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(70% 60% at 50% 22%, ${rank.accentColor}44, transparent 70%), linear-gradient(180deg, rgba(10,17,40,0.2), rgba(5,8,15,0.95))`,
        }}
      />

      {rank.artPath ? (
        <Image
          src={rank.artPath}
          alt={L(rank.nameEn, rank.nameFr)}
          fill
          priority={priority}
          sizes="(max-width: 520px) 100vw, 520px"
          className="object-cover object-top"
          style={{
            filter: locked ? "grayscale(0.85) brightness(0.42)" : undefined,
            maskImage: "linear-gradient(180deg, #000 62%, transparent 99%)",
            WebkitMaskImage: "linear-gradient(180deg, #000 62%, transparent 99%)",
          }}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <McnCrest size={54} className="text-[var(--gold)] opacity-60" />
          <p className="eyebrow">{t("rank.artPending")}</p>
        </div>
      )}

      {/*
        Scrim. The rank name is printed over the bottom of the portrait, and gold
        type on a bright candlelit hall is unreadable without it.
      */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-32"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, rgba(7,11,26,0.55) 38%, rgba(7,11,26,0.93) 74%, rgba(7,11,26,1) 100%)",
        }}
      />

      {locked && (
        <div className="absolute inset-0 flex items-end justify-center bg-[rgba(5,8,15,0.35)] pb-5">
          <span className="display rounded-full border border-[rgba(201,162,77,0.35)] bg-[rgba(5,8,15,0.75)] px-4 py-1.5 text-xs tracking-[0.2em] text-[var(--gold)]">
            {t("rank.locked")}
          </span>
        </div>
      )}
    </div>
  );
}

export function RankName({ rank, className = "" }: { rank: RankDef; className?: string }) {
  const { L } = useI18n();
  return (
    <span className={`display ${className}`}>
      <span className="mr-1.5">{rank.emoji}</span>
      <span className="gold-text">{L(rank.nameEn, rank.nameFr).toUpperCase()}</span>
    </span>
  );
}

/**
 * The "almost there" bar.
 *
 * Shows the real distance to the next rank — never a padded or cosmetic number.
 * `remaining` comes straight from the XP thresholds the server enforces.
 */
export function XpProgress({
  earned,
  span,
  ratio,
  remaining,
  nextRank,
}: {
  earned: number;
  span: number;
  ratio: number;
  remaining: number;
  nextRank: RankDef | null;
}) {
  const { t, L } = useI18n();

  if (!nextRank) {
    return (
      <div className="mt-3">
        <div className="track">
          <div className="track-fill" style={{ width: "100%" }} />
        </div>
        <p className="dim mt-2 text-center text-xs">{t("rank.maxed")}</p>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-end justify-between">
        <span className="tabular text-xs text-[var(--text-dim)]">
          {t("rank.progress", { earned: earned.toLocaleString(), span: span.toLocaleString() })}
        </span>
        <span className="display text-xs text-[var(--sapphire-pale)]">
          {nextRank.emoji} {L(nextRank.nameEn, nextRank.nameFr)}
        </span>
      </div>

      <div className="track">
        <motion.div
          className="track-fill"
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(2, ratio * 100)}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </div>

      <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-[var(--parchment)]">
        <XpIcon size={15} className="text-[var(--gold)]" />
        <span className="tabular">
          {t("rank.remaining", {
            remaining: remaining.toLocaleString(),
            rank: L(nextRank.nameEn, nextRank.nameFr),
          })}
        </span>
      </p>
    </div>
  );
}
