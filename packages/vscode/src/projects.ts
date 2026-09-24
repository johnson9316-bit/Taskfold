// VS Code 下的项目来源（需求/18 §3.8「VS Code 用打开的工作区」）。
//
// - 工作区里每个能找到 `.taskfold/` 的文件夹是一个项目。找法与 CLI 相同（@taskfold/cli 的
//   `findTaskfoldDataDir`）：经 core 的 PathResolver 落到主 checkout，再往上找到仓库根；两个文件夹
//   落到同一个 `.taskfold/`（主 checkout 与它的 worktree 同时打开）只算一个。
// - 打开方式与 CLI 相同：`createTaskfoldFileStores({ dataDir })`，不传 pluginDir，`.taskfold/`
//   之外一个文件都不碰；同一个数据根在进程内只打开一次（core 的进程内写入队列按实例串行）。
// - boardId 的取法与 CLI 的 `create` 默认相同（`defaultBoardFor`）：还没有卡 → `default`，卡都在
//   一个 board → 那个 board。卡分属多个 board 时 CLI 报 AMBIGUOUS，这里拆成每个 board 一个项目。
// - 项目名取文件夹名（拆开时是「文件夹名 · boardId」）。对前端的项目 id 是 `key`：多个仓库都用
//   `default` board 时 boardId 会重复，所以另起一个按文件夹名生成、重名加后缀的 key。
import path from "node:path";
import { boardsInUse, defaultBoardFor } from "@taskfold/cli/cards.js";
import { findTaskfoldDataDir } from "@taskfold/cli/project.js";
import type { TaskfoldCard } from "@taskfold/core/contract/index.js";
import { createTaskfoldFileStores, resolveTaskfoldFileStoreLayout } from "@taskfold/core/file-store.js";
import { cardBoardId } from "@taskfold/core/store-card-helpers.js";
import { TaskfoldDispatchStore } from "@taskfold/core/store-dispatch.js";

export type TaskfoldWorkspaceFolder = { name: string; path: string };

export type TaskfoldVscodeProject = {
  /** 对前端的项目 id（`board.id`）。 */
  key: string;
  name: string;
  /** 这个项目在 `.taskfold/` 里的 board（卡片的 `metadata.automation.boardId`）。 */
  boardId: string;
  dataDir: string;
  cardsDir: string;
  store: TaskfoldDispatchStore;
};

type ProjectRoot = { dataDir: string; cardsDir: string; store: TaskfoldDispatchStore };

function projectKeyBase(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^\p{L}\p{N}._-]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "project"
  );
}

export class TaskfoldProjectNotFoundError extends Error {
  constructor(readonly kind: "project" | "card" | "milestone", readonly id: string) {
    super(`${kind} not found: ${id}`);
    this.name = "TaskfoldProjectNotFoundError";
  }
}

export class TaskfoldProjectRegistry {
  private readonly roots = new Map<string, ProjectRoot>();
  private projects: TaskfoldVscodeProject[] = [];

  constructor(private readonly folders: () => readonly TaskfoldWorkspaceFolder[]) {}

  /** 重新扫描工作区文件夹与各数据根里的 board，返回最新的项目列表。 */
  async refresh(): Promise<TaskfoldVscodeProject[]> {
    const found: Array<{ folder: TaskfoldWorkspaceFolder; dataDir: string }> = [];
    for (const folder of this.folders()) {
      const dataDir = findTaskfoldDataDir(folder.path);
      if (dataDir && !found.some((entry) => entry.dataDir === dataDir)) {
        found.push({ folder, dataDir });
      }
    }
    for (const dataDir of [...this.roots.keys()]) {
      if (!found.some((entry) => entry.dataDir === dataDir)) {
        this.roots.delete(dataDir);
      }
    }
    const projects: TaskfoldVscodeProject[] = [];
    const usedKeys = new Set<string>();
    const uniqueKey = (base: string) => {
      let key = base;
      for (let suffix = 2; usedKeys.has(key); suffix += 1) {
        key = `${base}-${suffix}`;
      }
      usedKeys.add(key);
      return key;
    };
    for (const { folder, dataDir } of found) {
      const root = this.openRoot(dataDir);
      const cards = await root.store.list();
      const boards = boardsInUse(cards);
      const single = boards.length <= 1;
      for (const boardId of single ? [defaultBoardFor(cards) ?? "default"] : boards) {
        const name = single ? folder.name : `${folder.name} · ${boardId}`;
        projects.push({
          key: uniqueKey(projectKeyBase(single ? folder.name : `${folder.name}.${boardId}`)),
          name,
          boardId,
          ...root,
        });
      }
    }
    this.projects = projects;
    return projects;
  }

  /** 上次 {@link refresh} 的结果；还没扫描过时先扫描一次。 */
  async list(): Promise<TaskfoldVscodeProject[]> {
    return this.projects.length > 0 ? this.projects : await this.refresh();
  }

  dataDirs(): string[] {
    return [...this.roots.keys()];
  }

  async byKey(key: unknown): Promise<TaskfoldVscodeProject> {
    const projects = await this.list();
    const project = projects.find((candidate) => candidate.key === key);
    if (!project) {
      throw new TaskfoldProjectNotFoundError("project", String(key));
    }
    return project;
  }

  /** 卡片所在的项目：哪个数据根里有这张卡、且它的 board 就是项目的 board。 */
  async byCardId(id: unknown): Promise<{ project: TaskfoldVscodeProject; card: TaskfoldCard }> {
    if (typeof id !== "string" || !id.trim()) {
      throw new Error("id is required.");
    }
    for (const project of await this.list()) {
      const card = await project.store.get(id);
      if (card && cardBoardId(card) === project.boardId) {
        return { project, card };
      }
    }
    throw new TaskfoldProjectNotFoundError("card", id);
  }

  async byMilestoneId(id: unknown): Promise<TaskfoldVscodeProject> {
    if (typeof id !== "string" || !id.trim()) {
      throw new Error("id is required.");
    }
    for (const project of await this.list()) {
      const { milestones } = await project.store.listMilestones(project.boardId);
      if (milestones.some((milestone) => milestone.id === id)) {
        return project;
      }
    }
    throw new TaskfoldProjectNotFoundError("milestone", id);
  }

  private openRoot(dataDir: string): ProjectRoot {
    let root = this.roots.get(dataDir);
    if (!root) {
      // 与 CLI 的 openTaskfoldProject 相同：不传 pluginDir。
      const stores = createTaskfoldFileStores({ dataDir });
      root = {
        dataDir,
        cardsDir: resolveTaskfoldFileStoreLayout({ dataDir }).cardsDir,
        store: new TaskfoldDispatchStore(stores.cards, stores),
      };
      this.roots.set(dataDir, root);
    }
    return root;
  }
}

/** `<dataDir>` 所在仓库的根（`.taskfold/` 的上一级），用于显示。 */
export function projectRootDir(project: Pick<TaskfoldVscodeProject, "dataDir">): string {
  return path.dirname(project.dataDir);
}
