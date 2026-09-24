// TASK-6 AC#3：OpenClaw 适配层（进程内文件后端）与 CLI（真实子进程）同时写同一张卡，
// 结果一致、无静默覆盖。
//
// 「并发」怎么制造：给适配层的 cards 存储包一道只触发一次的闸门——core 已经读完卡片、
// 正要落盘时，先让 CLI 子进程完整跑一次 `update --append-notes`，再放行适配层这次写。
// 这就是旧实现的静默覆盖窗口：updateCard 在锁外读、落盘时无条件整卡重写，CLI 刚追加的
// 正文会被旧快照冲掉。闸门只拦「写」这一步，锁和 CAS 都是真的（core 的文件后端）。
// 另有一个不加闸门、两边真正同时循环写的用例（旧实现上是概率性地红）。
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TaskfoldCard } from "@taskfold/core/contract/index.js";
import { createTaskfoldFileStores } from "@taskfold/core/file-store.js";
import type { TaskfoldKeyedStore } from "@taskfold/core/persistence-types.js";
import { TaskfoldRevisionConflictError } from "@taskfold/core/store-core.js";
import { TaskfoldStore } from "../packages/openclaw/src/backend/src/store.js";
import { TASKFOLD_CLI_EXIT_CODES } from "@taskfold/cli/errors.js";
import { buildCliBundle, cleanupTempDirs, makeTempGitRepo, runCliProcess, runJson } from "./helpers/cli-harness.js";

const CLI_NOTE = "cli-appended paragraph";
const OWNER = "worker-a";

let bundle: string;

beforeAll(() => {
  bundle = buildCliBundle();
}, 60_000);

afterAll(() => {
  cleanupTempDirs();
});

type WriteGate = {
  /** 下一次（跳过前 `skipWrites` 次）写这张卡之前，先跑完 `beforeWrite`。只触发一次。 */
  arm(cardId: string, beforeWrite: () => Promise<void>, skipWrites?: number): void;
  fired(): boolean;
};

function gateCardWrites(inner: TaskfoldKeyedStore): { store: TaskfoldKeyedStore; gate: WriteGate } {
  let armed: { cardId: string; skip: number; beforeWrite: () => Promise<void> } | undefined;
  let fired = false;
  const pass = async (key: string) => {
    if (!armed || armed.cardId !== key) {
      return;
    }
    if (armed.skip > 0) {
      armed.skip -= 1;
      return;
    }
    const { beforeWrite } = armed;
    armed = undefined;
    fired = true;
    await beforeWrite();
  };
  return {
    store: {
      register: async (key, value) => {
        await pass(key);
        await inner.register(key, value);
      },
      compareAndSwap: async (key, expectedRevision, value, onReject) => {
        await pass(key);
        return await inner.compareAndSwap(key, expectedRevision, value, onReject);
      },
      lookup: async (key) => await inner.lookup(key),
      delete: async (key) => await inner.delete(key),
      entries: async () => await inner.entries(),
      ...(inner.registerIfAbsent
        ? { registerIfAbsent: async (key: string, value: Parameters<TaskfoldKeyedStore["register"]>[1]) => await inner.registerIfAbsent!(key, value) }
        : {}),
    },
    gate: {
      arm(cardId, beforeWrite, skipWrites = 0) {
        armed = { cardId, skip: skipWrites, beforeWrite };
        fired = false;
      },
      fired: () => fired,
    },
  };
}

