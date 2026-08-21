"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { PlayerState } from "@/lib/engine/state";
import { RANK_BY_KEY } from "@/lib/content/ranks";
import { RARITY_STYLE } from "@/lib/content/items";
import type { EquipStats } from "@/lib/content/equipment";
import { useI18n } from "./I18nProvider";
import { RankPortrait, XpProgress } from "./RankVisuals";
import { DailyChest } from "./DailyChest";
import { InstallPrompt } from "./InstallPrompt";
import { StreakStrip } from "./StreakStrip";
import {
  McnCrest,
  ShardIcon,
  XpIcon,
  TrophyIcon,
  PlayIcon,
  ExploreIcon,
  ItemIcon,
} from "./ui/Icons";

const ACTIVE_STATS: (keyof EquipStats)[] = [
  "xpBonus",
  "shardBonus",
  "scoreBonus",
  "precisionMs",
  "comboGuard",
  "chestFortune",
];

function formatBonus(key: keyof EquipStats, value: number): string {
  if (key === "precisionMs") return `+${Math.round(value)}ms`;
  if (key === "comboGuard" || key === "chestFortune") return `+${Math.round(value)}`;
  return `+${Math.round(value * 100)}%`;
}

/**
 * The hub.
 *
 * Ordered by what a returning player needs in the first three seconds: who they
 * are, how close the next rank is, and the chest waiting for them. Everything
 * else — missions, the run, the Vault — sits below in the order of the daily loop.
 *
 * Three things are always on screen: what you have, what you can unlock next, and
 * something you cannot reach yet.
 */
