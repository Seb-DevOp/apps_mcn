"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { createTranslator } from "@/lib/i18n";
import { McnCrest } from "./ui/Icons";

/**
 * The two screens a link from an inbox lands on: confirming an address, and
 * setting a new password.
 *
 * Both are reachable without a session — that is the point of a reset — so they
 * live outside the game shell and carry their own minimal chrome.
 */
export function TokenAction({ kind, locale }: { kind: "CONFIRM" | "RESET"; locale: string }) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"IDLE" | "WORKING" | "DONE" | "BAD">("IDLE");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("token");
    setToken(value);
    if (!value) setState("BAD");
  }, []);

  // Confirming an address needs no input, so it runs as soon as the link opens.
  useEffect(() => {
    if (kind !== "CONFIRM" || !token || state !== "IDLE") return;
    setState("WORKING");
    fetch("/api/auth/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify-confirm", token }),
    })
      .then((r) => r.json())
      .then((data) => setState(data.ok ? "DONE" : "BAD"))
      .catch(() => setState("BAD"));
  }, [kind, token, state]);

  async function submitPassword() {
    if (!token) return;
    setState("WORKING");
    setError(null);
    const data = await fetch("/api/auth/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset-confirm", token, password }),
    }).then((r) => r.json());

    if (!data.ok) {
      if (String(data.error).startsWith("PASSWORD_")) {
        setError(t("auth.error.PASSWORD_TOO_SHORT"));
        setState("IDLE");
      } else {
        setState("BAD");
      }
      return;
    }
    setState("DONE");
    router.push("/climb");
    router.refresh();
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center px-5 py-10">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="panel panel-gilded w-full max-w-sm p-6"
      >
        <McnCrest size={30} className="mx-auto text-[var(--gold)] candle" />

        {state === "BAD" ? (
          <>
            <h1 className="display mt-4 text-center text-lg text-[var(--parchment)]">
              {kind === "CONFIRM" ? t("auth.confirmBad") : t("auth.resetBadToken")}
            </h1>
            <a href="/" className="btn btn-ghost mt-5 w-full">
              {t("auth.backToEntrance")}
            </a>
          </>
        ) : kind === "CONFIRM" ? (
          <>
            <h1 className="display mt-4 text-center text-lg text-[var(--parchment)]">
              {state === "DONE" ? t("auth.confirmTitle") : t("common.loading")}
            </h1>
            {state === "DONE" && (
              <>
                <p className="dim mt-2 text-center text-sm">{t("auth.confirmBody")}</p>
                <a href="/vault" className="btn btn-gold mt-5 w-full">
                  {t("game.back")}
                </a>
              </>
            )}
          </>
        ) : (
          <>
            <h1 className="display mt-4 text-center text-lg text-[var(--parchment)]">
              {t("auth.resetTitle")}
            </h1>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t("auth.passwordPlaceholder")}
              className="mt-4 min-h-12 w-full rounded-xl border border-[rgba(201,162,77,0.28)] bg-[rgba(5,8,15,0.6)] px-4 text-[var(--parchment)] outline-none focus:border-[rgba(79,147,255,0.6)]"
            />
            <p className="dim mt-1.5 text-[0.65rem]">{t("auth.passwordRule")}</p>
            {error && <p className="mt-3 text-center text-sm text-red-300">{error}</p>}
            <button
              type="button"
              onClick={submitPassword}
              disabled={state === "WORKING" || password.length < 10}
              className="btn btn-gold mt-4 w-full"
            >
              {t("auth.resetAction")}
            </button>
          </>
        )}
      </motion.div>
    </main>
  );
}
