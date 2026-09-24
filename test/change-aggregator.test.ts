// TASK-4 定案「适配层聚合游标」，TASK-10 接进生产路径：文件后端下每个项目一份 changes.log、
// 各有各的游标，而前端调用 `taskfold.changes.wait` 时不带项目。OpenClaw 适配层把所有项目聚合成
// 一个游标：适配层自己的 epoch（每个 Gateway 进程一个）+ 单调计数，任一项目的游标前进一次就
// +1；返回形状不变。聚合游标做成组合 store 的 ChangeSource（change-aggregator.ts），Gateway 里
// 唯一的 TaskfoldStore 直接用它，`taskfold.changes.wait` 与 change-events 服务都不用另外接线。
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenClawPluginApi } from "../src/backend/api.js";
import { createTaskfoldFileStores } from "@taskfold/core/file-store.js";
import { TaskfoldStore as CoreFileStore } from "../src/backend/src/store.js";
import { createTaskfoldChangeEventService } from "../src/backend/src/change-events.js";
import { registerTaskfoldGatewayMethods } from "../src/backend/src/gateway.js";
import { createTaskfoldProjectRoutedStores } from "../src/backend/src/project-routed-stores.js";

const roots: string[] = [];

afterEach(() => {
  vi.useRealTimers();
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function gitRepo(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  execFileSync("git", ["init", "-q", dir], { stdio: "pipe" });
  return fs.realpathSync(dir);
}

/** 两个绑了仓库的项目 A、B，经组合 store 打开；另给一个「别的进程」直接打开某个项目的文件 store。 */
async function twoProjects() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-change-aggregator-")));
  roots.push(root);
  const pluginDir = path.join(root, "plugin-state", "plugins", "taskfold");
  const repoA = gitRepo(path.join(root, "project-a"));
  const repoB = gitRepo(path.join(root, "project-b"));
  const store = CoreFileStore.fromStores(createTaskfoldProjectRoutedStores({ pluginDir }));
  await store.upsertBoard({ id: "a", defaultWorkspace: { kind: "dir", path: repoA } });
  await store.upsertBoard({ id: "b", defaultWorkspace: { kind: "dir", path: repoB } });
  await store.create({ title: "A 的第一张卡", boardId: "a" });
  await store.create({ title: "B 的第一张卡", boardId: "b" });
  /** 另一个进程：同目录、互不相识的另一个 store，只能经该项目的 changes.log 感知。 */
  const otherProcess = (repo: string) =>
    CoreFileStore.fromStores(createTaskfoldFileStores({ dataDir: path.join(repo, ".taskfold") }));
  return { root, pluginDir, repoA, repoB, store, otherProcess };
}

type Handler = (request: {
  params: Record<string, unknown>;
  respond: (ok: boolean, payload?: unknown) => void;
}) => Promise<void>;

function registerChangeWait(store: CoreFileStore): Handler {
  const handlers = new Map<string, Handler>();
  const api = {
    runtime: {},
    registerGatewayMethod(name: string, handler: Handler) {
      handlers.set(name, handler);
    },
  } as unknown as OpenClawPluginApi;
  registerTaskfoldGatewayMethods({ api, store });
  return handlers.get("taskfold.changes.wait")!;
}

async function callChangeWait(handler: Handler, params: Record<string, unknown>) {
  let response: { ok: boolean; payload?: unknown } | undefined;
  await handler({ params, respond: (ok, payload) => (response = { ok, payload }) });
  return response;
}

describe("聚合游标：组合 store 的 ChangeSource", () => {
  it("本进程写入与别的进程写入都让聚合游标 +1，epoch 是适配层自己的", async () => {
    const { repoA, repoB, pluginDir, store, otherProcess } = await twoProjects();
    store.announceChangeEpoch();
    const start = store.currentChange()!;
    const projectEpochs = [repoA, repoB].map(
      (repo) => createTaskfoldFileStores({ dataDir: path.join(repo, ".taskfold") }).changeEpoch,
    );
    expect(projectEpochs).not.toContain(start.epoch);

    // 本进程在 B 项目写入：写完立即 +1，不用等轮询。
    const waiting = store.waitForChange(start, 1000);
    await store.create({ title: "B 项目的卡", boardId: "b" });
    await expect(waiting).resolves.toEqual({
      change: { epoch: start.epoch, revision: start.revision + 1 },
      timedOut: false,
    });

    // 别的进程在 A 项目写入：只能经 A 的 changes.log 感知。
    await otherProcess(repoA).create({ title: "别的进程在 A 项目建的卡", boardId: "a" });
    expect(store.currentChange()?.revision).toBe(start.revision + 1);
    expect(store.reconcileExternalChanges()).toBe(true);
    expect(store.currentChange()).toEqual({ epoch: start.epoch, revision: start.revision + 2 });
    expect(store.reconcileExternalChanges()).toBe(false);

    // 每个组合 store（每个 Gateway 进程）一个 epoch。
    const restarted = CoreFileStore.fromStores(createTaskfoldProjectRoutedStores({ pluginDir }));
    restarted.announceChangeEpoch();
    expect(restarted.currentChange()?.epoch).not.toBe(start.epoch);
  });

  it("本进程的写入只在它写到的项目的 changes.log 里记一笔", async () => {
    const { repoA, repoB, store } = await twoProjects();
    const logLines = (repo: string) =>
      fs.readFileSync(path.join(repo, ".taskfold", ".runtime", "changes.log"), "utf8").trim().split("\n").length;
    const [beforeA, beforeB] = [logLines(repoA), logLines(repoB)];
    await store.create({ title: "只写 B", boardId: "b" });
    expect(logLines(repoA)).toBe(beforeA);
    expect(logLines(repoB)).toBe(beforeB + 1);
  });

  it("change-events.ts 的 1 秒轮询驱动所有项目的 ChangeSource", async () => {
    const { repoB, store, otherProcess } = await twoProjects();
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const service = createTaskfoldChangeEventService(store);
    service.start({ logger: { warn: () => {} } } as never);
    const start = store.currentChange()!;

    await otherProcess(repoB).create({ title: "别的进程在 B 项目建的卡", boardId: "b" });
    vi.advanceTimersByTime(1000);
    expect(store.currentChange()).toEqual({ epoch: start.epoch, revision: start.revision + 1 });
    await service.stop?.({} as never);
  });

  it("别的进程（CLI init）新建了某个已登记项目的 .taskfold/：轮询发现后游标前进，卡片可见", async () => {
    const { root, store } = await twoProjects();
    const repoC = gitRepo(path.join(root, "project-c"));
    await store.upsertBoard({ id: "c", defaultWorkspace: { kind: "dir", path: repoC } });
    store.announceChangeEpoch();
    const start = store.currentChange()!;

    const cli = CoreFileStore.fromStores(createTaskfoldFileStores({ dataDir: path.join(repoC, ".taskfold") }));
    const created = await cli.create({ title: "CLI 在 C 项目建的卡", boardId: "c" });
    store.reconcileExternalChanges();
    await new Promise((resolve) => setTimeout(resolve, 20));
    store.reconcileExternalChanges();
    expect(store.currentChange()!.revision).toBeGreaterThan(start.revision);
    expect((await store.list({ boardId: "c" })).map((card) => card.id)).toEqual([created.id]);
  });
});

describe("taskfold.changes.wait：返回形状不变", () => {
  it("按聚合游标等待，返回 { change, timedOut }", async () => {
    const { store } = await twoProjects();
    store.announceChangeEpoch();
    const start = store.currentChange()!;
    const handler = registerChangeWait(store);

    await expect(callChangeWait(handler, { after: start, timeoutMs: 20 })).resolves.toEqual({
      ok: true,
      payload: { change: start, timedOut: true },
    });
    const waiting = callChangeWait(handler, { after: start, timeoutMs: 1000 });
    await store.create({ title: "B 项目的卡", boardId: "b" });
    await expect(waiting).resolves.toEqual({
      ok: true,
      payload: { change: { epoch: start.epoch, revision: start.revision + 1 }, timedOut: false },
    });
  });
});
