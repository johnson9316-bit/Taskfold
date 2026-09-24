import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  PersistedTaskfoldAttachment,
  PersistedTaskfoldBoard,
  PersistedTaskfoldCard,
  PersistedTaskfoldMilestone,
  PersistedTaskfoldNotificationSubscription,
  PersistedTaskfoldProjectDocument,
} from "@taskfold/core/persistence-types.js";
import { createTaskfoldSqliteStores } from "../src/backend/src/sqlite-store.js";
import { createTaskfoldFileStores } from "@taskfold/core/file-store.js";
import { normalizeAutomation } from "@taskfold/core/store-normalizers.js";
import { TaskfoldStore } from "../src/backend/src/store.js";
import { keyedStore } from "./helpers/memory-keyed-store.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function createStore(): TaskfoldStore {
  return new TaskfoldStore(keyedStore<PersistedTaskfoldCard>(), {
    boards: keyedStore<PersistedTaskfoldBoard>(),
    milestones: keyedStore<PersistedTaskfoldMilestone>(),
    documents: keyedStore<PersistedTaskfoldProjectDocument>(),
    subscriptions: keyedStore<PersistedTaskfoldNotificationSubscription>(),
    attachments: keyedStore<PersistedTaskfoldAttachment>(),
  });
}

/** Claims a fresh, unclaimed card so a test can open an execution launch on it. */
async function claimFreshCard(store: TaskfoldStore, title: string) {
  const card = await store.create({ title, status: "ready" });
  return await store.claimExecution(card.id, {
    ownerId: "owner-a",
    expectedRevision: card.revision,
  });
}

