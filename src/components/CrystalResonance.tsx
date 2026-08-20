"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  buildPattern,
  tierFor,
  LANES,
  HIT_WINDOW_MS,
  POINTS,
  type Pattern,
  type HitTier,
} from "@/lib/game/pattern";
import { useI18n } from "./I18nProvider";
import { RankUpOverlay } from "./RankUpOverlay";
import { XpIcon, ShardIcon } from "./ui/Icons";

/**
 * CRYSTAL RESONANCE
 *
 * A ring closes on one of four crystals; you tap that crystal as it lands.
 * Perfect timing pays most, chained hits build a combo, gold crystals double.
 *
 * Drawn on a canvas rather than in the DOM so the run stays smooth on a mid-range
 * phone. The score shown here is a live estimate for the player's benefit only —
 * the server rebuilds the same pattern from the seed and decides what the run was
 * actually worth.
 *
 * Stray taps matter: tapping a lane with nothing in it breaks the combo. That is
 * what keeps the game a test of timing instead of a test of tapping fast.
 */

const APPROACH_MS = 1150;

interface RunState {
  pattern: Pattern;
  startedAt: number;
  hits: Map<number, number>;
  strays: number;
  combo: number;
  bestCombo: number;
  score: number;
  effects: { lane: number; born: number; tier: HitTier }[];
}

type Phase = "intro" | "running" | "submitting" | "results" | "error";

interface Results {
  score: number;
  accuracy: number;
  bestCombo: number;
  perfect: number;
  great: number;
  good: number;
  missed: number;
  xpAwarded: number;
  shardsAwarded: number;
  personalBest: boolean;
  reduced: boolean;
  rankUp?: { toKey: string } | null;
}

