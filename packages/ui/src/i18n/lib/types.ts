// Control UI type declarations define types contracts.
//
// Ported from `ui/src/i18n/lib/types.ts` for the native Control UI bundle
// (`需求/15.9-ControlUI注入调查.md` step 4). The original `Locale` union has 21
// members because it is shared i18n infrastructure copied from a larger
// Control UI surface; Taskfold's own product surface only ever resolves to
// "en" or "zh-CN" (see `resolveTaskfoldLocale()` in `../translate.ts` and the
// two-option `<select>` in `pages/projects/project-view.ts`). The native
// bundle must be a single self-contained artifact under a size budget, so
// this union — and the locale files under `../locales/` — are trimmed to the
// two reachable values instead of carrying 19 locale bundles (~4.4MB of
// source) that Taskfold's own type system never lets a caller reach.
export type TranslationMap = { [key: string]: string | TranslationMap };

export type Locale = "en" | "zh-CN";
