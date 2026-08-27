"use client";

import { memo, useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  RARITY_STYLE,
  SKIN_BY_KEY,
  weaponIconFor,
  type Slot,
  type Rarity,
  type WeaponKind,
} from "@/lib/content/idle";

/**
 * The cat, wearing what it found.
 *
 * Drawn rather than sourced. Every free asset pack offering modular equipment is
 * pixel-art humans; bolting one onto a painted Maine Coon would read as two
 * different games. Drawing the pieces means they are consistent by construction,
 * carry no licence, and a new tier is a path rather than a commission.
 *
 * Layer order is the whole trick: body, then armour, then the mane over the
 * armour's collar, then the head. Plate that tucks under the ruff looks worn;
 * plate painted on top looks like a sticker.
 *
 * Each slot is a small function taking a shape and a colour — the shape from how
 * deep the piece was found, the colour from its rarity. A cat therefore changes
 * silhouette as it descends, not just palette.
 */

export interface WornPiece {
  slot: Slot;
  shape: string;
  rarity: Rarity;
  /** Only ever set on the hands: which of the four weapons is being held. */
  weapon?: WeaponKind;
}

/**
 * Memoised: the arena re-renders a dozen times a second and this cat changes
 * only when the player equips something. Reconciling sixty paths per frame for
 * a drawing that never moved was most of what the phone was doing.
 */
