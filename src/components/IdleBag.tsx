"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { RARITIES, SLOTS, itemName, type Rarity, type Slot } from "@/lib/content/idle";
import { RARITY_STYLE } from "@/lib/content/items";
import type { IdleState } from "@/lib/engine/idle";
import { CatCanvas, type WornPiece } from "./CatCanvas";
import { useI18n } from "./I18nProvider";
import { formatNumber } from "./format";
import { ItemIcon } from "./ui/Icons";

/**
 * THE BAG
 *
 * The cat, everything it owns, and two buttons that mean nobody has to tap
 * through a hundred commons: wear the best of each slot, and sell everything
 * under a rarity in one go.
 *
 * It is a tab rather than a page because the fight does not stop while you sort —
 * the server keeps resolving time either way, and coming back to the arena should
 * be instant rather than a navigation.
 */
export function IdleBag({
  state,
  busy,
  act,
}: {
  state: IdleState;
  busy: string | null;
  act: (body: Record<string, unknown>, key: string) => void;
}) {
  const { t, locale } = useI18n();

  const worn = useMemo<WornPiece[]>(
    () =>
      state.items
        .filter((item) => item.equipped)
        .map((item) => ({ slot: item.slot, shape: item.shape, rarity: item.rarity })),
    [state.items],
  );

  const wornBySlot = useMemo(
    () => new Map(state.items.filter((i) => i.equipped).map((i) => [i.slot, i])),
    [state.items],
  );

  const spares = useMemo(
    () => state.items.filter((item) => !item.equipped),
    [state.items],
  );

  /** Slots where the bag holds something better than what is on the cat. */
  const upgradesWaiting = useMemo(() => {
    let count = 0;
    for (const slot of SLOTS) {
      const current = wornBySlot.get(slot)?.power ?? 0;
      if (spares.some((item) => item.slot === slot && item.power > current)) count += 1;
    }
    return count;
  }, [spares, wornBySlot]);

  /**
   * What each "sell everything under this" button would take and pay.
   * Thresholds with nothing under them are not shown: a button that does nothing
   * is worse than no button.
   */
  const sellLots = useMemo(
    () =>
      // Stops at Epic on purpose: "sell everything below Mythic" is "sell all"
      // wearing a hat, and that button already exists at the bottom.
      RARITIES.slice(1, 4)
        .map((rarity) => {
          const limit = RARITIES.indexOf(rarity);
          const doomed = spares.filter((item) => RARITIES.indexOf(item.rarity) < limit);
          return {
            rarity,
            count: doomed.length,
            gold: doomed.reduce((sum, item) => sum + Math.max(1, Math.round(item.power * 4)), 0),
          };
        })
        .filter((lot) => lot.count > 0),
    [spares],
  );

  return (
    <div className="pb-4">
      {/* --- The cat, as it currently stands --------------------------- */}
      <div className="panel panel-sapphire mt-4 flex justify-center py-3">
        <CatCanvas worn={worn} size={190} />
      </div>

      <h2 className="eyebrow mt-5">{t("idle.equipped")}</h2>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {SLOTS.map((slot) => {
          const item = wornBySlot.get(slot);
          const style = item ? RARITY_STYLE[item.rarity] : null;
          const better = spares.some(
            (spare) => spare.slot === slot && spare.power > (item?.power ?? 0),
          );
          return (
            <div
              key={slot}
              className="panel relative p-2 text-center"
              style={style ? { borderColor: `${style.color}55` } : { opacity: 0.5 }}
            >
              {better && (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[#7ed08f]" />
              )}
              <p className="dim text-[0.6rem] uppercase tracking-widest">
                {t(`idle.slot.${slot}`)}
              </p>
              {item ? (
                <>
                  <p
                    className="mt-1 line-clamp-2 text-[0.66rem] leading-tight"
                    style={{ color: style!.color }}
                  >
                    {itemName(item.slot, item.floor, item.rarity, locale)}
                  </p>
                  <p className="tabular mt-1 text-[0.62rem] text-[var(--parchment)]">
                    {formatNumber(item.power)}
                    <span className="dim"> · </span>
                    <span className="text-[#7ed08f]">{formatNumber(item.vitality)}</span>
                  </p>
                </>
              ) : (
                <p className="dim mt-1 text-[0.68rem]">{t("idle.empty")}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* --- The two buttons that make a bag bearable ------------------- */}
      <div className="mt-4 space-y-2">
        <button
          type="button"
          className="btn btn-gold w-full py-2 text-[0.8rem] disabled:opacity-40"
          disabled={upgradesWaiting === 0 || busy !== null}
          onClick={() => act({ action: "equipBest" }, "equipBest")}
        >
          {upgradesWaiting > 0
            ? t("idle.equipBestCount", { n: upgradesWaiting })
            : t("idle.equipBestNone")}
        </button>

        {sellLots.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {sellLots.map((lot) => {
              const style = RARITY_STYLE[lot.rarity];
              return (
                <button
                  key={lot.rarity}
                  type="button"
                  className="panel flex flex-1 items-center gap-2 px-2 py-2 text-left text-[0.68rem] disabled:opacity-40"
                  disabled={busy !== null}
                  onClick={() => act({ action: "sellBelow", rarity: lot.rarity }, `sell-${lot.rarity}`)}
                  style={{ borderColor: `${style.color}55` }}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: style.color }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[var(--parchment)]">
                      {t("idle.sellUnder", { rarity: t(`idle.rarity.${lot.rarity}`) })}
                    </span>
                    <span className="dim tabular block text-[0.62rem]">
                      {lot.count} · +{formatNumber(lot.gold)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* --- Everything else it owns ------------------------------------ */}
      <h2 className="eyebrow mt-6">{t("idle.spares", { n: spares.length })}</h2>

      {spares.length === 0 ? (
        <p className="dim mt-2 text-center text-[0.72rem] italic">{t("idle.bagEmpty")}</p>
      ) : (
        <div className="mt-2 space-y-4">
          {SLOTS.map((slot) => {
            const forSlot = spares
              .filter((item) => item.slot === slot)
              .sort((a, b) => b.power - a.power);
            if (forSlot.length === 0) return null;
            const current = wornBySlot.get(slot)?.power ?? 0;

            return (
              <div key={slot}>
                <p className="dim text-[0.62rem] uppercase tracking-widest">
                  {t(`idle.slot.${slot}`)}
                </p>
                <div className="mt-1.5 space-y-1.5">
                  {forSlot.map((item, index) => (
                    <Row
                      key={item.id}
                      item={item}
                      index={index}
                      better={item.power > current}
                      busy={busy !== null}
                      onEquip={() => act({ action: "equip", itemId: item.id }, item.id)}
                      onSell={() => act({ action: "sell", itemId: item.id }, item.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          <button
            type="button"
            className="btn btn-ghost w-full py-2 text-[0.72rem]"
            disabled={busy !== null}
            onClick={() => act({ action: "sellAll" }, "sellAll")}
          >
            {t("idle.sellAll")}
          </button>
        </div>
      )}
    </div>
  );
}

function Row({
  item,
  index,
  better,
  busy,
  onEquip,
  onSell,
}: {
  item: IdleState["items"][number];
  index: number;
  better: boolean;
  busy: boolean;
  onEquip: () => void;
  onSell: () => void;
}) {
  const { t, locale } = useI18n();
  const style = RARITY_STYLE[item.rarity as Rarity];

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 6) * 0.02 }}
      className="panel flex items-center gap-2 p-2"
      style={{ borderColor: better ? "rgba(126,208,143,0.5)" : `${style.color}33` }}
    >
      <span style={{ color: style.color }}>
        <ItemIcon icon="badge" size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.72rem]" style={{ color: style.color }}>
          {itemName(item.slot as Slot, item.floor, item.rarity as Rarity, locale)}
        </p>
        <p className="dim tabular text-[0.64rem]">
          {formatNumber(item.power)} · <span className="text-[#7ed08f]">{formatNumber(item.vitality)}</span>
          {better && <span className="text-[#7ed08f]"> · {t("idle.better")}</span>}
        </p>
      </div>
      <button
        type="button"
        className="btn btn-royal px-2 py-1 text-[0.68rem]"
        disabled={busy}
        onClick={onEquip}
      >
        {t("idle.equip")}
      </button>
      <button
        type="button"
        className="btn btn-ghost px-2 py-1 text-[0.68rem]"
        disabled={busy}
        onClick={onSell}
      >
        {t("idle.sell")}
      </button>
    </motion.div>
  );
}
