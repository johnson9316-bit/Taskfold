// 测试共用的内存 KeyedStore 夹具。cards store 的 compareAndSwap 已改为必选（需求/16 R1、
// 需求/18 §3.3），这里给出一个**真正实现 CAS** 的版本：只有存储里的 `card.revision`
// 仍等于 `expectedRevision` 时才写入并返回 true，否则不写、返回 false；key 不存在返回 false。
// 单进程内存实现，读-比-写之间没有 await，天然原子。存取都 structuredClone，模拟真实后端
// 「序列化落盘」的语义，避免调用方原地改对象时连带改掉已存的 revision。
import type { TaskfoldKeyedStore } from "@taskfold/core/persistence-types.js";

function storedRevision(value: unknown): number | undefined {
  const revision = (value as { card?: { revision?: unknown } } | undefined)?.card?.revision;
  return typeof revision === "number" ? revision : undefined;
}

export function keyedStore<T>(): TaskfoldKeyedStore<T> {
  const values = new Map<string, T>();
  const store = {
    async register(key: string, value: T) {
      values.set(key, structuredClone(value));
    },
    async lookup(key: string) {
      const value = values.get(key);
      return value === undefined ? undefined : structuredClone(value);
    },
    async delete(key: string) {
      return values.delete(key);
    },
    async entries() {
      return [...values.entries()].map(([key, value]) => ({ key, value: structuredClone(value) }));
    },
    async compareAndSwap(key: string, expectedRevision: number, value: T) {
      if (!values.has(key) || storedRevision(values.get(key)) !== expectedRevision) {
        return false;
      }
      values.set(key, structuredClone(value));
      return true;
    },
  };
  return store as TaskfoldKeyedStore<T>;
}
