// 需求/18 §3.3 第 1、2 行 / §3.4：文件后端的跨进程并发。
//
// 用 child_process 真正拉起多个 node 进程（子进程入口 test/helpers/file-store-lock-worker.ts），
// 各自独立打开同一份 `.taskfold/`，在同一个起跑时刻并发动手：
//   (a) N 个进程对同一张卡做 CAS：恰好一个成功，其余 false，最终文件完整可解析；
//   (b) N 个进程并发新建卡片：展示 ID 互不重复，文件一个不少；
//   (c) N 个进程并发预留 change revision：区间互不重叠；
//   (d) N 个进程并发新建里程碑：展示 ID 互不重复，文件一个不少。
// 另有两条单进程用例覆盖锁超时、锁失效（compromised）两条路径：CAS 返回 false、不 throw、不写入。
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import lockfile from "proper-lockfile";
import { afterEach, describe, expect, it } from "vitest";
import type { PersistedTaskfoldCard } from "@taskfold/core/persistence-types.js";
import { createTaskfoldFileStores } from "@taskfold/core/file-store.js";
import { createMarkdownCardCodec, type TaskfoldCardCodec } from "@taskfold/core/file-store-codec.js";
import {
  TASKFOLD_LOCK_UPDATE_MS,
  TASKFOLD_LOCK_WAIT_MS,
  taskfoldCardLockPath,
} from "@taskfold/core/file-store-locks.js";

const execFileAsync = promisify(execFile);
const helpersDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "helpers");
const workerPath = path.join(helpersDir, "file-store-lock-worker.ts");
const hooksPath = path.join(helpersDir, "ts-resolve-hooks.mjs");

const PROCESS_COUNT = 8;
const ROUNDS = 5;
/** 子进程冷启动（加载 core 源码）要几百毫秒，起跑时刻留足余量。 */
const START_DELAY_MS = 1500;

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function tempRoots(): { dataDir: string; pluginDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-file-store-mp-"));
  roots.push(root);
  return {
    dataDir: path.join(root, "repo", ".taskfold"),
    pluginDir: path.join(root, "plugin-state", "plugins", "taskfold"),
  };
}

async function runWorkers<T>(argsFor: (workerIndex: number) => Record<string, unknown>): Promise<T[]> {
  const startAt = Date.now() + START_DELAY_MS;
  const runs = Array.from({ length: PROCESS_COUNT }, async (_, workerIndex) => {
    const { stdout } = await execFileAsync(
      process.execPath,
      ["--import", hooksPath, workerPath, JSON.stringify({ ...argsFor(workerIndex), workerIndex, startAt })],
      { timeout: 30_000 },
    );
    return JSON.parse(stdout.trim()) as T;
  });
  return await Promise.all(runs);
}

function seedCard(id: string): PersistedTaskfoldCard {
  const now = Date.now();
  return {
    version: 1,
    card: {
      id,
      title: "种子卡片",
      status: "backlog",
      priority: "normal",
      labels: [],
      position: 1,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    },
  };
}

