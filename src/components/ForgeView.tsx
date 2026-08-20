"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ITEM_BY_KEY, RARITY_STYLE, type Rarity } from "@/lib/content/items";
import { RANKS } from "@/lib/content/ranks";
import type { ForgeState, ForgeEntry } from "@/lib/engine/forge";
import { useI18n } from "./I18nProvider";
import { ItemIcon, ShardIcon } from "./ui/Icons";

/**
 * THE FORGE
 *
 * The collector's road. Everything the Armory sells can also be built from parts
 * the Daily Chest hands out — which is what makes a fragment worth keeping, and
 * what gives a player who never buys anything a real way to the same weapons.
 *
 * Recipes are shown in full, with what you hold beside what you need. Nothing is
 * hidden behind a "craft" button that fails.
 */
export function ForgeView({ initial }: { initial: ForgeState }) {
  const { t, L } = useI18n();
  const router = useRouter();

  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  async function act(action: "craft" | "dismantle", defKey: string) {
    setBusy(defKey);
    setError(null);
    try {
      const response = await fetch("/api/forge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, defKey }),
      });
      const data = await response.json();
      if (!data.ok) {
        setError(
          data.error === "MISSING_PARTS"
            ? t("forge.missingParts")
            : data.error === "NOT_ENOUGH_SHARDS"
              ? t("armory.notEnoughShards")
              : data.error === "PROTECTED"
                ? t("forge.protected")
                : t("common.error"),
        );
        return;
      }
      setState(data.forge as ForgeState);
      setConfirming(null);
      router.refresh();
    } catch {
      setError(t("common.error"));
    } finally {
      setBusy(null);
    }
  }

  // Closest to completion first: the piece a player can almost build is the one
  // worth showing them.
  const buildable = state.entries
    .filter((entry) => !entry.owned && !entry.rankLocked)
    .sort((a, b) => completion(b) - completion(a));
  const owned = state.entries.filter((entry) => entry.owned);
  const locked = state.entries.filter((entry) => !entry.owned && entry.rankLocked);

  return (
    <>
      <p className="dim mt-3 text-center text-[0.72rem] italic">{t("forge.intro")}</p>

      {error && <p className="mt-3 text-center text-sm text-red-300">{error}</p>}

      <Section title={t("forge.buildable")} count={buildable.length}>
        {buildable.map((entry, index) => (
          <ForgeRow
            key={entry.def.key}
            entry={entry}
            index={index}
            busy={busy === entry.def.key}
            onCraft={() => act("craft", entry.def.key)}
          />
        ))}
      </Section>

      <Section title={t("forge.inYourArmory")} count={owned.length}>
        {owned.map((entry, index) => (
          <OwnedRow
            key={entry.def.key}
            entry={entry}
            index={index}
            busy={busy === entry.def.key}
            confirming={confirming === entry.def.key}
            onAsk={() => setConfirming(entry.def.key)}
            onCancel={() => setConfirming(null)}
            onDismantle={() => act("dismantle", entry.def.key)}
          />
        ))}
      </Section>

      {locked.length > 0 && (
        <Section title={t("forge.sealed")} count={locked.length}>
          {locked.map((entry) => {
            const rank = RANKS[entry.def.requiredRankOrder];
            const style = RARITY_STYLE[entry.def.rarity as Rarity];
            return (
              <div
                key={entry.def.key}
                className="panel flex items-center gap-3 p-3 opacity-55"
                style={{ borderColor: `${style.color}22` }}
              >
                <span style={{ color: style.color }}>
                  <ItemIcon icon={entry.def.icon} size={20} />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-[var(--parchment)]">
                  {L(entry.def.nameEn, entry.def.nameFr)}
                </span>
                <span className="shrink-0 text-[0.65rem] text-[var(--text-dim)]">
                  🔒 {L(rank.nameEn, rank.nameFr)}
                </span>
              </div>
            );
          })}
        </Section>
      )}
    </>
  );
}

function completion(entry: ForgeEntry): number {
  if (entry.lines.length === 0) return 0;
  const ratio =
    entry.lines.reduce((sum, line) => sum + Math.min(1, line.owned / line.needed), 0) /
    entry.lines.length;
  return ratio + (entry.shardsOk ? 0.001 : 0);
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section className="mt-5">
      <p className="eyebrow">
        {title} · {count}
      </p>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}

