"use client";

import { motion } from "framer-motion";
import { RARITY_STYLE, type Rarity } from "@/lib/content/idle";
import type { IdleState } from "@/lib/engine/idle";
import { CatCanvas } from "./CatCanvas";
import { ProfileBackdrop } from "./ProfileBackdrop";
import { GemIcon, ItemIcon } from "./ui/Icons";
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
}: {
  state: IdleState;
  busy: string | null;
  act: (body: Record<string, unknown>, key: string) => void;
}) {
  const { t, L } = useI18n();
  const { shop } = state;

  const canBuyChest = shop.gems >= shop.chestPrice;
  const guaranteedStyle = RARITY_STYLE[shop.guaranteedRarity as Rarity];
  const opened = shop.chestsOpened % shop.pity;

  return (
    <div className="pb-4">
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

      {/* --- The boosts --------------------------------------------------- */}
      <h2 className="eyebrow mt-6">{t("shop.boosts")}</h2>
      <p className="dim mt-1 text-[0.68rem] italic">{t("shop.boostsHint")}</p>

      <div className="mt-2 grid grid-cols-3 gap-2">
        {state.boosts.catalogue.map((boost) => (
          <button
            key={boost.key}
            type="button"
            disabled={!boost.affordable || busy !== null}
            onClick={() => act({ action: "buyBoost", key: boost.key }, `buy-${boost.key}`)}
            className="panel flex flex-col items-center gap-1 p-2 text-center transition disabled:opacity-45"
            style={boost.affordable ? { borderColor: "rgba(201,162,77,0.4)" } : undefined}
          >
            <span className="text-[var(--gold)]">
              <ItemIcon icon={boost.icon} size={18} />
            </span>
            <span className="text-[0.66rem] leading-tight text-[var(--parchment)]">
              {L(boost.descEn, boost.descFr)}
            </span>
            <span className="dim tabular text-[0.56rem]">
              {t("boost.minutes", { n: Math.round(boost.seconds / 60) })}
            </span>
            <span
              className="tabular flex items-center gap-1 text-[0.68rem]"
              style={{ color: "#8ef0ff" }}
            >
              {boost.price}
              <GemIcon size={11} />
            </span>
            {state.boosts.owned[boost.key] > 0 && (
              <span className="dim tabular text-[0.56rem]">
                {t("shop.boostHeld", { n: state.boosts.owned[boost.key] })}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* --- The walls ---------------------------------------------------- */}
      <h2 className="eyebrow mt-6">{t("shop.backdrops")}</h2>
      <p className="dim mt-1 text-[0.68rem] italic">{t("shop.backdropsHint")}</p>

      <div className="mt-2 grid grid-cols-2 gap-2">
        {/* The bare wall first, and free: a shop where the plain option is
            missing is a shop that has taken something away. */}
        {[{ key: "", nameEn: "", nameFr: "", price: 0, owned: true, worn: state.shop.backdropKey === "" }, ...state.shop.backdrops].map(
          (wall, index) => {
            const affordable = wall.owned || shop.gems >= wall.price;
            return (
              <motion.button
                key={wall.key || "none"}
                type="button"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                disabled={!affordable || busy !== null || wall.worn}
                onClick={() => act({ action: "backdrop", key: wall.key }, `wall-${wall.key || "none"}`)}
                className="panel overflow-hidden p-0 transition disabled:opacity-45"
                style={{
                  borderColor: wall.worn ? "rgba(201,162,77,0.6)" : undefined,
                }}
              >
                {/* The preview is the thing itself, moving. A still thumbnail of
                    an animated wall sells the wrong object. */}
                <span className="relative block h-16 w-full">
                  <ProfileBackdrop backdrop={wall.key} />
                </span>
                <span className="block px-2 py-1.5">
                  <span className="block truncate text-[0.7rem] text-[var(--parchment)]">
                    {wall.key ? L(wall.nameEn, wall.nameFr) : t("shop.backdropNone")}
                  </span>
                  <span
                    className="tabular flex items-center justify-center gap-1 text-[0.66rem]"
                    style={{
                      color: wall.worn
                        ? "var(--gold-bright)"
                        : wall.owned
                          ? "var(--text-dim)"
                          : "#8ef0ff",
                    }}
                  >
                    {wall.worn ? (
                      t("shop.worn")
                    ) : wall.owned ? (
                      t("shop.wear")
                    ) : (
                      <>
                        {wall.price}
                        <GemIcon size={11} />
                      </>
                    )}
                  </span>
                </span>
              </motion.button>
            );
          },
        )}
      </div>

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
