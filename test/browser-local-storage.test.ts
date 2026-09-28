// `browser/local-storage.ts` 之前没有专门的测试文件（不在本次被删除的 5 个旧测试之列），
// 但它是 `browser/i18n/lib/translate.ts` 读写语言偏好、以及未来任何 browser/ 代码接触
// localStorage 的唯一入口，其"访问失败就静默降级"的分支值得单独钉住：
// 一旦以后有人把 try/catch 去掉，所有在隐私模式/存储被禁用的浏览器里运行的原生 UI
// 都会直接抛错崩溃，而不是像现在这样优雅降级为"当作没有存储"。
import { afterEach, describe, expect, it } from "vitest";
import { getSafeLocalStorage } from "../packages/ui/src/local-storage.ts";

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

afterEach(() => {
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
  } else {
    Reflect.deleteProperty(globalThis, "localStorage");
  }
});

describe("getSafeLocalStorage", () => {
  it("returns the global localStorage when it is reachable", () => {
    const fakeStorage = { getItem() {}, setItem() {} } as unknown as Storage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: fakeStorage,
    });

    expect(getSafeLocalStorage()).toBe(fakeStorage);
  });

  it("swallows access errors and returns null instead of throwing", () => {
    // 一些隐私模式/企业策略下的浏览器会让访问 `window.localStorage` 本身抛错
    // （而不是简单地返回 undefined），用一个会抛错的 getter 模拟这种环境。
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });

    expect(getSafeLocalStorage()).toBeNull();
  });
});
