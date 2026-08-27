/**
 * Hand-drawn SVG icon set.
 *
 * No icon library: everything is engraved-looking geometry in gold and sapphire,
 * so the whole interface stays inside the Vault's material language and ships
 * without a single extra kilobyte of dependency.
 */

interface IconProps {
  size?: number;
  className?: string;
}

export function VaultIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M4 21V10a8 8 0 0 1 16 0v11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M3 21h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 9.4V7M12 17v-2.4M9.4 12H7M17 12h-2.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function PlayIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 3.5 15.5 9 12 20.5 8.5 9 12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8.5 9h7" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

export function MissionsIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M6 3.5h9.5L19 7v13.5H6a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 6 3.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8 9h6M8 12.5h8M8 16h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function ExploreIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M15.5 8.5 13.4 13.4 8.5 15.5l2.1-4.9 4.9-2.1Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ArmoryIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* a blade resting on its pedestal */}
      <path d="M12 2.5 14 6v8h-4V6l2-3.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8.5 14h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 14v4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6.5 21h11l-1.5-3h-8L6.5 21Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

export function ProfileIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 3.2 19 6v6.2c0 4-2.9 7.3-7 8.6-4.1-1.3-7-4.6-7-8.6V6l7-2.8Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10.6" r="2.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8.4 16.4c.8-1.5 2.1-2.3 3.6-2.3s2.8.8 3.6 2.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function TrophyIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M7 5.5H4.5V7a3 3 0 0 0 3 3M17 5.5h2.5V7a3 3 0 0 1-3 3" stroke="currentColor" strokeWidth="1.3" />
      <path d="M12 14v3.5M9 20.5h6M10 17.5h4v3h-4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

export function StreakIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 3s4.5 3.6 4.5 8.2A4.5 4.5 0 0 1 12 15.7a4.5 4.5 0 0 1-4.5-4.5C7.5 6.6 12 3 12 3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M9 17.5c1 1.6 1.8 2.4 3 2.4s2-.8 3-2.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function ShieldIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 3.5 18.5 6v5.5c0 3.8-2.7 7-6.5 8.2-3.8-1.2-6.5-4.4-6.5-8.2V6L12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function XpIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 2.5 14.6 8l6 .9-4.3 4.2 1 6-5.3-2.8L6.7 19l1-6L3.4 8.9l6-.9L12 2.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The Vault Shard — the soft currency, and the app's most repeated shape. */
export function ShardIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 2.5 17.5 9 12 21.5 6.5 9 12 2.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M6.5 9h11M12 2.5V21.5" stroke="currentColor" strokeWidth="1" opacity="0.55" />
    </svg>
  );
}

