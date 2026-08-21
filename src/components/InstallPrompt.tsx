"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "./I18nProvider";
import { McnCrest } from "./ui/Icons";

/**
 * Installing the Vault on a phone.
 *
 * This is the whole free distribution story: Android and iOS both let a web app
 * be added to the home screen, where it runs full-screen with its own icon and
 * no browser chrome. No store, no fee, no review.
 *
 * The two platforms get there differently. Android fires `beforeinstallprompt`
 * and we can show a real install button. iOS has no such event — Safari requires
 * the player to use the Share menu — so it gets instructions instead of a button
 * that could not work.
 */

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "mcn.install.dismissed";

export function InstallPrompt() {
  const { t } = useI18n();
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [platform, setPlatform] = useState<"ANDROID" | "IOS" | null>(null);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) return;

    // Already installed: the app is running from the home screen.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
    if (isIos) {
      setPlatform("IOS");
      return;
    }

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as InstallEvent);
      setPlatform("ANDROID");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setPlatform(null);
    setDeferred(null);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    dismiss();
  }

  return (
    <AnimatePresence>
      {platform && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          className="panel panel-gilded mt-4 p-4"
        >
          <div className="flex items-start gap-3">
            <McnCrest size={24} className="mt-0.5 shrink-0 text-[var(--gold)] candle" />
            <div className="min-w-0 flex-1">
              <p className="display text-sm text-[var(--parchment)]">{t("install.title")}</p>
              <p className="dim mt-1 text-xs leading-relaxed">
                {platform === "ANDROID" ? t("install.bodyAndroid") : t("install.bodyIos")}
              </p>

              {platform === "IOS" && (
                <ol className="mt-2 space-y-1 text-xs text-[var(--sapphire-pale)]">
                  <li>1. {t("install.iosStep1")}</li>
                  <li>2. {t("install.iosStep2")}</li>
                </ol>
              )}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            {platform === "ANDROID" ? (
              <button type="button" onClick={install} className="btn btn-gold !min-h-10 !text-xs">
                {t("install.action")}
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={dismiss}
              className="btn btn-ghost !min-h-10 !text-xs"
              style={{ gridColumn: platform === "ANDROID" ? undefined : "1 / -1" }}
            >
              {t("install.later")}
            </button>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
