// Taskfold plugin module implements persistence types behavior.
import type {
  TaskfoldAttachment,
  TaskfoldBoardMetadata,
  TaskfoldCard,
  TaskfoldMilestone,
  TaskfoldNotificationSubscription,
  TaskfoldProjectDocument,
} from "../../contract/index.js";

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

export type TaskfoldKeyedStore<T = PersistedTaskfoldCard> = {
  register(key: string, value: T): Promise<void>;
  lookup(key: string): Promise<T | undefined>;
  delete(key: string): Promise<boolean>;
  entries(): Promise<Array<{ key: string; value: T }>>;
  /**
   * Conditional write: persist `value` only if the stored row still carries
   * `expectedRevision`, and report whether it did. Backends that implement this
   * must perform the check and the write in one atomic unit so concurrent
   * processes cannot both win. Optional: callers fall back to a
   * read-compare-write guarded only by the in-process mutation queue.
   */
  compareAndSwap?(key: string, expectedRevision: number, value: T): Promise<boolean>;
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
