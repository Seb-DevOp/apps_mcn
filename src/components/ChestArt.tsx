"use client";

import { motion } from "framer-motion";
import type { Rarity } from "@/lib/content/items";

/**
 * The chest, drawn rather than photographed.
 *
 * Every tier uses the same construction — body, gilded bands, hinges, a crystal
 * set in the lid, ornaments — but the palette, the number of ornaments and the
 * energy around it come from the chest definition. That is what makes ranking up
 * legible at a glance: it is visibly the same chest, made greater.
 */

export interface ChestVisual {
  body: string;
  trim: string;
  crystal: string;
  ambient: string;
  ornaments: number;
}

export type ChestState = "closed" | "opening" | "open";

const RARITY_INTENSITY: Record<Rarity, number> = {
  COMMON: 0.35,
  UNCOMMON: 0.5,
  RARE: 0.7,
  EPIC: 0.85,
  MYTHIC: 1,
  LEGENDARY: 1.2,
};

export function ChestArt({
  visual,
  tier,
  state = "closed",
  rarity = "COMMON",
  size = 220,
}: {
  visual: ChestVisual;
  tier: number;
  state?: ChestState;
  rarity?: Rarity;
  size?: number;
}) {
  const opening = state !== "closed";
  const intensity = RARITY_INTENSITY[rarity];
  const particles = Math.round(6 + intensity * 14);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {/* Chamber glow — grows with the tier, erupts on open. */}
      <motion.div
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle at 50% 58%, ${visual.crystal}${opening ? "88" : "44"}, transparent 68%)`,
          filter: "blur(14px)",
        }}
        animate={{ scale: opening ? [1, 1.35, 1.15] : [1, 1.06, 1], opacity: opening ? 1 : 0.75 }}
        transition={{ duration: opening ? 1.1 : 4, repeat: opening ? 0 : Infinity, ease: "easeInOut" }}
      />

      <motion.svg
        viewBox="0 0 200 180"
        width={size}
        height={size}
        className="relative"
        animate={{ scale: opening ? 1.06 : 1 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      >
        <defs>
          <linearGradient id={`body-${tier}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={visual.ambient} />
            <stop offset="100%" stopColor={visual.body} />
          </linearGradient>
          <linearGradient id={`trim-${tier}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffeec0" />
            <stop offset="45%" stopColor={visual.trim} />
            <stop offset="100%" stopColor="#7a5c22" />
          </linearGradient>
          <radialGradient id={`gem-${tier}`}>
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="35%" stopColor={visual.crystal} />
            <stop offset="100%" stopColor="#0b1c46" />
          </radialGradient>
          <filter id={`glow-${tier}`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Light escaping the chest once the lid lifts. */}
        {opening && (
          <motion.polygon
            points="60,104 140,104 178,16 22,16"
            fill={visual.crystal}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.5 * intensity, 0.28 * intensity] }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            style={{ filter: "blur(9px)" }}
          />
        )}

        {/* Rising motes of Vault light. */}
        {opening &&
          Array.from({ length: particles }).map((_, index) => {
            const x = 66 + ((index * 37) % 68);
            const delay = 0.12 + (index % 7) * 0.07;
            return (
              <motion.circle
                key={index}
                cx={x}
                cy={104}
                r={index % 4 === 0 ? 2.4 : 1.5}
                fill={index % 5 === 0 ? "#ffe6b0" : visual.crystal}
                initial={{ opacity: 0, y: 0 }}
                animate={{ opacity: [0, 1, 0], y: -(46 + (index % 5) * 16) }}
                transition={{ duration: 1.5 + (index % 4) * 0.25, delay, ease: "easeOut" }}
              />
            );
          })}

        {/* --- Lid: a shallow barrel, hinged at the back edge -------------- */}
        <motion.g
          style={{ originX: "34px", originY: "104px" }}
          animate={opening ? { rotate: -24, y: -6 } : { rotate: 0, y: 0 }}
          transition={{ type: "spring", stiffness: 90, damping: 13, delay: 0.25 }}
        >
          <path
            d="M34 104 V86 C34 58 166 58 166 86 V104 Z"
            fill={`url(#body-${tier})`}
            stroke={`url(#trim-${tier})`}
            strokeWidth="3"
          />
          {/* Gilded band along the lip. */}
          <path d="M34 100 H166" stroke={`url(#trim-${tier})`} strokeWidth="4" opacity="0.9" />

          {/* Straps over the curve — one more on every tier. */}
          {Array.from({ length: visual.ornaments }).map((_, index) => {
            const step = 132 / (visual.ornaments + 1);
            const x = 34 + step * (index + 1);
            // Follow the barrel so a strap never floats off the lid.
            const topY = 88 - 24 * Math.sin((Math.PI * (x - 34)) / 132);
            return (
              <path
                key={index}
                d={`M${x.toFixed(1)} 102 V${topY.toFixed(1)}`}
                stroke={visual.trim}
                strokeWidth="2"
                opacity="0.5"
              />
            );
          })}

          {/* Crystal set into the lid. */}
          <motion.g
            filter={`url(#glow-${tier})`}
            animate={{ opacity: opening ? [0.8, 1, 0.95] : [0.7, 1, 0.7] }}
            transition={{ duration: opening ? 1 : 3.2, repeat: opening ? 0 : Infinity }}
          >
            <polygon
              points="100,66 109,84 100,100 91,84"
              fill={`url(#gem-${tier})`}
              stroke={visual.trim}
              strokeWidth="1.6"
            />
          </motion.g>
        </motion.g>

        {/* --- Body ------------------------------------------------------ */}
        <path
          d="M34 104 H166 V148 A6 6 0 0 1 160 154 H40 A6 6 0 0 1 34 148 Z"
          fill={`url(#body-${tier})`}
          stroke={`url(#trim-${tier})`}
          strokeWidth="3"
        />
        <rect x="34" y="106" width="132" height="5" fill={`url(#trim-${tier})`} opacity="0.85" />
        <rect x="34" y="139" width="132" height="4" fill={`url(#trim-${tier})`} opacity="0.6" />

        {/* Lock plate — dark and shut when closed, open and lit after. */}
        <g>
          <rect
            x="88"
            y="102"
            width="24"
            height="24"
            rx="4"
            fill="#0a0f1f"
            stroke={`url(#trim-${tier})`}
            strokeWidth="2"
          />
          <motion.circle
            cx="100"
            cy="114"
            r="4.2"
            fill={visual.crystal}
            animate={{ opacity: opening ? [1, 0.4] : [0.45, 0.9, 0.45] }}
            transition={{ duration: opening ? 0.6 : 3, repeat: opening ? 0 : Infinity }}
          />
        </g>

        {/* Ancient symbols wake up on the higher chests. */}
        {tier >= 3 && (
          <motion.g
            stroke={visual.crystal}
            strokeWidth="1.2"
            fill="none"
            opacity={0.7}
            animate={{ opacity: opening ? [0.3, 0.9, 0.6] : [0.25, 0.6, 0.25] }}
            transition={{ duration: 2.6, repeat: opening ? 0 : Infinity }}
          >
            <circle cx="54" cy="126" r="6" />
            <path d="M54 120 v12 M48 126 h12" />
            <circle cx="146" cy="126" r="6" />
            <path d="M142 122 l8 8 M150 122 l-8 8" />
          </motion.g>
        )}

        {/* Feet */}
        <rect x="40" y="154" width="16" height="7" rx="2" fill={visual.trim} opacity="0.75" />
        <rect x="144" y="154" width="16" height="7" rx="2" fill={visual.trim} opacity="0.75" />
      </motion.svg>
    </div>
  );
}
