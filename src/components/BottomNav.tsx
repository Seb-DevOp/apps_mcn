"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "./I18nProvider";
import { VaultIcon, PlayIcon, MissionsIcon, ExploreIcon, ProfileIcon } from "./ui/Icons";

/**
 * Five destinations, thumb-height, always reachable.
 * The daily session should never need more than one hand.
 */
const ITEMS = [
  { href: "/vault", labelKey: "nav.vault", Icon: VaultIcon },
  { href: "/play", labelKey: "nav.play", Icon: PlayIcon },
  { href: "/missions", labelKey: "nav.missions", Icon: MissionsIcon },
  { href: "/explore", labelKey: "nav.explore", Icon: ExploreIcon },
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
