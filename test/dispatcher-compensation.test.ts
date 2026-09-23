import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchAndStartTaskfoldCards } from "../src/backend/src/dispatcher.js";
import type {
  TaskfoldKeyedStore,
  PersistedTaskfoldAttachment,
  PersistedTaskfoldBoard,
  PersistedTaskfoldCard,
  PersistedTaskfoldMilestone,
  PersistedTaskfoldNotificationSubscription,
  PersistedTaskfoldProjectDocument,
} from "../src/backend/src/persistence-types.js";
import { TaskfoldStore } from "../src/backend/src/store.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function keyedStore<T>(): TaskfoldKeyedStore<T> {
  const values = new Map<string, T>();
  return {
    async register(key, value) {
      values.set(key, value);
    },
    async lookup(key) {
      return values.get(key);
    },
    async delete(key) {
      return values.delete(key);
    },
    async entries() {
      return [...values.entries()].map(([key, value]) => ({ key, value }));
    },
  };
}

/**
 * 原来的 `openSharedDatabase()`：两个 `TaskfoldStore` 各自指向同一个 SQLite 文
 * 件，模拟 dispatch 进程与并发编辑同一张卡片的 host/UI 进程——它们各自维护自己
 * 的 in-process mutation queue，跟 test/card-revision.test.ts 的同名 helper 是同
 * 一套手法（该文件的注释也明写"matching test/card-revision.test.ts's
 * openSharedDatabase()"）。
 *
 * A1 定案（需求/16-文件存储改造.md 第八节，2026-09-18 补记：规划最初漏了这个文
 * 件，这里一并处理）认定 Gateway 只有一个进程，两条互不相识的 mutation queue 这
 * 个前提不再存在。但这两个用例钉住的语义（需求/15.8-并发与补偿设计.md §2.4/
 * §4.4：worktree 建好后 `subagent.run()` 失败回滚时，并发的 host 编辑不得被整
 * 卡覆盖，commit `f4ba2df` 修的正是这个）必须原样保住——只是模拟"dispatch 与
 * host 两个角色并发编辑同一张卡片"的手法要从"两个 SQLite 连接"改成"两个
 * `TaskfoldStore` 共享同一份底层卡片存储"，即 test/card-execution-compensation
 * .test.ts 的 `openSharedCardStore()`：天然适配单进程假设，因为它不依赖任何跨
 * 进程数据库锁，纯粹靠共享的内存 Map 承载卡片数据。
 *
 * 这两个用例里，host 的写入是在被 mock 的 `run()` 内部显式 `await` 完成之后才
 * `throw` 的，因此 host 的写入与 dispatch 侧收到失败后的补偿回滚在时间上是严格
 * 顺序的，不是一场真正的竞态——这正是单 Gateway 进程下会发生的情况：两个角色各
 * 自的 store 包装实例可以并发存在，但每一步实际写入仍然是顺序发生的。
 */
function openSharedCardStore(): { dispatchStore: TaskfoldStore; hostStore: TaskfoldStore } {
  const sharedCards = keyedStore<PersistedTaskfoldCard>();
  const build = () =>
    new TaskfoldStore(sharedCards, {
      boards: keyedStore<PersistedTaskfoldBoard>(),
      milestones: keyedStore<PersistedTaskfoldMilestone>(),
      documents: keyedStore<PersistedTaskfoldProjectDocument>(),
      subscriptions: keyedStore<PersistedTaskfoldNotificationSubscription>(),
      attachments: keyedStore<PersistedTaskfoldAttachment>(),
    });
  return { dispatchStore: build(), hostStore: build() };
}

function createGitCheckout(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-dispatch-compensation-repo-"));
  roots.push(root);
  fs.writeFileSync(path.join(root, "README.md"), "# Test checkout\n");
  execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "taskfold@example.test"], {
    cwd: root,
    stdio: "ignore",
  });
  execFileSync("git", ["config", "user.name", "Taskfold Test"], {
    cwd: root,
    stdio: "ignore",
  });
  execFileSync("git", ["add", "README.md"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "Initial commit"], { cwd: root, stdio: "ignore" });
  return root;
}

