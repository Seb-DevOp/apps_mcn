"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import { createTranslator, LOCALES, LOCALE_LABEL, type Locale } from "@/lib/i18n";
import { McnCrest } from "./ui/Icons";
import { SignIn } from "./SignIn";

/**
 * The entrance.
 *
 * One screen, one decision, no account creation friction: pick a name, pick a
 * language, walk in. No wallet, no email, no payment — the game has to earn the
 * player before it asks anything of them.
 */
export function Onboarding({ suggested }: { suggested: string }) {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("en");
  const [handle, setHandle] = useState(suggested);
  const [mode, setMode] = useState<"CREATE" | "SIGNIN">("CREATE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const t = useMemo(() => createTranslator(locale), [locale]);

  async function enter() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle, locale }),
      });
      if (!response.ok) throw new Error("failed");
      router.push("/vault");
      router.refresh();
    } catch {
      setError(t("common.error"));
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-between px-5 py-10">
      {/* The Wanderer waits at the door — the rank every player starts as. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[62vh] overflow-hidden">
        <Image
          src="/ranks/wanderer.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-top opacity-[0.5]"
          style={{
            maskImage: "linear-gradient(180deg, rgba(0,0,0,0.95) 12%, transparent 92%)",
            WebkitMaskImage: "linear-gradient(180deg, rgba(0,0,0,0.95) 12%, transparent 92%)",
          }}
        />
      </div>

      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="relative z-10 flex flex-col items-center gap-3 pt-2"
      >
        <McnCrest size={40} className="text-[var(--gold-bright)] candle" />
        <div className="text-center">
          <p className="eyebrow">{t("app.subtitle")}</p>
          <h1 className="display gold-text mt-1 text-4xl leading-none">MCN</h1>
          <p className="display mt-1 text-lg tracking-[0.32em] text-[var(--sapphire-pale)]">
            {t("app.vault").toUpperCase()}
          </p>
        </div>
      </motion.header>

      {mode === "SIGNIN" ? (
        <SignIn locale={locale} onBack={() => setMode("CREATE")} />
      ) : (
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.35 }}
        className="relative z-10 w-full max-w-sm"
      >
        <div className="panel panel-gilded arch p-5">
          <h2 className="display text-center text-lg leading-snug text-[var(--parchment)]">
            {t("onboarding.welcome")}
          </h2>
          <p className="dim mt-3 text-center text-sm">{t("onboarding.intro")}</p>

          <label className="eyebrow mt-6 block" htmlFor="handle">
            {t("onboarding.nameLabel")}
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="handle"
              value={handle}
              maxLength={18}
              onChange={(event) => setHandle(event.target.value)}
              placeholder={t("onboarding.namePlaceholder")}
              className="min-h-12 flex-1 rounded-xl border border-[rgba(201,162,77,0.28)] bg-[rgba(5,8,15,0.6)] px-4 text-[var(--parchment)] outline-none transition focus:border-[rgba(79,147,255,0.6)]"
            />
          </div>

          <fieldset className="mt-5">
            <legend className="eyebrow mb-2">{t("onboarding.languageLabel")}</legend>
            <div className="grid grid-cols-2 gap-2">
              {LOCALES.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLocale(code)}
                  data-active={locale === code}
                  className="min-h-11 rounded-xl border border-[rgba(201,162,77,0.22)] bg-[rgba(23,32,62,0.5)] text-sm transition data-[active=true]:border-[rgba(240,208,137,0.6)] data-[active=true]:bg-[rgba(201,162,77,0.14)] data-[active=true]:text-[var(--gold-bright)]"
                >
                  {LOCALE_LABEL[code]}
                </button>
              ))}
            </div>
          </fieldset>

          <button
            type="button"
            onClick={enter}
            disabled={busy || handle.trim().length < 3}
            className="btn btn-gold shine relative mt-6 w-full overflow-hidden"
          >
            {busy ? t("onboarding.entering") : t("onboarding.enter")}
          </button>

          {error && <p className="mt-3 text-center text-sm text-red-300">{error}</p>}
          <p className="dim mt-4 text-center text-xs">{t("onboarding.noWallet")}</p>

          <button
            type="button"
            onClick={() => setMode("SIGNIN")}
            className="mt-4 w-full text-center text-xs text-[var(--sapphire-pale)] underline underline-offset-4"
          >
            {t("auth.haveAccount")}
          </button>
        </div>
      </motion.section>
      )}

      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2, delay: 0.9 }}
        className="relative z-10 text-center"
      >
        <p className="display text-xs tracking-[0.22em] text-[var(--text-dim)]">
          {t("app.tagline")}
        </p>
        <p className="eyebrow mt-2">{t("app.oriaWatching")}</p>
      </motion.footer>
    </main>
  );
}
