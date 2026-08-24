"use client";

import { useCallback, useEffect, useState } from "react";
import type { IdleState } from "@/lib/engine/idle";
import { IdleRebirth } from "./IdleRebirth";
import { IdleShop } from "./IdleShop";
import { useI18n } from "./I18nProvider";
import { formatNumber } from "./format";

/**
 * The shell the Shop and Rebirth screens share.
 *
 * They are pages of their own now rather than tabs inside the fight, so each
 * needs what the fight already had: the state, a way to act on it, and a clock
 * that keeps the gold figure honest while you shop. What they do *not* need is
 * the replay loop or the loot cards — those belong to the arena, and running
 * them behind a shop would spend a frame budget on a fight nobody is watching.
 *
 * The sync is slower here for the same reason. Nothing on these screens moves
 * between answers except the gold, and gold that lags a few seconds costs a
 * player nothing.
 */
const SYNC_INTERVAL_MS = 20_000;

export function IdlePanelShell({
  initial,
  panel,
}: {
  initial: IdleState;
  panel: "SHOP" | "REBIRTH";
}) {
  const { t } = useI18n();
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  const sync = useCallback(async () => {
    try {
      const response = await fetch("/api/idle", { cache: "no-store" });
      const data = await response.json();
      if (data.ok) setState(data.state as IdleState);
    } catch {
      // A dropped sync is harmless: the next one settles the same elapsed time.
    }
  }, []);

  const act = useCallback(async (body: Record<string, unknown>, key: string) => {
    setBusy(key);
    try {
      const response = await fetch("/api/idle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (data.ok) setState(data.state as IdleState);
    } catch {
      // Silent: the next sync repairs the display either way.
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(sync, SYNC_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [sync]);

  return (
    <div className="pb-4">
      <header className="pt-5 text-center">
        <p className="eyebrow">
          {t(panel === "SHOP" ? "idle.tabShop" : "idle.tabRebirth")}
        </p>
        <p className="gold-text tabular mt-2 text-2xl">{formatNumber(state.gold)}</p>
        <p className="dim text-[0.6rem] uppercase tracking-widest">{t("idle.gold")}</p>
      </header>

      {panel === "SHOP" ? (
        <IdleShop state={state} busy={busy} act={act} />
      ) : (
        <IdleRebirth state={state} busy={busy} act={act} />
      )}
    </div>
  );
}
