"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ENEMY_ATTACK_INTERVAL,
  LEVELS_PER_FLOOR,
  STRIKE_DAMAGE_MULTIPLIER,
  RECOVERY_SECONDS,
  enemyKindFor,
  enemyName,
  weaponFor,
  floorStart,
  levelInfo,
} from "@/lib/content/idle";
import type { IdleState } from "@/lib/engine/idle";
import { CatCanvas, type WornPiece } from "./CatCanvas";
import { EnemyCanvas } from "./EnemyCanvas";
import { FloorBackdrop, themeFor } from "./FloorBackdrop";
import { IdleBag } from "./IdleBag";
import { LootPrompt, type LootEntry } from "./LootPrompt";
import { useI18n } from "./I18nProvider";
import { formatNumber } from "./format";
import { ItemIcon } from "./ui/Icons";

/**
 * THE DESCENT
 *
 * Five chambers, a Guardian, five more. The cat fights on its own; the player
 * decides what it wears, what it becomes, and whether it survives.
 *
 * The server owns the clock: reading `/api/idle` *is* the tick. This screen
 * replays the seconds between two reads under the same rules, so blows land in
 * front of the player instead of arriving as a ten-second jump, then throws its
 * replay away whenever the truth turns up. Nothing here can grant a reward; it
 * can only be wrong for ten seconds.
 *
 * The replay rolls its own criticals and double strikes. It has to: the server
 * resolves fights with the *expected* damage per second, which is the right
 * number to compute twelve hours with and the wrong one to watch. Rolling each
 * blow gives the same average and a fight worth looking at.
 */

/** How often the replay is replaced by the server's answer. */
const SYNC_INTERVAL_MS = 10_000;
/** The replay runs on a timer rather than a frame loop: bars step, they do not slide. */
const STEP_MS = 60;
/** However fast the cat gets, blows never land closer together than this. */
const MIN_SWING_SECONDS = 0.15;

interface Hit {
  id: number;
  target: "ENEMY" | "CAT" | "GOLD" | "HEAL";
  value: number;
  crit: boolean;
  /** Horizontal offset, so blows that land together stay separately readable. */
  drift: number;
  /** And a vertical one, for the same reason. */
  lift: number;
  /** How many blows this one number stands for, when several were merged. */
  strikes: number;
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
  /** Seconds of immunity left, mirrored from the server so the bar can say so. */
  shield: number;
  /** Reset on every defeat, so a fruitless death loop can be detected. */
  killsSinceDefeat: number;
}

