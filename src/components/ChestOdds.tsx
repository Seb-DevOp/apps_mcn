"use client";

import { motion } from "framer-motion";
import { CHEST_BY_KEY } from "@/lib/content/chests";
import { ITEM_BY_KEY, RARITY_STYLE, type Rarity } from "@/lib/content/items";
import { EQUIPMENT_BY_KEY } from "@/lib/content/equipment";
import { CHEST_EQUIPMENT_DROPS, EQUIPMENT_DROP_DENOMINATOR } from "@/lib/content/forge";
import { useI18n } from "./I18nProvider";

/**
 * Transparent odds.
 *
 * These are the actual weights the server draws from — not a marketing summary.
 * A player who wants to know what a chest can give them can always find out, and
 * the guaranteed line makes the "never nothing" promise checkable.
 */
export function ChestOdds({ chestKey, onClose }: { chestKey: string; onClose: () => void }) {
  const { t, L } = useI18n();
  const chest = CHEST_BY_KEY[chestKey];
  if (!chest) return null;

  const guaranteed = chest.entries.filter((e) => e.guaranteed);
  const pool = chest.entries.filter((e) => !e.guaranteed && e.weight > 0);
  const totalWeight = pool.reduce((sum, e) => sum + e.weight, 0);
  const equipmentTable = CHEST_EQUIPMENT_DROPS[chestKey] ?? [];

  function labelFor(itemKey: string | undefined, rewardType: string) {
    if (rewardType === "XP") return t("reward.xp");
    if (rewardType === "SHARD") return t("reward.shard");
    const def = itemKey ? ITEM_BY_KEY[itemKey] : undefined;
    return def ? L(def.nameEn, def.nameFr) : t("reward.item");
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(3,6,14,0.9)]"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 28 }}
        onClick={(event) => event.stopPropagation()}
        className="panel panel-gilded max-h-[82dvh] w-full max-w-[30rem] overflow-y-auto rounded-b-none p-5"
      >
        <p className="eyebrow">{t("chest.oddsTitle")}</p>
        <h3 className="display mt-1 text-lg text-[var(--parchment)]">
          {L(chest.nameEn, chest.nameFr)}
        </h3>
        <p className="dim mt-2 text-xs">{t("chest.oddsIntro")}</p>
        <p className="mt-1 text-xs text-[var(--sapphire-pale)]">
          {t("chest.draws", { count: chest.draws })}
        </p>

        <ul className="mt-4 space-y-2">
          {guaranteed.map((entry, index) => (
            <OddsRow
              key={`g-${index}`}
              label={labelFor(entry.itemKey, entry.rewardType)}
              range={`${entry.minQty}–${entry.maxQty}`}
              chance={t("chest.guaranteed")}
              rarity={entry.rarity}
              highlight
            />
          ))}
          {pool.map((entry, index) => (
            <OddsRow
              key={`p-${index}`}
              label={labelFor(entry.itemKey, entry.rewardType)}
              range={`${entry.minQty}–${entry.maxQty}`}
              chance={t("chest.chance", {
                percent: ((entry.weight / totalWeight) * 100).toFixed(1),
              })}
              rarity={entry.rarity}
            />
          ))}
        </ul>

        {/* Equipment sits outside the weighted pool, so it gets its own honest line. */}
        {equipmentTable.length > 0 && (
          <>
            <p className="eyebrow mt-5">{t("chest.equipmentTitle")}</p>
            <p className="mt-1 text-xs text-[var(--sapphire-pale)]">
              {t("chest.equipmentChance", {
                percent: (
                  (equipmentTable.reduce((sum, e) => sum + e.weight, 0) /
                    EQUIPMENT_DROP_DENOMINATOR) *
                  100
                ).toFixed(1),
              })}
            </p>
            <ul className="mt-2 space-y-2">
              {equipmentTable.map((entry) => {
                const def = EQUIPMENT_BY_KEY[entry.defKey];
                if (!def) return null;
                return (
                  <OddsRow
                    key={entry.defKey}
                    label={L(def.nameEn, def.nameFr)}
                    range="1"
                    chance={t("chest.chance", {
                      percent: ((entry.weight / EQUIPMENT_DROP_DENOMINATOR) * 100).toFixed(1),
                    })}
                    rarity={def.rarity}
                  />
                );
              })}
            </ul>
          </>
        )}

        <button type="button" onClick={onClose} className="btn btn-ghost mt-5 w-full">
          {t("common.close")}
        </button>
      </motion.div>
    </motion.div>
  );
}

function OddsRow({
  label,
  range,
  chance,
  rarity,
  highlight = false,
}: {
  label: string;
  range: string;
  chance: string;
  rarity: Rarity;
  highlight?: boolean;
}) {
  const style = RARITY_STYLE[rarity];
  return (
    <li
      className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
      style={{
        borderColor: highlight ? `${style.color}77` : "rgba(201,162,77,0.16)",
        background: highlight ? `${style.glow}` : "rgba(5,8,15,0.4)",
      }}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm text-[var(--parchment)]">{label}</span>
        <span className="tabular text-[0.68rem] text-[var(--text-dim)]">×{range}</span>
      </span>
      <span className="tabular shrink-0 text-xs" style={{ color: style.color }}>
        {chance}
      </span>
    </li>
  );
}
