// TASK-4 定案「适配层聚合游标」：文件后端下每个项目一份 changes.log、各有各的游标，而前端调用
// `taskfold.changes.wait` 时不带项目。OpenClaw 适配层把所有已注册项目聚合成一个游标：适配层
// 自己的 epoch（每个 Gateway 进程一个）+ 单调计数，任一项目的游标前进一次就 +1；返回形状不变。
// SQLite 生产路径不经过聚合器，`taskfold.changes.wait` 仍用 store 自己的游标。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenClawPluginApi } from "../src/backend/api.js";
import type {
  PersistedTaskfoldAttachment,
  PersistedTaskfoldBoard,
  PersistedTaskfoldCard,
  PersistedTaskfoldMilestone,
  PersistedTaskfoldNotificationSubscription,
  PersistedTaskfoldProjectDocument,
} from "@taskfold/core/persistence-types.js";
import { createTaskfoldFileStores } from "@taskfold/core/file-store.js";
import { TaskfoldAggregatedChangeCursor } from "../src/backend/src/change-aggregator.js";
import { createTaskfoldChangeEventService } from "../src/backend/src/change-events.js";
import { registerTaskfoldGatewayMethods } from "../src/backend/src/gateway.js";
import { TaskfoldStore } from "../src/backend/src/store.js";
import { keyedStore } from "./helpers/memory-keyed-store.js";

const roots: string[] = [];

