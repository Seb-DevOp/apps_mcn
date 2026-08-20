"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { createTranslator, type Locale } from "@/lib/i18n";
import { McnCrest } from "./ui/Icons";

/**
 * Coming back.
 *
 * Passkey first, because it is one tap and needs nothing remembered. Password and
 * recovery code sit behind it for the devices and situations passkeys do not
 * cover. Failure messages never reveal whether an address has an account.
 */
export function SignIn({ locale, onBack }: { locale: Locale; onBack: () => void }) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const router = useRouter();

  const [method, setMethod] = useState<"PASSKEY" | "PASSWORD" | "RECOVERY">("PASSKEY");
  const [supportsPasskeys, setSupportsPasskeys] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    const supported = browserSupportsWebAuthn();
    setSupportsPasskeys(supported);
    if (!supported) setMethod("PASSWORD");
  }, []);

  function done() {
    router.push("/vault");
    router.refresh();
  }

  async function withPasskey() {
    setBusy(true);
    setError(null);
    try {
      const start = await fetch("/api/auth/passkey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login-options" }),
      }).then((r) => r.json());
      if (!start.ok) throw new Error(start.error);

      const response = await startAuthentication({ optionsJSON: start.options });

      const verified = await fetch("/api/auth/passkey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login-verify", response }),
      }).then((r) => r.json());

      if (!verified.ok) {
        setError(t("auth.signInFailed"));
        return;
      }
      done();
    } catch {
      // Cancelling the platform sheet is a normal thing to do.
      setError(null);
    } finally {
      setBusy(false);
    }
  }

  async function withPassword() {
    setBusy(true);
    setError(null);
    const data = await fetch("/api/auth/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "password", identifier, password }),
    }).then((r) => r.json());

    if (!data.ok) setError(t(data.error === "RATE_LIMITED" ? "auth.error.RATE_LIMITED" : "auth.signInFailed"));
    else done();
    setBusy(false);
  }

  async function withRecoveryCode() {
    setBusy(true);
    setError(null);
    const data = await fetch("/api/auth/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "recovery", code }),
    }).then((r) => r.json());

    if (!data.ok) setError(t("auth.signInFailed"));
    else done();
    setBusy(false);
  }

  async function requestReset() {
    // A reset can only ever go to an address, so a name is not enough here.
    if (!identifier.includes("@")) {
      setNotice(t("auth.resetNeedsEmail"));
      return;
    }
    setBusy(true);
    setError(null);
    const data = await fetch("/api/auth/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset-request", email: identifier }),
    }).then((r) => r.json());

    setNotice(data.deliveryEnabled ? t("auth.resetSent") : t("auth.resetUnavailable"));
    setBusy(false);
  }

  const TABS: { key: typeof method; labelKey: string }[] = [
    ...(supportsPasskeys ? [{ key: "PASSKEY" as const, labelKey: "auth.methodPasskey" }] : []),
    { key: "PASSWORD", labelKey: "auth.methodPassword" },
    { key: "RECOVERY", labelKey: "auth.methodRecovery" },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative z-10 w-full max-w-sm"
    >
      <div className="panel panel-gilded arch p-5">
        <McnCrest size={28} className="mx-auto text-[var(--gold)] candle" />
        <h2 className="display mt-3 text-center text-lg text-[var(--parchment)]">
          {t("auth.signInTitle")}
        </h2>
        <p className="dim mt-2 text-center text-xs">{t("auth.signInBody")}</p>

        <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${TABS.length}, 1fr)` }}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setMethod(tab.key);
                setError(null);
                setNotice(null);
              }}
              data-active={method === tab.key}
              className="min-h-10 rounded-xl border border-[rgba(201,162,77,0.22)] bg-[rgba(23,32,62,0.5)] text-[0.7rem] transition data-[active=true]:border-[rgba(240,208,137,0.6)] data-[active=true]:bg-[rgba(201,162,77,0.14)] data-[active=true]:text-[var(--gold-bright)]"
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>

        {method === "PASSKEY" && (
          <>
            <p className="dim mt-4 text-center text-xs leading-relaxed">{t("auth.passkeyHint")}</p>
            <button
              type="button"
              onClick={withPasskey}
              disabled={busy}
              className="btn btn-gold mt-3 w-full"
            >
              {t("auth.passkeyContinue")}
            </button>
          </>
        )}

        {method === "PASSWORD" && (
          <>
            <input
              autoComplete="username"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder={t("auth.identifierPlaceholder")}
              className="mt-4 min-h-12 w-full rounded-xl border border-[rgba(201,162,77,0.28)] bg-[rgba(5,8,15,0.6)] px-4 text-[var(--parchment)] outline-none focus:border-[rgba(79,147,255,0.6)]"
            />
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t("auth.passwordPlaceholder")}
              className="mt-2 min-h-12 w-full rounded-xl border border-[rgba(201,162,77,0.28)] bg-[rgba(5,8,15,0.6)] px-4 text-[var(--parchment)] outline-none focus:border-[rgba(79,147,255,0.6)]"
            />
            <button
              type="button"
              onClick={withPassword}
              disabled={busy || !identifier || !password}
              className="btn btn-gold mt-3 w-full"
            >
              {t("auth.signInAction")}
            </button>
            <button
              type="button"
              onClick={requestReset}
              disabled={busy || !identifier}
              className="mt-3 w-full text-center text-[0.68rem] text-[var(--sapphire-pale)] underline underline-offset-4"
            >
              {t("auth.forgot")}
            </button>
          </>
        )}

        {method === "RECOVERY" && (
          <>
            <p className="dim mt-4 text-center text-xs leading-relaxed">{t("auth.recoveryHint")}</p>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="XXXX-XXXX-XXXX"
              autoCapitalize="characters"
              className="tabular mt-3 min-h-12 w-full rounded-xl border border-[rgba(201,162,77,0.28)] bg-[rgba(5,8,15,0.6)] px-4 text-center tracking-widest text-[var(--parchment)] outline-none focus:border-[rgba(79,147,255,0.6)]"
            />
            <button
              type="button"
              onClick={withRecoveryCode}
              disabled={busy || code.length < 8}
              className="btn btn-gold mt-3 w-full"
            >
              {t("auth.signInAction")}
            </button>
          </>
        )}

        {notice && <p className="mt-3 text-center text-xs text-[#8fd8b6]">{notice}</p>}
        {error && <p className="mt-3 text-center text-sm text-red-300">{error}</p>}

        <button
          type="button"
          onClick={onBack}
          className="mt-5 w-full text-center text-xs text-[var(--text-dim)] underline underline-offset-4"
        >
          {t("auth.backToEntrance")}
        </button>
      </div>
    </motion.section>
  );
}
