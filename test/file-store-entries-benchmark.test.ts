// Taskfold 性能基准：文件存储后端 `cards.entries()` 在不同卡片规模下的耗时。
//
// 背景：需求/16-文件存储改造.md §10.1 第 3 条明确要求测出 reconciler 15 秒全量
// `list()` 扫描（file-store-cards.ts 的 `entries()` = N 次 open+read+解析 Markdown）
// 的性能拐点——"102 张卡没问题，但要测出拐点"。
//
// 这份基准额外测了两件规划文档没直接问、但因为 file-store-atomic.ts 的实现细节而
// 变得重要的事：
//   1. `entries()` 内部全是 `fs.*Sync`（零 `await`），会整段阻塞 Gateway 进程的事件
//      循环——Gateway 是常驻服务，这直接影响它在扫描期间能不能响应别的请求。
//   2. 如果把同一份读取改成异步并发（仿 Backlog.md 的"并发 32 读"），阻塞时间能省多少——
//      这不需要改动任何现有实现，本文件里用一个独立的并发读 helper 单独对比。
//
// ⚠️ 默认只跑一个小规模冒烟用例（50 张卡，常驻 CI，量级判据很宽松）。
// 完整基准（N 到 2000，含 I/O vs 解析占比拆分、同步 vs 异步并发对比）默认关闭，
// 需要显式打开开关才会跑，且耗时明显更长（预计数十秒到几分钟）：
//
//   TASKFOLD_BENCH=1 npx vitest run test/file-store-entries-benchmark.test.ts --config vitest.config.ts
//
// 若要复测"同步 vs 异步并发读"在更大的 libuv 线程池下的差异（默认 UV_THREADPOOL_SIZE=4，
// fs.promises 的并发读实际会被这个线程池限流，不是并发 32 就真的有 32 路磁盘 I/O 同时跑）：
//
//   TASKFOLD_BENCH=1 UV_THREADPOOL_SIZE=32 npx vitest run test/file-store-entries-benchmark.test.ts --config vitest.config.ts
//
// 完整实测数据、拐点判据与建议见会话报告（未入库，报告归宿由用户决定，不在本文件重复）。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { afterEach, describe, expect, it } from "vitest";
import type {
  TaskfoldArtifact,
  TaskfoldAutomation,
  TaskfoldCard,
  TaskfoldClaim,
  TaskfoldComment,
  TaskfoldDiagnostic,
  TaskfoldEvent,
  TaskfoldLink,
  TaskfoldNotification,
  TaskfoldProof,
  TaskfoldRunAttempt,
  TaskfoldSourceReference,
  TaskfoldWorkerLog,
} from "../src/contract/index.js";
import { TASKFOLD_ATTEMPT_STATUSES, TASKFOLD_EVENT_KINDS, TASKFOLD_STATUSES } from "../src/contract/index.js";
import { createTaskfoldFileCardStore } from "../src/backend/src/file-store-cards.js";
import type { TaskfoldCardCodec } from "../src/backend/src/file-store-codec.js";
import {
  parseCardFrontmatterId,
  parseMarkdownCard,
  serializeMarkdownCard,
  type MarkdownCardDocument,
} from "../src/backend/src/markdown-card-format.js";
import type { PersistedTaskfoldCard } from "../src/backend/src/persistence-types.js";

/** 完整基准的开关：默认关闭，避免成为常规 CI 负担。见文件头注释里的启用命令。 */
const RUN_FULL_BENCH = process.env.TASKFOLD_BENCH === "1";

// ============================================================================
// 临时目录管理：基准数据只落在 os.tmpdir()，每个用例结束后清理，不污染项目仓库。
// ============================================================================

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function makeTempCardsDir(label: string): { cardsDir: string; attachmentsDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `taskfold-bench-${label}-`));
  tempRoots.push(root);
  return { cardsDir: path.join(root, "cards"), attachmentsDir: path.join(root, "attachments") };
}

// ============================================================================
// 真实 Markdown 编解码器：直接包一层 markdown-card-format.ts 的
// serializeMarkdownCard/parseMarkdownCard，不用 file-store-codec.ts 里的 JSON
// 占位实现——JSON 占位没有 frontmatter/YAML/哨兵区块解析成本，会严重低估 C2。
// ============================================================================

