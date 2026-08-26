"use client";

import { RARITY_STYLE, weaponIcon, type Rarity, type Slot } from "@/lib/content/idle";
import { SlotArt } from "./CatCanvas";

/**
 * A piece of equipment, shown as itself.
 *
 * The hands hold a weapon, and those are photographs — four kinds in three
 * finishes, bare, runed and burning, so a Sovereign blade is on fire and a
 * common one is not.
 *
 * The other five slots are the **same paths the cat wears**, framed to the part
 * of the drawing they occupy rather than redrawn as icons. That is what makes it
 * impossible for the bag and the cat to disagree about what a Horned Helm looks
 * like: there is only one Horned Helm in the codebase.
 */
export function ItemArt({
  slot,
  shape,
  rarity,
  id,
  size = 48,
}: {
  slot: Slot;
  shape: string;
  rarity: Rarity;
  /** Only used for the hands, where it decides which of the four weapons. */
  id: string;
  size?: number;
}) {
  if (slot === "HANDS") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a fixed local webp
      // of a few kilobytes: the optimiser has nothing to do and costs a request.
      <img
        src={weaponIcon(id, rarity)}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        style={{
          width: size,
          height: size,
          objectFit: "contain",
          filter: `drop-shadow(0 0 6px ${RARITY_STYLE[rarity].glow})`,
        }}
      />
    );
  }

  return <SlotArt slot={slot} shape={shape} rarity={rarity} size={size} />;
}