export const CatCanvas = memo(function CatCanvas({
  worn,
  size = 260,
  breathing = true,
  skin = "classic",
}: {
  worn: WornPiece[];
  size?: number;
  breathing?: boolean;
  /** Which coat. Cosmetic only — no drawing changes, only its five colours. */
  skin?: string;
}) {
  // The coat is five colours and nothing else. Every path below reads from these,
  // so a new coat is a row in a table rather than a second drawing to keep in step
  // with the first whenever a piece of armour moves.
  const coat = SKIN_BY_KEY[skin] ?? SKIN_BY_KEY.classic;
  const FUR = coat.fur;
  const FUR_DARK = coat.furDark;
  const FUR_DEEP = coat.furDeep;
  const FUR_LIGHT = coat.furLight;
  const EAR_PINK = coat.ear;
  const bySlot = new Map(worn.map((piece) => [piece.slot, piece]));
  const colour = (slot: Slot) => {
    const piece = bySlot.get(slot);
    return piece ? RARITY_STYLE[piece.rarity].color : null;
  };
  const shape = (slot: Slot) => bySlot.get(slot)?.shape ?? null;

  return (
    <motion.svg
      viewBox="0 0 200 268"
      width={size}
      height={(size * 268) / 200}
      animate={breathing ? { scale: [1, 1.015, 1] } : undefined}
      transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
      aria-hidden
    >
      <defs>
        <radialGradient id="cat-ground" cx="50%" cy="50%">
          <stop offset="0%" stopColor="#4f93ff" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#4f93ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="cat-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f3d68f" />
          <stop offset="100%" stopColor="#a97f31" />
        </linearGradient>
        {/* The three filters and gradients the animated coats need. Defined
            unconditionally: they cost nothing unless something references them,
            and a coat that has to remember to bring its own defs is a coat that
            will one day forget. */}
        <filter id="cat-haze" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <radialGradient id="cat-shine" cx="50%" cy="45%">
          <stop offset="0%" stopColor="#ffe9a8" stopOpacity="0.55" />
          <stop offset="60%" stopColor="#f3d68f" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#f3d68f" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="cat-fire" cx="50%" cy="70%">
          <stop offset="0%" stopColor="#ff9d3d" stopOpacity="0.5" />
          <stop offset="55%" stopColor="#e0432a" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#8e2b2b" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="cat-psychic" cx="50%" cy="50%">
          <stop offset="0%" stopColor="#b98cff" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#4f93ff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Light pooling underfoot, so the cat stands on something. */}
      <ellipse cx="100" cy="252" rx="62" ry="11" fill="url(#cat-ground)" />

      {/* Auras go behind everything, including the tail. */}
      {coat.effect === "haze" && <Haze colour={coat.furLight} />}
      {coat.effect === "shine" && <Shine />}
      {coat.effect === "psychic" && <Psychic />}
      {coat.effect === "halo" && <Wings />}
      {coat.effect === "horns" && <Fire />}
      {coat.effect === "horns" && <DevilTail />}

      {/* --- Tail, sweeping up behind ------------------------------------ */}
      <motion.g
        animate={{ rotate: [0, 4, 0] }}
        style={{ originX: "72px", originY: "212px" }}
        transition={{ duration: 4.6, repeat: Infinity, ease: "easeInOut" }}
      >
        <path
          d="M74 214 C36 212 18 176 30 148 C36 134 52 134 54 148"
          stroke={FUR_DEEP}
          strokeWidth="19"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M74 214 C40 212 24 178 34 152"
          stroke={FUR_DARK}
          strokeWidth="9"
          strokeLinecap="round"
          fill="none"
          opacity="0.7"
        />
      </motion.g>

      {/* --- Hind legs ---------------------------------------------------- */}
      <rect x="71" y="198" width="24" height="46" rx="12" fill={FUR_DARK} />
      <rect x="105" y="198" width="24" height="46" rx="12" fill={FUR_DARK} />
      <ellipse cx="83" cy="245" rx="15" ry="7" fill={FUR} />
      <ellipse cx="117" cy="245" rx="15" ry="7" fill={FUR} />
      {shape("LEGS") && <Legs shape={shape("LEGS")!} colour={colour("LEGS")!} />}

      {/* --- Barrel of the body ------------------------------------------- */}
      <path
        d="M64 140 C59 168 58 196 67 212 C82 224 118 224 133 212 C142 196 141 168 136 140 C122 130 78 130 64 140 Z"
        fill={FUR}
      />
      <path
        d="M84 146 C80 172 80 194 84 206 C94 212 106 212 116 206 C120 194 120 172 116 146 Z"
        fill={FUR_LIGHT}
        opacity="0.42"
      />
      {shape("CHEST") && <Chest shape={shape("CHEST")!} colour={colour("CHEST")!} />}

      {/* --- Forelegs ----------------------------------------------------- */}
      <path d="M62 148 C51 166 48 182 50 196" stroke={FUR_DARK} strokeWidth="18" strokeLinecap="round" fill="none" />
      <path d="M138 148 C149 166 152 182 150 196" stroke={FUR_DARK} strokeWidth="18" strokeLinecap="round" fill="none" />
      <ellipse cx="50" cy="201" rx="12" ry="8" fill={FUR} />
      <ellipse cx="150" cy="201" rx="12" ry="8" fill={FUR} />
      {shape("HANDS") && <Hands shape={shape("HANDS")!} colour={colour("HANDS")!} />}
      {/*
        The gauntlet is drawn; the weapon in it is the photograph.

        It used to be a drawn stand-in of the same kind, which agreed with the
        bag about sword-or-staff and about nothing else — so a Sovereign blade
        was on fire in the bag and a grey stick in the cat's paw. There is one
        picture of each weapon now and both screens use it.
      */}
      {bySlot.get("HANDS")?.weapon && (
        <image
          href={weaponIconFor(bySlot.get("HANDS")!.weapon!, bySlot.get("HANDS")!.rarity)}
          x="120"
          y="126"
          width="86"
          height="86"
          preserveAspectRatio="xMidYMid meet"
        />
      )}

      {shape("SHOULDERS") && <Shoulders shape={shape("SHOULDERS")!} colour={colour("SHOULDERS")!} />}

      {/* --- The ruff: what makes a Maine Coon a Maine Coon --------------- */}
      <path
        d="M52 112 Q62 140 72 128 Q80 150 92 138 Q100 156 108 138 Q120 150 128 128 Q138 140 148 112 Q100 94 52 112 Z"
        fill={FUR_LIGHT}
      />
      <path
        d="M62 114 Q70 134 78 126 M122 126 Q130 134 138 114"
        stroke={FUR}
        strokeWidth="2"
        fill="none"
        opacity="0.6"
      />

      {shape("TRINKET") && <Trinket shape={shape("TRINKET")!} colour={colour("TRINKET")!} />}

      {/* --- Head ---------------------------------------------------------- */}
      <g>
        {/* Ears, with the lynx tips the breed is known for. */}
        <path d="M66 58 L57 16 L93 42 Z" fill={FUR_DARK} />
        <path d="M134 58 L143 16 L107 42 Z" fill={FUR_DARK} />
        <path d="M71 54 L66 30 L85 44 Z" fill={EAR_PINK} opacity="0.75" />
        <path d="M129 54 L134 30 L115 44 Z" fill={EAR_PINK} opacity="0.75" />
        <path d="M57 16 L52 4 M143 16 L148 4" stroke={FUR_LIGHT} strokeWidth="2.6" strokeLinecap="round" />

        {/* Cheek tufts, then the skull over them. */}
        <path d="M64 88 Q46 96 48 112 Q62 108 70 96 Z" fill={FUR_LIGHT} />
        <path d="M136 88 Q154 96 152 112 Q138 108 130 96 Z" fill={FUR_LIGHT} />

        <ellipse cx="100" cy="78" rx="42" ry="37" fill={FUR} />
        <ellipse cx="100" cy="94" rx="24" ry="17" fill={FUR_LIGHT} opacity="0.6" />

        {/* Forehead tabby, the breed's own signature. */}
        <path d="M100 44 v13 M87 46 l4 12 M113 46 l-4 12" stroke={FUR_DEEP} strokeWidth="2.6" strokeLinecap="round" />

        {/* Eyes: the one bright thing on the whole figure. */}
        <ellipse cx="85" cy="76" rx="8" ry="9.5" fill={coat.eyes} />
        <ellipse cx="115" cy="76" rx="8" ry="9.5" fill={coat.eyes} />
        <ellipse cx="85" cy="76" rx="2.8" ry="7.5" fill="#12200f" />
        <ellipse cx="115" cy="76" rx="2.8" ry="7.5" fill="#12200f" />
        <circle cx="87.5" cy="72" r="1.8" fill="#ffffff" opacity="0.8" />
        <circle cx="117.5" cy="72" r="1.8" fill="#ffffff" opacity="0.8" />

        <path d="M95 90 h10 l-5 6 Z" fill={EAR_PINK} />
        <path d="M100 96 v4 M100 100 q-7 5 -13 2 M100 100 q7 5 13 2" stroke={FUR_DEEP} strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M78 94 l-22 -6 M78 100 l-22 3 M122 94 l22 -6 M122 100 l22 3" stroke={FUR_LIGHT} strokeWidth="1.5" strokeLinecap="round" opacity="0.85" />
      </g>

      {shape("HEAD") && <Head shape={shape("HEAD")!} colour={colour("HEAD")!} />}

      {/* And what the coat itself wears, over the armour: a halo sits above a
          helm, and horns come through it. */}
      {coat.effect === "halo" && <Halo />}
      {coat.effect === "horns" && <Horns />}
      {coat.effect === "halo" && <Motes colour="#fff6d8" rising />}
      {coat.effect === "horns" && <Fire front />}
      {coat.effect === "horns" && <Motes colour="#ff7a3d" rising />}
      {coat.effect === "shine" && <Sparkles />}
      {coat.effect === "psychic" && <Motes colour="#c8a8ff" />}
    </motion.svg>
  );
});

