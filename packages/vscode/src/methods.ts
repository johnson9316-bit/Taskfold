// 扩展进程里的 method 映射：前端（packages/ui/src/project-host.ts）按 method 名发请求，这里在进程内
// 调用 core（backlog doc-2 的清单）。本文件不依赖 `vscode`：界面交互（确认框、冲突三选一、
// diff、打开文件）都经 {@link TaskfoldVscodeUi} 注入，由 vscode-ui.ts 实现，单测用替身。
//
// 与 OpenClaw 网关的差别：
// - 项目 id 是 registry 的 `key`（见 projects.ts），出入参里的 boardId 双向改写；
// - 写卡字段一律白名单，不接收 workspace / workspaceAccess / metadata：VS Code 不派活，
//   也就没有要校验的工作区权限（doc-2「workspace 权限检查」），新建卡片也不补 defaultWorkspace
//   （VS Code 的 board 没有 defaultWorkspace，与 CLI 相同）；
// - cards.update / move / moveMilestone 带 `expectedRevision` 时交给 core 做 CAS，冲突时弹
//   Reload / Overwrite / View Diff，结果按 packages/ui/src/host.ts 的 `TaskfoldCardWriteResult` 返回；
// - 项目管理、资料库、执行相关的 method 不实现，前端按能力开关不显示对应界面。
import fs from "node:fs";
import { toCliError } from "@taskfold/cli/errors.js";
import { redactClaimToken } from "@taskfold/core/card-redaction.js";
import type {
  TaskfoldBoardMetadata,
  TaskfoldBoardSummary,
  TaskfoldBoardViewSettings,
  TaskfoldCard,
  TaskfoldMilestone,
} from "@taskfold/core/contract/index.js";
import { splitCardRuntime } from "@taskfold/core/file-store-card-runtime.js";
import { findCardFilePath } from "@taskfold/core/file-store-cards.js";
import { createMarkdownCardCodec } from "@taskfold/core/file-store-codec.js";
import { TaskfoldRevisionConflictError } from "@taskfold/core/store-core.js";
import { normalizeDelivery } from "@taskfold/core/store-normalizers.js";
import type { TaskfoldExtensionStrings } from "./l10n.js";
import type { TaskfoldWebviewError } from "@taskfold/ui/protocol.js";
import {
  projectRootDir,
  TaskfoldProjectNotFoundError,
  type TaskfoldProjectRegistry,
  type TaskfoldVscodeProject,
} from "./projects.js";

export type TaskfoldConflictChoice = "reload" | "overwrite" | "diff";

/** 扩展进程需要的界面交互；vscode-ui.ts 用 VS Code API 实现。 */
export interface TaskfoldVscodeUi {
  /** 模态确认框；取消或关闭为 false。 */
  confirm(message: string): Promise<boolean>;
  /** 冲突三选一（模态）；Esc / 关闭为 undefined（不写，保留本地修改）。 */
  chooseConflictResolution(cardTitle: string): Promise<TaskfoldConflictChoice | undefined>;
  /** 左边磁盘上的卡片 md，右边本地版本（同一 codec 序列化）。 */
  showCardDiff(diff: { diskPath: string; localContent: string; cardTitle: string }): Promise<void>;
  openFile(filePath: string): Promise<void>;
}

/** `vscode.Memento` 里用到的部分：看板视图设置（分列 / 排序）存在 workspaceState。 */
export interface TaskfoldViewStateStore {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): PromiseLike<void>;
}

/** 与 packages/ui/src/host.ts 的 `TaskfoldCardWriteResult` 同形状，另带写成后的卡片。 */
export type TaskfoldCardWriteResponse = {
  card?: TaskfoldCard;
  conflict?: "overwritten" | "reloaded" | "cancelled";
};

export class TaskfoldUnsupportedMethodError extends Error {
  constructor(readonly method: string, message: string) {
    super(message);
    this.name = "TaskfoldUnsupportedMethodError";
  }
}

type Params = Record<string, unknown>;

function pick(params: Params, keys: readonly string[]): Params {
  return Object.fromEntries(keys.filter((key) => params[key] !== undefined).map((key) => [key, params[key]]));
}

