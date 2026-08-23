"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ATTACK_INTERVAL,
  ENEMY_ATTACK_INTERVAL,
  LEVELS_PER_FLOOR,
  RECOVERY_SECONDS,
  SLOTS,
  floorStart,
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
 * decides what it wears and what it becomes — and whether it survives, because
 * enemies hit back and a beaten cat is carried to the start of its floor.
 *
 * The server owns the clock: reading `/api/idle` *is* the tick. This screen
 * replays the seconds between two reads under exactly the same rules, so blows
 * land in front of the player instead of arriving as a ten-second jump, then
 * throws its replay away whenever the truth turns up. Nothing here can grant a
 * reward; it can only be wrong for ten seconds.
 *
 * Blows are discrete on screen and continuous in the maths. Average damage is
 * identical either way, and a number that lands is a number a player can read.
 */

/** How often the replay is replaced by the server's answer. */
const SYNC_INTERVAL_MS = 10_000;
/** The replay runs on a timer rather than a frame loop: bars step, they do not slide. */
const STEP_MS = 60;

interface Hit {
  id: number;
  /** Who took it — the enemy, the cat, or the purse. */
  target: "ENEMY" | "CAT" | "GOLD";
  value: number;
  drift: number;
}

/** The predicted world. Kept in a ref: it changes far faster than it renders. */
interface World {
  level: number;
  enemyHp: number;
  hp: number;
  recovering: number;
  gold: number;
  catTimer: number;
  enemyTimer: number;
}