// ---------------------------------------------------------------------------
// What two coats wear that no other coat does
// ---------------------------------------------------------------------------

/** Feathered wings, beating slowly enough to be watched rather than noticed. */
function Wings() {
  const feather = (mirror: boolean) => {
    const s = mirror ? -1 : 1;
    return (
      // Wider than the cat and lifted to shoulder height: behind the body at
      // their old size they read as a pale smudge rather than as wings.
      <g transform={`translate(100 142) scale(${s * 1.25} 1.2)`}>
        <path
          d="M8 -8 C34 -30 62 -26 76 -6 C60 -12 44 -8 34 2 C52 2 66 10 74 24 C56 16 38 16 24 26 C22 12 16 0 8 -8 Z"
          fill="#fdfaf2"
          opacity="0.94"
        />
        <path
          d="M14 -4 C36 -20 56 -18 68 -4"
          stroke="#d9cfae"
          strokeWidth="1.6"
          fill="none"
          opacity="0.8"
        />
      </g>
    );
  };

  return (
    <motion.g
      // A beat, not a breath: the whole wing swings from the shoulder as well as
      // stretching, which is what makes it read as a wing rather than a shape
      // that is being scaled.
      animate={{ scaleY: [1, 0.82, 1], scaleX: [1, 1.08, 1], rotate: [-4, 5, -4] }}
      transition={{ duration: 1.9, repeat: Infinity, ease: "easeInOut" }}
      style={{ originX: "100px", originY: "142px" }}
    >
      {feather(true)}
      {feather(false)}
    </motion.g>
  );
}

/** A ring of light that breathes above the ears. */
function Halo() {
  return (
    <motion.g
      // Tilting rather than only pulsing: a ring seen edge-on and then flatter
      // is a ring turning in space, and it costs one more animated attribute.
      animate={{ opacity: [0.7, 1, 0.7], y: [0, -3, 0], scaleY: [1, 0.55, 1], rotate: [-4, 4, -4] }}
      transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      style={{ originX: "100px", originY: "12px" }}
    >
      <ellipse cx="100" cy="12" rx="30" ry="8" fill="none" stroke="#ffe9a8" strokeWidth="4.5" opacity="0.9" />
      <ellipse cx="100" cy="12" rx="30" ry="8" fill="none" stroke="#fffdf4" strokeWidth="1.6" />
    </motion.g>
  );
}

/** Two horns, and the ember they hold between them. */
function Horns() {
  return (
    <g>
      <path d="M70 34 C62 20 64 8 74 2 C74 14 78 24 84 32 Z" fill="#c4453f" />
      <path d="M130 34 C138 20 136 8 126 2 C126 14 122 24 116 32 Z" fill="#c4453f" />
      <path d="M72 30 C68 20 69 12 74 7" stroke="#7a1f1f" strokeWidth="1.6" fill="none" />
      <path d="M128 30 C132 20 131 12 126 7" stroke="#7a1f1f" strokeWidth="1.6" fill="none" />
      {/* A flame flickers unevenly. Three keyframes at irregular spacing read
          as fire; two at even spacing read as a blinking light. */}
      <motion.circle
        cx="100"
        cy="16"
        r="4.5"
        fill="#ff7a3d"
        animate={{ opacity: [0.4, 1, 0.6, 0.95, 0.4], r: [3.2, 5.6, 4, 5.2, 3.2] }}
        transition={{ duration: 1.15, repeat: Infinity, ease: "easeInOut", times: [0, 0.28, 0.5, 0.74, 1] }}
      />
    </g>
  );
}

