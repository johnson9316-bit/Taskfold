// Control UI i18n module implements translate behavior.
import { en } from "../locales/en.ts";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  isSupportedLocale,
  loadLazyLocaleTranslation,
  resolveNavigatorLocale,
} from "./registry.ts";
import type { Locale, TranslationMap } from "./types.ts";

type Subscriber = (locale: Locale) => void;
type LocaleLoadRecovery = {
  isUnrecoverableError: (error: unknown) => boolean;
  onUnrecoverableLocaleLoad?: (locale: Locale) => void;
};
type LocaleTranslationLoader = (locale: Locale) => Promise<TranslationMap | null>;
type SetLocaleOptions = {
  persist?: boolean;
};

export type TaskfoldLocale = Extract<Locale, "en" | "zh-CN">;

/**
 * 语言偏好的来源与回写，由宿主提供（`TaskfoldHost.locale`，见 `packages/ui/src/host.ts`）。
 * 本模块不再直接读写 localStorage：OpenClaw 实现的 localStorage 读写在
 * `packages/ui/src/openclaw-host.ts`，其他宿主（如 VS Code 跟随编辑器语言）各自实现。
 */
export type TaskfoldLocalePreference = {
  /** 启动时的语言，可以是任意语言标签，由 `resolveTaskfoldLocale` 归一为 en / zh-CN。 */
  initial(): unknown;
  /** 某个语言成功生效后回写偏好；不需要持久化的宿主可以空实现。 */
  persist(locale: TaskfoldLocale): void;
};

