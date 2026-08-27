"use client";

import { motion } from "framer-motion";
import { RARITY_STYLE, type Rarity } from "@/lib/content/idle";
import type { IdleState } from "@/lib/engine/idle";
import { CatCanvas } from "./CatCanvas";
import { IdleCalendar } from "./IdleCalendar";
import { GemIcon } from "./ui/Icons";
import { useI18n } from "./I18nProvider";
import { formatNumber } from "./format";

/**
 * THE SHOP
 *
 * Two things the upgrade list cannot sell: another roll of the dice, and a
 * different cat to look at.
 *
 * Both are priced in **gems**, not gold. Gold multiplies by a thousand every
 * eight floors, so a gold price is unaffordable at floor five and free at floor
 * twenty-five — which was patched twice before the currency itself was the
 * answer. Gems come from Guardians one floor at a time, so they accumulate
 * linearly and a price here means the same thing at any depth.
 */
export function IdleShop({
  state,
  busy,
  act,
  claim,
}: {
  state: IdleState;
  busy: string | null;
  act: (body: Record<string, unknown>, key: string) => void;
  /** What the last calendar door reported, when one was just opened. */
  claim?: Record<string, unknown> | null;
}) {
  const { t, L } = useI18n();
  const { shop } = state;

  const canBuyChest = shop.gems >= shop.chestPrice;
  const guaranteedStyle = RARITY_STYLE[shop.guaranteedRarity as Rarity];
  const opened = shop.chestsOpened % shop.pity;

  return (
    <div className="pb-4">
      {/* The daily door comes first: it is the one thing here that expires. */}
      <IdleCalendar state={state} busy={busy} act={act} claim={claim} />

      {/* --- The chest --------------------------------------------------- */}
      <section className="panel panel-gilded mt-4 p-4 text-center">
        <p className="eyebrow">{t("shop.chest")}</p>
        <p className="dim mt-2 text-[0.74rem] leading-snug">{t("shop.chestHint")}</p>
        <p className="dim mt-2 text-[0.66rem] italic leading-snug">{t("shop.gemsHint")}</p>

        {/* The guarantee as ten pips: a promise you can watch arriving beats a
            promise written in a description. */}
        <div className="mt-4 flex items-center justify-center gap-1.5">
          {Array.from({ length: shop.pity }, (_, index) => (
            <span
              key={index}
              className="h-2 w-2 rounded-full transition"
              style={{
                background:
                  index < opened
                    ? "var(--gold)"
                    : index === shop.pity - 1
                      ? guaranteedStyle.color
                      : "rgba(255,255,255,0.14)",
                boxShadow: index === shop.pity - 1 ? `0 0 8px ${guaranteedStyle.color}` : undefined,
              }}
            />
          ))}
        </div>

        <p className="mt-2 text-[0.7rem]" style={{ color: guaranteedStyle.color }}>
          {shop.untilGuaranteed === 1
            ? t("shop.nextIsGuaranteed", { rarity: t(`idle.rarity.${shop.guaranteedRarity}`) })
            : t("shop.untilGuaranteed", {
                n: shop.untilGuaranteed,
                rarity: t(`idle.rarity.${shop.guaranteedRarity}`),
              })}
        </p>

        <button
          type="button"
          className="btn btn-gold mt-4 w-full py-2.5 disabled:opacity-40"
          disabled={!canBuyChest || busy !== null}
          onClick={() => act({ action: "chest" }, "chest")}
        >
          <span className="inline-flex items-center gap-1.5">
            {t("shop.buyChest")} · {shop.chestPrice}
            <GemIcon size={14} />
          </span>
        </button>

        <p className="dim mt-2 text-[0.66rem]">
          {t("shop.chestsBought", { n: shop.chestsOpened })}
        </p>
      </section>

      {/* --- The coats ---------------------------------------------------- */}
      <h2 className="eyebrow mt-6">{t("shop.coats")}</h2>
      <p className="dim mt-1 text-[0.68rem] italic">{t("shop.coatsHint")}</p>

      <div className="mt-2 grid grid-cols-2 gap-2">
        {shop.skins.map((skin, index) => {
          const affordable = skin.owned || shop.gems >= skin.price;
          return (
            <motion.button
              key={skin.key}
              type="button"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              disabled={!affordable || busy !== null || skin.worn}
              onClick={() => act({ action: "skin", key: skin.key }, skin.key)}
              className="panel flex flex-col items-center p-2 transition disabled:opacity-45"
              style={{
                borderColor: skin.worn ? "rgba(201,162,77,0.6)" : undefined,
                background: skin.worn ? "rgba(201,162,77,0.07)" : undefined,
              }}
            >
              {/* The cat itself is the swatch. A colour chip would not show what a
                  coat does to the ruff, the ears or the eyes. */}
              <CatCanvas worn={[]} size={92} breathing={false} skin={skin.key} />

              <p className="mt-1 truncate text-[0.74rem] text-[var(--parchment)]">
                {L(skin.nameEn, skin.nameFr)}
              </p>
              <p
                className="tabular flex items-center gap-1 text-[0.68rem]"
                style={{
                  color: skin.worn
                    ? "var(--gold-bright)"
                    : skin.owned
                      ? "var(--text-dim)"
                      : "#8ef0ff",
                }}
              >
                {skin.worn ? (
                  t("shop.worn")
                ) : skin.owned ? (
                  t("shop.wear")
                ) : (
                  <>
                    {skin.price}
                    <GemIcon size={12} />
                  </>
                )}
              </p>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
