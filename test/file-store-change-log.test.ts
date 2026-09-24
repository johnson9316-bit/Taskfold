// 需求/18 §3.3 第 6 行、§3.8：changes.log 移到每个项目的 `.taskfold/.runtime/changes.log`，
// 在该项目的全局锁内追加；跨进程的变更感知由 ChangeSource 从这份日志读出。
//
// 用 child_process 真正拉起多个 node 进程（子进程入口 test/helpers/file-store-lock-worker.ts）：
//   (a) TASK-4 AC#2：两个进程各写一次，都能从 changes.log 感知到对方的写入；
//   (b) TASK-2 遗留：两个项目共用同一个插件目录时，多进程并发预留 change revision，
//       每份 changes.log 里的预留记录仍严格递增（旧实现两个项目共写插件目录下的同一份
//       changes.log，却各拿各的项目全局锁，预留会交错重叠）。
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import lockfile from "proper-lockfile";
import { afterEach, describe, expect, it } from "vitest";
import { createTaskfoldFileStores } from "@taskfold/core/file-store.js";
import { taskfoldGlobalLockPath, TASKFOLD_LOCK_WAIT_MS } from "@taskfold/core/file-store-locks.js";
import { TaskfoldCoreStore } from "@taskfold/core/store-core.js";

const execFileAsync = promisify(execFile);
const helpersDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "helpers");
const workerPath = path.join(helpersDir, "file-store-lock-worker.ts");
const hooksPath = path.join(helpersDir, "ts-resolve-hooks.mjs");

/** 子进程冷启动（加载 core 源码）要几百毫秒，起跑时刻留足余量。 */
const START_DELAY_MS = 1500;

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-change-log-"));
  roots.push(root);
  return root;
}

async function runWorker<T>(args: Record<string, unknown>): Promise<T> {
  // perceive 模式要加载 store-core（TS 参数属性），纯类型剥离跑不了，需要 transform-types。
  const { stdout } = await execFileAsync(
    process.execPath,
    ["--experimental-transform-types", "--no-warnings", "--import", hooksPath, workerPath, JSON.stringify(args)],
    { timeout: 30_000 },
  );
  return JSON.parse(stdout.trim()) as T;
}

/** 递归找出 `root` 下所有名为 changes.log 的文件——不假设日志在哪，新旧实现都能跑。 */
function findChangeLogs(root: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name === "changes.log") {
      found.push(path.join(entry.parentPath, entry.name));
    }
  }
  return found;
}

function reserveCeilings(logPath: string): number[] {
  return fs
    .readFileSync(logPath, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as { type: string; ceiling?: number })
    .filter((record) => record.type === "reserve")
    .map((record) => record.ceiling!);
}

describe("changes.log 跨进程变更感知（TASK-4 AC#2）", () => {
  it(
    "两个进程各写一次，都能从 changes.log 感知到对方的写入",
    async () => {
      const root = tempRoot();
      const dataDir = path.join(root, "repo", ".taskfold");
      const pluginDir = path.join(root, "plugin-state", "plugins", "taskfold");
      // 先建好目录与日志，免得两个子进程在初始化上互相绊脚（与本测试要验证的点无关）。
      const bootstrap = createTaskfoldFileStores({ dataDir, pluginDir });
      new TaskfoldCoreStore(bootstrap.cards, bootstrap).announceChangeEpoch();

      const startAt = Date.now() + START_DELAY_MS;
      const results = await Promise.all(
        (["first", "second"] as const).map((role, workerIndex) =>
          runWorker<{ role: string; perceived: boolean }>({
            mode: "perceive",
            role,
            dataDir,
            pluginDir,
            workerIndex,
            startAt,
            waitMs: 8_000,
          }),
        ),
      );

      expect(results.map((result) => [result.role, result.perceived])).toEqual([
        ["first", true],
        ["second", true],
      ]);
    },
    60_000,
  );
});

describe("多项目并发预留 change revision 不再冲突（TASK-2 遗留）", () => {
  it(
    "两个项目共用插件目录，8 个进程并发预留：每份 changes.log 的预留记录严格递增，同项目区间不重叠",
    async () => {
      const root = tempRoot();
      const pluginDir = path.join(root, "plugin-state", "plugins", "taskfold");
      const projects = [
        path.join(root, "project-a", ".taskfold"),
        path.join(root, "project-b", ".taskfold"),
      ];
      for (const dataDir of projects) {
        createTaskfoldFileStores({ dataDir, pluginDir });
      }
      const processCount = 8;
      const perProcess = 20;
      const startAt = Date.now() + START_DELAY_MS;

      const results = await Promise.all(
        Array.from({ length: processCount }, async (_, workerIndex) => {
          const dataDir = projects[workerIndex % projects.length]!;
          const result = await runWorker<{ bases: number[] }>({
            mode: "reserve",
            dataDir,
            pluginDir,
            workerIndex,
            startAt,
            count: perProcess,
          });
          return { dataDir, bases: result.bases };
        }),
      );

      const logs = findChangeLogs(root);
      expect(logs.length).toBeGreaterThan(0);
      let totalReservations = 0;
      for (const logPath of logs) {
        const ceilings = reserveCeilings(logPath);
        totalReservations += ceilings.length;
        const notIncreasing = ceilings.filter((ceiling, index) => index > 0 && ceiling <= ceilings[index - 1]!);
        expect({ logPath, notIncreasing }).toEqual({ logPath, notIncreasing: [] });
      }
      expect(totalReservations).toBe(processCount * perProcess);

      for (const dataDir of projects) {
        const bases = results.filter((result) => result.dataDir === dataDir).flatMap((result) => result.bases);
        expect(bases).toHaveLength((processCount / projects.length) * perProcess);
        expect(new Set(bases).size).toBe(bases.length);
      }
    },
    120_000,
  );
});

