"use client";

import { motion } from "framer-motion";
import { ITEM_BY_KEY, RARITY_STYLE, type Rarity } from "@/lib/content/items";
import { EQUIPMENT_BY_KEY } from "@/lib/content/equipment";
import { useI18n } from "./I18nProvider";
import { ItemIcon, ShardIcon, XpIcon } from "./ui/Icons";

export interface RewardLike {
  type: string;
  itemKey?: string | null;
  qty: number;
  rarity?: Rarity;
}

/**
 * One reward, read at a glance.
 *
 * Rarity is never signalled by text colour alone — the ring, the glow and the
 * icon treatment all change with it, so the difference is visible before the
 * label is read.
 */
export function RewardChip({ reward, index = 0 }: { reward: RewardLike; index?: number }) {
  const { t, L } = useI18n();
  // Equipment lives in its own catalogue, not the inventory one.
  const equip = reward.type === "EQUIPMENT" && reward.itemKey ? EQUIPMENT_BY_KEY[reward.itemKey] : undefined;
  const def = !equip && reward.itemKey ? ITEM_BY_KEY[reward.itemKey] : undefined;
  const rarity: Rarity = reward.rarity ?? equip?.rarity ?? def?.rarity ?? "COMMON";
  const style = RARITY_STYLE[rarity];

  const label =
    reward.type === "XP"
      ? t("reward.xp")
      : reward.type === "SHARD"
        ? t("reward.shard")
        : equip
          ? L(equip.nameEn, equip.nameFr)
          : def
            ? L(def.nameEn, def.nameFr)
            : t("reward.item");

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.08 * index, duration: 0.4, ease: "easeOut" }}
      className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
      style={{
        borderColor: `${style.color}55`,
        background: `linear-gradient(180deg, ${style.glow}, rgba(10,17,40,0.75))`,
        boxShadow: `0 0 20px -8px ${style.glow}`,
      }}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border"
        style={{ borderColor: `${style.color}66`, color: style.color, background: "rgba(5,8,15,0.6)" }}
      >
        {reward.type === "XP" ? (
          <XpIcon size={20} />
        ) : reward.type === "SHARD" ? (
          <ShardIcon size={20} />
        ) : (
          <ItemIcon icon={equip?.icon ?? def?.icon ?? "crystal"} size={20} />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-[var(--parchment)]">{label}</span>
        <span className="text-[0.68rem] uppercase tracking-[0.16em]" style={{ color: style.color }}>
          {t(`rarity.${rarity}`)}
        </span>
      </span>

      <span className="tabular display shrink-0 text-base" style={{ color: style.color }}>
        ×{reward.qty.toLocaleString()}
      </span>
    </motion.div>
  );
}

export function RewardRow({ rewards }: { rewards: RewardLike[] }) {
  return (
    <div className="flex flex-col gap-2">
      {rewards.map((reward, index) => (
        <RewardChip key={`${reward.type}-${reward.itemKey ?? "x"}-${index}`} reward={reward} index={index} />
      ))}
    </div>
  );
}
