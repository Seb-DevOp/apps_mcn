"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { LOCALES, LOCALE_LABEL, type Locale } from "@/lib/i18n";
import type { AccountStatus } from "@/lib/auth/account";
import { AccountSecurity } from "./AccountSecurity";
import { CatCanvas, type WornPiece } from "./CatCanvas";
import { useI18n } from "./I18nProvider";
import { formatNumber } from "./format";

/**
 * THE PROFILE
 *
 * Who you are, how you get back in, and what the cat has done. Nothing else —
 * the ranks, badges and streaks this page used to display belonged to a game that
 * is no longer the game.
 */
export function ProfileView({
  player,
  stats,
  worn,
  account,
}: {
  player: { handle: string; locale: string };
  stats: {
    floor: number;
    kills: number;
    bossKills: number;
    defeats: number;
    totalGold: number;
    items: number;
  };
  worn: WornPiece[];
  account: AccountStatus;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function setLocale(locale: string) {
    setBusy("locale");
    await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale }),
    });
    router.refresh();
    setBusy(null);
  }

  async function signOut() {
    await fetch("/api/session", { method: "DELETE" });
    router.push("/");
    router.refresh();
  }

  return (
    <main className="pt-5">
      <header className="text-center">
        <p className="eyebrow">{t("app.subtitle")}</p>
        <h1 className="display gold-text mt-0.5 text-2xl">{player.handle}</h1>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="panel panel-sapphire mt-4 flex justify-center py-3"
      >
        <CatCanvas worn={worn} size={170} />
      </motion.div>

      <section className="mt-4 grid grid-cols-3 gap-2">
        <Stat label={t("profile.floor")} value={String(stats.floor)} tone="gold" />
        <Stat label={t("profile.kills")} value={formatNumber(stats.kills)} />
        <Stat label={t("profile.guardians")} value={formatNumber(stats.bossKills)} />
        <Stat label={t("profile.defeats")} value={formatNumber(stats.defeats)} />
        <Stat label={t("profile.totalGold")} value={formatNumber(stats.totalGold)} />
        <Stat label={t("profile.items")} value={formatNumber(stats.items)} />
      </section>

      <AccountSecurity initial={account} />

      <section className="mt-6">
        <h2 className="eyebrow">{t("profile.language")}</h2>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {LOCALES.map((code: Locale) => (
            <button
              key={code}
              type="button"
              onClick={() => setLocale(code)}
              disabled={busy === "locale"}
              className="panel py-2 text-[0.8rem] transition disabled:opacity-50"
              style={{
                borderColor: player.locale === code ? "rgba(201,162,77,0.6)" : undefined,
                color: player.locale === code ? "var(--gold-bright)" : "var(--text-dim)",
                background: player.locale === code ? "rgba(201,162,77,0.08)" : undefined,
              }}
            >
              {LOCALE_LABEL[code]}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-8 pb-4">
        <h2 className="eyebrow">{t("profile.signOut")}</h2>
        <p className="dim mt-2 text-xs">{t("profile.signOutHint")}</p>
        <button type="button" onClick={signOut} className="btn btn-ghost mt-3 w-full !text-xs">
          {t("profile.signOut")}
        </button>
      </section>
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "gold" }) {
  return (
    <div className="panel px-2 py-2 text-center">
      <p className="dim text-[0.58rem] uppercase tracking-widest">{label}</p>
      <p
        className="tabular mt-1 text-[0.95rem]"
        style={{ color: tone === "gold" ? "var(--gold-bright)" : "var(--parchment)" }}
      >
        {value}
      </p>
    </div>
  );
}