export function VaultHome({ state }: { state: PlayerState }) {
  const { t, L } = useI18n();
  const rank = RANK_BY_KEY[state.player.rankKey] ?? state.rank.current;

  return (
    <main className="pt-5">
      {/* --- Identity strip ------------------------------------------------ */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <McnCrest size={26} className="text-[var(--gold)] candle" />
          <div className="leading-tight">
            <p className="eyebrow">{t("app.subtitle")}</p>
            <p className="display text-sm text-[var(--parchment)]">{state.player.handle}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-sm">
            <XpIcon size={15} className="text-[var(--gold)]" />
            <span className="tabular">{state.player.xp.toLocaleString()}</span>
          </span>
          <span className="flex items-center gap-1 text-sm">
            <ShardIcon size={15} className="text-[var(--sapphire)]" />
            <span className="tabular">{state.player.shards.toLocaleString()}</span>
          </span>
        </div>
      </header>

      {/* --- Rank hero ------------------------------------------------------ */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="panel panel-gilded mt-4 overflow-hidden"
      >
        <Link href="/ranks" className="block">
          <RankPortrait rank={rank} height={230} priority />
        </Link>

        <div className="relative -mt-12 px-5 pb-5">
          <p className="eyebrow text-center">{t("rank.current")}</p>
          <p className="display mt-0.5 text-center text-2xl">
            <span className="mr-2">{rank.emoji}</span>
            <span className="gold-text">{L(rank.nameEn, rank.nameFr).toUpperCase()}</span>
          </p>
          <p className="dim mt-1 text-center text-xs italic">
            {L(rank.taglineEn, rank.taglineFr)}
          </p>

          <XpProgress
            earned={state.rank.earned}
            span={state.rank.span}
            ratio={state.rank.ratio}
            remaining={state.rank.remaining}
            nextRank={state.rank.next}
          />
        </div>
      </motion.section>

      {/* --- Vault Friday --------------------------------------------------- */}
      {state.vault.isVaultFriday && (
        <motion.section
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="panel panel-sapphire mt-4 flex items-center gap-3 p-4"
        >
          <span className="text-2xl">🔵</span>
          <div>
            <p className="display text-sm text-[var(--sapphire-pale)]">{t("home.vaultFriday")}</p>
            <p className="dim text-xs">{t("home.vaultFridaySub")}</p>
          </div>
        </motion.section>
      )}

      {/* --- The chest ------------------------------------------------------ */}
      <div className="mt-4">
        <DailyChest
          chestKey={state.chest.key}
          visual={state.chest.visual}
          tier={RANK_BY_KEY[state.player.rankKey]?.order ?? 0}
          nameEn={state.chest.nameEn}
          nameFr={state.chest.nameFr}
          descEn={state.chest.descEn}
          descFr={state.chest.descFr}
          availableToday={state.chest.availableToday}
          lastRewards={state.chest.lastRewards}
          streakDay={state.chest.streakDay}
          msUntilReset={state.chest.msUntilReset}
        />
      </div>

      {/* --- Streak --------------------------------------------------------- */}
      <div className="mt-4">
        <StreakStrip
          currentStreak={state.player.currentStreak}
          bestStreak={state.player.bestStreak}
          shields={state.player.streakShields}
          cycle={state.chest.cycle}
          todayDay={state.chest.streakDay}
        />
      </div>

      {/* --- Play ----------------------------------------------------------- */}
      <Link href="/play" className="mt-4 block">
        <section className="panel panel-sapphire flex items-center gap-4 p-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[rgba(79,147,255,0.4)] bg-[rgba(79,147,255,0.12)] text-[var(--sapphire-pale)]">
            <PlayIcon size={24} className="crystal-pulse" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="display block text-sm text-[var(--parchment)]">
              {t("home.playCta")}
            </span>
            <span className="dim block text-xs">{t("home.playSub")}</span>
          </span>
          <span className="text-[var(--gold)]">›</span>
        </section>
      </Link>

      {/* --- Loadout: what you are carrying, and what it is doing for you ---- */}
      <Link href="/armory" className="mt-3 block">
        <section className="panel flex items-center gap-3 p-4">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border"
            style={{
              borderColor: state.loadout.weapon
                ? `${RARITY_STYLE[state.loadout.weapon.rarity].color}66`
                : "rgba(201,162,77,0.2)",
              color: state.loadout.weapon
                ? RARITY_STYLE[state.loadout.weapon.rarity].color
                : "var(--text-dim)",
              background: "rgba(5,8,15,0.5)",
            }}
          >
            <ItemIcon icon={state.loadout.weapon?.icon ?? "sword"} size={22} />
          </span>

          <span className="min-w-0 flex-1">
            <span className="eyebrow block">{t("home.loadoutCta")}</span>
            <span className="display block truncate text-sm text-[var(--parchment)]">
              {state.loadout.weapon
                ? L(state.loadout.weapon.nameEn, state.loadout.weapon.nameFr)
                : t("armory.emptySlot")}
            </span>
            <span className="dim block text-[0.68rem]">
              {ACTIVE_STATS.filter((key) => (state.loadout.stats[key] ?? 0) !== 0)
                .map((key) => `${t(`stat.${key}`)} ${formatBonus(key, state.loadout.stats[key])}`)
                .join(" · ") || t("armory.noBonuses")}
            </span>
          </span>
          <span className="text-[var(--gold)]">›</span>
        </section>
      </Link>

      {/* --- Missions ------------------------------------------------------- */}
      <Link href="/missions" className="mt-3 block">
        <section className="panel p-4">
          <div className="flex items-center justify-between">
            <span className="display text-sm text-[var(--parchment)]">{t("home.missionsCta")}</span>
            <span className="tabular text-xs text-[var(--gold-bright)]">
              {t("home.missionsProgress", {
                done: state.missions.dailyDone,
                total: state.missions.dailyTotal,
              })}
            </span>
          </div>
          <div className="track mt-3">
            <div
              className="track-fill"
              style={{
                width: `${state.missions.dailyTotal ? (state.missions.dailyDone / state.missions.dailyTotal) * 100 : 0}%`,
              }}
            />
          </div>
        </section>
      </Link>

      {/* --- Whisper: the curiosity hook ------------------------------------ */}
      <section className="panel mt-3 border-l-2 border-l-[var(--sapphire)] p-4">
        <p className="eyebrow">{t("home.whisperTitle")}</p>
        <p className="mt-1.5 text-sm italic text-[var(--parchment)]">
          {L(state.vault.whisper.en, state.vault.whisper.fr)}
        </p>
      </section>

      {/* --- Explore + leaderboard ------------------------------------------ */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Link href="/explore" className="panel flex flex-col items-center gap-2 p-4 text-center">
          <ExploreIcon size={22} className="text-[var(--gold)]" />
          <span className="display text-xs text-[var(--parchment)]">{t("home.exploreCta")}</span>
          <span className="tabular text-[0.68rem] text-[var(--text-dim)]">
            {state.vault.chambersSeen}/{state.vault.chambersTotal}
          </span>
        </Link>
        <Link href="/leaderboard" className="panel flex flex-col items-center gap-2 p-4 text-center">
          <TrophyIcon size={22} className="text-[var(--gold)]" />
          <span className="display text-xs text-[var(--parchment)]">{t("nav.leaderboard")}</span>
          <span className="tabular text-[0.68rem] text-[var(--text-dim)]">
            {state.stats.bestScore.toLocaleString()}
          </span>
        </Link>
      </div>

      <InstallPrompt />

      <p className="eyebrow mt-6 text-center">{t("app.oriaWatching")}</p>
    </main>
  );
}
