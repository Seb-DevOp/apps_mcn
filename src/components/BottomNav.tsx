"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "./I18nProvider";
import { PawIcon, TrophyIcon, ProfileIcon } from "./ui/Icons";

/**
 * Three destinations, thumb-height, always reachable.
 * Everything else the app used to offer belonged to a different game; what is
 * left is the descent, who else is descending, and your own account.
 */
const ITEMS = [
  // The descent leads: it is the game, and the one screen a player returns to.
  { href: "/descent", labelKey: "nav.descent", Icon: PawIcon },
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