describe("文件后端跨进程并发（child_process 多进程）", () => {
  it(
    "(a) N 个进程并发 CAS 同一张卡：每轮恰好一个成功，其余 false，文件完整",
    async () => {
      const { dataDir, pluginDir } = tempRoots();
      const stores = createTaskfoldFileStores({ dataDir, pluginDir });
      const key = randomUUID();
      await stores.cards.register(key, seedCard(key));
      const payloadLength = 64 * 1024;

      const winnersPerRound: number[] = [];
      for (let round = 0; round < ROUNDS; round += 1) {
        const before = await stores.cards.lookup(key);
        const expectedRevision = before!.card.revision!;
        const results = await runWorkers<{ workerIndex: number; swapped: boolean }>(() => ({
          mode: "cas",
          dataDir,
          pluginDir,
          key,
          expectedRevision,
          payloadLength,
        }));
        const winners = results.filter((result) => result.swapped);
        winnersPerRound.push(winners.length);

        const after = await stores.cards.lookup(key);
        // 文件完整：能解析、notes 没被截断、revision 恰好前进 1。
        expect(after?.card.notes?.length).toBe(payloadLength);
        expect(after?.card.revision).toBe(expectedRevision + 1);
        if (winners.length === 1) {
          expect(after?.card.title).toBe(`writer-${winners[0].workerIndex}`);
        }
      }
      expect(winnersPerRound).toEqual(Array.from({ length: ROUNDS }, () => 1));
    },
    120_000,
  );

  it(
    "(b) N 个进程并发新建卡片：展示 ID 互不重复，文件一个不少",
    async () => {
      const { dataDir, pluginDir } = tempRoots();
      // 先建一次目录布局，免得子进程在 mkdir 上互相绊脚（与本测试要验证的点无关）。
      createTaskfoldFileStores({ dataDir, pluginDir });
      const perProcess = 5;

      const results = await runWorkers<{
        workerIndex: number;
        created: Array<{ key: string; inserted: boolean }>;
      }>(() => ({ mode: "create", dataDir, pluginDir, count: perProcess }));

      const expectedKeys = results.flatMap((result) => result.created.map((entry) => entry.key));
      expect(expectedKeys).toHaveLength(PROCESS_COUNT * perProcess);
      expect(results.flatMap((result) => result.created).every((entry) => entry.inserted)).toBe(true);

      const cardsDir = path.join(dataDir, "cards");
      const fileNames = fs.readdirSync(cardsDir).filter((name) => name.endsWith(".md"));
      const displayIds = fileNames.map((name) => name.slice(0, name.indexOf(" - ")));
      expect(fileNames).toHaveLength(PROCESS_COUNT * perProcess);
      expect(new Set(displayIds).size).toBe(displayIds.length);

      const stores = createTaskfoldFileStores({ dataDir, pluginDir });
      const entries = await stores.cards.entries();
      expect(entries.map((entry) => entry.key).sort()).toEqual([...expectedKeys].sort());
    },
    120_000,
  );

  it(
    "(c) N 个进程并发预留 change revision：区间互不重叠",
    async () => {
      const { dataDir, pluginDir } = tempRoots();
      createTaskfoldFileStores({ dataDir, pluginDir });
      const perProcess = 20;

      const results = await runWorkers<{ workerIndex: number; bases: number[] }>(() => ({
        mode: "reserve",
        dataDir,
        pluginDir,
        count: perProcess,
      }));

      const bases = results.flatMap((result) => result.bases);
      expect(bases).toHaveLength(PROCESS_COUNT * perProcess);
      expect(new Set(bases).size).toBe(bases.length);
    },
    120_000,
  );

  it(
    "(d) N 个进程并发新建里程碑：展示 ID 互不重复，文件一个不少",
    async () => {
      const { dataDir, pluginDir } = tempRoots();
      createTaskfoldFileStores({ dataDir, pluginDir });
      const perProcess = 5;

      const results = await runWorkers<{ workerIndex: number; created: string[] }>(() => ({
        mode: "milestone",
        dataDir,
        pluginDir,
        count: perProcess,
      }));

      const expectedKeys = results.flatMap((result) => result.created);
      const fileNames = fs
        .readdirSync(path.join(dataDir, "milestones"))
        .filter((name) => name.endsWith(".md"));
      const displayIds = fileNames.map((name) => name.slice(0, name.indexOf(" - ")));
      expect(fileNames).toHaveLength(PROCESS_COUNT * perProcess);
      expect(new Set(displayIds).size).toBe(displayIds.length);

      const stores = createTaskfoldFileStores({ dataDir, pluginDir });
      const entries = await stores.milestones.entries();
      expect(entries.map((entry) => entry.key).sort()).toEqual([...expectedKeys].sort());
    },
    120_000,
  );
});

function cardFilePathFor(dataDir: string): string {
  const cardsDir = path.join(dataDir, "cards");
  const [fileName] = fs.readdirSync(cardsDir).filter((name) => name.endsWith(".md"));
  return path.join(cardsDir, fileName);
}

