// 多进程锁测试的子进程入口（由 test/file-store-multiprocess.test.ts 用 child_process 拉起，
// 不是 vitest 用例）。每个子进程独立打开同一份 `.taskfold/`，等到约定的起跑时刻再同时动手，
// 把结果以一行 JSON 写到 stdout。
import type { PersistedTaskfoldCard } from "@taskfold/core/persistence-types.js";
import { createTaskfoldFileStores } from "@taskfold/core/file-store.js";

type WorkerArgs = {
  mode: "cas" | "create" | "reserve" | "milestone";
  dataDir: string;
  pluginDir: string;
  workerIndex: number;
  /** 所有子进程共同的起跑时间戳（ms），用来把并发窗口压到最小。 */
  startAt: number;
  /** cas：要抢的卡片 key 与期望 revision。 */
  key?: string;
  expectedRevision?: number;
  /** cas：每个写者写进 notes 的填充长度，用来检测截断。 */
  payloadLength?: number;
  /** create：每个子进程新建几张卡；reserve：每个子进程预留几次。 */
  count?: number;
};

function card(overrides: Partial<PersistedTaskfoldCard["card"]> & { id: string }): PersistedTaskfoldCard {
  const now = Date.now();
  return {
    version: 1,
    card: {
      title: "并发卡片",
      status: "backlog",
      priority: "normal",
      labels: [],
      position: 1,
      createdAt: now,
      updatedAt: now,
      revision: 1,
      ...overrides,
    },
  };
}

async function waitUntil(timestamp: number): Promise<void> {
  const delay = timestamp - Date.now();
  if (delay > 5) {
    await new Promise((resolve) => setTimeout(resolve, delay - 5));
  }
  while (Date.now() < timestamp) {
    // 最后几毫秒忙等，让各进程尽量在同一时刻开始。
  }
}

async function main(): Promise<void> {
  const args = JSON.parse(process.argv[2] ?? "{}") as WorkerArgs;
  const stores = createTaskfoldFileStores({ dataDir: args.dataDir, pluginDir: args.pluginDir });

  if (args.mode === "cas") {
    const key = args.key!;
    const current = await stores.cards.lookup(key);
    if (!current) {
      throw new Error(`worker ${args.workerIndex}: seed card ${key} not found`);
    }
    const payload = `writer-${args.workerIndex}:`.padEnd(args.payloadLength ?? 0, String(args.workerIndex % 10));
    const next: PersistedTaskfoldCard = {
      version: 1,
      card: {
        ...current.card,
        title: `writer-${args.workerIndex}`,
        notes: payload,
        revision: (args.expectedRevision ?? 1) + 1,
      },
    };
    await waitUntil(args.startAt);
    const swapped = await stores.cards.compareAndSwap!(key, args.expectedRevision ?? 1, next);
    process.stdout.write(`${JSON.stringify({ workerIndex: args.workerIndex, swapped })}\n`);
    return;
  }

  if (args.mode === "milestone") {
    const created: string[] = [];
    await waitUntil(args.startAt);
    for (let i = 0; i < (args.count ?? 1); i += 1) {
      const key = `w${args.workerIndex}-m${i}`;
      const now = Date.now();
      await stores.milestones.register(key, {
        version: 1,
        milestone: {
          id: key,
          boardId: "board-1",
          title: `worker ${args.workerIndex} milestone ${i}`,
          position: i,
          state: "active",
          createdAt: now,
          updatedAt: now,
        },
      });
      created.push(key);
    }
    process.stdout.write(`${JSON.stringify({ workerIndex: args.workerIndex, created })}\n`);
    return;
  }

  if (args.mode === "reserve") {
    const bases: number[] = [];
    await waitUntil(args.startAt);
    for (let i = 0; i < (args.count ?? 1); i += 1) {
      bases.push(stores.reserveChangeRevisions(10));
    }
    process.stdout.write(`${JSON.stringify({ workerIndex: args.workerIndex, bases })}\n`);
    return;
  }

  const created: Array<{ key: string; inserted: boolean }> = [];
  await waitUntil(args.startAt);
  for (let i = 0; i < (args.count ?? 1); i += 1) {
    const key = `w${args.workerIndex}-c${i}`;
    const inserted = await stores.cards.registerIfAbsent!(
      key,
      card({ id: key, title: `worker ${args.workerIndex} card ${i}` }),
    );
    created.push({ key, inserted });
  }
  process.stdout.write(`${JSON.stringify({ workerIndex: args.workerIndex, created })}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${(error as Error).stack ?? String(error)}\n`);
  process.exit(1);
});
