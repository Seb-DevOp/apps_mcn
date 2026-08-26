"use client";

import { memo, useEffect, useState } from "react";
import { useI18n } from "./I18nProvider";
import { formatNumber } from "./format";
import type { Resources } from "@/lib/engine/resources";
import { GemIcon, ItemIcon, RebirthIcon } from "./ui/Icons";

/**
 * THE FOUR NUMBERS, EVERYWHERE
 *
 * Power, gold, gems and relics were each shown on the one screen that spent
 * them: gold in the arena, gems in the shop, relics under Lives. Which meant
 * every question that crosses two screens — can I afford this chest, is this
 * coat worth the gems I am about to spend on a chest instead — was a tab away
 * from its own answer.
 *
 * It lives in the layout, so it survives navigation rather than being rebuilt by
 * each page. That is also why it cannot simply take a prop and be done: the
 * arena's gold moves several times a second and the layout is rendered once.
 * The screens that have live numbers publish them; the bar listens, and only
 * asks the server itself when nothing has spoken for a while — so the
 * leaderboard and the profile stay honest without making the arena answer the
 * same question twice.
 */

const RESOURCE_EVENT = "mcn:resources";

/** Called by whichever screen currently knows more than the layout does. */
export function publishResources(values: Resources) {
  window.dispatchEvent(new CustomEvent<Resources>(RESOURCE_EVENT, { detail: values }));
}

/** If nothing has published for this long, the bar goes and asks. */
const STALE_MS = 25_000;
const CHECK_MS = 10_000;

export const ResourceBar = memo(function ResourceBar({ initial }: { initial: Resources }) {
  const { t } = useI18n();
  const [values, setValues] = useState(initial);

  // A navigation re-renders the layout with fresh numbers from the server.
  useEffect(() => setValues(initial), [initial]);

  useEffect(() => {
    let heard = Date.now();

    const listen = (event: Event) => {
      heard = Date.now();
      setValues((event as CustomEvent<Resources>).detail);
    };
    window.addEventListener(RESOURCE_EVENT, listen);

    const timer = window.setInterval(async () => {
      if (Date.now() - heard < STALE_MS) return;
      try {
        const response = await fetch("/api/idle", { cache: "no-store" });
        const data = await response.json();
        if (data.ok) {
          heard = Date.now();
          setValues({
            score: data.state.score,
            gold: data.state.gold,
            gems: data.state.shop.gems,
            relics: data.state.rebirth.relics,
          });
        }
      } catch {
        // A dropped read is harmless: the next pass settles the same elapsed time.
      }
    }, CHECK_MS);

    return () => {
      window.removeEventListener(RESOURCE_EVENT, listen);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="top-bar">
      <Cell
        label={t("idle.score")}
        value={formatNumber(values.score)}
        colour="var(--parchment)"
        icon={<ItemIcon icon="sword" size={13} />}
      />
      <Cell
        label={t("idle.gold")}
        value={formatNumber(values.gold)}
        colour="var(--gold-bright)"
        icon={<ItemIcon icon="gold" size={13} />}
      />
      <Cell
        label={t("shop.gems")}
        value={formatNumber(values.gems)}
        colour="#8ef0ff"
        icon={<GemIcon size={13} />}
      />
      <Cell
        label={t("rebirth.relics")}
        value={formatNumber(values.relics)}
        colour="#c9a2ff"
        icon={<RebirthIcon size={13} />}
      />
    </div>
  );
});

function Cell({
  label,
  value,
  colour,
  icon,
}: {
  label: string;
  value: string;
  colour: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="top-cell">
      <span className="top-cell-label">
        <span style={{ color: colour, opacity: 0.75 }}>{icon}</span>
        {label}
      </span>
      <span className="tabular top-cell-value" style={{ color: colour }}>
        {value}
      </span>
    </div>
  );
}
