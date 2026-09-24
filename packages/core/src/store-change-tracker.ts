import { randomUUID } from "node:crypto";
import type { TaskfoldChange } from "./contract/index.js";
import type { TaskfoldKeyedStore } from "./persistence-types.js";

/**
 * Revisions reserved per round trip to the backing store. Large enough that a
 * busy Gateway rarely re-reserves, small enough that restarts do not skip far.
 */
const CHANGE_REVISION_BLOCK = 10_000;

/**
 * ChangeSource 端口（需求/18 §3.5 第 3 项）：变更游标从哪来。{@link TaskfoldChangeTracker}
 * 只负责把它给出的游标广播给等待者；本进程的写入、别的进程的写入、绕过 core 的文件改动
 * 各自怎么变成游标，由实现决定。三个方法返回 `undefined` 都表示「这次没有新游标可广播」。
 *
 * - SQLite 与内存 store：{@link createTaskfoldReservedChangeSource}（按块预留 revision，
 *   外部变化靠 `dataVersion`）。
 * - 文件后端：file-store-change-cursor.ts 的 `createTaskfoldFileChangeSource`（跨进程靠
 *   `.taskfold/.runtime/changes.log`）。
 */
export type TaskfoldChangeSource = {
  /** 宿主启动时调一次，给等待者一个起始游标。 */
  announce(): TaskfoldChange | undefined;
  /** 本进程刚提交了写入。 */
  record(): TaskfoldChange | undefined;
  /** 宿主定期调用（OpenClaw 的 change-events.ts 每秒一次）：别处有没有变化。 */
  poll(): TaskfoldChange | undefined;
};

/**
 * 按块预留 revision 的 ChangeSource：SQLite 后端（`taskfold_meta` 里的持久计数器 + `PRAGMA
 * data_version`）与内存 store（不传参数：进程级 epoch、从 0 起的内存计数）都用它。
 * 行为与 ChangeSource 端口引入之前 TaskfoldChangeTracker 内置的逻辑完全一致。
 */
export function createTaskfoldReservedChangeSource(
  options: {
    dataVersion?: () => number;
    epoch?: string;
    reserveRevisions?: (count: number) => number;
  } = {},
): TaskfoldChangeSource {
  const { dataVersion } = options;
  // A database-scoped epoch plus restart-monotonic revisions keep a connected
  // UI's long-wait cursor comparable across a Gateway restart. A per-process
  // epoch invalidated every cursor on each restart and forced a full reload.
  const epoch = options.epoch ?? randomUUID();
  const reserveRevisions = options.reserveRevisions ?? (() => 0);
  let revision = reserveRevisions(CHANGE_REVISION_BLOCK);
  let revisionCeiling = revision + CHANGE_REVISION_BLOCK;
  let externalDataVersion = dataVersion?.();

  const record = (): TaskfoldChange => {
    if (revision + 1 >= revisionCeiling) {
      const base = Math.max(reserveRevisions(CHANGE_REVISION_BLOCK), revision);
      revision = base;
      revisionCeiling = base + CHANGE_REVISION_BLOCK;
    }
    return { epoch, revision: ++revision };
  };

  return {
    announce: record,
    record,
    poll() {
      if (!dataVersion) {
        return undefined;
      }
      const current = dataVersion();
      if (current === externalDataVersion) {
        return undefined;
      }
      externalDataVersion = current;
      return record();
    },
  };
}

export class TaskfoldChangeTracker {
  private readonly source: TaskfoldChangeSource;
  private latestChange: TaskfoldChange | undefined;
  private mutationRevision = 0;
  private readonly listeners = new Set<(change: TaskfoldChange) => void>();

  constructor(source: TaskfoldChangeSource = createTaskfoldReservedChangeSource()) {
    this.source = source;
  }

  track<T>(store: TaskfoldKeyedStore<T>): TaskfoldKeyedStore<T> {
    // The wrapper exposes `compareAndSwap` exactly when `store` does, so it satisfies
    // the same (T-dependent) required/optional CAS shape; TS cannot see that through
    // the conditional type in persistence-types.ts, hence the cast.
    return {
      register: async (key, value) => {
        await store.register(key, value);
        this.mutationRevision += 1;
      },
      lookup: async (key) => await store.lookup(key),
      delete: async (key) => {
        const deleted = await store.delete(key);
        if (deleted) {
          this.mutationRevision += 1;
        }
        return deleted;
      },
      entries: async () => await store.entries(),
      ...(store.compareAndSwap
        ? {
            compareAndSwap: async (key: string, expectedRevision: number, value: T) => {
              const swapped = await store.compareAndSwap!(key, expectedRevision, value);
              if (swapped) {
                this.mutationRevision += 1;
              }
              return swapped;
            },
          }
        : {}),
      ...(store.registerIfAbsent
        ? {
            registerIfAbsent: async (key: string, value: T) => {
              const inserted = await store.registerIfAbsent!(key, value);
              if (inserted) {
                this.mutationRevision += 1;
              }
              return inserted;
            },
          }
        : {}),
    } as TaskfoldKeyedStore<T>;
  }

  subscribe(listener: (change: TaskfoldChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  announceEpoch(): void {
    this.publish(this.source.announce());
  }

  /** 记一次变化并广播（给不经 {@link track} 的调用方用，例如 OpenClaw 适配层的聚合游标）。 */
  recordChange(): void {
    this.publish(this.source.record());
  }

  current(): TaskfoldChange | undefined {
    return this.latestChange;
  }

  reconcileExternalChanges(): boolean {
    const change = this.source.poll();
    if (!change) {
      return false;
    }
    this.publish(change);
    return true;
  }

  async runMutation<T>(run: () => Promise<T>): Promise<T> {
    const initialRevision = this.mutationRevision;
    try {
      return await run();
    } finally {
      if (this.mutationRevision !== initialRevision) {
        this.publish(this.source.record());
      }
    }
  }

  async waitForChange(
    after: TaskfoldChange | undefined,
    timeoutMs: number,
  ): Promise<{ change?: TaskfoldChange; timedOut: boolean }> {
    const isNewer = (change: TaskfoldChange) =>
      !after || change.epoch !== after.epoch || change.revision > after.revision;
    const current = this.current();
    if (current && isNewer(current)) {
      return { change: current, timedOut: false };
    }

    return await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        unsubscribe();
        resolve({ change: this.current(), timedOut: true });
      }, timeoutMs);
      const unsubscribe = this.subscribe((change) => {
        if (!isNewer(change)) {
          return;
        }
        clearTimeout(timeout);
        unsubscribe();
        resolve({ change, timedOut: false });
      });
    });
  }

  private publish(change: TaskfoldChange | undefined): void {
    if (!change) {
      return;
    }
    this.latestChange = change;
    for (const listener of this.listeners) {
      try {
        listener(change);
      } catch {
        // Persistence already succeeded. Observers cannot turn it into a reported failure.
      }
    }
  }
}
