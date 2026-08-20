"use client";

import type { StreakDayDef } from "@/lib/content/chests";
import { useI18n } from "./I18nProvider";
import { StreakIcon, ShieldIcon } from "./ui/Icons";

/**
 * The seven-day cycle, shown as seven candles.
 *
 * Anticipation without pressure: the player can see day seven coming, and the
 * Shield count next to it says plainly that one missed day will not undo them.
 */
export function StreakStrip({
  currentStreak,
  bestStreak,
  shields,
  cycle,
  todayDay,
}: {
  currentStreak: number;
  bestStreak: number;
  shields: number;
  cycle: StreakDayDef[];
  todayDay: number;
}) {
  const { t, L } = useI18n();

  return (
    <section className="panel p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          <StreakIcon size={18} className="text-[var(--candle)] candle" />
          <span className="display text-sm text-[var(--parchment)]">
            {t("streak.days", { count: currentStreak })}
          </span>
        </span>
        <span className="tabular text-xs text-[var(--text-dim)]">
          {t("streak.best", { count: bestStreak })}
        </span>
      </div>

      <ol className="mt-3 grid grid-cols-7 gap-1.5">
        {cycle.map((day) => {
          const reached = day.day < todayDay;
          const isToday = day.day === todayDay;
          return (
            <li
              key={day.day}
              className="flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-center"
              style={{
                borderColor: isToday
                  ? "rgba(240,208,137,0.65)"
                  : reached
                    ? "rgba(79,147,255,0.35)"
                    : "rgba(201,162,77,0.14)",
                background: isToday
                  ? "rgba(201,162,77,0.12)"
                  : reached
                    ? "rgba(79,147,255,0.08)"
                    : "rgba(5,8,15,0.4)",
              }}
            >
              <span
                className="display text-[0.7rem]"
                style={{
                  color: isToday
                    ? "var(--gold-bright)"
                    : reached
                      ? "var(--sapphire-pale)"
                      : "var(--text-dim)",
                }}
              >
                {day.day}
              </span>
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: day.day === 7 ? "var(--gold-bright)" : "var(--sapphire)",
                  opacity: reached || isToday ? 1 : 0.3,
                  boxShadow: isToday ? "0 0 8px var(--gold-bright)" : undefined,
                }}
              />
            </li>
          );
        })}
      </ol>

      <p className="dim mt-2 text-center text-[0.68rem]">
        {L(cycle[todayDay - 1]?.labelEn ?? "", cycle[todayDay - 1]?.labelFr ?? "")}
      </p>

      <div className="mt-3 flex items-start gap-2 rounded-lg border border-[rgba(79,147,255,0.24)] bg-[rgba(79,147,255,0.07)] px-3 py-2">
        <ShieldIcon size={16} className="mt-0.5 shrink-0 text-[var(--sapphire-pale)]" />
        <div>
          <p className="text-xs text-[var(--sapphire-pale)]">
            {shields === 1 ? t("streak.shield", { count: shields }) : t("streak.shields", { count: shields })}
          </p>
          <p className="dim text-[0.68rem]">{t("streak.shieldExplain")}</p>
        </div>
      </div>
    </section>
  );
}
