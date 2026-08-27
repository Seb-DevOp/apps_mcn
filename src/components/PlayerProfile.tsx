"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { RARITY_STYLE, SKIN_BY_KEY } from "@/lib/content/idle";
import type { PublicProfile } from "@/lib/engine/profile";
import { CatCanvas } from "./CatCanvas";
import { ProfileBackdrop } from "./ProfileBackdrop";
import { useI18n } from "./I18nProvider";
import { formatNumber } from "./format";

/**
 * SOMEONE ELSE'S CAT
 *
 * A leaderboard names people and says one number about them, which ranks a
 * stranger without making anyone curious about one. Here the name opens onto
 * the cat: the coat they chose, the six pieces they are actually wearing, and
 * the numbers that say what kind of player produced that rank.
 *
 * The cat is the portrait. A Farcaster picture, when there is one, sits beside
 * it as a small round avatar — the person, next to the thing they built.
 */
export function PlayerProfile({ profile }: { profile: PublicProfile }) {
  const { t, L, locale } = useI18n();
  const [first, ...escort] = profile.cats;

  return (
    <main className="pb-4">
      <header className="pt-5 text-center">
        <p className="eyebrow">{t("player.title")}</p>
        <div className="mt-2 flex items-center justify-center gap-2.5">
          {profile.farcaster?.avatar && (
            // eslint-disable-next-line @next/next/no-img-element -- one remote
            // avatar, sized and rounded; the optimiser has nothing to add.
            <img
              src={profile.farcaster.avatar}
              alt=""
              width={34}
              height={34}
              className="rounded-full"
              style={{ objectFit: "cover", border: "1px solid rgba(201,162,77,0.5)" }}
            />
          )}
          <h1 className="display gold-text text-2xl">{profile.handle}</h1>
        </div>

        {profile.farcaster?.username && (
          <a
            href={`https://farcaster.xyz/${profile.farcaster.username}`}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-1 inline-block text-[0.72rem]"
            style={{ color: "var(--sapphire-pale)" }}
          >
            @{profile.farcaster.username} ↗
          </a>
        )}

        <p className="dim mt-1 text-[0.64rem]">
          {t("player.since", {
            date: new Date(profile.joinedAt).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB", {
              year: "numeric",
              month: "long",
            }),
          })}
        </p>
      </header>

      {/* --- The cat itself ---------------------------------------------- */}
      {first ? (
        <>
          <div className="panel panel-sapphire relative mt-4 flex justify-center overflow-hidden py-3">
            <ProfileBackdrop backdrop={profile.backdrop} />
            <span className="relative">
              <CatCanvas worn={first.worn} size={190} skin={first.skin} />
            </span>
          </div>
          <p className="dim mt-1 text-center text-[0.64rem]">
            {L(SKIN_BY_KEY[first.skin]?.nameEn ?? first.skin, SKIN_BY_KEY[first.skin]?.nameFr ?? first.skin)}
          </p>
        </>
      ) : (
        <p className="dim mt-6 text-center text-[0.74rem] italic">{t("player.bare")}</p>
      )}

      {/* The Pack and the Pride, smaller, the way the arena shows them. */}
      {escort.length > 0 && (
        <div className="mt-2 flex justify-center gap-3">
          {escort.map((cat, index) => (
            <div key={index} className="panel flex flex-col items-center px-3 py-2">
              <CatCanvas worn={cat.worn} size={84} breathing={false} skin={cat.skin} />
              <p className="dim mt-1 text-[0.58rem] uppercase tracking-widest">
                {t(index === 0 ? "pack.second" : "pack.third")}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* --- What that rank is made of ------------------------------------ */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label={t("leaderboard.depth")} value={formatNumber(profile.stats.floor)} tone="gold" />
        <Stat label={t("idle.score")} value={formatNumber(profile.stats.score)} />
        <Stat label={t("leaderboard.lives")} value={formatNumber(profile.stats.lives)} />
        <Stat label={t("leaderboard.distance")} value={formatNumber(profile.stats.distance)} />
        <Stat label={t("leaderboard.guardians")} value={formatNumber(profile.stats.guardians)} />
        <Stat label={t("leaderboard.chests")} value={formatNumber(profile.stats.chests)} />
      </div>

      <p className="dim mt-3 text-center text-[0.68rem]">
        {t("leaderboard.fortune")} · {formatNumber(profile.stats.totalGold)}
      </p>

      {/* --- What each worn piece is -------------------------------------- */}
      {first && first.worn.length > 0 && (
        <>
          <h2 className="eyebrow mt-6">{t("idle.equipped")}</h2>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {first.worn.map((piece) => (
              <div key={piece.slot} className="panel flex items-center gap-2 px-2 py-1.5">
                <span className="dim text-[0.56rem] uppercase tracking-widest">
                  {t(`idle.slot.${piece.slot}`)}
                </span>
                <span className="tabular ml-auto text-[0.62rem]" style={{ color: "var(--text-dim)" }}>
                  {t("item.level", { n: piece.floor })}
                </span>
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{
                    background: RARITY_STYLE[piece.rarity].color,
                    boxShadow: `0 0 6px ${RARITY_STYLE[piece.rarity].glow}`,
                  }}
                />
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-6 text-center">
        <Link href="/leaderboard" className="btn btn-ghost px-4 py-2 text-[0.74rem]">
          {t("player.back")}
        </Link>
      </div>
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "gold" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="panel px-2 py-2 text-center"
    >
      <p className="dim text-[0.55rem] uppercase tracking-widest">{label}</p>
      <p
        className="tabular mt-0.5 text-[0.82rem]"
        style={{ color: tone === "gold" ? "var(--gold-bright)" : "var(--parchment)" }}
      >
        {value}
      </p>
    </motion.div>
  );
}
