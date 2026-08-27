"use client";

import { memo } from "react";
import { motion } from "framer-motion";

/**
 * WHAT A CAT STANDS AGAINST
 *
 * Five backdrops, drawn rather than photographed, and all of them moving. A
 * still picture behind a breathing cat reads as a mistake — the eye takes the
 * cat for a sticker on a wall — so every one of these has something with its own
 * slow clock: stars that drift, ribbons that fold, embers that climb.
 *
 * Positions are fixed rather than random. These render on the server too, and a
 * random star is a hydration mismatch.
 *
 * Each is a full-bleed layer meant to sit behind a cat inside a panel, so they
 * are drawn on a 200x140 canvas stretched to fill, never letterboxed: a backdrop
 * with bars down the side is a window, not a wall.
 */
export const ProfileBackdrop = memo(function ProfileBackdrop({ backdrop }: { backdrop: string }) {
  const art = ART[backdrop];
  if (!art) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
      <svg
        viewBox="0 0 200 140"
        preserveAspectRatio="xMidYMid slice"
        width="100%"
        height="100%"
        aria-hidden
      >
        {art}
      </svg>
    </div>
  );
});

/** Evenly scattered, never randomly: the same sky on the server and the client. */
function scatter(count: number, seed: number) {
  return Array.from({ length: count }, (_, index) => {
    const a = (index * 9301 + seed * 49297) % 233280;
    const b = (index * 4523 + seed * 7919) % 104729;
    return { x: (a / 233280) * 200, y: (b / 104729) * 140, at: (index % 7) * 0.42 };
  });
}

