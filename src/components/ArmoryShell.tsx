"use client";

import { useState } from "react";
import type { ArmoryState } from "@/lib/engine/loadout";
import type { ForgeState } from "@/lib/engine/forge";
import { useI18n } from "./I18nProvider";
import { ArmoryView } from "./ArmoryView";
import { ForgeView } from "./ForgeView";

/**
 * Two rooms, one door.
 *
 * The Armory and the Forge are the same chamber in the fiction and the same
 * decision for the player — "how do I get that weapon?" — so they share a screen
 * rather than competing for a slot in a five-item navigation bar.
 */
export function ArmoryShell({
  armory,
  forge,
}: {
  armory: ArmoryState;
  forge: ForgeState;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"ARMORY" | "FORGE">("ARMORY");

  return (
    <main className="pt-5">
      <header className="text-center">
        <p className="eyebrow">{t("app.subtitle")}</p>
        <h1 className="display gold-text mt-0.5 text-2xl">
          {tab === "ARMORY" ? t("armory.title") : t("forge.title")}
        </h1>
        <p className="dim mt-1 text-xs italic">
          {tab === "ARMORY" ? t("armory.subtitle") : t("forge.subtitle")}
        </p>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {(["ARMORY", "FORGE"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            data-active={tab === key}
            className="min-h-11 rounded-xl border border-[rgba(201,162,77,0.2)] bg-[rgba(23,32,62,0.5)] text-sm transition data-[active=true]:border-[rgba(240,208,137,0.6)] data-[active=true]:bg-[rgba(201,162,77,0.14)] data-[active=true]:text-[var(--gold-bright)]"
          >
            {key === "ARMORY" ? t("armory.tabArmory") : t("armory.tabForge")}
          </button>
        ))}
      </div>

      {tab === "ARMORY" ? <ArmoryView initial={armory} /> : <ForgeView initial={forge} />}
    </main>
  );
}
