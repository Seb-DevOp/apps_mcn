/**
 * Idle numbers outgrow every reader long before they outgrow the game, so past a
 * few thousand only the leading digits carry meaning.
 *
 * Its own file because both the arena and the bag need it, and a component that
 * exports a helper makes the other component import a screen to read a number.
 */
const SUFFIXES = ["", "k", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "∞";
  const n = Math.floor(value);
  if (n < 1000) return String(n);

  let tier = 0;
  let scaled = n;
  while (scaled >= 1000 && tier < SUFFIXES.length - 1) {
    scaled /= 1000;
    tier += 1;
  }
  // Past the last suffix the only honest thing left is the exponent.
  if (scaled >= 1000) return n.toExponential(2);
  return `${scaled.toFixed(scaled < 10 ? 2 : scaled < 100 ? 1 : 0)}${SUFFIXES[tier]}`;
}

/**
 * A multiplier, with the decimals that carry its meaning.
 *
 * `formatNumber` floors, which is right for damage and wrong for a factor:
 * ×2.65 became "×2" and the two levels between them disappeared.
 */
export function formatFactor(value: number): string {
  if (!Number.isFinite(value)) return "∞";
  if (value < 10) return value.toFixed(2);
  if (value < 1000) return value.toFixed(1);
  return formatNumber(value);
}

/**
 * What wearing a piece would do, written so a person can read it.
 *
 * A percentage is the right unit for an incremental upgrade and the wrong one
 * for a first piece on a bare cat, where the honest answer is "+46171596%".
 * Past a factor of ten the multiplier is what the number actually means.
 */
export function formatGain(gain: number): string {
  if (!Number.isFinite(gain) || gain <= 0) return "";
  if (gain >= 10) return `×${formatNumber(gain)}`;
  // Losses are the other half of the question. A bag that only ever says how
  // much better something is leaves "would this cost me power?" unanswered, and
  // that is the one the player is actually asking while holding forty pieces.
  if (gain <= 0.1) return `÷${formatNumber(1 / gain)}`;
  const percent = Math.round((gain - 1) * 100);
  if (percent === 0) return gain >= 1 ? "+0%" : "−0%";
  return `${percent > 0 ? "+" : "−"}${Math.abs(percent)}%`;
}