afterEach(() => {
  vi.useRealTimers();
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function twoProjects() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-change-aggregator-"));
  roots.push(root);
  const pluginDir = path.join(root, "plugin-state", "plugins", "taskfold");
  const dataDirA = path.join(root, "project-a", ".taskfold");
  const dataDirB = path.join(root, "project-b", ".taskfold");
  const open = (dataDir: string) => TaskfoldStore.fromStores(createTaskfoldFileStores({ dataDir, pluginDir }));
  return { pluginDir, dataDirA, dataDirB, open, storeA: open(dataDirA), storeB: open(dataDirB) };
}

type Handler = (request: {
  params: Record<string, unknown>;
  respond: (ok: boolean, payload?: unknown) => void;
}) => Promise<void>;

function registerChangeWait(params: Omit<Parameters<typeof registerTaskfoldGatewayMethods>[0], "api">): Handler {
  const handlers = new Map<string, Handler>();
  const api = {
    runtime: {},
    registerGatewayMethod(name: string, handler: Handler) {
      handlers.set(name, handler);
    },
  } as unknown as OpenClawPluginApi;
  registerTaskfoldGatewayMethods({ api, ...params });
  return handlers.get("taskfold.changes.wait")!;
}

async function callChangeWait(handler: Handler, params: Record<string, unknown>) {
  let response: { ok: boolean; payload?: unknown } | undefined;
  await handler({ params, respond: (ok, payload) => (response = { ok, payload }) });
  return response;
}

describe("TaskfoldAggregatedChangeCursor：跨项目聚合游标", () => {
  it("本进程写入与别的进程写入都让聚合游标 +1，epoch 是适配层自己的", async () => {
    const { dataDirA, dataDirB, pluginDir, open, storeA, storeB } = twoProjects();
    const aggregator = new TaskfoldAggregatedChangeCursor();
    aggregator.addProject(storeA);
    aggregator.addProject(storeB);
    aggregator.announceChangeEpoch();
    const start = aggregator.currentChange()!;
    const projectEpochs = [dataDirA, dataDirB].map(
      (dataDir) => createTaskfoldFileStores({ dataDir, pluginDir }).changeEpoch,
    );
    expect(projectEpochs).not.toContain(start.epoch);

    // 本进程在 B 项目写入：经订阅立即 +1，不用等轮询。
    const waiting = aggregator.waitForChange(start, 1000);
    await storeB.create({ title: "B 项目的卡" });
    await expect(waiting).resolves.toEqual({
      change: { epoch: start.epoch, revision: start.revision + 1 },
      timedOut: false,
    });

    // 别的进程在 A 项目写入：同目录、互不相识的另一个 store，只能经 A 的 changes.log 感知。
    await open(dataDirA).create({ title: "别的进程在 A 项目建的卡" });
    expect(aggregator.currentChange()?.revision).toBe(start.revision + 1);
    expect(aggregator.reconcileExternalChanges()).toBe(true);
    expect(aggregator.currentChange()).toEqual({ epoch: start.epoch, revision: start.revision + 2 });
    expect(aggregator.reconcileExternalChanges()).toBe(false);

    // 每个聚合器（每个 Gateway 进程）一个 epoch。
    const restarted = new TaskfoldAggregatedChangeCursor();
    restarted.announceChangeEpoch();
    expect(restarted.currentChange()?.epoch).not.toBe(start.epoch);
  });

  it("注销后的项目不再推动聚合游标", async () => {
    const { storeA, storeB } = twoProjects();
    const aggregator = new TaskfoldAggregatedChangeCursor();
    const removeA = aggregator.addProject(storeA);
    aggregator.addProject(storeB);
    aggregator.announceChangeEpoch();
    const start = aggregator.currentChange()!;

    removeA();
    await storeA.create({ title: "注销后写入" });
    expect(aggregator.currentChange()).toEqual(start);
    await storeB.create({ title: "仍在注册的项目" });
    expect(aggregator.currentChange()?.revision).toBe(start.revision + 1);
  });

  it("change-events.ts 的 1 秒轮询驱动所有项目的 ChangeSource", async () => {
    const { dataDirB, open, storeA, storeB } = twoProjects();
    const aggregator = new TaskfoldAggregatedChangeCursor();
    aggregator.addProject(storeA);
    aggregator.addProject(storeB);
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const service = createTaskfoldChangeEventService(aggregator);
    service.start({ logger: { warn: () => {} } } as never);
    const start = aggregator.currentChange()!;

    await open(dataDirB).create({ title: "别的进程在 B 项目建的卡" });
    vi.advanceTimersByTime(1000);
    expect(aggregator.currentChange()).toEqual({ epoch: start.epoch, revision: start.revision + 1 });
    await service.stop?.({} as never);
  });
});

describe("taskfold.changes.wait：返回形状不变", () => {
  it("文件后端传入聚合游标时，按聚合游标等待，返回 { change, timedOut }", async () => {
    const { storeA, storeB } = twoProjects();
    const aggregator = new TaskfoldAggregatedChangeCursor();
    aggregator.addProject(storeA);
    aggregator.addProject(storeB);
    aggregator.announceChangeEpoch();
    const start = aggregator.currentChange()!;
    const handler = registerChangeWait({ store: storeA, changes: aggregator });

    await expect(callChangeWait(handler, { after: start, timeoutMs: 20 })).resolves.toEqual({
      ok: true,
      payload: { change: start, timedOut: true },
    });
    const waiting = callChangeWait(handler, { after: start, timeoutMs: 1000 });
    await storeB.create({ title: "B 项目的卡" });
    await expect(waiting).resolves.toEqual({
      ok: true,
      payload: { change: { epoch: start.epoch, revision: start.revision + 1 }, timedOut: false },
    });
  });

  it("不传聚合游标（SQLite 生产路径）时仍用 store 自己的游标", async () => {
    const store = new TaskfoldStore(keyedStore<PersistedTaskfoldCard>(), {
      boards: keyedStore<PersistedTaskfoldBoard>(),
      milestones: keyedStore<PersistedTaskfoldMilestone>(),
      documents: keyedStore<PersistedTaskfoldProjectDocument>(),
      subscriptions: keyedStore<PersistedTaskfoldNotificationSubscription>(),
      attachments: keyedStore<PersistedTaskfoldAttachment>(),
    });
    store.announceChangeEpoch();
    const handler = registerChangeWait({ store });

    await expect(callChangeWait(handler, { timeoutMs: 20 })).resolves.toEqual({
      ok: true,
      payload: { change: store.currentChange(), timedOut: false },
    });
  });
});
