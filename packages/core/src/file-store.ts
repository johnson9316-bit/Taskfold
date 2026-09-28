// Taskfold plugin module: the file-backed storage skeleton for 需求/16-文件存储改造.md
// 第 1 期. `createTaskfoldFileStores()` is the drop-in, same-shape replacement for
// sqlite-store.ts's `createTaskfoldSqliteStores()` -- see store.ts's
// `TaskfoldStore.fromSqliteStores`, the single wiring point both backends plug into.
//
// Scope note for whoever wires this into production (needs to touch store.ts /
// store-projects.ts / gateway.ts, all out of bounds for this change): this factory takes
// an already-resolved `dataDir` (one project's `.taskfold/` root) and, for OpenClaw only,
// `pluginDir`. It
// does not itself pick which project's directory to use for a given board/card -- that
// per-project routing, plus swapping `resolveTaskfoldDataDir`'s workspace-based
// resolution (file-store-paths.ts) into wherever a project's `defaultWorkspace` is read
// today, belongs to the later "切生产路径" milestone (需求/16 第八节 第 3 期), not to this
// storage skeleton.
import path from "node:path";
import type {
  PersistedTaskfoldBoard,
  PersistedTaskfoldNotificationSubscription,
  TaskfoldCompareAndSwapFailure,
  TaskfoldKeyedStore,
} from "./persistence-types.js";
import {
  ensureTaskfoldDataDirectories,
  ensureTaskfoldPluginDirectories,
  resolveTaskfoldDataDir,
  resolveTaskfoldFileStoreLayout,
  type TaskfoldFileStoreLayout,
} from "./file-store-paths.js";
import { resolveTaskfoldMainCheckoutPath } from "./file-store-path-resolver.js";
import {
  assertTaskfoldFormatWritable,
  ensureTaskfoldFormatVersion,
  isTaskfoldFormatWritable,
} from "./file-store-format.js";
import {
  createTaskfoldFileChangeSource,
  ensureFileChangeEpoch,
  reserveFileChangeRevisions,
} from "./file-store-change-cursor.js";
import { createTaskfoldExternalChangeReconciler } from "./file-store-reconcile.js";
import {
  createMarkdownCardCodec,
  createMarkdownMilestoneCodec,
  type TaskfoldCardCodec,
  type TaskfoldMilestoneCodec,
} from "./file-store-codec.js";
import { createTaskfoldFileCardStore } from "./file-store-cards.js";
import { withProjectPaths } from "./file-store-project-paths.js";
import { unsupportedTaskfoldCompareAndSwap } from "./file-store-cas.js";
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
export { allocateNextTaskfoldCardId } from "./file-store-card-id.js";

export { resolveTaskfoldMainCheckoutPath } from "./file-store-path-resolver.js";
export { TaskfoldFormatTooNewError, TASKFOLD_FORMAT_VERSION } from "./file-store-format.js";

