"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  LEVELS_PER_FLOOR,
  MIN_KILL_SECONDS,
  SLOTS,
  itemName,
  levelInfo,
  type Rarity,
  type Slot,
} from "@/lib/content/idle";
import { RARITY_STYLE } from "@/lib/content/items";
import type { IdleState } from "@/lib/engine/idle";
import { CatCanvas, type WornPiece } from "./CatCanvas";
import { useI18n } from "./I18nProvider";
import { ItemIcon } from "./ui/Icons";

/**
 * THE DESCENT
 *
 * Five chambers, a Guardian, five more. The cat fights on its own; the player
 * decides what it wears and what it becomes.
 *
 * The server owns the clock — reading `/api/idle` *is* the tick. This screen
 * predicts the seconds between two reads so the bar moves at sixty frames rather
 * than in ten-second jumps, then throws its prediction away whenever the truth
 * arrives. Nothing here can grant a reward; it can only be wrong for ten seconds.
 */

/** How often the prediction is replaced by the server's answer. */
const SYNC_INTERVAL_MS = 10_000;

export function IdleGame({ initial }: { initial: IdleState }) {
  const { t, L, locale } = useI18n();

  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [welcome, setWelcome] = useState(
    initial.report.seconds > 60 && initial.report.goldEarned > 0,
  );

  // The predicted half: what the cat has done since the last honest answer.
  const [shownHp, setShownHp] = useState(initial.enemyHp);
  const [shownLevel, setShownLevel] = useState(initial.level.level);
  const [shownGold, setShownGold] = useState(initial.gold);
  const [hit, setHit] = useState(0);

  const stateRef = useRef(state);
  stateRef.current = state;

  const adopt = useCallback((next: IdleState) => {
    setState(next);
    setShownHp(next.enemyHp);
    setShownLevel(next.level.level);
    setShownGold(next.gold);
  }, []);

  const sync = useCallback(async () => {
    try {
      const response = await fetch("/api/idle", { cache: "no-store" });
      const data = await response.json();
      if (data.ok) adopt(data.state as IdleState);
    } catch {
      // A dropped sync is harmless: the next one settles the same elapsed time.
    }
  }, [adopt]);

  async function act(body: Record<string, unknown>, key: string) {
    setBusy(key);
    try {
      const response = await fetch("/api/idle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (data.ok) adopt(data.state as IdleState);
    } catch {
      // Silent: the next sync repairs the display either way.
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    const timer = setInterval(sync, SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [sync]);

  // The prediction loop. It mirrors the server's rules exactly — same curve, same
  // floor on kill speed — so the two only ever disagree about drops.
  useEffect(() => {
    let last = performance.now();
    let onThisEnemy = 0;
    let raf = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      onThisEnemy += dt;

      const { stats } = stateRef.current;
      setShownGold((gold) => gold + stats.passiveGoldPerSecond * dt);
      setShownHp((hp) => {
        const next = hp - stats.power * dt;
        if (next > 0 || onThisEnemy < MIN_KILL_SECONDS) return Math.max(next, 0.0001);

        onThisEnemy = 0;
        setShownLevel((level) => {
          const cleared = levelInfo(level);
          setShownGold((gold) => gold + cleared.goldReward * stats.goldMultiplier);
          setHit((n) => n + 1);
          return level + 1;
        });
        return 0;
      });

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // A level the prediction advanced into needs its own fresh health bar.
  const shown = levelInfo(shownLevel);
  useEffect(() => {
    setShownHp((hp) => (hp <= 0 ? levelInfo(shownLevel).enemyHp : hp));
  }, [shownLevel]);

  const worn = useMemo<WornPiece[]>(
    () =>
      state.items
        .filter((item) => item.equipped)
        .map((item) => ({ slot: item.slot, shape: item.shape, rarity: item.rarity })),
    [state.items],
  );

  const wornBySlot = useMemo(
    () => new Map(state.items.filter((i) => i.equipped).map((i) => [i.slot, i])),
    [state.items],
  );
  const spares = useMemo(
    () =>
      state.items
        .filter((item) => !item.equipped)
        .sort((a, b) => b.power - a.power),
    [state.items],
  );

  const stalled = state.secondsToKill > 90;

  return (
    <div className="pb-4">
      {/* --- Floor and chamber ------------------------------------------- */}
      <header className="pt-5 text-center">
        <p className="eyebrow">{t("idle.floor", { n: shown.floor })}</p>
        <h1 className="display mt-1 text-2xl">
          {shown.isBoss ? t("idle.guardian") : t("idle.chamber", { n: shown.position })}
        </h1>
        <FloorPips position={shown.position} />
      </header>

      {/* --- The arena ---------------------------------------------------- */}
      <section className="panel panel-sapphire relative mt-4 overflow-hidden px-3 pb-4 pt-3">
        <div className="flex items-end justify-between gap-2">
          {/* A half-step forward on every kill: enough to feel the blow landing
              without an animation that has to be kept in sync with anything. */}
          <motion.div
            animate={{ x: hit % 2 === 0 ? 0 : 9 }}
            transition={{ type: "spring", stiffness: 520, damping: 17 }}
          >
            <CatCanvas worn={worn} size={168} />
          </motion.div>
          <div className="flex-1 pb-6">
            <Enemy level={shown.level} isBoss={shown.isBoss} hit={hit} />
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-baseline justify-between text-[0.7rem]">
            <span className="dim uppercase tracking-widest">
              {shown.isBoss ? t("idle.guardianHp") : t("idle.enemyHp")}
            </span>
            <span className="tabular text-[var(--parchment)]">
              {formatNumber(Math.max(0, shownHp))} / {formatNumber(shown.enemyHp)}
            </span>
          </div>
          <div className="track mt-1">
            <div
              className="track-fill"
              style={{
                width: `${Math.max(0, Math.min(100, (shownHp / shown.enemyHp) * 100))}%`,
                background: shown.isBoss
                  ? "linear-gradient(90deg,#8f2f2f,#e0603f)"
                  : undefined,
              }}
            />
          </div>
        </div>

        <AnimatePresence>
          {stalled && (
            <motion.p
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-3 text-center text-[0.7rem] italic text-[var(--candle)]"
            >
              {t("idle.stalled")}
            </motion.p>
          )}
        </AnimatePresence>
      </section>

      {/* --- The numbers -------------------------------------------------- */}
      <section className="mt-3 grid grid-cols-3 gap-2">
        <Stat label={t("idle.gold")} value={formatNumber(shownGold)} tone="gold" />
        <Stat label={t("idle.power")} value={formatNumber(state.stats.power)} />
        <Stat
          label={t("idle.deepest")}
          value={String(levelInfo(state.highestLevel).floor)}
        />
      </section>

      {/* --- Upgrades ----------------------------------------------------- */}
      <h2 className="eyebrow mt-6">{t("idle.upgrades")}</h2>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {state.upgrades.map((upgrade) => {
          const affordable = shownGold >= upgrade.cost;
          return (
            <button
              key={upgrade.key}
              type="button"
              disabled={!affordable || busy !== null}
              onClick={() => act({ action: "upgrade", key: upgrade.key }, upgrade.key)}
              className="panel p-3 text-left transition disabled:opacity-45"
              style={affordable ? { borderColor: "rgba(201,162,77,0.45)" } : undefined}
            >
              <div className="flex items-center gap-2">
                <span className="text-[var(--gold)]">
                  <ItemIcon icon={upgrade.icon} size={18} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[0.78rem] text-[var(--parchment)]">
                  {L(upgrade.nameEn, upgrade.nameFr)}
                </span>
                <span className="tabular dim text-[0.7rem]">{upgrade.level}</span>
              </div>
              <p className="dim mt-1 text-[0.65rem] leading-snug">
                {L(upgrade.descEn, upgrade.descFr)}
              </p>
              <p className="gold-text tabular mt-2 text-[0.72rem]">
                {formatNumber(upgrade.cost)}
              </p>
            </button>
          );
        })}
      </div>

      {/* --- What it is wearing ------------------------------------------- */}
      <h2 className="eyebrow mt-6">{t("idle.equipped")}</h2>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {SLOTS.map((slot) => {
          const item = wornBySlot.get(slot);
          const style = item ? RARITY_STYLE[item.rarity] : null;
          return (
            <div
              key={slot}
              className="panel p-2 text-center"
              style={style ? { borderColor: `${style.color}55` } : { opacity: 0.5 }}
            >
              <p className="dim text-[0.6rem] uppercase tracking-widest">
                {t(`idle.slot.${slot}`)}
              </p>
              {item ? (
                <>
                  <p
                    className="mt-1 line-clamp-2 text-[0.66rem] leading-tight"
                    style={{ color: style!.color }}
                  >
                    {itemName(item.slot, item.floor, item.rarity, locale)}
                  </p>
                  <p className="tabular mt-0.5 text-[0.66rem] text-[var(--parchment)]">
                    +{formatNumber(item.power)}
                  </p>
                </>
              ) : (
                <p className="dim mt-1 text-[0.68rem]">{t("idle.empty")}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* --- The bag ------------------------------------------------------ */}
      <div className="mt-6 flex items-center justify-between">
        <h2 className="eyebrow">{t("idle.spares", { n: spares.length })}</h2>
        {spares.length > 0 && (
          <button
            type="button"
            className="btn btn-ghost px-3 py-1 text-[0.7rem]"
            disabled={busy !== null}
            onClick={() => act({ action: "sellAll" }, "sellAll")}
          >
            {t("idle.sellAll")}
          </button>
        )}
      </div>

      {spares.length === 0 ? (
        <p className="dim mt-2 text-center text-[0.72rem] italic">{t("idle.bagEmpty")}</p>
      ) : (
        <div className="mt-2 space-y-2">
          {(drawer ? spares : spares.slice(0, 5)).map((item) => {
            const style = RARITY_STYLE[item.rarity];
            const current = wornBySlot.get(item.slot);
            const better = !current || item.power > current.power;
            return (
              <div
                key={item.id}
                className="panel flex items-center gap-2 p-2"
                style={{ borderColor: `${style.color}44` }}
              >
                <span style={{ color: style.color }}>
                  <ItemIcon icon="badge" size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.72rem]" style={{ color: style.color }}>
                    {itemName(item.slot, item.floor, item.rarity, locale)}
                  </p>
                  <p className="dim tabular text-[0.65rem]">
                    +{formatNumber(item.power)}
                    {better ? ` · ${t("idle.better")}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-royal px-2 py-1 text-[0.68rem]"
                  disabled={busy !== null}
                  onClick={() => act({ action: "equip", itemId: item.id }, item.id)}
                >
                  {t("idle.equip")}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost px-2 py-1 text-[0.68rem]"
                  disabled={busy !== null}
                  onClick={() => act({ action: "sell", itemId: item.id }, item.id)}
                >
                  {t("idle.sell")}
                </button>
              </div>
            );
          })}
          {spares.length > 5 && (
            <button
              type="button"
              className="btn btn-ghost w-full py-1.5 text-[0.7rem]"
              onClick={() => setDrawer((open) => !open)}
            >
              {drawer ? t("idle.showLess") : t("idle.showAll", { n: spares.length })}
            </button>
          )}
        </div>
      )}

      {/* --- What happened while away ------------------------------------- */}
      <AnimatePresence>
        {welcome && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="panel panel-gilded w-full max-w-sm p-5 text-center"
              initial={{ scale: 0.92, y: 12 }}
              animate={{ scale: 1, y: 0 }}
            >
              <p className="eyebrow">{t("idle.welcomeBack")}</p>
              <h2 className="display mt-2 text-xl">
                {t("idle.away", { time: formatDuration(initial.report.seconds, t) })}
              </h2>
              <p className="gold-text tabular mt-4 text-3xl">
                +{formatNumber(initial.report.goldEarned)}
              </p>
              <p className="dim mt-1 text-[0.72rem]">{t("idle.gold")}</p>
              <p className="dim mt-4 text-[0.75rem]">
                {t("idle.awaySummary", {
                  kills: initial.report.kills,
                  drops: initial.report.drops.length,
                })}
              </p>
              {initial.report.discardedSeconds > 0 && (
                <p className="mt-3 text-[0.68rem] italic text-[var(--candle)]">
                  {t("idle.cap", { hours: Math.round(initial.offlineCapSeconds / 3600) })}
                </p>
              )}
              <button
                type="button"
                className="btn btn-gold mt-5 w-full py-2"
                onClick={() => setWelcome(false)}
              >
                {t("idle.resume")}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------

function FloorPips({ position }: { position: number }) {
  return (
    <div className="mt-3 flex items-center justify-center gap-1.5">
      {Array.from({ length: LEVELS_PER_FLOOR }, (_, index) => {
        const step = index + 1;
        const boss = step === LEVELS_PER_FLOOR;
        const done = step < position;
        const here = step === position;
        return (
          <span
            key={step}
            className="rounded-full transition"
            style={{
              width: boss ? 12 : 8,
              height: boss ? 12 : 8,
              background: here
                ? boss
                  ? "#e0603f"
                  : "var(--gold-bright)"
                : done
                  ? "var(--gold)"
                  : "rgba(255,255,255,0.14)",
              boxShadow: here ? "0 0 10px currentColor" : undefined,
              color: boss ? "#e0603f" : "var(--gold-bright)",
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * The thing in front of the cat. Shadow given a shape — deliberately less
 * detailed than the cat, so the eye stays where the progress is.
 */
function Enemy({ level, isBoss, hit }: { level: number; isBoss: boolean; hit: number }) {
  const tint = isBoss ? "#e0603f" : "#5a4f7a";
  return (
    <motion.svg
      key={isBoss ? "boss" : "mob"}
      viewBox="0 0 120 140"
      width="100%"
      style={{ maxWidth: isBoss ? 130 : 104, marginLeft: "auto", display: "block" }}
      animate={{ x: [0, -4, 0], opacity: [0.92, 1, 0.92] }}
      transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      aria-hidden
    >
      <motion.g
        key={hit}
        initial={{ x: 6, opacity: 0.6 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.18 }}
      >
        <ellipse cx="60" cy="132" rx="34" ry="7" fill="#000" opacity="0.4" />
        <path
          d="M60 26 C88 26 100 52 96 84 C93 112 78 128 60 128 C42 128 27 112 24 84 C20 52 32 26 60 26 Z"
          fill={tint}
          opacity="0.85"
        />
        {isBoss && (
          <>
            {/* Thick and curling, because a thin triangle above a head is an ear. */}
            <path d="M38 38 C22 32 14 20 18 6" stroke={tint} strokeWidth="11" strokeLinecap="round" fill="none" />
            <path d="M82 38 C98 32 106 20 102 6" stroke={tint} strokeWidth="11" strokeLinecap="round" fill="none" />
            <path d="M18 10 L14 0 L26 6 Z" fill={tint} />
            <path d="M102 10 L106 0 L94 6 Z" fill={tint} />
          </>
        )}
        {/* Brows angled inward and a mouth of teeth: the difference between a
            threat and a smiley face is about four line segments. */}
        <path d="M38 56 l16 6 M82 56 l-16 6" stroke="#0a0710" strokeWidth="3.5" strokeLinecap="round" />
        <ellipse cx="46" cy="68" rx="7" ry="8.5" fill={isBoss ? "#ffd76a" : "#ff8e5e"} />
        <ellipse cx="74" cy="68" rx="7" ry="8.5" fill={isBoss ? "#ffd76a" : "#ff8e5e"} />
        <path
          d="M42 98 l7 -7 l7 7 l7 -7 l7 7 l7 -7"
          stroke="#0a0710"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </motion.g>
    </motion.svg>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "gold";
}) {
  return (
    <div className="panel px-2 py-2 text-center">
      <p className="dim text-[0.6rem] uppercase tracking-widest">{label}</p>
      <p
        className={`tabular mt-1 text-[0.95rem] ${tone === "gold" ? "gold-text" : "text-[var(--parchment)]"}`}
      >
        {value}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Idle numbers outgrow every reader long before they outgrow the game, so past a
 * few thousand only the leading digits carry meaning.
 */
const SUFFIXES = ["", "k", "M", "B", "T", "Qa", "Qi"];

export function formatNumber(value: number): string {
  const n = Math.floor(value);
  if (n < 1000) return String(n);
  let tier = 0;
  let scaled = n;
  while (scaled >= 1000 && tier < SUFFIXES.length - 1) {
    scaled /= 1000;
    tier += 1;
  }
  return `${scaled.toFixed(scaled < 10 ? 2 : scaled < 100 ? 1 : 0)}${SUFFIXES[tier]}`;
}

function formatDuration(seconds: number, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return t("idle.durationHm", { h: hours, m: minutes });
  if (minutes > 0) return t("idle.durationM", { m: minutes });
  return t("idle.durationS", { s: Math.floor(seconds) });
}
