"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { createTranslator, type Locale } from "@/lib/i18n";
import { McnCrest } from "./ui/Icons";

/**
 * Entering from a Farcaster client.
 *
 * A player who opens the Mini App is already identified, so they never see the
 * registration form: their FID becomes a real, persistent account on the spot.
 *
 * Only the token is trusted. `sdk.context.user` is passed in by the client and
 * the Farcaster docs say plainly that it may not have been authorised by the
 * user — so the username travels as a suggestion for a display name and nothing
 * more. The FID the server acts on comes from the verified JWT.
 *
 * `state` starts as "checking" and the entrance stays hidden until we know: a
 * Farcaster player must not see a signup form flash past before being signed in.
 */
type GateState = "CHECKING" | "OUTSIDE" | "SIGNING_IN" | "FAILED";

export function FarcasterGate({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const t = createTranslator(locale);
  const router = useRouter();
  const [state, setState] = useState<GateState>("CHECKING");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { sdk } = await import("@farcaster/miniapp-sdk");
        if (cancelled) return;

        if (!(await sdk.isInMiniApp())) {
          setState("OUTSIDE");
          return;
        }

        setState("SIGNING_IN");

        const context = await sdk.context;
        const { token } = await sdk.quickAuth.getToken();
        if (!token) {
          setState("FAILED");
          return;
        }

        const response = await fetch("/api/auth/farcaster", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            username: context?.user?.username,
            displayName: context?.user?.displayName,
          }),
        });
        const data = await response.json();

        if (cancelled) return;
        if (!data.ok) {
          setState("FAILED");
          return;
        }

        router.push("/descent");
        router.refresh();
      } catch {
        if (!cancelled) setState("FAILED");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (state === "OUTSIDE" || state === "FAILED") {
    return (
      <>
        {state === "FAILED" && (
          <p className="fixed inset-x-0 top-0 z-50 bg-[rgba(201,90,90,0.15)] px-4 py-2 text-center text-xs text-red-300">
            {t("farcaster.failed")}
          </p>
        )}
        {children}
      </>
    );
  }

  // Checking or signing in: a quiet holding screen in the Vault's own colours,
  // so the Farcaster splash hands over to something that belongs to the app.
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center gap-4 px-6">
      <motion.div
        animate={{ opacity: [0.55, 1, 0.55] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      >
        <McnCrest size={44} className="text-[var(--gold-bright)]" />
      </motion.div>
      <p className="eyebrow">{t("app.subtitle")}</p>
      <p className="dim text-center text-sm">
        {state === "SIGNING_IN" ? t("farcaster.signingIn") : t("common.loading")}
      </p>
    </main>
  );
}
