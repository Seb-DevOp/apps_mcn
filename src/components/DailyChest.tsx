"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import type { Rarity } from "@/lib/content/items";
import { CHEST_BY_KEY } from "@/lib/content/chests";
import { useI18n } from "./I18nProvider";
import { ChestArt, type ChestVisual } from "./ChestArt";
import { RewardRow, type RewardLike } from "./RewardChip";
import { RankUpOverlay } from "./RankUpOverlay";
import { ChestOdds } from "./ChestOdds";

interface ChestProps {
  chestKey: string;
  visual: ChestVisual;
  tier: number;
  nameEn: string;
  nameFr: string;
  descEn: string;
  descFr: string;
  availableToday: boolean;
  lastRewards: RewardLike[] | null;
  streakDay: number;
  msUntilReset: number;
}

type Phase = "idle" | "opening" | "reveal";

/**
 * The single most important thirty seconds of the day.
 *
 * Tap → the chest wakes, the crystal lights, the lid lifts, light escapes, the
 * drop lands one line at a time. If the drop pushed the player over a rank
 * threshold, the rank-up sequence follows immediately.
 */
export function DailyChest(props: ChestProps) {
  const { t, L } = useI18n();
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("idle");
  const [rewards, setRewards] = useState<RewardLike[] | null>(null);
  const [peakRarity, setPeakRarity] = useState<Rarity>("COMMON");
  const [rankUp, setRankUp] = useState<string | null>(null);
  const [streakNote, setStreakNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOdds, setShowOdds] = useState(false);
  const [countdown, setCountdown] = useState(props.msUntilReset);

  useEffect(() => {
    if (props.availableToday) return;
    const timer = setInterval(() => setCountdown((ms) => Math.max(0, ms - 1000)), 1000);
    return () => clearInterval(timer);
  }, [props.availableToday]);

  async function open() {
    if (phase !== "idle" || !props.availableToday) return;
    setPhase("opening");
    setError(null);

    try {
      const response = await fetch("/api/chest/open", { method: "POST" });
      const data = await response.json();

      if (!data.ok) {
        setError(data.error === "ALREADY_OPENED" ? t("chest.alreadyOpened") : t("common.error"));
        setPhase("idle");
        return;
      }

      setRewards(data.rewards ?? []);
      setPeakRarity((data.peakRarity as Rarity) ?? "COMMON");
      if (data.streak?.shieldUsed) setStreakNote(t("streak.shieldUsed"));
      else if (data.streak?.broken) setStreakNote(t("streak.broken"));

      // Let the lid finish lifting before the rewards arrive.
      setTimeout(() => {
        setPhase("reveal");
        if (data.rankUp?.toKey) setTimeout(() => setRankUp(data.rankUp.toKey), 1400);
      }, 1100);
    } catch {
      setError(t("common.error"));
      setPhase("idle");
    }
  }

  function finish() {
    setPhase("idle");
    setRewards(null);
    setStreakNote(null);
    router.refresh();
  }

  const chestDef = CHEST_BY_KEY[props.chestKey];
  const hours = Math.floor(countdown / 3_600_000);
  const minutes = Math.floor((countdown % 3_600_000) / 60_000);
  const seconds = Math.floor((countdown % 60_000) / 1000);
  const timeLeft = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return (
    <>
      <section className="panel panel-gilded arch relative overflow-hidden p-5">
        <div className="flex items-baseline justify-between">
          <p className="eyebrow">{t("chest.title")}</p>
          <button
            type="button"
            onClick={() => setShowOdds(true)}
            className="text-xs text-[var(--sapphire-pale)] underline underline-offset-4"
          >
            {t("chest.oddsTitle")}
          </button>
        </div>

        <div className="mt-1 flex flex-col items-center">
          <p className="display text-center text-lg text-[var(--parchment)]">
            {L(props.nameEn, props.nameFr)}
          </p>
          <p className="dim mt-1 text-center text-xs italic">{L(props.descEn, props.descFr)}</p>

          <button
            type="button"
            onClick={open}
            disabled={!props.availableToday || phase !== "idle"}
            aria-label={t("home.openChest")}
            className="mt-2 disabled:cursor-default"
          >
            <motion.div
              animate={
                props.availableToday && phase === "idle"
                  ? { y: [0, -6, 0] }
                  : { y: 0, opacity: props.availableToday ? 1 : 0.55 }
              }
              transition={{ duration: 4, repeat: props.availableToday && phase === "idle" ? Infinity : 0 }}
            >
              <ChestArt
                visual={props.visual}
                tier={props.tier}
                state={phase === "idle" ? "closed" : "opening"}
                rarity={peakRarity}
                size={200}
              />
            </motion.div>
          </button>

          {props.availableToday ? (
            <>
              <p className="display text-center text-sm text-[var(--sapphire-pale)]">
                {t("chest.streakDay", { day: props.streakDay })}
              </p>
              <button
                type="button"
                onClick={open}
                disabled={phase !== "idle"}
                className="btn btn-gold shine relative mt-3 w-full overflow-hidden"
              >
                {phase === "idle" ? t("home.openChest") : t("chest.opening")}
              </button>
            </>
          ) : (
            <div className="mt-1 w-full text-center">
              <p className="dim text-sm">{t("home.chestTaken")}</p>
              <p className="tabular display mt-1 text-2xl text-[var(--gold-bright)]">{timeLeft}</p>
              <p className="dim text-xs">{t("home.chestNext")}</p>
            </div>
          )}

          {error && <p className="mt-3 text-center text-sm text-red-300">{error}</p>}
        </div>

        {/* Today's drop stays visible after the fact, so the day feels accounted for. */}
        {!props.availableToday && props.lastRewards && props.lastRewards.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-center text-xs text-[var(--sapphire-pale)]">
              {t("home.seeChest")}
            </summary>
            <div className="mt-3">
              <RewardRow rewards={props.lastRewards} />
            </div>
          </details>
        )}
      </section>

      {/* --- Reveal ------------------------------------------------------- */}
      <AnimatePresence>
        {phase === "reveal" && rewards && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-[rgba(3,6,14,0.92)] px-5 py-10"
          >
            <motion.div
              initial={{ scale: 0.92, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="panel panel-sapphire w-full max-w-sm p-5"
            >
              <p className="eyebrow text-center">{t("chest.received")}</p>
              <div className="mt-4">
                <RewardRow rewards={rewards} />
              </div>

              {streakNote && (
                <p className="mt-4 rounded-lg border border-[rgba(201,162,77,0.3)] bg-[rgba(201,162,77,0.08)] px-3 py-2 text-center text-xs text-[var(--gold-bright)]">
                  {streakNote}
                </p>
              )}

              <p className="dim mt-4 text-center text-[0.7rem]">{t("chest.evolves")}</p>

              <button type="button" onClick={finish} className="btn btn-royal mt-4 w-full">
                {t("chest.continue")}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <RankUpOverlay toRankKey={rankUp} onClose={() => { setRankUp(null); finish(); }} />

      {showOdds && chestDef && (
        <ChestOdds chestKey={props.chestKey} onClose={() => setShowOdds(false)} />
      )}
    </>
  );
}
