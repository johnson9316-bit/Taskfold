// Taskfold 适配层：多项目路由的组合 store（TASK-10）。
//
// core 的文件后端（createTaskfoldFileStores）一个实例只管一个项目的数据根，而 Gateway 里所有工具、
// 网关方法、调度、reconciler 都只吃一个 TaskfoldStore。这里把各项目的文件 store 组合成一套
// TaskfoldBackendStores，上层照旧只有一个 TaskfoldStore：
//
// - 项目注册表 `<pluginDir>/projects.json`（boards）与通知订阅 `<pluginDir>/subscriptions/` 只有一份
//   （需求/18 §3.8）。
// - 卡片、里程碑、文档按所属 boardId 路由到该项目的数据根：项目的 defaultWorkspace 是 dir/worktree
//   时，是仓库**主 checkout** 的 `.taskfold/`（经 core 的 PathResolver，需求/18 §3.6）；没绑仓库的
//   项目（default、fb-probe 这类），是 `<pluginDir>/projects/<boardId>/`（非 git 目录，PathResolver
//   原样回退）。附件跟着它所属的卡片走。
// - 数据根只在已经存在时才打开；零数据的项目第一次写入时才建目录（不在别人的仓库里预先建 `.taskfold/`）。
// - 已有的实体原地写回它所在的数据根；只有 boardId 变了（跨项目移卡）才换数据根：**先写新项目、
//   再删旧项目**。新项目写失败则整个写入失败、旧副本原样保留；旧副本删不掉则告警、保留两份——
//   同一个 key 出现在多个数据根时，读取一律取 revision 最高的那份（同 revision 取它 boardId 对应
//   的数据根里那份），并告警写出各份的位置，卡片不会两边都没有。
// - 变更游标由 change-aggregator.ts 的聚合 ChangeSource 驱动：写入时标记写到的项目，只在这些
//   项目的 changes.log 里记一笔；轮询所有已打开项目的 changes.log，并发现新出现的数据根。
import fs from "node:fs";
import path from "node:path";
import type { TaskfoldBoardMetadata, TaskfoldCard } from "@taskfold/core/contract/index.js";
import { readBufferIfExists, writeFileAtomic } from "@taskfold/core/file-store-atomic.js";
import { createTaskfoldFileBoardStore } from "@taskfold/core/file-store-boards.js";
import {
  createTaskfoldFileStores,
  resolveTaskfoldDataDir,
  resolveTaskfoldMainCheckoutPath,
} from "@taskfold/core/file-store.js";
import { ensureTaskfoldPluginDirectories, resolveTaskfoldFileStoreLayout } from "@taskfold/core/file-store-paths.js";
import { createTaskfoldFileSubscriptionStore } from "@taskfold/core/file-store-subscriptions.js";
import type {
  PersistedTaskfoldAttachment,
  PersistedTaskfoldBoard,
  PersistedTaskfoldCard,
  PersistedTaskfoldMilestone,
  PersistedTaskfoldNotificationSubscription,
  PersistedTaskfoldProjectDocument,
  TaskfoldCompareAndSwapFailure,
  TaskfoldKeyedStore,
} from "@taskfold/core/persistence-types.js";
import { TaskfoldAggregatedChangeSource } from "./change-aggregator.js";
import type { TaskfoldBackendStores } from "./store.js";

type FileStores = ReturnType<typeof createTaskfoldFileStores>;

type ProjectRoot = {
  /** 已经过 PathResolver 的数据根（`<主 checkout>/.taskfold` 或 `<pluginDir>/projects/<boardId>`）。 */
  dataDir: string;
  attachmentsDir: string;
  stores: FileStores;
};

type Located<T> = { root: ProjectRoot; value: T };

type EntitySpec<T> = {
  label: string;
  pick: (stores: FileStores) => TaskfoldKeyedStore<T>;
  boardOf: (value: T) => string;
  revisionOf?: (value: T) => number;
};

/** 数据根目录名：`<pluginDir>/projects/` 下只认合法的 board id（迁移用的临时目录以 `.` 开头，不算）。 */
const BOARD_DIR_NAME = /^[a-z0-9][a-z0-9._-]{0,79}$/;

/** `<pluginDir>/projects/<boardId>/`：没绑仓库的项目的数据根。 */
export function taskfoldPluginProjectDataDir(pluginDir: string, boardId: string): string {
  return path.join(pluginDir, "projects", boardId);
}

/** 项目的数据根（未经 PathResolver）：绑了仓库是 `<仓库>/.taskfold`，否则在插件目录下。 */
export function taskfoldProjectDataDir(
  pluginDir: string,
  boardId: string,
  board: TaskfoldBoardMetadata | undefined,
): string {
  const workspace = board?.defaultWorkspace;
  if (
    workspace &&
    (workspace.kind === "dir" || workspace.kind === "worktree") &&
    (workspace.sourcePath ?? workspace.path)
  ) {
    return resolveTaskfoldDataDir(workspace);
  }
  return taskfoldPluginProjectDataDir(pluginDir, boardId);
}

