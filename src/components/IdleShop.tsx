"use client";

import { motion } from "framer-motion";
import { RARITY_STYLE, type Rarity } from "@/lib/content/idle";
import type { IdleState } from "@/lib/engine/idle";
import { CatCanvas } from "./CatCanvas";
import { useI18n } from "./I18nProvider";
import { formatNumber } from "./format";

/**
 * THE SHOP
 *
 * Two things gold can buy that the upgrade list cannot: another roll of the dice,
 * and a different cat to look at.
 *
 * A chest is priced against the current floor's own reward rather than as a fixed
 * number, because gold inflates by a factor of a thousand every eight floors —
 * any fixed price is unaffordable at floor five and free at floor twenty-five.
 * Coats are the opposite: fixed prices, each roughly ten times the last, so a coat
 * unlocks by descending rather than by saving, and there is always exactly one
 * that is nearly affordable.
 */
export function IdleShop({
  state,
  busy,
  act,
}: {
  state: IdleState;
  busy: string | null;
  act: (body: Record<string, unknown>, key: string) => void;
}) {
  const { t, L } = useI18n();
  const { shop } = state;

  const canBuyChest = state.gold >= shop.chestPrice;
  const guaranteedStyle = RARITY_STYLE[shop.guaranteedRarity as Rarity];
  const opened = shop.chestsOpened % shop.pity;

  return (
    <div className="pb-4">
      {/* --- The chest --------------------------------------------------- */}
      <section className="panel panel-gilded mt-4 p-4 text-center">
        <p className="eyebrow">{t("shop.chest")}</p>
        <p className="dim mt-2 text-[0.74rem] leading-snug">{t("shop.chestHint")}</p>

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
          {t("shop.buyChest", { n: formatNumber(shop.chestPrice) })}
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
          const affordable = skin.owned || state.gold >= skin.price;
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
                className="tabular text-[0.68rem]"
                style={{ color: skin.worn ? "var(--gold-bright)" : "var(--text-faint)" }}
              >
                {skin.worn
                  ? t("shop.worn")
                  : skin.owned
                    ? t("shop.wear")
                    : formatNumber(skin.price)}
              </p>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
