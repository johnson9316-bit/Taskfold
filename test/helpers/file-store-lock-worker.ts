// 多进程测试的子进程入口（由 test/file-store-multiprocess.test.ts、
// test/file-store-change-log.test.ts 用 child_process 拉起，不是 vitest 用例）。每个子进程
// 独立打开同一份 `.taskfold/`，等到约定的起跑时刻再同时动手，把结果以一行 JSON 写到 stdout。
import type { TaskfoldChange } from "@taskfold/core/contract/index.js";
import type { PersistedTaskfoldCard } from "@taskfold/core/persistence-types.js";
import { createTaskfoldFileStores } from "@taskfold/core/file-store.js";
import type { TaskfoldCoreStore } from "@taskfold/core/store-core.js";

type WorkerArgs = {
  mode: "cas" | "create" | "reserve" | "milestone" | "perceive";
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
  /** perceive：first 先写、再等对方；second 先等对方、再写。 */
  role?: "first" | "second";
  /** perceive：等对方写入最多等多久（ms）。 */
  waitMs?: number;
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

function isNewer(change: TaskfoldChange | undefined, after: TaskfoldChange | undefined): boolean {
  return Boolean(change) && (!after || change!.epoch !== after.epoch || change!.revision > after.revision);
}

/**
 * perceive：像宿主那样驱动变更感知——只靠 `reconcileExternalChanges()` 轮询（OpenClaw 的
 * change-events.ts 每秒调一次），看游标有没有越过 `after`，越过了再确认列表里确实有对方的卡。
 * 不看目录、不读对方的输出，感知只能来自 core 的变更事件。
 */
async function waitForOtherWriter(
  store: TaskfoldCoreStore,
  after: TaskfoldChange | undefined,
  otherTitle: string,
  waitMs: number,
): Promise<boolean> {
  const deadline = Date.now() + waitMs;
  let cursor = after;
  while (Date.now() < deadline) {
    store.reconcileExternalChanges();
    const current = store.currentChange();
    if (isNewer(current, cursor)) {
      cursor = current;
      if ((await store.list()).some((card) => card.title === otherTitle)) {
        return true;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

async function main(): Promise<void> {
  const args = JSON.parse(process.argv[2] ?? "{}") as WorkerArgs;
  const stores = createTaskfoldFileStores({ dataDir: args.dataDir, pluginDir: args.pluginDir });

  if (args.mode === "perceive") {
    // 按需加载：store-core 用了 TS 参数属性，Node 的纯类型剥离跑不了，这个模式要由调用方
    // 带 `--experimental-transform-types` 拉起；其他模式不受影响。
    const { TaskfoldCoreStore } = await import("@taskfold/core/store-core.js");
    // 与宿主的接法一致：工厂返回值整份交给 store（多出来的字段 store 不认就忽略）。
    const store = new TaskfoldCoreStore(stores.cards, stores);
    store.announceChangeEpoch();
    const role = args.role ?? "first";
    const ownTitle = `writer-${role}`;
    const otherTitle = role === "first" ? "writer-second" : "writer-first";
    const waitMs = args.waitMs ?? 10_000;
    let perceived: boolean;
    if (role === "first") {
      await waitUntil(args.startAt);
      await store.create({ title: ownTitle });
      perceived = await waitForOtherWriter(store, store.currentChange(), otherTitle, waitMs);
    } else {
      perceived = await waitForOtherWriter(store, store.currentChange(), otherTitle, waitMs);
      await store.create({ title: ownTitle });
    }
    process.stdout.write(`${JSON.stringify({ workerIndex: args.workerIndex, role, perceived })}\n`);
    return;
  }

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
          title: "同名阶段",
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