export function IdleGame({ initial }: { initial: IdleState }) {
  const { t, L, locale } = useI18n();

  const [state, setState] = useState(initial);
  const [tab, setTab] = useState<"FIGHT" | "BAG">("FIGHT");
  const [busy, setBusy] = useState<string | null>(null);
  const [welcome, setWelcome] = useState(
    initial.report.seconds > 60 && initial.report.goldEarned > 0,
  );

  const [shown, setShown] = useState({
    level: initial.level.level,
    enemyHp: initial.enemyHp,
    hp: initial.hp,
    gold: initial.gold,
    recovering: initial.recoverFor,
    shield: initial.shieldFor,
  });

  const [hits, setHits] = useState<Hit[]>([]);
  const [catSwings, setCatSwings] = useState(0);
  const [catWounds, setCatWounds] = useState(0);
  const [enemyDeaths, setEnemyDeaths] = useState(0);
  const [defeats, setDefeats] = useState(0);
  const [heals, setHeals] = useState(0);

  /**
   * Finds waiting for an answer, and the ids already offered.
   *
   * The seen set is what stops a card reappearing: a tick's report is returned
   * again by every action that follows it, so without it selling one piece would
   * re-prompt for the other two from the same tick.
   */
  const [loot, setLoot] = useState<LootEntry[]>([]);
  const seenDrops = useRef(new Set<string>());

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
    shield: initial.shieldFor,
    killsSinceDefeat: 1,
  });

  const nextHitId = useRef(0);
  const addHit = useCallback(
    (target: Hit["target"], value: number, crit = false, side = 0, strikes = 1) => {
      const id = nextHitId.current++;
      // A double strike puts its two numbers on opposite sides on purpose; every
      // other blow is scattered. Landing them all on one line made four hits look
      // like one unreadable smear.
      const drift = side === 0 ? Math.random() * 56 - 28 : side * (16 + Math.random() * 16);
      setHits((current) => [
        ...current.slice(-13),
        { id, target, value, crit, drift, lift: Math.random() * 16 - 8, strikes },
      ]);
      window.setTimeout(() => {
        setHits((current) => current.filter((hit) => hit.id !== id));
      }, 900);
    },
    [],
  );

  const adopt = useCallback((next: IdleState) => {
    setState(next);

    // Only finds from a tick the player was present for. Twelve hours of absence
    // is a summary, not twenty-five cards.
    if (next.report.seconds <= 60) {
      const fresh = next.report.drops.filter((drop) => !seenDrops.current.has(drop.id));
      for (const drop of fresh) seenDrops.current.add(drop.id);
      if (fresh.length > 0) {
        setLoot((current) =>
          [
            ...current,
            ...fresh.map((drop) => ({
              id: drop.id,
              slot: drop.slot,
              floor: drop.floor,
              rarity: drop.rarity,
              equipped: drop.equipped,
            })),
          ].slice(-3),
        );
      }
    }

    world.current = {
      ...world.current,
      level: next.level.level,
      enemyHp: next.enemyHp,
      hp: next.hp,
      recovering: next.recoverFor,
      gold: next.gold,
      shield: next.shieldFor,
    };
  }, []);

  const dismissLoot = useCallback((id: string) => {
    setLoot((current) => current.filter((entry) => entry.id !== id));
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

  /**
   * Taps are batched rather than sent one by one.
   *
   * A request per tap would be several a second for one thumb; a flush twice a
   * second is the same damage with a fraction of the traffic. The
   * server clamps the count by elapsed time either way, so batching cannot be
   * used to claim more than a thumb could produce.
   */
  const pendingStrikes = useRef(0);

  const act = useCallback(
    async (body: Record<string, unknown>, key: string, quiet = false) => {
      if (!quiet) setBusy(key);
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
        if (!quiet) setBusy(null);
      }
    },
    [adopt],
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      const count = Math.min(40, pendingStrikes.current);
      if (count <= 0) return;
      pendingStrikes.current = 0;
      void act({ action: "strike", count }, "strike", true);
    }, 500);
    return () => window.clearInterval(timer);
  }, [act]);

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

      if (w.recovering > 0) {
        w.recovering = Math.max(0, w.recovering - dt);
        w.hp = Math.min(stats.maxHp, w.hp + stats.regen * dt);
      } else {
        const info = levelInfo(w.level);
        if (w.enemyHp <= 0) w.enemyHp = info.enemyHp;

        let killed = false;

        // Speed has no ceiling, and a screen does. Past about seven swings a
        // second one drawn swing stands for several real ones and carries their
        // damage together — otherwise the bar would drain at a fraction of the
        // true rate and the replay would disagree with the server by an order of
        // magnitude rather than by a rounding error.
        const trueSwing = 1 / Math.max(0.1, stats.attacksPerSecond);
        const swing = Math.max(MIN_SWING_SECONDS, trueSwing);
        const batch = swing / trueSwing;

        w.catTimer += dt;
        if (w.catTimer >= swing) {
          w.catTimer -= swing;

          const crit = Math.random() < stats.critChance;
          // 2.4 extra strikes is two certain extra blows and a 40% chance of a third.
          const whole = Math.floor(stats.extraStrikes);
          const blows = 1 + whole + (Math.random() < stats.extraStrikes - whole ? 1 : 0);
          const damage = stats.hitDamage * (crit ? stats.critMultiplier : 1) * batch;

          // Up to three blows are worth seeing separately; beyond that they are
          // one number with a count on it.
          if (blows <= 3) {
            for (let blow = 0; blow < blows; blow++) {
              w.enemyHp -= damage;
              addHit("ENEMY", damage, crit, blows === 1 ? 0 : blow === 0 ? -1 : 1);
            }
          } else {
            w.enemyHp -= damage * blows;
            addHit("ENEMY", damage * blows, crit, 0, blows);
          }
          setCatSwings((n) => n + 1);

          if (w.enemyHp <= 0) {
            killed = true;
            const reward = info.goldReward * stats.goldMultiplier;
            w.gold += reward;
            addHit("GOLD", reward);
            w.killsSinceDefeat += 1;

            // A Guardian's fall heals the cat outright — the floor's reward.
            if (info.isBoss) {
              const healed = stats.maxHp - w.hp;
              w.hp = stats.maxHp;
              if (healed > 0) addHit("HEAL", healed);
              setHeals((n) => n + 1);
            }

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
            if (w.shield <= 0) {
              const blow = info.enemyDamage * ENEMY_ATTACK_INTERVAL;
              w.hp -= blow;
              addHit("CAT", blow);
              setCatWounds((n) => n + 1);
            }

            if (w.hp <= 0) {
              // Falling twice with nothing killed in between means this floor's
              // own first chamber is out of reach; since gold comes only from
              // kills, dropping a floor is the only way back to an income.
              const floor = levelInfo(w.level).floor;
              w.level =
                w.killsSinceDefeat === 0
                  ? floorStart(Math.max(1, (floor - 2) * LEVELS_PER_FLOOR + 1))
                  : floorStart(w.level);
              w.killsSinceDefeat = 0;
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

      w.shield = Math.max(0, w.shield - dt);

      setShown({
        level: w.level,
        enemyHp: Math.max(0, w.enemyHp),
        hp: Math.max(0, w.hp),
        gold: w.gold,
        recovering: w.recovering,
        shield: w.shield,
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
        .filter((item) => item.equipped && !item.onPack)
        .map((item) => ({
          slot: item.slot,
          shape: item.shape,
          rarity: item.rarity,
          // Only the hands carry one; the other five ignore it.
          weapon: weaponFor(item.id),
        })),
    [state.items],
  );

  const packWorn = useMemo<WornPiece[]>(
    () =>
      state.items
        .filter((item) => item.onPack)
        .map((item) => ({
          slot: item.slot,
          shape: item.shape,
          rarity: item.rarity,
          // Only the hands carry one; the other five ignore it.
          weapon: weaponFor(item.id),
        })),
    [state.items],
  );

  const spareCount = state.items.filter((item) => !item.equipped && !item.onPack).length;
  const breathOpen = state.unlocks.some((entry) => entry.key === "breath" && entry.open);

  return (
    <div className="pb-4">
      <header className="pt-5 text-center">
        <p className="eyebrow">{t("idle.floor", { n: here.floor })}</p>
        <h1 className="display mt-1 text-2xl">
          {here.isBoss ? t("idle.guardian") : t("idle.chamber", { n: here.position })}
        </h1>
        <p className="dim mt-1 text-[0.7rem] italic">{L(themeFor(here.floor).nameEn, themeFor(here.floor).nameFr)}</p>
        <FloorPips position={here.position} />
        <p className="gold-text tabular mt-3 text-lg">{formatNumber(shown.gold)}</p>
        <p className="dim text-[0.6rem] uppercase tracking-widest">{t("idle.gold")}</p>
      </header>

      {/* --- Two tabs, one running game --------------------------------- */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <TabButton active={tab === "FIGHT"} onClick={() => setTab("FIGHT")}>
          {t("idle.tabFight")}
        </TabButton>
        <TabButton active={tab === "BAG"} onClick={() => setTab("BAG")} badge={spareCount}>
          {t("idle.tabBag")}
        </TabButton>
      </div>

      {tab === "BAG" ? (
        <IdleBag state={state} busy={busy} act={act} />
      ) : (
        <>
          {/* --- The arena -------------------------------------------- */}
          <motion.section
            className="panel panel-sapphire relative mt-4 overflow-hidden px-3 pb-3 pt-4"
            // The whole arena flinches when the cat is hit. Cheap, and it says
            // where the damage went without reading a single number.
            animate={{ x: catWounds % 2 === 0 ? 0 : -3 }}
            transition={{ type: "spring", stiffness: 900, damping: 14 }}
          >
            <FloorBackdrop floor={here.floor} />


            <div className="relative z-10 flex items-end justify-between gap-1">
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
                    <CatCanvas worn={worn} size={150} breathing={!fallen} skin={state.shop.skinKey} />
                  </motion.div>
                </motion.div>
                {/* A Guardian's fall lights the cat up for a moment. The number
                    says how much; the glow says it happened. */}
                <motion.div
                  key={heals}
                  className="pointer-events-none absolute inset-0 rounded-full"
                  initial={{ opacity: heals === 0 ? 0 : 0.55, scale: 0.8 }}
                  animate={{ opacity: 0, scale: 1.15 }}
                  transition={{ duration: 0.9, ease: "easeOut" }}
                  style={{ background: "radial-gradient(circle, #7ed08f 0%, transparent 65%)" }}
                />
                <HitStream hits={hits} target="CAT" tone="#ff6b6b" />
                {packWorn.length > 0 && (
                  <div className="pointer-events-none absolute -left-1 bottom-0 opacity-80">
                    <CatCanvas worn={packWorn} size={92} breathing={!fallen} skin={state.shop.skinKey} />
                  </div>
                )}
                <HitStream hits={hits} target="HEAL" tone="#7ed08f" from="feet" prefix="+" />
              </div>

              <div className="relative flex-1 pb-4">
                <AnimatePresence mode="popLayout">
                  <motion.div
                    key={enemyDeaths}
                    onPointerDown={() => {
                      if (fallen) return;
                      pendingStrikes.current += 1;
                      // Shown at once and reconciled by the next answer: a tap
                      // that waits a third of a second to appear does not feel
                      // like a tap.
                      const blow =
                        stateRef.current.stats.hitDamage * STRIKE_DAMAGE_MULTIPLIER;
                      world.current.enemyHp -= blow;
                      addHit("ENEMY", blow, false, 0);
                      setCatSwings((n) => n + 1);
                    }}
                    className="cursor-pointer select-none"
                    initial={{ opacity: 0, x: 34, scale: 0.85 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.4, rotate: 18, y: 20 }}
                    transition={{ duration: 0.28 }}
                  >
                    <EnemyCanvas
                      kind={enemyKindFor(here.floor)}
                      isBoss={here.isBoss}
                      elite={state.elite}
                      recoil={catSwings}
                    />
                  </motion.div>
                </AnimatePresence>
                <HitStream hits={hits} target="ENEMY" tone="#f0d089" />
                <HitStream hits={hits} target="GOLD" tone="#8fd14f" from="feet" prefix="+" />
              </div>
            </div>

            <div className="relative z-10 mt-2 grid grid-cols-2 gap-3">
              <Bar
                label={shown.shield > 0 ? t("idle.shielded", { s: Math.ceil(shown.shield) }) : t("idle.catHp")}
                value={shown.hp}
                max={stats.maxHp}
                fill="linear-gradient(90deg,#3f8f5a,#7ed08f)"
                low="linear-gradient(90deg,#8f2f2f,#e0603f)"
              />
              <Bar
                label={
                  state.elite
                    ? t("idle.eliteHp")
                    : here.isBoss
                      ? t("idle.guardianHp")
                      : enemyName(enemyKindFor(here.floor), locale)
                }
                value={shown.enemyHp}
                max={here.enemyHp}
                fill={
                  state.elite
                    ? "linear-gradient(90deg,#1d6d8a,#37d5ff)"
                    : here.isBoss
                      ? "linear-gradient(90deg,#8f2f2f,#e0603f)"
                      : "linear-gradient(90deg,#4b3f7a,#8a72d0)"
                }
                align="right"
              />
            </div>

            <AnimatePresence>
              {fallen && (
                <motion.div
                  className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#05080f]/72 backdrop-blur-[1px]"
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

          <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: breathOpen ? "1fr 1fr" : "1fr" }}>
            <Ability
              label={t("idle.roar")}
              waiting={t("idle.roarIn", { s: Math.ceil(state.roarIn) })}
              left={state.roarIn}
              cooldown={state.roarCooldown}
              busy={busy}
              onCast={() => act({ action: "roar" }, "roar")}
            />
            {breathOpen && (
              <Ability
                label={t("idle.breath")}
                waiting={t("idle.breathIn", { s: Math.ceil(state.breathIn) })}
                left={state.breathIn}
                cooldown={state.breathCooldown}
                busy={busy}
                tone="#7ed08f"
                onCast={() => act({ action: "breath" }, "breath")}
              />
            )}
          </div>

          <Verdict outcome={state.outcome} isBoss={here.isBoss} />

          {/* --- The six statistics ----------------------------------- */}
          <section className="mt-3 grid grid-cols-3 gap-2">
            <Stat label={t("idle.dps")} value={`${formatNumber(stats.power)}/s`} tone="gold" />
            <Stat label={t("idle.health")} value={formatNumber(stats.maxHp)} tone="life" />
            <Stat label={t("idle.speed")} value={`${stats.attacksPerSecond < 100 ? stats.attacksPerSecond.toFixed(1) : formatNumber(stats.attacksPerSecond)}/s`} />
            <Stat label={t("idle.crit")} value={`${Math.round(stats.critChance * 100)}%`} />
            <Stat label={t("idle.critDamage")} value={`×${formatNumber(stats.critMultiplier)}`} />
            <Stat label={t("idle.double")} value={`×${(1 + stats.extraStrikes).toFixed(2)}`} />
          </section>

          {stats.packPower > 0 && (
            <p className="mt-2 text-center text-[0.68rem]" style={{ color: "#9ad0ff" }}>
              {t("idle.packShare", {
                n: formatNumber(stats.packPower),
                pct: Math.round((stats.packPower / stats.power) * 100),
              })}
            </p>
          )}

          {stats.seal.rarity && (
            <p className="mt-2 text-center text-[0.68rem]" style={{ color: "var(--sapphire-pale)" }}>
              {t("idle.sealActive", {
                n: stats.seal.count,
                rarity: t(`idle.rarity.${stats.seal.rarity}`),
                bonus: Math.round(stats.seal.bonus * 100),
              })}
            </p>
          )}

          <p className="dim mt-2 text-center text-[0.64rem]">
            {t("idle.incomingHere", { n: formatNumber(here.enemyDamage) })}
            {" · "}
            {t("idle.deepestShort", { n: levelInfo(state.highestLevel).floor })}
          </p>

          {/* --- Upgrades --------------------------------------------- */}
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

          {defeats + state.defeats > 0 && (
            <p className="dim mt-5 text-center text-[0.66rem]">
              {t("idle.defeatsTotal", { n: state.defeats + defeats })}
            </p>
          )}
        </>
      )}

      <LootPrompt
        queue={loot}
        items={state.items}
        busy={busy}
        onAct={act}
        onDismiss={dismissLoot}
      />

      {/* --- What happened while away ---------------------------------- */}
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
    </div>
  );
}

// ---------------------------------------------------------------------------

function TabButton({
  active,
  badge,
  onClick,
  children,
}: {
  active: boolean;
  badge?: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="panel relative py-2 text-[0.78rem] uppercase tracking-widest transition"
      style={{
        borderColor: active ? "rgba(201,162,77,0.6)" : undefined,
        color: active ? "var(--gold-bright)" : "var(--text-dim)",
        background: active ? "rgba(201,162,77,0.08)" : undefined,
      }}
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span className="tabular ml-1.5 text-[0.68rem] opacity-70">({badge})</span>
      )}
    </button>
  );
}

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
              className="tabular absolute whitespace-nowrap font-bold"
              style={{
                // A critical is worth reading differently, not just worth more.
                color: hit.crit ? "#ff9d3d" : tone,
                fontSize: hit.crit ? "1.15rem" : "0.85rem",
                textShadow: hit.crit
                  ? "0 0 10px rgba(255,157,61,0.7), 0 1px 4px rgba(0,0,0,0.9)"
                  : "0 1px 4px rgba(0,0,0,0.9)",
              }}
              initial={{
                opacity: 0,
                y: (feet ? 6 : 12) + hit.lift,
                x: hit.drift,
                scale: hit.crit ? 1.5 : 0.6,
              }}
              animate={{ opacity: 1, y: (feet ? -22 : -30) + hit.lift, scale: 1 }}
              exit={{ opacity: 0, y: (feet ? -40 : -50) + hit.lift }}
              transition={{ duration: 0.78, ease: "easeOut" }}
            >
              {prefix}
              {formatNumber(hit.value)}
              {hit.strikes > 1 && (
                <span className="ml-0.5 text-[0.7em] opacity-80">×{hit.strikes}</span>
              )}
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

/**
 * Twenty-five seconds of the cat's own damage, every three minutes. A share of
 * current output
 * rather than a fixed number, so it stays worth pressing at any depth without
 * ever being the thing that clears a floor by itself.
 */
function Ability({
  label,
  waiting,
  left: given,
  cooldown,
  busy,
  tone = "var(--gold-bright)",
  onCast,
}: {
  label: string;
  waiting: string;
  left: number;
  cooldown: number;
  busy: string | null;
  tone?: string;
  onCast: () => void;
}) {
  const [left, setLeft] = useState(given);

  useEffect(() => setLeft(given), [given]);
  useEffect(() => {
    const timer = window.setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const ready = left <= 0;
  const share = 1 - left / cooldown;

  return (
    <button
      type="button"
      disabled={!ready || busy !== null}
      onClick={onCast}
      className="panel relative w-full overflow-hidden py-2.5 text-[0.72rem] uppercase tracking-widest transition disabled:opacity-60"
      style={{
        borderColor: ready ? `${tone}99` : undefined,
        color: ready ? tone : "var(--text-dim)",
      }}
    >
      {/* The cooldown as a filling bar rather than a number alone: a button that
          is nearly ready should look nearly ready. */}
      <span
        className="absolute inset-y-0 left-0"
        style={{
          width: `${share * 100}%`,
          background: "rgba(201,162,77,0.14)",
          transition: "width 1s linear",
        }}
      />
      <span className="relative">{ready ? label : waiting}</span>
    </button>
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
      {losing ? t(isBoss ? "idle.losingBoss" : "idle.losing") : t("idle.slow")}
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

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "gold" | "life";
}) {
  return (
    <div className="panel px-2 py-2 text-center">
      <p className="dim text-[0.56rem] uppercase tracking-widest">{label}</p>
      <p
        className="tabular mt-1 text-[0.88rem]"
        style={{
          color:
            tone === "gold"
              ? "var(--gold-bright)"
              : tone === "life"
                ? "#7ed08f"
                : "var(--parchment)",
        }}
      >
        {value}
      </p>
    </div>
  );
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
