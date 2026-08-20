/**
 * All daily/weekly boundaries are UTC.
 *
 * This is deliberate: if day boundaries followed the device clock, changing the
 * phone's timezone would hand out extra daily chests. One global reset also gives
 * the community a shared rhythm — Vault Friday happens for everyone at once.
 */

export function dayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

export function previousDayKey(key: string): string {
  const d = new Date(`${key}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return dayKey(d);
}

export function daysBetween(fromKey: string, toKey: string): number {
  const a = Date.parse(`${fromKey}T00:00:00.000Z`);
  const b = Date.parse(`${toKey}T00:00:00.000Z`);
  return Math.round((b - a) / 86_400_000);
}

/** ISO-8601 week key, e.g. "2026-W34". */
export function weekKey(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // Monday = 1 … Sunday = 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // move to the Thursday of this week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Milliseconds until the next UTC midnight — drives the "next chest in…" timer. */
export function msUntilNextDay(now: Date = new Date()): number {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next.getTime() - now.getTime();
}

/** Friday, UTC — the weekly Vault Friday ritual. */
export function isVaultFriday(now: Date = new Date()): boolean {
  return now.getUTCDay() === 5;
}
