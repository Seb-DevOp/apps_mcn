"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import { createTranslator, LOCALES, LOCALE_LABEL, type Locale } from "@/lib/i18n";
import { McnCrest } from "./ui/Icons";
import { SignIn } from "./SignIn";

/**
 * The door.
 *
 * Registration is required: a name, an address, a password typed twice. Nothing
 * about an account is anonymous, so a player's rank, streak and collection belong
 * to them from the first chest rather than to one browser's cookie.
 *
 * Every rule is checked here for immediate feedback and again on the server,
 * which is the only side that decides anything.
 */

type Field = "handle" | "email" | "password" | "passwordConfirm";

export function Onboarding({ suggested }: { suggested: string }) {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("en");
  const [mode, setMode] = useState<"REGISTER" | "SIGNIN">("REGISTER");

  const [handle, setHandle] = useState(suggested);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const t = useMemo(() => createTranslator(locale), [locale]);

  /** Same rules the server applies, so the form can answer before the round trip. */
  function validate(): Partial<Record<Field, string>> {
    const found: Partial<Record<Field, string>> = {};
    if (handle.trim().length < 3) found.handle = t("auth.error.HANDLE_TOO_SHORT");
    else if (handle.trim().length > 18) found.handle = t("auth.error.HANDLE_TOO_LONG");
    if (!/^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/.test(email.trim().toLowerCase())) {
      found.email = t("auth.error.EMAIL_INVALID");
    }
    if (password.length < 10) found.password = t("auth.error.PASSWORD_TOO_SHORT");
    if (passwordConfirm !== password) found.passwordConfirm = t("auth.error.PASSWORD_MISMATCH");
    return found;
  }

  async function register() {
    const found = validate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle, email, password, passwordConfirm, locale }),
      });
      const data = await response.json();

      if (!data.ok) {
        if (data.errors) {
          setErrors(
            Object.fromEntries(
              Object.entries(data.errors as Record<string, string>).map(([field, code]) => [
                field,
                t(`auth.error.${code}`),
              ]),
            ),
          );
        } else {
          setFormError(t(data.error === "RATE_LIMITED" ? "auth.error.RATE_LIMITED" : "common.error"));
        }
        setBusy(false);
        return;
      }

      router.push("/climb");
      router.refresh();
    } catch {
      setFormError(t("common.error"));
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
        <SignIn locale={locale} onBack={() => setMode("REGISTER")} />
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
            <p className="dim mt-2 text-center text-sm">{t("onboarding.intro")}</p>

            <Labelled label={t("onboarding.nameLabel")} error={errors.handle}>
              <input
                value={handle}
                maxLength={18}
                autoComplete="username"
                onChange={(event) => setHandle(event.target.value)}
                placeholder={t("onboarding.namePlaceholder")}
                className={inputClass(Boolean(errors.handle))}
              />
            </Labelled>

            <Labelled label={t("onboarding.emailLabel")} error={errors.email}>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t("auth.emailPlaceholder")}
                className={inputClass(Boolean(errors.email))}
              />
            </Labelled>

            <Labelled label={t("onboarding.passwordLabel")} error={errors.password}>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t("auth.passwordPlaceholder")}
                className={inputClass(Boolean(errors.password))}
              />
            </Labelled>

            <Labelled label={t("onboarding.passwordConfirmLabel")} error={errors.passwordConfirm}>
              <input
                type="password"
                autoComplete="new-password"
                value={passwordConfirm}
                onChange={(event) => setPasswordConfirm(event.target.value)}
                placeholder={t("onboarding.passwordConfirmPlaceholder")}
                className={inputClass(Boolean(errors.passwordConfirm))}
              />
            </Labelled>

            <p className="dim mt-1.5 text-[0.65rem]">{t("auth.passwordRule")}</p>

            <fieldset className="mt-4">
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
              onClick={register}
              disabled={busy}
              className="btn btn-gold shine relative mt-5 w-full overflow-hidden"
            >
              {busy ? t("onboarding.entering") : t("onboarding.enter")}
            </button>

            {formError && <p className="mt-3 text-center text-sm text-red-300">{formError}</p>}
            <p className="dim mt-3 text-center text-xs">{t("onboarding.noWallet")}</p>

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

function inputClass(invalid: boolean): string {
  return [
    "min-h-12 w-full rounded-xl border bg-[rgba(5,8,15,0.6)] px-4 text-[var(--parchment)]",
    "outline-none transition focus:border-[rgba(79,147,255,0.6)]",
    invalid ? "border-[rgba(201,90,90,0.7)]" : "border-[rgba(201,162,77,0.28)]",
  ].join(" ");
}

/** A field with its own error line, so the player never has to guess which one failed. */
function Labelled({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4">
      <label className="eyebrow mb-1.5 block">{label}</label>
      {children}
      {error && <p className="mt-1 text-[0.68rem] text-red-300">{error}</p>}
    </div>
  );
}
