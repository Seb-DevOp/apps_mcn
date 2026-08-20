"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { RARITY_STYLE, ITEM_BY_KEY, type Rarity } from "@/lib/content/items";
import { RANKS } from "@/lib/content/ranks";
import { ABILITIES, type EquipStats, type EquipSlot } from "@/lib/content/equipment";
import type { ArmoryState, ArmoryEntry } from "@/lib/engine/loadout";
import { useI18n } from "./I18nProvider";
import { ItemIcon, ShardIcon } from "./ui/Icons";

/**
 * THE ARMORY
 *
 * An ancient weapon chamber, not a shop grid: dark stone, gold banding, each
 * piece lit by its own rarity. The loadout sits at the top because the question a
 * returning player asks is "what am I carrying?", not "what is for sale?".
 *
 * Every number shown here is the number the server will apply.
 */

const STAT_ORDER: (keyof EquipStats)[] = [
  "xpBonus",
  "shardBonus",
  "scoreBonus",
  "precisionMs",
  "comboGuard",
  "chestFortune",
];

function formatStat(key: keyof EquipStats, value: number): string {
  if (value === 0) return "—";
  if (key === "precisionMs") return `+${Math.round(value)} ms`;
  if (key === "comboGuard" || key === "chestFortune") return `+${Math.round(value)}`;
  return `+${Math.round(value * 100)}%`;
}

type Filter = "ALL" | "SCEPTER" | "BOW" | "SWORD" | "MAGIC_SWORD" | EquipSlot;

const FILTERS: { key: Filter; labelKey: string }[] = [
  { key: "ALL", labelKey: "armory.all" },
  { key: "SCEPTER", labelKey: "class.SCEPTER" },
  { key: "BOW", labelKey: "class.BOW" },
  { key: "SWORD", labelKey: "class.SWORD" },
  { key: "MAGIC_SWORD", labelKey: "class.MAGIC_SWORD" },
  { key: "ARMOR", labelKey: "slot.ARMOR" },
  { key: "CLOAK", labelKey: "slot.CLOAK" },
  { key: "RELIC", labelKey: "slot.RELIC" },
  { key: "ACCESSORY", labelKey: "slot.ACCESSORY" },
];

