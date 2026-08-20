"use client";

import { createContext, useContext, useMemo } from "react";
import { createTranslator, type Translate } from "@/lib/i18n";

interface I18nValue {
  locale: string;
  t: Translate;
  /** Picks the right half of a bilingual content pair. */
  L: (en: string, fr: string) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  locale,
  children,
}: {
  locale: string;
  children: React.ReactNode;
}) {
  const value = useMemo<I18nValue>(() => {
    const t = createTranslator(locale);
    return { locale, t, L: (en, fr) => (locale === "fr" ? fr : en) };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}
