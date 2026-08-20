"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ITEM_BY_KEY, RARITY_STYLE, type ItemType } from "@/lib/content/items";
import { RANK_BY_KEY } from "@/lib/content/ranks";
import { LOCALES, LOCALE_LABEL } from "@/lib/i18n";
import type { WalletCapabilities } from "@/lib/web3/wallet";
import { useI18n } from "./I18nProvider";
import { RankPortrait } from "./RankVisuals";
import { ItemIcon, ShardIcon, XpIcon, StreakIcon, TrophyIcon } from "./ui/Icons";

export interface ProfileProps {
  player: {
    handle: string;
    locale: string;
    xp: number;
    shards: number;
    rankKey: string;
    currentStreak: number;
    bestStreak: number;
    totalActiveDays: number;
  };
  stats: { bestScore: number; chestsOpened: number };
  inventory: { itemKey: string; quantity: number }[];
  activeBoosts: { boostKey: string; expiresAt: string }[];
  wallet: { capabilities: WalletCapabilities; address: string | null };
}

/**
 * The player's identity inside the Kingdom.
 *
 * Rank artwork, record, collection, and the settings that belong to the person
 * rather than to the game. The wallet section sits here too — visible, honest
 * about being switched off, and never in the way of playing.
 */
export function ProfileView({ player, stats, inventory, activeBoosts, wallet }: ProfileProps) {
  const { t, L } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const rank = RANK_BY_KEY[player.rankKey] ?? RANK_BY_KEY.wanderer;
  const group = (type: ItemType | ItemType[]) => {
    const types = Array.isArray(type) ? type : [type];
    return inventory.filter((entry) => types.includes(ITEM_BY_KEY[entry.itemKey]?.type as ItemType));
  };

  async function setLocale(locale: string) {
    setBusy("locale");
    await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale }),
    });
    setBusy(null);
    router.refresh();
  }

  async function activateBoost(itemKey: string) {
    setBusy(itemKey);
    await fetch("/api/boost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemKey }),
    });
    setBusy(null);
    router.refresh();
  }

  async function signOut() {
    await fetch("/api/session", { method: "DELETE" });
    router.push("/");
    router.refresh();
  }

  return (
    <main className="pt-5">
      {/* --- Identity ------------------------------------------------------ */}
      <section className="panel panel-gilded overflow-hidden">
        <Link href="/ranks">
          <RankPortrait rank={rank} height={220} priority />
        </Link>
        <div className="relative -mt-10 px-5 pb-5 text-center">
          <p className="display text-xl text-[var(--parchment)]">{player.handle}</p>
          <p className="display mt-1 text-sm">
            <span className="mr-1.5">{rank.emoji}</span>
            <span className="gold-text">{L(rank.nameEn, rank.nameFr).toUpperCase()}</span>
          </p>
        </div>
      </section>

      {/* --- Record -------------------------------------------------------- */}
      <section className="mt-4">
        <p className="eyebrow">{t("profile.stats")}</p>
        <dl className="mt-2 grid grid-cols-2 gap-2">
          <StatTile icon={<XpIcon size={16} />} label={t("profile.totalXp")} value={player.xp} />
          <StatTile icon={<ShardIcon size={16} />} label={t("profile.shards")} value={player.shards} />
          <StatTile icon={<StreakIcon size={16} />} label={t("profile.activeDays")} value={player.totalActiveDays} />
          <StatTile icon={<TrophyIcon size={16} />} label={t("profile.bestRun")} value={stats.bestScore} />
          <StatTile icon={<StreakIcon size={16} />} label={t("profile.bestStreak")} value={player.bestStreak} />
          <StatTile icon={<ItemIcon icon="key" size={16} />} label={t("profile.chestsOpened")} value={stats.chestsOpened} />
        </dl>
      </section>

      {/* --- Collection ---------------------------------------------------- */}
      <section className="mt-6">
        <p className="eyebrow">{t("profile.collection")}</p>

        <CollectionGroup title={t("profile.badges")} entries={group("BADGE")} />
        <CollectionGroup title={t("profile.cosmetics")} entries={group("COSMETIC")} />
        <CollectionGroup
          title={t("profile.materials")}
          entries={group(["MATERIAL", "FRAGMENT", "KEY"])}
        />

        {/* Boosts are the one collection group you can act on. */}
        <div className="mt-4">
          <p className="display text-xs text-[var(--text-dim)]">{t("profile.boosts")}</p>
          {activeBoosts.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {activeBoosts.map((boost) => {
                const def = ITEM_BY_KEY[boost.boostKey];
                return (
                  <li
                    key={boost.boostKey}
                    className="flex items-center justify-between rounded-lg border border-[rgba(79,147,255,0.35)] bg-[rgba(79,147,255,0.1)] px-3 py-2 text-xs"
                  >
                    <span className="text-[var(--sapphire-pale)]">
                      {def ? L(def.nameEn, def.nameFr) : boost.boostKey}
                    </span>
                    <span className="tabular text-[var(--text-dim)]">
                      {t("profile.boostActive", {
                        time: new Date(boost.expiresAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        }),
                      })}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <ul className="mt-2 space-y-1.5">
            {group("BOOST").map((entry) => {
              const def = ITEM_BY_KEY[entry.itemKey];
              if (!def) return null;
              return (
                <li
                  key={entry.itemKey}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[rgba(201,162,77,0.2)] bg-[rgba(5,8,15,0.4)] px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-[var(--parchment)]">
                      {L(def.nameEn, def.nameFr)} ×{entry.quantity}
                    </span>
                    <span className="dim block text-[0.68rem]">{L(def.descEn, def.descFr)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => activateBoost(entry.itemKey)}
                    disabled={busy === entry.itemKey}
                    className="btn btn-ghost !min-h-9 !px-3 !text-[0.68rem]"
                  >
                    {t("profile.activateBoost")}
                  </button>
                </li>
              );
            })}
          </ul>

          {group("BOOST").length === 0 && activeBoosts.length === 0 && (
            <p className="dim mt-2 text-xs">{t("profile.emptyCollection")}</p>
          )}
        </div>

        <p className="dim mt-5 rounded-lg border border-dashed border-[rgba(201,162,77,0.25)] px-3 py-3 text-center text-xs">
          {t("profile.forgeSoon")}
        </p>
      </section>

      {/* --- Wallet -------------------------------------------------------- */}
      <section className="panel mt-6 p-4">
        <p className="eyebrow">{t("wallet.title")}</p>
        {wallet.capabilities.connectEnabled ? (
          <div className="mt-2">
            <p className="text-sm text-[var(--parchment)]">
              {wallet.address ?? t("wallet.connect")}
            </p>
            <p className="dim mt-1 text-xs">{t("wallet.notRequired")}</p>
          </div>
        ) : (
          <div className="mt-2">
            <p className="text-sm text-[var(--parchment)]">{t("wallet.disabled")}</p>
            <p className="dim mt-1.5 text-xs leading-relaxed">{t("wallet.disabledBody")}</p>
            <p className="mt-2 text-[0.68rem] uppercase tracking-[0.16em] text-[var(--sapphire-pale)]">
              {wallet.capabilities.chain} · {t("wallet.notRequired")}
            </p>
          </div>
        )}
      </section>

      {/* --- Settings ------------------------------------------------------ */}
      <section className="mt-6">
        <p className="eyebrow">{t("profile.settings")}</p>

        <div className="panel mt-2 p-4">
          <p className="text-sm text-[var(--parchment)]">{t("profile.language")}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {LOCALES.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLocale(code)}
                disabled={busy === "locale"}
                data-active={player.locale === code}
                className="min-h-11 rounded-xl border border-[rgba(201,162,77,0.22)] bg-[rgba(23,32,62,0.5)] text-sm transition data-[active=true]:border-[rgba(240,208,137,0.6)] data-[active=true]:bg-[rgba(201,162,77,0.14)] data-[active=true]:text-[var(--gold-bright)]"
              >
                {LOCALE_LABEL[code]}
              </button>
            ))}
          </div>
        </div>

        <details className="panel mt-3 p-4">
          <summary className="cursor-pointer text-sm text-[var(--text-dim)]">
            {t("profile.signOut")}
          </summary>
          <p className="dim mt-2 text-xs">{t("profile.signOutHint")}</p>
          <button type="button" onClick={signOut} className="btn btn-ghost mt-3 w-full !text-xs">
            {t("profile.signOut")}
          </button>
        </details>
      </section>

      <p className="eyebrow mt-6 text-center">{t("app.oriaWatching")}</p>
    </main>
  );
}

function StatTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="panel px-3 py-2.5">
      <dt className="flex items-center gap-1.5 text-[0.62rem] uppercase tracking-[0.14em] text-[var(--text-dim)]">
        <span className="text-[var(--gold)]">{icon}</span>
        {label}
      </dt>
      <dd className="tabular display mt-1 text-lg text-[var(--parchment)]">
        {value.toLocaleString()}
      </dd>
    </div>
  );
}

function CollectionGroup({
  title,
  entries,
}: {
  title: string;
  entries: { itemKey: string; quantity: number }[];
}) {
  const { t, L } = useI18n();

  return (
    <div className="mt-4">
      <p className="display text-xs text-[var(--text-dim)]">{title}</p>
      {entries.length === 0 ? (
        <p className="dim mt-1.5 text-xs">{t("profile.emptyCollection")}</p>
      ) : (
        <ul className="mt-2 grid grid-cols-4 gap-2">
          {entries.map((entry, index) => {
            const def = ITEM_BY_KEY[entry.itemKey];
            if (!def) return null;
            const style = RARITY_STYLE[def.rarity];
            return (
              <motion.li
                key={entry.itemKey}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.03 }}
                title={L(def.nameEn, def.nameFr)}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border"
                style={{
                  borderColor: `${style.color}55`,
                  background: `linear-gradient(180deg, ${style.glow}, rgba(5,8,15,0.6))`,
                }}
              >
                <span style={{ color: style.color }}>
                  <ItemIcon icon={def.icon} size={22} />
                </span>
                <span className="tabular text-[0.6rem] text-[var(--text-dim)]">
                  ×{entry.quantity}
                </span>
              </motion.li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
