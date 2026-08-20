"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import type { AccountStatus } from "@/lib/auth/account";
import { useI18n } from "./I18nProvider";
import { ShieldIcon, McnCrest } from "./ui/Icons";

/**
 * Securing an account.
 *
 * A guest never has to do this to play — but until they do, their progress lives
 * and dies with one browser's cookie, and the screen says so in as many words.
 *
 * Three methods, in the order they actually help:
 *   passkey        — nothing to remember, survives a lost phone via the platform
 *   recovery codes — the floor under everything else
 *   email/password — familiar, and the way back when the other two are gone
 */
export function AccountSecurity({ initial }: { initial: AccountStatus }) {
  const { t, locale } = useI18n();
  const router = useRouter();

  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [supportsPasskeys, setSupportsPasskeys] = useState(false);

  const [email, setEmail] = useState(initial.email ?? "");
  const [password, setPassword] = useState("");

  useEffect(() => {
    setSupportsPasskeys(browserSupportsWebAuthn());
  }, []);

  async function refresh() {
    const data = await fetch("/api/auth/status").then((r) => r.json());
    if (data.ok) setStatus(data.status as AccountStatus);
    router.refresh();
  }

  function explain(code: string): string {
    const known = [
      "EMAIL_TAKEN",
      "EMAIL_INVALID",
      "PASSWORD_TOO_SHORT",
      "PASSWORD_TOO_LONG",
      "PASSWORD_TOO_COMMON",
      "WRONG_PASSWORD",
      "LAST_METHOD",
      "RATE_LIMITED",
    ];
    return known.includes(code) ? t(`auth.error.${code}`) : t("common.error");
  }

  async function addPasskey() {
    setBusy("passkey");
    setError(null);
    try {
      const start = await fetch("/api/auth/passkey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "register-options" }),
      }).then((r) => r.json());
      if (!start.ok) return setError(explain(start.error));

      const response = await startRegistration({ optionsJSON: start.options });

      const verified = await fetch("/api/auth/passkey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "register-verify", response, deviceLabel: deviceLabel() }),
      }).then((r) => r.json());

      if (!verified.ok) return setError(explain(verified.error));
      setNotice(t("auth.passkeyAdded"));
      await refresh();
    } catch {
      // A cancelled platform prompt is not an error worth shouting about.
      setError(null);
    } finally {
      setBusy(null);
    }
  }

  async function removePasskey(credentialRowId: string) {
    setBusy(credentialRowId);
    setError(null);
    const data = await fetch("/api/auth/passkey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", credentialRowId }),
    }).then((r) => r.json());
    if (!data.ok) setError(explain(data.error));
    else await refresh();
    setBusy(null);
  }

  async function saveEmailPassword() {
    setBusy("password");
    setError(null);
    const data = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "claim", email, password }),
    }).then((r) => r.json());

    if (!data.ok) setError(explain(data.error));
    else {
      setPassword("");
      setNotice(t("auth.passwordSaved"));
      await refresh();
    }
    setBusy(null);
  }

  async function generateCodes() {
    setBusy("codes");
    setError(null);
    const data = await fetch("/api/auth/recovery", { method: "POST" }).then((r) => r.json());
    if (!data.ok) setError(explain(data.error));
    else {
      setCodes(data.codes as string[]);
      await refresh();
    }
    setBusy(null);
  }

  async function requestVerification() {
    setBusy("verify");
    const data = await fetch("/api/auth/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify-request" }),
    }).then((r) => r.json());
    setNotice(data.delivered ? t("auth.verifySent") : t("auth.verifyUnavailable"));
    setBusy(null);
  }

  return (
    <section className="mt-6">
      <p className="eyebrow">{t("auth.title")}</p>

      {/* The one thing a guest most needs to know. */}
      {status.atRisk ? (
        <div className="panel mt-2 border-l-2 border-l-[#c96a6a] p-4">
          <p className="display text-sm text-[var(--parchment)]">{t("auth.atRiskTitle")}</p>
          <p className="dim mt-1 text-xs leading-relaxed">{t("auth.atRiskBody")}</p>
        </div>
      ) : (
        <div className="panel panel-sapphire mt-2 flex items-center gap-3 p-4">
          <ShieldIcon size={18} className="shrink-0 text-[var(--sapphire-pale)]" />
          <p className="text-xs text-[var(--sapphire-pale)]">{t("auth.secured")}</p>
        </div>
      )}

      {notice && (
        <p className="mt-3 rounded-lg border border-[rgba(105,195,154,0.35)] bg-[rgba(105,195,154,0.1)] px-3 py-2 text-center text-xs text-[#8fd8b6]">
          {notice}
        </p>
      )}
      {error && <p className="mt-3 text-center text-sm text-red-300">{error}</p>}

      {/* --- Passkeys ------------------------------------------------------ */}
      <div className="panel mt-3 p-4">
        <p className="display text-sm text-[var(--parchment)]">{t("auth.passkeyTitle")}</p>
        <p className="dim mt-1 text-xs leading-relaxed">{t("auth.passkeyBody")}</p>

        {status.passkeys.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {status.passkeys.map((key) => (
              <li
                key={key.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-[rgba(201,162,77,0.2)] bg-[rgba(5,8,15,0.4)] px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs text-[var(--parchment)]">
                    {key.label ?? t("auth.passkeyUnnamed")}
                  </span>
                  <span className="dim block text-[0.62rem]">
                    {new Date(key.createdAt).toLocaleDateString(locale)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => removePasskey(key.id)}
                  disabled={busy === key.id}
                  className="btn btn-ghost shrink-0 !min-h-8 !px-2.5 !text-[0.6rem]"
                >
                  {t("auth.remove")}
                </button>
              </li>
            ))}
          </ul>
        )}

        {supportsPasskeys ? (
          <button
            type="button"
            onClick={addPasskey}
            disabled={busy === "passkey"}
            className="btn btn-gold mt-3 w-full !min-h-11 !text-xs"
          >
            {status.passkeys.length === 0 ? t("auth.passkeyAdd") : t("auth.passkeyAddAnother")}
          </button>
        ) : (
          <p className="dim mt-3 text-xs">{t("auth.passkeyUnsupported")}</p>
        )}
      </div>

      {/* --- Recovery codes ------------------------------------------------ */}
      <div className="panel mt-3 p-4">
        <p className="display text-sm text-[var(--parchment)]">{t("auth.codesTitle")}</p>
        <p className="dim mt-1 text-xs leading-relaxed">{t("auth.codesBody")}</p>
        <p className="tabular mt-2 text-xs text-[var(--sapphire-pale)]">
          {t("auth.codesLeft", { count: status.recoveryCodesLeft })}
        </p>
        <button
          type="button"
          onClick={generateCodes}
          disabled={busy === "codes"}
          className="btn btn-ghost mt-3 w-full !min-h-11 !text-xs"
        >
          {status.recoveryCodesLeft > 0 ? t("auth.codesRenew") : t("auth.codesGenerate")}
        </button>
      </div>

      {/* --- Email + password ---------------------------------------------- */}
      <div className="panel mt-3 p-4">
        <p className="display text-sm text-[var(--parchment)]">{t("auth.passwordTitle")}</p>
        <p className="dim mt-1 text-xs leading-relaxed">{t("auth.passwordBody")}</p>

        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t("auth.emailPlaceholder")}
          className="mt-3 min-h-12 w-full rounded-xl border border-[rgba(201,162,77,0.28)] bg-[rgba(5,8,15,0.6)] px-4 text-[var(--parchment)] outline-none transition focus:border-[rgba(79,147,255,0.6)]"
        />
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={t("auth.passwordPlaceholder")}
          className="mt-2 min-h-12 w-full rounded-xl border border-[rgba(201,162,77,0.28)] bg-[rgba(5,8,15,0.6)] px-4 text-[var(--parchment)] outline-none transition focus:border-[rgba(79,147,255,0.6)]"
        />
        <p className="dim mt-1.5 text-[0.65rem]">{t("auth.passwordRule")}</p>

        <button
          type="button"
          onClick={saveEmailPassword}
          disabled={busy === "password" || email.length < 3 || password.length < 10}
          className="btn btn-royal mt-3 w-full !min-h-11 !text-xs"
        >
          {status.hasPassword ? t("auth.passwordUpdate") : t("auth.passwordSave")}
        </button>

        {status.email && !status.emailVerified && (
          <button
            type="button"
            onClick={requestVerification}
            disabled={busy === "verify"}
            className="btn btn-ghost mt-2 w-full !min-h-10 !text-[0.65rem]"
          >
            {t("auth.verifyRequest")}
          </button>
        )}
        {status.email && !status.emailDeliveryEnabled && (
          <p className="dim mt-2 text-[0.65rem]">{t("auth.emailDeliveryOff")}</p>
        )}
      </div>

      {/* --- Farcaster / wallet: built, switched off ------------------------ */}
      <div className="panel mt-3 p-4">
        <p className="display text-sm text-[var(--parchment)]">{t("auth.externalTitle")}</p>
        <ul className="mt-2 space-y-1.5">
          {status.identityProviders.map((provider) => (
            <li
              key={provider.provider}
              className="flex items-center justify-between gap-2 rounded-lg border border-[rgba(201,162,77,0.18)] bg-[rgba(5,8,15,0.4)] px-3 py-2"
            >
              <span className="text-xs text-[var(--parchment)]">
                {t(`auth.provider.${provider.provider}`)}
              </span>
              <span className="text-[0.6rem] uppercase tracking-[0.14em] text-[var(--text-dim)]">
                {provider.enabled ? t("auth.providerOn") : t("common.soon")}
              </span>
            </li>
          ))}
        </ul>
        <p className="dim mt-2 text-[0.65rem] leading-relaxed">{t("auth.externalBody")}</p>
      </div>

      {/* --- Recovery codes, shown exactly once ---------------------------- */}
      <AnimatePresence>
        {codes && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[rgba(3,6,14,0.94)] px-5 py-10"
          >
            <motion.div
              initial={{ scale: 0.94, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              className="panel panel-gilded w-full max-w-sm p-5"
            >
              <McnCrest size={26} className="mx-auto text-[var(--gold)] candle" />
              <p className="display mt-3 text-center text-base text-[var(--parchment)]">
                {t("auth.codesModalTitle")}
              </p>
              <p className="dim mt-2 text-center text-xs leading-relaxed">
                {t("auth.codesModalBody")}
              </p>

              <ul className="tabular mt-4 grid grid-cols-2 gap-2">
                {codes.map((code) => (
                  <li
                    key={code}
                    className="rounded-lg border border-[rgba(201,162,77,0.3)] bg-[rgba(5,8,15,0.5)] px-2 py-2 text-center text-sm tracking-wider text-[var(--gold-bright)]"
                  >
                    {code}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(codes.join("\n"))}
                className="btn btn-ghost mt-4 w-full !min-h-10 !text-xs"
              >
                {t("auth.codesCopy")}
              </button>
              <button
                type="button"
                onClick={() => setCodes(null)}
                className="btn btn-gold mt-2 w-full"
              >
                {t("auth.codesSaved")}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/** A short, human hint so a player can tell their keys apart later. */
function deviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return "iPhone / iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "Appareil";
}