/** A barbed tail that flicks, drawn behind the body like the ordinary one. */
function DevilTail() {
  return (
    <motion.g
      animate={{ rotate: [-12, 14, -12], scaleX: [1, 1.06, 1] }}
      transition={{ duration: 2.1, repeat: Infinity, ease: "easeInOut" }}
      style={{ originX: "132px", originY: "208px" }}
    >
      <path
        d="M132 208 C168 206 186 178 178 152"
        stroke="#8e2b2b"
        strokeWidth="9"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M178 154 l-9 -4 l9 -16 l9 16 Z" fill="#ff7a3d" />
    </motion.g>
  );
}

/**
 * The Imp stands in a fire.
 *
 * Drawn twice, behind and in front: flames only behind read as a backdrop the
 * cat happens to be standing against, and the two short tongues over its paws
 * are what put it *in* the fire instead.
 *
 * Every tongue runs on its own delay and on four keyframes rather than two.
 * Fire is not a pulse — anything that grows and shrinks evenly reads as
 * breathing, and this had to read as burning.
 */
function Fire({ front = false }: { front?: boolean }) {
  const tongues = front
    ? [
        { x: 84, h: 26, at: 0.15 },
        { x: 118, h: 30, at: 0.55 },
      ]
    : [
        // The outer two are the tall ones: the body covers everything between
        // 64 and 136, so a flame in the middle is a flame nobody sees. These
        // frame the cat rather than hiding behind it.
        { x: 42, h: 94, at: 0 },
        { x: 66, h: 62, at: 0.34 },
        { x: 100, h: 48, at: 0.68 },
        { x: 136, h: 68, at: 0.22 },
        { x: 160, h: 88, at: 0.5 },
      ];

  const tongue = (x: number, height: number, colour: string, width = 13) =>
    `M${x} 250 C${x - width} ${250 - height * 0.45} ${x - width * 0.45} ${250 - height * 0.72} ${x} ${250 - height} ` +
    `C${x + width * 0.45} ${250 - height * 0.72} ${x + width} ${250 - height * 0.45} ${x} 250 Z` +
    colour;

  return (
    <g>
      {!front && (
        <motion.ellipse
          cx="100"
          cy="206"
          rx="88"
          ry="72"
          fill="url(#cat-fire)"
          animate={{ opacity: [0.5, 0.95, 0.6, 0.85], scale: [0.96, 1.05, 0.99, 1.03] }}
          transition={{ duration: 1.9, repeat: Infinity, ease: "easeInOut" }}
          style={{ originX: "100px", originY: "230px" }}
        />
      )}

      {tongues.map((flame) => (
        <g key={`${front ? "f" : "b"}-${flame.x}`}>
          <motion.path
            d={tongue(flame.x, flame.h, "")}
            fill="#e0432a"
            animate={{ scaleY: [0.68, 1.18, 0.85, 1.05, 0.68], opacity: [0.5, 0.95, 0.7, 0.9, 0.5] }}
            transition={{
              duration: 1.25,
              repeat: Infinity,
              delay: flame.at,
              ease: "easeInOut",
              times: [0, 0.26, 0.5, 0.76, 1],
            }}
            style={{ originX: `${flame.x}px`, originY: "250px" }}
          />
          {/* The bright core lags the outer flame slightly, which is what stops
              the two from reading as one shape with a gradient. */}
          <motion.path
            d={tongue(flame.x, flame.h * 0.58, "", 7)}
            fill="#ffc25e"
            animate={{ scaleY: [0.8, 1.25, 0.9, 1.1, 0.8], opacity: [0.6, 1, 0.75, 0.95, 0.6] }}
            transition={{
              duration: 1.25,
              repeat: Infinity,
              delay: flame.at + 0.12,
              ease: "easeInOut",
              times: [0, 0.26, 0.5, 0.76, 1],
            }}
            style={{ originX: `${flame.x}px`, originY: "250px" }}
          />
        </g>
      ))}
    </g>
  );
}

/**
 * The Spectre's haze: the cat's own silhouette, blurred, breathing behind it.
 *
 * A blurred copy rather than a glow, because a glow says "lit" and a blurred
 * double says "not entirely here" — which is the difference between a lantern
 * and a ghost.
 */
function Haze({ colour }: { colour: string }) {
  return (
    <motion.g
      filter="url(#cat-haze)"
      animate={{ opacity: [0.22, 0.5, 0.22], scale: [1, 1.07, 1] }}
      transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
      style={{ originX: "100px", originY: "170px" }}
    >
      <ellipse cx="100" cy="180" rx="52" ry="62" fill={colour} />
      <ellipse cx="100" cy="80" rx="40" ry="36" fill={colour} />
    </motion.g>
  );
}

/** The Gilded coat's aura: a slow sweep of light around the whole figure. */
function Shine() {
  return (
    <motion.ellipse
      cx="100"
      cy="140"
      rx="86"
      ry="118"
      fill="url(#cat-shine)"
      animate={{ opacity: [0.5, 1, 0.5], scale: [0.94, 1.06, 0.94] }}
      transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
      style={{ originX: "100px", originY: "140px" }}
    />
  );
}