describe("Taskfold launch state", () => {
  describe("contract, normalization, and the trust gate (步骤 1)", () => {
    it("discards metadata.automation.launch submitted through the public update() entry point", async () => {
      const store = createStore();
      const card = await store.create({ title: "Trust gate", status: "todo" });

      const updated = await store.update(card.id, {
        metadata: {
          automation: {
            summary: "kept",
            launch: {
              phase: "prepared",
              requestedSessionKey: "subagent:taskfold-default-untrusted",
              provisionalRunId: "taskfold:untrusted:token",
              preparedAt: Date.now(),
              preparedBy: "someone-elses-process",
            },
          },
        },
      });

      // The rest of the automation patch still lands...
      expect(updated.metadata?.automation?.summary).toBe("kept");
      // ...but the public entry point can never mint or clobber a launch phase.
      expect(updated.metadata?.automation?.launch).toBeUndefined();
    });

    it("keeps metadata.automation.launch written through an internal path with allowAutomationLaunch", async () => {
      const store = createStore();
      const claimed = await claimFreshCard(store, "Internal write path");

      const { card, launch } = await store.openExecutionLaunch(claimed.card.id, {
        requestedSessionKey: "subagent:taskfold-default-internal",
      });

      expect(launch.phase).toBe("prepared");
      expect(card.metadata?.automation?.launch).toMatchObject({
        phase: "prepared",
        requestedSessionKey: "subagent:taskfold-default-internal",
        provisionalRunId: launch.provisionalRunId,
        preparedAt: launch.preparedAt,
        preparedBy: launch.preparedBy,
      });
      expect(card.sessionKey).toBe("subagent:taskfold-default-internal");
      expect(card.runId).toBe(launch.provisionalRunId);
    });

    const identity = {
      requestedSessionKey: "subagent:taskfold-default-malformed",
      provisionalRunId: "taskfold:malformed:claim-token",
      preparedAt: 1_700_000_000_000,
      preparedBy: "instance-1",
    };

    it("normalizes a malformed prepared launch payload to undefined", () => {
      const automation = normalizeAutomation(
        { launch: { ...identity, phase: "prepared", provisionalRunId: "" } },
        undefined,
        { allowLaunchState: true },
      );
      expect(automation?.launch).toBeUndefined();
    });

    it("normalizes a malformed accepted launch payload to undefined", () => {
      const automation = normalizeAutomation(
        {
          launch: {
            ...identity,
            phase: "accepted",
            acceptedSessionKey: "agent:main:subagent:taskfold-default-malformed",
            // acceptedAt is missing, which upstream and this port both require.
          },
        },
        undefined,
        { allowLaunchState: true },
      );
      expect(automation?.launch).toBeUndefined();
    });

    it("normalizes a malformed failed launch payload to undefined", () => {
      const automation = normalizeAutomation(
        {
          launch: {
            ...identity,
            phase: "failed",
            failedAt: 1_700_000_001_000,
            // reason is missing.
          },
        },
        undefined,
        { allowLaunchState: true },
      );
      expect(automation?.launch).toBeUndefined();
    });

    it("round-trips metadata.automation.launch through automation_json in SQLite", async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-launch-state-"));
      roots.push(root);
      const dbPath = path.join(root, "taskfold.sqlite");

      const stores = createTaskfoldSqliteStores({ dbPath });
      const store = TaskfoldStore.fromSqliteStores(stores);
      const card = await store.create({ title: "Sqlite round trip", status: "ready" });
      const claimed = await store.claimExecution(card.id, {
        ownerId: "owner-a",
        expectedRevision: card.revision,
      });
      const { launch } = await store.openExecutionLaunch(claimed.card.id, {
        requestedSessionKey: "subagent:taskfold-default-roundtrip",
      });
      stores.close();

      const reopened = createTaskfoldSqliteStores({ dbPath });
      const reopenedStore = TaskfoldStore.fromSqliteStores(reopened);
      const reloaded = await reopenedStore.get(card.id);
      reopened.close();

      expect(reloaded?.metadata?.automation?.launch).toMatchObject({
        phase: "prepared",
        requestedSessionKey: "subagent:taskfold-default-roundtrip",
        provisionalRunId: launch.provisionalRunId,
        preparedAt: launch.preparedAt,
        preparedBy: launch.preparedBy,
      });
    });

    /**
     * 需求/16 第八节第 1 期退出条件：字段映射层的验收点。
     *
     * 上面那例证明 `metadata.automation.launch` 能经 SQLite 的 `automation_json` 列往返。
     * 这一例是它在文件后端上的等价物：同一条业务流程（create → claim → openExecutionLaunch
     * → 关闭 → 重开），断言这套嵌套结构经 **Markdown + frontmatter 序列化**后同样不丢。
     *
     * 为什么这条值得单独测，而不是靠格式层自己的 round-trip 用例：`automation` 在 SQLite
     * 里是主表的一个 JSON 列，在文件方案里落进 `<!-- SECTION:TASKFOLD -->` 区块；它是
     * **嵌套最深、且带 `preparedAt` 时间戳与 `provisionalRunId` 这类精确值**的字段之一，
     * 正好压住 R6（区分「字段缺失」与「值为 null」、数字不能变字符串）最容易出问题的地方。
     * 走完整业务路径而不是直接喂造好的对象，才能覆盖 normalizer 与 codec 的接缝。
     */
    it("round-trips metadata.automation.launch through the Markdown file store", async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-launch-state-file-"));
      roots.push(root);
      const dataDir = path.join(root, "repo", ".taskfold");
      const pluginDir = path.join(root, "plugin-state", "plugins", "taskfold");

      const store = TaskfoldStore.fromStores(createTaskfoldFileStores({ dataDir, pluginDir }));
      const card = await store.create({ title: "File store round trip", status: "ready" });
      const claimed = await store.claimExecution(card.id, {
        ownerId: "owner-a",
        expectedRevision: card.revision,
      });
      const { launch } = await store.openExecutionLaunch(claimed.card.id, {
        requestedSessionKey: "subagent:taskfold-default-roundtrip",
      });

      // 重开一个完全独立的 store 实例，确保读到的是磁盘内容而不是任何进程内残留。
      const reopenedStore = TaskfoldStore.fromStores(createTaskfoldFileStores({ dataDir, pluginDir }));
      const reloaded = await reopenedStore.get(card.id);

      expect(reloaded?.metadata?.automation?.launch).toMatchObject({
        phase: "prepared",
        requestedSessionKey: "subagent:taskfold-default-roundtrip",
        provisionalRunId: launch.provisionalRunId,
        preparedAt: launch.preparedAt,
        preparedBy: launch.preparedBy,
      });
      // preparedAt 是 epoch 毫秒：确认它没有在 YAML/JSON 往返中退化成字符串。
      expect(typeof reloaded?.metadata?.automation?.launch?.preparedAt).toBe("number");
    });
  });

  describe("store methods and guards (步骤 2)", () => {
    it("rejects accept/fail against a launch identity superseded by a concurrent redispatch", async () => {
      const store = createStore();
      const claimedA = await claimFreshCard(store, "Redispatch race");
      const { launch: staleLaunch } = await store.openExecutionLaunch(claimedA.card.id, {
        requestedSessionKey: "subagent:taskfold-default-race",
      });

      // Simulate the redispatch: an operator reclaims the card (which clears
      // the stale prepared launch's execution/claim, matching what a real
      // launch-fail would leave behind) and a second dispatch attempt opens a
      // brand-new launch under a different identity.
      const reclaimed = await store.reclaim(claimedA.card.id);
      const claimedB = await store.claimExecution(reclaimed.id, {
        ownerId: "owner-b",
        expectedRevision: reclaimed.revision,
      });
      await store.openExecutionLaunch(claimedB.card.id, {
        requestedSessionKey: "subagent:taskfold-default-race-2",
      });

      const acceptResult = await store.acceptExecutionLaunch(claimedA.card.id, {
        expectedLaunch: staleLaunch,
        acceptedAt: Date.now(),
        sessionKey: "subagent:taskfold-default-race",
      });
      expect(acceptResult).toBeUndefined();

      const failResult = await store.failExecutionLaunch(claimedA.card.id, {
        expectedLaunch: staleLaunch,
        reason: "late failure for a launch a redispatch already superseded",
      });
      expect(failResult).toBe(false);
    });

    it("rejects accept when acceptedAt precedes the launch's preparedAt", async () => {
      const store = createStore();
      const claimed = await claimFreshCard(store, "Stale accept timing");
      const { launch } = await store.openExecutionLaunch(claimed.card.id, {
        requestedSessionKey: "subagent:taskfold-default-timing",
      });

      const result = await store.acceptExecutionLaunch(claimed.card.id, {
        expectedLaunch: launch,
        acceptedAt: launch.preparedAt - 1,
        sessionKey: "subagent:taskfold-default-timing",
      });

      expect(result).toBeUndefined();
    });

    it("rekeys the running attempt in place on accept instead of creating a second one", async () => {
      const store = createStore();
      const claimed = await claimFreshCard(store, "Single attempt on accept");
      const { card: opened, launch } = await store.openExecutionLaunch(claimed.card.id, {
        requestedSessionKey: "subagent:taskfold-default-accept",
      });
      expect(opened.metadata?.attempts).toHaveLength(1);
      expect(opened.metadata?.attempts?.[0]).toMatchObject({
        status: "running",
        runId: launch.provisionalRunId,
        sessionKey: "subagent:taskfold-default-accept",
      });

      const accepted = await store.acceptExecutionLaunch(opened.id, {
        expectedLaunch: launch,
        acceptedAt: launch.preparedAt + 10,
        sessionKey: "agent:main:subagent:taskfold-default-accept",
        runId: "run-real-123",
      });

      expect(accepted?.sessionKey).toBe("agent:main:subagent:taskfold-default-accept");
      expect(accepted?.runId).toBe("run-real-123");
      expect(accepted?.metadata?.attempts).toHaveLength(1);
      expect(accepted?.metadata?.attempts?.[0]).toMatchObject({
        status: "running",
        runId: "run-real-123",
        sessionKey: "agent:main:subagent:taskfold-default-accept",
      });
      expect(accepted?.metadata?.automation?.launch).toMatchObject({
        phase: "accepted",
        acceptedAt: launch.preparedAt + 10,
        acceptedSessionKey: "agent:main:subagent:taskfold-default-accept",
        acceptedRunId: "run-real-123",
      });
    });

    it("clears the execution association and blocks the attempt on fail", async () => {
      const store = createStore();
      const claimed = await claimFreshCard(store, "Fail clears association");
      const { launch } = await store.openExecutionLaunch(claimed.card.id, {
        requestedSessionKey: "subagent:taskfold-default-fail",
      });

      const result = await store.failExecutionLaunch(claimed.card.id, {
        expectedLaunch: launch,
        reason: "Gateway did not accept this launch in time.",
      });
      expect(result).toBe(true);

      const failedCard = await store.get(claimed.card.id);
      // claimFreshCard uses claimExecution()（card-execution.ts 的路径），它不改
      // status，卡片一直是创建时的 `ready`。failExecutionLaunch 只在卡片当前是
      // `running` 时才把失败推成 `blocked`（需求/8.4「Run 与 Card 状态分离」
      // 映射表：该行前提是 dispatcher 的 claim() 已把状态推成 running 的调度路径），
      // 所以这里保持 `ready` 不变。
      expect(failedCard?.status).toBe("ready");
      expect(failedCard?.sessionKey).toBeUndefined();
      expect(failedCard?.runId).toBeUndefined();
      expect(failedCard?.execution).toBeUndefined();
      expect(failedCard?.metadata?.claim).toBeUndefined();
      expect(failedCard?.metadata?.attempts).toHaveLength(1);
      expect(failedCard?.metadata?.attempts?.[0]).toMatchObject({ status: "blocked" });
      expect(failedCard?.metadata?.automation?.launch).toMatchObject({
        phase: "failed",
        reason: "Gateway did not accept this launch in time.",
      });
    });
  });
});