function requiredString(params: Params, key: string): string {
  const value = params[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required.`);
  }
  return value.trim();
}

function optionalExpectedRevision(params: Params): number | undefined {
  const value = params.expectedRevision;
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("expectedRevision must be a non-negative safe integer.");
  }
  return value;
}

/** 别人改过（要弹三选一）；等锁超时、卡片不存在不算，照常报错。 */
function isRevisionConflict(error: unknown): boolean {
  return (
    error instanceof TaskfoldRevisionConflictError &&
    error.reason !== "lock-timeout" &&
    error.reason !== "missing"
  );
}

export function boardViewStateKey(project: Pick<TaskfoldVscodeProject, "dataDir" | "boardId">): string {
  return `taskfold.boardView:${project.dataDir}#${project.boardId}`;
}

export function presentCard(project: TaskfoldVscodeProject, card: TaskfoldCard): TaskfoldCard {
  const redacted = redactClaimToken(card);
  return {
    ...redacted,
    metadata: {
      ...redacted.metadata,
      automation: { ...redacted.metadata?.automation, boardId: project.key },
    },
  } as TaskfoldCard;
}

function presentMilestone(project: TaskfoldVscodeProject, milestone: TaskfoldMilestone): TaskfoldMilestone {
  return { ...milestone, boardId: project.key };
}

export function createTaskfoldVscodeMethods(deps: {
  registry: TaskfoldProjectRegistry;
  ui: TaskfoldVscodeUi;
  viewState: TaskfoldViewStateStore;
  strings: TaskfoldExtensionStrings;
}) {
  const { registry, ui, viewState, strings } = deps;
  const codec = createMarkdownCardCodec();

  const boardView = (project: TaskfoldVscodeProject) =>
    viewState.get<TaskfoldBoardViewSettings>(boardViewStateKey(project));

  function presentBoard<T extends TaskfoldBoardMetadata | TaskfoldBoardSummary>(
    project: TaskfoldVscodeProject,
    board: T,
  ): T {
    const view = boardView(project) ?? board.boardView;
    return {
      ...board,
      id: project.key,
      name: project.name,
      description: board.description ?? projectRootDir(project),
      ...(view ? { boardView: view } : {}),
    };
  }

  async function showDiff(project: TaskfoldVscodeProject, latest: TaskfoldCard, local: TaskfoldCard) {
    const diskPath = findCardFilePath(project.cardsDir, latest.id);
    if (!diskPath) {
      throw new Error(strings.cardFileMissing);
    }
    const diskContent = fs.readFileSync(diskPath, "utf8");
    const localContent = codec.serialize(splitCardRuntime(local).mdCard, diskContent);
    await ui.showCardDiff({ diskPath, localContent, cardTitle: latest.title });
  }

  /**
   * 带 CAS 的单卡写入。`expectedRevision` 是前端读到的 revision；冲突时循环弹三选一：
   * - View Diff：对比磁盘上的卡片与「最新卡片 + 本地修改」（即 Overwrite 会写入的样子），看完再选；
   * - Overwrite：以最新 revision 重新应用本地修改，又输给并发写入就再弹一次；
   * - Reload：什么都不写，前端丢掉本地修改；
   * - 关闭 / Esc：什么都不写，前端保留本地修改。
   * 等锁超时（LOCKED）不弹框，照常报错，前端提示后可以重试。
   */
  async function writeCard(
    project: TaskfoldVscodeProject,
    cardId: string,
    expectedRevision: number | undefined,
    write: (expectedRevision: number | undefined) => Promise<TaskfoldCard>,
    applyLocal: (latest: TaskfoldCard) => TaskfoldCard,
  ): Promise<TaskfoldCardWriteResponse> {
    try {
      return { card: presentCard(project, await write(expectedRevision)) };
    } catch (error) {
      if (expectedRevision === undefined || !isRevisionConflict(error)) {
        throw error;
      }
    }
    for (;;) {
      const latest = await project.store.get(cardId);
      if (!latest) {
        throw new TaskfoldProjectNotFoundError("card", cardId);
      }
      const choice = await ui.chooseConflictResolution(latest.title);
      if (choice === "diff") {
        await showDiff(project, latest, applyLocal(latest));
        continue;
      }
      if (choice === "overwrite") {
        try {
          return { card: presentCard(project, await write(latest.revision)), conflict: "overwritten" };
        } catch (error) {
          if (!isRevisionConflict(error)) {
            throw error;
          }
          continue;
        }
      }
      return { conflict: choice === "reload" ? "reloaded" : "cancelled" };
    }
  }

  const cardMethod =
    (run: (project: TaskfoldVscodeProject, card: TaskfoldCard, params: Params) => Promise<unknown>) =>
    async (params: Params) => {
      const { project, card } = await registry.byCardId(params.id);
      return await run(project, card, params);
    };

  const cardResult = (project: TaskfoldVscodeProject, card: TaskfoldCard) => ({
    card: presentCard(project, card),
  });

  const methods: Record<string, (params: Params) => Promise<unknown>> = {
    "taskfold.projects.list": async () => {
      const projects = await registry.refresh();
      const summaries = new Map<string, TaskfoldBoardSummary[]>();
      const result: TaskfoldBoardSummary[] = [];
      for (const project of projects) {
        let boards = summaries.get(project.dataDir);
        if (!boards) {
          boards = (await project.store.listBoards()).boards;
          summaries.set(project.dataDir, boards);
        }
        const summary = boards.find((board) => board.id === project.boardId) ?? {
          id: project.boardId,
          total: 0,
          active: 0,
          archived: 0,
          byStatus: {},
        };
        result.push(presentBoard(project, summary));
      }
      return { projects: result };
    },

    "taskfold.projects.get": async (params) => {
      const project = await registry.byKey(params.id);
      const view = await project.store.getProject(project.boardId);
      return {
        project: {
          board: presentBoard(project, view.board),
          milestones: view.milestones.map((milestone) => presentMilestone(project, milestone)),
          cards: view.cards.map((card) => presentCard(project, card)),
        },
      };
    },

    // 没有 pluginDir 时 core 的项目注册表只在进程内存里，这里另存一份到 workspaceState，
    // 重开 VS Code 后分列 / 排序照旧。
    "taskfold.projects.boardView.update": async (params) => {
      const project = await registry.byKey(params.id);
      const board = await project.store.updateProject({ id: project.boardId, boardView: params.boardView });
      await viewState.update(boardViewStateKey(project), board.boardView);
      return { board: presentBoard(project, board) };
    },

    "taskfold.projects.milestones.create": async (params) => {
      const project = await registry.byKey(params.boardId);
      const milestone = await project.store.createMilestone({
        ...pick(params, ["title", "description", "color"]),
        boardId: project.boardId,
      });
      return { milestone: presentMilestone(project, milestone) };
    },
    "taskfold.projects.milestones.update": async (params) => {
      const project = await registry.byMilestoneId(params.id);
      const milestone = await project.store.updateMilestone(
        requiredString(params, "id"),
        pick(params, ["title", "description", "color"]),
      );
      return { milestone: presentMilestone(project, milestone) };
    },
    "taskfold.projects.milestones.complete": async (params) => {
      const project = await registry.byMilestoneId(params.id);
      return { milestone: presentMilestone(project, await project.store.completeMilestone(requiredString(params, "id"))) };
    },
    "taskfold.projects.milestones.archive": async (params) => {
      const project = await registry.byMilestoneId(params.id);
      return { milestone: presentMilestone(project, await project.store.archiveMilestone(requiredString(params, "id"))) };
    },
    "taskfold.projects.milestones.restore": async (params) => {
      const project = await registry.byMilestoneId(params.id);
      return { milestone: presentMilestone(project, await project.store.restoreMilestone(requiredString(params, "id"))) };
    },
    "taskfold.projects.milestones.reorder": async (params) => {
      const project = await registry.byKey(params.boardId);
      const { milestones } = await project.store.reorderMilestones({
        boardId: project.boardId,
        milestoneIds: params.milestoneIds,
      });
      return { milestones: milestones.map((milestone) => presentMilestone(project, milestone)) };
    },

    "taskfold.cards.create": async (params) => {
      const project = await registry.byKey(params.boardId);
      const card = await project.store.create({
        ...pick(params, ["title", "notes", "status", "priority", "agentId", "milestoneId", "requirementId", "kind"]),
        boardId: project.boardId,
      });
      return cardResult(project, card);
    },

    "taskfold.cards.update": cardMethod(async (project, card, params) => {
      const patch = pick(params, ["title", "notes", "priority", "delivery"]);
      return await writeCard(
        project,
        card.id,
        optionalExpectedRevision(params),
        async (expectedRevision) =>
          await project.store.update(card.id, patch, expectedRevision === undefined ? {} : { expectedRevision }),
        (latest) => {
          const local: TaskfoldCard = { ...latest, ...pick(patch, ["title", "notes", "priority"]) };
          if (patch.delivery !== undefined) {
            try {
              local.delivery = normalizeDelivery(patch.delivery, latest.delivery);
            } catch {
              // 本地修改不合法时，diff 里只看其余字段；真正写入时 core 会报出原因。
            }
          }
          return local;
        },
      );
    }),

    "taskfold.cards.move": cardMethod(async (project, card, params) => {
      const status = params.status;
      return await writeCard(
        project,
        card.id,
        optionalExpectedRevision(params),
        async (expectedRevision) =>
          await project.store.move(
            card.id,
            status,
            undefined,
            undefined,
            expectedRevision === undefined ? {} : { expectedRevision },
          ),
        (latest) => ({ ...latest, status: status as TaskfoldCard["status"] }),
      );
    }),

    "taskfold.cards.moveMilestone": cardMethod(async (project, card, params) => {
      const input = pick(params, ["milestoneId", "position"]);
      return await writeCard(
        project,
        card.id,
        optionalExpectedRevision(params),
        async (expectedRevision) =>
          await project.store.moveMilestone(
            card.id,
            input,
            expectedRevision === undefined ? {} : { expectedRevision },
          ),
        (latest) => {
          const local: TaskfoldCard = { ...latest };
          if (typeof input.milestoneId === "string" && input.milestoneId) {
            local.milestoneId = input.milestoneId;
          } else {
            delete local.milestoneId;
          }
          return local;
        },
      );
    }),

    "taskfold.cards.archive": cardMethod(async (project, card, params) =>
      cardResult(project, await project.store.archive(card.id, params.archived)),
    ),

    "taskfold.cards.requirement.set": cardMethod(async (project, card, params) => {
      const raw = params.requirementId;
      if (raw !== undefined && raw !== null && typeof raw !== "string") {
        throw new Error("requirementId must be a card id or empty.");
      }
      const requirementId = typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
      return cardResult(project, await project.store.setCardRequirement(card.id, requirementId));
    }),

    "taskfold.cards.sources.create": cardMethod(async (project, card, params) =>
      cardResult(project, await project.store.addSourceReference(card.id, pick(params, ["label", "target", "note"]))),
    ),
    "taskfold.cards.sources.update": cardMethod(async (project, card, params) =>
      cardResult(
        project,
        await project.store.updateSourceReference(
          card.id,
          pick(params, ["sourceReferenceId", "label", "target", "note"]),
        ),
      ),
    ),
    "taskfold.cards.sources.delete": cardMethod(async (project, card, params) =>
      cardResult(project, await project.store.deleteSourceReference(card.id, pick(params, ["sourceReferenceId"]))),
    ),
    "taskfold.cards.sources.reorder": cardMethod(async (project, card, params) =>
      cardResult(
        project,
        await project.store.reorderSourceReferences(card.id, pick(params, ["sourceReferenceIds"])),
      ),
    ),

    "taskfold.cards.proof": cardMethod(async (project, card, params) =>
      cardResult(project, await project.store.addProof(card.id, pick(params, ["status", "label", "command", "url", "note"]))),
    ),
    "taskfold.cards.proof.delete": cardMethod(async (project, card, params) =>
      cardResult(project, await project.store.deleteProof(card.id, requiredString(params, "proofId"))),
    ),
    "taskfold.cards.artifact": cardMethod(async (project, card, params) =>
      cardResult(project, await project.store.addArtifact(card.id, pick(params, ["label", "url", "path", "mimeType"]))),
    ),
    "taskfold.cards.artifact.delete": cardMethod(async (project, card, params) =>
      cardResult(project, await project.store.deleteArtifact(card.id, requiredString(params, "artifactId"))),
    ),

    "taskfold.cards.openFile": cardMethod(async (project, card) => {
      const filePath = findCardFilePath(project.cardsDir, card.id);
      if (!filePath) {
        throw new Error(strings.cardFileMissing);
      }
      await ui.openFile(filePath);
      return { path: filePath };
    }),
  };

  return {
    methods: Object.keys(methods),
    async call(method: string, params: Params = {}): Promise<unknown> {
      const run = methods[method];
      if (!run) {
        throw new TaskfoldUnsupportedMethodError(method, strings.unsupportedMethod(method));
      }
      return await run(params);
    },
  };
}

/** 抛给前端的错误：`code` 与 CLI 错误码同一套，LOCKED 换成本地化的「请重试」提示。 */
export function toWebviewError(error: unknown, strings: TaskfoldExtensionStrings): TaskfoldWebviewError {
  if (error instanceof TaskfoldProjectNotFoundError) {
    return { code: "NOT_FOUND", message: error.message };
  }
  if (error instanceof TaskfoldUnsupportedMethodError) {
    return { code: "UNSUPPORTED", message: error.message };
  }
  const cliError = toCliError(error);
  return {
    code: cliError.code,
    message: cliError.code === "LOCKED" ? strings.locked : cliError.message,
  };
}
