"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "./I18nProvider";
import { VaultIcon, PawIcon, MissionsIcon, ArmoryIcon, ProfileIcon } from "./ui/Icons";

/**
 * Five destinations, thumb-height, always reachable.
 * The daily session should never need more than one hand.
 */
const ITEMS = [
  // The descent leads: it is the game, and the one screen a player returns to.
  { href: "/descent", labelKey: "nav.descent", Icon: PawIcon },
  { href: "/vault", labelKey: "nav.vault", Icon: VaultIcon },
  { href: "/missions", labelKey: "nav.missions", Icon: MissionsIcon },
  // The mini-game keeps its place on the Vault hub rather than a permanent slot —
  // the daily loop now sits around the descent, not beside it.
  { href: "/armory", labelKey: "nav.armory", Icon: ArmoryIcon },
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