/** 临时仓库 + CLI 建的一张卡 + 适配层按同一个 `.taskfold/` 打开的文件后端 store。 */
async function openSharedCard(status: string) {
  const repo = makeTempGitRepo();
  await runJson(bundle, ["init"], { cwd: repo });
  const { card } = await runJson(
    bundle,
    ["create", "Shared card", "--notes", "original body", "--status", status],
    { cwd: repo },
  );
  const stores = createTaskfoldFileStores({ dataDir: path.join(repo, ".taskfold") });
  const gated = gateCardWrites(stores.cards);
  const store = TaskfoldStore.fromStores({ ...stores, cards: gated.store });
  return {
    repo,
    cardId: card.id as string,
    store,
    gate: gated.gate,
    cliAppend: async (note = CLI_NOTE) => {
      await runJson(bundle, ["update", card.id, "--append-notes", note], { cwd: repo });
    },
    cliShow: async () => (await runJson(bundle, ["show", card.id], { cwd: repo })).card as Record<string, any>,
  };
}

type Shared = Awaited<ReturnType<typeof openSharedCard>>;

/** 两边读到的是同一张卡（revision、正文、状态、标题都一样），且 CLI 的追加还在。 */
async function expectConsistentWithCliNote(shared: Shared): Promise<TaskfoldCard> {
  const mine = await shared.store.get(shared.cardId);
  const theirs = await shared.cliShow();
  expect(mine).toBeDefined();
  expect(mine!.notes ?? "").toContain(CLI_NOTE);
  expect(theirs.revision).toBe(mine!.revision);
  expect(theirs.notes).toBe(mine!.notes ?? "");
  expect(theirs.status).toBe(mine!.status);
  expect(theirs.title).toBe(mine!.title);
  return mine!;
}