/** Four sparkles that catch the light one after another, never together. */
function Sparkles() {
  const spots = [
    { x: 62, y: 96, at: 0 },
    { x: 142, y: 118, at: 0.9 },
    { x: 80, y: 196, at: 1.7 },
    { x: 132, y: 62, at: 2.4 },
  ];
  return (
    <g>
      {spots.map((spot) => (
        <motion.path
          key={`${spot.x}-${spot.y}`}
          d={`M${spot.x} ${spot.y - 7} l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 Z`}
          fill="#fff6d8"
          animate={{ opacity: [0, 1, 0], scale: [0.4, 1.15, 0.4] }}
          transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 1.7, delay: spot.at, ease: "easeInOut" }}
          style={{ originX: `${spot.x}px`, originY: `${spot.y}px` }}
        />
      ))}
    </g>
  );
}

/**
 * The Vault Heart thinking out loud.
 *
 * Rings leaving the chest one after another, each fading as it widens — a wave
 * rather than a pulse, which is what separates a mind from a heartbeat.
 */
function Psychic() {
  const rings = [0, 1.1, 2.2];
  return (
    <g>
      <motion.ellipse
        cx="100"
        cy="150"
        rx="80"
        ry="100"
        fill="url(#cat-psychic)"
        animate={{ opacity: [0.4, 0.85, 0.4] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
      {rings.map((delay) => (
        <motion.circle
          key={delay}
          cx="100"
          cy="150"
          r="34"
          fill="none"
          stroke="#b98cff"
          strokeWidth="2"
          initial={{ opacity: 0 }}
          animate={{ scale: [0.6, 1.9], opacity: [0.75, 0] }}
          transition={{ duration: 3.3, repeat: Infinity, delay, ease: "easeOut" }}
          style={{ originX: "100px", originY: "150px" }}
        />
      ))}
    </g>
  );
}

/**
 * Small lights around the cat.
 *
 * Rising for the two coats that burn or shine from above, drifting in place for
 * the one that thinks. Positions are fixed rather than random: this component
 * renders on the server too, and a random mote is a hydration mismatch.
 */
function Motes({ colour, rising = false }: { colour: string; rising?: boolean }) {
  const spots = [
    { x: 52, y: 150, at: 0 },
    { x: 150, y: 128, at: 1.2 },
    { x: 68, y: 206, at: 2.1 },
    { x: 140, y: 186, at: 0.7 },
    { x: 100, y: 46, at: 1.7 },
  ];
  return (
    <g>
      {spots.map((spot) => (
        <motion.circle
          key={`${spot.x}-${spot.y}`}
          cx={spot.x}
          cy={spot.y}
          r="2.4"
          fill={colour}
          animate={
            rising
              ? { y: [0, -26], opacity: [0, 0.9, 0], scale: [0.6, 1, 0.5] }
              : { y: [0, -6, 0], x: [0, 4, 0], opacity: [0.25, 0.9, 0.25] }
          }
          transition={{ duration: rising ? 2.6 : 3.4, repeat: Infinity, delay: spot.at, ease: "easeOut" }}
        />
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Equipment layers
// ---------------------------------------------------------------------------

function Head({ shape, colour }: { shape: string; colour: string }) {
  if (shape === "band") {
    return (
      <g>
        <path d="M62 60 Q100 46 138 60 L138 71 Q100 57 62 71 Z" fill={colour} />
        <circle cx="100" cy="59" r="4" fill="url(#cat-gold)" />
      </g>
    );
  }
  if (shape === "cap") {
    return (
      <g>
        <path d="M60 66 Q100 34 140 66 L140 75 Q100 60 60 75 Z" fill={colour} />
        <path d="M60 68 Q100 54 140 68" stroke="url(#cat-gold)" strokeWidth="3" fill="none" />
      </g>
    );
  }
  if (shape === "helm") {
    return (
      <g>
        <path d="M58 68 Q100 26 142 68 L142 78 Q100 62 58 78 Z" fill={colour} />
        <path d="M100 32 V66" stroke="url(#cat-gold)" strokeWidth="4" />
        <path d="M58 70 Q100 56 142 70" stroke="url(#cat-gold)" strokeWidth="3.4" fill="none" />
      </g>
    );
  }
  if (shape === "horned") {
    return (
      <g>
        <path d="M58 68 Q100 26 142 68 L142 78 Q100 62 58 78 Z" fill={colour} />
        {/* Sweeping outward, not upward: horns that parallel the ears read as a
            second pair of ears. */}
        <path d="M62 58 C44 60 28 56 18 44 C34 44 50 46 68 52 Z" fill="url(#cat-gold)" />
        <path d="M138 58 C156 60 172 56 182 44 C166 44 150 46 132 52 Z" fill="url(#cat-gold)" />
        <path d="M100 32 V66" stroke="url(#cat-gold)" strokeWidth="4" />
      </g>
    );
  }
  return (
    <g>
      <path d="M58 68 Q100 24 142 68 L142 78 Q100 62 58 78 Z" fill={colour} />
      <path d="M66 40 L60 10 L82 26 L100 2 L118 26 L140 10 L134 40 Z" fill="url(#cat-gold)" />
      <circle cx="100" cy="18" r="5" fill={colour} stroke="url(#cat-gold)" strokeWidth="2" />
      <path d="M58 70 Q100 56 142 70" stroke="url(#cat-gold)" strokeWidth="3.4" fill="none" />
    </g>
  );
}

function Shoulders({ shape, colour }: { shape: string; colour: string }) {
  const pad = (x: number, mirror: boolean) => {
    const s = mirror ? -1 : 1;
    if (shape === "pads") {
      return (
        <path d={`M${x - 20} 152 Q${x} 132 ${x + 20} 152 Q${x} 162 ${x - 20} 152 Z`} fill={colour} />
      );
    }
    if (shape === "plates") {
      return (
        <g>
          <path d={`M${x - 22} 153 Q${x} 130 ${x + 22} 153 Q${x} 164 ${x - 22} 153 Z`} fill={colour} />
          <path d={`M${x - 18} 149 Q${x} 137 ${x + 18} 149`} stroke="url(#cat-gold)" strokeWidth="2.4" fill="none" />
        </g>
      );
    }
    if (shape === "spiked") {
      return (
        <g>
          <path d={`M${x - 23} 154 Q${x} 128 ${x + 23} 154 Q${x} 165 ${x - 23} 154 Z`} fill={colour} />
          <path d={`M${x + s * 9} 136 l${s * 13} -17 l${s * -3} 19 Z`} fill="url(#cat-gold)" />
          <path d={`M${x - s * 7} 134 l${s * -9} -14 l${s * -1} 16 Z`} fill="url(#cat-gold)" />
        </g>
      );
    }
    if (shape === "winged") {
      return (
        <g>
          <path d={`M${x - 23} 154 Q${x} 126 ${x + 23} 154 Q${x} 165 ${x - 23} 154 Z`} fill={colour} />
          <path
            d={`M${x + s * 13} 143 C${x + s * 30} 138 ${x + s * 38} 126 ${x + s * 40} 112 C${x + s * 30} 122 ${x + s * 20} 132 ${x + s * 11} 151 Z`}
            fill="url(#cat-gold)"
            opacity="0.9"
          />
        </g>
      );
    }
    return (
      <g>
        <path d={`M${x - 25} 155 Q${x} 122 ${x + 25} 155 Q${x} 167 ${x - 25} 155 Z`} fill={colour} />
        <path d={`M${x - 20} 148 Q${x} 132 ${x + 20} 148`} stroke="url(#cat-gold)" strokeWidth="3" fill="none" />
        <circle cx={x} cy="142" r="4.5" fill="url(#cat-gold)" />
      </g>
    );
  };

  return (
    <g>
      {pad(58, true)}
      {pad(142, false)}
    </g>
  );
}

function Chest({ shape, colour }: { shape: string; colour: string }) {
  const body =
    "M68 138 C63 166 63 194 71 208 C84 218 116 218 129 208 C137 194 137 166 132 138 C118 130 82 130 68 138 Z";

  if (shape === "tunic") {
    return <path d={body} fill={colour} opacity="0.88" />;
  }
  if (shape === "mail") {
    return (
      <g>
        <path d={body} fill={colour} />
        {/* Shading on the mail, not on the cat: it stays dark whatever coat is worn. */}
        <path d="M70 156 h60 M69 172 h62 M71 188 h58" stroke="#1b1a18" strokeWidth="1.6" opacity="0.45" />
      </g>
    );
  }
  if (shape === "plate") {
    return (
      <g>
        <path d={body} fill={colour} />
        <path d="M100 132 V214" stroke="url(#cat-gold)" strokeWidth="3" />
        <path d="M68 158 Q100 148 132 158" stroke="url(#cat-gold)" strokeWidth="2.6" fill="none" />
      </g>
    );
  }
  if (shape === "runed") {
    return (
      <g>
        <path d={body} fill={colour} />
        <path d="M100 132 V214" stroke="url(#cat-gold)" strokeWidth="3" />
        <circle cx="100" cy="172" r="14" fill="none" stroke="url(#cat-gold)" strokeWidth="2.4" />
        <path d="M100 159 v26 M87 172 h26" stroke="url(#cat-gold)" strokeWidth="1.8" />
      </g>
    );
  }
  return (
    <g>
      <path d={body} fill={colour} />
      <path d="M100 130 V214" stroke="url(#cat-gold)" strokeWidth="3.4" />
      <path d="M68 156 Q100 144 132 156" stroke="url(#cat-gold)" strokeWidth="3" fill="none" />
      <path d="M100 158 l15 22 l-15 22 l-15 -22 Z" fill="url(#cat-gold)" />
      <circle cx="100" cy="180" r="6" fill={colour} />
    </g>
  );
}

function Hands({ shape, colour }: { shape: string; colour: string }) {
  const glove = (x: number, mirror: boolean) => {
    const s = mirror ? -1 : 1;
    if (shape === "wraps") {
      return <rect x={x - 11} y="186" width="22" height="18" rx="8" fill={colour} />;
    }
    if (shape === "bracers") {
      return (
        <g>
          <rect x={x - 12} y="180" width="24" height="26" rx="9" fill={colour} />
          <path d={`M${x - 12} 190 h24`} stroke="url(#cat-gold)" strokeWidth="2.2" />
        </g>
      );
    }
    if (shape === "gauntlets") {
      return (
        <g>
          <rect x={x - 13} y="176" width="26" height="32" rx="9" fill={colour} />
          <path d={`M${x - 13} 186 h26 M${x - 13} 196 h26`} stroke="url(#cat-gold)" strokeWidth="2" />
        </g>
      );
    }
    if (shape === "clawed") {
      return (
        <g>
          <rect x={x - 13} y="174" width="26" height="34" rx="9" fill={colour} />
          <path
            d={`M${x - 8} 208 l-2 9 M${x} 209 l0 10 M${x + 8} 208 l2 9`}
            stroke="url(#cat-gold)"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </g>
      );
    }
    return (
      <g>
        <rect x={x - 14} y="172" width="28" height="36" rx="10" fill={colour} />
        <circle cx={x} cy="188" r="5" fill="url(#cat-gold)" />
        <path d={`M${x + s * 14} 182 q${s * 10} 6 ${s * 2} 15`} stroke="url(#cat-gold)" strokeWidth="2.2" fill="none" />
      </g>
    );
  };

  return (
    <g>
      {glove(50, true)}
      {glove(150, false)}
    </g>
  );
}

function Legs({ shape, colour }: { shape: string; colour: string }) {
  const leg = (x: number) => {
    if (shape === "cloth") {
      return <rect x={x - 13} y="200" width="26" height="26" rx="10" fill={colour} opacity="0.9" />;
    }
    if (shape === "greaves") {
      return (
        <g>
          <rect x={x - 14} y="198" width="28" height="34" rx="10" fill={colour} />
          <path d={`M${x - 14} 210 h28`} stroke="url(#cat-gold)" strokeWidth="2.2" />
        </g>
      );
    }
    if (shape === "plated") {
      return (
        <g>
          <rect x={x - 15} y="196" width="30" height="40" rx="10" fill={colour} />
          <path d={`M${x - 15} 206 h30 M${x - 15} 218 h30`} stroke="url(#cat-gold)" strokeWidth="2" />
        </g>
      );
    }
    if (shape === "runed") {
      return (
        <g>
          <rect x={x - 15} y="195" width="30" height="42" rx="10" fill={colour} />
          <circle cx={x} cy="213" r="7" fill="none" stroke="url(#cat-gold)" strokeWidth="2" />
        </g>
      );
    }
    return (
      <g>
        <rect x={x - 16} y="194" width="32" height="44" rx="11" fill={colour} />
        <path d={`M${x} 199 l9 14 l-9 14 l-9 -14 Z`} fill="url(#cat-gold)" />
      </g>
    );
  };

  return (
    <g>
      {leg(83)}
      {leg(117)}
    </g>
  );
}

function Trinket({ shape, colour }: { shape: string; colour: string }) {
  if (shape === "cord") {
    return <path d="M74 114 Q100 132 126 114" stroke={colour} strokeWidth="4.5" fill="none" strokeLinecap="round" />;
  }
  if (shape === "pendant") {
    return (
      <g>
        <path d="M74 114 Q100 132 126 114" stroke="url(#cat-gold)" strokeWidth="3.2" fill="none" />
        <circle cx="100" cy="140" r="7.5" fill={colour} stroke="url(#cat-gold)" strokeWidth="2" />
      </g>
    );
  }
  if (shape === "gem") {
    return (
      <g>
        <path d="M72 113 Q100 133 128 113" stroke="url(#cat-gold)" strokeWidth="3.2" fill="none" />
        <path d="M100 131 l10 11 l-10 13 l-10 -13 Z" fill={colour} stroke="url(#cat-gold)" strokeWidth="2" />
      </g>
    );
  }
  if (shape === "sigil") {
    // A shield rather than another ringed rune: the runed breastplate already
    // owns that motif, and two of them on one chest read as a mistake.
    return (
      <g>
        <path d="M70 112 Q100 134 130 112" stroke="url(#cat-gold)" strokeWidth="3.6" fill="none" />
        <path
          d="M100 131 l12 5 v10 q0 10 -12 15 q-12 -5 -12 -15 v-10 Z"
          fill={colour}
          stroke="url(#cat-gold)"
          strokeWidth="2.2"
        />
        <path d="M100 138 v13 M94 144 h12" stroke="url(#cat-gold)" strokeWidth="1.8" />
      </g>
    );
  }
  return (
    <g>
      <path d="M68 111 Q100 136 132 111" stroke="url(#cat-gold)" strokeWidth="4" fill="none" />
      <path d="M87 136 l-3 -13 l10 7 l6 -12 l6 12 l10 -7 l-3 13 Z" fill="url(#cat-gold)" />
      <circle cx="100" cy="146" r="6.5" fill={colour} stroke="url(#cat-gold)" strokeWidth="2" />
    </g>
  );
}


// ---------------------------------------------------------------------------
// The same pieces, on their own
// ---------------------------------------------------------------------------

/**
 * Where each slot sits on the cat, so a piece can be shown alone by framing the
 * part of the drawing it occupies.
 *
 * This is why the bag and the cat can never disagree about what a Horned Helm
 * looks like: it is not a second icon that has to be kept in step, it is the
 * same path, cropped.
 */
const SLOT_FRAME: Record<Slot, string> = {
  HEAD: "18 -10 164 96",
  SHOULDERS: "8 104 184 72",
  CHEST: "56 122 88 102",
  HANDS: "30 164 140 56",
  LEGS: "58 186 84 58",
  TRINKET: "60 102 80 62",
};

const RENDERERS: Record<Slot, (props: { shape: string; colour: string }) => React.ReactElement> = {
  HEAD: Head,
  SHOULDERS: Shoulders,
  CHEST: Chest,
  HANDS: Hands,
  LEGS: Legs,
  TRINKET: Trinket,
};

/**
 * The part of the cat a piece is worn on, in silhouette.
 *
 * Without it a headband and a necklace are both "a coloured arc" and the bag is
 * a wall of indistinguishable curves. Behind a faint head, one is obviously a
 * band and the other obviously hangs at the neck — and since these are the same
 * paths the cat is drawn from, the tile cannot drift from the figure.
 */
function Ghost({ slot }: { slot: Slot }) {
  const skin = { fill: "#8093b5", opacity: 0.2 };
  if (slot === "HEAD") {
    return (
      <g {...skin}>
        <path d="M66 58 L57 16 L93 42 Z" />
        <path d="M134 58 L143 16 L107 42 Z" />
        <path d="M64 88 Q46 96 48 112 Q62 108 70 96 Z" />
        <path d="M136 88 Q154 96 152 112 Q138 108 130 96 Z" />
        <ellipse cx="100" cy="78" rx="42" ry="37" />
      </g>
    );
  }
  if (slot === "LEGS") {
    return (
      <g {...skin}>
        <rect x="71" y="198" width="24" height="46" rx="12" />
        <rect x="105" y="198" width="24" height="46" rx="12" />
        <ellipse cx="83" cy="245" rx="15" ry="7" />
        <ellipse cx="117" cy="245" rx="15" ry="7" />
      </g>
    );
  }
  if (slot === "HANDS") {
    return (
      <g {...skin}>
        <path d="M62 148 C51 166 48 182 50 196" stroke="#8093b5" strokeWidth="18" strokeLinecap="round" fill="none" />
        <path d="M138 148 C149 166 152 182 150 196" stroke="#8093b5" strokeWidth="18" strokeLinecap="round" fill="none" />
      </g>
    );
  }
  const barrel = (
    <path d="M64 140 C59 168 58 196 67 212 C82 224 118 224 133 212 C142 196 141 168 136 140 C122 130 78 130 64 140 Z" />
  );
  const ruff = (
    <path d="M52 112 Q62 140 72 128 Q80 150 92 138 Q100 156 108 138 Q120 150 128 128 Q138 140 148 112 Q100 94 52 112 Z" />
  );
  return (
    <g {...skin}>
      {barrel}
      {slot !== "CHEST" && ruff}
    </g>
  );
}

/**
 * One worn piece, drawn alone in a box.
 *
 * The frame is measured, not tabulated. The shapes differ wildly in extent — a
 * plain headband is a flat sliver, a crown reaches half the cat's height — so a
 * fixed box per slot left most pieces as a few pixels of colour in an empty
 * square. Measuring what the paths actually cover fills the tile with the item,
 * whatever it is, and keeps working when a new shape is added.
 *
 * The aspect is clamped at 2:1 so a headband stays wide and thin (which it is)
 * without being blown up to a square band, and nothing is ever distorted.
 */
export function SlotArt({
  slot,
  shape,
  rarity,
  size = 48,
}: {
  slot: Slot;
  shape: string;
  rarity: Rarity;
  size?: number;
}) {
  const Renderer = RENDERERS[slot];
  const group = useRef<SVGGElement>(null);
  const [frame, setFrame] = useState<string | null>(null);

  useLayoutEffect(() => {
    const node = group.current;
    if (!node) return;
    let box: DOMRect;
    try {
      box = node.getBBox();
    } catch {
      // A detached or display:none subtree has no box to measure; the slot's
      // rough frame is still a usable answer.
      return;
    }
    if (box.width === 0 || box.height === 0) return;

    // getBBox measures fills, not strokes, and several shapes are stroke-only.
    const pad = Math.max(box.width, box.height) * 0.1 + 4;
    let width = box.width + pad * 2;
    let height = box.height + pad * 2;
    height = Math.max(height, width / 2);
    width = Math.max(width, height / 2);

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    setFrame(`${cx - width / 2} ${cy - height / 2} ${width} ${height}`);
  }, [slot, shape]);

  return (
    <svg viewBox={frame ?? SLOT_FRAME[slot]} width={size} height={size} aria-hidden>
      <defs>
        <linearGradient id="cat-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f3d68f" />
          <stop offset="100%" stopColor="#a97f31" />
        </linearGradient>
      </defs>
      <g ref={group}>
        <Ghost slot={slot} />
        <Renderer shape={shape} colour={RARITY_STYLE[rarity].color} />
      </g>
    </svg>
  );
}
