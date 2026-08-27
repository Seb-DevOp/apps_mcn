"use client";

import { motion } from "framer-motion";
import { SKIN_BY_KEY } from "@/lib/content/idle";
import type { IdleState } from "@/lib/engine/idle";
import { CatCanvas } from "./CatCanvas";
import { useI18n } from "./I18nProvider";
import { formatNumber } from "./format";
import { GemIcon, ItemIcon } from "./ui/Icons";

/**
 * THIRTY DOORS
 *
 * One a day, and a missed day costs the day rather than the progress. Door
 * seven is door seven whether it is opened on Tuesday or a fortnight later —
 * which is why the grid draws a *count*, not a month: there are no dates on it
 * to be behind on.
 *
 * The fifteenth is drawn as the cat it gives, at the size the shop draws its
 * coats. A calendar whose prize is a word nobody can picture is a calendar
 * nobody walks towards.
 */
export function IdleCalendar({
  state,
  busy,
  act,
  claim,
}: {
  state: IdleState;
  busy: string | null;
  act: (body: Record<string, unknown>, key: string) => void;
  claim?: Record<string, unknown> | null;
}) {
  const { t, L } = useI18n();
  const { calendar } = state;
  const ready = calendar.claimable;

  return (
    <section className="mt-4">
      <div className="flex items-baseline justify-between">
        <h2 className="eyebrow">{t("calendar.title")}</h2>
        <span className="dim tabular text-[0.62rem]">
          {t("calendar.cycle", { n: calendar.cycle + 1 })}
        </span>
      </div>
      <p className="dim mt-1 text-[0.68rem] italic">{t("calendar.hint")}</p>

      <div className="mt-2 grid grid-cols-6 gap-1.5">
        {calendar.days.map((door) => {
          const isSkin = door.kind === "SKIN";
          const open = door.next && ready;
          return (
            <motion.button
              key={door.day}
              type="button"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: Math.min(door.day, 18) * 0.012 }}
              disabled={!open || busy !== null}
              onClick={() => act({ action: "calendar" }, "calendar")}
              className="panel relative flex aspect-square flex-col items-center justify-center gap-0.5 p-0.5 transition disabled:opacity-100"
              style={{
                // Three states, three treatments: opened is spent and steps back,
                // the next one is lit, the rest simply wait.
                borderColor: open
                  ? "rgba(201,162,77,0.85)"
                  : door.next
                    ? "rgba(201,162,77,0.4)"
                    : isSkin
                      ? "rgba(142,240,255,0.45)"
                      : undefined,
                background: door.opened
                  ? "rgba(255,255,255,0.03)"
                  : open
                    ? "rgba(201,162,77,0.14)"
                    : isSkin
                      ? "rgba(142,240,255,0.07)"
                      : undefined,
                opacity: door.opened ? 0.42 : 1,
                boxShadow: open ? "0 0 14px rgba(201,162,77,0.35)" : undefined,
              }}
            >
              <span className="dim tabular absolute left-1 top-0.5 text-[0.5rem] leading-none">
                {door.day}
              </span>
              <Content door={door} />
            </motion.button>
          );
        })}
      </div>

      {/* The coat this calendar is holding, drawn rather than named. */}
      {calendar.skin && (
        <div className="panel mt-2 flex items-center gap-3 p-2.5">
          <CatCanvas worn={[]} size={62} breathing={false} skin={calendar.skin} />
          <div className="min-w-0 flex-1">
            <p className="dim text-[0.58rem] uppercase tracking-widest">
              {t("calendar.prize", { n: 15 })}
            </p>
            <p className="text-[0.78rem]" style={{ color: "#8ef0ff" }}>
              {L(SKIN_BY_KEY[calendar.skin].nameEn, SKIN_BY_KEY[calendar.skin].nameFr)}
            </p>
            <p className="dim mt-0.5 text-[0.62rem] italic">{t("calendar.prizeHint")}</p>
          </div>
        </div>
      )}

      {/* What the door just gave. The gem counter at the top of the screen does
          move, but a reward you have to go and check is not a reward. */}
      {claim && <Given claim={claim} />}

      <button
        type="button"
        className="btn btn-gold mt-2 w-full py-2.5 text-[0.8rem] disabled:opacity-45"
        disabled={!ready || busy !== null}
        onClick={() => act({ action: "calendar" }, "calendar")}
      >
        {ready
          ? t("calendar.open", { n: calendar.day })
          : t("calendar.tomorrow", { time: countdown(calendar.nextInSeconds) })}
      </button>
    </section>
  );
}

/** The line a door leaves behind when it opens. */
function Given({ claim }: { claim: Record<string, unknown> }) {
  const { t, L } = useI18n();
  const gems = Number(claim.gems ?? 0);
  const gold = Number(claim.gold ?? 0);
  const skin = typeof claim.skin === "string" ? claim.skin : null;
  const boost = typeof claim.boost === "string" ? claim.boost : null;

  const said = skin
    ? t("calendar.gotSkin", {
        name: L(SKIN_BY_KEY[skin]?.nameEn ?? skin, SKIN_BY_KEY[skin]?.nameFr ?? skin),
      })
    : boost
      ? t("calendar.gotBoost")
      : gems > 0
        ? t("calendar.gotGems", { n: gems })
        : gold > 0
          ? t("calendar.gotGold", { n: formatNumber(gold) })
          : null;

  if (!said) return null;
  return (
    <motion.p
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-2 text-center text-[0.74rem]"
      style={{ color: "var(--gold-bright)" }}
    >
      {said}
    </motion.p>
  );
}

/** What a door holds, in the smallest space that still says it. */
function Content({ door }: { door: IdleState["calendar"]["days"][number] }) {
  const { t } = useI18n();

  if (door.kind === "SKIN") {
    return <span className="text-[0.9rem] leading-none">🐈</span>;
  }
  if (door.kind === "BOOST") {
    return (
      <span style={{ color: "#c9a2ff" }}>
        <ItemIcon icon={door.boost === "gold" ? "gold" : door.boost === "damage" ? "sword" : "key"} size={15} />
      </span>
    );
  }
  if (door.kind === "GEMS") {
    return (
      <>
        <span style={{ color: "#8ef0ff" }}>
          <GemIcon size={13} />
        </span>
        <span className="tabular text-[0.55rem] leading-none" style={{ color: "#8ef0ff" }}>
          {door.amount}
        </span>
      </>
    );
  }
  return (
    <>
      <span className="text-[var(--gold)]">
        <ItemIcon icon="gold" size={13} />
      </span>
      <span className="tabular text-[0.5rem] leading-none text-[var(--gold-bright)]">
        {t("calendar.minutes", { n: door.amount })}
      </span>
    </>
  );
}

/** Hours and minutes to the next door. Seconds would be a clock nobody needs. */
function countdown(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours} h ${String(minutes).padStart(2, "0")}` : `${minutes} min`;
}
