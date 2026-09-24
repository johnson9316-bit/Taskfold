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
import { createTaskfoldSqliteStores } from "./sqlite-store.js";
import { TaskfoldDispatchStore } from "@taskfold/core/store-dispatch.js";
import type { TaskfoldChangeSource } from "@taskfold/core/store-change-tracker.js";

export type { TaskfoldDispatchResult } from "@taskfold/core/store-inputs.js";

/**
 * Shape every storage backend factory must return to plug into {@link TaskfoldStore}.
 * `createTaskfoldSqliteStores` (sqlite-store.ts) and `createTaskfoldFileStores`
 * (file-store.ts) both satisfy this structurally -- neither needs to import it, since
 * this is the "single wiring point" 需求/16 集成任务书 refers to, not a base class either
 * backend extends. Extracted from what `fromSqliteStores` below always destructured out
 * of `createTaskfoldSqliteStores`'s return value, so `fromStores` can accept either
 * backend without depending on SQLite.
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
  /** 文件后端给出（跨进程靠 `.taskfold/.runtime/changes.log`），有它时上面三项不再驱动变更游标；
   * SQLite 后端不给，行为不变。 */
  changeSource?: TaskfoldChangeSource;
  /**
   * ⚠️ Present for shape parity with both factories' return values, but neither
   * `fromStores` below nor `fromSqliteStores` ever calls it -- a known, already-recorded
   * gap (需求/15-上游2026.9.4差异评估), not something this change fixes: the production
   * path has no way to flush/close a backend on process exit. Out of scope here.
   */
  close?: () => void;
};

// Capability layers split review boundaries only; the core still owns persistence and mutation order.
export class TaskfoldStore extends TaskfoldDispatchStore {
  static openSqlite() {
    return TaskfoldStore.fromSqliteStores(createTaskfoldSqliteStores());
  }

  /**
   * Single wiring point from any backend factory's KV stores to a card store --
   * `createTaskfoldSqliteStores` and `createTaskfoldFileStores` both satisfy
   * {@link TaskfoldBackendStores} structurally, despite neither depending on the other.
   * `fromSqliteStores` below is kept only for backward compatibility with its existing
   * call sites (production's `openSqlite`, and every test that already names it) and
   * now just delegates here.
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

  /**
   * Tests use this too (as well as `fromStores` directly for the file backend), so a
   * newly added capability cannot be silently missing under test only.
   */
  static fromSqliteStores(stores: ReturnType<typeof createTaskfoldSqliteStores>) {
    return TaskfoldStore.fromStores(stores);
  }
}
