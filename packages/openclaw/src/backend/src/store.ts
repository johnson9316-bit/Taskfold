// Taskfold plugin module implements store behavior.
// TASK-6：卡片的业务方法（dispatch、bulkUpdate、archive、diagnostics 等）已搬进 core 的
// store-dispatch.ts；这里只剩把各存储后端接到 core store 上的工厂方法。
import type {
  PersistedTaskfoldAttachment,
  PersistedTaskfoldBoard,
  PersistedTaskfoldMilestone,
  PersistedTaskfoldNotificationSubscription,
  PersistedTaskfoldProjectDocument,
  TaskfoldKeyedStore,
} from "@taskfold/core/persistence-types.js";
import { TaskfoldDispatchStore } from "@taskfold/core/store-dispatch.js";
import type { TaskfoldChangeSource } from "@taskfold/core/store-change-tracker.js";

export type { TaskfoldDispatchResult } from "@taskfold/core/store-inputs.js";

/**
 * Shape every storage backend factory must return to plug into {@link TaskfoldStore}.
 * 生产唯一后端是 core 的 `createTaskfoldFileStores`（需求/16 第 3 期；SQLite 运行时后端已于
 * TASK-10 第二段下线，只读 SQLite 只剩迁移工具 sqlite-migration.ts 在用）；测试还用内存
 * store 走同一条接线。类型按结构匹配，工厂不需要 import 它。
 *
 * `dataVersion`/`changeEpoch`/`reserveChangeRevisions` 是 SQLite 时代的按块预留游标形状，
 * 文件后端用 `changeSource` 驱动（需求/18 §3.5）；保留是为了内存 store 等仍按块预留的实现
 * 不必为形状差异分叉。
 */
export type TaskfoldBackendStores = {
  cards: TaskfoldKeyedStore;
  boards: TaskfoldKeyedStore<PersistedTaskfoldBoard>;
  milestones: TaskfoldKeyedStore<PersistedTaskfoldMilestone>;
  documents: TaskfoldKeyedStore<PersistedTaskfoldProjectDocument>;
  subscriptions: TaskfoldKeyedStore<PersistedTaskfoldNotificationSubscription>;
  attachments: TaskfoldKeyedStore<PersistedTaskfoldAttachment>;
  dataVersion?: () => number;
  changeEpoch?: string;
  reserveChangeRevisions?: (count: number) => number;
  /** 文件后端给出（跨进程靠 `.taskfold/.runtime/changes.log`），有它时上面三项不再驱动变更游标。 */
  changeSource?: TaskfoldChangeSource;
  /**
   * ⚠️ Present for shape parity with the factories' return values, but neither
   * `fromStores` nor anything else ever calls it -- a known, already-recorded
   * gap (需求/15-上游2026.9.4差异评估), not something this change fixes: the production
   * path has no way to flush/close a backend on process exit. Out of scope here.
   */
  close?: () => void;
};

// Capability layers split review boundaries only; the core still owns persistence and mutation order.
export class TaskfoldStore extends TaskfoldDispatchStore {
  /**
   * Single wiring point from any backend factory's KV stores to a card store --
   * `createTaskfoldFileStores`（生产唯一后端）与测试用的内存 store 都按
   * {@link TaskfoldBackendStores} 结构匹配，彼此不依赖。
   */
  static fromStores(stores: TaskfoldBackendStores) {
    return new TaskfoldStore(stores.cards, {
      boards: stores.boards,
      milestones: stores.milestones,
      documents: stores.documents,
      subscriptions: stores.subscriptions,
      attachments: stores.attachments,
      dataVersion: stores.dataVersion,
      changeEpoch: stores.changeEpoch,
      reserveChangeRevisions: stores.reserveChangeRevisions,
      changeSource: stores.changeSource,
    });
  }
}
