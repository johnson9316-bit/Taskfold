// TASK-5 对 core 的两处改动：
// (1) createTaskfoldFileStores 的 pluginDir 改为可选（TASK-4 遗留）：不传时 `.taskfold/` 之外一个
//     文件都不碰，boards/subscriptions 是进程内的空 store，卡片读写照常。传了的行为不变（其余
//     file-store 测试全部照旧传 pluginDir）。
// (2) CAS 失败原因：store 层照旧只返回 false、不 throw（需求/16 R2），原因经 onReject 带出，
//     业务层的 TaskfoldRevisionConflictError.reason 据此区分锁超时与 revision 冲突。锁由另一个
//     真实进程持有。
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { TaskfoldCompareAndSwapFailure } from "@taskfold/core/persistence-types.js";
import { createTaskfoldFileStores } from "@taskfold/core/file-store.js";
import { taskfoldCardLockPath } from "@taskfold/core/file-store-locks.js";
import { TaskfoldRevisionConflictError } from "@taskfold/core/store-core.js";
import { TaskfoldProjectStore } from "@taskfold/core/store-projects.js";
import { cardFilePath, cleanupTempDirs, holdLockInAnotherProcess, makeTempDir } from "./helpers/cli-harness.js";

afterEach(() => {
  cleanupTempDirs();
});

function listTree(root: string): string[] {
  return (fs.readdirSync(root, { recursive: true }) as string[]).map((entry) => path.join(root, entry)).toSorted();
}

function openStore(dataDir: string): TaskfoldProjectStore {
  const stores = createTaskfoldFileStores({ dataDir });
  return new TaskfoldProjectStore(stores.cards, stores);
}

describe("createTaskfoldFileStores 不传 pluginDir", () => {
  it("只在 .taskfold/ 里落盘；新建卡片（会顺手登记 board）、读、改、按 board 汇总都照常", async () => {
    const root = makeTempDir("taskfold-no-plugin-dir-");
    const dataDir = path.join(root, "repo", ".taskfold");
    const store = openStore(dataDir);
    const card = await store.create({ title: "no plugin dir", boardId: "alpha" });
    await store.update(card.id, { status: "done" }, { expectedRevision: card.revision });

    const outside = listTree(root).filter((entry) => entry !== path.join(root, "repo") && !entry.startsWith(dataDir));
    expect(outside).toEqual([]);

    // 换一个进程内实例（等同另一个 CLI 进程）：卡片在磁盘上，boards 注册表不跨实例。
    const reopened = openStore(dataDir);
    expect((await reopened.get(card.id))?.status).toBe("done");
    const { boards } = await reopened.listBoards();
    expect(boards.map((board) => [board.id, board.total])).toEqual([
      ["default", 0],
      ["alpha", 1],
    ]);
    expect(await reopened.listNotificationSubscriptions({})).toEqual({ subscriptions: [] });
  });
});

describe("CAS 失败原因（onReject / TaskfoldRevisionConflictError.reason）", () => {
  it("revision 不对 → revision；key 不存在 → missing；都只返回 false", async () => {
    const dataDir = path.join(makeTempDir("taskfold-cas-reason-"), ".taskfold");
    const stores = createTaskfoldFileStores({ dataDir });
    const store = new TaskfoldProjectStore(stores.cards, stores);
    const card = await store.create({ title: "cas" });
    const persisted = (await stores.cards.lookup(card.id))!;

    const reasons: TaskfoldCompareAndSwapFailure[] = [];
    const record = (reason: TaskfoldCompareAndSwapFailure) => reasons.push(reason);
    expect(await stores.cards.compareAndSwap(card.id, card.revision + 5, persisted, record)).toBe(false);
    expect(await stores.cards.compareAndSwap("no-such-card", 1, { ...persisted, card: { ...persisted.card, id: "no-such-card" } }, record)).toBe(false);
    expect(reasons).toEqual(["revision", "missing"]);

    const error = await store.update(card.id, { title: "x" }, { expectedRevision: card.revision + 5 }).catch((e) => e);
    expect(error).toBeInstanceOf(TaskfoldRevisionConflictError);
    expect(error.reason).toBe("revision");
  });

  it("另一个进程占着卡锁 → lock-timeout；业务层同样抛 TaskfoldRevisionConflictError，但 reason 是 lock-timeout", async () => {
    const repo = makeTempDir("taskfold-cas-lock-");
    const dataDir = path.join(repo, ".taskfold");
    const stores = createTaskfoldFileStores({ dataDir });
    const store = new TaskfoldProjectStore(stores.cards, stores);
    const card = await store.create({ title: "locked" });
    const persisted = (await stores.cards.lookup(card.id))!;

    const holder = await holdLockInAnotherProcess(
      cardFilePath(repo, card.id),
      taskfoldCardLockPath(path.join(dataDir, ".locks"), card.id),
    );
    try {
      const reasons: TaskfoldCompareAndSwapFailure[] = [];
      // 与 revision 冲突一样只是 false——不 throw，也不写。
      expect(await stores.cards.compareAndSwap(card.id, card.revision, persisted, (r) => reasons.push(r))).toBe(false);
      expect(reasons).toEqual(["lock-timeout"]);

      const error = await store.update(card.id, { title: "x" }, { expectedRevision: card.revision }).catch((e) => e);
      expect(error).toBeInstanceOf(TaskfoldRevisionConflictError);
      expect(error.reason).toBe("lock-timeout");
      expect(error.message).toBe(`card ${card.id} changed since revision ${card.revision}.`);
    } finally {
      await holder.release();
    }
    expect((await store.get(card.id))?.title).toBe("locked");
  }, 30_000);
});