function createRealMarkdownCodec(): TaskfoldCardCodec {
  return {
    serialize(card: TaskfoldCard): string {
      const displayId = parseCardFrontmatterId(card.id) ?? { prefix: "CARD", numericId: 0 };
      const doc: MarkdownCardDocument = {
        card,
        displayId,
        backlogOnly: {},
        descriptionBody: card.notes ?? "",
        trailing: "",
      };
      return serializeMarkdownCard(doc);
    },
    parse(content: string): TaskfoldCard {
      return parseMarkdownCard(content).card;
    },
  };
}

function persist(card: TaskfoldCard): PersistedTaskfoldCard {
  return { version: 1, card };
}

// ============================================================================
// 造字段密度贴近真实卡片的卡片：带 events / attempts / comments / links /
// sourceReferences / diagnostics / notifications 等数组，而不是空壳卡——
// 空壳卡会严重低估 Markdown 解析成本，掩盖 C2 这条风险。
// ============================================================================

function buildRealisticCard(index: number): TaskfoldCard {
  const id = `CARD-${index}`;
  const createdAt = Date.UTC(2026, 6, 1) + index * 60_000;
  const updatedAt = createdAt + 3_600_000 * 5;

  const events: TaskfoldEvent[] = Array.from({ length: 6 }, (_, i) => ({
    id: `evt-${index}-${i}`,
    kind: TASKFOLD_EVENT_KINDS[i % TASKFOLD_EVENT_KINDS.length],
    at: createdAt + i * 900_000,
    fromStatus: TASKFOLD_STATUSES[i % TASKFOLD_STATUSES.length],
    toStatus: TASKFOLD_STATUSES[(i + 1) % TASKFOLD_STATUSES.length],
    sessionKey: `sess-${index}`,
    runId: `run-${index}-${i}`,
  }));

  const attempts: TaskfoldRunAttempt[] = Array.from({ length: 3 }, (_, i) => ({
    id: `attempt-${index}-${i}`,
    status: TASKFOLD_ATTEMPT_STATUSES[i % TASKFOLD_ATTEMPT_STATUSES.length],
    startedAt: createdAt + i * 1_800_000,
    endedAt: createdAt + i * 1_800_000 + 600_000,
    engine: "claude",
    mode: "autonomous",
    model: "claude-sonnet-5",
    sessionKey: `sess-${index}`,
    runId: `run-${index}-${i}`,
    ...(i === 1 ? { error: "worker 未在 30 分钟心跳窗口内响应，判定超时" } : {}),
    promptVersion: 3,
  }));

  const comments: TaskfoldComment[] = Array.from({ length: 4 }, (_, i) => ({
    id: `comment-${index}-${i}`,
    body:
      `这是第 ${i + 1} 条评论正文，用来模拟真实卡片里较长的人工/agent 讨论文本，` +
      "包含中文标点、换行说明与一些上下文引用，避免基准用空字符串低估解析成本。",
    createdAt: createdAt + i * 500_000,
    ...(i % 2 === 0 ? { updatedAt: createdAt + i * 500_000 + 1_000 } : {}),
  }));

  const links: TaskfoldLink[] = [
    { id: `link-${index}-1`, type: "relates_to", createdAt, targetCardId: `CARD-${(index % 500) + 1}` },
    {
      id: `link-${index}-2`,
      type: "blocks",
      createdAt,
      targetCardId: `CARD-${((index + 7) % 500) + 1}`,
      title: "阻塞项：等待上游卡片先完成",
    },
  ];

  const sourceReferences: TaskfoldSourceReference[] = [
    {
      id: `src-${index}-1`,
      label: "需求文档",
      target: "需求/16-文件存储改造.md#10.1",
      position: 1,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: `src-${index}-2`,
      label: "关联 PR",
      target: `https://example.invalid/org/repo/pull/${1000 + index}`,
      position: 2,
      createdAt,
      updatedAt: createdAt,
      note: "实现与验证都在这个 PR 里",
    },
  ];

  const proof: TaskfoldProof[] = [
    { id: `proof-${index}-1`, status: "passed", createdAt, label: "回归测试", command: "npm test" },
  ];

  const artifacts: TaskfoldArtifact[] = [
    { id: `artifact-${index}-1`, createdAt, label: "构建日志", url: "https://example.invalid/artifacts/build.log" },
  ];

  const workerLogs: TaskfoldWorkerLog[] = Array.from({ length: 3 }, (_, i) => ({
    id: `worklog-${index}-${i}`,
    createdAt: createdAt + i * 300_000,
    level: i === 2 ? "warning" : "info",
    message: `worker 日志第 ${i + 1} 条：执行进度与心跳记录。`,
    sessionKey: `sess-${index}`,
    runId: `run-${index}-main`,
  }));

  const diagnostics: TaskfoldDiagnostic[] = [
    {
      kind: "repeated_failures",
      severity: "warning",
      title: "该卡片近期多次执行失败",
      detail: "连续 2 次 attempt 以 failed 结束，建议人工介入检查 worker 日志。",
      firstSeenAt: createdAt,
      lastSeenAt: updatedAt,
      count: 2,
      actions: [{ kind: "reclaim", label: "释放 claim 并重新排队" }],
    },
  ];

  const notifications: TaskfoldNotification[] = [
    { id: `notif-${index}-1`, kind: "stale", createdAt, message: "会话已超过心跳 TTL，判定为 stale。" },
    { id: `notif-${index}-2`, kind: "completed", createdAt: updatedAt, message: "任务已完成，等待评审。" },
  ];

  const automation: TaskfoldAutomation = {
    tenant: "wisdomisp",
    boardId: "procloud",
    skills: ["typescript", "vitest", "file-io"],
    summary: "由 orchestrator 自动创建，跟踪一次登录超时修复任务。",
    createdCardIds: [`CARD-${index + 1}`],
    dispatchCount: 3,
    lastDispatchAt: updatedAt,
  };

  const claim: TaskfoldClaim = {
    ownerId: "agent-claude-1",
    token: `token-${index}`,
    claimedAt: createdAt + 60_000,
    lastHeartbeatAt: updatedAt,
    expiresAt: updatedAt + 1_800_000,
  };

  return {
    id,
    title: `示例卡片 #${index}：修复登录超时并补充压测覆盖`,
    kind: "task",
    notes:
      ("这是卡片的详细说明正文，包含背景、复现步骤与验收要点等较长文本，" +
        "用来让 Markdown 反序列化的成本贴近真实卡片，而不是空壳卡。").repeat(3),
    status: TASKFOLD_STATUSES[index % TASKFOLD_STATUSES.length],
    priority: "high",
    labels: ["backend", "perf", `batch-${index % 10}`],
    agentId: "agent-claude-1",
    sessionKey: `sess-${index}`,
    runId: `run-${index}-main`,
    taskId: `task-${index}`,
    sourceUrl: `https://example.invalid/org/repo/issues/${index}`,
    execution: {
      id: `exec-${index}`,
      kind: "agent-session",
      engine: "claude",
      mode: "autonomous",
      status: "running",
      model: "claude-sonnet-5",
      sessionKey: `sess-${index}`,
      runId: `run-${index}-main`,
      startedAt: createdAt,
      updatedAt,
    },
    delivery: {
      objective: "修复登录超时问题并补充回归测试",
      deliverySummary: "已定位到会话续期逻辑的时序问题",
      openItems: "等待验证环境跑一轮完整回归",
      implementationState: "in_progress",
      verificationState: "partial",
      releaseState: "not_started",
      updatedAt,
    },
    sourceReferences,
    milestoneId: "m-1",
    position: index * 10 + 0.5,
    createdAt,
    updatedAt,
    revision: 5,
    startedAt: createdAt + 1_000,
    events,
    metadata: {
      attempts,
      comments,
      links,
      proof,
      artifacts,
      workerLogs,
      diagnostics,
      notifications,
      automation,
      claim,
      failureCount: 1,
    },
  };
}

