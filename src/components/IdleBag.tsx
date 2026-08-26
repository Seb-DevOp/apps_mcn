"use client";

import { memo, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  RARITIES,
  RARITY_STYLE,
  SLOTS,
  affixLabel,
  itemName,
  rarityWeights,
  weaponFor,
  type Rarity,
  type Slot,
} from "@/lib/content/idle";
import type { IdleState } from "@/lib/engine/idle";
import { CatCanvas, type WornPiece } from "./CatCanvas";
import { ItemArt } from "./ItemArt";
import { useI18n } from "./I18nProvider";
import { formatGain, formatNumber } from "./format";
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
/**
 * Memoised, and it matters more here than anywhere.
 *
 * The replay ticks a dozen times a second whichever tab is open, so a bag of
 * seventy tiles — each one an SVG — was being reconciled a dozen times a second
 * while the player read it. Nothing in it moves between two syncs.
 */
export const IdleBag = memo(function IdleBag({
  state,
  busy,
  act,
}: {
  state: IdleState;
  busy: string | null;
  act: (body: Record<string, unknown>, key: string) => void;
}) {
  const { t, locale } = useI18n();

  // Which cat is being dressed. Only ever offered once the Pack exists — a
  // toggle with one option is a toggle that lies about having a choice.
  const packOpen = state.unlocks.some((entry) => entry.key === "pack" && entry.open);
  const [dressing, setDressing] = useState<"CAT" | "PACK">("CAT");
  const [selected, setSelected] = useState<string | null>(null);
  const [slotFilter, setSlotFilter] = useState<Slot | null>(null);
  const [rarityFilter, setRarityFilter] = useState<Rarity | null>(null);
  const [sellingAll, setSellingAll] = useState(false);
  const onPack = packOpen && dressing === "PACK";

  const worn = useMemo<WornPiece[]>(
    () =>
      state.items
        .filter((item) => item.equipped && item.onPack === onPack)
        .map((item) => ({
          slot: item.slot,
          shape: item.shape,
          rarity: item.rarity,
          // Only the hands carry one; the other five ignore it.
          weapon: weaponFor(item.id),
        })),
    [state.items, onPack],
  );

  const wornBySlot = useMemo(
    () => new Map(state.items.filter((i) => i.equipped && i.onPack === onPack).map((i) => [i.slot, i])),
    [state.items, onPack],
  );

  // Anything on the other cat is not a spare — it is busy.
  const spares = useMemo(
    () => state.items.filter((item) => !item.equipped && !item.onPack),
    [state.items],
  );

/**
   * Slots where the bag holds something better.
   *
   * "Better" is the server's own verdict, carried on each spare as `gain` — the
   * ratio the whole cat's combat score would move by. Comparing raw power here
   * would disagree with the recommendation button the moment a weaker piece
   * carries a bonus, and two different answers to the same question is worse than
   * either of them.
   */
  const upgradesWaiting = useMemo(
    () => SLOTS.filter((slot) => spares.some((i) => i.slot === slot && i.gain > 1.0001)).length,
    [spares],
  );

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

  /**
   * What the grid shows: the filters applied, best first.
   *
   * Sorted by what wearing the piece would do rather than by when it was found,
   * because that is the order the player reads them in — the tile worth tapping
   * should be the first one.
   */
  const shown = useMemo(
    () =>
      spares
        .filter((item) => (slotFilter ? item.slot === slotFilter : true))
        .filter((item) => (rarityFilter ? item.rarity === rarityFilter : true))
        .sort((a, b) => b.gain - a.gain),
    [spares, slotFilter, rarityFilter],
  );

  /**
   * What each Nose threshold would actually catch, at this depth.
   *
   * The odds move with the floor and with every life spent: "sell below
   * Uncommon" catches a third of finds on floor ten and one in twenty-five on
   * floor thirty, because depth thins the commons out of the table. A setting
   * that quietly stops doing anything is indistinguishable from one that is
   * broken, so the chip says what it is worth here rather than leaving the
   * player to conclude the feature is dead.
   */
  const flair = useMemo(() => {
    const weights = rarityWeights(state.level.floor, state.rebirth.rebirths);
    const total = weights.reduce((sum, entry) => sum + entry.weight, 0);
    const share = new Map<Rarity, number>();
    let below = 0;
    for (const entry of weights) {
      share.set(entry.rarity, total > 0 ? below / total : 0);
      below += entry.weight;
    }
    return {
      share,
      // Only rarities that can actually fall here. Offering a threshold for
      // something the table cannot produce is offering a setting that does
      // nothing, which is the problem this is fixing.
      offered: weights
        .filter((entry) => entry.weight > 0 && entry.rarity !== "COMMON")
        .map((entry) => entry.rarity),
    };
  }, [state.level.floor, state.rebirth.rebirths]);

  /** Rarities worn at least twice: below that there is no set to speak of. */
  const sealTiers = useMemo(
    () => state.seals.worn.filter((tier) => tier.count >= 2).sort((a, b) => b.count - a.count),
    [state.seals.worn],
  );

  // The tile that is open, if it still exists — selling one leaves an id behind.
  const chosen = spares.find((item) => item.id === selected) ?? null;

  return (
    <div className="pb-4">
      {packOpen && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {(["CAT", "PACK"] as const).map((who) => (
            <button
              key={who}
              type="button"
              onClick={() => setDressing(who)}
              className="panel py-2 text-[0.74rem] uppercase tracking-widest transition"
              style={{
                borderColor: dressing === who ? "rgba(201,162,77,0.6)" : undefined,
                color: dressing === who ? "var(--gold-bright)" : "var(--text-dim)",
              }}
            >
              {t(who === "CAT" ? "pack.first" : "pack.second")}
            </button>
          ))}
        </div>
      )}

      {/* --- The cat, as it currently stands --------------------------- */}
      <div className="panel panel-sapphire mt-4 flex justify-center py-3">
        <CatCanvas worn={worn} size={190} skin={state.shop.skinKey} />
      </div>

      {/* --- What it all comes to ---------------------------------- */}
      <div className="panel mt-3 flex items-center justify-between px-3 py-2">
        <span className="dim text-[0.6rem] uppercase tracking-widest">{t("idle.score")}</span>
        <span className="tabular text-[1.05rem] text-[var(--gold-bright)]">
          {formatNumber(state.score)}
        </span>
      </div>

      {/*
        The set bonus, with the rung above it.

        The fight only ever needs the best matching set, so that is all the stats
        line ever said — which made the Seals a bonus that arrived by accident and
        was never aimed at. Listing every rarity the cat is actually wearing, and
        what one more piece of it would pay, is what turns them into a decision.
      */}
      {/* The Seals only ever count the first cat, so the frame steps aside
          while the second one is being dressed rather than reporting the wrong
          cat's set. */}
      {state.seals.open && !onPack && (
        <section className="panel mt-2 p-2.5">
          <div className="flex items-baseline justify-between">
            <span className="dim text-[0.6rem] uppercase tracking-widest">{t("bag.seal")}</span>
            <span
              className="tabular text-[0.82rem]"
              style={{
                color: state.seals.active.rarity
                  ? RARITY_STYLE[state.seals.active.rarity].color
                  : "var(--text-faint)",
              }}
            >
              {state.seals.active.rarity
                ? `+${Math.round(state.seals.active.bonus * 100)} %`
                : "—"}
            </span>
          </div>

          {sealTiers.length === 0 ? (
            <p className="dim mt-1 text-[0.66rem] italic">{t("bag.sealNone")}</p>
          ) : (
            <div className="mt-1.5 space-y-1">
              {sealTiers.map((tier) => {
                const style = RARITY_STYLE[tier.rarity];
                const live = tier.bonus > 0;
                return (
                  <div key={tier.rarity} className="flex items-center gap-2 text-[0.66rem]">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: style.color, opacity: live ? 1 : 0.5 }}
                    />
                    <span className="min-w-0 flex-1 truncate" style={{ color: style.color }}>
                      {t(`idle.rarity.${tier.rarity}`)} ×{tier.count}
                    </span>
                    {live && (
                      <span className="tabular text-[#7ed08f]">
                        +{Math.round(tier.bonus * 100)} %
                      </span>
                    )}
                    {tier.next !== null && tier.next > tier.bonus && (
                      <span className="dim tabular">
                        {t("bag.sealNext", { pct: Math.round(tier.next * 100) })}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      <h2 className="eyebrow mt-5">{t("idle.equipped")}</h2>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {SLOTS.map((slot) => {
          const item = wornBySlot.get(slot);
          const style = item ? RARITY_STYLE[item.rarity] : null;
          const better = spares.some((spare) => spare.slot === slot && spare.gain > 1.0001);
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
                  <div className="mt-1 flex justify-center">
                    <ItemArt
                      slot={item.slot}
                      shape={item.shape}
                      rarity={item.rarity}
                      id={item.id}
                      size={40}
                    />
                  </div>
                  <p
                    className="mt-0.5 line-clamp-2 text-[0.62rem] leading-tight"
                    style={{ color: style!.color }}
                  >
                    {itemName(item.slot, item.floor, item.rarity, locale)}
                  </p>
                  <p className="tabular mt-0.5 text-[0.6rem] text-[var(--parchment)]">
                    {formatNumber(item.power)}
                    <span className="dim"> · </span>
                    <span className="text-[#7ed08f]">{formatNumber(item.vitality)}</span>
                  </p>
                </>
              ) : (
                <p className="dim mt-3 text-[0.68rem]">{t("idle.empty")}</p>
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
          disabled={upgradesWaiting === 0 || busy !== null || onPack}
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

      {/* --- The Nose: what never reaches the bag at all ----------------- */}
      {state.unlocks.some((entry) => entry.key === "flair" && entry.open) && (
        <section className="mt-5">
          <h2 className="eyebrow">{t("flair.title")}</h2>
          <p className="dim mt-1 text-[0.68rem] italic">{t("flair.hint")}</p>
          {state.autoSellBelow !== "" && (
            <p className="mt-1 text-[0.66rem] italic" style={{ color: "var(--sapphire-pale)" }}>
              {t("flair.quiet")}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {["", ...flair.offered].map((rarity) => {
              const active = state.autoSellBelow === rarity;
              const style = rarity ? RARITY_STYLE[rarity as Rarity] : null;
              const caught = rarity ? (flair.share.get(rarity as Rarity) ?? 0) : 0;
              return (
                <button
                  key={rarity || "off"}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => act({ action: "autoSell", rarity }, `flair-${rarity}`)}
                  className="panel flex items-center gap-1.5 px-2 py-1.5 text-left text-[0.66rem] transition"
                  style={{
                    borderColor: active ? "rgba(201,162,77,0.6)" : undefined,
                    color: active ? "var(--gold-bright)" : "var(--text-dim)",
                  }}
                >
                  {style && (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: style.color }}
                    />
                  )}
                  {/*
                    Named by what it keeps, not by what it sells.

                    "Sell below Epic" and "I sell everything purple and down" are
                    two readings of the same chip that differ by one rarity, and
                    the difference is invisible until the piece you wanted is
                    gold. What a rule keeps is the half a player checks.
                  */}
                  <span>
                    {rarity ? t("flair.keep", { rarity: t(`idle.rarity.${rarity}`) }) : t("flair.off")}
                    {rarity !== "" && (
                      <span className="dim tabular block text-[0.56rem] leading-tight">
                        {t("flair.share", { pct: Math.round(caught * 100) })}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* --- Everything else it owns ------------------------------------ */}
      <div className="mt-6 flex items-center justify-between">
        <h2 className="eyebrow">{t("idle.spares", { n: spares.length })}</h2>
        {spares.length > 0 && !sellingAll && (
          <button
            type="button"
            className="btn btn-ghost px-3 py-1 text-[0.68rem]"
            disabled={busy !== null}
            onClick={() => setSellingAll(true)}
          >
            {t("idle.sellAll")}
          </button>
        )}
      </div>

      {/*
        One tap used to empty the bag.

        It is the only irreversible button on the screen — a hundred pieces gone,
        and the gold it pays is worth nothing next to a Sovereign helm sold by a
        thumb that meant to tap the tile beside it. So it asks, and it says what
        it is about to take.
      */}
      {sellingAll && spares.length > 0 && (
        <div className="panel mt-2 p-3" style={{ borderColor: "rgba(224,96,63,0.5)" }}>
          <p className="text-[0.74rem] leading-snug text-[#ffb0a0]">
            {t("idle.sellAllAsk", {
              n: spares.length,
              gold: formatNumber(
                spares.reduce((sum, item) => sum + Math.max(1, Math.round(item.power * 4)), 0),
              ),
            })}
          </p>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="btn btn-ghost py-1.5 text-[0.72rem]"
              onClick={() => setSellingAll(false)}
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              className="btn btn-gold py-1.5 text-[0.72rem]"
              disabled={busy !== null}
              onClick={() => {
                setSellingAll(false);
                setSelected(null);
                act({ action: "sellAll" }, "sellAll");
              }}
            >
              {t("idle.sellAll")}
            </button>
          </div>
        </div>
      )}

      {spares.length === 0 ? (
        <p className="dim mt-2 text-center text-[0.72rem] italic">{t("idle.bagEmpty")}</p>
      ) : (
        <>
          {/*
            A grid of squares rather than a list of rows.
            Forty spares as full-width rows is four screens of scrolling to find
            out what you have; as tiles it is one glance. The picture, the rarity
            border and the green corner carry everything a first pass needs, and
            the numbers wait until a tile is picked.
          */}
          {/*
            Two rows of filters rather than a search box.
            Forty pieces is small enough that typing is absurd and large enough
            that hunting for the one Epic helm is a chore. Only the slots and
            rarities actually in the bag get a chip: an empty filter is a button
            that can only disappoint.
          */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip active={slotFilter === null} onPick={() => setSlotFilter(null)}>
              {t("bag.all")}
            </Chip>
            {SLOTS.filter((slot) => spares.some((item) => item.slot === slot)).map((slot) => (
              <Chip
                key={slot}
                active={slotFilter === slot}
                onPick={() => setSlotFilter(slotFilter === slot ? null : slot)}
              >
                {t(`idle.slot.${slot}`)}
              </Chip>
            ))}
          </div>

          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Chip active={rarityFilter === null} onPick={() => setRarityFilter(null)}>
              {t("bag.all")}
            </Chip>
            {RARITIES.filter((rarity) => spares.some((item) => item.rarity === rarity)).map(
              (rarity) => (
                <Chip
                  key={rarity}
                  active={rarityFilter === rarity}
                  colour={RARITY_STYLE[rarity].color}
                  onPick={() => setRarityFilter(rarityFilter === rarity ? null : rarity)}
                >
                  {t(`idle.rarity.${rarity}`)}
                </Chip>
              ),
            )}
          </div>

          {shown.length === 0 ? (
            <p className="dim mt-3 text-center text-[0.72rem] italic">{t("bag.noMatch")}</p>
          ) : (
            <div className="mt-2 grid grid-cols-4 gap-2">
              {shown.map((item, index) => {
                const style = RARITY_STYLE[item.rarity];
                const better = item.gain > 1.0001;
                const picked = selected === item.id;
                return (
                  <motion.button
                    key={item.id}
                    type="button"
                    initial={{ opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: Math.min(index, 12) * 0.015 }}
                    onClick={() => setSelected(picked ? null : item.id)}
                    className="panel relative flex aspect-square flex-col items-center justify-center gap-0.5 p-1"
                    style={{
                      borderColor: picked ? "rgba(201,162,77,0.8)" : `${style.color}55`,
                      background: picked ? "rgba(201,162,77,0.1)" : `${style.color}0f`,
                    }}
                  >
                    <ItemArt
                      slot={item.slot}
                      shape={item.shape}
                      rarity={item.rarity}
                      id={item.id}
                      size={40}
                    />
                    {/* What it would do to the total, on the tile itself. A grid
                        of pictures is readable and says nothing; this is the
                        answer the bag was opened for. */}
                    <span
                      className="tabular text-[0.56rem] leading-none"
                      style={{ color: better ? "#7ed08f" : "#d98d8d" }}
                    >
                      {formatGain(item.gain)}
                    </span>
                    {/* One pip per bonus. A number here would be a second '+3'
                        next to '+18 %' and the two would be read as one. */}
                    {item.affixes.length > 0 && (
                      <span className="absolute left-1 top-1 flex gap-0.5">
                        {item.affixes.map((affix, pip) => (
                          <span
                            key={`${affix.key}-${pip}`}
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ background: "var(--sapphire-pale)", opacity: 0.85 }}
                          />
                        ))}
                      </span>
                    )}
                  </motion.button>
                );
              })}
            </div>
          )}

          {/* The picked tile, in full. One panel that changes rather than forty
              that are always open. */}
          {chosen && (
            <motion.div
              key={chosen.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="panel mt-3 p-3"
              style={{ borderColor: `${RARITY_STYLE[chosen.rarity].color}88` }}
            >
              <div className="flex items-start gap-3">
                <ItemArt
                  slot={chosen.slot}
                  shape={chosen.shape}
                  rarity={chosen.rarity}
                  id={chosen.id}
                  size={54}
                />
                <div className="min-w-0 flex-1">
                  <p className="dim text-[0.58rem] uppercase tracking-widest">
                    {t(`idle.slot.${chosen.slot}`)}
                    {chosen.slot === "HANDS" && ` · ${t(`weapon.${weaponFor(chosen.id)}`)}`}
                  </p>
                  <p
                    className="truncate text-[0.82rem]"
                    style={{ color: RARITY_STYLE[chosen.rarity].color }}
                  >
                    {itemName(chosen.slot, chosen.floor, chosen.rarity, locale)}
                  </p>
                  <p className="tabular mt-0.5 text-[0.7rem] text-[var(--parchment)]">
                    {formatNumber(chosen.power)}
                    <span className="dim"> · </span>
                    <span className="text-[#7ed08f]">{formatNumber(chosen.vitality)}</span>
                  </p>
                  {/* The whole verdict, in the unit the top of the screen uses:
                      what the cat is worth now, and what it would be worth
                      wearing this. */}
                  <p className="tabular mt-0.5 text-[0.68rem]">
                    <span className="dim">{formatNumber(state.score)}</span>
                    <span className="dim"> → </span>
                    <span style={{ color: chosen.gain > 1.0001 ? "#7ed08f" : "#d98d8d" }}>
                      {formatNumber(state.score * chosen.gain)} ({formatGain(chosen.gain)})
                    </span>
                  </p>
                </div>
              </div>

              {chosen.affixes.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {chosen.affixes.map((affix, index) => (
                    <span
                      key={`${affix.key}-${index}`}
                      className="rounded px-1.5 py-0.5 text-[0.62rem]"
                      style={{ background: "rgba(79,147,255,0.12)", color: "var(--sapphire-pale)" }}
                    >
                      {affixLabel(affix, locale)}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="btn btn-royal py-1.5 text-[0.72rem]"
                  disabled={busy !== null}
                  onClick={() => act({ action: "equip", itemId: chosen.id, onPack }, chosen.id)}
                >
                  {t("idle.equip")}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost py-1.5 text-[0.72rem]"
                  disabled={busy !== null}
                  onClick={() => {
                    setSelected(null);
                    act({ action: "sell", itemId: chosen.id }, chosen.id);
                  }}
                >
                  {t("idle.sell")} +{formatNumber(Math.max(1, Math.round(chosen.power * 4)))}
                </button>
              </div>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
});

/** One filter pill. The same shape whether it names a slot or a rarity. */
function Chip({
  active,
  colour,
  onPick,
  children,
}: {
  active: boolean;
  colour?: string;
  onPick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="panel flex items-center gap-1.5 px-2 py-1 text-[0.64rem] transition"
      style={{
        borderColor: active ? "rgba(201,162,77,0.7)" : undefined,
        color: active ? "var(--gold-bright)" : "var(--text-dim)",
      }}
    >
      {colour && <span className="h-2 w-2 rounded-full" style={{ background: colour }} />}
      {children}
    </button>
  );
}
