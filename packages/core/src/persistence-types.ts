// Taskfold plugin module implements persistence types behavior.
import type {
  TaskfoldAttachment,
  TaskfoldBoardMetadata,
  TaskfoldCard,
  TaskfoldMilestone,
  TaskfoldNotificationSubscription,
  TaskfoldProjectDocument,
} from "./contract/index.js";

export type PersistedTaskfoldCard = {
  version: 1;
  card: TaskfoldCard;
};

export type PersistedTaskfoldBoard = {
  version: 1;
  board: TaskfoldBoardMetadata;
};

export type PersistedTaskfoldMilestone = {
  version: 1;
  milestone: TaskfoldMilestone;
};

export type PersistedTaskfoldProjectDocument = {
  version: 1;
  document: TaskfoldProjectDocument;
};

export type PersistedTaskfoldNotificationSubscription = {
  version: 1;
  subscription: TaskfoldNotificationSubscription;
};

export type PersistedTaskfoldAttachment = {
  version: 1;
  attachment: TaskfoldAttachment;
  contentBase64: string;
};

type TaskfoldKeyedStoreBase<T> = {
  register(key: string, value: T): Promise<void>;
  lookup(key: string): Promise<T | undefined>;
  delete(key: string): Promise<boolean>;
  entries(): Promise<Array<{ key: string; value: T }>>;
  /**
   * Conditional insert: persist `value` only if no row exists for `key`, and
   * report whether it did. Backends that implement this must perform the
   * existence check and the write in one atomic unit so concurrent processes
   * racing to create the same key (for example, a deterministic id derived
   * from a session key) converge on one row instead of both winning. Optional:
   * callers fall back to an unconditional `register`.
   */
  registerIfAbsent?(key: string, value: T): Promise<boolean>;
};

/**
 * compareAndSwap 返回 `false` 的原因（需求/18 §3.4）。store 层照旧只返回 `false`、不 throw
 * （需求/16 R2），原因经可选的 `onReject` 回调带出，供需要区分的调用方（CLI 的 `LOCKED` 与
 * `CONFLICT`）使用；不关心原因的调用方（补偿循环等）行为不变。
 * - `revision`：存储里的 revision 不等于 `expectedRevision`；
 * - `missing`：没有这个 key；
 * - `lock-timeout`：等锁超时（别的进程一直占着锁）；
 * - `lock-compromised`：持锁期间锁被判 stale、被别的进程接管，本次写入已放弃；
 * - `unsupported`：该实体不支持条件写（见 {@link TaskfoldKeyedStore}）：卡片以外的实体 store
 *   都以此拒绝，不会静默穿透成一次无条件写。
 */
export type TaskfoldCompareAndSwapFailure =
  | "revision"
  | "missing"
  | "lock-timeout"
  | "lock-compromised"
  | "unsupported";

type TaskfoldCompareAndSwap<T> = {
  /**
   * Conditional write: persist `value` only if the stored row still carries
   * `expectedRevision`, and report whether it did. The check and the write must
   * be one atomic unit so concurrent processes cannot both win. A lost race --
   * including lock contention or a lock lost mid-write -- returns `false`, never
   * throws, and never writes (需求/16 R1/R2).
   *
   * `onReject`（可选）：返回 `false` 之前以失败原因调用一次。后端可以不报（SQLite 后端不报，
   * 调用方按 `revision` 处理）；包装层必须原样透传。
   */
  compareAndSwap(
    key: string,
    expectedRevision: number,
    value: T,
    onReject?: (reason: TaskfoldCompareAndSwapFailure) => void,
  ): Promise<boolean>;
};

/**
 * Keyed persistence port. `compareAndSwap` is **required on every store** (需求/16 R1,
 * 需求/18 §3.3): there is no fallback to an unconditional write any more. 卡片以外的实体
 * （boards/milestones/documents/subscriptions/attachments）没有条件写的调用方，它们的实现
 * 统一是"显式拒绝"：返回 false 并以 `onReject("unsupported")` 说明，而不是省略这个方法——
 * 这样缺 CAS 的后端（例如宿主 KV）在类型上就进不来，不用再靠 `Partial` 条件类型放行。
 *
 * （TASK-2 引入的条件类型当时是为了让 sqlite-store / doctor-contract 的写路径继续编译；
 * SQLite 运行时后端下线后（TASK-10 第二段）障碍消失，恢复无条件必选。）
 */
export type TaskfoldKeyedStore<T = PersistedTaskfoldCard> = TaskfoldKeyedStoreBase<T> &
  TaskfoldCompareAndSwap<T>;

/**
 * 只读视图：迁移工具（sqlite-migration.ts）按它读旧 SQLite 库的只读快照——只读 store
 * 不参与写入，也不参与 CAS。
 */
export type TaskfoldReadOnlyKeyedStore<T> = Pick<TaskfoldKeyedStoreBase<T>, "lookup" | "entries">;