async function seedCards(
  store: ReturnType<typeof createTaskfoldFileCardStore>,
  n: number,
): Promise<void> {
  for (let i = 1; i <= n; i++) {
    const card = buildRealisticCard(i);
    await store.register(card.id, persist(card));
  }
}

async function timeEntriesOnce(store: ReturnType<typeof createTaskfoldFileCardStore>): Promise<number> {
  const start = performance.now();
  await store.entries();
  return performance.now() - start;
}

/** 简单的并发限流 map，仅用于本文件的基准对比——不改动任何现有实现。
 * 仿 Backlog.md "并发 32 读" 的用法：同时最多发起 `limit` 个尚未完成的 `fn` 调用。 */
function limitedMap<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  return new Promise((resolve, reject) => {
    const results = new Array<R>(items.length);
    let nextIndex = 0;
    let completed = 0;
    let failed = false;

    function launchNext(): void {
      if (failed) return;
      while (nextIndex < items.length && nextIndex - completed < limit) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        fn(items[currentIndex] as T)
          .then((result) => {
            results[currentIndex] = result;
            completed += 1;
            if (completed === items.length) {
              resolve(results);
            } else {
              launchNext();
            }
          })
          .catch((err) => {
            failed = true;
            reject(err);
          });
      }
    }

    if (items.length === 0) {
      resolve(results);
    } else {
      launchNext();
    }
  });
}

