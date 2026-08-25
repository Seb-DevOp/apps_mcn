"use client";

import { useCallback, useEffect, useState } from "react";
import type { IdleState } from "@/lib/engine/idle";
import { IdleRebirth } from "./IdleRebirth";
import { IdleShop } from "./IdleShop";
import { LootPrompt, type LootEntry } from "./LootPrompt";
import { useI18n } from "./I18nProvider";
import { formatNumber } from "./format";
import { GemIcon } from "./ui/Icons";

/**
 * The shell the Shop and Rebirth screens share.
 *
 * They are pages of their own now rather than tabs inside the fight, so each
 * needs what the fight already had: the state, a way to act on it, and a clock
 * that keeps the currency honest while you shop. What they do *not* need is the
 * replay loop — that belongs to the arena, and running it behind a shop would
 * spend a frame budget on a fight nobody is watching.
 *
 * The loot card comes along, though. A chest that says nothing about what it
 * gave is the reason this file changed, and what it gave is exactly the decision
 * a drop is: wear it, sell it, or keep it.
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

  /**
   * What a chest just gave, waiting for an answer.
   *
   * Buying one and being told nothing was the whole complaint: the piece went
   * silently into the bag and the only evidence was a counter going up. It is the
   * same decision a drop is, so it gets the same card.
   */
  const [loot, setLoot] = useState<LootEntry[]>([]);
  const dismissLoot = useCallback((id: string) => {
    setLoot((current) => current.filter((entry) => entry.id !== id));
  }, []);

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
      if (data.ok) {
        const next = data.state as IdleState;
        setState(next);

        if (typeof data.itemId === "string") {
          const item = next.items.find((entry) => entry.id === data.itemId);
          if (item) {
            setLoot((current) => [
              ...current,
              {
                id: item.id,
                slot: item.slot,
                floor: item.floor,
                rarity: item.rarity,
                equipped: item.equipped,
              },
            ].slice(-3));
          }
        }
      }
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
        {/* The Shop counts in gems and the Rebirth screen in gold, because that
            is what each of them spends. A header showing the wrong currency is a
            header nobody reads twice. */}
        {panel === "SHOP" ? (
          <div className="mt-2 flex items-center justify-center gap-2">
            <span style={{ color: "#8ef0ff" }}>
              <GemIcon size={20} />
            </span>
            <span className="tabular text-2xl" style={{ color: "#8ef0ff" }}>
              {formatNumber(state.shop.gems)}
            </span>
          </div>
        ) : (
          <p className="gold-text tabular mt-2 text-2xl">{formatNumber(state.gold)}</p>
        )}
        <p className="dim text-[0.6rem] uppercase tracking-widest">
          {t(panel === "SHOP" ? "shop.gems" : "idle.gold")}
        </p>
      </header>

      {panel === "SHOP" ? (
        <IdleShop state={state} busy={busy} act={act} />
      ) : (
        <IdleRebirth state={state} busy={busy} act={act} />
      )}

      <LootPrompt
        queue={loot}
        items={state.items}
        busy={busy}
        onAct={act}
        onDismiss={dismissLoot}
      />
    </div>
  );
}
