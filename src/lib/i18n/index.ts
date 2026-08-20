import en from "./en.json";
import fr from "./fr.json";

/**
 * Localisation.
 *
 * Every string the player can read lives in en.json / fr.json. Nothing in the UI
 * is hard-coded, so adding a third language means adding one file and one entry
 * to LOCALES — no component changes.
 *
 * Game *content* (rank names, item names, lore) is bilingual in its own content
 * files and in the database, because that text is data, not interface.
 */

export const LOCALES = ["en", "fr"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABEL: Record<Locale, string> = {
  en: "English",
  fr: "Français",
};

const DICTIONARIES: Record<Locale, Record<string, string>> = { en, fr };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function getDictionary(locale: string): Record<string, string> {
  return DICTIONARIES[isLocale(locale) ? locale : "en"];
}

export type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** Builds the `t` function. Missing keys return the key itself, which makes gaps loud. */
export function createTranslator(locale: string): Translate {
  const dict = getDictionary(locale);
  const fallback = DICTIONARIES.en;
  return (key, vars) => {
    let value = dict[key] ?? fallback[key] ?? key;
    if (vars) {
      for (const [name, replacement] of Object.entries(vars)) {
        value = value.replaceAll(`{${name}}`, String(replacement));
      }
    }
    return value;
  };
}

/** Picks the bilingual field off a content object: pickLocalized(item, "name", locale). */
export function pickLocalized<T extends Record<string, unknown>>(
  source: T,
  field: string,
  locale: string,
): string {
  const key = `${field}${isLocale(locale) && locale === "fr" ? "Fr" : "En"}`;
  return String(source[key] ?? "");
}