// ============================================================================
// 冒烟用例：常驻 CI，规模小、量级判据宽松，只防止"彻底跑不动"级别的回归。
// ============================================================================

describe("冒烟：entries() 基本正确性与耗时量级（常跑）", () => {
  it("50 张真实 Markdown 卡片：entries() 数据正确且未出现离谱变慢", async () => {
    const n = 50;
    const { cardsDir, attachmentsDir } = makeTempCardsDir("smoke");
    const store = createTaskfoldFileCardStore({
      cardsDir,
      archiveCardsDir: path.resolve(cardsDir, "..", "archive", "cards"),
      attachmentsDir,
      codec: createRealMarkdownCodec(),
    });
    await seedCards(store, n);

    const start = performance.now();
    const results = await store.entries();
    const elapsedMs = performance.now() - start;

    expect(results).toHaveLength(n);
    const first = results.find((r) => r.key === "CARD-1");
    expect(first?.value.card.title).toBe(buildRealisticCard(1).title);
    expect(first?.value.card.events).toHaveLength(6);
    expect(first?.value.card.metadata?.comments).toHaveLength(4);
    expect(first?.value.card.metadata?.links).toHaveLength(2);
    expect(first?.value.card.sourceReferences).toHaveLength(2);

    // 现网最大项目 ProCloud 是 81 张卡；50 张卡应远快于这个量级判据。
    // 判据本身很宽松——目的是防回归，不是精确测速（精确数字见完整基准/会话报告）。
    expect(elapsedMs).toBeLessThan(3000);
  });
});

// ============================================================================
// 完整基准（默认关闭）：见文件头注释的启用命令。
// ============================================================================

describe.skipIf(!RUN_FULL_BENCH)("完整基准：entries() 耗时 vs 卡片规模（TASKFOLD_BENCH=1）", () => {
  it(
    "N = 50/100/200/500/1000/2000 时 entries() 的耗时",
    async () => {
      const scales = [50, 100, 200, 500, 1000, 2000];
      const rows: Array<{ n: number; medianMs: number; perCardMs: number }> = [];

      for (const n of scales) {
        const { cardsDir, attachmentsDir } = makeTempCardsDir(`scale-${n}`);
        const store = createTaskfoldFileCardStore({
      cardsDir,
      archiveCardsDir: path.resolve(cardsDir, "..", "archive", "cards"),
      attachmentsDir,
      codec: createRealMarkdownCodec(),
    });
        await seedCards(store, n);

        // 预热一次（填充文件系统缓存、JIT 热身），不计入采样。
        await store.entries();

        const samples: number[] = [];
        for (let r = 0; r < 3; r++) {
          samples.push(await timeEntriesOnce(store));
        }
        samples.sort((a, b) => a - b);
        const medianMs = samples[1] ?? samples[0] ?? 0;
        rows.push({ n, medianMs, perCardMs: medianMs / n });

        // 宽松的量级判据：只防止彻底的性能雪崩（例如误改成 O(N^2) 扫描），
        // 不是本次基准的实际结论——结论见会话报告里的实测表格。
        expect(medianMs).toBeLessThan(n * 20 + 3000);
      }

      console.log("\n[entries() 耗时 vs N]  N\t中位耗时(ms)\t单卡均摊(ms)");
      for (const row of rows) {
        console.log(`${row.n}\t${row.medianMs.toFixed(2)}\t${row.perCardMs.toFixed(3)}`);
      }
    },
    300_000,
  );
});

