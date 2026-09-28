// 迁移前对应 `test/i18n-manager.test.ts`（针对 `ui/src/i18n/lib/translate.ts`）与
// `test/host-context.test.ts` 里 `resolveTaskfoldLocale` 的用例。iframe 迁移到宿主原生注入
// 后，`ui/src/i18n/lib/translate.ts` 原封不动地搬到了 `browser/i18n/lib/translate.ts`
// （与旧版逐字节比对无差异），`resolveTaskfoldLocale` 也从已删除的 `host-context.ts`
// 并入了这个文件，因此这里把两批用例合并，并按新签名调整。
//
// TASK-8 起 translate.ts 不再直接读写 localStorage，语言偏好改由宿主注入
// （`TaskfoldHost.locale`）；OpenClaw 实现的 localStorage 行为搬到了
// `browser/openclaw-host.ts` 的 `createOpenClawLocalePreference`。下面的 manager 用例
// 注入这个实现，断言与搬迁前逐条一致。
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TranslationMap } from "../packages/ui/src/i18n/lib/types.ts";
import {
  resolveInitialTaskfoldLocale,
  resolveTaskfoldLocale,
  type TaskfoldLocale,
  type TaskfoldLocalePreference,
} from "../packages/ui/src/i18n/lib/translate.ts";
import { createOpenClawLocalePreference } from "../packages/ui/src/openclaw-host.ts";

type TestI18nManager = {
  initialize(preference?: TaskfoldLocalePreference): Promise<boolean>;
  getLocale(): TaskfoldLocale;
  setLocale(locale: TaskfoldLocale, options?: { persist?: boolean }): Promise<boolean>;
  registerTranslation(locale: TaskfoldLocale, map: TranslationMap): void;
  t(key: string, params?: Record<string, string>): string;
};

type TestI18nApi = {
  createI18nManager(
    loadLocaleTranslation: (locale: TaskfoldLocale) => Promise<TranslationMap | null>,
    preference?: TaskfoldLocalePreference,
  ): TestI18nManager;
};

const LOCALE_STORAGE_KEY = "taskfold.i18n.locale";
const LEGACY_LOCALE_STORAGE_KEY = "flowboard.i18n.locale";
const TEST_I18N_API = Symbol.for("openclaw.i18nManagerTestApi");

class MemoryStorage {
  private readonly entries = new Map<string, string>();

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }
}

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
let storage: MemoryStorage;

function createManager(
  loader: (locale: TaskfoldLocale) => Promise<TranslationMap | null>,
  hostLocale?: string,
): TestI18nManager {
  const api = (globalThis as Record<PropertyKey, unknown>)[TEST_I18N_API] as TestI18nApi;
  return api.createI18nManager(loader, createOpenClawLocalePreference(() => hostLocale));
}

beforeEach(() => {
  storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
});

afterEach(() => {
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
  } else {
    Reflect.deleteProperty(globalThis, "localStorage");
  }
});

describe("resolveTaskfoldLocale", () => {
  it("collapses any zh-prefixed tag to Simplified Chinese", () => {
    expect(resolveTaskfoldLocale("zh-CN")).toBe("zh-CN");
    expect(resolveTaskfoldLocale("zh-TW")).toBe("zh-CN");
    expect(resolveTaskfoldLocale("ZH-hant")).toBe("zh-CN");
  });

  it("defaults everything else, including empty and non-string input, to English", () => {
    expect(resolveTaskfoldLocale("ja-JP")).toBe("en");
    expect(resolveTaskfoldLocale("")).toBe("en");
    expect(resolveTaskfoldLocale(undefined)).toBe("en");
    expect(resolveTaskfoldLocale(42)).toBe("en");
  });
});

describe("resolveInitialTaskfoldLocale", () => {
  it("prefers a saved Taskfold language, then the one-time host locale, then browser locale", () => {
    expect(
      resolveInitialTaskfoldLocale({
        storedLocale: "en",
        hostLocale: "zh-CN",
        browserLocale: "zh-CN",
      }),
    ).toBe("en");
    expect(
      resolveInitialTaskfoldLocale({
        hostLocale: "zh-TW",
        browserLocale: "en-US",
      }),
    ).toBe("zh-CN");
    expect(resolveInitialTaskfoldLocale({ browserLocale: "zh-CN" })).toBe("zh-CN");
    expect(resolveInitialTaskfoldLocale({ browserLocale: "ja-JP" })).toBe("en");
  });
});