const ART: Record<string, React.ReactNode> = {
  // --- Starfield ----------------------------------------------------------
  stars: (
    <>
      <rect width="200" height="140" fill="#070c1c" />
      <rect width="200" height="140" fill="url(#bd-stars)" />
      <defs>
        <radialGradient id="bd-stars" cx="50%" cy="30%">
          <stop offset="0%" stopColor="#1b2a5e" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#070c1c" stopOpacity="0" />
        </radialGradient>
      </defs>
      {scatter(34, 3).map((star, index) => (
        <motion.circle
          key={index}
          cx={star.x}
          cy={star.y}
          r={index % 5 === 0 ? 1.5 : 0.8}
          fill="#e9f2ff"
          animate={{ opacity: [0.15, 0.95, 0.15] }}
          transition={{ duration: 2.4 + (index % 4) * 0.7, repeat: Infinity, delay: star.at }}
        />
      ))}
      {/* One that falls, rarely. A sky where nothing ever happens is wallpaper. */}
      <motion.line
        x1="20"
        y1="10"
        x2="52"
        y2="30"
        stroke="#ffffff"
        strokeWidth="1"
        strokeLinecap="round"
        animate={{ opacity: [0, 0.9, 0], x: [0, 90], y: [0, 55] }}
        transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 6.5, ease: "easeIn" }}
      />
    </>
  ),

  // --- Aurora -------------------------------------------------------------
  aurora: (
    <>
      <rect width="200" height="140" fill="#04121a" />
      <defs>
        <linearGradient id="bd-aur1" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#3ef0b0" stopOpacity="0" />
          <stop offset="50%" stopColor="#3ef0b0" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#5ab9ff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="bd-aur2" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#a06bff" stopOpacity="0" />
          <stop offset="50%" stopColor="#a06bff" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#3ef0b0" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[
        { d: "M-20 60 C40 20 120 90 220 40 L220 90 C120 130 40 70 -20 100 Z", fill: "url(#bd-aur1)", dur: 9 },
        { d: "M-20 90 C50 55 130 115 220 70 L220 120 C130 150 50 100 -20 125 Z", fill: "url(#bd-aur2)", dur: 12 },
      ].map((ribbon, index) => (
        <motion.path
          key={index}
          d={ribbon.d}
          fill={ribbon.fill}
          animate={{ x: [-14, 14, -14], scaleY: [1, 1.18, 1], opacity: [0.55, 0.95, 0.55] }}
          transition={{ duration: ribbon.dur, repeat: Infinity, ease: "easeInOut" }}
          style={{ originY: "70px" }}
        />
      ))}
      {scatter(14, 8).map((star, index) => (
        <motion.circle
          key={index}
          cx={star.x}
          cy={star.y * 0.5}
          r="0.9"
          fill="#dff6ff"
          animate={{ opacity: [0.2, 0.8, 0.2] }}
          transition={{ duration: 3.2, repeat: Infinity, delay: star.at }}
        />
      ))}
    </>
  ),

  // --- Embers -------------------------------------------------------------
  embers: (
    <>
      <rect width="200" height="140" fill="#1a0a08" />
      <defs>
        <radialGradient id="bd-ember" cx="50%" cy="100%">
          <stop offset="0%" stopColor="#ff7a3d" stopOpacity="0.55" />
          <stop offset="60%" stopColor="#8e2b2b" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#1a0a08" stopOpacity="0" />
        </radialGradient>
      </defs>
      <motion.rect
        width="200"
        height="140"
        fill="url(#bd-ember)"
        animate={{ opacity: [0.65, 1, 0.7, 0.95] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
      />
      {scatter(22, 5).map((spark, index) => (
        <motion.circle
          key={index}
          cx={spark.x}
          cy={140}
          r={index % 4 === 0 ? 1.6 : 1}
          fill={index % 3 === 0 ? "#ffc25e" : "#ff7a3d"}
          animate={{ y: [0, -150], opacity: [0, 0.95, 0], x: [0, index % 2 ? 12 : -12] }}
          transition={{
            duration: 4 + (index % 5),
            repeat: Infinity,
            delay: spark.at * 1.6,
            ease: "easeOut",
          }}
        />
      ))}
    </>
  ),

  // --- Abyss --------------------------------------------------------------
  abyss: (
    <>
      <rect width="200" height="140" fill="#04101f" />
      <defs>
        <radialGradient id="bd-abyss" cx="50%" cy="10%">
          <stop offset="0%" stopColor="#1d5f8a" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#04101f" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="200" height="140" fill="url(#bd-abyss)" />
      {/* Light falling through water, three shafts on different clocks. */}
      {[36, 96, 152].map((x, index) => (
        <motion.path
          key={x}
          d={`M${x - 10} -10 L${x + 10} -10 L${x + 26} 150 L${x - 26} 150 Z`}
          fill="#7fd4ff"
          animate={{ opacity: [0.05, 0.16, 0.05], x: [-6, 6, -6] }}
          transition={{ duration: 7 + index * 2, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
      {scatter(18, 11).map((bubble, index) => (
        <motion.circle
          key={index}
          cx={bubble.x}
          cy={150}
          r={0.8 + (index % 3) * 0.7}
          fill="none"
          stroke="#9fe4ff"
          strokeWidth="0.6"
          animate={{ y: [0, -165], opacity: [0, 0.7, 0], x: [0, index % 2 ? 8 : -8] }}
          transition={{ duration: 7 + (index % 4) * 1.5, repeat: Infinity, delay: bubble.at * 2 }}
        />
      ))}
    </>
  ),

  // --- Vault gold ---------------------------------------------------------
  gilded: (
    <>
      <rect width="200" height="140" fill="#150f04" />
      <defs>
        <linearGradient id="bd-gild" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3a2a08" />
          <stop offset="50%" stopColor="#6d4f12" />
          <stop offset="100%" stopColor="#2a1d06" />
        </linearGradient>
        <linearGradient id="bd-sheen" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffe9a8" stopOpacity="0" />
          <stop offset="50%" stopColor="#ffe9a8" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#ffe9a8" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="200" height="140" fill="url(#bd-gild)" />
      {/* The coins are still; the light that crosses them is not. */}
      {scatter(26, 17).map((coin, index) => (
        <circle
          key={index}
          cx={coin.x}
          cy={coin.y}
          r={2.5 + (index % 3)}
          fill="#c9a24d"
          opacity={0.35 + (index % 3) * 0.12}
        />
      ))}
      <motion.rect
        x="-80"
        y="0"
        width="70"
        height="140"
        fill="url(#bd-sheen)"
        animate={{ x: [-80, 220] }}
        transition={{ duration: 4.5, repeat: Infinity, repeatDelay: 1.8, ease: "easeInOut" }}
      />
    </>
  ),
};