describe.skipIf(!RUN_FULL_BENCH)("完整基准：I/O 耗时 vs 解析耗时占比（TASKFOLD_BENCH=1）", () => {
  it(
    "readFileSync 累计耗时 vs parseMarkdownCard 累计耗时（N=1000）",
    async () => {
      const n = 1000;
      const { cardsDir, attachmentsDir } = makeTempCardsDir("io-vs-parse");
      const store = createTaskfoldFileCardStore({
      cardsDir,
      archiveCardsDir: path.resolve(cardsDir, "..", "archive", "cards"),
      attachmentsDir,
      codec: createRealMarkdownCodec(),
    });
      await seedCards(store, n);

      const fileNames = fs.readdirSync(cardsDir).filter((f) => f.endsWith(".md"));
      expect(fileNames.length).toBe(n);

      let ioMs = 0;
      let parseMs = 0;
      const contents: string[] = [];
      for (const name of fileNames) {
        const t0 = performance.now();
        contents.push(fs.readFileSync(path.join(cardsDir, name), "utf8"));
        ioMs += performance.now() - t0;
      }
      for (const content of contents) {
        const t0 = performance.now();
        parseMarkdownCard(content);
        parseMs += performance.now() - t0;
      }

      const totalMs = ioMs + parseMs;
      console.log(
        `\n[I/O vs 解析占比] N=${n}  I/O=${ioMs.toFixed(2)}ms(${((ioMs / totalMs) * 100).toFixed(1)}%)  ` +
          `解析=${parseMs.toFixed(2)}ms(${((parseMs / totalMs) * 100).toFixed(1)}%)`,
      );
      expect(totalMs).toBeGreaterThan(0);
    },
    60_000,
  );
});

describe.skipIf(!RUN_FULL_BENCH)("完整基准：同步顺序读 vs 异步并发读（TASKFOLD_BENCH=1）", () => {
  it(
    "同步 fs.*Sync 顺序读 vs 异步并发读（并发 32）耗时对比（N=1000）",
    async () => {
      const n = 1000;
      const { cardsDir, attachmentsDir } = makeTempCardsDir("sync-vs-async");
      const store = createTaskfoldFileCardStore({
      cardsDir,
      archiveCardsDir: path.resolve(cardsDir, "..", "archive", "cards"),
      attachmentsDir,
      codec: createRealMarkdownCodec(),
    });
      await seedCards(store, n);

      const filePaths = fs
        .readdirSync(cardsDir)
        .filter((f) => f.endsWith(".md"))
        .map((f) => path.join(cardsDir, f));

      // 现在的实现方式：file-store-atomic.ts 全 *Sync，顺序阻塞。
      const syncStart = performance.now();
      for (const filePath of filePaths) {
        const content = fs.readFileSync(filePath, "utf8");
        parseMarkdownCard(content);
      }
      const syncMs = performance.now() - syncStart;

      // 假设改成异步并发（仿 Backlog.md 的"并发 32 读"）：I/O 用 fs.promises.readFile
      // 并发发起，解析仍是同步 CPU 工作，天然串行在主线程——这一步不会被"异步"并行化，
      // 只有 I/O 等待可以被重叠。
      const asyncStart = performance.now();
      await limitedMap(filePaths, 32, async (filePath) => {
        const content = await fs.promises.readFile(filePath, "utf8");
        parseMarkdownCard(content);
      });
      const asyncMs = performance.now() - asyncStart;

      const threadPoolSize = process.env.UV_THREADPOOL_SIZE ?? "4（默认值，未设置 UV_THREADPOOL_SIZE）";
      console.log(`\n[同步 vs 异步] UV_THREADPOOL_SIZE=${threadPoolSize}`);
      console.log(`同步顺序 (readFileSync+parse): ${syncMs.toFixed(2)}ms`);
      console.log(`异步并发32 (readFile+parse):   ${asyncMs.toFixed(2)}ms`);
      console.log(`加速比: ${(syncMs / asyncMs).toFixed(2)}x`);

      expect(syncMs).toBeGreaterThan(0);
      expect(asyncMs).toBeGreaterThan(0);
    },
    60_000,
  );
});
