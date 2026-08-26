"use client";

import { memo } from "react";
import { motion } from "framer-motion";

/**
 * WHERE THE FIGHT HAPPENS
 *
 * Sixteen chambers, drawn rather than photographed, cycling by floor.
 *
 * Photographs were the obvious answer and the wrong one: a set large enough to
 * matter is megabytes, needs licences, and would sit behind a hand-drawn cat
 * looking like a different game. These are a few dozen SVG shapes each — they
 * cost nothing to send, they match the art the rest of the screen is made of,
 * and an idle game with no last floor can rotate them for ever.
 *
 * Rotation alone would make floor 17 identical to floor 1, so each full turn
 * through the sixteen also shifts the hue and dims the light. The Vault gets
 * stranger and darker the deeper it goes, without a seventeenth drawing.
 */

interface Theme {
  nameEn: string;
  nameFr: string;
  /** Top and bottom of the wall behind everything. */
  sky: [string, string];
  /** The glow that sits behind the silhouettes. */
  haze: string;
  /** Floor band. */
  ground: string;
  /** Mid-ground silhouettes, drawn in this colour. */
  ink: string;
  /** Drifting specks: colour, or null for a still room. */
  motes: string | null;
  scene: (ink: string) => React.ReactNode;
}

// Every scene draws into a 400×260 box, floor line at y=210.
const THEMES: Theme[] = [
  {
    nameEn: "The Crypt",
    nameFr: "La Crypte",
    sky: ["#141d33", "#0a0e1c"],
    haze: "#4f93ff",
    ground: "#0c1120",
    ink: "#1e2a47",
    motes: "#7aa2e8",
    scene: (ink) => (
      <>
        <path d="M30 210V120a40 40 0 0180 0v90z" fill={ink} />
        <path d="M160 210V100a40 40 0 0180 0v110z" fill={ink} opacity="0.85" />
        <path d="M290 210V125a38 38 0 0176 0v85z" fill={ink} />
        <path d="M55 210V140a25 25 0 0150 0v70z" fill="#070b16" />
        <path d="M185 210V120a25 25 0 0150 0v90z" fill="#070b16" />
      </>
    ),
  },
  {
    nameEn: "The Hollows",
    nameFr: "Les Cavités",
    sky: ["#1a1426", "#0c0913"],
    haze: "#a06bff",
    ground: "#100b1a",
    ink: "#2a1f3d",
    motes: "#c9a2ff",
    scene: (ink) => (
      <>
        <path d="M0 0h400v40l-30 55-25-40-35 60-30-45-40 70-35-55-30 40-35-60-30 50-40-45-30 55-40-30z" fill={ink} />
        <path d="M40 210l22-55 22 55z" fill={ink} />
        <path d="M150 210l30-75 30 75z" fill={ink} opacity="0.8" />
        <path d="M300 210l26-62 26 62z" fill={ink} />
      </>
    ),
  },
  {
    nameEn: "The Forge",
    nameFr: "La Forge",
    sky: ["#2b1410", "#140807"],
    haze: "#ff7a3d",
    ground: "#1c0c08",
    ink: "#3d1c14",
    motes: "#ff9d5e",
    scene: (ink) => (
      <>
        <rect x="40" y="70" width="34" height="140" fill={ink} />
        <rect x="180" y="50" width="40" height="160" fill={ink} opacity="0.9" />
        <rect x="330" y="80" width="34" height="130" fill={ink} />
        <ellipse cx="120" cy="212" rx="55" ry="10" fill="#ff6b2c" opacity="0.6" />
        <ellipse cx="280" cy="214" rx="42" ry="8" fill="#ff8b3c" opacity="0.5" />
      </>
    ),
  },
  {
    nameEn: "The Rime",
    nameFr: "Le Givre",
    sky: ["#0f2436", "#071420"],
    haze: "#5ee0ff",
    ground: "#0a1a28",
    ink: "#16405c",
    motes: "#c2f0ff",
    scene: (ink) => (
      <>
        <path d="M20 210L60 90l40 120z" fill={ink} />
        <path d="M120 210L155 130l35 80z" fill={ink} opacity="0.75" />
        <path d="M230 210L280 70l50 140z" fill={ink} />
        <path d="M330 210l30-60 30 60z" fill={ink} opacity="0.8" />
        <path d="M0 0h400v30l-40 40-40-30-45 45-40-35-50 50-45-40-40 35-40-30z" fill={ink} opacity="0.6" />
      </>
    ),
  },
  {
    nameEn: "The Stacks",
    nameFr: "Les Rayonnages",
    sky: ["#20180f", "#100b07"],
    haze: "#e0b45e",
    ground: "#181008",
    ink: "#2e2114",
    motes: "#f0d089",
    scene: (ink) => (
      <>
        {[20, 120, 220, 320].map((x) => (
          <g key={x}>
            <rect x={x} y="60" width="60" height="150" fill={ink} />
            {[75, 105, 135, 165].map((y) => (
              <rect key={y} x={x + 4} y={y} width="52" height="4" fill="#0b0805" />
            ))}
          </g>
        ))}
      </>
    ),
  },
  {
    nameEn: "The Overgrowth",
    nameFr: "La Frondaison",
    sky: ["#0f2418", "#06120c"],
    haze: "#6ee08a",
    ground: "#0a1a10",
    ink: "#173d26",
    motes: "#9df0b4",
    scene: (ink) => (
      <>
        <path d="M0 0h400v60c-40 20-60-10-100 10s-60-15-100 5-60-20-100 0-70-15-100 5z" fill={ink} />
        <path d="M50 210V130c0-20 20-25 20-45M55 150c-15-10-25 0-30 15" stroke={ink} strokeWidth="9" fill="none" strokeLinecap="round" />
        <path d="M330 210V120c0-25-25-25-25-50M335 145c18-8 28 4 32 20" stroke={ink} strokeWidth="9" fill="none" strokeLinecap="round" />
        <ellipse cx="200" cy="205" rx="70" ry="14" fill={ink} opacity="0.6" />
      </>
    ),
  },
  {
    nameEn: "The Abyss",
    nameFr: "L'Abîme",
    sky: ["#0a0d1a", "#03050c"],
    haze: "#2f5cd0",
    ground: "#05070f",
    ink: "#141b30",
    motes: "#6f8fd8",
    scene: (ink) => (
      <>
        <path d="M60 150l40-14 26 22-30 20-38-10z" fill={ink} />
        <path d="M240 100l52-16 30 26-40 22-44-14z" fill={ink} opacity="0.85" />
        <path d="M150 200l60-18 34 28h-96z" fill={ink} />
        <path d="M330 175l34-10 20 16-24 14-30-8z" fill={ink} opacity="0.7" />
      </>
    ),
  },
  {
    nameEn: "The Gilded Hall",
    nameFr: "La Salle Dorée",
    sky: ["#1b1a2e", "#0c0b18"],
    haze: "#f0c14b",
    ground: "#131120",
    ink: "#2b2740",
    motes: "#f3d68f",
    scene: (ink) => (
      <>
        {[35, 135, 235, 335].map((x) => (
          <g key={x}>
            <rect x={x} y="50" width="30" height="160" fill={ink} />
            <rect x={x - 6} y="44" width="42" height="10" fill="#3a3455" />
            <rect x={x - 6} y="200" width="42" height="10" fill="#3a3455" />
          </g>
        ))}
        <path d="M90 40h60v90l-30 22-30-22z" fill="#7a1f2b" opacity="0.55" />
        <path d="M250 40h60v90l-30 22-30-22z" fill="#7a1f2b" opacity="0.55" />
      </>
    ),
  },
  {
    nameEn: "The Mire",
    nameFr: "La Fange",
    sky: ["#161c14", "#0a0d09"],
    haze: "#8fa85e",
    ground: "#0e120b",
    ink: "#232b1c",
    motes: "#c2d18e",
    scene: (ink) => (
      <>
        <path d="M70 210V110M70 140l-25-22M70 165l28-20M70 120l22-25" stroke={ink} strokeWidth="7" fill="none" strokeLinecap="round" />
        <path d="M300 210V90M300 130l30-26M300 160l-26-18M300 110l-20-22" stroke={ink} strokeWidth="7" fill="none" strokeLinecap="round" />
        <ellipse cx="180" cy="208" rx="90" ry="12" fill={ink} opacity="0.7" />
        <ellipse cx="180" cy="206" rx="50" ry="6" fill="#3d4a2c" opacity="0.6" />
      </>
    ),
  },
  {
    nameEn: "The Geode",
    nameFr: "La Géode",
    sky: ["#151030", "#080618"],
    haze: "#37d5ff",
    ground: "#0e0a20",
    ink: "#241a4d",
    motes: "#7ae8ff",
    scene: (ink) => (
      <>
        <path d="M40 210l25-90 30 90z" fill={ink} />
        <path d="M85 210l18-64 22 64z" fill="#2f2266" opacity="0.9" />
        <path d="M250 210l34-110 36 110z" fill={ink} />
        <path d="M310 210l22-70 26 70z" fill="#2f2266" opacity="0.9" />
        <path d="M160 210l20-52 22 52z" fill={ink} opacity="0.7" />
      </>
    ),
  },
  {
    nameEn: "The Ossuary",
    nameFr: "L'Ossuaire",
    sky: ["#1a1a1c", "#0b0b0d"],
    haze: "#c9c2b0",
    ground: "#121213",
    ink: "#2c2b28",
    motes: "#ded6c2",
    scene: (ink) => (
      <>
        <path d="M50 210V110a30 30 0 0160 0v100z" fill={ink} />
        <path d="M290 210V120a30 30 0 0160 0v90z" fill={ink} />
        <circle cx="80" cy="95" r="17" fill="#3d3b36" />
        <circle cx="320" cy="105" r="15" fill="#3d3b36" />
        <path d="M160 210V90h14v120zM190 210V80h14v130zM220 210V95h14v115z" fill={ink} opacity="0.85" />
      </>
    ),
  },
  {
    nameEn: "The Sanctum",
    nameFr: "Le Sanctuaire",
    sky: ["#101a30", "#070c18"],
    haze: "#a9cbff",
    ground: "#0b1120",
    ink: "#1a2745",
    motes: "#cfe0ff",
    scene: (ink) => (
      <>
        <path d="M140 210V90a60 60 0 01120 0v120z" fill={ink} />
        <path d="M160 210V95a40 40 0 0180 0v115z" fill="#2a3f70" opacity="0.7" />
        <path d="M200 100v100M170 140h60" stroke="#7aa2e8" strokeWidth="5" opacity="0.6" />
        <rect x="30" y="120" width="30" height="90" fill={ink} />
        <rect x="340" y="120" width="30" height="90" fill={ink} />
      </>
    ),
  },
  {
    nameEn: "The Ruin",
    nameFr: "La Ruine",
    sky: ["#1c1a19", "#0d0c0b"],
    haze: "#b08b5e",
    ground: "#131110",
    ink: "#2e2a26",
    motes: null,
    scene: (ink) => (
      <>
        <path d="M40 210V120l30-14v104z" fill={ink} />
        <rect x="120" y="150" width="34" height="60" fill={ink} opacity="0.85" />
        <path d="M210 210V80l36 20v110z" fill={ink} />
        <rect x="300" y="175" width="40" height="35" fill={ink} opacity="0.8" />
        <path d="M0 210h400" stroke="#3d372f" strokeWidth="3" />
      </>
    ),
  },
  {
    nameEn: "The Tempest",
    nameFr: "La Tempête",
    sky: ["#111a24", "#070c12"],
    haze: "#7fd8e8",
    ground: "#0a1018",
    ink: "#1b2a38",
    motes: "#a8e4f0",
    scene: (ink) => (
      <>
        <ellipse cx="110" cy="45" rx="90" ry="34" fill={ink} />
        <ellipse cx="290" cy="60" rx="100" ry="30" fill={ink} opacity="0.85" />
        {[40, 95, 150, 205, 260, 315, 370].map((x, index) => (
          <path
            key={x}
            d={`M${x} ${70 + index * 9}l-14 46`}
            stroke="#4d7a90"
            strokeWidth="2"
            opacity="0.45"
          />
        ))}
        <path d="M180 60l-22 46h20l-16 40 44-56h-22l18-30z" fill="#cfe8f0" opacity="0.5" />
      </>
    ),
  },
  {
    nameEn: "The Necropolis",
    nameFr: "La Nécropole",
    sky: ["#181228", "#0a0714"],
    haze: "#8f6bd8",
    ground: "#100b1c",
    ink: "#261b3d",
    motes: "#b89ae8",
    scene: (ink) => (
      <>
        <path d="M60 210V70l18-24 18 24v140z" fill={ink} />
        <path d="M180 210V40l22-28 22 28v170z" fill={ink} opacity="0.9" />
        <path d="M310 210V85l16-22 16 22v125z" fill={ink} />
        <circle cx="202" cy="60" r="8" fill="#a06bff" opacity="0.7" />
      </>
    ),
  },
  {
    nameEn: "The Vault Core",
    nameFr: "Le Cœur du Vault",
    sky: ["#0d1630", "#060a18"],
    haze: "#4f93ff",
    ground: "#080e1c",
    ink: "#16234a",
    motes: "#8fd14f",
    scene: (ink) => (
      <>
        <circle cx="200" cy="110" r="72" fill="none" stroke={ink} strokeWidth="10" />
        <circle cx="200" cy="110" r="48" fill="none" stroke={ink} strokeWidth="7" opacity="0.8" />
        <circle cx="200" cy="110" r="24" fill="#1d3a7a" opacity="0.75" />
        <path d="M200 20v40M200 160v40M110 110h40M250 110h40" stroke={ink} strokeWidth="8" strokeLinecap="round" />
        <rect x="20" y="150" width="26" height="60" fill={ink} />
        <rect x="354" y="150" width="26" height="60" fill={ink} />
      </>
    ),
  },
];