export type TaskfoldFileStoresOptions = {
  /** One project's `.taskfold/` root, e.g. `resolveTaskfoldDataDir(board.defaultWorkspace)`.
   * 可以是某个 git worktree 里的路径：工厂会经 PathResolver 改到主 checkout 的同一位置
   * （需求/18 §3.6，file-store-path-resolver.ts），worktree 里那份副本不读不写。 */
  dataDir: string;
  /** 宿主的插件级目录，e.g. `resolveTaskfoldPluginDir(stateDir)`，只放项目注册表与通知订阅。
   * 由调用方注入，core 不再自行解析宿主的 state 目录。
   * 可选：只有 OpenClaw 有项目注册表与通知订阅（需求/18 §3.8）。CLI、VS Code 等不传，此时
   * `boards`/`subscriptions` 是本进程内存里的空 store（见 {@link createProcessLocalStore}），
   * `.taskfold/` 之外一个文件都不碰。 */
  pluginDir?: string;
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
  const layout: TaskfoldFileStoreLayout = resolveTaskfoldFileStoreLayout({
    dataDir: resolveTaskfoldMainCheckoutPath(options.dataDir),
    ...(options.pluginDir === undefined ? {} : { pluginDir: options.pluginDir }),
  });
  const projectRoot = path.basename(layout.dataDir) === ".taskfold"
    ? path.dirname(layout.dataDir)
    : layout.dataDir;
  // 需求/18 §3.9：格式版本高于本版 core 时只读不写——不初始化 `.taskfold/`，写入一律拒绝。
  // 每次写入前都重读 config.yml，运行期间被别的进程升级了格式也能拦住。
  const canWrite = () => isTaskfoldFormatWritable(layout.configPath);
  const assertWritable = () => assertTaskfoldFormatWritable(layout.configPath);
  const writableAtOpen = canWrite();
  if (writableAtOpen) {
    ensureTaskfoldDataDirectories(layout);
    ensureTaskfoldFormatVersion(layout.configPath);
  }
  ensureTaskfoldPluginDirectories(layout);

  const cardCodec = withProjectPaths(options.cardCodec ?? createMarkdownCardCodec(), projectRoot);
  const milestoneCodec = options.milestoneCodec ?? createMarkdownMilestoneCodec();

  // 需求/16 R4：既是"要不要广播一下"的目录级 mtime 信号，也是"外部改动过后重盖
  // revision"的探测器与执行者（file-store-reconcile.ts）。只盯 cards 目录：这里正是
  // R4 收窄后的两类外部写入者（人手编辑 .md 文件、`git checkout`/`git pull` 批量换文件）
  // 真正落地的地方。
  const externalChangeReconciler = createTaskfoldExternalChangeReconciler({
    cardsDir: layout.cardsDir,
    runtimeCardsDir: layout.runtimeCardsDir,
    locksDir: layout.locksDir,
    codec: cardCodec,
    canWrite,
  });

  const cards = rejectWritesUnlessFormatWritable(assertWritable, createTaskfoldFileCardStore({
    cardsDir: layout.cardsDir,
    archiveCardsDir: layout.archiveCardsDir,
    attachmentsDir: layout.attachmentsDir,
    codec: cardCodec,
    locksDir: layout.locksDir,
    runtimeCardsDir: layout.runtimeCardsDir,
  }));
  // 项目注册表与通知订阅在宿主的插件目录里，不归 `.taskfold/` 的格式版本管。
  const boards =
    layout.projectsJsonPath === undefined
      ? createProcessLocalStore<PersistedTaskfoldBoard>()
      : createTaskfoldFileBoardStore({ projectsJsonPath: layout.projectsJsonPath });
  const milestones = rejectWritesUnlessFormatWritable(assertWritable, createTaskfoldFileMilestoneStore({
    milestonesDir: layout.milestonesDir,
    configPath: layout.configPath,
    codec: milestoneCodec,
    locksDir: layout.locksDir,
  }));
  const documents = rejectWritesUnlessFormatWritable(
    assertWritable,
    createTaskfoldFileDocumentStore({ documentsDir: layout.documentsDir, projectRoot }),
  );
  const subscriptions =
    layout.subscriptionsDir === undefined
      ? createProcessLocalStore<PersistedTaskfoldNotificationSubscription>()
      : createTaskfoldFileSubscriptionStore({ subscriptionsDir: layout.subscriptionsDir });
  const attachments = rejectWritesUnlessFormatWritable(assertWritable, createTaskfoldFileAttachmentStore({
    attachmentsDir: layout.attachmentsDir,
    cardsDir: layout.cardsDir,
    cardCodec,
  }));

  // `changeEpoch` is a value, not a function: evaluated once, right here, at factory
  // construction time -- see file-store-change-cursor.ts's `ensureFileChangeEpoch` for
  // why it must be scoped to the log file rather than generated per process.
  // 与 `reserveChangeRevisions` 一起只为与 createTaskfoldSqliteStores 同形状而保留；
  // store 实际由下面的 `changeSource` 驱动（TaskfoldCoreStore 优先用它）。
  const changeEpoch = ensureFileChangeEpoch(layout.changesLogPath, layout.locksDir, writableAtOpen);
  const changeSource = createTaskfoldFileChangeSource({
    changesLogPath: layout.changesLogPath,
    locksDir: layout.locksDir,
    dataVersion: externalChangeReconciler.dataVersion,
    canWrite,
  });

  return {
    cards,
    boards,
    milestones,
    documents,
    subscriptions,
    attachments,
    dataVersion: externalChangeReconciler.dataVersion,
    changeEpoch,
    reserveChangeRevisions: (count: number) => {
      assertWritable();
      return reserveFileChangeRevisions(layout.changesLogPath, count, layout.locksDir);
    },
    changeSource,
    // Nothing to release: this backend holds no open file descriptors or watchers
    // between calls (every read/write in this skeleton opens and closes its own fd).
    // Kept for shape parity with createTaskfoldSqliteStores, and as the seam a future
    // fs.watch-based R3/R4 detector would close.
    close: () => {},
  };
}

/**
 * 没注入 `pluginDir` 时的项目注册表 / 通知订阅：只活在本进程内存里，起始为空。
 * 这两样只有 OpenClaw 真正需要（需求/18 §3.8）；业务层仍会顺手写它们（新建卡片时
 * `ensureBoardDirect` 给没登记过的 board 补一条骨架记录），写进内存即可——骨架随时能重建，
 * 看板归属本身记在卡片的 `metadata.automation.boardId` 上，不依赖注册表。
 */
function createProcessLocalStore<T>(): TaskfoldKeyedStore<T> {
  const values = new Map<string, T>();
  return {
    register: async (key, value) => {
      values.set(key, structuredClone(value));
    },
    lookup: async (key) => {
      const value = values.get(key);
      return value === undefined ? undefined : structuredClone(value);
    },
    delete: async (key) => values.delete(key),
    entries: async () => [...values].map(([key, value]) => ({ key, value: structuredClone(value) })),
    // 没有条件写的调用方；显式拒绝（file-store-cas.ts），绝不静默穿透成无条件写。
    compareAndSwap: unsupportedTaskfoldCompareAndSwap,
  };
}

/** 包一层：每个会改动 `.taskfold/` 的方法先确认格式版本可写（需求/18 §3.9），读方法原样透传。
 * CAS 是所有 store 的必选方法（persistence-types.ts），无条件透传；`registerIfAbsent` 仍是
 * 可选方法，原来有才有，条件展开保留。 */
function rejectWritesUnlessFormatWritable<T>(
  assertWritable: () => void,
  store: TaskfoldKeyedStore<T>,
): TaskfoldKeyedStore<T> {
  return {
    register: async (key, value) => {
      assertWritable();
      await store.register(key, value);
    },
    lookup: async (key) => await store.lookup(key),
    delete: async (key) => {
      assertWritable();
      return await store.delete(key);
    },
    entries: async () => await store.entries(),
    compareAndSwap: async (
      key: string,
      expectedRevision: number,
      value: T,
      onReject?: (reason: TaskfoldCompareAndSwapFailure) => void,
    ) => {
      assertWritable();
      return await store.compareAndSwap(key, expectedRevision, value, onReject);
    },
    ...(store.registerIfAbsent
      ? {
          registerIfAbsent: async (key: string, value: T) => {
            assertWritable();
            return await store.registerIfAbsent!(key, value);
          },
        }
      : {}),
  };
}
