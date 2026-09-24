// TASK-10（TASK-6 移交）：changes.log 追加改用异步全局锁，poll 补记只试一次。
//
// 原来 ChangeSource.record() 同步拿全局锁：锁被别的进程（CLI、另一个 Gateway）占着时，最多用
// Atomics.wait 阻塞事件循环约 2 秒——Gateway 进程里所有请求都跟着停。改成：record() 异步等锁
// （不阻塞事件循环，超时照旧记「欠一条」）；poll() 里补记那一条只试一次，锁被占着就留到下一秒。
// 锁冲突由另一个真实进程持锁制造（test/helpers/cli-lock-holder.ts），不 mock。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTaskfoldFileStores } from "@taskfold/core/file-store.js";
import { taskfoldGlobalLockPath } from "@taskfold/core/file-store-locks.js";
import { TaskfoldStore } from "../packages/openclaw/src/backend/src/store.js";
import { holdLockInAnotherProcess, type LockHolder } from "./helpers/cli-harness.js";

const roots: string[] = [];
const holders: LockHolder[] = [];

afterEach(async () => {
  for (const holder of holders.splice(0)) {
    await holder.release();
  }
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function tempDataDir(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-record-async-"));
  roots.push(root);
  return path.join(root, "repo", ".taskfold");
}

async function holdGlobalLock(dataDir: string): Promise<LockHolder> {
  const lockfilePath = taskfoldGlobalLockPath(path.join(dataDir, ".locks"));
  const holder = await holdLockInAnotherProcess(lockfilePath.slice(0, -".lock".length), lockfilePath);
  holders.push(holder);
  return holder;
}

/** 在 `run` 执行期间每 20ms 数一次 tick：事件循环被同步阻塞时一次都数不到。 */
async function countTicksDuring<T>(run: () => Promise<T> | T): Promise<{ ticks: number; result: T }> {
  let ticks = 0;
  const timer = setInterval(() => (ticks += 1), 20);
  try {
    const result = await run();
    return { ticks, result };
  } finally {
    clearInterval(timer);
  }
}

describe("ChangeSource.record：异步等全局锁", () => {
  it("锁被别的进程占着：record 等锁期间事件循环照常转，超时后记欠账、放锁后 poll 补上", async () => {
    const dataDir = tempDataDir();
    const source = createTaskfoldFileStores({ dataDir }).changeSource;
    const holder = await holdGlobalLock(dataDir);

    const { ticks, result } = await countTicksDuring(() => source.record());
    expect(result).toBeUndefined();
    expect(ticks).toBeGreaterThan(20);

    await holder.release();
    holders.splice(holders.indexOf(holder), 1);
    expect(source.poll()).toBeDefined();
  }, 15_000);

  it("store 写入后记日志时锁被占着：写入照常完成，期间不阻塞事件循环", async () => {
    const dataDir = tempDataDir();
    const store = TaskfoldStore.fromStores(createTaskfoldFileStores({ dataDir }));
    const card = await store.create({ title: "锁争用时更新" });
    await holdGlobalLock(dataDir);

    const { ticks, result } = await countTicksDuring(() => store.update(card.id, { title: "更新后" }));
    expect(result.title).toBe("更新后");
    expect(ticks).toBeGreaterThan(20);
  }, 15_000);
});

describe("ChangeSource.poll：补记只试一次", () => {
  it("欠着一条、锁仍被占着：poll 立即返回，不等锁", async () => {
    const dataDir = tempDataDir();
    const source = createTaskfoldFileStores({ dataDir }).changeSource;
    await holdGlobalLock(dataDir);
    await source.record(); // 等锁超时，记下欠账

    const startedAt = Date.now();
    source.poll();
    expect(Date.now() - startedAt).toBeLessThan(500);
  }, 15_000);
});
