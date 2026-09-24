// Taskfold plugin module: the file-backed storage skeleton for 需求/16-文件存储改造.md
// 第 1 期. `createTaskfoldFileStores()` is the drop-in, same-shape replacement for
// sqlite-store.ts's `createTaskfoldSqliteStores()` -- see store.ts's
// `TaskfoldStore.fromSqliteStores`, the single wiring point both backends plug into.
//
// Scope note for whoever wires this into production (needs to touch store.ts /
// store-projects.ts / gateway.ts, all out of bounds for this change): this factory takes
// an already-resolved `dataDir` (one project's `.taskfold/` root) and `pluginDir`. It
// does not itself pick which project's directory to use for a given board/card -- that
// per-project routing, plus swapping `resolveTaskfoldDataDir`'s workspace-based
// resolution (file-store-paths.ts) into wherever a project's `defaultWorkspace` is read
// today, belongs to the later "切生产路径" milestone (需求/16 第八节 第 3 期), not to this
// storage skeleton.
import {
  ensureTaskfoldFileStoreDirectories,
  resolveTaskfoldDataDir,
  resolveTaskfoldFileStoreLayout,
  type TaskfoldFileStoreLayout,
} from "./file-store-paths.js";
import { ensureFileChangeEpoch, reserveFileChangeRevisions } from "./file-store-change-cursor.js";
import { createTaskfoldExternalChangeReconciler } from "./file-store-reconcile.js";
import {
  createMarkdownCardCodec,
  createMarkdownMilestoneCodec,
  type TaskfoldCardCodec,
  type TaskfoldMilestoneCodec,
} from "./file-store-codec.js";
import { createTaskfoldFileCardStore } from "./file-store-cards.js";
import { createTaskfoldFileMilestoneStore } from "./file-store-milestones.js";
import { createTaskfoldFileDocumentStore } from "./file-store-documents.js";
import { createTaskfoldFileSubscriptionStore } from "./file-store-subscriptions.js";
import { createTaskfoldFileAttachmentStore } from "./file-store-attachments.js";
import { createTaskfoldFileBoardStore } from "./file-store-boards.js";

export type { TaskfoldCardCodec, TaskfoldMilestoneCodec } from "./file-store-codec.js";
export {
  resolveTaskfoldDataDir,
  resolveTaskfoldFileStoreLayout,
  resolveTaskfoldPluginDir,
} from "./file-store-paths.js";
export { allocateNextTaskfoldCardId, allocateNextTaskfoldMilestoneId } from "./file-store-card-id.js";

export type TaskfoldFileStoresOptions = {
  /** One project's `.taskfold/` root, e.g. `resolveTaskfoldDataDir(board.defaultWorkspace)`. */
  dataDir: string;
  /** `~/.openclaw/plugins/taskfold`, e.g. `resolveTaskfoldPluginDir(stateDir)`. 由调用方注入，
   * core 不再自行解析宿主的 state 目录。 */
  pluginDir: string;
  /**
   * Defaults to the real Markdown+frontmatter codec (file-store-codec.ts's
   * `createMarkdownCardCodec`). Override only for a test that deliberately wants a
   * different (e.g. the lightweight JSON placeholder) codec.
   */
  cardCodec?: TaskfoldCardCodec;
  /** Same default as `cardCodec`, see `createMarkdownMilestoneCodec`. */
  milestoneCodec?: TaskfoldMilestoneCodec;
};

/** Mirrors sqlite-store.ts's (unexported) `TaskfoldSqliteStores` return shape exactly,
 * so `ReturnType<typeof createTaskfoldFileStores>` is interchangeable with
 * `ReturnType<typeof createTaskfoldSqliteStores>` at every call site that matters --
 * chiefly store.ts's `TaskfoldStore.fromSqliteStores`. */
export function createTaskfoldFileStores(options: TaskfoldFileStoresOptions) {
  const pluginDir = options.pluginDir;
  const layout: TaskfoldFileStoreLayout = resolveTaskfoldFileStoreLayout({
    dataDir: options.dataDir,
    pluginDir,
  });
  ensureTaskfoldFileStoreDirectories(layout);

  const cardCodec = options.cardCodec ?? createMarkdownCardCodec();
  const milestoneCodec = options.milestoneCodec ?? createMarkdownMilestoneCodec();

  // 需求/16 R4：既是"要不要广播一下"的目录级 mtime 信号，也是"外部改动过后重盖
  // revision"的探测器与执行者（file-store-reconcile.ts）。只盯 cards 目录：这里正是
  // R4 收窄后的两类外部写入者（人手编辑 .md 文件、`git checkout`/`git pull` 批量换文件）
  // 真正落地的地方。
  const externalChangeReconciler = createTaskfoldExternalChangeReconciler({
    cardsDir: layout.cardsDir,
    codec: cardCodec,
  });

  const cards = createTaskfoldFileCardStore({
    cardsDir: layout.cardsDir,
    archiveCardsDir: layout.archiveCardsDir,
    attachmentsDir: layout.attachmentsDir,
    codec: cardCodec,
    onWrite: externalChangeReconciler.noteOwnWrite,
  });
  const boards = createTaskfoldFileBoardStore({ projectsJsonPath: layout.projectsJsonPath });
  const milestones = createTaskfoldFileMilestoneStore({
    milestonesDir: layout.milestonesDir,
    codec: milestoneCodec,
  });
  const documents = createTaskfoldFileDocumentStore({ documentsDir: layout.documentsDir });
  const subscriptions = createTaskfoldFileSubscriptionStore({
    subscriptionsDir: layout.subscriptionsDir,
  });
  const attachments = createTaskfoldFileAttachmentStore({
    attachmentsDir: layout.attachmentsDir,
    cardsDir: layout.cardsDir,
    cardCodec,
  });

  // `changeEpoch` is a value, not a function: evaluated once, right here, at factory
  // construction time -- see file-store-change-cursor.ts's `ensureFileChangeEpoch` for
  // why it must be scoped to the log file rather than generated per process.
  const changeEpoch = ensureFileChangeEpoch(layout.changesLogPath);

  return {
    cards,
    boards,
    milestones,
    documents,
    subscriptions,
    attachments,
    dataVersion: externalChangeReconciler.dataVersion,
    changeEpoch,
    reserveChangeRevisions: (count: number) => reserveFileChangeRevisions(layout.changesLogPath, count),
    // Nothing to release: this backend holds no open file descriptors or watchers
    // between calls (every read/write in this skeleton opens and closes its own fd).
    // Kept for shape parity with createTaskfoldSqliteStores, and as the seam a future
    // fs.watch-based R3/R4 detector would close.
    close: () => {},
  };
}