export function CrystalResonance({ bestScore }: { bestScore: number }) {
  const { t } = useI18n();
  const router = useRouter();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runRef = useRef<RunState | null>(null);
  const frameRef = useRef<number>(0);
  const sessionRef = useRef<string | null>(null);

  const [phase, setPhase] = useState<Phase>("intro");
  const [hud, setHud] = useState({ score: 0, combo: 0, tier: "" as HitTier | "" });
  const [results, setResults] = useState<Results | null>(null);
  const [rankUp, setRankUp] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string>("common.error");

  // --- Submission ---------------------------------------------------------

  const submit = useCallback(async () => {
    const run = runRef.current;
    const sessionId = sessionRef.current;
    if (!run || !sessionId) return;

    setPhase("submitting");
    const hits = Array.from(run.hits.entries()).map(([i, dt]) => ({ i, dt: Math.round(dt) }));

    try {
      const response = await fetch("/api/game/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          hits,
          strays: run.strays,
          durationMs: Math.round(performance.now() - run.startedAt),
        }),
      });
      const data = await response.json();

      if (!data.ok) {
        setErrorKey(data.error === "RATE_LIMITED" ? "game.rateLimited" : "game.rejected");
        setPhase("error");
        return;
      }

      setResults(data as Results);
      setPhase("results");
      if (data.rankUp?.toKey) setTimeout(() => setRankUp(data.rankUp.toKey), 900);
      router.refresh();
    } catch {
      setErrorKey("common.error");
      setPhase("error");
    }
  }, [router]);

  // --- Draw loop ----------------------------------------------------------

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const run = runRef.current;
    if (!canvas || !run) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const now = performance.now() - run.startedAt;
    const laneWidth = width / LANES;
    const crystalY = height - 74;

    // Lane columns — faint stone pillars.
    for (let lane = 0; lane < LANES; lane++) {
      const x = laneWidth * lane + laneWidth / 2;
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, "rgba(79,147,255,0.00)");
      gradient.addColorStop(1, "rgba(79,147,255,0.10)");
      ctx.fillStyle = gradient;
      ctx.fillRect(laneWidth * lane + 4, 0, laneWidth - 8, height);

      // Resting crystal.
      drawCrystal(ctx, x, crystalY, 17, "rgba(120,160,225,0.5)", "rgba(20,32,64,0.85)");
    }

    // Approaching targets.
    for (const target of run.pattern.targets) {
      if (run.hits.has(target.i)) continue;
      const delta = target.at - now;
      if (delta > APPROACH_MS || delta < -HIT_WINDOW_MS) continue;

      const x = laneWidth * target.lane + laneWidth / 2;
      const progress = 1 - Math.max(0, delta) / APPROACH_MS;
      const radius = 17 + (1 - progress) * 62;
      const alpha = Math.min(1, progress * 1.5);
      const gold = target.kind === "GOLD";

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = gold ? "rgba(240,208,137,0.95)" : "rgba(120,180,255,0.9)";
      ctx.lineWidth = gold ? 3 : 2.2;
      ctx.beginPath();
      ctx.arc(x, crystalY, radius, 0, Math.PI * 2);
      ctx.stroke();

      // The crystal itself brightens as its moment arrives.
      drawCrystal(
        ctx,
        x,
        crystalY,
        17,
        gold ? "rgba(255,224,160,1)" : "rgba(150,200,255,1)",
        gold ? "rgba(120,90,25,0.9)" : "rgba(30,70,150,0.9)",
        0.35 + progress * 0.65,
      );
      ctx.restore();
    }

    // Hit bursts.
    run.effects = run.effects.filter((effect) => now - effect.born < 420);
    for (const effect of run.effects) {
      const age = (now - effect.born) / 420;
      const x = laneWidth * effect.lane + laneWidth / 2;
      ctx.save();
      ctx.globalAlpha = 1 - age;
      ctx.strokeStyle =
        effect.tier === "PERFECT"
          ? "rgba(255,232,170,0.95)"
          : effect.tier === "GREAT"
            ? "rgba(150,205,255,0.9)"
            : "rgba(140,160,190,0.8)";
      ctx.lineWidth = 3 - age * 2;
      ctx.beginPath();
      ctx.arc(x, crystalY, 18 + age * 46, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (now >= run.pattern.durationMs) {
      cancelAnimationFrame(frameRef.current);
      void submit();
      return;
    }
    frameRef.current = requestAnimationFrame(draw);
  }, [submit]);

  // --- Input --------------------------------------------------------------

  const tapLane = useCallback((lane: number) => {
    const run = runRef.current;
    if (!run) return;
    const now = performance.now() - run.startedAt;

    // Closest untouched target in this lane, within the hit window.
    let chosen: { i: number; dt: number } | null = null;
    for (const target of run.pattern.targets) {
      if (target.lane !== lane || run.hits.has(target.i)) continue;
      const dt = now - target.at;
      if (Math.abs(dt) > HIT_WINDOW_MS) continue;
      if (!chosen || Math.abs(dt) < Math.abs(chosen.dt)) chosen = { i: target.i, dt };
    }

    if (!chosen) {
      // A tap into empty air costs the combo. Mashing is not a strategy.
      run.strays += 1;
      run.combo = 0;
      run.effects.push({ lane, born: now, tier: "MISS" });
      setHud({ score: run.score, combo: 0, tier: "MISS" });
      return;
    }

    const tier = tierFor(chosen.dt);
    run.hits.set(chosen.i, chosen.dt);
    run.combo += 1;
    run.bestCombo = Math.max(run.bestCombo, run.combo);

    const target = run.pattern.targets[chosen.i];
    const base = tier === "PERFECT" ? POINTS.perfect : tier === "GREAT" ? POINTS.great : POINTS.good;
    run.score += Math.round(
      base * Math.min(1 + run.combo * 0.02, 2) * (target.kind === "GOLD" ? 2 : 1),
    );
    run.effects.push({ lane, born: now, tier });
    setHud({ score: run.score, combo: run.combo, tier });

    if (navigator.vibrate) navigator.vibrate(tier === "PERFECT" ? 18 : 10);
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || phase !== "running") return;
      const rect = canvas.getBoundingClientRect();
      const lane = Math.min(
        LANES - 1,
        Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * LANES)),
      );
      tapLane(lane);
    },
    [phase, tapLane],
  );

  useEffect(() => {
    if (phase !== "running") return;
    function onKey(event: KeyboardEvent) {
      const index = ["1", "2", "3", "4"].indexOf(event.key);
      if (index >= 0) tapLane(index);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, tapLane]);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  // --- Start --------------------------------------------------------------

  async function start() {
    setPhase("submitting");
    setResults(null);
    setHud({ score: 0, combo: 0, tier: "" });

    try {
      const response = await fetch("/api/game/start", { method: "POST" });
      const data = await response.json();
      if (!data.ok) {
        setErrorKey(data.error === "RATE_LIMITED" ? "game.rateLimited" : "common.error");
        setPhase("error");
        return;
      }

      sessionRef.current = data.sessionId;
      runRef.current = {
        pattern: buildPattern(data.seed, data.targets),
        startedAt: performance.now(),
        hits: new Map(),
        strays: 0,
        combo: 0,
        bestCombo: 0,
        score: 0,
        effects: [],
      };
      setPhase("running");
      frameRef.current = requestAnimationFrame(draw);
    } catch {
      setErrorKey("common.error");
      setPhase("error");
    }
  }

  // --- Render -------------------------------------------------------------

  return (
    <main className="pt-5">
      <header className="text-center">
        <p className="eyebrow">{t("app.vault")}</p>
        <h1 className="display gold-text mt-0.5 text-2xl">{t("game.title")}</h1>
      </header>

      <section className="panel panel-sapphire mt-4 overflow-hidden">
        <div className="relative">
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            className="block h-[56dvh] max-h-[520px] min-h-[340px] w-full touch-none"
          />

          {/* HUD */}
          {phase === "running" && (
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4">
              <div>
                <p className="eyebrow">{t("game.score")}</p>
                <p className="tabular display text-2xl text-[var(--gold-bright)]">
                  {hud.score.toLocaleString()}
                </p>
              </div>
              <div className="text-right">
                <p className="eyebrow">{t("game.combo")}</p>
                <p className="tabular display text-2xl text-[var(--sapphire-pale)]">×{hud.combo}</p>
              </div>
            </div>
          )}

          <AnimatePresence>
            {phase === "running" && hud.tier && (
              <motion.p
                key={`${hud.tier}-${hud.score}`}
                initial={{ opacity: 0, y: 8, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="display pointer-events-none absolute inset-x-0 top-1/2 text-center text-lg"
                style={{
                  color:
                    hud.tier === "PERFECT"
                      ? "var(--gold-bright)"
                      : hud.tier === "GREAT"
                        ? "var(--sapphire-pale)"
                        : hud.tier === "MISS"
                          ? "#c96a6a"
                          : "var(--text-dim)",
                }}
              >
                {t(`game.${hud.tier.toLowerCase()}`)}
              </motion.p>
            )}
          </AnimatePresence>

          {/* Intro / error curtain */}
          {(phase === "intro" || phase === "error" || phase === "submitting") && !results && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[rgba(5,8,15,0.86)] px-6 text-center">
              {phase === "error" ? (
                <>
                  <p className="text-sm text-red-300">{t(errorKey)}</p>
                  <button type="button" onClick={() => setPhase("intro")} className="btn btn-ghost">
                    {t("common.retry")}
                  </button>
                </>
              ) : (
                <>
                  <p className="dim text-sm leading-relaxed">{t("game.howTo")}</p>
                  {bestScore > 0 && (
                    <p className="tabular text-xs text-[var(--gold)]">
                      {t("profile.bestRun")}: {bestScore.toLocaleString()}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={start}
                    disabled={phase === "submitting"}
                    className="btn btn-gold w-full max-w-xs"
                  >
                    {phase === "submitting" ? t("game.starting") : t("game.start")}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Lane hint for desktop players. */}
      <p className="dim mt-3 text-center text-[0.68rem]">1 · 2 · 3 · 4</p>

      {/* --- Results ------------------------------------------------------- */}
      <AnimatePresence>
        {phase === "results" && results && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-[rgba(3,6,14,0.93)] px-5 py-10"
          >
            <motion.div
              initial={{ scale: 0.93, y: 18 }}
              animate={{ scale: 1, y: 0 }}
              className="panel panel-gilded w-full max-w-sm p-5"
            >
              <p className="eyebrow text-center">{t("game.results")}</p>
              <p className="tabular display mt-1 text-center text-4xl gold-text">
                {results.score.toLocaleString()}
              </p>

              {results.personalBest && (
                <p className="display mt-1 text-center text-xs text-[var(--sapphire-pale)]">
                  ✦ {t("game.personalBest")}
                </p>
              )}

              <dl className="mt-5 grid grid-cols-2 gap-2">
                <Stat label={t("game.accuracy")} value={`${Math.round(results.accuracy * 100)}%`} />
                <Stat label={t("game.bestCombo")} value={`×${results.bestCombo}`} />
                <Stat label={t("game.perfect")} value={String(results.perfect)} />
                <Stat label={t("game.miss")} value={String(results.missed)} />
              </dl>

              <div className="mt-4 flex items-center justify-center gap-5">
                <span className="flex items-center gap-1.5 text-[var(--gold-bright)]">
                  <XpIcon size={17} />
                  <span className="tabular display">+{results.xpAwarded}</span>
                </span>
                <span className="flex items-center gap-1.5 text-[var(--sapphire-pale)]">
                  <ShardIcon size={17} />
                  <span className="tabular display">+{results.shardsAwarded}</span>
                </span>
              </div>

              {results.reduced && (
                <p className="dim mt-3 text-center text-[0.68rem]">{t("game.reduced")}</p>
              )}

              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setResults(null);
                    setPhase("intro");
                  }}
                  className="btn btn-royal"
                >
                  {t("game.again")}
                </button>
                <Link href="/vault" className="btn btn-ghost">
                  {t("game.back")}
                </Link>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <RankUpOverlay toRankKey={rankUp} onClose={() => setRankUp(null)} />
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[rgba(201,162,77,0.18)] bg-[rgba(5,8,15,0.45)] px-3 py-2">
      <dt className="text-[0.62rem] uppercase tracking-[0.16em] text-[var(--text-dim)]">{label}</dt>
      <dd className="tabular display mt-0.5 text-lg text-[var(--parchment)]">{value}</dd>
    </div>
  );
}

/** A four-sided crystal, the app's recurring shape. */
function drawCrystal(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  stroke: string,
  fill: string,
  alpha = 1,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x + size * 0.62, y);
  ctx.lineTo(x, y + size);
  ctx.lineTo(x - size * 0.62, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.restore();
}
