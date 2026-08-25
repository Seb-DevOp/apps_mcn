"use client";

import { motion } from "framer-motion";
import type { EnemyKind } from "@/lib/content/idle";

/**
 * WHAT THE CAT IS FIGHTING
 *
 * Ten creatures, one per chamber it belongs to, so the Vault stops being one
 * room with different wallpaper. Drawn in the same hand as the cat and the
 * backdrops — but deliberately simpler than the cat, because the cat is the
 * thing being dressed and watched, and an enemy of equal detail would compete
 * with it for the eye.
 *
 * Every creature is the same three states: ordinary, a Guardian (bigger, red,
 * horned), and an Elite (cyan, crowned, glowing). Those are drawn once around
 * the shapes rather than ten times inside them, so adding an eleventh creature
 * is one function and nothing else.
 */

export function EnemyCanvas({
  kind,
  isBoss,
  elite,
  recoil,
}: {
  kind: EnemyKind;
  isBoss: boolean;
  elite: boolean;
  recoil: number;
}) {
  const tint = elite ? "#37d5ff" : isBoss ? "#e0603f" : TINTS[kind];
  const dark = elite ? "#0f4a5e" : isBoss ? "#6b2415" : DARKS[kind];
  const eyes = elite ? "#ffffff" : isBoss ? "#ffd76a" : "#ff8e5e";

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
        style={{
          originX: "60px",
          originY: "90px",
          filter: elite ? "drop-shadow(0 0 10px rgba(55,213,255,0.8))" : undefined,
        }}
      >
        <ellipse cx="60" cy="142" rx="34" ry="7" fill="#000" opacity="0.42" />

        {SHAPES[kind]({ tint, dark, eyes })}

        {/* A Guardian's horns and an Elite's crown are drawn once, around the
            creature, rather than ten times inside each one. */}
        {isBoss && (
          <>
            <path d="M38 42 C22 36 14 24 18 10" stroke={tint} strokeWidth="11" strokeLinecap="round" fill="none" />
            <path d="M82 42 C98 36 106 24 102 10" stroke={tint} strokeWidth="11" strokeLinecap="round" fill="none" />
            <path d="M18 14 L14 4 L26 10 Z" fill={tint} />
            <path d="M102 14 L106 4 L94 10 Z" fill={tint} />
          </>
        )}
        {elite && (
          <path d="M30 26 L24 2 L44 16 L60 -4 L76 16 L96 2 L90 26 Z" fill={tint} opacity="0.9" />
        )}
      </motion.g>
    </motion.svg>
  );
}

// ---------------------------------------------------------------------------

interface Paint {
  tint: string;
  dark: string;
  eyes: string;
}

const TINTS: Record<EnemyKind, string> = {
  wraith: "#5a4f7a",
  crawler: "#4a5c3a",
  cinder: "#a8452a",
  shard: "#3f7d9c",
  tome: "#7a5f3a",
  bloom: "#3f7a52",
  void: "#241d3d",
  sentinel: "#5a5566",
  bones: "#8a8578",
  storm: "#40566e",
};

const DARKS: Record<EnemyKind, string> = {
  wraith: "#332c4a",
  crawler: "#2b3622",
  cinder: "#5e2214",
  shard: "#22485c",
  tome: "#463620",
  bloom: "#22452e",
  void: "#0e0a1c",
  sentinel: "#33303c",
  bones: "#565046",
  storm: "#243646",
};