const ITEM_SHAPES: Record<string, React.ReactNode> = {
  crystal: (
    <path d="M12 3 17 9.5 12 21 7 9.5 12 3Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  ),
  stone: (
    <path d="M5 14.5 8 6.5h8l3 8-7 5-7-5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  ),
  thread: (
    <path d="M5 18c4-1 5-4 4.5-7S8 6 10.5 5s6 1.5 6.5 5.5S15 19 12 19" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  ),
  gold: (
    <>
      <path d="M4 16h16l-2 4H6l-2-4Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M7 11h10l-1.5 4h-7L7 11Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </>
  ),
  velvet: (
    <path d="M6 4h12v13l-6 3.5L6 17V4Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  ),
  core: (
    <>
      <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.1" opacity="0.5" />
    </>
  ),
  essence: (
    <>
      <path d="M12 3c3 4 5 6.5 5 9.5a5 5 0 0 1-10 0C7 9.5 9 7 12 3Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </>
  ),
  ore: (
    <>
      <path d="M4 13l4-7h8l4 7-8 7-8-7Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 6l4 14 4-14" stroke="currentColor" strokeWidth="1" opacity="0.5" />
    </>
  ),
  sword: (
    <>
      <path d="M13.5 3.5 20 4l-.5 6.5-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M4 20l3.5-3.5M6 14l4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  "magic-sword": (
    <>
      <path d="M13.5 3.5 20 4l-.5 6.5-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M4 20l3.5-3.5M6 14l4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M16.5 7.5l1.5-1.5M15 12l2 1M9 6l1 2" stroke="currentColor" strokeWidth="1" opacity="0.7" />
    </>
  ),
  bow: (
    <>
      <path d="M6 4c6 2.5 9 7 9 16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M5 5l14 14" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
    </>
  ),
  scepter: (
    <>
      <path d="M12 8v12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M12 2.5 15 6l-3 3.5L9 6l3-3.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="8" r="4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M11 11l8 8M16 16l2-2M14 14l2-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  badge: (
    <>
      <circle cx="12" cy="10" r="5.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8.5 14.5 7 21l5-2.5L17 21l-1.5-6.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </>
  ),
  crown: (
    <>
      <path d="M4 17l-1-9 5 4 4-7 4 7 5-4-1 9H4Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M4 20h16" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </>
  ),
  sigil: (
    <>
      <path d="M12 3l2.6 5.6L20 10l-4 4.2.9 5.8-4.9-2.8-4.9 2.8L8 14.2 4 10l5.4-1.4L12 3Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </>
  ),
  aura: (
    <>
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </>
  ),
  legend: (
    <>
      <path d="M12 2.5 14.6 8l6 .9-4.3 4.2 1 6-5.3-2.8L6.7 19l1-6L3.4 8.9l6-.9L12 2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M12 7.5v6" stroke="currentColor" strokeWidth="1" opacity="0.6" />
    </>
  ),
  "boost-xp": (
    <>
      <path d="M12 20V6M12 4l4.5 4.5M12 4 7.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  "boost-shard": (
    <>
      <path d="M12 3.5 16.5 9 12 20.5 7.5 9 12 3.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M4 6l1.5 1.5M20 6l-1.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </>
  ),
};

export function ItemIcon({ icon, size = 22, className }: IconProps & { icon: string }) {
  const shape = ITEM_SHAPES[icon] ?? ITEM_SHAPES.crystal;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {shape}
    </svg>
  );
}

/** The MCN paw-and-crown mark, used as the app crest. */
export function McnCrest({ size = 28, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className}>
      <path
        d="M6 12.5 4.8 6.5l4.6 3.2L16 3l6.6 6.7 4.6-3.2-1.2 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="11" cy="17.5" r="1.9" fill="currentColor" opacity="0.9" />
      <circle cx="16" cy="16" r="1.9" fill="currentColor" opacity="0.9" />
      <circle cx="21" cy="17.5" r="1.9" fill="currentColor" opacity="0.9" />
      <path
        d="M16 20.5c3.2 0 5.4 2 5.4 4.2 0 1.7-1.4 2.8-3.2 2.8-1 0-1.6-.4-2.2-.4s-1.2.4-2.2.4c-1.8 0-3.2-1.1-3.2-2.8 0-2.2 2.2-4.2 5.4-4.2Z"
        fill="currentColor"
        opacity="0.9"
      />
    </svg>
  );
}

/** The paw: the climb, where the cat actually is. */
export function PawIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <ellipse cx="7" cy="8.5" rx="2.1" ry="2.8" stroke="currentColor" strokeWidth="1.4" />
      <ellipse cx="12" cy="6.6" rx="2.1" ry="2.9" stroke="currentColor" strokeWidth="1.4" />
      <ellipse cx="17" cy="8.5" rx="2.1" ry="2.8" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M12 12.2c3.2 0 5.6 2.2 5.6 4.6 0 2-1.7 3.2-3.6 2.7-1.3-.4-2.7-.4-4 0-1.9.5-3.6-.7-3.6-2.7 0-2.4 2.4-4.6 5.6-4.6Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A purse: what gold is for, rather than what it is. */
export function ShopIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M5 9h14l1.2 10.5a1.5 1.5 0 0 1-1.5 1.5H5.3a1.5 1.5 0 0 1-1.5-1.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M8.5 11V7a3.5 3.5 0 0 1 7 0v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** A life turning over: the same road walked again, further in. */
export function RebirthIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 4.5a7.5 7.5 0 1 1-6.6 3.9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M4.4 4.2 5.4 8.4l4.2-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

/** A cut stone: the currency that does not inflate. */
export function GemIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M7 3h10l4 6-9 12L3 9Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M3 9h18M9.5 3 12 21M14.5 3 12 21" stroke="currentColor" strokeWidth="1.1" opacity="0.6" />
    </svg>
  );
}
