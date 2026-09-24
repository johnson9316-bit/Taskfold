import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTaskfoldSqliteStores } from "../src/backend/src/sqlite-store.js";
import { TaskfoldRevisionConflictError } from "@taskfold/core/store-core.js";
import { TaskfoldStore } from "../src/backend/src/store.js";
import { TASKFOLD_PROMPT_VERSION } from "@taskfold/core/worker-prompt.js";

const roots: string[] = [];
const closers: Array<() => void> = [];

afterEach(() => {
  for (const close of closers.splice(0)) {
    close();
  }
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/**
 * 打开（或重新打开）一份指向同一个 SQLite 文件的 TaskfoldStore。
 *
 * A1 定案前，这里原来的注释是"两个 store 模拟两个 Gateway 进程，靠数据库层 CAS
 * 互斥"。A1（需求/16-文件存储改造.md 第八节，2026-09-18 定）已认定 Gateway 只有
 * 一个进程独占存储，靠进程内 `enqueueMutation` 串行化，不存在两条互不相识的
 * mutation queue 同时对外写。本文件里多次调用 `open()` 得到的多个 store 实例，
 * 全部是**顺序**使用（同一份文件先写完、关闭/重开后再读，从未两个实例并发争抢
 * 同一次写），用来验证 revision / change cursor 是这份持久化文件本身的属性——而
 * 不是某个 TaskfoldStore 实例内存里的计数器；即使 Gateway 进程重启后重新指向同
 * 一份文件，也必须读到同一个值。这是在验证"重启后持久化状态还在"，不是在验证跨
 * 进程并发写互斥。
 *
 * 唯一真正需要"同一份 revision 被并发争抢，只能有一个赢"语义的用例
 * （`lets exactly one of two concurrent claims win at the same revision`）已改写
 * 为单个 store 上的两次并发 claim，靠 `enqueueMutation` 的进程内队列而非跨进程
 * 数据库锁来钉住语义，见该用例上方注释。
 */
function openSharedDatabase(): { dbPath: string; open: () => TaskfoldStore } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-revision-"));
  roots.push(root);
  const dbPath = path.join(root, "taskfold.sqlite");
  return {
    dbPath,
    open: () => {
      const stores = createTaskfoldSqliteStores({ dbPath });
      closers.push(stores.close);
      return TaskfoldStore.fromSqliteStores(stores);
    },
  };
}

describe("Taskfold card revision", () => {
  it("advances monotonically on every persisted write and survives reopen", async () => {
    const { open } = openSharedDatabase();
    const store = open();

    const created = await store.create({ title: "Revision card" });
    expect(created.revision).toBe(1);

    const renamed = await store.update(created.id, { title: "Renamed" });
    expect(renamed.revision).toBe(2);

    const reprioritized = await store.update(created.id, { priority: "high" });
    expect(reprioritized.revision).toBe(3);

    const reread = await store.get(created.id);
    expect(reread?.revision).toBe(3);

    // A second store over the same file must observe the persisted revision,
    // not a per-process counter.
    const reopened = open();
    expect((await reopened.get(created.id))?.revision).toBe(3);
  });

  /**
   * 原用例：两个 `TaskfoldStore` 各自指向同一个 SQLite 文件（模拟两个 Gateway
   * 进程各自的 in-process mutation queue），同时对同一张卡片发起 claim，断言只
   * 有一个赢——靠的是 SQLite 层的 `compareAndSwap`，不是进程内队列。
   *
   * A1 定案后不再需要它：Gateway 只有一个进程，也就只有一条 `enqueueMutation`
   * 队列，两条互不相识的队列这个前提本身不存在了。而且原用例的两个 `claimExecution`
   * 调用本来就跑在同一个 JS 进程里，`node:sqlite` 的 `DatabaseSync` 又是同步的，
   * 两笔事务在时间上并不真正交错——它实际钉住的从来不是"操作系统级并发"，而是
   * "同一份持久化 revision，只能有一个 CAS 成功"。
   *
   * 改写后的等价语义：同一个 store 对同一张卡片、带着同一个 expectedRevision，
   * 并发发起两次 claim。`enqueueMutation` 保证其中一次完整跑完（revision 前进
   * 一步）之后，另一次才开始执行；它读到的 revision 已经不再等于 expectedRevision，
   * 必须抛 `TaskfoldRevisionConflictError`。这与下面的
   * `rejects a stale expectedRevision after an unrelated write` 是同一件事的两种
   * 触发方式——那个用一次显式 `update()` 制造 staleness，这个用并发 claim 本身
   * 制造 staleness，差别只在谁把 revision 先推进的动作是什么。
   *
   * 必须保留、且没有降低覆盖的断言：`persisted.revision === expectedRevision + 1`
   * ——只往前推了一次，不是两次。这条防的是"输家在被拒绝之前，其写入已经半途落
   * 盘"的覆盖场景，是原用例独有的价值，这里原样保留。
   */
  it("lets exactly one of two concurrent claims win at the same revision", async () => {
    const { open } = openSharedDatabase();
    const store = open();

    const card = await store.create({ title: "Contended card" });
    const expectedRevision = card.revision;

    const results = await Promise.allSettled([
      store.claimExecution(card.id, { ownerId: "owner-a", expectedRevision }),
      store.claimExecution(card.id, { ownerId: "owner-b", expectedRevision }),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      TaskfoldRevisionConflictError,
    );

    const persisted = await store.get(card.id);
    // 只加了一次，不是两次：冲突方必须在写入之前就被拒绝，不能半途落盘。
    expect(persisted?.revision).toBe(expectedRevision + 1);
    // The surviving claim is the one the winner wrote; the loser left no trace.
    const winner = (fulfilled[0] as PromiseFulfilledResult<{ token: string }>).value;
    expect(persisted?.metadata?.claim?.token).toBe(winner.token);
  });

  it("rejects a stale expectedRevision after an unrelated write", async () => {
    const { open } = openSharedDatabase();
    const store = open();

    const card = await store.create({ title: "Stale guard" });
    const staleRevision = card.revision;
    await store.update(card.id, { notes: "moved on" });

    await expect(
      store.claimExecution(card.id, { ownerId: "owner-a", expectedRevision: staleRevision }),
    ).rejects.toThrow(TaskfoldRevisionConflictError);
  });

  it("keeps the change cursor comparable and advancing across a reopen", async () => {
    const { open } = openSharedDatabase();
    const first = open();
    await first.create({ title: "Cursor card" });
    const before = first.currentChange();
    if (!before) {
      throw new Error("change cursor was not initialized");
    }

    const second = open();
    await second.create({ title: "After reopen" });
    const after = second.currentChange();

    // 同一个数据库文件意味着同一个 epoch，即使 store 重新打开（模拟 Gateway 进
    // 程重启，不是另一个并发进程）；UI 端持有的旧 `before` 游标仍可比较，revision
    // 必须领先于重启前写入的任何内容。
    expect(after?.epoch).toBe(before.epoch);
    expect(after?.revision).toBeGreaterThan(before.revision);
    await expect(second.waitForChange(before, 50)).resolves.toMatchObject({ timedOut: false });
  });

  it("records the prompt version on a run attempt and keeps it across updates", async () => {
    const { open } = openSharedDatabase();
    const store = open();
    const card = await store.create({ title: "Attempt attribution" });

    const started = await store.update(card.id, {
      execution: {
        id: "exec-1",
        kind: "agent-session",
        mode: "autonomous",
        status: "running",
        sessionKey: "session-1",
        runId: "run-1",
        startedAt: Date.now(),
        updatedAt: Date.now(),
      },
    });
    const attempt = started.metadata?.attempts?.at(-1);
    expect(attempt?.promptVersion).toBe(TASKFOLD_PROMPT_VERSION);

    // Survives a reopen, so the attribution is persisted rather than in-memory.
    expect((await open().get(card.id))?.metadata?.attempts?.at(-1)?.promptVersion).toBe(
      TASKFOLD_PROMPT_VERSION,
    );
  });

  // ⚠️ 此用例直接断言 SQLite 表名 `taskfold_cards` 与列名 `claim_owner_id`，是全
  // 仓唯一一处裸 SQL 读，与后端的持久化实现形式强耦合，而不是通过 TaskfoldStore
  // 的公开 API 验证行为。它测的是"claim owner 有没有镜像进索引列"，这从来就是单
  // 进程单 store 场景，不依赖 openSharedDatabase() 的"多开"语义，A1（放弃多进程
  // 假设）不影响它本身是否成立。保留它是因为第 1 期尚未切生产路径（需求/16-文件
  // 存储改造.md 第八节），SQLite 仍是当前真实的持久化实现，这条回归仍有意义；第
  // 3 期切到文件存储后 `claim_owner_id` 这一列本身就不存在了，需要按新后端的对
  // 应能力（例如按 claim owner 索引卡片文件，或专门的 doctor 检查）重新设计这条
  // 用例，而不是继续读 SQLite 列。
  it("mirrors the claim owner into its indexed column and clears it on release", async () => {
    const { dbPath, open } = openSharedDatabase();
    const store = open();

    const card = await store.create({ title: "Owner column" });
    const claimed = await store.claimExecution(card.id, {
      ownerId: "owner-a",
      expectedRevision: card.revision,
    });
    expect(claimed.card.metadata?.claim?.ownerId).toBe("owner-a");

    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(dbPath);
    try {
      const readOwner = () =>
        (
          db.prepare("SELECT claim_owner_id FROM taskfold_cards WHERE id = ?").get(card.id) as
            | { claim_owner_id: string | null }
            | undefined
        )?.claim_owner_id ?? null;
      expect(readOwner()).toBe("owner-a");

      await store.update(card.id, { metadata: { claim: undefined } });
      expect(readOwner()).toBeNull();
    } finally {
      db.close();
    }
  });

  it("reports archived_but_active for an archived card stuck in a nonterminal status", async () => {
    const { open } = openSharedDatabase();
    const store = open();

    const card = await store.create({ title: "Archived while running", status: "running" });
    await store.archive(card.id, true);

    const result = await store.diagnostics(Date.now());
    expect(result).toMatchObject({
      diagnostics: [
        {
          card: { id: card.id },
          diagnostics: [
            {
              kind: "archived_but_active",
              severity: "warning",
              actions: [],
            },
          ],
        },
      ],
      count: 1,
    });
  });

  it("stays silent once an archived card reaches the done status", async () => {
    const { open } = openSharedDatabase();
    const store = open();

    const card = await store.create({ title: "Archived and done", status: "done" });
    await store.archive(card.id, true);

    await expect(store.diagnostics(Date.now())).resolves.toEqual({ diagnostics: [], count: 0 });
  });
});
