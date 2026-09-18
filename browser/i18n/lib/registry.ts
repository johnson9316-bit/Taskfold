// Control UI i18n module implements registry behavior.
//
// Trimmed port of `ui/src/i18n/lib/registry.ts`: the original registers 21
// lazily `import()`-ed locale bundles for a shared i18n infrastructure module.
// Taskfold's own `Locale` type (see `./types.ts`) only has two members, so
// only "zh-CN" is ever passed to `loadLazyLocaleTranslation()` at runtime —
// the other 19 loaders would be dead code here, and their bundles (~4.4MB of
// source combined) would eat most of the native Control UI artifact's 4MiB
// single-file budget for translations nothing can ever select. "en" ships as
// the eager default in `./translate.ts`, exactly as upstream does.
import { zh_CN } from "../locales/zh-CN.ts";
import type { Locale, TranslationMap } from "./types.ts";

export const DEFAULT_LOCALE: Locale = "en";

export const SUPPORTED_LOCALES: ReadonlyArray<Locale> = ["en", "zh-CN"];

export function isSupportedLocale(value: string | null | undefined): value is Locale {
  return value !== null && value !== undefined && SUPPORTED_LOCALES.includes(value as Locale);
}

export function resolveNavigatorLocale(browserLanguage: string): Locale {
  return browserLanguage.toLowerCase().startsWith("zh") ? "zh-CN" : DEFAULT_LOCALE;
}

export async function loadLazyLocaleTranslation(locale: Locale): Promise<TranslationMap | null> {
  return locale === "zh-CN" ? zh_CN : null;
}