/** Two eyes and a jagged mouth — the parts every creature shares. */
function Face({
  eyes,
  cx = 60,
  cy = 72,
  spread = 14,
  mouth = 102,
}: Paint & { cx?: number; cy?: number; spread?: number; mouth?: number }) {
  return (
    <>
      <path
        d={`M${cx - 22} ${cy - 12} l16 6 M${cx + 22} ${cy - 12} l-16 6`}
        stroke="#0a0710"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <motion.g
        animate={{ scaleY: [1, 0.15, 1] }}
        transition={{ duration: 0.22, repeat: Infinity, repeatDelay: 3.4 }}
        style={{ originY: `${cy}px` }}
      >
        <ellipse cx={cx - spread} cy={cy} rx="7" ry="8.5" fill={eyes} />
        <ellipse cx={cx + spread} cy={cy} rx="7" ry="8.5" fill={eyes} />
      </motion.g>
      <path
        d={`M${cx - 18} ${mouth} l7 -7 l7 7 l7 -7 l7 7 l7 -7`}
        stroke="#0a0710"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

const SHAPES: Record<EnemyKind, (paint: Paint) => React.ReactNode> = {
  /** A hanging sheet with nothing under it. */
  wraith: (paint) => (
    <>
      <path
        d="M60 30 C88 30 100 56 96 88 C94 108 92 118 96 132 L84 124 L72 134 L60 124 L48 134 L36 124 L24 132 C28 118 26 108 24 88 C20 56 32 30 60 30 Z"
        fill={paint.tint}
        opacity="0.92"
      />
      <Face {...paint} />
    </>
  ),

  /** Low, wide, and with too many legs. */
  crawler: (paint) => (
    <>
      {[26, 42, 78, 94].map((x, index) => (
        <path
          key={x}
          d={`M${x} 96 L${x + (index < 2 ? -14 : 14)} 118 L${x + (index < 2 ? -10 : 10)} 134`}
          stroke={paint.dark}
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
        />
      ))}
      <ellipse cx="60" cy="92" rx="44" ry="34" fill={paint.tint} />
      <ellipse cx="60" cy="82" rx="30" ry="20" fill={paint.dark} opacity="0.45" />
      <Face {...paint} cy={86} spread={16} mouth={110} />
    </>
  ),

  /** A flame with something awake inside it. */
  cinder: (paint) => (
    <>
      <path
        d="M60 18 C78 44 96 58 94 88 C92 118 78 134 60 134 C42 134 28 118 26 88 C24 58 42 44 60 18 Z"
        fill={paint.tint}
      />
      <path
        d="M60 52 C70 68 78 76 77 94 C76 112 69 122 60 122 C51 122 44 112 43 94 C42 76 50 68 60 52 Z"
        fill="#ffb055"
        opacity="0.35"
      />
      <Face {...paint} cy={80} mouth={108} />
    </>
  ),

  /** Angular, and it does not soften anywhere. */
  shard: (paint) => (
    <>
      <path d="M60 16 L96 62 L84 132 L36 132 L24 62 Z" fill={paint.tint} />
      <path d="M60 16 L60 132 M24 62 L96 62" stroke={paint.dark} strokeWidth="3" opacity="0.6" />
      <path d="M18 92 l-12 22 l16 -6 Z" fill={paint.tint} opacity="0.8" />
      <path d="M102 92 l12 22 l-16 -6 Z" fill={paint.tint} opacity="0.8" />
      <Face {...paint} cy={76} mouth={106} />
    </>
  ),

  /** A book that reads back. */
  tome: (paint) => (
    <>
      <path d="M20 40 L60 30 L100 40 L100 124 L60 134 L20 124 Z" fill={paint.tint} />
      <path d="M60 30 L60 134" stroke={paint.dark} strokeWidth="4" />
      <path d="M28 52 h24 M68 52 h24 M28 68 h24 M68 68 h24" stroke={paint.dark} strokeWidth="2.5" opacity="0.6" />
      <Face {...paint} cy={92} spread={17} mouth={118} />
    </>
  ),

  /** All mouth, on a stalk. */
  bloom: (paint) => (
    <>
      <path d="M60 134 C58 112 62 100 60 88" stroke={paint.dark} strokeWidth="9" strokeLinecap="round" fill="none" />
      <path d="M60 118 c-18 -4 -26 -14 -26 -14 s16 -4 26 6" fill={paint.dark} opacity="0.8" />
      <path d="M60 108 c18 -4 26 -14 26 -14 s-16 -4 -26 6" fill={paint.dark} opacity="0.8" />
      {[0, 60, 120, 180, 240, 300].map((angle) => (
        <ellipse
          key={angle}
          cx="60"
          cy="34"
          rx="12"
          ry="26"
          fill={paint.tint}
          opacity="0.85"
          transform={`rotate(${angle} 60 62)`}
        />
      ))}
      <circle cx="60" cy="62" r="20" fill={paint.dark} />
      <Face {...paint} cy={58} spread={9} mouth={78} />
    </>
  ),

  /** A hole with an opinion. */
  void: (paint) => (
    <>
      {[20, 36, 84, 100].map((x, index) => (
        <path
          key={x}
          d={`M${x} 88 C${x + (index < 2 ? -10 : 10)} 108 ${x + (index < 2 ? -4 : 4)} 122 ${x + (index < 2 ? -14 : 14)} 136`}
          stroke={paint.tint}
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
          opacity="0.7"
        />
      ))}
      <circle cx="60" cy="80" r="42" fill={paint.dark} />
      <circle cx="60" cy="80" r="42" fill="none" stroke={paint.tint} strokeWidth="4" opacity="0.8" />
      <circle cx="60" cy="80" r="26" fill="#05030c" />
      <Face {...paint} cy={74} spread={12} mouth={100} />
    </>
  ),

  /** Armour with nobody in it. */
  sentinel: (paint) => (
    <>
      <rect x="26" y="44" width="68" height="88" rx="10" fill={paint.tint} />
      <rect x="16" y="52" width="14" height="46" rx="7" fill={paint.dark} />
      <rect x="90" y="52" width="14" height="46" rx="7" fill={paint.dark} />
      <path d="M34 44 L60 26 L86 44 Z" fill={paint.dark} />
      <path d="M60 60 v66" stroke={paint.dark} strokeWidth="3" opacity="0.7" />
      <Face {...paint} cy={78} spread={15} mouth={112} />
    </>
  ),

  /** A skull that kept its ribs. */
  bones: (paint) => (
    <>
      <path d="M40 108 h40 M36 120 h48 M42 132 h36" stroke={paint.tint} strokeWidth="6" strokeLinecap="round" />
      <path d="M60 96 v42" stroke={paint.dark} strokeWidth="7" strokeLinecap="round" />
      <path
        d="M60 26 C88 26 100 48 98 70 C96 88 84 96 60 96 C36 96 24 88 22 70 C20 48 32 26 60 26 Z"
        fill={paint.tint}
      />
      <path d="M52 82 h16" stroke={paint.dark} strokeWidth="3" />
      <Face {...paint} cy={62} spread={15} mouth={88} />
    </>
  ),

  /** Weather, annoyed. */
  storm: (paint) => (
    <>
      <path d="M56 96 l-16 32 h16 l-10 24 l34 -40 h-18 l14 -20 z" fill="#cfe8f0" opacity="0.55" />
      <ellipse cx="42" cy="72" rx="28" ry="22" fill={paint.tint} />
      <ellipse cx="80" cy="70" rx="26" ry="20" fill={paint.tint} />
      <ellipse cx="60" cy="58" rx="30" ry="24" fill={paint.tint} />
      <ellipse cx="60" cy="72" rx="40" ry="20" fill={paint.dark} opacity="0.35" />
      <Face {...paint} cy={66} spread={16} mouth={92} />
    </>
  ),
};