export const FLOOR_THEMES = THEMES.length;

/** Which chamber a floor is, and what it is called. */
export function themeFor(floor: number) {
  const theme = THEMES[(Math.max(1, floor) - 1) % THEMES.length];
  return { nameEn: theme.nameEn, nameFr: theme.nameFr };
}

/** Memoised: the chamber changes once a level and was being redrawn every step. */
export const FloorBackdrop = memo(function FloorBackdrop({ floor }: { floor: number }) {
  const index = (Math.max(1, floor) - 1) % THEMES.length;
  const theme = THEMES[index];
  const cycle = Math.floor((Math.max(1, floor) - 1) / THEMES.length);

  // Each full turn through the sixteen shifts the light. Bounded so the deepest
  // floors are strange rather than unreadable.
  const filter = `hue-rotate(${(cycle * 23) % 360}deg) brightness(${Math.max(
    0.6,
    1 - cycle * 0.045,
  )}) saturate(${Math.min(1.6, 1 + cycle * 0.06)})`;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ filter }}>
      <svg
        viewBox="0 0 400 260"
        preserveAspectRatio="xMidYMax slice"
        className="h-full w-full"
        aria-hidden
      >
        <defs>
          <linearGradient id={`sky-${index}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={theme.sky[0]} />
            <stop offset="100%" stopColor={theme.sky[1]} />
          </linearGradient>
          <radialGradient id={`haze-${index}`} cx="50%" cy="72%">
            <stop offset="0%" stopColor={theme.haze} stopOpacity="0.28" />
            <stop offset="100%" stopColor={theme.haze} stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width="400" height="260" fill={`url(#sky-${index})`} />
        <rect width="400" height="260" fill={`url(#haze-${index})`} />
        <g opacity="0.9">{theme.scene(theme.ink)}</g>
        <rect y="210" width="400" height="50" fill={theme.ground} />
        <rect y="208" width="400" height="2" fill={theme.haze} opacity="0.25" />
      </svg>

      {theme.motes && <Motes colour={theme.motes} seed={index} />}
    </div>
  );
});

/**
 * Specks drifting upward. Positions come from the theme index rather than
 * Math.random so the server and the first client render agree — a random
 * backdrop is a hydration mismatch waiting to happen.
 */
function Motes({ colour, seed }: { colour: string; seed: number }) {
  return (
    <div className="absolute inset-0">
      {Array.from({ length: 9 }, (_, index) => {
        const spread = ((seed * 37 + index * 61) % 100) / 100;
        const depth = ((seed * 17 + index * 43) % 100) / 100;
        return (
          <motion.span
            key={index}
            className="absolute rounded-full"
            style={{
              left: `${spread * 96}%`,
              bottom: `${depth * 60}%`,
              width: 2 + (index % 3),
              height: 2 + (index % 3),
              background: colour,
              opacity: 0.35,
            }}
            animate={{ y: [0, -26, 0], opacity: [0.15, 0.5, 0.15] }}
            transition={{
              duration: 6 + (index % 5),
              repeat: Infinity,
              ease: "easeInOut",
              delay: index * 0.7,
            }}
          />
        );
      })}
    </div>
  );
}