export function resolveTaskfoldLocale(value: unknown): TaskfoldLocale {
  if (typeof value !== "string") {
    return "en";
  }
  return value.trim().toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function resolveInitialTaskfoldLocale(input: {
  storedLocale?: unknown;
  hostLocale?: unknown;
  browserLocale?: unknown;
}): TaskfoldLocale {
  if (typeof input.storedLocale === "string" && input.storedLocale.trim()) {
    return resolveTaskfoldLocale(input.storedLocale);
  }
  if (typeof input.hostLocale === "string" && input.hostLocale.trim()) {
    return resolveTaskfoldLocale(input.hostLocale);
  }
  const browserLocale = typeof input.browserLocale === "string" ? input.browserLocale : "";
  return resolveTaskfoldLocale(resolveNavigatorLocale(browserLocale));
}

export { SUPPORTED_LOCALES, isSupportedLocale };

class I18nManager {
  private locale: TaskfoldLocale = "en";
  private translations: Partial<Record<Locale, TranslationMap>> = { [DEFAULT_LOCALE]: en };
  private subscribers: Set<Subscriber> = new Set();
  // Locale chunks are served by the gateway, so a selection made while disconnected can fail.
  // Preserve the target for the next connected transition; otherwise the chrome silently stays
  // in the old language forever.
  private pendingLocale: TaskfoldLocale | null = null;
  // Only the latest selection may update retry state or become active after an async chunk load.
  private localeRequestGeneration = 0;
  private localeLoadRecovery: LocaleLoadRecovery | undefined;
  private initialization: Promise<boolean> | null = null;

  constructor(
    private readonly loadLocaleTranslation: LocaleTranslationLoader = loadLazyLocaleTranslation,
    private preference: TaskfoldLocalePreference | undefined = undefined,
  ) {}

  private persistLocale(locale: TaskfoldLocale) {
    this.preference?.persist(locale);
  }

  public initialize(preference?: TaskfoldLocalePreference): Promise<boolean> {
    if (this.initialization) {
      return this.initialization;
    }
    if (preference) {
      this.preference = preference;
    }
    this.initialization = this.applyLocale(
      resolveTaskfoldLocale(this.preference?.initial()),
      false,
      true,
    );
    return this.initialization;
  }

  public getLocale(): TaskfoldLocale {
    return this.locale;
  }

  public async setLocale(locale: TaskfoldLocale, options: SetLocaleOptions = {}): Promise<boolean> {
    return this.applyLocale(resolveTaskfoldLocale(locale), false, options.persist !== false);
  }

  private async applyLocale(
    locale: TaskfoldLocale,
    retrying: boolean,
    persist: boolean,
  ): Promise<boolean> {
    const requestGeneration = ++this.localeRequestGeneration;
    const needsTranslationLoad = locale !== DEFAULT_LOCALE && !this.translations[locale];
    if (this.locale === locale && !needsTranslationLoad) {
      this.pendingLocale = null;
      if (persist) {
        this.persistLocale(locale);
      }
      return true;
    }

    if (needsTranslationLoad) {
      this.pendingLocale = locale;
      try {
        const translation = await this.loadLocaleTranslation(locale);
        if (!translation) {
          if (this.localeRequestGeneration === requestGeneration) {
            this.pendingLocale = locale;
          }
          return false;
        }
        this.translations[locale] = translation;
      } catch (e) {
        const isCurrentRequest = this.localeRequestGeneration === requestGeneration;
        if (isCurrentRequest) {
          this.pendingLocale = locale;
        }
        if (
          retrying &&
          persist &&
          isCurrentRequest &&
          this.localeLoadRecovery?.isUnrecoverableError(e)
        ) {
          this.persistLocale(locale);
          this.localeLoadRecovery.onUnrecoverableLocaleLoad?.(locale);
        }
        console.error(`Failed to load locale: ${locale}`, e);
        return false;
      }
    }

    if (this.localeRequestGeneration !== requestGeneration) {
      return false;
    }
    this.pendingLocale = null;
    this.locale = locale;
    if (persist) {
      this.persistLocale(locale);
    }
    this.notify();
    return true;
  }

  public retryPendingLocale(): void {
    if (this.pendingLocale === null || this.pendingLocale === this.locale) {
      return;
    }
    const target = this.pendingLocale;
    this.pendingLocale = null;
    void this.applyLocale(target, true, true);
  }

  public setLocaleLoadRecovery(recovery: LocaleLoadRecovery | undefined): void {
    // Keep this leaf independent of app-level stale-chunk policy; the app injects both the
    // error classifier and guarded recovery action.
    this.localeLoadRecovery = recovery;
  }

  public registerTranslation(locale: Locale, map: TranslationMap) {
    this.translations[locale] = map;
  }

  public subscribe(sub: Subscriber) {
    this.subscribers.add(sub);
    return () => this.subscribers.delete(sub);
  }

  private notify() {
    this.subscribers.forEach((sub) => sub(this.locale));
  }

  public t(key: string, params?: Record<string, string>): string {
    const keys = key.split(".");
    let value: unknown = this.translations[this.locale] || this.translations[DEFAULT_LOCALE];

    for (const k of keys) {
      if (value && typeof value === "object") {
        value = (value as Record<string, unknown>)[k];
      } else {
        value = undefined;
        break;
      }
    }

    // Fallback to English.
    if (value === undefined && this.locale !== DEFAULT_LOCALE) {
      value = this.translations[DEFAULT_LOCALE];
      for (const k of keys) {
        if (value && typeof value === "object") {
          value = (value as Record<string, unknown>)[k];
        } else {
          value = undefined;
          break;
        }
      }
    }

    if (typeof value !== "string") {
      return key;
    }

    if (params) {
      return value.replace(/\{(\w+)\}/g, (_, k) => params[k] || `{${k}}`);
    }

    return value;
  }
}

export const i18n = new I18nManager();
export const t = (key: string, params?: Record<string, string>) => i18n.t(key, params);

if (typeof process !== "undefined" && (process.env?.VITEST || process.env?.NODE_ENV === "test")) {
  (globalThis as Record<PropertyKey, unknown>)[Symbol.for("openclaw.i18nManagerTestApi")] = {
    createI18nManager(
      loadLocaleTranslation: LocaleTranslationLoader,
      preference?: TaskfoldLocalePreference,
    ) {
      return new I18nManager(loadLocaleTranslation, preference);
    },
  };
}
