"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import type { MissionView } from "@/lib/engine/state";
import { ITEM_BY_KEY } from "@/lib/content/items";
import { useI18n } from "./I18nProvider";
import { RankUpOverlay } from "./RankUpOverlay";
import { XpIcon, ShardIcon, ItemIcon } from "./ui/Icons";

/**
 * Missions.
 *
 * Progress is read from the server — the client cannot advance a goal, only ask
 * to be paid for one that is already complete. A completed, unclaimed mission is
 * the loudest thing on the screen, because that is the moment worth returning for.
 */
export function MissionsBoard({
  daily,
  weekly,
  resetMs,
}: {
  daily: MissionView[];
  weekly: MissionView[];
  resetMs: number;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [tab, setTab] = useState<"DAILY" | "WEEKLY">("DAILY");
  const [rankUp, setRankUp] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const list = tab === "DAILY" ? daily : weekly;
  const hours = Math.floor(resetMs / 3_600_000);
  const minutes = Math.floor((resetMs % 3_600_000) / 60_000);

  async function claim(missionId: string) {
    setBusy(missionId);
    try {
      const response = await fetch("/api/missions/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ missionId }),
      });
      const data = await response.json();
      if (data.ok && data.rankUp?.toKey) setRankUp(data.rankUp.toKey);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="pt-5">
      <header className="text-center">
        <p className="eyebrow">{t("app.vault")}</p>
        <h1 className="display gold-text mt-0.5 text-2xl">{t("missions.title")}</h1>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {(["DAILY", "WEEKLY"] as const).map((scope) => (
          <button
            key={scope}
            type="button"
            onClick={() => setTab(scope)}
            data-active={tab === scope}
            className="min-h-11 rounded-xl border border-[rgba(201,162,77,0.2)] bg-[rgba(23,32,62,0.5)] text-sm transition data-[active=true]:border-[rgba(240,208,137,0.6)] data-[active=true]:bg-[rgba(201,162,77,0.14)] data-[active=true]:text-[var(--gold-bright)]"
          >
            {t(scope === "DAILY" ? "missions.daily" : "missions.weekly")}
          </button>
        ))}
      </div>

      {tab === "DAILY" && (
        <p className="dim mt-2 text-center text-xs">
          {t("missions.resetsIn", { time: `${hours}h ${minutes}m` })}
        </p>
      )}

      <div className="mt-4 space-y-3">
        {list.length === 0 && <p className="dim text-center text-sm">{t("missions.empty")}</p>}
        {list.map((mission, index) => (
          <MissionRow
            key={mission.id}
            mission={mission}
            index={index}
            busy={busy === mission.id}
            onClaim={() => claim(mission.id)}
          />
        ))}
      </div>

      <RankUpOverlay toRankKey={rankUp} onClose={() => setRankUp(null)} />
    </main>
  );
}

function MissionRow({
  mission,
  index,
  busy,
  onClaim,
}: {
  mission: MissionView;
  index: number;
  busy: boolean;
  onClaim: () => void;
}) {
  const { t, L } = useI18n();
  const ready = mission.complete && !mission.claimed;
  const ratio = Math.min(1, mission.progress / mission.target);

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={`panel p-4 ${ready ? "panel-gilded" : ""} ${mission.claimed ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-[var(--parchment)]">{L(mission.nameEn, mission.nameFr)}</p>
        <span className="tabular shrink-0 text-xs text-[var(--text-dim)]">
          {Math.min(mission.progress, mission.target)}/{mission.target}
        </span>
      </div>

      <div className="track mt-2.5">
        <div className="track-fill" style={{ width: `${Math.max(2, ratio * 100)}%` }} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <ul className="flex flex-wrap items-center gap-2">
          {mission.rewards.map((reward, i) => {
            const def = reward.itemKey ? ITEM_BY_KEY[reward.itemKey] : undefined;
            return (
              <li
                key={i}
                className="flex items-center gap-1 rounded-md border border-[rgba(201,162,77,0.2)] bg-[rgba(5,8,15,0.45)] px-2 py-1 text-xs"
              >
                <span className="text-[var(--gold)]">
                  {reward.type === "XP" ? (
                    <XpIcon size={13} />
                  ) : reward.type === "SHARD" ? (
                    <ShardIcon size={13} />
                  ) : (
                    <ItemIcon icon={def?.icon ?? "crystal"} size={13} />
                  )}
                </span>
                <span className="tabular">{reward.qty}</span>
              </li>
            );
          })}
        </ul>

        {mission.claimed ? (
          <span className="display text-xs text-[var(--text-dim)]">{t("missions.claimed")}</span>
        ) : (
          <button
            type="button"
            onClick={onClaim}
            disabled={!ready || busy}
            className={`btn ${ready ? "btn-gold" : "btn-ghost"} !min-h-10 !px-4 !text-xs`}
          >
            {t("missions.claim")}
          </button>
        )}
      </div>
    </motion.article>
  );
}
