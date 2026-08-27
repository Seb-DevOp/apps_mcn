"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "./I18nProvider";
import { PawIcon, ShopIcon, RebirthIcon, TrophyIcon, ProfileIcon } from "./ui/Icons";

/**
 * Five destinations, thumb-height, always reachable.
 *
 * The Shop and Rebirth were tabs inside the fight, which buried two whole
 * systems one tap deeper than the bag. They are screens now; the arena keeps
 * only the two tabs that are genuinely the same activity — fighting and
 * deciding what the cat wears while it fights.
 */
const ITEMS = [
  // The climb leads: it is the game, and the one screen a player returns to.
  { href: "/climb", labelKey: "nav.climb", Icon: PawIcon },
  { href: "/shop", labelKey: "nav.shop", Icon: ShopIcon },
  // "Renaissance" is eleven characters in a slot eighty pixels wide. The screen
  // it opens still calls itself that; only the bar shortens.
  { href: "/rebirth", labelKey: "nav.rebirth", Icon: RebirthIcon },
  { href: "/leaderboard", labelKey: "nav.leaderboard", Icon: TrophyIcon },
  { href: "/profile", labelKey: "nav.profile", Icon: ProfileIcon },
];

export function BottomNav() {
  const pathname = usePathname();
  const { t } = useI18n();



  return (
    <nav className="nav-bar" aria-label={t("app.vault")}>
      {ITEMS.map(({ href, labelKey, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} className="nav-item" data-active={active}>
            <Icon size={22} className="nav-icon" />
            <span>{t(labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