function RecipeLines({ entry }: { entry: ForgeEntry }) {
  const { L } = useI18n();
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5">
      {entry.lines.map((line) => {
        const def = ITEM_BY_KEY[line.itemKey];
        const enough = line.owned >= line.needed;
        return (
          <li
            key={line.itemKey}
            className="flex items-center gap-1 rounded-md border px-2 py-1 text-[0.66rem]"
            style={{
              borderColor: enough ? "rgba(105,195,154,0.45)" : "rgba(201,90,90,0.4)",
              background: enough ? "rgba(105,195,154,0.1)" : "rgba(201,90,90,0.08)",
              color: enough ? "#8fd8b6" : "#e0a2a2",
            }}
          >
            <ItemIcon icon={def?.icon ?? "crystal"} size={12} />
            <span className="tabular">
              {line.owned}/{line.needed}
            </span>
            <span className="max-w-[7.5rem] truncate opacity-80">
              {def ? L(def.nameEn, def.nameFr) : line.itemKey}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ForgeRow({
  entry,
  index,
  busy,
  onCraft,
}: {
  entry: ForgeEntry;
  index: number;
  busy: boolean;
  onCraft: () => void;
}) {
  const { t, L } = useI18n();
  const style = RARITY_STYLE[entry.def.rarity as Rarity];

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      className={`panel p-3 ${entry.craftable ? "panel-gilded" : ""}`}
      style={{ borderColor: entry.craftable ? undefined : `${style.color}30` }}
    >
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border"
          style={{
            borderColor: `${style.color}55`,
            color: style.color,
            background: `radial-gradient(circle at 50% 40%, ${style.glow}, rgba(5,8,15,0.7))`,
          }}
        >
          <ItemIcon icon={entry.def.icon} size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="display block truncate text-sm text-[var(--parchment)]">
            {L(entry.def.nameEn, entry.def.nameFr)}
          </span>
          <span className="text-[0.6rem] uppercase tracking-[0.14em]" style={{ color: style.color }}>
            {t(`rarity.${entry.def.rarity}`)}
          </span>
        </span>
        <span
          className="tabular flex shrink-0 items-center gap-1 text-xs"
          style={{ color: entry.shardsOk ? "var(--gold-bright)" : "#e0a2a2" }}
        >
          <ShardIcon size={12} />
          {entry.recipe.shards.toLocaleString()}
        </span>
      </div>

      <RecipeLines entry={entry} />

      <button
        type="button"
        disabled={!entry.craftable || busy}
        onClick={onCraft}
        className={`btn mt-3 w-full !min-h-10 !text-xs ${entry.craftable ? "btn-gold" : "btn-ghost"}`}
      >
        {t("forge.craft")}
      </button>
    </motion.article>
  );
}

function OwnedRow({
  entry,
  index,
  busy,
  confirming,
  onAsk,
  onCancel,
  onDismantle,
}: {
  entry: ForgeEntry;
  index: number;
  busy: boolean;
  confirming: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onDismantle: () => void;
}) {
  const { t, L } = useI18n();
  const style = RARITY_STYLE[entry.def.rarity as Rarity];

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      className="panel p-3"
      style={{ borderColor: `${style.color}30` }}
    >
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border"
          style={{ borderColor: `${style.color}55`, color: style.color }}
        >
          <ItemIcon icon={entry.def.icon} size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="display block truncate text-sm text-[var(--parchment)]">
            {L(entry.def.nameEn, entry.def.nameFr)}
          </span>
          <span className="tabular text-[0.65rem] text-[var(--sapphire-pale)]">
            {t("armory.level", { level: entry.level })}
          </span>
        </span>

        {entry.protected ? (
          <span className="shrink-0 text-[0.62rem] text-[var(--text-dim)]">
            {t("forge.protectedShort")}
          </span>
        ) : !confirming ? (
          <button
            type="button"
            onClick={onAsk}
            className="btn btn-ghost shrink-0 !min-h-9 !px-3 !text-[0.65rem]"
          >
            {t("forge.dismantle")}
          </button>
        ) : null}
      </div>

      {confirming && entry.dismantle && (
        <div className="mt-3 rounded-lg border border-[rgba(201,90,90,0.35)] bg-[rgba(201,90,90,0.08)] p-3">
          <p className="text-xs text-[var(--parchment)]">{t("forge.dismantleWarning")}</p>
          <p className="eyebrow mt-2">{t("forge.dismantleYield")}</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {entry.dismantle.lines.map((line) => {
              const def = ITEM_BY_KEY[line.itemKey];
              return (
                <li
                  key={line.itemKey}
                  className="flex items-center gap-1 rounded-md border border-[rgba(201,162,77,0.25)] px-2 py-1 text-[0.66rem] text-[var(--parchment)]"
                >
                  <ItemIcon icon={def?.icon ?? "crystal"} size={12} />
                  <span className="tabular">×{line.quantity}</span>
                  <span className="max-w-[7rem] truncate opacity-80">
                    {def ? L(def.nameEn, def.nameFr) : line.itemKey}
                  </span>
                </li>
              );
            })}
            {entry.dismantle.shards > 0 && (
              <li className="flex items-center gap-1 rounded-md border border-[rgba(201,162,77,0.25)] px-2 py-1 text-[0.66rem] text-[var(--gold-bright)]">
                <ShardIcon size={12} />
                <span className="tabular">×{entry.dismantle.shards}</span>
              </li>
            )}
          </ul>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onDismantle}
              className="btn btn-ghost !min-h-10 !text-xs"
            >
              {t("forge.dismantleConfirm")}
            </button>
            <button type="button" onClick={onCancel} className="btn btn-royal !min-h-10 !text-xs">
              {t("common.close")}
            </button>
          </div>
        </div>
      )}
    </motion.article>
  );
}