function dispatchOptions(checkout: string) {
  const createWorktree = vi.fn(async ({ name }: { name: string }) => {
    const worktreePath = path.join(checkout, ".taskfold-worktrees", name);
    fs.mkdirSync(worktreePath, { recursive: true });
    return { path: worktreePath, branch: `taskfold/${name}` };
  });
  const removeIfLossless = vi.fn(async () => true);
  return { worktrees: { create: createWorktree, removeIfLossless } as never };
}

describe("dispatcher workspace-rollback compensation (需求/15.8-并发与补偿设计.md §2.4/§4.4)", () => {
  // 并发模拟手法见上方 openSharedCardStore() 注释（A1 定案后从双 SQLite 连接改
  // 为共享内存 store）；断言与原用例完全一致，未降低覆盖。
  it("⭐ preserves a concurrent host edit to notes when a failed start rolls back the materialized workspace", async () => {
    const { dispatchStore, hostStore } = openSharedCardStore();
    const checkout = createGitCheckout();
    const card = await dispatchStore.create({
      title: "Concurrent notes edit",
      status: "ready",
      workspace: { kind: "worktree", sourcePath: checkout },
      workspaceAccess: { unrestricted: true },
    });
    const run = vi.fn(async () => {
      // host 的写入在这里被显式 await 完，才 throw -- 完全提交在 run 拒绝之前，
      // 所以这不是一个依赖时序的竞态，而是确定性的先后顺序（单 Gateway 进程下,
      // host/UI 编辑与 dispatch 侧的回滚补偿本来就是靠这种顺序性共存，不是靠
      // 跨进程锁）。
      await hostStore.update(card.id, { notes: "written by the host mid-dispatch" });
      throw new Error("host refused admission");
    });

    const result = await dispatchAndStartTaskfoldCards({
      store: dispatchStore,
      subagent: { run },
      ...dispatchOptions(checkout),
      options: { maxStarts: 1, materializeWorktree: true },
    });

    expect(result.started).toHaveLength(0);
    expect(result.startFailures).toHaveLength(1);

    const finalCard = await hostStore.get(card.id);
    expect(finalCard?.notes).toBe("written by the host mid-dispatch");
  });

  // 并发模拟手法见上方 openSharedCardStore() 注释（A1 定案后从双 SQLite 连接改
  // 为共享内存 store）；断言与原用例完全一致，未降低覆盖。
  it("⭐ preserves a concurrent host edit to workspace itself when a failed start rolls back the materialized workspace", async () => {
    const { dispatchStore, hostStore } = openSharedCardStore();
    const checkout = createGitCheckout();
    const card = await dispatchStore.create({
      title: "Concurrent workspace edit",
      status: "ready",
      workspace: { kind: "worktree", sourcePath: checkout },
      workspaceAccess: { unrestricted: true },
    });
    // normalizeWorkspace() carries forward fields the patch omits (e.g. a
    // stale `branch`) from whatever workspace was persisted at write time, so
    // the assertion below compares against what the host's own write actually
    // persisted rather than the literal patch.
    let hostWrittenWorkspace: unknown;
    const run = vi.fn(async () => {
      const updated = await hostStore.update(card.id, {
        workspace: { kind: "dir", path: checkout },
      });
      hostWrittenWorkspace = updated.metadata?.automation?.workspace;
      throw new Error("host refused admission");
    });

    const result = await dispatchAndStartTaskfoldCards({
      store: dispatchStore,
      subagent: { run },
      ...dispatchOptions(checkout),
      options: { maxStarts: 1, materializeWorktree: true },
    });

    expect(result.started).toHaveLength(0);
    expect(result.startFailures).toHaveLength(1);
    expect(hostWrittenWorkspace).toBeDefined();

    const finalCard = await hostStore.get(card.id);
    expect(finalCard?.metadata?.automation?.workspace).toEqual(hostWrittenWorkspace);
  });
});