describe("OpenClaw 适配层与 CLI 并发写同一张卡（TASK-6 AC#3）", () => {
  it("heartbeat：CLI 在读与写之间追加正文，两边的改动都保留", async () => {
    const shared = await openSharedCard("todo");
    const { token } = await shared.store.claim(shared.cardId, { ownerId: OWNER });
    shared.gate.arm(shared.cardId, () => shared.cliAppend());
    await shared.store.heartbeat(shared.cardId, { token, note: "heartbeat note" });
    expect(shared.gate.fired()).toBe(true);
    const card = await expectConsistentWithCliNote(shared);
    expect(card.metadata?.comments?.map((comment) => comment.body)).toContain("heartbeat note");
    expect(card.metadata?.claim?.token).toBe(token);
  }, 30_000);

  it("claim：后续「置为 running」那次写撞上 CLI，claim 仍然完成且不误报已被占用", async () => {
    const shared = await openSharedCard("todo");
    // 第 1 次写是 claim 本身（原本就是 CAS），第 2 次是把状态置为 running。
    shared.gate.arm(shared.cardId, () => shared.cliAppend(), 1);
    const { token } = await shared.store.claim(shared.cardId, { ownerId: OWNER });
    expect(shared.gate.fired()).toBe(true);
    const card = await expectConsistentWithCliNote(shared);
    expect(card.status).toBe("running");
    expect(card.metadata?.claim?.token).toBe(token);
  }, 30_000);

  it("launch：openExecutionLaunch 撞上 CLI，两边的改动都保留", async () => {
    const shared = await openSharedCard("todo");
    const { token } = await shared.store.claim(shared.cardId, { ownerId: OWNER });
    shared.gate.arm(shared.cardId, () => shared.cliAppend());
    await shared.store.openExecutionLaunch(shared.cardId, {
      requestedSessionKey: "agent:worker-a:taskfold-test",
      scope: { ownerId: OWNER, token },
    });
    expect(shared.gate.fired()).toBe(true);
    const card = await expectConsistentWithCliNote(shared);
    expect(card.metadata?.automation?.launch?.phase).toBe("prepared");
  }, 30_000);

  it("finish：finishExecutionForRun 撞上 CLI，两边的改动都保留", async () => {
    const shared = await openSharedCard("todo");
    const { token } = await shared.store.claim(shared.cardId, { ownerId: OWNER });
    const { launch } = await shared.store.openExecutionLaunch(shared.cardId, {
      requestedSessionKey: "agent:worker-a:taskfold-test",
      scope: { ownerId: OWNER, token },
    });
    shared.gate.arm(shared.cardId, () => shared.cliAppend());
    await shared.store.finishExecutionForRun(launch.provisionalRunId, { outcome: "ok" });
    expect(shared.gate.fired()).toBe(true);
    const card = await expectConsistentWithCliNote(shared);
    expect(card.execution?.status).toBe("done");
    expect(card.metadata?.claim).toBeUndefined();
  }, 30_000);

  it("reclaim：可能多次写入、不自动重试——撞上 CLI 时报冲突，不覆盖 CLI 的改动", async () => {
    const shared = await openSharedCard("todo");
    const { token } = await shared.store.claim(shared.cardId, { ownerId: OWNER });
    shared.gate.arm(shared.cardId, () => shared.cliAppend());
    await expect(shared.store.reclaim(shared.cardId, { reason: "operator reclaim" })).rejects.toBeInstanceOf(
      TaskfoldRevisionConflictError,
    );
    expect(shared.gate.fired()).toBe(true);
    const card = await expectConsistentWithCliNote(shared);
    expect(card.metadata?.claim?.token).toBe(token);
  }, 30_000);

  it("update（面板不带 expectedRevision 的字段修改）：撞上 CLI 时重读重试，两边的改动都保留", async () => {
    const shared = await openSharedCard("todo");
    shared.gate.arm(shared.cardId, () => shared.cliAppend());
    await shared.store.update(shared.cardId, { title: "Renamed by operator" });
    expect(shared.gate.fired()).toBe(true);
    const card = await expectConsistentWithCliNote(shared);
    expect(card.title).toBe("Renamed by operator");
  }, 30_000);

  it("dispatch：记录派发那次写撞上 CLI，这张卡本轮跳过，不覆盖 CLI 的改动", async () => {
    const shared = await openSharedCard("ready");
    shared.gate.arm(shared.cardId, () => shared.cliAppend());
    await shared.store.dispatch();
    expect(shared.gate.fired()).toBe(true);
    await expectConsistentWithCliNote(shared);
  }, 30_000);

  it("不加闸门：适配层持续心跳的同时 CLI 连续追加，CLI 报成功的每一段都在、两边一致", async () => {
    const shared = await openSharedCard("todo");
    const { token } = await shared.store.claim(shared.cardId, { ownerId: OWNER });
    const acknowledged: string[] = [];
    let cliDone = false;
    let heartbeats = 0;
    const heartbeatLoop = (async () => {
      while (!cliDone) {
        await shared.store.heartbeat(shared.cardId, { token });
        heartbeats += 1;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    })();
    try {
      for (let index = 0; index < 8; index += 1) {
        const note = `${CLI_NOTE} #${index}`;
        const result = await runCliProcess(bundle, ["update", shared.cardId, "--append-notes", note, "--json"], {
          cwd: shared.repo,
        });
        // 心跳写得很密时，CLI 字段级重试用尽会如实报 CONFLICT / LOCKED（非零退出、正文没写）。
        // 这是「报出来的冲突」，不是静默覆盖；要求的是：CLI 报成功的每一段都必须留在卡上。
        if (result.code === 0) {
          acknowledged.push(note);
        } else {
          expect([TASKFOLD_CLI_EXIT_CODES.CONFLICT, TASKFOLD_CLI_EXIT_CODES.LOCKED]).toContain(result.code);
        }
      }
    } finally {
      cliDone = true;
      await heartbeatLoop;
    }
    expect(heartbeats).toBeGreaterThan(0);
    expect(acknowledged.length).toBeGreaterThan(0);
    const card = await shared.store.get(shared.cardId);
    const theirs = await shared.cliShow();
    for (const note of acknowledged) {
      expect(card!.notes).toContain(note);
    }
    expect(theirs.revision).toBe(card!.revision);
    expect(theirs.notes).toBe(card!.notes ?? "");
    expect(card!.metadata?.claim?.token).toBe(token);
  }, 60_000);
});