describe("Taskfold i18n manager", () => {
  it("persists the first successful host-derived locale as Taskfold's independent preference", async () => {
    const manager = createManager(
      async (locale) => (locale === "zh-CN" ? { taskfoldProject: { title: "项目" } } : null),
      "zh-CN",
    );

    await expect(manager.initialize()).resolves.toBe(true);
    expect(manager.getLocale()).toBe("zh-CN");
    expect(storage.getItem(LOCALE_STORAGE_KEY)).toBe("zh-CN");
  });

  it("carries an existing Flowboard language preference into Taskfold once", async () => {
    storage.setItem(LEGACY_LOCALE_STORAGE_KEY, "zh-CN");
    const manager = createManager(
      async (locale) => (locale === "zh-CN" ? { taskfoldProject: { title: "项目" } } : null),
      "en",
    );

    await expect(manager.initialize()).resolves.toBe(true);
    expect(manager.getLocale()).toBe("zh-CN");
    expect(storage.getItem(LOCALE_STORAGE_KEY)).toBe("zh-CN");
  });

  it("keeps the current language and preference when a language chunk cannot load", async () => {
    const manager = createManager(async () => null);

    await expect(manager.setLocale("zh-CN")).resolves.toBe(false);
    expect(manager.getLocale()).toBe("en");
    expect(storage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
  });

  it("keeps only the latest asynchronous selection", async () => {
    let resolveChinese: ((value: TranslationMap | null) => void) | undefined;
    const manager = createManager(
      async (locale) =>
        await new Promise<TranslationMap | null>((resolve) => {
          if (locale === "zh-CN") {
            resolveChinese = resolve;
          } else {
            resolve(null);
          }
        }),
    );

    const chinese = manager.setLocale("zh-CN");
    await expect(manager.setLocale("en")).resolves.toBe(true);
    resolveChinese?.({ taskfoldProject: { title: "项目" } });

    await expect(chinese).resolves.toBe(false);
    expect(manager.getLocale()).toBe("en");
    expect(storage.getItem(LOCALE_STORAGE_KEY)).toBe("en");
  });
});

describe("Taskfold i18n manager translate()", () => {
  it("interpolates {param} placeholders from the params map", () => {
    const manager = createManager(async () => null);
    manager.registerTranslation("en", {
      greeting: "Hello {name}, you have {count} tasks",
    });

    expect(manager.t("greeting", { name: "Ann", count: "3" })).toBe(
      "Hello Ann, you have 3 tasks",
    );
  });

  it("leaves a placeholder literally in place when its param is missing or empty", () => {
    const manager = createManager(async () => null);
    manager.registerTranslation("en", { greeting: "Hello {name}" });

    // 没传 params：整段原样返回，花括号不会被吞掉。
    expect(manager.t("greeting")).toBe("Hello {name}");
    // 传了 params 但值是空字符串：`value || fallback` 把空字符串当成“未提供”处理，
    // 因此占位符原样保留而不是被替换成空串——这是当前实现的真实行为，值得用例钉住。
    expect(manager.t("greeting", { name: "" })).toBe("Hello {name}");
  });

  it("falls back to the English bundle when the active locale is missing the key", async () => {
    const manager = createManager(async () => null);
    // 完全替换 zh-CN 的翻译表，使其只包含一个自定义 key，模拟“该语言包缺失某个 key”。
    manager.registerTranslation("zh-CN", { onlyInChinese: "仅此一个" });
    await expect(manager.setLocale("zh-CN", { persist: false })).resolves.toBe(true);

    expect(manager.t("onlyInChinese")).toBe("仅此一个");
    // common.ok 不在上面注册的 zh-CN 表里，应回退到构造函数里预置的真实英文包。
    expect(manager.t("common.ok")).toBe("OK");
  });

  it("returns the raw key when it is missing from every locale", () => {
    const manager = createManager(async () => null);
    expect(manager.t("taskfoldProject.thisKeyDoesNotExist")).toBe(
      "taskfoldProject.thisKeyDoesNotExist",
    );
  });
});