describe("changes.log 的位置与维护（单进程）", () => {
  it("日志在项目的 .taskfold/.runtime/ 下，插件目录里不再有 changes.log", async () => {
    const root = tempRoot();
    const dataDir = path.join(root, "repo", ".taskfold");
    const pluginDir = path.join(root, "plugin-state", "plugins", "taskfold");
    const stores = createTaskfoldFileStores({ dataDir, pluginDir });
    await new TaskfoldCoreStore(stores.cards, stores).create({ title: "记一笔" });

    expect(findChangeLogs(root)).toEqual([path.join(dataDir, ".runtime", "changes.log")]);
  });

  it("core 源码里没有任何 ~/.openclaw 路径（需求/18 §3.8）", () => {
    const coreSrc = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "packages", "core", "src");
    const offenders = fs
      .readdirSync(coreSrc, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .map((entry) => path.join(entry.parentPath, entry.name))
      .filter((filePath) => /\.openclaw\b/.test(fs.readFileSync(filePath, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("记录过多时压缩成 epoch + 最新 ceiling，游标不变", async () => {
    const root = tempRoot();
    const dataDir = path.join(root, "repo", ".taskfold");
    const stores = createTaskfoldFileStores({ dataDir, pluginDir: path.join(root, "plugin") });
    const logPath = path.join(dataDir, ".runtime", "changes.log");
    for (let i = 0; i < 1100; i += 1) {
      await stores.changeSource.record();
    }
    const lines = fs.readFileSync(logPath, "utf8").trim().split("\n");
    expect(lines.length).toBeLessThan(1000);
    expect(JSON.parse(lines[0]!)).toEqual({ type: "epoch", epoch: stores.changeEpoch });
    expect(reserveCeilings(logPath).at(-1)).toBe(1100);
    await expect(stores.changeSource.record()).resolves.toEqual({ epoch: stores.changeEpoch, revision: 1101 });
  });

  it("删掉 .runtime/ 后日志换一个新 epoch，别的进程轮询时看到 epoch 变化", async () => {
    const root = tempRoot();
    const dataDir = path.join(root, "repo", ".taskfold");
    const pluginDir = path.join(root, "plugin");
    const writerStores = createTaskfoldFileStores({ dataDir, pluginDir });
    const writer = new TaskfoldCoreStore(writerStores.cards, writerStores);
    const readerStores = createTaskfoldFileStores({ dataDir, pluginDir });
    const reader = new TaskfoldCoreStore(readerStores.cards, readerStores);
    await writer.create({ title: "删运行态之前" });
    reader.reconcileExternalChanges();
    const before = reader.currentChange()!;

    fs.rmSync(path.join(dataDir, ".runtime"), { recursive: true, force: true });
    await writer.create({ title: "删运行态之后" });

    expect(reader.reconcileExternalChanges()).toBe(true);
    expect(reader.currentChange()?.epoch).not.toBe(before.epoch);
    // reader 这一轮还发现旧卡的运行态没了、按 md 重新初始化并记了一笔；writer 轮询后跟上。
    writer.reconcileExternalChanges();
    expect(writer.currentChange()).toEqual(reader.currentChange());
  });

  it(
    "记日志时等全局锁超时：写入照常成功、不 throw，这一笔由下次轮询补记",
    async () => {
      const root = tempRoot();
      const dataDir = path.join(root, "repo", ".taskfold");
      const stores = createTaskfoldFileStores({ dataDir, pluginDir: path.join(root, "plugin") });
      const store = new TaskfoldCoreStore(stores.cards, stores);
      const card = await store.create({ title: "锁被占着" });
      const before = store.currentChange()!;

      // 模拟另一个进程一直占着全局锁（卡片 CAS 只用卡锁，不受影响）。
      const lockPath = taskfoldGlobalLockPath(path.join(dataDir, ".locks"));
      const release = await lockfile.lock(lockPath.slice(0, -".lock".length), {
        lockfilePath: lockPath,
        realpath: false,
      });
      try {
        const updated = await store.update(card.id, { notes: "写入本身成功" });
        expect(updated.notes).toBe("写入本身成功");
        expect(store.currentChange()).toEqual(before);
      } finally {
        await release();
      }

      expect(store.reconcileExternalChanges()).toBe(true);
      expect(store.currentChange()).toEqual({ epoch: before.epoch, revision: before.revision + 1 });
    },
    TASKFOLD_LOCK_WAIT_MS * 5,
  );
});