describe("文件后端锁失败路径：CAS 返回 false，不 throw，不写入（需求/16 R2）", () => {
  it(
    "等锁超时：卡锁被别人一直占着，CAS 约 2 秒后返回 false",
    async () => {
      const { dataDir, pluginDir } = tempRoots();
      const stores = createTaskfoldFileStores({ dataDir, pluginDir });
      const key = randomUUID();
      await stores.cards.register(key, seedCard(key));
      const cardFilePath = cardFilePathFor(dataDir);
      const before = fs.readFileSync(cardFilePath, "utf8");

      // 模拟另一个持锁者：用同样的锁文件路径直接拿住卡锁、不放。
      const release = await lockfile.lock(cardFilePath, {
        lockfilePath: taskfoldCardLockPath(path.join(dataDir, ".locks"), key),
        realpath: false,
      });
      try {
        const current = await stores.cards.lookup(key);
        const startedAt = Date.now();
        const swapped = await stores.cards.compareAndSwap(key, current!.card.revision, {
          version: 1,
          card: { ...current!.card, title: "不该落盘", revision: current!.card.revision + 1 },
        });
        const elapsed = Date.now() - startedAt;

        expect(swapped).toBe(false);
        expect(elapsed).toBeGreaterThanOrEqual(TASKFOLD_LOCK_WAIT_MS - 100);
        expect(elapsed).toBeLessThan(TASKFOLD_LOCK_WAIT_MS + 1000);
        expect(fs.readFileSync(cardFilePath, "utf8")).toBe(before);
      } finally {
        await release();
      }
    },
    20_000,
  );

  it(
    "锁失效（compromised）：持锁期间锁被别的进程接管，CAS 放弃写入返回 false，进程不崩",
    async () => {
      const { dataDir, pluginDir } = tempRoots();
      const realCodec = createMarkdownCardCodec();
      let stealDuringSerialize: (() => void) | undefined;
      // 在临界区中间（序列化之后、rename 之前）模拟「本进程被挂起超过 stale，
      // 别的进程按 stale 规则删掉旧锁、建了自己的锁」。
      const codec: TaskfoldCardCodec = {
        ...realCodec,
        serialize: (...args: Parameters<TaskfoldCardCodec["serialize"]>) => {
          const content = realCodec.serialize(...args);
          stealDuringSerialize?.();
          return content;
        },
      };
      const stores = createTaskfoldFileStores({ dataDir, pluginDir, cardCodec: codec });
      const key = randomUUID();
      await stores.cards.register(key, seedCard(key));
      const cardFilePath = cardFilePathFor(dataDir);
      const before = fs.readFileSync(cardFilePath, "utf8");
      const lockPath = taskfoldCardLockPath(path.join(dataDir, ".locks"), key);
      stealDuringSerialize = () => {
        fs.rmSync(lockPath, { recursive: true, force: true });
        fs.mkdirSync(lockPath);
        const thiefMtime = new Date(Date.now() + 60_000);
        fs.utimesSync(lockPath, thiefMtime, thiefMtime);
      };

      const current = await stores.cards.lookup(key);
      const swapped = await stores.cards.compareAndSwap(key, current!.card.revision, {
        version: 1,
        card: { ...current!.card, title: "不该落盘", revision: current!.card.revision + 1 },
      });
      stealDuringSerialize = undefined;

      expect(swapped).toBe(false);
      expect(fs.readFileSync(cardFilePath, "utf8")).toBe(before);
      // 没有残留 tmp 文件，也没有把接管者的锁删掉。
      expect(fs.readdirSync(path.dirname(cardFilePath)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
      expect(fs.existsSync(lockPath)).toBe(true);

      // 等 proper-lockfile 的刷新定时器跑一轮：它会发现锁不再属于我们并触发 onCompromised。
      // 默认实现会在定时器里 throw（vitest 会把它记成未处理错误、判本文件失败）；
      // 这里要求它只被记录、不崩。
      await new Promise((resolve) => setTimeout(resolve, TASKFOLD_LOCK_UPDATE_MS + 1000));
      expect(await stores.cards.lookup(key)).toMatchObject({ card: { title: "种子卡片" } });
    },
    30_000,
  );
});