function isDirectory(target: string): boolean {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

function listDirectoryNames(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function cardBoardId(value: PersistedTaskfoldCard): string {
  return value.card.metadata?.automation?.boardId ?? "default";
}

export function createTaskfoldProjectRoutedStores(options: {
  /** `resolveTaskfoldPluginDir(stateDir)`，即 `~/.openclaw/plugins/taskfold`。 */
  pluginDir: string;
  /** 同一实体出现在多个数据根、旧副本删不掉等需要人看一眼的情况。 */
  warn?: (message: string) => void;
}): TaskfoldBackendStores & { changeSource: TaskfoldAggregatedChangeSource } {
  const pluginDir = path.resolve(options.pluginDir);
  const warn = options.warn ?? ((message: string) => console.warn(message));
  const projectsRootDir = path.join(pluginDir, "projects");
  const pluginLayout = resolveTaskfoldFileStoreLayout({ dataDir: projectsRootDir, pluginDir });
  const ensurePluginDir = () => ensureTaskfoldPluginDirectories(pluginLayout);

  const rawBoards = createTaskfoldFileBoardStore({ projectsJsonPath: pluginLayout.projectsJsonPath! });
  const rawSubscriptions = createTaskfoldFileSubscriptionStore({ subscriptionsDir: pluginLayout.subscriptionsDir! });

  const roots = new Map<string, ProjectRoot>();
  const mainCheckoutCache = new Map<string, string>();
  const warned = new Set<string>();
  const changeSource = new TaskfoldAggregatedChangeSource(discoverRoots, warn);

  function mainCheckout(dataDir: string): string {
    let resolved = mainCheckoutCache.get(dataDir);
    if (resolved === undefined) {
      resolved = resolveTaskfoldMainCheckoutPath(dataDir);
      mainCheckoutCache.set(dataDir, resolved);
    }
    return resolved;
  }

  async function dataDirForBoardId(boardId: string): Promise<string> {
    const board = await rawBoards.lookup(boardId);
    return mainCheckout(taskfoldProjectDataDir(pluginDir, boardId, board?.version === 1 ? board.board : undefined));
  }

  async function knownDataDirs(): Promise<string[]> {
    const dirs = new Set<string>(roots.keys());
    for (const { value } of await rawBoards.entries()) {
      if (value?.version === 1 && value.board?.id) {
        dirs.add(mainCheckout(taskfoldProjectDataDir(pluginDir, value.board.id, value.board)));
      }
    }
    for (const name of listDirectoryNames(projectsRootDir)) {
      if (BOARD_DIR_NAME.test(name)) {
        dirs.add(path.join(projectsRootDir, name));
      }
    }
    return [...dirs];
  }

  /** 打开一个数据根；`create` 为 false 时目录不存在就不打开（读路径不建目录）。 */
  function openRoot(dataDir: string, create: boolean): ProjectRoot | undefined {
    const existing = roots.get(dataDir);
    if (existing) {
      return existing;
    }
    if (!create && !isDirectory(dataDir)) {
      return undefined;
    }
    if (dataDir.startsWith(`${projectsRootDir}${path.sep}`)) {
      ensurePluginDir();
    }
    // 不传 pluginDir：各项目自己的 boards/subscriptions 用不上（注册表与订阅只有上面那一份）。
    const stores = createTaskfoldFileStores({ dataDir });
    const root: ProjectRoot = {
      dataDir,
      attachmentsDir: resolveTaskfoldFileStoreLayout({ dataDir }).attachmentsDir,
      stores,
    };
    roots.set(dataDir, root);
    changeSource.addProject(stores.changeSource);
    return root;
  }

  async function openRoots(): Promise<ProjectRoot[]> {
    for (const dataDir of await knownDataDirs()) {
      openRoot(dataDir, false);
    }
    return [...roots.values()];
  }

  async function discoverRoots(): Promise<boolean> {
    let opened = false;
    for (const dataDir of await knownDataDirs()) {
      if (!roots.has(dataDir) && openRoot(dataDir, false)) {
        opened = true;
      }
    }
    return opened;
  }

  async function targetRoot(boardId: string): Promise<ProjectRoot> {
    return openRoot(await dataDirForBoardId(boardId), true)!;
  }

  function markDirty(root: ProjectRoot): void {
    changeSource.markDirty(root.stores.changeSource);
  }

  async function locate<T>(spec: EntitySpec<T>, key: string): Promise<Array<Located<T>>> {
    const found: Array<Located<T>> = [];
    for (const root of await openRoots()) {
      const value = await spec.pick(root.stores).lookup(key);
      if (value !== undefined) {
        found.push({ root, value });
      }
    }
    return found;
  }

  /** 同一个 key 出现在多个数据根时取哪一份：revision 高的优先，其次是它 boardId 对应的数据根里那份。 */
  async function choose<T>(spec: EntitySpec<T>, key: string, found: Array<Located<T>>): Promise<Located<T>> {
    if (found.length === 1) {
      return found[0]!;
    }
    const scored = await Promise.all(
      found.map(async (candidate, index) => ({
        candidate,
        index,
        revision: spec.revisionOf?.(candidate.value) ?? 0,
        home: (await dataDirForBoardId(spec.boardOf(candidate.value))) === candidate.root.dataDir,
      })),
    );
    scored.sort((a, b) => b.revision - a.revision || Number(b.home) - Number(a.home) || a.index - b.index);
    const chosen = scored[0]!.candidate;
    const places = scored
      .map(({ candidate, revision }) => `${candidate.root.dataDir}${spec.revisionOf ? ` (revision ${revision})` : ""}`)
      .join(", ");
    const signature = `${spec.label}:${key}:${places}`;
    if (!warned.has(signature)) {
      warned.add(signature);
      warn(
        `taskfold: ${spec.label} ${key} exists in ${found.length} project data roots: ${places}; ` +
          `using the copy in ${chosen.root.dataDir}. Remove the other copy once you have checked it.`,
      );
    }
    return chosen;
  }

  /** 新位置写成功之后，删掉其余数据根里的旧副本；删不掉只告警（读取时按 {@link choose} 取新的一份）。 */
  async function removeOtherCopies<T>(
    spec: EntitySpec<T>,
    key: string,
    found: Array<Located<T>>,
    keep: ProjectRoot,
  ): Promise<void> {
    for (const { root } of found) {
      if (root === keep) {
        continue;
      }
      try {
        if (await spec.pick(root.stores).delete(key)) {
          markDirty(root);
        }
      } catch (error) {
        warn(
          `taskfold: ${spec.label} ${key} was written to ${keep.dataDir}, but its old copy in ${root.dataDir} ` +
            `could not be removed (${String(error)}); both copies exist until it is removed by hand.`,
        );
      }
    }
  }

  /** 跨项目移卡：附件 blob 先复制到新数据根（旧副本删除时会连同 blob 一起删）。 */
  function copyAttachmentBlobs(card: TaskfoldCard, from: ProjectRoot, to: ProjectRoot): void {
    for (const attachment of card.metadata?.attachments ?? []) {
      const target = path.join(to.attachmentsDir, attachment.id);
      const content = readBufferIfExists(path.join(from.attachmentsDir, attachment.id));
      if (content !== undefined && !fs.existsSync(target)) {
        writeFileAtomic(target, content);
      }
    }
  }

  /** 写入落在哪个数据根：已有的实体留在原处，boardId 变了才换到新项目的数据根。 */
  async function writeTarget<T>(
    spec: EntitySpec<T>,
    current: Located<T> | undefined,
    value: T,
  ): Promise<ProjectRoot> {
    if (current && spec.boardOf(current.value) === spec.boardOf(value)) {
      return current.root;
    }
    return await targetRoot(spec.boardOf(value));
  }

  function routedEntityStore<T>(spec: EntitySpec<T>): TaskfoldKeyedStore<T> {
    return {
      async register(key, value) {
        const found = await locate(spec, key);
        const current = found.length > 0 ? await choose(spec, key, found) : undefined;
        const target = await writeTarget(spec, current, value);
        await spec.pick(target.stores).register(key, value);
        markDirty(target);
        await removeOtherCopies(spec, key, found, target);
      },
      async lookup(key) {
        const found = await locate(spec, key);
        return found.length > 0 ? (await choose(spec, key, found)).value : undefined;
      },
      async delete(key) {
        let deleted = false;
        for (const { root } of await locate(spec, key)) {
          if (await spec.pick(root.stores).delete(key)) {
            deleted = true;
            markDirty(root);
          }
        }
        return deleted;
      },
      async entries() {
        const byKey = new Map<string, Array<Located<T>>>();
        for (const root of await openRoots()) {
          for (const { key, value } of await spec.pick(root.stores).entries()) {
            const list = byKey.get(key) ?? [];
            list.push({ root, value });
            byKey.set(key, list);
          }
        }
        const result: Array<{ key: string; value: T }> = [];
        for (const [key, found] of byKey) {
          result.push({ key, value: (await choose(spec, key, found)).value });
        }
        return result;
      },
    } as TaskfoldKeyedStore<T>;
  }

  const cardSpec: EntitySpec<PersistedTaskfoldCard> = {
    label: "card",
    pick: (stores) => stores.cards,
    boardOf: cardBoardId,
    revisionOf: (value) => value.card.revision,
  };
  const routedCards = routedEntityStore(cardSpec);

  const cards: TaskfoldKeyedStore<PersistedTaskfoldCard> = {
    ...routedCards,
    async register(key, value) {
      const found = await locate(cardSpec, key);
      const current = found.length > 0 ? await choose(cardSpec, key, found) : undefined;
      const target = await writeTarget(cardSpec, current, value);
      if (current && target !== current.root) {
        copyAttachmentBlobs(value.card, current.root, target);
      }
      await target.stores.cards.register(key, value);
      markDirty(target);
      await removeOtherCopies(cardSpec, key, found, target);
    },
    async compareAndSwap(
      key: string,
      expectedRevision: number,
      value: PersistedTaskfoldCard,
      onReject?: (reason: TaskfoldCompareAndSwapFailure) => void,
    ) {
      const found = await locate(cardSpec, key);
      if (found.length === 0) {
        onReject?.("missing");
        return false;
      }
      const current = await choose(cardSpec, key, found);
      const target = await writeTarget(cardSpec, current, value);
      if (target === current.root) {
        const swapped = await current.root.stores.cards.compareAndSwap(key, expectedRevision, value, onReject);
        if (swapped) {
          markDirty(current.root);
          await removeOtherCopies(cardSpec, key, found, current.root);
        }
        return swapped;
      }
      // 跨项目：两个数据根各有各的锁，做不成一次原子 CAS。先核对 revision，再写新项目、删旧项目。
      if (current.value.card.revision !== expectedRevision) {
        onReject?.("revision");
        return false;
      }
      copyAttachmentBlobs(value.card, current.root, target);
      await target.stores.cards.register(key, value);
      markDirty(target);
      await removeOtherCopies(cardSpec, key, found, target);
      return true;
    },
    async registerIfAbsent(key: string, value: PersistedTaskfoldCard) {
      if ((await locate(cardSpec, key)).length > 0) {
        return false;
      }
      const target = await targetRoot(cardBoardId(value));
      const inserted = await target.stores.cards.registerIfAbsent!(key, value);
      if (inserted) {
        markDirty(target);
      }
      return inserted;
    },
  };

  const milestones = routedEntityStore<PersistedTaskfoldMilestone>({
    label: "milestone",
    pick: (stores) => stores.milestones,
    boardOf: (value) => value.milestone.boardId,
  });
  const documents = routedEntityStore<PersistedTaskfoldProjectDocument>({
    label: "project document",
    pick: (stores) => stores.documents,
    boardOf: (value) => value.document.boardId,
  });

  // 附件 blob 跟着它所属的卡片放；元数据本来就在卡片里（file-store-attachments.ts 的两段式）。
  const attachments: TaskfoldKeyedStore<PersistedTaskfoldAttachment> = {
    async register(key, value) {
      const owners = await locate(cardSpec, value.attachment.cardId);
      if (owners.length === 0) {
        throw new Error(`taskfold: card ${value.attachment.cardId} not found for attachment ${key}`);
      }
      const owner = await choose(cardSpec, value.attachment.cardId, owners);
      await owner.root.stores.attachments.register(key, value);
    },
    async lookup(key) {
      for (const root of await openRoots()) {
        const value = await root.stores.attachments.lookup(key);
        if (value !== undefined) {
          return value;
        }
      }
      return undefined;
    },
    async delete(key) {
      let deleted = false;
      for (const root of await openRoots()) {
        deleted = (await root.stores.attachments.delete(key)) || deleted;
      }
      return deleted;
    },
    async entries() {
      const seen = new Set<string>();
      const result: Array<{ key: string; value: PersistedTaskfoldAttachment }> = [];
      for (const root of await openRoots()) {
        for (const entry of await root.stores.attachments.entries()) {
          if (!seen.has(entry.key)) {
            seen.add(entry.key);
            result.push(entry);
          }
        }
      }
      return result;
    },
  } as TaskfoldKeyedStore<PersistedTaskfoldAttachment>;

  // 注册表与订阅：写之前确保插件目录在（0700，与原 SQLite 目录同权限）。
  const boards: TaskfoldKeyedStore<PersistedTaskfoldBoard> = {
    ...rawBoards,
    async register(key, value) {
      ensurePluginDir();
      await rawBoards.register(key, value);
    },
  };
  const subscriptions: TaskfoldKeyedStore<PersistedTaskfoldNotificationSubscription> = {
    ...rawSubscriptions,
    async register(key, value) {
      ensurePluginDir();
      await rawSubscriptions.register(key, value);
    },
  };

  return { cards, boards, milestones, documents, subscriptions, attachments, changeSource };
}