export function IdleGame({ initial }: { initial: IdleState }) {
  const { t, L, locale } = useI18n();

  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [welcome, setWelcome] = useState(
    initial.report.seconds > 60 && initial.report.goldEarned > 0,
  );

  // What the screen shows, mirrored from the world at every step.
  const [shown, setShown] = useState({
    level: initial.level.level,
    enemyHp: initial.enemyHp,
    hp: initial.hp,
    gold: initial.gold,
    recovering: initial.recoverFor,
  });

  const [hits, setHits] = useState<Hit[]>([]);
  const [catSwings, setCatSwings] = useState(0);
  const [catWounds, setCatWounds] = useState(0);
  const [enemyDeaths, setEnemyDeaths] = useState(0);
  const [defeats, setDefeats] = useState(0);

  const stateRef = useRef(state);
  stateRef.current = state;

  const world = useRef<World>({
    level: initial.level.level,
    enemyHp: initial.enemyHp,
    hp: initial.hp,
    recovering: initial.recoverFor,
    gold: initial.gold,
    catTimer: 0,
    enemyTimer: 0,
  });

  const nextHitId = useRef(0);
  const addHit = useCallback((target: Hit["target"], value: number) => {
    const id = nextHitId.current++;
    setHits((current) => [
      ...current.slice(-11),
      { id, target, value, drift: Math.random() * 26 - 13 },
    ]);
    window.setTimeout(() => {
      setHits((current) => current.filter((hit) => hit.id !== id));
    }, 900);
  }, []);

  const adopt = useCallback((next: IdleState) => {
    setState(next);
    world.current = {
      level: next.level.level,
      enemyHp: next.enemyHp,
      hp: next.hp,
      recovering: next.recoverFor,
      gold: next.gold,
      catTimer: world.current.catTimer,
      enemyTimer: world.current.enemyTimer,
    };
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
    const timer = window.setInterval(sync, SYNC_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [sync]);

  // --- The replay -----------------------------------------------------------
  useEffect(() => {
    let last = performance.now();

    const timer = window.setInterval(() => {
      const now = performance.now();
      // Real elapsed time, capped: a backgrounded tab must not fire off a
      // hundred blows the moment it returns. The server sync owns the truth.
      const dt = Math.min(0.5, (now - last) / 1000);
      last = now;

      const w = world.current;
      const stats = stateRef.current.stats;
      w.gold += stats.passiveGoldPerSecond * dt;

      if (w.recovering > 0) {
        w.recovering = Math.max(0, w.recovering - dt);
        w.hp = Math.min(stats.maxHp, w.hp + stats.regen * dt);
      } else {
        const info = levelInfo(w.level);
        if (w.enemyHp <= 0) w.enemyHp = info.enemyHp;

        let killed = false;

        w.catTimer += dt;
        if (w.catTimer >= ATTACK_INTERVAL) {
          w.catTimer -= ATTACK_INTERVAL;
          const blow = stats.power * ATTACK_INTERVAL;
          w.enemyHp -= blow;
          addHit("ENEMY", blow);
          setCatSwings((n) => n + 1);

          if (w.enemyHp <= 0) {
            killed = true;
            const reward = info.goldReward * stats.goldMultiplier;
            w.gold += reward;
            addHit("GOLD", reward);
            w.level += 1;
            w.enemyHp = levelInfo(w.level).enemyHp;
            w.enemyTimer = 0;
            setEnemyDeaths((n) => n + 1);
          }
        }

        // A corpse does not swing back, and neither does the next enemy before
        // it has walked in.
        if (!killed) {
          w.enemyTimer += dt;
          if (w.enemyTimer >= ENEMY_ATTACK_INTERVAL) {
            w.enemyTimer -= ENEMY_ATTACK_INTERVAL;
            const blow = info.enemyDamage * ENEMY_ATTACK_INTERVAL;
            w.hp -= blow;
            addHit("CAT", blow);
            setCatWounds((n) => n + 1);

            if (w.hp <= 0) {
              w.level = floorStart(w.level);
              w.hp = stats.maxHp;
              w.enemyHp = levelInfo(w.level).enemyHp;
              w.recovering = RECOVERY_SECONDS;
              w.catTimer = 0;
              w.enemyTimer = 0;
              setDefeats((n) => n + 1);
            }
          }
        }

        w.hp = Math.min(stats.maxHp, w.hp + stats.regen * dt);
      }

      setShown({
        level: w.level,
        enemyHp: Math.max(0, w.enemyHp),
        hp: Math.max(0, w.hp),
        gold: w.gold,
        recovering: w.recovering,
      });
    }, STEP_MS);

    return () => window.clearInterval(timer);
  }, [addHit]);

  const here = levelInfo(shown.level);
  const stats = state.stats;
  const fallen = shown.recovering > 0;

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
    () => state.items.filter((item) => !item.equipped).sort((a, b) => b.power - a.power),
    [state.items],
  );

  return (
    <div className="pb-4">
      <header className="pt-5 text-center">
        <p className="eyebrow">{t("idle.floor", { n: here.floor })}</p>
        <h1 className="display mt-1 text-2xl">
          {here.isBoss ? t("idle.guardian") : t("idle.chamber", { n: here.position })}
        </h1>
        <FloorPips position={here.position} />
      </header>

      {/* --- The arena ---------------------------------------------------- */}
      <motion.section
        className="panel panel-sapphire relative mt-4 overflow-hidden px-3 pb-3 pt-4"
        // The whole arena flinches when the cat is hit. Cheap, and it tells the
        // player where the damage went without reading a single number.
        animate={{ x: catWounds % 2 === 0 ? 0 : -3 }}
        transition={{ type: "spring", stiffness: 900, damping: 14 }}
      >
        <div className="relative flex items-end justify-between gap-1">
          {/* --- The cat --- */}
          <div className="relative">
            <motion.div
              animate={{ x: fallen ? 0 : catSwings % 2 === 0 ? 0 : 12 }}
              transition={{ type: "spring", stiffness: 520, damping: 16 }}
              style={{
                filter: fallen ? "grayscale(0.85) brightness(0.6)" : undefined,
                transformOrigin: "bottom center",
              }}
            >
              <motion.div
                animate={fallen ? { rotate: -12, y: 10 } : { rotate: 0, y: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 18 }}
              >
                <CatCanvas worn={worn} size={150} breathing={!fallen} />
              </motion.div>
            </motion.div>
            <HitStream hits={hits} target="CAT" tone="#ff6b6b" />
          </div>

          {/* --- What it is fighting --- */}
          <div className="relative flex-1 pb-4">
            <AnimatePresence mode="popLayout">
              <motion.div
                key={enemyDeaths}
                initial={{ opacity: 0, x: 34, scale: 0.85 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.4, rotate: 18, y: 20 }}
                transition={{ duration: 0.28 }}
              >
                <Enemy isBoss={here.isBoss} recoil={catSwings} />
              </motion.div>
            </AnimatePresence>
            <HitStream hits={hits} target="ENEMY" tone="#f0d089" />
            <HitStream hits={hits} target="GOLD" tone="#8fd14f" from="feet" prefix="+" />
          </div>
        </div>

        {/* --- Two bars facing each other --------------------------------- */}
        <div className="mt-2 grid grid-cols-2 gap-3">
          <Bar
            label={t("idle.catHp")}
            value={shown.hp}
            max={stats.maxHp}
            fill="linear-gradient(90deg,#3f8f5a,#7ed08f)"
            low="linear-gradient(90deg,#8f2f2f,#e0603f)"
          />
          <Bar
            label={here.isBoss ? t("idle.guardianHp") : t("idle.enemyHp")}
            value={shown.enemyHp}
            max={here.enemyHp}
            fill={
              here.isBoss
                ? "linear-gradient(90deg,#8f2f2f,#e0603f)"
                : "linear-gradient(90deg,#4b3f7a,#8a72d0)"
            }
            align="right"
          />
        </div>

        {/* --- Defeat ------------------------------------------------------- */}
        <AnimatePresence>
          {fallen && (
            <motion.div
              className="absolute inset-0 flex flex-col items-center justify-center bg-[#05080f]/72 backdrop-blur-[1px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <p className="display text-lg text-[#ff8e8e]">{t("idle.fallen")}</p>
              <p className="dim mt-1 max-w-[16rem] text-center text-[0.72rem]">
                {t("idle.fallenBack", { n: levelInfo(shown.level).floor })}
              </p>
              <p className="tabular gold-text mt-2 text-sm">
                {t("idle.risingIn", { s: Math.ceil(shown.recovering) })}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>

      {/* --- The verdict on this fight ------------------------------------ */}
      <Verdict outcome={state.outcome} isBoss={here.isBoss} />

      {/* --- The numbers -------------------------------------------------- */}
      <section className="mt-3 grid grid-cols-3 gap-2">
        <Stat label={t("idle.gold")} value={formatNumber(shown.gold)} tone="gold" />
        <Stat label={t("idle.power")} value={`${formatNumber(stats.power)}/s`} />
        <Stat label={t("idle.health")} value={formatNumber(stats.maxHp)} />
        <Stat label={t("idle.regen")} value={`${stats.regen.toFixed(1)}/s`} />
        <Stat label={t("idle.incoming")} value={`${here.enemyDamage.toFixed(1)}/s`} tone="danger" />
        <Stat label={t("idle.deepest")} value={String(levelInfo(state.highestLevel).floor)} />
      </section>

      {/* --- Upgrades ----------------------------------------------------- */}
      <h2 className="eyebrow mt-6">{t("idle.upgrades")}</h2>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {state.upgrades.map((upgrade) => {
          const affordable = shown.gold >= upgrade.cost && !upgrade.maxed;
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
                {upgrade.maxed ? t("idle.maxed") : formatNumber(upgrade.cost)}
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
                  <p className="tabular mt-1 text-[0.62rem] text-[var(--parchment)]">
                    {formatNumber(item.power)}
                    <span className="dim"> · </span>
                    <span className="text-[#7ed08f]">{formatNumber(item.vitality)}</span>
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
                    {formatNumber(item.power)} · {formatNumber(item.vitality)}
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
              {initial.report.defeats > 0 && (
                <p className="mt-2 text-[0.72rem] text-[#ff8e8e]">
                  {t("idle.awayDefeats", { n: initial.report.defeats })}
                </p>
              )}
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

      {defeats > 0 && (
        <p className="dim mt-4 text-center text-[0.66rem]">
          {t("idle.defeatsTotal", { n: state.defeats + defeats })}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Damage that floats off whoever took it, then gets out of the way.
 *
 * Gold rises from the enemy's feet while damage rises from its head — the two
 * happen on the same instant a kill lands, and sharing one lane made them collide
 * into an unreadable glyph.
 */
function HitStream({
  hits,
  target,
  tone,
  from = "head",
  prefix = "",
}: {
  hits: Hit[];
  target: Hit["target"];
  tone: string;
  from?: "head" | "feet";
  prefix?: string;
}) {
  const feet = from === "feet";
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 flex justify-center ${
        feet ? "bottom-2" : "top-9"
      }`}
    >
      <AnimatePresence>
        {hits
          .filter((hit) => hit.target === target)
          .map((hit) => (
            <motion.span
              key={hit.id}
              className="tabular absolute whitespace-nowrap text-[0.85rem] font-bold"
              style={{ color: tone, textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}
              initial={{ opacity: 0, y: feet ? 6 : 12, x: hit.drift, scale: 0.6 }}
              animate={{ opacity: 1, y: feet ? -22 : -28, scale: 1 }}
              exit={{ opacity: 0, y: feet ? -40 : -48 }}
              transition={{ duration: 0.78, ease: "easeOut" }}
            >
              {prefix}
              {formatNumber(hit.value)}
            </motion.span>
          ))}
      </AnimatePresence>
    </div>
  );
}

function Bar({
  label,
  value,
  max,
  fill,
  low,
  align = "left",
}: {
  label: string;
  value: number;
  max: number;
  fill: string;
  low?: string;
  align?: "left" | "right";
}) {
  const share = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-1 text-[0.6rem]">
        <span className="dim uppercase tracking-widest">{label}</span>
        <span className="tabular text-[var(--parchment)]">{formatNumber(value)}</span>
      </div>
      <div className="track mt-1" style={{ transform: align === "right" ? "scaleX(-1)" : undefined }}>
        <div
          className="track-fill"
          style={{
            width: `${share}%`,
            background: low && share < 30 ? low : fill,
            transition: "width 90ms linear",
          }}
        />
      </div>
    </div>
  );
}

function Verdict({ outcome, isBoss }: { outcome: IdleState["outcome"]; isBoss: boolean }) {
  const { t } = useI18n();
  if (outcome === "WINNING") return null;

  const losing = outcome === "LOSING";
  return (
    <motion.p
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-3 rounded-lg px-3 py-2 text-center text-[0.72rem] leading-snug"
      style={{
        background: losing ? "rgba(224,96,63,0.12)" : "rgba(201,162,77,0.10)",
        color: losing ? "#ffb0a0" : "var(--candle)",
      }}
    >
      {losing
        ? t(isBoss ? "idle.losingBoss" : "idle.losing")
        : t("idle.slow")}
    </motion.p>
  );
}

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
 * The thing in front of the cat. Deliberately less detailed than the cat, so the
 * eye stays where the progress is — but it lunges, because a static enemy is what
 * made this screen read as a progress bar with a picture next to it.
 */
function Enemy({ isBoss, recoil }: { isBoss: boolean; recoil: number }) {
  const tint = isBoss ? "#e0603f" : "#5a4f7a";
  return (
    <motion.svg
      viewBox="0 0 120 150"
      width="100%"
      style={{ maxWidth: isBoss ? 132 : 104, marginLeft: "auto", display: "block" }}
      animate={{ y: [0, -5, 0] }}
      transition={{ duration: 2.1, repeat: Infinity, ease: "easeInOut" }}
      aria-hidden
    >
      <motion.g
        animate={{ x: recoil % 2 === 0 ? 0 : 9, scale: recoil % 2 === 0 ? 1 : 0.97 }}
        transition={{ type: "spring", stiffness: 700, damping: 15 }}
        style={{ originX: "60px", originY: "90px" }}
      >
        <ellipse cx="60" cy="142" rx="34" ry="7" fill="#000" opacity="0.42" />
        <path
          d="M60 30 C88 30 100 56 96 88 C93 116 78 132 60 132 C42 132 27 116 24 88 C20 56 32 30 60 30 Z"
          fill={tint}
          opacity="0.9"
        />
        {isBoss && (
          <>
            {/* Thick and curling, because a thin triangle above a head is an ear. */}
            <path d="M38 42 C22 36 14 24 18 10" stroke={tint} strokeWidth="11" strokeLinecap="round" fill="none" />
            <path d="M82 42 C98 36 106 24 102 10" stroke={tint} strokeWidth="11" strokeLinecap="round" fill="none" />
            <path d="M18 14 L14 4 L26 10 Z" fill={tint} />
            <path d="M102 14 L106 4 L94 10 Z" fill={tint} />
          </>
        )}
        <path d="M38 60 l16 6 M82 60 l-16 6" stroke="#0a0710" strokeWidth="3.5" strokeLinecap="round" />
        <motion.g
          animate={{ scaleY: [1, 0.15, 1] }}
          transition={{ duration: 0.22, repeat: Infinity, repeatDelay: 3.4 }}
          style={{ originY: "72px" }}
        >
          <ellipse cx="46" cy="72" rx="7" ry="8.5" fill={isBoss ? "#ffd76a" : "#ff8e5e"} />
          <ellipse cx="74" cy="72" rx="7" ry="8.5" fill={isBoss ? "#ffd76a" : "#ff8e5e"} />
        </motion.g>
        <path
          d="M42 102 l7 -7 l7 7 l7 -7 l7 7 l7 -7"
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
  tone?: "gold" | "danger";
}) {
  return (
    <div className="panel px-2 py-2 text-center">
      <p className="dim text-[0.58rem] uppercase tracking-widest">{label}</p>
      <p
        className="tabular mt-1 text-[0.9rem]"
        style={{
          color:
            tone === "gold"
              ? "var(--gold-bright)"
              : tone === "danger"
                ? "#ff8e8e"
                : "var(--parchment)",
        }}
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

function formatDuration(
  seconds: number,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return t("idle.durationHm", { h: hours, m: minutes });
  if (minutes > 0) return t("idle.durationM", { m: minutes });
  return t("idle.durationS", { s: Math.floor(seconds) });
}