export function ArmoryView({ initial }: { initial: ArmoryState }) {
  const { t, L } = useI18n();
  const router = useRouter();

  const [state, setState] = useState(initial);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byKey = useMemo(
    () => new Map(state.entries.map((entry) => [entry.def.key, entry])),
    [state.entries],
  );

  const equipped = useMemo(() => {
    const map = new Map<string, ArmoryEntry>();
    for (const entry of state.entries) if (entry.equippedSlot) map.set(entry.equippedSlot, entry);
    return map;
  }, [state.entries]);

  const visible = state.entries.filter((entry) => {
    if (filter === "ALL") return true;
    if (entry.def.weaponClass === filter) return true;
    return entry.def.slot === filter && !entry.def.weaponClass;
  });

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/armory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!data.ok) {
        setError(
          data.error === "NOT_ENOUGH_SHARDS"
            ? t("armory.notEnoughShards")
            : data.error === "ALREADY_OWNED"
              ? t("armory.alreadyOwned")
              : data.error === "NOT_ENOUGH_MATERIALS"
                ? t("armory.notEnoughMaterials", { qty: "", material: "" }).replace("  ", " ")
                : t("common.error"),
        );
        return;
      }
      setState(data as ArmoryState);
      router.refresh();
    } catch {
      setError(t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  const detail = open ? byKey.get(open) : null;

  return (
    <>
      {/* --- Loadout ------------------------------------------------------- */}
      <section className="panel panel-gilded mt-4 p-4">
        <div className="flex items-center justify-between">
          <p className="eyebrow">{t("armory.loadout")}</p>
          <span className="flex items-center gap-1 text-sm text-[var(--sapphire-pale)]">
            <ShardIcon size={14} />
            <span className="tabular">{state.shards.toLocaleString()}</span>
          </span>
        </div>

        <ul className="mt-3 grid grid-cols-5 gap-1.5">
          {state.slots.map((slot) => {
            const entry = equipped.get(slot);
            const style = entry ? RARITY_STYLE[entry.def.rarity as Rarity] : null;
            return (
              <li key={slot}>
                <button
                  type="button"
                  onClick={() => entry && setOpen(entry.def.key)}
                  className="flex w-full flex-col items-center gap-1 rounded-xl border px-1 py-2.5"
                  style={{
                    borderColor: style ? `${style.color}66` : "rgba(201,162,77,0.15)",
                    background: style
                      ? `linear-gradient(180deg, ${style.glow}, rgba(5,8,15,0.6))`
                      : "rgba(5,8,15,0.4)",
                  }}
                >
                  <span style={{ color: style?.color ?? "var(--text-dim)" }}>
                    <ItemIcon icon={entry?.def.icon ?? "crystal"} size={20} />
                  </span>
                  <span className="text-[0.55rem] uppercase tracking-[0.1em] text-[var(--text-dim)]">
                    {t(`slot.${slot}`)}
                  </span>
                  {entry && (
                    <span className="tabular text-[0.6rem]" style={{ color: style?.color }}>
                      {entry.level}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {/* --- Active bonuses --------------------------------------------- */}
        <p className="eyebrow mt-4">{t("armory.activeBonuses")}</p>
        {STAT_ORDER.every((key) => (state.equippedStats[key] ?? 0) === 0) ? (
          <p className="dim mt-1 text-xs">{t("armory.noBonuses")}</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {STAT_ORDER.filter((key) => (state.equippedStats[key] ?? 0) !== 0).map((key) => (
              <li
                key={key}
                className="rounded-md border border-[rgba(79,147,255,0.3)] bg-[rgba(79,147,255,0.1)] px-2 py-1 text-[0.68rem] text-[var(--sapphire-pale)]"
              >
                {t(`stat.${key}`)}{" "}
                <span className="tabular text-[var(--gold-bright)]">
                  {formatStat(key, state.equippedStats[key] ?? 0)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="dim mt-4 text-center text-[0.7rem] italic">{t("armory.strategyNote")}</p>

      {/* --- Filters ------------------------------------------------------- */}
      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setFilter(entry.key)}
            data-active={filter === entry.key}
            className="min-h-9 shrink-0 rounded-full border border-[rgba(201,162,77,0.2)] bg-[rgba(23,32,62,0.5)] px-3.5 text-xs transition data-[active=true]:border-[rgba(240,208,137,0.6)] data-[active=true]:bg-[rgba(201,162,77,0.14)] data-[active=true]:text-[var(--gold-bright)]"
          >
            {t(entry.labelKey)}
          </button>
        ))}
      </div>

      {filter !== "ALL" && filter in { SCEPTER: 1, BOW: 1, SWORD: 1, MAGIC_SWORD: 1 } && (
        <p className="dim mt-2 text-center text-[0.7rem]">{t(`classId.${filter}`)}</p>
      )}

      {/* --- Pedestals ----------------------------------------------------- */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        {visible.map((entry, index) => (
          <Pedestal key={entry.def.key} entry={entry} index={index} onOpen={() => setOpen(entry.def.key)} />
        ))}
      </div>

      {/* --- Detail sheet -------------------------------------------------- */}
      <AnimatePresence>
        {detail && (
          <Detail
            entry={detail}
            busy={busy}
            error={error}
            onClose={() => {
              setOpen(null);
              setError(null);
            }}
            onAct={act}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function Pedestal({
  entry,
  index,
  onOpen,
}: {
  entry: ArmoryEntry;
  index: number;
  onOpen: () => void;
}) {
  const { t, L } = useI18n();
  const style = RARITY_STYLE[entry.def.rarity as Rarity];
  const dim = !entry.owned && entry.rankLocked;

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      className="panel relative flex flex-col items-center gap-2 p-3 text-center"
      style={{
        borderColor: entry.equippedSlot ? `${style.color}aa` : `${style.color}33`,
        opacity: dim ? 0.55 : 1,
      }}
    >
      {entry.equippedSlot && (
        <span className="absolute right-2 top-2 rounded bg-[rgba(240,208,137,0.18)] px-1.5 py-0.5 text-[0.55rem] uppercase tracking-wider text-[var(--gold-bright)]">
          {t("armory.equipped")}
        </span>
      )}

      <span
        className="flex h-14 w-14 items-center justify-center rounded-xl border"
        style={{
          borderColor: `${style.color}55`,
          color: style.color,
          background: `radial-gradient(circle at 50% 40%, ${style.glow}, rgba(5,8,15,0.7))`,
          boxShadow: entry.owned ? `0 0 18px -6px ${style.glow}` : undefined,
        }}
      >
        <ItemIcon icon={entry.def.icon} size={28} />
      </span>

      <span className="display line-clamp-2 text-[0.72rem] leading-tight text-[var(--parchment)]">
        {L(entry.def.nameEn, entry.def.nameFr)}
      </span>

      <span className="text-[0.6rem] uppercase tracking-[0.14em]" style={{ color: style.color }}>
        {t(`rarity.${entry.def.rarity}`)}
      </span>

      {entry.owned ? (
        <span className="tabular text-[0.65rem] text-[var(--sapphire-pale)]">
          {t("armory.level", { level: entry.level })}
        </span>
      ) : entry.rankLocked ? (
        <span className="text-[0.6rem] text-[var(--text-dim)]">
          🔒 {L(RANKS[entry.def.requiredRankOrder].nameEn, RANKS[entry.def.requiredRankOrder].nameFr)}
        </span>
      ) : (
        <span className="tabular flex items-center gap-1 text-[0.65rem] text-[var(--gold-bright)]">
          <ShardIcon size={11} />
          {entry.def.shardPrice.toLocaleString()}
        </span>
      )}
    </motion.button>
  );
}

function Detail({
  entry,
  busy,
  error,
  onClose,
  onAct,
}: {
  entry: ArmoryEntry;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onAct: (body: Record<string, unknown>) => void;
}) {
  const { t, L, locale } = useI18n();
  const style = RARITY_STYLE[entry.def.rarity as Rarity];
  const ability = entry.def.ability ? ABILITIES[entry.def.ability] : null;
  const rank = RANKS[entry.def.requiredRankOrder];
  const material = entry.upgrade ? ITEM_BY_KEY[entry.upgrade.itemKey] : null;
  const materialShort = entry.upgrade
    ? entry.upgrade.owned >= entry.upgrade.quantity
    : true;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(3,6,14,0.9)]"
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 220, damping: 28 }}
        onClick={(event) => event.stopPropagation()}
        className="panel panel-gilded max-h-[86dvh] w-full max-w-[30rem] overflow-y-auto rounded-b-none p-5"
      >
        <div className="flex items-start gap-3">
          <span
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border"
            style={{
              borderColor: `${style.color}66`,
              color: style.color,
              background: `radial-gradient(circle at 50% 40%, ${style.glow}, rgba(5,8,15,0.7))`,
            }}
          >
            <ItemIcon icon={entry.def.icon} size={32} />
          </span>
          <div className="min-w-0">
            <p className="display text-base text-[var(--parchment)]">
              {L(entry.def.nameEn, entry.def.nameFr)}
            </p>
            <p className="text-[0.68rem] uppercase tracking-[0.16em]" style={{ color: style.color }}>
              {t(`rarity.${entry.def.rarity}`)}
              {entry.def.weaponClass ? ` · ${t(`class.${entry.def.weaponClass}`)}` : ` · ${t(`slot.${entry.def.slot}`)}`}
            </p>
            {entry.owned && (
              <p className="tabular text-xs text-[var(--sapphire-pale)]">
                {entry.level >= entry.def.maxLevel
                  ? t("armory.maxLevel")
                  : t("armory.level", { level: entry.level })}
              </p>
            )}
          </div>
        </div>

        <p className="dim mt-3 text-sm italic">{L(entry.def.descEn, entry.def.descFr)}</p>

        {/* Stats, with the next level shown beside them so upgrading is never blind. */}
        <ul className="mt-4 space-y-1.5">
          {STAT_ORDER.filter((key) => (entry.stats[key] ?? 0) !== 0).map((key) => (
            <li
              key={key}
              className="flex items-center justify-between rounded-lg border border-[rgba(201,162,77,0.16)] bg-[rgba(5,8,15,0.4)] px-3 py-2"
            >
              <span className="min-w-0">
                <span className="block text-sm text-[var(--parchment)]">{t(`stat.${key}`)}</span>
                <span className="dim block text-[0.65rem]">{t(`statHelp.${key}`)}</span>
              </span>
              <span className="tabular shrink-0 text-right">
                <span className="display text-[var(--gold-bright)]">
                  {formatStat(key, entry.stats[key] ?? 0)}
                </span>
                {entry.nextStats && (entry.nextStats[key] ?? 0) !== (entry.stats[key] ?? 0) && (
                  <span className="block text-[0.62rem] text-[var(--sapphire-pale)]">
                    → {formatStat(key, entry.nextStats[key] ?? 0)}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>

        {ability && (
          <div className="mt-4 rounded-xl border border-[rgba(79,147,255,0.3)] bg-[rgba(79,147,255,0.08)] p-3">
            <p className="eyebrow">{t("armory.ability")}</p>
            <p className="display mt-0.5 text-sm text-[var(--sapphire-pale)]">
              {L(ability.nameEn, ability.nameFr)}
            </p>
            <p className="dim text-xs">{L(ability.descEn, ability.descFr)}</p>
          </div>
        )}

        {/* --- Actions ---------------------------------------------------- */}
        <div className="mt-5 space-y-2">
          {!entry.owned && entry.rankLocked && (
            <p className="rounded-lg border border-[rgba(201,162,77,0.25)] px-3 py-2 text-center text-xs text-[var(--text-dim)]">
              🔒 {t("armory.requires", { rank: L(rank.nameEn, rank.nameFr) })}
            </p>
          )}

          {!entry.owned && !entry.rankLocked && (
            <button
              type="button"
              disabled={busy || !entry.affordable}
              onClick={() => onAct({ action: "buy", defKey: entry.def.key })}
              className="btn btn-gold w-full"
            >
              {t("armory.buy")} · {entry.def.shardPrice.toLocaleString()}
            </button>
          )}

          {entry.owned && !entry.equippedSlot && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onAct({ action: "equip", defKey: entry.def.key })}
              className="btn btn-royal w-full"
            >
              {t("armory.equip")}
            </button>
          )}

          {entry.owned && entry.equippedSlot && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onAct({ action: "unequip", slot: entry.equippedSlot })}
              className="btn btn-ghost w-full"
            >
              {t("armory.unequip")}
            </button>
          )}

          {entry.owned && entry.upgrade && (
            <div className="rounded-xl border border-[rgba(201,162,77,0.2)] bg-[rgba(5,8,15,0.4)] p-3">
              <p className="eyebrow">{t("armory.upgradeCost")}</p>
              <div className="mt-1.5 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-[var(--sapphire-pale)]">
                  <ShardIcon size={13} />
                  <span className="tabular">{entry.upgrade.shards.toLocaleString()}</span>
                </span>
                <span
                  className="tabular"
                  style={{ color: materialShort ? "var(--parchment)" : "#c96a6a" }}
                >
                  {entry.upgrade.owned}/{entry.upgrade.quantity} ×{" "}
                  {material ? L(material.nameEn, material.nameFr) : entry.upgrade.itemKey}
                </span>
              </div>
              <button
                type="button"
                disabled={busy || !materialShort}
                onClick={() => onAct({ action: "upgrade", defKey: entry.def.key })}
                className="btn btn-gold mt-3 w-full !min-h-11 !text-xs"
              >
                {t("armory.upgrade")}
              </button>
            </div>
          )}

          {error && <p className="text-center text-sm text-red-300">{error}</p>}

          <button type="button" onClick={onClose} className="btn btn-ghost w-full !min-h-11 !text-xs">
            {t("common.close")}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
