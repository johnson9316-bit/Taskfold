import { html, nothing, type TemplateResult } from "lit";
import { ref } from "lit/directives/ref.js";
import type {
  TaskfoldBoardMetadata,
  TaskfoldBoardGroupBy,
  TaskfoldBoardSortBy,
  TaskfoldBoardSortDirection,
  TaskfoldBoardViewLayout,
  TaskfoldBoardViewSettings,
  TaskfoldBoardSummary,
  TaskfoldCard,
  TaskfoldCardKind,
  TaskfoldDeliveryImplementationState,
  TaskfoldDeliveryReleaseState,
  TaskfoldEvent,
  TaskfoldDeliveryVerificationState,
  TaskfoldExecution,
  TaskfoldMilestone,
  TaskfoldPriority,
  TaskfoldProjectDocument,
  TaskfoldProjectDocumentRead,
  TaskfoldProjectDocumentSection,
  TaskfoldProjectDocumentSource,
  TaskfoldProjectDocumentType,
  TaskfoldProjectView,
  TaskfoldStatus,
  TaskfoldStatusDefinition,
} from "@taskfold/core/contract/index.js";
import type { TaskfoldStatusMigrationReport } from "@taskfold/core/status-migration.js";
import "../../components/modal-dialog.ts";
import "../../components/markdown-editor.ts";
import { isTaskfoldDocumentImageRef } from "@taskfold/core/card-image-ref.js";
import "./graph-canvas.ts";
import { buildGraphModel, resolveGraphDrop, type GraphFilter, type GraphRelation } from "./graph-model.ts";
import { t, type TaskfoldLocale } from "../../i18n/index.ts";
import {
  hydrateMarkdownImages,
  plainTextFromMarkdown,
  renderTaskfoldMarkdown,
} from "../../lib/markdown.ts";
import { buildCardTimeline, cardComments } from "../../lib/card-timeline.ts";
import { cardPhase } from "@taskfold/core/card-phase.js";
import {
  TASKFOLD_STATUS_CATEGORIES,
  TASKFOLD_STATUS_ROLES,
  type TaskfoldStatusCategory,
  type TaskfoldStatusRole,
} from "@taskfold/core/contract/index.js";
import { TASKFOLD_STATUS_ID_PATTERN } from "@taskfold/core/status-registry.js";
import { fitToViewport } from "../../lib/fit-viewport.ts";
import {
  boardStatusColumns,
  cardMark,
  checkedStatusFor,
  defaultStatusLabel,
  displayStatusId,
  isCompletedCard,
  isFinishedCard,
  statusLabel,
  statusRegistryOf,
  type TaskfoldCardMark,
} from "../../lib/statuses.ts";
import type { TaskfoldStatusRegistry } from "@taskfold/core/status-registry.js";
import { styleProperties } from "../../lib/style-properties.ts";
import "../../styles/taskfold-project.css";

const PRIORITIES: readonly TaskfoldPriority[] = ["low", "normal", "high", "urgent"];
const BOARD_LAYOUTS: readonly TaskfoldBoardViewLayout[] = ["board", "list"];
const BOARD_GROUPS: readonly TaskfoldBoardGroupBy[] = ["status", "milestone", "requirement", "assignee"];
const BOARD_SORTS: readonly TaskfoldBoardSortBy[] = ["manual", "priority", "createdAt", "updatedAt"];
const BOARD_SORT_DIRECTIONS: readonly TaskfoldBoardSortDirection[] = ["asc", "desc"];
const DOCUMENT_SECTIONS: readonly TaskfoldProjectDocumentSection[] = [
  "project",
  "codebase",
  "environment",
  "knowledge",
];
const DOCUMENT_TYPES: readonly TaskfoldProjectDocumentType[] = [
  "markdown",
  "json",
  "link",
  "path",
  "secret_ref",
];
const DOCUMENT_SOURCES: readonly TaskfoldProjectDocumentSource[] = ["project", "ai_system"];
const IMPLEMENTATION_STATES: readonly TaskfoldDeliveryImplementationState[] = [
  "not_started",
  "in_progress",
  "code_complete",
  "not_applicable",
  "unknown",
];
const VERIFICATION_STATES: readonly TaskfoldDeliveryVerificationState[] = [
  "not_started",
  "partial",
  "passed",
  "failed",
  "human_required",
  "not_required",
  "unknown",
];
const RELEASE_STATES: readonly TaskfoldDeliveryReleaseState[] = [
  "not_started",
  "pending",
  "released",
  "not_required",
  "unknown",
];

export type TaskfoldProjectModal =
  | { kind: "project" }
  | {
      kind: "card";
      milestoneId?: string;
      requirementId?: string;
      status?: TaskfoldStatus;
      cardKind?: TaskfoldCardKind;
      relatedCardId?: string;
    }
  | { kind: "milestone"; milestone?: TaskfoldMilestone }
  | { kind: "document"; document?: TaskfoldProjectDocument }
  | { kind: "card-detail"; cardId: string }
  /** 删除一个状态：用这个状态的卡要先选个去处。 */
  | { kind: "status-delete"; statusId: string }
  | { kind: "execution-start"; cardId: string }
  | {
      kind: "move-project";
      cardId: string;
      boardId?: string;
      milestoneId?: string;
      targetProject?: TaskfoldProjectView;
    };

export type TaskfoldCardExecutionPreparation = {
  cardId: string;
  expectedRevision: number;
  active: boolean;
  agentId: string;
  defaultProvider?: string;
  defaultModel?: string;
  sourceCheckout: string;
  baseBranch?: string;
  worktreeName: string;
  promptPreview: string;
  execution: TaskfoldExecution | null;
};

export type TaskfoldCardExecutionInspection = {
  card: TaskfoldCard;
  active: boolean;
  execution: TaskfoldExecution | null;
  sessionKey?: string;
  runId?: string;
  session?: unknown;
  preview?: unknown;
};

export type TaskfoldProjectUiState = {
  loading: boolean;
  loaded: boolean;
  busy: boolean;
  error: string | null;
  languageSwitching: boolean;
  languageError: string | null;
  projects: TaskfoldBoardSummary[];
  project: TaskfoldProjectView | null;
  documents: TaskfoldProjectDocument[];
  selectedDocumentId: string | null;
  documentPreview: TaskfoldProjectDocumentRead | null;
  documentPreviewLoading: boolean;
  documentPreviewError: string | null;
  documentEditing: boolean;
  documentDraft: string | null;
  documentQuery: string;
  documentSourceFilter: "all" | TaskfoldProjectDocumentSource;
  executionPreparationCardId: string | null;
  executionPreparation: TaskfoldCardExecutionPreparation | null;
  executionPreparationLoading: boolean;
  executionPreparationError: string | null;
  executionInspectionCardId: string | null;
  executionInspection: TaskfoldCardExecutionInspection | null;
  executionInspectionLoading: boolean;
  executionInspectionError: string | null;
  selectedProjectId: string | null;
  screen: "overview" | "board" | "graph" | "settings" | "statuses" | "documents";
  modal: TaskfoldProjectModal | null;
  draggedCardId: string | null;
  /** 拖拽经过、需要高亮的列。 */
  dragOverColumnId: string | null;
  /** 正在列底就地新建卡片的列。 */
  quickAddColumnId: string | null;
  /** 卡片详情里评论 / 变更历史页签。 */
  cardActivityTab: "comments" | "history";
  /** 卡片详情头部「更多」菜单是否展开。 */
  cardMenuOpen: boolean;
  /** 展开了「⋮」菜单的看板列（列 id）。 */
  columnMenuId: string | null;
  /** 顶栏「全部项目」下拉是否展开。 */
  projectMenuOpen: boolean;
  /** 状态设置页的草稿（改名 / 改类别 / 排序…尚未保存）；null 表示没改过，直接显示项目的状态。 */
  statusDraft: TaskfoldStatusDefinition[] | null;
  /** 状态设置页提交 / 迁移失败的原因，显示在页内。 */
  statusError: string | null;
  /** 迁移预览（dry-run）的结果；null 表示还没预览。 */
  statusMigration: TaskfoldStatusMigrationReport | null;
  graphMode: "mindmap" | "flow";
  graphZoom: number;
  graphFilter: GraphFilter;
  graphSelectedId: string;
  graphLinkTargetId: string;
  graphLinkType: Exclude<GraphRelation, "contains">;
  showArchivedProjects: boolean;
  showHiddenDocuments: boolean;
  query: string;
  /** 卡片详情编辑模式的草稿（能力开关 `cardEditing`）；null 表示没在编辑。 */
  cardDraft: TaskfoldCardDraft | null;
  /** 编辑模式提交失败的原因，显示在编辑表单里（弹窗会盖住页面顶部的错误条）。 */
  cardDraftError: string | null;
  /** 交付事实表单开始改动时卡片的 revision（见 `beginDeliveryEdit`）；null 表示还没改。 */
  deliveryBaseRevision: { cardId: string; revision: number } | null;
};

/** 可在编辑模式里改的卡片字段。 */
export type TaskfoldCardDraftFields = {
  title: string;
  priority: TaskfoldPriority;
  notes: string;
};

/**
 * 卡片编辑草稿。进入编辑时记下当时的 revision 与字段原值：后台刷新只更新 `state.project`，
 * 不碰草稿，正在输入的内容不会被覆盖；提交时只发与原值不同的字段，并以 `baseRevision` 做 CAS。
 */
export type TaskfoldCardDraft = TaskfoldCardDraftFields & {
  cardId: string;
  baseRevision: number;
  base: TaskfoldCardDraftFields;
};

export type TaskfoldProjectViewController = {
  state: TaskfoldProjectUiState;
  connected: boolean;
  /** 宿主能力开关 `capabilities.execution`；关掉时执行区块与启动执行弹窗都不渲染。 */
  executionEnabled: boolean;
  /** 宿主能力开关 `capabilities.cardEditing`：卡片详情的编辑模式。 */
  cardEditingEnabled: boolean;
  /** 宿主能力开关 `capabilities.projectManagement`：新建 / 归档 / 排序项目、设置页、跨项目移卡。 */
  projectManagementEnabled: boolean;
  /** 宿主能力开关 `capabilities.documents`：资料库页。 */
  documentsEnabled: boolean;
  /** 宿主能力开关 `capabilities.openCardFile`：「在编辑器中打开」原 md 文件。 */
  openCardFileEnabled: boolean;
  /** 宿主能力开关 `capabilities.cardFlow`：标记 / 解除阻塞、加入派发队列。 */
  cardFlowEnabled: boolean;
  locale: TaskfoldLocale;
  requestUpdate: () => void;
  refresh: () => void;
  setLocale: (locale: TaskfoldLocale) => void;
  selectProject: (id: string) => void;
  setScreen: (screen: TaskfoldProjectUiState["screen"]) => void;
  openModal: (modal: TaskfoldProjectModal) => void;
  closeModal: () => void;
  createProject: (data: Record<string, string>) => void;
  updateProject: (data: Record<string, string>) => void;
  archiveProject: (archived: boolean) => void;
  createCard: (data: Record<string, string>) => void;
  /** 卡片图片：粘贴进 notes / 评论的截图经宿主存到 `.taskfold/attachments/<卡 uuid>/`。 */
  cardImages: {
    upload: (cardId: string, file: File) => Promise<string>;
    /** 新建卡片时还没有卡 id：暂存在内存里，建好卡后才上传。 */
    stage: (file: File) => string;
    resolve: (ref: string) => Promise<string | undefined>;
    isPending: (ref: string) => boolean;
  };
  updateCardStatus: (id: string, status: TaskfoldStatus) => void;
  updateCardAgent: (id: string, agentId: string) => void;
  updateCardPriority: (id: string, priority: TaskfoldPriority) => void;
  updateCardLabels: (id: string, labels: string[]) => void;
  addCardComment: (id: string, body: string) => void;
  /** 卡片流转（能力开关 `cardFlow`）：打阻塞标记 / 解除阻塞 / 加入派发队列。 */
  blockCard: (id: string, reason: string) => void;
  unblockCard: (id: string) => void;
  promoteCard: (id: string) => void;
  /** 状态设置：整体保存状态集、删除一个状态（卡先移走）、预览 / 执行迁移。 */
  saveStatuses: (statuses: TaskfoldStatusDefinition[]) => void;
  deleteStatus: (id: string, moveCardsTo?: string) => void;
  previewStatusMigration: () => void;
  migrateStatuses: () => void;
  duplicateCard: (id: string) => void;
  deleteCard: (id: string) => void;
  archiveCard: (id: string, archived: boolean) => void;
  moveCardMilestone: (id: string, milestoneId?: string, position?: number) => void;
  moveCardRequirement: (id: string, requirementId?: string) => void;
  moveCardProject: (id: string, boardId: string, milestoneId: string) => void;
  updateBoardView: (boardView: TaskfoldBoardViewSettings) => void;
  setGraphMode: (mode: TaskfoldProjectUiState["graphMode"]) => void;
  setGraphZoom: (zoom: number) => void;
  createGraphRelation: (source: string, target: string, type: Exclude<GraphRelation, "contains">) => void;
  deleteGraphRelation: (source: string, target: string, type: Exclude<GraphRelation, "contains">) => void;
  selectMoveCardProjectTarget: (cardId: string, boardId: string) => void;
  reorderProjects: (ids: string[]) => void;
  reorderMilestones: (ids: string[]) => void;
  reorderDocuments: (ids: string[]) => void;
  openDocument: (id: string) => void;
  refreshDocument: () => void;
  startDocumentEdit: () => void;
  previewDocumentDraft: () => void;
  cancelDocumentEdit: () => void;
  saveDocumentContent: () => void;
  /** 资料库文档里的图片：`path` 文档存在文档旁的 `<文档名>.assets/`，引用是相对文档的路径。 */
  documentImages: {
    upload: (documentId: string, file: File) => Promise<string>;
    resolve: (documentId: string, ref: string) => Promise<string | undefined>;
  };
  saveMilestone: (data: Record<string, string>) => void;
  completeMilestone: (id: string) => void;
  archiveMilestone: (id: string, archived: boolean) => void;
  saveDocument: (data: Record<string, string>) => void;
  hideDocument: (id: string, hidden: boolean) => void;
  deleteDocument: (id: string) => void;
  updateCardDelivery: (id: string, data: Record<string, string>) => void;
  /**
   * 交付事实表单第一次被改动时调用，记下当时卡片的 revision，提交时拿它做 CAS：之后的后台刷新
   * 会把 `card.revision` 更新成别人写入后的新值，提交时若拿新值比对，就会悄悄覆盖别人的修改。
   */
  beginDeliveryEdit: (id: string, revision: number) => void;
  startCardEdit: (id: string) => void;
  cancelCardEdit: () => void;
  saveCardEdit: () => void;
  openCardFile: (id: string) => void;
  prepareCardExecution: (id: string) => void;
  startCardExecution: (id: string) => void;
  refreshCardExecution: (id: string) => void;
  steerCardExecution: (id: string, message: string) => void;
  abortCardExecution: (id: string) => void;
  createSourceReference: (id: string, data: Record<string, string>) => void;
  updateSourceReference: (id: string, data: Record<string, string>) => void;
  deleteSourceReference: (id: string, sourceReferenceId: string) => void;
  reorderSourceReferences: (id: string, sourceReferenceIds: string[]) => void;
  addProof: (id: string, data: Record<string, string>) => void;
  deleteProof: (id: string, proofId: string) => void;
  addArtifact: (id: string, data: Record<string, string>) => void;
  deleteArtifact: (id: string, artifactId: string) => void;
};

export function createTaskfoldProjectUiState(): TaskfoldProjectUiState {
  return {
    loading: false,
    loaded: false,
    busy: false,
    error: null,
    languageSwitching: false,
    languageError: null,
    projects: [],
    project: null,
    documents: [],
    selectedDocumentId: null,
    documentPreview: null,
    documentPreviewLoading: false,
    documentPreviewError: null,
    documentEditing: false,
    documentDraft: null,
    documentQuery: "",
    documentSourceFilter: "all",
    executionPreparationCardId: null,
    executionPreparation: null,
    executionPreparationLoading: false,
    executionPreparationError: null,
    executionInspectionCardId: null,
    executionInspection: null,
    executionInspectionLoading: false,
    executionInspectionError: null,
    selectedProjectId: null,
    screen: "overview",
    modal: null,
    draggedCardId: null,
    dragOverColumnId: null,
    quickAddColumnId: null,
    cardActivityTab: "comments",
    cardMenuOpen: false,
    columnMenuId: null,
    projectMenuOpen: false,
    statusDraft: null,
    statusError: null,
    statusMigration: null,
    graphMode: "mindmap",
    graphZoom: 1,
    graphFilter: { query: "", milestoneId: "", status: "", tag: "", relation: "all", focusCardId: "" },
    graphSelectedId: "",
    graphLinkTargetId: "",
    graphLinkType: "parent",
    showArchivedProjects: false,
    showHiddenDocuments: false,
    query: "",
    cardDraft: null,
    cardDraftError: null,
    deliveryBaseRevision: null,
  };
}

function boardName(board: Pick<TaskfoldBoardSummary | TaskfoldBoardMetadata, "id" | "name">): string {
  return board.name || board.id;
}

function boardView(board: TaskfoldBoardMetadata): TaskfoldBoardViewSettings {
  return board.boardView ?? { groupBy: "status", sortBy: "priority", sortDirection: "asc" };
}

function cardRequirementId(card: TaskfoldCard): string | undefined {
  return card.metadata?.links?.find(
    (link) => link.type === "contained_by" && link.targetCardId,
  )?.targetCardId;
}

function isRequirementCard(card: TaskfoldCard): boolean {
  return card.kind === "requirement" || Boolean(
    card.metadata?.links?.some((link) => link.type === "contains" && link.targetCardId),
  );
}

function sortBoardCards(
  cards: readonly TaskfoldCard[],
  view: TaskfoldBoardViewSettings,
): TaskfoldCard[] {
  const multiplier = view.sortDirection === "asc" ? 1 : -1;
  const priorityRank = new Map<TaskfoldPriority, number>([
    ["urgent", 0],
    ["high", 1],
    ["normal", 2],
    ["low", 3],
  ]);
  return [...cards].toSorted((left, right) => {
    if (view.sortBy === "manual") {
      return left.position - right.position || left.createdAt - right.createdAt;
    }
    if (view.sortBy === "priority") {
      return (
        multiplier * ((priorityRank.get(left.priority) ?? 99) - (priorityRank.get(right.priority) ?? 99)) ||
        left.createdAt - right.createdAt
      );
    }
    const leftValue = view.sortBy === "createdAt" ? left.createdAt : left.updatedAt;
    const rightValue = view.sortBy === "createdAt" ? right.createdAt : right.updatedAt;
    return multiplier * (leftValue - rightValue) || left.title.localeCompare(right.title);
  });
}

function boardId(card: TaskfoldCard): string {
  return card.metadata?.automation?.boardId ?? "default";
}

function isArchivedCard(card: TaskfoldCard): boolean {
  return Boolean(card.metadata?.archivedAt);
}

/** 状态的 `color` 会写进内联样式：只收 #hex 与 CSS 命名色（与后端校验一致）。 */
function isSafeCssColor(value: string): boolean {
  return /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20})$/.test(value);
}

/** 卡片上的标记：阻塞、已派发、定时未到。它们不是状态，所以不会出现在列标题里，只能在卡上看到。 */
function renderCardMark(card: TaskfoldCard, mark: TaskfoldCardMark, locale?: string) {
  if (mark === "blocked") {
    const reason = card.metadata?.blocked?.reason;
    return html`<span class="taskfold-project__mark tf-mark-blocked" title=${reason ?? t("taskfoldProject.mark.blocked")}>${t("taskfoldProject.mark.blocked")}</span>`;
  }
  if (mark === "scheduled") {
    const at = card.metadata?.automation?.scheduledAt;
    const time = at ? new Date(at).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" }) : "";
    return html`<span class="taskfold-project__mark tf-mark-scheduled" title=${time}>${t("taskfoldProject.mark.scheduled", { time })}</span>`;
  }
  return html`<span class="taskfold-project__mark tf-mark-ready" title=${t("taskfoldProject.mark.readyHelp")}>${t("taskfoldProject.mark.ready")}</span>`;
}

function hasActiveCardExecution(card: TaskfoldCard): boolean {
  return (
    card.execution?.status === "running" ||
    Boolean(card.metadata?.attempts?.some((attempt) => attempt.status === "running"))
  );
}

function inspectionForCard(
  state: TaskfoldProjectUiState,
  cardId: string,
): TaskfoldCardExecutionInspection | null {
  return state.executionInspectionCardId === cardId ? state.executionInspection : null;
}

function executionValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function taskfoldNativeChatHref(sessionKey: string, pathname?: string): string {
  let currentPath = "/";
  if (typeof window !== "undefined") {
    currentPath = window.location.pathname;
    try {
      if (window.parent !== window) {
        currentPath = window.parent.location.pathname || currentPath;
      }
    } catch {
      // Cross-origin embeds keep their own route as the safe fallback.
    }
  }
  const path = pathname ?? currentPath;
  const pluginIndex = path.indexOf("/plugin");
  const basePath = pluginIndex >= 0 ? path.slice(0, pluginIndex) : "";
  return `${basePath || ""}/chat?session=${encodeURIComponent(sessionKey)}`;
}

function milestoneLabel(milestone: TaskfoldMilestone): string {
  const key =
    milestone.state === "active"
      ? "taskfoldProject.active"
      : milestone.state === "completed"
        ? "taskfoldProject.completed"
        : "taskfoldProject.archived";
  return t(key);
}

function sectionLabel(section: TaskfoldProjectDocumentSection): string {
  return t(
    `taskfoldProject.section${section[0]?.toUpperCase() ?? ""}${section.slice(1)}`,
  );
}

function documentTypeLabel(type: TaskfoldProjectDocumentType): string {
  const key =
    type === "secret_ref"
      ? "SecretRef"
      : `${type[0]?.toUpperCase() ?? ""}${type.slice(1)}`;
  return t(`taskfoldProject.type${key}`);
}

function documentSourceLabel(source: TaskfoldProjectDocumentSource): string {
  return t(`taskfoldProject.source${source === "ai_system" ? "AiSystem" : "Project"}`);
}

function documentPathLabel(
  target: string | undefined,
  workspacePath: string | undefined,
): string | undefined {
  if (!target || !workspacePath) {
    return target;
  }
  const normalizedWorkspace = workspacePath.replace(/[\\/]+$/, "");
  const normalizedTarget = target.replace(/\\/g, "/");
  const normalizedRoot = normalizedWorkspace.replace(/\\/g, "/");
  if (normalizedTarget === normalizedRoot) {
    return ".";
  }
  if (normalizedTarget.startsWith(`${normalizedRoot}/`)) {
    return normalizedTarget.slice(normalizedRoot.length + 1);
  }
  return normalizedTarget.split("/").at(-1) || target;
}

function projectCardCount(project: TaskfoldBoardSummary): number {
  return project.active;
}

function readForm(event: SubmitEvent): Record<string, string> {
  const form = event.currentTarget as HTMLFormElement;
  return Object.fromEntries(
    [...new FormData(form).entries()].map(([key, value]) => [key, String(value)]),
  );
}

function setProjectCreateMode(event: Event): void {
  const input = event.currentTarget as HTMLInputElement;
  const form = input.form;
  if (!form) {
    return;
  }
  const existing = input.value === "existing";
  const workspaceField = form.elements.namedItem("workspacePath");
  const workspaceInput =
    workspaceField instanceof HTMLInputElement ? workspaceField : undefined;
  workspaceInput?.toggleAttribute("required", existing);
  form.querySelector<HTMLElement>("[data-project-workspace]")?.toggleAttribute("hidden", !existing);
}

export function reorderVisibleItemIds<T extends { id: string }>(
  allItems: readonly T[],
  visibleItems: readonly T[],
  id: string,
  direction: -1 | 1,
): string[] | undefined {
  const visibleIndex = visibleItems.findIndex((item) => item.id === id);
  const target = visibleItems[visibleIndex + direction];
  if (visibleIndex < 0 || !target) {
    return undefined;
  }
  const ids = allItems.map((item) => item.id);
  const sourceIndex = ids.indexOf(id);
  const targetIndex = ids.indexOf(target.id);
  if (sourceIndex < 0 || targetIndex < 0) {
    return undefined;
  }
  [ids[sourceIndex], ids[targetIndex]] = [ids[targetIndex]!, ids[sourceIndex]!];
  return ids;
}

/** 项目的状态下拉；当前值不在状态集里（数据被手改过）时补一项，免得选择框悄悄换成别的值。 */
function renderStatusOptions(selected: TaskfoldStatus, registry: TaskfoldStatusRegistry) {
  const options = registry.ids.includes(selected) ? registry.ids : [...registry.ids, selected];
  return options.map(
    (status) =>
      html`<option value=${status} ?selected=${status === selected}>${statusLabel(status, registry, t)}</option>`,
  );
}

function renderPriorityOptions(selected: TaskfoldPriority) {
  return PRIORITIES.map(
    (priority) =>
      html`<option value=${priority} ?selected=${priority === selected}>${t(`taskfoldProject.priorityValue.${priority}`)}</option>`,
  );
}

function deliveryStateKey(
  prefix: "implementation" | "verification" | "release",
  state: string,
): string {
  const suffix = state
    .split("_")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join("");
  return `taskfoldProject.delivery${prefix[0]?.toUpperCase() ?? ""}${prefix.slice(1)}${suffix}`;
}

function renderDeliveryOptions(
  states: readonly string[],
  selected: string | undefined,
  prefix: "implementation" | "verification" | "release",
) {
  return [
    html`<option value="">${t("taskfoldProject.deliveryNotRecorded")}</option>`,
    ...states.map(
      (state) =>
        html`<option value=${state} ?selected=${state === selected}>${t(
          deliveryStateKey(prefix, state),
        )}</option>`,
    ),
  ];
}

function deliveryStateLabel(
  prefix: "implementation" | "verification" | "release",
  state: string | undefined,
): string {
  return state ? t(deliveryStateKey(prefix, state)) : t("taskfoldProject.deliveryNotRecorded");
}

function renderOrderControls(params: {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return html`
    <div class="taskfold-project__order-actions">
      <button
        class="taskfold-project__icon-button taskfold-project__order-button"
        type="button"
        title=${t("taskfoldProject.moveUp")}
        aria-label=${t("taskfoldProject.moveUp")}
        ?disabled=${!params.canMoveUp}
        @click=${params.onMoveUp}
      >&#8593;</button>
      <button
        class="taskfold-project__icon-button taskfold-project__order-button"
        type="button"
        title=${t("taskfoldProject.moveDown")}
        aria-label=${t("taskfoldProject.moveDown")}
        ?disabled=${!params.canMoveDown}
        @click=${params.onMoveDown}
      >&#8595;</button>
    </div>
  `;
}

/** 顶栏「全部项目」下拉：搜索、切换项目、调整顺序、显示已归档，替代原来占一整行的项目工具栏。 */
function renderProjectSwitcher(controller: TaskfoldProjectViewController) {
  const { state } = controller;
  const open = state.projectMenuOpen;
  const query = state.query.trim().toLocaleLowerCase();
  const projects = state.projects.filter((project) => {
    if (!state.showArchivedProjects && project.archivedAt) {
      return false;
    }
    return !query || `${project.name ?? ""} ${project.id}`.toLocaleLowerCase().includes(query);
  });
  const close = () => {
    if (state.projectMenuOpen) {
      state.projectMenuOpen = false;
      controller.requestUpdate();
    }
  };
  return html`
    <div
      class="taskfold-project__switcher"
      @focusout=${(event: FocusEvent) => {
        if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) {
          close();
        }
      }}
      @keydown=${(event: KeyboardEvent) => {
        if (event.key === "Escape") {
          close();
        }
      }}
    >
      <button
        class="tf-btn taskfold-project__all-projects ${state.screen === "overview" ? "tf-is-active" : ""}"
        type="button"
        aria-haspopup="listbox"
        aria-expanded=${open}
        @click=${(event: Event) => {
          state.projectMenuOpen = !open;
          controller.requestUpdate();
          if (!open) {
            const root = (event.currentTarget as HTMLElement).parentElement;
            setTimeout(() => root?.querySelector<HTMLInputElement>("input[type=search]")?.focus(), 0);
          }
        }}
      >
        <span>${t("taskfoldProject.allProjects")}</span>
        <strong>${state.projects.length}</strong>
        <span aria-hidden="true">&#9662;</span>
      </button>
      ${open
        ? html`
            <div class="taskfold-project__switcher-menu" role="listbox">
              <button
                class="taskfold-project__nav-item ${state.screen === "overview" ? "tf-is-active" : ""}"
                type="button"
                @click=${() => {
                  close();
                  controller.setScreen("overview");
                }}
              >${t("taskfoldProject.overview")}</button>
              <label class="taskfold-project__search">
                <span class="taskfold-project__sr-only">${t("taskfoldProject.searchProjects")}</span>
                <input
                  type="search"
                  placeholder=${t("taskfoldProject.searchProjects")}
                  .value=${state.query}
                  @input=${(event: InputEvent) => {
                    state.query = (event.currentTarget as HTMLInputElement).value;
                    controller.requestUpdate();
                  }}
                />
              </label>
              <div class="taskfold-project__project-list" role="list">
                ${projects.length
                  ? projects.map((project) => {
                      const moveUp = reorderVisibleItemIds(state.projects, projects, project.id, -1);
                      const moveDown = reorderVisibleItemIds(state.projects, projects, project.id, 1);
                      return html`
                        <div class="taskfold-project__project-row" role="listitem">
                          <button
                            class="taskfold-project__nav-project ${state.selectedProjectId === project.id
                              ? "tf-is-selected"
                              : ""}"
                            type="button"
                            @click=${() => {
                              close();
                              controller.selectProject(project.id);
                            }}
                          >
                            <span class="taskfold-project__project-color" ${styleProperties({ "--project-color": project.color })}></span>
                            <span class="taskfold-project__nav-project-name">${boardName(project)}</span>
                            ${project.archivedAt
                              ? html`<small>${t("taskfoldProject.archived")}</small>`
                              : html`<small>${projectCardCount(project)}</small>`}
                          </button>
                          ${controller.projectManagementEnabled
                            ? renderOrderControls({
                                canMoveUp: Boolean(moveUp),
                                canMoveDown: Boolean(moveDown),
                                onMoveUp: () => moveUp && controller.reorderProjects(moveUp),
                                onMoveDown: () => moveDown && controller.reorderProjects(moveDown),
                              })
                            : nothing}
                        </div>
                      `;
                    })
                  : html`<p class="taskfold-project__empty-side">${t("taskfoldProject.emptyProject")}</p>`}
              </div>
              ${controller.projectManagementEnabled
                ? html`
                    <label class="taskfold-project__checkbox">
                      <input
                        type="checkbox"
                        .checked=${state.showArchivedProjects}
                        @change=${(event: Event) => {
                          state.showArchivedProjects = (event.currentTarget as HTMLInputElement).checked;
                          controller.requestUpdate();
                        }}
                      />
                      ${t("taskfoldProject.includeArchived")}
                    </label>
                  `
                : nothing}
            </div>
          `
        : nothing}
    </div>
  `;
}

function renderOverview(controller: TaskfoldProjectViewController) {
  const { state } = controller;
  const projects = state.projects.filter(
    (project) => state.showArchivedProjects || !project.archivedAt,
  );
  return html`
    <section class="taskfold-project__overview" aria-label=${t("taskfoldProject.overview")}>
      <div class="taskfold-project__section-heading">
        <div>
          <h1>${t("taskfoldProject.allProjects")}</h1>
          <p>${t("taskfoldProject.title")}</p>
        </div>
        ${controller.projectManagementEnabled
          ? html`
              <button
                class="tf-btn tf-btn--primary"
                type="button"
                ?disabled=${!controller.connected}
                @click=${() => controller.openModal({ kind: "project" })}
              >
                ${t("taskfoldProject.newProject")}
              </button>
            `
          : nothing}
      </div>
      ${projects.length
        ? html`
            <div class="taskfold-project__overview-grid">
              ${projects.map(
                (project) => html`
                  <article
                    class="taskfold-project__overview-item ${project.archivedAt ? "tf-is-archived" : ""}"
                    role="button"
                    tabindex="0"
                    aria-label=${boardName(project)}
                    @click=${() => controller.selectProject(project.id)}
                    @keydown=${(event: KeyboardEvent) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        controller.selectProject(project.id);
                      }
                    }}
                  >
                    <div class="taskfold-project__overview-item-top">
                      <span class="taskfold-project__project-color" ${styleProperties({ "--project-color": project.color })}></span>
                      <span class="taskfold-project__overview-item-id">${project.id}</span>
                      ${project.archivedAt
                        ? html`<span class="taskfold-project__badge">${t("taskfoldProject.archived")}</span>`
                        : nothing}
                    </div>
                    <h2>${boardName(project)}</h2>
                    <p>${project.currentObjective || project.description || "\u00a0"}</p>
                    <footer>
                      <span>${t("taskfoldProject.cards", { count: String(project.active) })}</span>
                      <span>${project.version || ""}</span>
                    </footer>
                  </article>
                `,
              )}
            </div>
          `
        : html`
            <div class="taskfold-project__blank">
              ${controller.projectManagementEnabled
                ? html`
                    <p>${t("taskfoldProject.emptyOverview")}</p>
                    <button
                      class="tf-btn tf-btn--primary"
                      type="button"
                      ?disabled=${!controller.connected}
                      @click=${() => controller.openModal({ kind: "project" })}
                    >
                      ${t("taskfoldProject.newProject")}
                    </button>
                  `
                : html`<p>${t("taskfoldProject.emptyWorkspace")}</p>`}
            </div>
          `}
    </section>
  `;
}

type TaskfoldBoardColumn = {
  id: string;
  title: string;
  subtitle?: string;
  cards: TaskfoldCard[];
  milestone?: TaskfoldMilestone;
  requirement?: TaskfoldCard;
  manualOrder?: { milestoneId?: string; cards: TaskfoldCard[] };
  /** 状态列的强调色（项目自定义状态的 `color`）。 */
  accent?: string;
  onDrop: (cardId: string) => void;
  onCreate: () => void;
  /** 列底就地新建时附带的字段（状态 / 里程碑 / 需求 / 负责人）。 */
  quickCreate: Record<string, string>;
};

const LABEL_COLOR_COUNT = 6;
const MAX_VISIBLE_LABELS = 3;

/** 标签没有颜色存储：用文本哈希得到稳定的色号，同一标签在任何卡片上颜色一致。 */
function labelColorIndex(label: string): number {
  let hash = 0;
  for (const char of label) {
    hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  }
  return hash % LABEL_COLOR_COUNT;
}

function renderCardLabels(labels: readonly string[]) {
  if (labels.length === 0) {
    return nothing;
  }
  const hidden = labels.length - MAX_VISIBLE_LABELS;
  return html`
    <span class="taskfold-project__card-labels">
      ${labels.slice(0, MAX_VISIBLE_LABELS).map(
        (label) =>
          html`<span class="taskfold-project__label tf-label-${labelColorIndex(label)}" title=${label}>${label}</span>`,
      )}
      ${hidden > 0
        ? html`<span class="taskfold-project__label tf-label-more" title=${labels.slice(MAX_VISIBLE_LABELS).join(", ")}>+${hidden}</span>`
        : nothing}
    </span>
  `;
}

function renderCard(
  controller: TaskfoldProjectViewController,
  card: TaskfoldCard,
  options: { manualOrder?: { milestoneId?: string; cards: TaskfoldCard[] } } = {},
) {
  const { state } = controller;
  const project = state.project;
  if (!project) {
    return nothing;
  }
  const archived = isArchivedCard(card);
  const isProjectArchived = Boolean(project.board.archivedAt);
  const registry = statusRegistryOf(project);
  const finished = isFinishedCard(card, registry);
  const completed = isCompletedCard(card, registry);
  const mark = cardMark(card, registry);
  const orderedCards = options.manualOrder?.cards ?? [];
  const cardIndex = orderedCards.findIndex((candidate) => candidate.id === card.id);
  const previousCard = orderedCards[cardIndex - 1];
  const nextCard = orderedCards[cardIndex + 1];
  return html`
    <article
      class="taskfold-project__card ${archived ? "tf-is-archived" : ""} ${isRequirementCard(card) ? "tf-is-requirement" : ""} ${finished ? "tf-is-done" : ""} ${state.draggedCardId === card.id ? "tf-is-dragging" : ""}"
      draggable=${!archived && !isProjectArchived}
      @dragstart=${(event: DragEvent) => {
        state.draggedCardId = card.id;
        event.dataTransfer?.setData("text/plain", card.id);
        event.dataTransfer && (event.dataTransfer.effectAllowed = "move");
        controller.requestUpdate();
      }}
      @dragend=${() => {
        state.draggedCardId = null;
        state.dragOverColumnId = null;
        controller.requestUpdate();
      }}
      @dragover=${(event: DragEvent) => event.preventDefault()}
      @drop=${(event: DragEvent) => {
        // 只有手动排序（里程碑分组）才在卡片上处理落点；其余情况让事件冒泡到列，由列处理跨列移动。
        if (!options.manualOrder) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        state.dragOverColumnId = null;
        const id = event.dataTransfer?.getData("text/plain") || state.draggedCardId;
        if (id && id !== card.id) {
          controller.moveCardMilestone(
            id,
            options.manualOrder.milestoneId,
            Math.max(0, card.position - 1),
          );
        }
      }}
    >
      <input
        class="taskfold-project__card-check"
        type="checkbox"
        aria-label=${t("taskfoldProject.markDone")}
        title=${t("taskfoldProject.markDone")}
        .checked=${completed}
        ?disabled=${archived || isProjectArchived || !controller.connected}
        @change=${(event: Event) =>
          controller.updateCardStatus(
            card.id,
            checkedStatusFor(registry, (event.currentTarget as HTMLInputElement).checked),
          )}
      />
      <button
        class="taskfold-project__card-main"
        type="button"
        @click=${() => controller.openModal({ kind: "card-detail", cardId: card.id })}
      >
        <span class="taskfold-project__priority tf-priority-${card.priority}"></span>
        <span class="taskfold-project__card-title">${card.title}</span>
        ${mark ? renderCardMark(card, mark, controller.locale) : nothing}
        ${card.notes ? html`<span class="taskfold-project__card-notes" title=${plainTextFromMarkdown(card.notes)}>${plainTextFromMarkdown(card.notes)}</span>` : nothing}
        ${renderCardLabels(card.labels)}
        ${card.delivery
          ? html`
              <span class="taskfold-project__delivery-badges">
                ${card.delivery.implementationState
                  ? html`<small>${deliveryStateLabel(
                      "implementation",
                      card.delivery.implementationState,
                    )}</small>`
                  : nothing}
                ${card.delivery.verificationState
                  ? html`<small>${deliveryStateLabel(
                      "verification",
                      card.delivery.verificationState,
                    )}</small>`
                  : nothing}
                ${card.delivery.releaseState
                  ? html`<small>${deliveryStateLabel("release", card.delivery.releaseState)}</small>`
                  : nothing}
              </span>
            `
          : nothing}
      </button>
      ${options.manualOrder
        ? html`<div class="taskfold-project__card-order">
            ${renderOrderControls({
              canMoveUp: !archived && !isProjectArchived && Boolean(previousCard),
              canMoveDown: !archived && !isProjectArchived && Boolean(nextCard),
              onMoveUp: () =>
                previousCard &&
                controller.moveCardMilestone(
                  card.id,
                  options.manualOrder?.milestoneId,
                  Math.max(0, previousCard.position - 1),
                ),
              onMoveDown: () =>
                nextCard &&
                controller.moveCardMilestone(
                  card.id,
                  options.manualOrder?.milestoneId,
                  nextCard.position + 1,
                ),
            })}
          </div>`
        : nothing}
      ${archived ? html`<span class="taskfold-project__card-archived">${t("taskfoldProject.archived")}</span>` : nothing}
    </article>
  `;
}

/** 列底的就地新建：按钮点开后是一行输入框，Enter 创建、Esc 取消。 */
const ADD_MILESTONE_COLUMN = "__add-milestone";

/** 里程碑分组末尾的虚线列：点开是行内输入框，回车创建里程碑。 */
function renderAddMilestoneColumn(controller: TaskfoldProjectViewController) {
  const { state } = controller;
  const editing = state.quickAddColumnId === ADD_MILESTONE_COLUMN;
  const close = () => {
    state.quickAddColumnId = null;
    controller.requestUpdate();
  };
  return html`
    <section class="taskfold-project__add-column">
      ${editing
        ? html`
            <input
              class="taskfold-project__quick-input"
              type="text"
              placeholder=${t("taskfoldProject.addMilestonePlaceholder")}
              aria-label=${t("taskfoldProject.newMilestone")}
              @keydown=${(event: KeyboardEvent) => {
                if (event.isComposing) {
                  return;
                }
                if (event.key === "Escape") {
                  close();
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  const title = (event.currentTarget as HTMLInputElement).value.trim();
                  if (title) {
                    controller.saveMilestone({ title });
                  }
                  close();
                }
              }}
              @blur=${(event: FocusEvent) => {
                if (!(event.currentTarget as HTMLInputElement).value.trim()) {
                  close();
                }
              }}
            />
          `
        : html`
            <button
              class="taskfold-project__quick-add"
              type="button"
              ?disabled=${!controller.connected}
              @click=${(event: Event) => {
                const section = (event.currentTarget as HTMLElement).closest("section");
                state.quickAddColumnId = ADD_MILESTONE_COLUMN;
                controller.requestUpdate();
                setTimeout(() => section?.querySelector<HTMLInputElement>(".taskfold-project__quick-input")?.focus(), 0);
              }}
            >+ ${t("taskfoldProject.newMilestone")}</button>
          `}
    </section>
  `;
}

function renderQuickAdd(controller: TaskfoldProjectViewController, column: TaskfoldBoardColumn, disabled: boolean) {
  const { state } = controller;
  if (state.quickAddColumnId !== column.id) {
    return html`
      <button
        class="taskfold-project__quick-add"
        type="button"
        ?disabled=${disabled}
        @click=${(event: Event) => {
          const section = (event.currentTarget as HTMLElement).closest("section");
          state.quickAddColumnId = column.id;
          controller.requestUpdate();
          setTimeout(() => section?.querySelector<HTMLInputElement>(".taskfold-project__quick-input")?.focus(), 0);
        }}
      >+ ${t("taskfoldProject.newCard")}</button>
    `;
  }
  const close = () => {
    state.quickAddColumnId = null;
    controller.requestUpdate();
  };
  return html`
    <input
      class="taskfold-project__quick-input"
      type="text"
      placeholder=${t("taskfoldProject.quickAddPlaceholder")}
      aria-label=${t("taskfoldProject.cardTitle")}
      @keydown=${(event: KeyboardEvent) => {
        if (event.isComposing) {
          return;
        }
        if (event.key === "Escape") {
          close();
        } else if (event.key === "Enter") {
          event.preventDefault();
          const title = (event.currentTarget as HTMLInputElement).value.trim();
          if (title) {
            controller.createCard({ title, priority: "normal", ...column.quickCreate });
          }
          close();
        }
      }}
      @blur=${(event: FocusEvent) => {
        if (!(event.currentTarget as HTMLInputElement).value.trim()) {
          close();
        }
      }}
    />
  `;
}

function renderColumn(controller: TaskfoldProjectViewController, params: TaskfoldBoardColumn) {
  const { state } = controller;
  const projectArchived = Boolean(state.project?.board.archivedAt);
  const { milestone } = params;
  const milestones = state.project?.milestones ?? [];
  const moveMilestoneUp = milestone
    ? reorderVisibleItemIds(milestones, milestones, milestone.id, -1)
    : undefined;
  const moveMilestoneDown = milestone
    ? reorderVisibleItemIds(milestones, milestones, milestone.id, 1)
    : undefined;
  const menuOpen = state.columnMenuId === params.id;
  const closeMenu = () => {
    if (state.columnMenuId === params.id) {
      state.columnMenuId = null;
      controller.requestUpdate();
    }
  };
  return html`
    <section
      class="taskfold-project__column ${milestone ? `tf-is-${milestone.state}` : "tf-is-unassigned"} ${state.dragOverColumnId === params.id ? "tf-is-drag-over" : ""} ${params.accent ? "tf-has-accent" : ""}"
      style=${params.accent && isSafeCssColor(params.accent) ? `--tf-column-accent: ${params.accent}` : nothing}
      @dragover=${(event: DragEvent) => {
        event.preventDefault();
        if (state.draggedCardId && state.dragOverColumnId !== params.id) {
          state.dragOverColumnId = params.id;
          controller.requestUpdate();
        }
      }}
      @dragleave=${(event: DragEvent) => {
        const target = event.relatedTarget as Node | null;
        if (state.dragOverColumnId === params.id && !(target && (event.currentTarget as HTMLElement).contains(target))) {
          state.dragOverColumnId = null;
          controller.requestUpdate();
        }
      }}
      @drop=${(event: DragEvent) => {
        event.preventDefault();
        state.dragOverColumnId = null;
        const id = event.dataTransfer?.getData("text/plain") || state.draggedCardId;
        if (id) {
          params.onDrop(id);
        }
      }}
    >
      <header class="taskfold-project__column-header" title=${params.subtitle ?? ""}>
        ${params.requirement
          ? html`
              <button
                class="taskfold-project__column-title-button"
                type="button"
                @click=${() =>
                  controller.openModal({ kind: "card-detail", cardId: params.requirement!.id })}
              >${params.title}</button>
            `
          : html`<h2>${params.title}</h2>`}
        <span class="taskfold-project__column-count">${params.cards.length}</span>
        ${milestone && milestone.state !== "active" && params.subtitle
          ? html`<span class="taskfold-project__column-state">${params.subtitle}</span>`
          : nothing}
        <div
          class="taskfold-project__column-menu ${menuOpen ? "is-open" : ""}"
          @focusout=${(event: FocusEvent) => {
            if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) {
              closeMenu();
            }
          }}
        >
          <button
            class="taskfold-project__icon-button"
            type="button"
            aria-haspopup="menu"
            aria-expanded=${menuOpen}
            aria-label=${t("taskfoldProject.more")}
            title=${t("taskfoldProject.more")}
            @click=${() => {
              state.columnMenuId = menuOpen ? null : params.id;
              controller.requestUpdate();
            }}
          >&#8942;</button>
          ${menuOpen
            ? html`
                <div class="taskfold-project__card-menu-list" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    ?disabled=${!controller.connected || projectArchived || (milestone && milestone.state !== "active")}
                    @click=${() => {
                      closeMenu();
                      params.onCreate();
                    }}
                  >${t("taskfoldProject.newCard")}</button>
                  ${milestone
                    ? html`
                        <button
                          type="button"
                          role="menuitem"
                          ?disabled=${projectArchived || !moveMilestoneUp}
                          @click=${() => {
                            closeMenu();
                            moveMilestoneUp && controller.reorderMilestones(moveMilestoneUp);
                          }}
                        >${t("taskfoldProject.moveUp")}</button>
                        <button
                          type="button"
                          role="menuitem"
                          ?disabled=${projectArchived || !moveMilestoneDown}
                          @click=${() => {
                            closeMenu();
                            moveMilestoneDown && controller.reorderMilestones(moveMilestoneDown);
                          }}
                        >${t("taskfoldProject.moveDown")}</button>
                        <button
                          type="button"
                          role="menuitem"
                          @click=${() => {
                            closeMenu();
                            controller.openModal({ kind: "milestone", milestone });
                          }}
                        >${t("taskfoldProject.editMilestone")}</button>
                        ${milestone.state === "active"
                          ? html`
                              <button
                                type="button"
                                role="menuitem"
                                @click=${() => {
                                  closeMenu();
                                  controller.completeMilestone(milestone.id);
                                }}
                              >${t("taskfoldProject.completeMilestone")}</button>
                              <button
                                type="button"
                                role="menuitem"
                                @click=${() => {
                                  closeMenu();
                                  controller.archiveMilestone(milestone.id, true);
                                }}
                              >${t("taskfoldProject.archiveMilestone")}</button>
                            `
                          : html`
                              <button
                                type="button"
                                role="menuitem"
                                @click=${() => {
                                  closeMenu();
                                  controller.archiveMilestone(milestone.id, false);
                                }}
                              >${t("taskfoldProject.restoreMilestone")}</button>
                            `}
                      `
                    : nothing}
                </div>
              `
            : nothing}
        </div>
      </header>
      <div class="taskfold-project__card-list">
        ${params.cards.length
          ? params.cards.map((card) => renderCard(controller, card, { manualOrder: params.manualOrder }))
          : html`<p class="taskfold-project__empty-column">${t("taskfoldProject.emptyColumn")}</p>`}
        ${renderQuickAdd(
          controller,
          params,
          !controller.connected || projectArchived || Boolean(milestone && milestone.state !== "active"),
        )}
      </div>
    </section>
  `;
}

/** 列表视图：与看板同一份卡片（同一个 `project.cards`），换成表格渲染；排序与看板控件共用。 */
function renderCardList(controller: TaskfoldProjectViewController, cards: readonly TaskfoldCard[]) {
  const project = controller.state.project;
  if (!project) {
    return nothing;
  }
  const registry = statusRegistryOf(project);
  const milestones = new Map(project.milestones.map((milestone) => [milestone.id, milestone]));
  return html`
    <section class="taskfold-project__list" aria-label=${t("taskfoldProject.list")}>
      ${cards.length === 0
        ? html`<p class="taskfold-project__empty-column">${t("taskfoldProject.emptyColumn")}</p>`
        : html`
            <table>
              <thead>
                <tr>
                  <th class="taskfold-project__list-check" scope="col">
                    <span class="taskfold-project__sr-only">${t("taskfoldProject.markDone")}</span>
                  </th>
                  <th scope="col">${t("taskfoldProject.cardNumber")}</th>
                  <th scope="col">${t("taskfoldProject.columnTitle")}</th>
                  <th scope="col">${t("taskfoldProject.status")}</th>
                  <th scope="col">${t("taskfoldProject.priority")}</th>
                  <th scope="col">${t("taskfoldProject.milestone")}</th>
                  <th scope="col">${t("taskfoldProject.assignee")}</th>
                  <th scope="col">${t("taskfoldProject.updatedAt")}</th>
                </tr>
              </thead>
              <tbody>
                ${cards.map((card) => renderCardListRow(controller, card, registry, milestones))}
              </tbody>
            </table>
          `}
    </section>
  `;
}

function renderCardListRow(
  controller: TaskfoldProjectViewController,
  card: TaskfoldCard,
  registry: TaskfoldStatusRegistry,
  milestones: ReadonlyMap<string, TaskfoldMilestone>,
) {
  const archived = isArchivedCard(card);
  const isProjectArchived = Boolean(controller.state.project?.board.archivedAt);
  const finished = isFinishedCard(card, registry);
  const completed = isCompletedCard(card, registry);
  const mark = cardMark(card, registry);
  const milestone = card.milestoneId ? milestones.get(card.milestoneId) : undefined;
  return html`
    <tr class="taskfold-project__list-row ${finished ? "tf-is-done" : ""}">
      <td class="taskfold-project__list-check">
        <input
          class="taskfold-project__card-check"
          type="checkbox"
          aria-label=${t("taskfoldProject.markDone")}
          title=${t("taskfoldProject.markDone")}
          .checked=${completed}
          ?disabled=${archived || isProjectArchived || !controller.connected}
          @change=${(event: Event) =>
            controller.updateCardStatus(
              card.id,
              checkedStatusFor(registry, (event.currentTarget as HTMLInputElement).checked),
            )}
        />
      </td>
      <td class="taskfold-project__list-number">${card.displayId ?? "—"}</td>
      <td class="taskfold-project__list-title">
        <button
          type="button"
          @click=${() => controller.openModal({ kind: "card-detail", cardId: card.id })}
        >${card.title}</button>
        ${mark ? renderCardMark(card, mark, controller.locale) : nothing}
      </td>
      <td>${statusLabel(displayStatusId(card, registry), registry, t)}</td>
      <td class="taskfold-project__list-priority">
        <span class="taskfold-project__priority tf-priority-${card.priority}"></span>
        ${t(`taskfoldProject.priorityValue.${card.priority}`)}
      </td>
      <td>${milestone ? milestone.title : t("taskfoldProject.unassigned")}</td>
      <td>${card.agentId || "—"}</td>
      <td>${new Date(card.updatedAt).toLocaleString(controller.locale)}</td>
    </tr>
  `;
}

function renderBoard(controller: TaskfoldProjectViewController) {
  const { state } = controller;
  const project = state.project;
  if (!project) {
    return nothing;
  }
  const view = boardView(project.board);
  // 列表视图缺省关：旧数据没有 layout 字段，缺省语义就是 "board"。
  const layout = view.layout ?? "board";
  const cards = project.cards.filter((card) => !isArchivedCard(card));
  const columns: TaskfoldBoardColumn[] = [];
  const sorted = (items: readonly TaskfoldCard[]) => sortBoardCards(items, view);
  if (view.groupBy === "milestone") {
    const byMilestone = new Map<string | undefined, TaskfoldCard[]>();
    for (const card of cards) {
      const current = byMilestone.get(card.milestoneId) ?? [];
      current.push(card);
      byMilestone.set(card.milestoneId, current);
    }
    const manualOrder = view.sortBy === "manual";
    columns.push({
      id: "unassigned",
      title: t("taskfoldProject.unassigned"),
      subtitle: t("taskfoldProject.unassignedHelp"),
      cards: sorted(byMilestone.get(undefined) ?? []),
      ...(manualOrder
        ? { manualOrder: { cards: sorted(byMilestone.get(undefined) ?? []) } }
        : {}),
      onDrop: (id) => controller.moveCardMilestone(id),
      onCreate: () => controller.openModal({ kind: "card" }),
      quickCreate: {},
    });
    for (const milestone of project.milestones) {
      const columnCards = sorted(byMilestone.get(milestone.id) ?? []);
      columns.push({
        id: milestone.id,
        title: milestone.title,
        subtitle: milestoneLabel(milestone),
        cards: columnCards,
        milestone,
        ...(manualOrder ? { manualOrder: { milestoneId: milestone.id, cards: columnCards } } : {}),
        onDrop: (id) => controller.moveCardMilestone(id, milestone.id),
        onCreate: () => controller.openModal({ kind: "card", milestoneId: milestone.id }),
        quickCreate: { milestoneId: milestone.id },
      });
    }
  } else if (view.groupBy === "requirement") {
    const requirements = cards.filter(
      (card) => isRequirementCard(card) && !cardRequirementId(card),
    );
    const byRequirement = new Map<string | undefined, TaskfoldCard[]>();
    for (const card of cards) {
      if (isRequirementCard(card)) {
        continue;
      }
      const requirementId = cardRequirementId(card);
      const current = byRequirement.get(requirementId) ?? [];
      current.push(card);
      byRequirement.set(requirementId, current);
    }
    columns.push({
      id: "unassigned",
      title: t("taskfoldProject.unassigned"),
      subtitle: t("taskfoldProject.unassignedRequirementHelp"),
      cards: sorted(byRequirement.get(undefined) ?? []),
      onDrop: (id) => controller.moveCardRequirement(id),
      onCreate: () => controller.openModal({ kind: "card" }),
      quickCreate: {},
    });
    for (const requirement of requirements) {
      columns.push({
        id: requirement.id,
        title: requirement.title,
        subtitle: t("taskfoldProject.cards", {
          count: String((byRequirement.get(requirement.id) ?? []).length),
        }),
        cards: sorted(byRequirement.get(requirement.id) ?? []),
        requirement,
        onDrop: (id) => controller.moveCardRequirement(id, requirement.id),
        onCreate: () =>
          controller.openModal({
            kind: "card",
            requirementId: requirement.id,
            milestoneId: requirement.milestoneId,
          }),
        quickCreate: {
          requirementId: requirement.id,
          ...(requirement.milestoneId ? { milestoneId: requirement.milestoneId } : {}),
        },
      });
    }
  } else if (view.groupBy === "assignee") {
    const byAgent = new Map<string, TaskfoldCard[]>();
    for (const card of cards) {
      const key = card.agentId ?? "";
      const current = byAgent.get(key) ?? [];
      current.push(card);
      byAgent.set(key, current);
    }
    const agents = [...byAgent.keys()].filter(Boolean).toSorted();
    for (const agentId of ["", ...agents]) {
      columns.push({
        id: agentId ? `agent:${agentId}` : "unassigned",
        title: agentId || t("taskfoldProject.unassigned"),
        cards: sorted(byAgent.get(agentId) ?? []),
        onDrop: (id) => controller.updateCardAgent(id, agentId),
        onCreate: () => controller.openModal({ kind: "card" }),
        quickCreate: agentId ? { agentId } : {},
      });
    }
  } else {
    const statusRegistry = statusRegistryOf(project);
    const byStatus = new Map<TaskfoldStatus, TaskfoldCard[]>();
    for (const card of cards) {
      const status = displayStatusId(card, statusRegistry);
      const current = byStatus.get(status) ?? [];
      current.push(card);
      byStatus.set(status, current);
    }
    for (const column of boardStatusColumns(statusRegistry, cards)) {
      const status = column.id;
      columns.push({
        id: status,
        title: statusLabel(status, statusRegistry, t),
        subtitle: column.definition ? t(`taskfoldProject.statusCategory.${column.definition.category}`) : undefined,
        accent: column.definition?.color,
        cards: sorted(byStatus.get(status) ?? []),
        onDrop: (id) => controller.updateCardStatus(id, status),
        onCreate: () => controller.openModal({ kind: "card", status }),
        quickCreate: { status },
      });
    }
  }
  return html`
    <section class="taskfold-project__board">
      <div class="taskfold-project__section-heading">
        <div>
          <h1>${boardName(project.board)}</h1>
          <p>${project.board.currentObjective || project.board.description || project.board.id}</p>
        </div>
        <div class="taskfold-project__board-controls">
          <div class="taskfold-project__segmented" role="group" aria-label=${t("taskfoldProject.viewMode")}>
            ${BOARD_LAYOUTS.map(
              (mode) => html`
                <button
                  type="button"
                  class=${mode === layout ? "tf-is-active" : ""}
                  aria-pressed=${mode === layout ? "true" : "false"}
                  @click=${() => mode !== layout && controller.updateBoardView({ ...view, layout: mode })}
                >${t(mode === "board" ? "taskfoldProject.board" : "taskfoldProject.list")}</button>
              `,
            )}
          </div>
          ${layout === "board"
            ? html`
                <div class="taskfold-project__segmented" role="group" aria-label=${t("taskfoldProject.groupBy")}>
                  ${BOARD_GROUPS.map(
                    (groupBy) => html`
                      <button
                        type="button"
                        class=${groupBy === view.groupBy ? "tf-is-active" : ""}
                        aria-pressed=${groupBy === view.groupBy ? "true" : "false"}
                        @click=${() =>
                          groupBy !== view.groupBy &&
                          controller.updateBoardView({
                            groupBy,
                            sortBy: groupBy === "milestone" ? view.sortBy : view.sortBy === "manual" ? "priority" : view.sortBy,
                            sortDirection: view.sortDirection,
                          })}
                      >${t(`taskfoldProject.groupBy${groupBy[0].toUpperCase()}${groupBy.slice(1)}`)}</button>
                    `,
                  )}
                </div>
              `
            : nothing}
          <label>
            ${t("taskfoldProject.sortBy")}
            <select
              @change=${(event: Event) =>
                controller.updateBoardView({
                  ...view,
                  sortBy: (event.currentTarget as HTMLSelectElement).value as TaskfoldBoardSortBy,
                })}
            >
              ${BOARD_SORTS.filter((sortBy) => view.groupBy === "milestone" || sortBy !== "manual").map(
                (sortBy) =>
                  html`<option value=${sortBy} .selected=${sortBy === view.sortBy}>${t(`taskfoldProject.sortBy${sortBy[0].toUpperCase()}${sortBy.slice(1)}`)}</option>`,
              )}
            </select>
          </label>
          <label>
            ${t("taskfoldProject.sortDirection")}
            <select
              @change=${(event: Event) =>
                controller.updateBoardView({
                  ...view,
                  sortDirection: (event.currentTarget as HTMLSelectElement).value as TaskfoldBoardSortDirection,
                })}
            >
              ${BOARD_SORT_DIRECTIONS.map(
                (direction) =>
                  html`<option value=${direction} .selected=${direction === view.sortDirection}>${t(`taskfoldProject.sortDirection${direction[0].toUpperCase()}${direction.slice(1)}`)}</option>`,
              )}
            </select>
          </label>
        </div>
        <div class="taskfold-project__heading-actions">
          ${project.board.archivedAt
            ? controller.projectManagementEnabled
              ? html`
                  <button class="tf-btn" type="button" @click=${() => controller.archiveProject(false)}>
                    ${t("taskfoldProject.restoreProject")}
                  </button>
                `
              : nothing
            : html`
                ${layout === "board" && view.groupBy === "milestone"
                  ? html`
                      <button
                        class="tf-btn"
                        type="button"
                        ?disabled=${!controller.connected}
                        @click=${() => controller.openModal({ kind: "milestone" })}
                      >
                        ${t("taskfoldProject.newMilestone")}
                      </button>
                    `
                  : nothing}
                ${view.groupBy === "requirement"
                  ? html`
                      <button
                        class="tf-btn"
                        type="button"
                        ?disabled=${!controller.connected}
                        @click=${() =>
                          controller.openModal({ kind: "card", cardKind: "requirement" })}
                      >
                        ${t("taskfoldProject.newRequirement")}
                      </button>
                    `
                  : nothing}
                <button
                  class="tf-btn tf-btn--primary"
                  type="button"
                  ?disabled=${!controller.connected}
                  @click=${() => controller.openModal({ kind: "card" })}
                >
                  ${t("taskfoldProject.newCard")}
                </button>
              `}
        </div>
      </div>
      ${project.board.archivedAt
        ? html`<div class="tf-callout">${t("taskfoldProject.projectArchived")}</div>`
        : nothing}
      ${layout === "list"
        ? renderCardList(controller, sorted(cards))
        : html`
            <div class="taskfold-project__kanban" aria-label=${t("taskfoldProject.board")} ${ref(fitToViewport)}>
              ${columns.map((column) => renderColumn(controller, column))}
              ${view.groupBy === "milestone" && !project.board.archivedAt
                ? renderAddMilestoneColumn(controller)
                : nothing}
            </div>
          `}
    </section>
  `;
}

function renderGraph(controller: TaskfoldProjectViewController) {
  const { state } = controller;
  const project = state.project;
  if (!project) return nothing;
  const filter = state.graphFilter;
  const model = buildGraphModel(project, state.graphMode, filter, {
    requirements: t("taskfoldProject.graphRequirements"),
    noMilestone: t("taskfoldProject.unassigned"),
    status: (value) => statusLabel(value, statusRegistryOf(project), t),
  });
  const selected = model.nodes.find((node) => node.id === state.graphSelectedId);
  const selectedCard = selected?.cardId
    ? project.cards.find((card) => card.id === selected.cardId)
    : undefined;
  const tags = [...new Set(project.cards.flatMap((card) => card.labels))].toSorted();
  const relationTypes = ["parent", "blocks", "relates_to"] as const;
  const currentEdges = model.edges.filter((edge) => edge.relation !== "contains");
  const canvas = (event: Event) =>
    (event.currentTarget as HTMLElement).closest(".taskfold-project__graph")
      ?.querySelector<import("./graph-canvas.ts").TaskfoldGraphCanvas>("taskfold-graph-canvas");
  const createAtSelection = () => {
    if (selected?.kind === "requirement") {
      controller.openModal({ kind: "card", requirementId: selected.id, milestoneId: selectedCard?.milestoneId });
    } else if (selectedCard) {
      controller.openModal({
        kind: "card",
        milestoneId: selectedCard.milestoneId,
        requirementId: cardRequirementId(selectedCard),
        relatedCardId: selectedCard.id,
      });
    } else if (selected?.id.startsWith("milestone:") && selected.id !== "milestone:none") {
      controller.openModal({ kind: "card", milestoneId: selected.id.slice("milestone:".length) });
    } else if (selected?.id.startsWith("status:")) {
      controller.openModal({ kind: "card", status: selected.id.slice("status:".length) as TaskfoldStatus });
    } else {
      controller.openModal({ kind: "card" });
    }
  };
  return html`
    <section class="taskfold-project__graph">
      <div class="taskfold-project__section-heading">
        <div>
          <h1>${t("taskfoldProject.graph")}</h1>
          <p>${project.board.currentObjective || project.board.description || project.board.id}</p>
        </div>
        <div class="taskfold-project__heading-actions">
          <div class="taskfold-project__graph-mode" role="group" aria-label=${t("taskfoldProject.graphMode")}>
            <button class=${state.graphMode === "mindmap" ? "tf-is-active" : ""} type="button"
              @click=${() => controller.setGraphMode("mindmap")}>${t("taskfoldProject.mindMap")}</button>
            <button class=${state.graphMode === "flow" ? "tf-is-active" : ""} type="button"
              @click=${() => controller.setGraphMode("flow")}>${t("taskfoldProject.flowChart")}</button>
          </div>
          <button class="taskfold-project__icon-button" type="button" title=${t("taskfoldProject.zoomOut")} aria-label=${t("taskfoldProject.zoomOut")}
            @click=${(event: Event) => canvas(event)?.zoomBy(0.8)}>−</button>
          <button class="taskfold-project__icon-button" type="button" title=${t("taskfoldProject.fitGraph")} aria-label=${t("taskfoldProject.fitGraph")}
            @click=${(event: Event) => canvas(event)?.fit()}>□</button>
          <button class="taskfold-project__icon-button" type="button" title=${t("taskfoldProject.zoomIn")} aria-label=${t("taskfoldProject.zoomIn")}
            @click=${(event: Event) => canvas(event)?.zoomBy(1.25)}>+</button>
        </div>
      </div>
      <div class="taskfold-project__graph-filters">
        <input type="search" aria-label=${t("taskfoldProject.graphSearch")} placeholder=${t("taskfoldProject.graphSearch")}
          .value=${filter.query} @input=${(event: Event) => { filter.query = (event.currentTarget as HTMLInputElement).value; controller.requestUpdate(); }} />
        <select aria-label=${t("taskfoldProject.graphMilestone")}
          @change=${(event: Event) => { filter.milestoneId = (event.currentTarget as HTMLSelectElement).value; controller.requestUpdate(); }}>
          <option value="" ?selected=${!filter.milestoneId}>${t("taskfoldProject.graphAllMilestones")}</option>
          ${project.milestones.map((milestone) => html`<option value=${milestone.id} ?selected=${filter.milestoneId === milestone.id}>${milestone.title}</option>`)}
        </select>
        <select aria-label=${t("taskfoldProject.graphStatus")}
          @change=${(event: Event) => { filter.status = (event.currentTarget as HTMLSelectElement).value; controller.requestUpdate(); }}>
          <option value="" ?selected=${!filter.status}>${t("taskfoldProject.graphAllStatuses")}</option>
          ${statusRegistryOf(project).ids.map((status) => html`<option value=${status} ?selected=${filter.status === status}>${statusLabel(status, statusRegistryOf(project), t)}</option>`)}
        </select>
        <select aria-label=${t("taskfoldProject.graphTag")}
          @change=${(event: Event) => { filter.tag = (event.currentTarget as HTMLSelectElement).value; controller.requestUpdate(); }}>
          <option value="" ?selected=${!filter.tag}>${t("taskfoldProject.graphAllTags")}</option>
          ${tags.map((tag) => html`<option value=${tag} ?selected=${filter.tag === tag}>${tag}</option>`)}
        </select>
        ${state.graphMode === "flow" ? html`
          <select aria-label=${t("taskfoldProject.graphRelation")}
            @change=${(event: Event) => { filter.relation = (event.currentTarget as HTMLSelectElement).value as GraphFilter["relation"]; controller.requestUpdate(); }}>
            <option value="all" ?selected=${filter.relation === "all"}>${t("taskfoldProject.graphAllRelations")}</option>
            ${(["contains", ...relationTypes] as GraphRelation[]).map((relation) => html`
              <option value=${relation} ?selected=${filter.relation === relation}>${t(`taskfoldProject.graphRelation_${relation}`)}</option>`)}
          </select>` : nothing}
        <select aria-label=${t("taskfoldProject.graphFocus")}
          @change=${(event: Event) => { filter.focusCardId = (event.currentTarget as HTMLSelectElement).value; controller.requestUpdate(); }}>
          <option value="" ?selected=${!filter.focusCardId}>${t("taskfoldProject.graphAllCards")}</option>
          ${project.cards.filter((card) => !isArchivedCard(card)).map((card) => html`
            <option value=${card.id} ?selected=${filter.focusCardId === card.id}>${card.title}</option>`)}
        </select>
      </div>
      ${model.truncated ? html`<div class="tf-callout">${t("taskfoldProject.graphLimitReached")}</div>` : nothing}
      ${state.graphMode === "flow" && model.nodes.length > 0 && currentEdges.length === 0
        ? html`<div class="tf-callout">${t("taskfoldProject.graphNoRelations")}</div>` : nothing}
      <div class="taskfold-project__graph-workspace">
        <div class="taskfold-project__graph-viewport">
          <taskfold-graph-canvas
            .model=${model} .mode=${state.graphMode} .editable=${state.graphMode === "mindmap" && !project.board.archivedAt && controller.connected}
            @graph-select=${(event: CustomEvent<{ id: string }>) => { state.graphSelectedId = event.detail.id; controller.requestUpdate(); }}
            @graph-error=${(event: CustomEvent<{ error: unknown }>) => { state.error = String(event.detail.error); controller.requestUpdate(); }}
            @graph-open=${(event: CustomEvent<{ id: string }>) => {
              if (project.cards.some((card) => card.id === event.detail.id)) controller.openModal({ kind: "card-detail", cardId: event.detail.id });
            }}
            @graph-drop=${(event: CustomEvent<{ source: string; target: string }>) => {
              const action = resolveGraphDrop(project, event.detail.source, event.detail.target);
              if (!action) return;
              if (action.kind === "requirement") controller.moveCardRequirement(event.detail.source, action.requirementId);
              else if (action.kind === "milestone") controller.moveCardMilestone(event.detail.source, action.milestoneId);
              else controller.updateCardStatus(event.detail.source, action.status);
            }}
          ></taskfold-graph-canvas>
        </div>
        <aside class="taskfold-project__graph-inspector">
          <strong>${selected?.title ?? t("taskfoldProject.graphSelectNode")}</strong>
          ${selectedCard ? html`<small>${statusLabel(selectedCard.status, statusRegistryOf(project), t)} · ${selectedCard.priority} · ${selected?.childCount ?? 0}</small>` : nothing}
          <div class="taskfold-project__graph-inspector-actions">
            ${selectedCard ? html`<button type="button" @click=${() => controller.openModal({ kind: "card-detail", cardId: selectedCard.id })}>${t("taskfoldProject.graphOpenCard")}</button>` : nothing}
            <button type="button" ?disabled=${!controller.connected || Boolean(project.board.archivedAt)} @click=${createAtSelection}>${t("taskfoldProject.newCard")}</button>
            ${selected?.id.startsWith("milestone:") && selected.id !== "milestone:none" ? html`
              <button type="button" ?disabled=${!controller.connected || Boolean(project.board.archivedAt)}
                @click=${() => controller.openModal({ kind: "milestone" })}>${t("taskfoldProject.newMilestone")}</button>` : nothing}
            <button type="button" ?disabled=${!controller.connected || Boolean(project.board.archivedAt)}
              @click=${() => controller.openModal({ kind: "card", cardKind: "requirement" })}>${t("taskfoldProject.newRequirement")}</button>
            ${selected ? html`<button type="button" @click=${(event: Event) => canvas(event)?.focusNode(selected.id)}>${t("taskfoldProject.graphFocusNode")}</button>` : nothing}
          </div>
          ${state.graphMode === "flow" && selectedCard ? html`
            <div class="taskfold-project__graph-relation-editor">
              <h2>${t("taskfoldProject.graphEditRelations")}</h2>
              <select aria-label=${t("taskfoldProject.graphRelationTarget")}
                @change=${(event: Event) => { state.graphLinkTargetId = (event.currentTarget as HTMLSelectElement).value; controller.requestUpdate(); }}>
                <option value="" ?selected=${!state.graphLinkTargetId}>${t("taskfoldProject.graphRelationTarget")}</option>
                ${project.cards.filter((card) => !isArchivedCard(card) && card.id !== selectedCard.id).map((card) => html`
                  <option value=${card.id} ?selected=${state.graphLinkTargetId === card.id}>${card.title}</option>`)}
              </select>
              <select aria-label=${t("taskfoldProject.graphRelation")}
                @change=${(event: Event) => { state.graphLinkType = (event.currentTarget as HTMLSelectElement).value as typeof state.graphLinkType; controller.requestUpdate(); }}>
                ${relationTypes.map((relation) => html`<option value=${relation} ?selected=${state.graphLinkType === relation}>${t(`taskfoldProject.graphRelation_${relation}`)}</option>`)}
              </select>
              <button type="button" ?disabled=${!state.graphLinkTargetId || !controller.connected || Boolean(project.board.archivedAt)}
                @click=${() => controller.createGraphRelation(selectedCard.id, state.graphLinkTargetId, state.graphLinkType)}>${t("taskfoldProject.graphAddRelation")}</button>
              <div class="taskfold-project__graph-relation-list">
                ${currentEdges.filter((edge) => edge.source === selectedCard.id || edge.target === selectedCard.id).map((edge) => html`
                  <div><span>${t(`taskfoldProject.graphRelation_${edge.relation}`)}: ${model.nodes.find((node) => node.id === edge.source)?.title} → ${model.nodes.find((node) => node.id === edge.target)?.title}</span>
                    <button type="button" ?disabled=${!controller.connected || Boolean(project.board.archivedAt)}
                      @click=${() => controller.deleteGraphRelation(edge.source, edge.target, edge.relation as Exclude<GraphRelation, "contains">)}>${t("taskfoldProject.graphRemoveRelation")}</button></div>`)}
              </div>
            </div>` : nothing}
        </aside>
      </div>
      <p class="taskfold-project__graph-legend">${t("taskfoldProject.graphLegend")}</p>
    </section>
  `;
}

function renderSettings(controller: TaskfoldProjectViewController) {
  const project = controller.state.project;
  if (!project) {
    return nothing;
  }
  const workspacePath = project.board.defaultWorkspace?.path ?? "";
  return html`
    <section class="taskfold-project__settings">
      <div class="taskfold-project__section-heading">
        <div>
          <h1>${t("taskfoldProject.projectSettings")}</h1>
          <p>${project.board.id}</p>
        </div>
        ${project.board.archivedAt
          ? html`
              <button class="tf-btn" type="button" @click=${() => controller.archiveProject(false)}>
                ${t("taskfoldProject.restoreProject")}
              </button>
            `
          : html`
              <button class="tf-btn tf-btn--danger" type="button" @click=${() => controller.archiveProject(true)}>
                ${t("taskfoldProject.archiveProject")}
              </button>
            `}
      </div>
      <form
        class="taskfold-project__settings-form"
        @submit=${(event: SubmitEvent) => {
          event.preventDefault();
          controller.updateProject(readForm(event));
        }}
      >
        <label>
          ${t("taskfoldProject.projectName")}
          <input name="name" required .value=${project.board.name ?? ""} />
        </label>
        <label>
          ${t("taskfoldProject.version")}
          <input name="version" .value=${project.board.version ?? ""} />
        </label>
        <label class="taskfold-project__wide-field">
          ${t("taskfoldProject.currentObjective")}
          <textarea name="currentObjective" .value=${project.board.currentObjective ?? ""}></textarea>
        </label>
        <label class="taskfold-project__wide-field">
          ${t("taskfoldProject.coreValue")}
          <textarea name="coreValue" .value=${project.board.coreValue ?? ""}></textarea>
        </label>
        <label>
          ${t("taskfoldProject.sourceOfTruth")}
          <input name="sourceOfTruth" type="url" .value=${project.board.sourceOfTruth ?? ""} />
        </label>
        <label>
          ${t("taskfoldProject.repositoryUrl")}
          <input name="repositoryUrl" type="url" .value=${project.board.repositoryUrl ?? ""} />
        </label>
        <label>
          ${t("taskfoldProject.planningPath")}
          <input name="planningPath" .value=${project.board.planningPath ?? ""} />
        </label>
        <label>
          ${t("taskfoldProject.homepageUrl")}
          <input name="homepageUrl" type="url" .value=${project.board.homepageUrl ?? ""} />
        </label>
        <label class="taskfold-project__wide-field">
          ${t("taskfoldProject.defaultWorkspace")}
          <input name="workspacePath" .value=${workspacePath} />
          <small>${t("taskfoldProject.defaultWorkspaceHelp")}</small>
        </label>
        <div class="taskfold-project__form-actions">
          <button class="tf-btn tf-btn--primary" type="submit" ?disabled=${controller.state.busy}>
            ${t("taskfoldProject.updateProject")}
          </button>
        </div>
      </form>
    </section>
  `;
}

type DocumentIndexGroup = {
  id: string;
  label: string;
  documents: TaskfoldProjectDocument[];
};

function documentIndexGroups(
  documents: TaskfoldProjectDocument[],
): DocumentIndexGroup[] {
  return [
    {
      id: "project",
      label: t("taskfoldProject.groupProject"),
      documents: documents.filter(
        (document) => document.source === "project" && document.section === "project",
      ),
    },
    {
      id: "ai-system",
      label: t("taskfoldProject.groupAiSystem"),
      documents: documents.filter((document) => document.source === "ai_system"),
    },
    {
      id: "codebase",
      label: sectionLabel("codebase"),
      documents: documents.filter(
        (document) => document.source === "project" && document.section === "codebase",
      ),
    },
    {
      id: "environment",
      label: sectionLabel("environment"),
      documents: documents.filter(
        (document) => document.source === "project" && document.section === "environment",
      ),
    },
    {
      id: "knowledge",
      label: sectionLabel("knowledge"),
      documents: documents.filter(
        (document) => document.source === "project" && document.section === "knowledge",
      ),
    },
  ];
}

function renderDocumentIndex(
  controller: TaskfoldProjectViewController,
  documents: TaskfoldProjectDocument[],
) {
  const { state } = controller;
  const workspacePath = state.project?.board.defaultWorkspace?.path;
  return html`
    <nav class="taskfold-project__document-index">
      ${documentIndexGroups(documents).map(
        (group) => html`
          <details class="taskfold-project__document-group" open>
            <summary>
              <span>${group.label}</span>
              <small>${group.documents.length}</small>
            </summary>
            ${group.documents.length
              ? html`
                  <div class="taskfold-project__document-list">
                    ${group.documents.map(
                      (document) => html`
                        <button
                          class="taskfold-project__document-index-item ${document.hiddenAt
                            ? "tf-is-hidden"
                            : ""} ${document.id === state.selectedDocumentId ? "tf-is-selected" : ""}"
                          type="button"
                          title=${documentPathLabel(document.target, workspacePath) ??
                          documentTypeLabel(document.type)}
                          @click=${() => controller.openDocument(document.id)}
                        >
                          ${document.title}
                        </button>
                      `,
                    )}
                  </div>
                `
              : html`<p class="taskfold-project__empty-column">${t(
                  "taskfoldProject.noDocuments",
                )}</p>`}
          </details>
        `,
      )}
    </nav>
  `;
}

function renderDocuments(controller: TaskfoldProjectViewController) {
  const { state } = controller;
  const project = state.project;
  if (!project) {
    return nothing;
  }
  const query = state.documentQuery.trim().toLocaleLowerCase();
  const visibleDocuments = state.documents.filter((document) => {
    if (!state.showHiddenDocuments && document.hiddenAt) {
      return false;
    }
    if (state.documentSourceFilter !== "all" && document.source !== state.documentSourceFilter) {
      return false;
    }
    return (
      !query ||
      `${document.title} ${document.key} ${document.summary ?? ""} ${document.target ?? ""}`
        .toLocaleLowerCase()
        .includes(query)
    );
  });
  return html`
    <section class="taskfold-project__documents">
      <div class="taskfold-project__section-heading">
        <div>
          <h1>${t("taskfoldProject.documentLibrary")}</h1>
          <p>${boardName(project.board)}</p>
        </div>
        <div class="taskfold-project__heading-actions">
          <label class="taskfold-project__document-search">
            <span class="taskfold-project__sr-only">${t("taskfoldProject.searchDocuments")}</span>
            <input
              type="search"
              placeholder=${t("taskfoldProject.searchDocuments")}
              .value=${state.documentQuery}
              @input=${(event: InputEvent) => {
                state.documentQuery = (event.currentTarget as HTMLInputElement).value;
                controller.requestUpdate();
              }}
            />
          </label>
          <select
            class="taskfold-project__document-source-filter"
            aria-label=${t("taskfoldProject.documentSource")}
            .value=${state.documentSourceFilter}
            @change=${(event: Event) => {
              state.documentSourceFilter = (event.currentTarget as HTMLSelectElement)
                .value as TaskfoldProjectUiState["documentSourceFilter"];
              controller.requestUpdate();
            }}
          >
            <option value="all">${t("taskfoldProject.allDocumentSources")}</option>
            ${DOCUMENT_SOURCES.map(
              (source) =>
                html`<option value=${source}>${documentSourceLabel(source)}</option>`,
            )}
          </select>
          <label class="taskfold-project__checkbox">
            <input
              type="checkbox"
              .checked=${state.showHiddenDocuments}
              @change=${(event: Event) => {
                state.showHiddenDocuments = (event.currentTarget as HTMLInputElement).checked;
                controller.requestUpdate();
              }}
            />
            ${t("taskfoldProject.showHidden")}
          </label>
          <button
            class="tf-btn tf-btn--primary"
            type="button"
            @click=${() => controller.openModal({ kind: "document" })}
          >
            ${t("taskfoldProject.addDocument")}
          </button>
        </div>
      </div>
      <div class="taskfold-project__document-workspace">
        ${renderDocumentIndex(controller, visibleDocuments)}
        ${renderDocumentPreview(controller)}
      </div>
    </section>
  `;
}

function renderDocumentPreview(controller: TaskfoldProjectViewController) {
  const { state } = controller;
  const document =
    state.documents.find((candidate) => candidate.id === state.selectedDocumentId) ?? null;
  if (!document) {
    return html`
      <section class="taskfold-project__document-reader tf-is-empty">
        <p>${t("taskfoldProject.selectDocument")}</p>
      </section>
    `;
  }
  const preview = state.documentPreview;
  const editable =
    document.type === "markdown" || (document.type === "path" && preview?.source === "path");
  const draftContent = state.documentDraft;
  const dirty = draftContent !== null && draftContent !== preview?.content;
  const content = draftContent ?? preview?.content ?? "";
  const sectionDocuments = state.documents.filter(
    (candidate) => candidate.section === document.section,
  );
  const sameSourceDocuments = sectionDocuments.filter(
    (candidate) => candidate.source === document.source,
  );
  const moveUp = reorderVisibleItemIds(sectionDocuments, sameSourceDocuments, document.id, -1);
  const moveDown = reorderVisibleItemIds(sectionDocuments, sameSourceDocuments, document.id, 1);
  const displayPath = documentPathLabel(
    preview?.path ?? document.target,
    state.project?.board.defaultWorkspace?.path,
  );
  return html`
    <section class="taskfold-project__document-reader">
      <header>
        <div class="taskfold-project__document-reader-title">
          <div class="taskfold-project__document-reader-heading">
            <h2>${document.title}</h2>
            <span class="taskfold-project__document-source-tag">${documentSourceLabel(
              document.source,
            )}</span>
            ${dirty
              ? html`<span class="taskfold-project__document-unsaved">${t(
                  "taskfoldProject.unsavedDocument",
                )}</span>`
              : nothing}
          </div>
          <small>${displayPath ?? documentTypeLabel(document.type)}</small>
          ${displayPath && preview?.path && displayPath !== preview.path
            ? html`<small class="taskfold-project__document-full-path">${preview.path}</small>`
            : nothing}
        </div>
        <div class="taskfold-project__document-reader-actions">
          ${editable
            ? html`
                <button
                  class="tf-btn"
                  type="button"
                  ?disabled=${state.documentPreviewLoading || state.busy}
                  @click=${controller.startDocumentEdit}
                >${t("taskfoldProject.editDocumentContent")}</button>
              `
            : nothing}
          ${dirty
            ? html`
                <button
                  class="tf-btn"
                  type="button"
                  ?disabled=${state.busy}
                  @click=${controller.cancelDocumentEdit}
                >${t("common.cancel")}</button>
                <button
                  class="tf-btn tf-btn--primary"
                  type="button"
                  ?disabled=${state.busy || !preview}
                  @click=${controller.saveDocumentContent}
                >${t("taskfoldProject.saveDocument")}</button>
              `
            : nothing}
          <button
            class="taskfold-project__icon-button"
            type="button"
            title=${t("taskfoldProject.editDocument")}
            aria-label=${t("taskfoldProject.editDocument")}
            ?disabled=${state.busy}
            @click=${() => controller.openModal({ kind: "document", document })}
          >...</button>
          ${renderOrderControls({
            canMoveUp: Boolean(moveUp),
            canMoveDown: Boolean(moveDown),
            onMoveUp: () => moveUp && controller.reorderDocuments(moveUp),
            onMoveDown: () => moveDown && controller.reorderDocuments(moveDown),
          })}
          <button
            class="taskfold-project__icon-button"
            type="button"
            title=${document.hiddenAt ? t("taskfoldProject.restoreDocument") : t("taskfoldProject.hideDocument")}
            aria-label=${document.hiddenAt ? t("taskfoldProject.restoreDocument") : t("taskfoldProject.hideDocument")}
            ?disabled=${state.busy}
            @click=${() => controller.hideDocument(document.id, !document.hiddenAt)}
          >${document.hiddenAt ? "Restore" : "-"}</button>
          ${!document.system
            ? html`
                <button
                  class="taskfold-project__icon-button"
                  type="button"
                  title=${t("taskfoldProject.deleteDocument")}
                  aria-label=${t("taskfoldProject.deleteDocument")}
                  ?disabled=${state.busy}
                  @click=${() => controller.deleteDocument(document.id)}
                >x</button>
              `
            : nothing}
          <button
            class="taskfold-project__icon-button"
            type="button"
            title=${t("taskfoldProject.refreshDocument")}
            aria-label=${t("taskfoldProject.refreshDocument")}
            ?disabled=${state.documentPreviewLoading || state.documentDraft !== null}
            @click=${controller.refreshDocument}
          >&#8635;</button>
        </div>
      </header>
      ${state.documentPreviewLoading
        ? html`<p class="taskfold-project__document-reader-message">${t(
            "taskfoldProject.readingDocument",
          )}</p>`
        : state.documentEditing
            ? html`
                <div class="taskfold-project__document-editor">
                  ${state.documentPreviewError
                    ? html`<p class="taskfold-project__document-reader-message tf-is-error">${state.documentPreviewError}</p>`
                    : nothing}
                  <taskfold-markdown-editor
                    .value=${content}
                    .uploadImage=${document.type === "path"
                      ? (file: File) => controller.documentImages.upload(document.id, file)
                      : undefined}
                    .resolveImage=${(ref: string) => controller.documentImages.resolve(document.id, ref)}
                    .acceptRef=${isTaskfoldDocumentImageRef}
                    @markdown-change=${(event: CustomEvent<string>) => {
                      state.documentDraft = event.detail;
                    }}
                    @editor-submit=${controller.saveDocumentContent}
                    @keydown=${(event: KeyboardEvent) => {
                      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "s") {
                        event.preventDefault();
                        controller.saveDocumentContent();
                      }
                    }}
                  ></taskfold-markdown-editor>
                  <div class="taskfold-project__document-editor-actions">
                    <button class="tf-btn" type="button" @click=${controller.cancelDocumentEdit}>
                      ${t("common.cancel")}
                    </button>
                    <button class="tf-btn" type="button" @click=${controller.previewDocumentDraft}>
                      ${t("taskfoldProject.previewDocument")}
                    </button>
                    <button
                      class="tf-btn tf-btn--primary"
                      type="button"
                      ?disabled=${state.busy}
                      @click=${controller.saveDocumentContent}
                    >${t("taskfoldProject.saveDocument")}</button>
                  </div>
                </div>
              `
            : state.documentPreviewError
              ? html`<p class="taskfold-project__document-reader-message tf-is-error">${state.documentPreviewError}</p>`
            : preview
              ? html`<article
                  class="taskfold-markdown"
                  ${hydrateMarkdownImages((ref) => controller.documentImages.resolve(document.id, ref))}
                >${renderTaskfoldMarkdown(content, { documentImages: true })}</article>`
              : html`<p class="taskfold-project__document-reader-message">${t(
                  "taskfoldProject.noDocumentContent",
                )}</p>`}
    </section>
  `;
}

/**
 * 详情右栏的卡片标记与流转：阻塞、已派发、定时未到是卡片上的标记，不是状态。有"流转"能力的宿主
 * （OpenClaw）还能在这里标记 / 解除阻塞、把卡加入派发队列。
 */
function renderCardFlow(controller: TaskfoldProjectViewController, card: TaskfoldCard) {
  const project = controller.state.project;
  if (!project) {
    return nothing;
  }
  const registry = statusRegistryOf(project);
  const phase = cardPhase(card, registry);
  const mark = cardMark(card, registry);
  const flow = controller.cardFlowEnabled;
  if (!mark && !flow) {
    return nothing;
  }
  const locked = isArchivedCard(card) || Boolean(project.board.archivedAt) || !controller.connected || controller.state.busy;
  const finished = registry.isTerminal(card.status);
  const canPromote = phase === "todo" || phase === "triage";
  return html`
    <div class="taskfold-project__detail-field taskfold-project__flow">
      <span>${t("taskfoldProject.flow.title")}</span>
      ${mark ? renderCardMark(card, mark, controller.locale) : nothing}
      ${phase === "blocked" && card.metadata?.blocked?.reason
        ? html`<small>${card.metadata.blocked.reason}</small>`
        : nothing}
      ${flow && !locked
        ? html`
            ${phase === "blocked"
              ? html`<button class="tf-btn" type="button" @click=${() => controller.unblockCard(card.id)}>${t("taskfoldProject.flow.unblock")}</button>`
              : nothing}
            ${canPromote
              ? html`<button class="tf-btn" type="button" title=${t("taskfoldProject.flow.promoteHelp")}
                  @click=${() => controller.promoteCard(card.id)}>${t("taskfoldProject.flow.promote")}</button>`
              : nothing}
            ${phase !== "blocked" && !finished
              ? html`
                  <details class="taskfold-project__flow-block">
                    <summary>${t("taskfoldProject.flow.block")}</summary>
                    <form
                      @submit=${(event: SubmitEvent) => {
                        event.preventDefault();
                        controller.blockCard(card.id, readForm(event).reason ?? "");
                      }}
                    >
                      <input name="reason" type="text" maxlength="400" placeholder=${t("taskfoldProject.flow.blockReason")}
                        aria-label=${t("taskfoldProject.flow.blockReason")} />
                      <button class="tf-btn" type="submit">${t("taskfoldProject.flow.blockConfirm")}</button>
                    </form>
                  </details>
                `
              : nothing}
          `
        : nothing}
    </div>
  `;
}

function describeCardEvent(event: TaskfoldEvent, registry: TaskfoldStatusRegistry): string {
  if (event.kind === "moved" && event.toStatus) {
    return t("taskfoldProject.eventMoved", {
      from: event.fromStatus ? statusLabel(event.fromStatus, registry, t) : "—",
      to: statusLabel(event.toStatus, registry, t),
    });
  }
  const key = `taskfoldProject.event.${event.kind}`;
  const text = t(key);
  // i18n 找不到 key 时原样返回 key：没有文案的事件类型落到通用「更新」。
  return text === key ? t("taskfoldProject.event.other") : text;
}

function renderCardActivity(controller: TaskfoldProjectViewController, card: TaskfoldCard) {
  const { state } = controller;
  const tab = state.cardActivityTab;
  const comments = cardComments(card);
  const timeline = buildCardTimeline(card);
  const formatTime = (at: number) => new Date(at).toLocaleString(controller.locale);
  const setTab = (next: TaskfoldProjectUiState["cardActivityTab"]) => {
    state.cardActivityTab = next;
    controller.requestUpdate();
  };
  return html`
    <section class="taskfold-project__detail-section taskfold-project__activity">
      <div class="taskfold-project__activity-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected=${tab === "comments"}
          class=${tab === "comments" ? "is-active" : ""}
          @click=${() => setTab("comments")}
        >${t("taskfoldProject.comments")} <small>${comments.length}</small></button>
        <button
          type="button"
          role="tab"
          aria-selected=${tab === "history"}
          class=${tab === "history" ? "is-active" : ""}
          @click=${() => setTab("history")}
        >${t("taskfoldProject.history")} <small>${timeline.length}</small></button>
      </div>
      ${tab === "comments"
        ? html`
            <form
              class="taskfold-project__comment-form"
              @submit=${(event: SubmitEvent) => {
                event.preventDefault();
                const form = event.currentTarget as HTMLFormElement;
                const body = readForm(event).body ?? "";
                if (body.trim() && !state.busy) {
                  controller.addCardComment(card.id, body);
                  form.reset();
                }
              }}
            >
              <taskfold-markdown-editor
                name="body"
                placeholder=${t("taskfoldProject.commentPlaceholder")}
                .uploadImage=${(file: File) => controller.cardImages.upload(card.id, file)}
                .resolveImage=${controller.cardImages.resolve}
              ></taskfold-markdown-editor>
              <button class="tf-btn tf-btn--primary" type="submit" ?disabled=${state.busy}>
                ${t("taskfoldProject.addComment")}
              </button>
            </form>
            ${comments.length
              ? html`<ul class="taskfold-project__timeline">
                  ${comments.map(
                    (comment) => html`
                      <li>
                        <time>${formatTime(comment.createdAt)}</time>
                        <article class="taskfold-markdown" ${hydrateMarkdownImages(controller.cardImages.resolve)}>${renderTaskfoldMarkdown(comment.body)}</article>
                      </li>
                    `,
                  )}
                </ul>`
              : html`<p class="taskfold-project__detail-empty">${t("taskfoldProject.noComments")}</p>`}
          `
        : timeline.length
          ? html`<ul class="taskfold-project__timeline">
              ${timeline.map(
                (entry) => html`
                  <li>
                    <time>${formatTime(entry.at)}</time>
                    ${entry.type === "comment"
                      ? html`<span>${t("taskfoldProject.eventComment")}：${entry.body}</span>`
                      : html`<span>${describeCardEvent(entry.event, statusRegistryOf(state.project))}</span>`}
                  </li>
                `,
              )}
            </ul>`
          : html`<p class="taskfold-project__detail-empty">${t("taskfoldProject.noHistory")}</p>`}
    </section>
  `;
}

function renderCardLabelEditor(
  controller: TaskfoldProjectViewController,
  card: TaskfoldCard,
  disabled: boolean,
) {
  return html`
    <div class="taskfold-project__label-editor">
      ${card.labels.map(
        (label) => html`
          <span class="taskfold-project__label tf-label-${labelColorIndex(label)}">
            ${label}
            <button
              type="button"
              class="taskfold-project__label-remove"
              aria-label=${t("common.delete")}
              ?disabled=${disabled}
              @click=${() =>
                controller.updateCardLabels(card.id, card.labels.filter((item) => item !== label))}
            >&times;</button>
          </span>
        `,
      )}
      <input
        placeholder=${t("taskfoldProject.addLabelPlaceholder")}
        aria-label=${t("taskfoldProject.labels")}
        ?disabled=${disabled}
        @keydown=${(event: KeyboardEvent) => {
          if (event.key !== "Enter" || event.isComposing) {
            return;
          }
          event.preventDefault();
          const input = event.currentTarget as HTMLInputElement;
          const value = input.value.trim();
          if (value && !card.labels.includes(value)) {
            controller.updateCardLabels(card.id, [...card.labels, value]);
          }
          input.value = "";
        }}
      />
    </div>
  `;
}

function renderCardDetail(controller: TaskfoldProjectViewController, card: TaskfoldCard) {
  const { state } = controller;
  const project = state.project;
  if (!project) {
    return nothing;
  }
  const otherProjects = state.projects.filter(
    (candidate) => candidate.id !== boardId(card) && !candidate.archivedAt,
  );
  const projectArchived = Boolean(project.board.archivedAt);
  const locked = state.busy || projectArchived || isArchivedCard(card);
  const closeMenu = () => {
    if (state.cardMenuOpen) {
      state.cardMenuOpen = false;
      controller.requestUpdate();
    }
  };
  return html`
    <div
      class="taskfold-project__modal-panel taskfold-project__detail-panel"
      @click=${(event: Event) => {
        if (!(event.target as Element).closest("[data-card-menu]")) {
          closeMenu();
        }
      }}
    >
      <header>
        <div>
          <small>${boardName(project.board)}</small>
          <h2>${t("taskfoldProject.details")}</h2>
        </div>
        <div class="taskfold-project__detail-actions">
          <div class="taskfold-project__card-menu" data-card-menu>
            <button
              class="taskfold-project__icon-button"
              type="button"
              aria-haspopup="menu"
              aria-expanded=${state.cardMenuOpen}
              aria-label=${t("taskfoldProject.more")}
              title=${t("taskfoldProject.more")}
              @click=${() => {
                state.cardMenuOpen = !state.cardMenuOpen;
                controller.requestUpdate();
              }}
            >&#8943;</button>
            ${state.cardMenuOpen
              ? html`
                  <div class="taskfold-project__card-menu-list" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      ?disabled=${locked}
                      @click=${() => {
                        closeMenu();
                        controller.duplicateCard(card.id);
                      }}
                    >${t("taskfoldProject.duplicateCard")}</button>
                    <button
                      type="button"
                      role="menuitem"
                      class="is-danger"
                      ?disabled=${locked}
                      @click=${() => {
                        closeMenu();
                        controller.deleteCard(card.id);
                      }}
                    >${t("taskfoldProject.deleteCard")}</button>
                  </div>
                `
              : nothing}
          </div>
          <button class="taskfold-project__icon-button" type="button" aria-label=${t("common.close")} @click=${controller.closeModal}>&times;</button>
        </div>
      </header>
      ${state.error ? html`<div class="tf-callout tf-danger" role="alert">${state.error}</div>` : nothing}
      <div class="taskfold-project__detail-body taskfold-project__detail-layout">
        <div class="taskfold-project__detail-main">
          ${controller.cardEditingEnabled && state.cardDraft?.cardId === card.id
            ? renderCardEditForm(controller, state.cardDraft)
            : html`
                <h3>${card.title}</h3>
                ${card.notes
                  ? html`<article class="taskfold-markdown taskfold-project__detail-notes" ${hydrateMarkdownImages(controller.cardImages.resolve)}>${renderTaskfoldMarkdown(card.notes)}</article>`
                  : html`<p class="taskfold-project__detail-empty">${t("taskfoldProject.noNotes")}</p>`}
                ${controller.cardEditingEnabled || controller.openCardFileEnabled
                  ? html`
                      <div class="taskfold-project__inline-actions">
                        ${controller.cardEditingEnabled
                          ? html`
                              <button
                                class="tf-btn"
                                type="button"
                                data-taskfold-action="edit-card"
                                ?disabled=${state.busy}
                                @click=${() => controller.startCardEdit(card.id)}
                              >${t("taskfoldProject.editCard")}</button>
                            `
                          : nothing}
                        ${controller.openCardFileEnabled
                          ? html`
                              <button
                                class="tf-btn"
                                type="button"
                                data-taskfold-action="open-card-file"
                                @click=${() => controller.openCardFile(card.id)}
                              >${t("taskfoldProject.openCardFile")}</button>
                            `
                          : nothing}
                      </div>
                    `
                  : nothing}
              `}
          ${renderExecutionSection(controller, card)}
          ${renderDeliverySection(controller, card)}
          ${renderSourceReferenceSection(controller, card)}
          ${renderEvidenceSection(controller, card)}
          ${renderCardActivity(controller, card)}
        </div>
        <aside class="taskfold-project__detail-side">
          <label>
            ${t("taskfoldProject.status")}
            <select
              .value=${card.status}
              @change=${(event: Event) =>
                controller.updateCardStatus(
                  card.id,
                  (event.currentTarget as HTMLSelectElement).value as TaskfoldStatus,
                )}
            >
              ${renderStatusOptions(card.status, statusRegistryOf(controller.state.project))}
            </select>
          </label>
          ${renderCardFlow(controller, card)}
          <label>
            ${t("taskfoldProject.priority")}
            <select
              .value=${card.priority}
              ?disabled=${locked}
              @change=${(event: Event) =>
                controller.updateCardPriority(
                  card.id,
                  (event.currentTarget as HTMLSelectElement).value as TaskfoldPriority,
                )}
            >
              ${renderPriorityOptions(card.priority)}
            </select>
          </label>
          <label>
            ${t("taskfoldProject.assignee")}
            <input
              .value=${card.agentId ?? ""}
              placeholder=${t("taskfoldProject.unassigned")}
              ?disabled=${locked}
              @change=${(event: Event) => {
                const value = (event.currentTarget as HTMLInputElement).value.trim();
                if (value !== (card.agentId ?? "")) {
                  controller.updateCardAgent(card.id, value);
                }
              }}
            />
          </label>
          <label>
            ${t("taskfoldProject.moveTo")}
            <select
              ?disabled=${projectArchived}
              @change=${(event: Event) =>
                controller.moveCardMilestone(
                  card.id,
                  (event.currentTarget as HTMLSelectElement).value || undefined,
                )}
            >
              <option value="" ?selected=${!card.milestoneId}>${t("taskfoldProject.unassigned")}</option>
              ${project.milestones
                // 可选的是进行中的里程碑；卡片当前所在的里程碑即使已完成或归档也要列出，否则会误显示成「未归属」。
                .filter((milestone) => milestone.state === "active" || milestone.id === card.milestoneId)
                .map(
                  (milestone) =>
                    html`<option value=${milestone.id} ?selected=${milestone.id === card.milestoneId}>${milestone.title}</option>`,
                )}
            </select>
          </label>
          <div class="taskfold-project__detail-field">
            <span>${t("taskfoldProject.labels")}</span>
            ${renderCardLabelEditor(controller, card, locked)}
          </div>
          <div class="taskfold-project__detail-field">
            <span>${t("taskfoldProject.title")}</span>
            <strong>${boardId(card)}</strong>
          </div>
          ${controller.projectManagementEnabled && otherProjects.length
            ? html`
                <button
                  class="tf-btn"
                  type="button"
                  ?disabled=${projectArchived}
                  @click=${() => controller.openModal({ kind: "move-project", cardId: card.id })}
                >
                  ${t("taskfoldProject.moveToProject")}
                </button>
              `
            : nothing}
        </aside>
      </div>
      <footer>
        ${boardId(card) !== project.board.id
          ? html`
              <button
                class="tf-btn"
                type="button"
                @click=${() => {
                  controller.closeModal();
                  controller.selectProject(boardId(card));
                }}
              >
                ${t("taskfoldProject.viewProject")}
              </button>
            `
          : nothing}
        <button
          class="tf-btn"
          type="button"
          @click=${() => controller.archiveCard(card.id, !isArchivedCard(card))}
        >
          ${isArchivedCard(card) ? t("taskfoldProject.restoreCard") : t("taskfoldProject.archiveCard")}
        </button>
        <button class="tf-btn tf-btn--primary" type="button" @click=${controller.closeModal}>
          ${t("taskfoldProject.close")}
        </button>
      </footer>
    </div>
  `;
}

function renderCardEditForm(controller: TaskfoldProjectViewController, draft: TaskfoldCardDraft) {
  const { state } = controller;
  return html`
    <form
      class="taskfold-project__delivery-form taskfold-project__card-edit"
      @submit=${(event: SubmitEvent) => {
        event.preventDefault();
        controller.saveCardEdit();
      }}
    >
      <label>
        ${t("taskfoldProject.cardTitle")}
        <input
          name="title"
          required
          .value=${draft.title}
          @input=${(event: InputEvent) => {
            draft.title = (event.currentTarget as HTMLInputElement).value;
          }}
        />
      </label>
      <label>
        ${t("taskfoldProject.cardNotes")}
        <taskfold-markdown-editor
          name="notes"
          .value=${draft.notes}
          .uploadImage=${(file: File) => controller.cardImages.upload(draft.cardId, file)}
          .resolveImage=${controller.cardImages.resolve}
          @markdown-change=${(event: CustomEvent<string>) => {
            draft.notes = event.detail;
          }}
        ></taskfold-markdown-editor>
      </label>
      ${state.cardDraftError
        ? html`<div class="tf-callout tf-danger" role="alert">${state.cardDraftError}</div>`
        : nothing}
      <div class="taskfold-project__inline-actions">
        <button class="tf-btn" type="button" @click=${controller.cancelCardEdit}>
          ${t("common.cancel")}
        </button>
        <button class="tf-btn tf-btn--primary" type="submit" ?disabled=${state.busy}>
          ${t("taskfoldProject.saveCard")}
        </button>
      </div>
    </form>
  `;
}

function renderExecutionSection(controller: TaskfoldProjectViewController, card: TaskfoldCard) {
  if (!controller.executionEnabled) {
    return nothing;
  }
  const { state } = controller;
  const projectArchived = Boolean(state.project?.board.archivedAt);
  if (isRequirementCard(card)) {
    return html`
      <section class="taskfold-project__detail-section taskfold-project__execution-section">
        <h3>${t("taskfoldProject.execution")}</h3>
        <p class="taskfold-project__detail-empty">${t("taskfoldProject.requirementExecutionDisabled")}</p>
      </section>
    `;
  }
  const inspection = inspectionForCard(state, card.id);
  const active = inspection?.active === true;
  const unresolvedActive = !active && hasActiveCardExecution(card);
  const sessionKey = inspection?.sessionKey ?? card.execution?.sessionKey ?? card.sessionKey;
  const runId = inspection?.runId ?? card.execution?.runId ?? card.runId;
  const workspace = card.metadata?.automation?.workspace;
  const inspectionError =
    state.executionInspectionCardId === card.id ? state.executionInspectionError : null;
  const inspectionLoading =
    state.executionInspectionCardId === card.id && state.executionInspectionLoading;

  const hasExecutionRecord = Boolean(card.execution) || active || unresolvedActive;
  return html`
    <details class="taskfold-project__detail-section taskfold-project__execution-section" ?open=${hasExecutionRecord}>
      <summary>${t("taskfoldProject.execution")}</summary>
      <div class="taskfold-project__execution-heading">
        ${active
          ? html`
              <button
                class="taskfold-project__icon-button"
                type="button"
                title=${t("taskfoldProject.refreshExecution")}
                aria-label=${t("taskfoldProject.refreshExecution")}
                ?disabled=${inspectionLoading}
                @click=${() => controller.refreshCardExecution(card.id)}
              >&#8635;</button>
            `
          : nothing}
      </div>
      ${active
        ? html`
            <p class="taskfold-project__execution-state">
              ${t("taskfoldProject.executionRunning")}
            </p>
            <dl class="taskfold-project__execution-facts">
              ${sessionKey
                ? html`<div><dt>${t("taskfoldProject.executionSession")}</dt><dd>${sessionKey}</dd></div>`
                : nothing}
              ${runId
                ? html`<div><dt>${t("taskfoldProject.executionRun")}</dt><dd>${runId}</dd></div>`
                : nothing}
              ${workspace?.kind === "worktree" && workspace.path
                ? html`<div><dt>${t("taskfoldProject.executionWorktreePath")}</dt><dd>${workspace.path}</dd></div>`
                : nothing}
            </dl>
            ${inspectionLoading
              ? html`<p class="taskfold-project__detail-empty">${t(
                  "taskfoldProject.refreshingExecution",
                )}</p>`
              : nothing}
            ${inspectionError
              ? html`<p class="taskfold-project__execution-error">${inspectionError}</p>`
              : nothing}
            ${inspection?.preview
              ? html`
                  <details class="taskfold-project__execution-preview">
                    <summary>${t("taskfoldProject.executionSessionPreview")}</summary>
                    <pre>${executionValue(inspection.preview)}</pre>
                  </details>
                `
              : nothing}
            <div class="taskfold-project__execution-actions">
              ${sessionKey
                ? html`
                    <a class="tf-btn" href=${taskfoldNativeChatHref(sessionKey)} target="_top">
                      ${t("taskfoldProject.openNativeChat")}
                    </a>
                  `
                : nothing}
              <button
                class="tf-btn tf-btn--danger"
                type="button"
                ?disabled=${state.busy}
                @click=${() => controller.abortCardExecution(card.id)}
              >
                ${t("taskfoldProject.stopExecution")}
              </button>
            </div>
            <form
              class="taskfold-project__execution-steer"
              @submit=${(event: SubmitEvent) => {
                event.preventDefault();
                controller.steerCardExecution(card.id, readForm(event).message ?? "");
              }}
            >
              <label>
                ${t("taskfoldProject.steerInstruction")}
                <textarea
                  name="message"
                  required
                  placeholder=${t("taskfoldProject.steerInstructionPlaceholder")}
                ></textarea>
              </label>
              <button class="tf-btn" type="submit" ?disabled=${state.busy}>
                ${t("taskfoldProject.steerExecution")}
              </button>
            </form>
          `
        : unresolvedActive
          ? html`
              <p class="taskfold-project__detail-empty">
                ${inspectionLoading
                  ? t("taskfoldProject.refreshingExecution")
                  : t("taskfoldProject.executionCheckRequired")}
              </p>
              ${inspectionError
                ? html`<p class="taskfold-project__execution-error">${inspectionError}</p>`
                : nothing}
              <button
                class="tf-btn"
                type="button"
                ?disabled=${inspectionLoading}
                @click=${() => controller.refreshCardExecution(card.id)}
              >
                ${t("taskfoldProject.refreshExecution")}
              </button>
            `
        : html`
            <p class="taskfold-project__detail-empty">
              ${card.execution?.status === "done"
                ? t("taskfoldProject.executionFinished")
                : card.execution?.status === "blocked"
                  ? t("taskfoldProject.executionStopped")
                  : t("taskfoldProject.executionIdle")}
            </p>
            ${runId || (workspace?.kind === "worktree" && workspace.path)
              ? html`
                  <dl class="taskfold-project__execution-facts">
                    ${runId
                      ? html`<div><dt>${t("taskfoldProject.executionRun")}</dt><dd>${runId}</dd></div>`
                      : nothing}
                    ${workspace?.kind === "worktree" && workspace.path
                      ? html`<div><dt>${t("taskfoldProject.executionWorktreePath")}</dt><dd>${workspace.path}</dd></div>`
                      : nothing}
                  </dl>
                `
              : nothing}
            <button
              class="tf-btn tf-btn--primary"
              type="button"
              ?disabled=${state.busy || !controller.connected || isArchivedCard(card) || projectArchived}
              @click=${() => controller.prepareCardExecution(card.id)}
            >
              ${t("taskfoldProject.startExecution")}
            </button>
          `}
    </details>
  `;
}

function renderDeliverySection(controller: TaskfoldProjectViewController, card: TaskfoldCard) {
  const delivery = card.delivery;
  return html`
    <details class="taskfold-project__detail-section" ?open=${Boolean(delivery)}>
      <summary>${t("taskfoldProject.deliveryFacts")}</summary>
      <form
        class="taskfold-project__delivery-form"
        @input=${() => controller.beginDeliveryEdit(card.id, card.revision)}
        @submit=${(event: SubmitEvent) => {
          event.preventDefault();
          controller.updateCardDelivery(card.id, readForm(event));
        }}
      >
        <label>
          ${t("taskfoldProject.deliveryObjective")}
          <textarea name="objective" .value=${delivery?.objective ?? ""}></textarea>
        </label>
        <label>
          ${t("taskfoldProject.deliverySummary")}
          <textarea name="deliverySummary" .value=${delivery?.deliverySummary ?? ""}></textarea>
        </label>
        <label>
          ${t("taskfoldProject.deliveryOpenItems")}
          <textarea name="openItems" .value=${delivery?.openItems ?? ""}></textarea>
        </label>
        <div class="taskfold-project__modal-grid">
          <label>
            ${t("taskfoldProject.deliveryImplementation")}
            <select name="implementationState">
              ${renderDeliveryOptions(
                IMPLEMENTATION_STATES,
                delivery?.implementationState,
                "implementation",
              )}
            </select>
          </label>
          <label>
            ${t("taskfoldProject.deliveryVerification")}
            <select name="verificationState">
              ${renderDeliveryOptions(
                VERIFICATION_STATES,
                delivery?.verificationState,
                "verification",
              )}
            </select>
          </label>
          <label>
            ${t("taskfoldProject.deliveryRelease")}
            <select name="releaseState">
              ${renderDeliveryOptions(RELEASE_STATES, delivery?.releaseState, "release")}
            </select>
          </label>
        </div>
        <button class="tf-btn" type="submit" ?disabled=${controller.state.busy}>
          ${t("taskfoldProject.saveDelivery")}
        </button>
      </form>
    </details>
  `;
}

function renderSourceReferenceSection(controller: TaskfoldProjectViewController, card: TaskfoldCard) {
  const references = [...(card.sourceReferences ?? [])].toSorted(
    (left, right) => left.position - right.position || left.createdAt - right.createdAt,
  );
  return html`
    <details class="taskfold-project__detail-section" ?open=${references.length > 0}>
      <summary>${t("taskfoldProject.sourceReferences")}${references.length ? html` <small>${references.length}</small>` : nothing}</summary>
      <div class="taskfold-project__detail-list">
        ${references.length
          ? references.map((reference, index) => {
              const ids = references.map((item) => item.id);
              const moveUp =
                index > 0
                  ? [
                      ...ids.slice(0, index - 1),
                      reference.id,
                      ids[index - 1]!,
                      ...ids.slice(index + 1),
                    ]
                  : undefined;
              const moveDown =
                index < ids.length - 1
                  ? [
                      ...ids.slice(0, index),
                      ids[index + 1]!,
                      reference.id,
                      ...ids.slice(index + 2),
                    ]
                  : undefined;
              return html`
                <form
                  class="taskfold-project__source-reference"
                  @submit=${(event: SubmitEvent) => {
                    event.preventDefault();
                    controller.updateSourceReference(card.id, readForm(event));
                  }}
                >
                  <input type="hidden" name="sourceReferenceId" value=${reference.id} />
                  <input name="label" aria-label=${t("taskfoldProject.sourceReferenceLabel")} .value=${reference.label} required />
                  <input name="target" aria-label=${t("taskfoldProject.sourceReferenceTarget")} .value=${reference.target} required />
                  <input name="note" aria-label=${t("taskfoldProject.sourceReferenceNote")} .value=${reference.note ?? ""} />
                  <div class="taskfold-project__inline-actions">
                    <button class="tf-btn" type="submit" ?disabled=${controller.state.busy}>
                      ${t("taskfoldProject.save")}
                    </button>
                    ${renderOrderControls({
                      canMoveUp: Boolean(moveUp),
                      canMoveDown: Boolean(moveDown),
                      onMoveUp: () =>
                        moveUp && controller.reorderSourceReferences(card.id, moveUp),
                      onMoveDown: () =>
                        moveDown && controller.reorderSourceReferences(card.id, moveDown),
                    })}
                    <button
                      class="taskfold-project__icon-button"
                      type="button"
                      title=${t("common.delete")}
                      @click=${() => controller.deleteSourceReference(card.id, reference.id)}
                    >&times;</button>
                  </div>
                </form>
              `;
            })
          : html`<p class="taskfold-project__detail-empty">${t(
              "taskfoldProject.noSourceReferences",
            )}</p>`}
      </div>
      <form
        class="taskfold-project__source-reference"
        @submit=${(event: SubmitEvent) => {
          event.preventDefault();
          controller.createSourceReference(card.id, readForm(event));
        }}
      >
        <input name="label" placeholder=${t("taskfoldProject.sourceReferenceLabel")} required />
        <input name="target" placeholder=${t("taskfoldProject.sourceReferenceTarget")} required />
        <input name="note" placeholder=${t("taskfoldProject.sourceReferenceNote")} />
        <button class="tf-btn" type="submit" ?disabled=${controller.state.busy}>
          ${t("taskfoldProject.addSourceReference")}
        </button>
      </form>
    </details>
  `;
}

function renderEvidenceSection(controller: TaskfoldProjectViewController, card: TaskfoldCard) {
  const proof = card.metadata?.proof ?? [];
  const artifacts = card.metadata?.artifacts ?? [];
  return html`
    <details class="taskfold-project__detail-section" ?open=${proof.length > 0}>
      <summary>${t("taskfoldProject.proof")}${proof.length ? html` <small>${proof.length}</small>` : nothing}</summary>
      <div class="taskfold-project__detail-list">
        ${proof.length
          ? proof.map(
              (entry) => html`
                <div class="taskfold-project__evidence-item">
                  <span>${entry.label || entry.command || entry.url || entry.status}</span>
                  <small>${entry.status}${entry.note ? ` · ${entry.note}` : ""}</small>
                  <button
                    class="taskfold-project__icon-button"
                    type="button"
                    title=${t("common.delete")}
                    @click=${() => controller.deleteProof(card.id, entry.id)}
                  >&times;</button>
                </div>
              `,
            )
          : html`<p class="taskfold-project__detail-empty">${t("taskfoldProject.noProof")}</p>`}
      </div>
      <form
        class="taskfold-project__evidence-form"
        @submit=${(event: SubmitEvent) => {
          event.preventDefault();
          controller.addProof(card.id, readForm(event));
        }}
      >
        <select name="status">
          <option value="unknown">${t("taskfoldProject.proofUnknown")}</option>
          <option value="passed">${t("taskfoldProject.proofPassed")}</option>
          <option value="failed">${t("taskfoldProject.proofFailed")}</option>
          <option value="skipped">${t("taskfoldProject.proofSkipped")}</option>
        </select>
        <input name="label" placeholder=${t("taskfoldProject.evidenceLabel")} />
        <input name="command" placeholder=${t("taskfoldProject.proofCommand")} />
        <input name="url" placeholder=${t("taskfoldProject.evidenceUrl")} />
        <input name="note" placeholder=${t("taskfoldProject.evidenceNote")} />
        <button class="tf-btn" type="submit" ?disabled=${controller.state.busy}>
          ${t("taskfoldProject.addProof")}
        </button>
      </form>
    </details>
    <details class="taskfold-project__detail-section" ?open=${artifacts.length > 0}>
      <summary>${t("taskfoldProject.artifacts")}${artifacts.length ? html` <small>${artifacts.length}</small>` : nothing}</summary>
      <div class="taskfold-project__detail-list">
        ${artifacts.length
          ? artifacts.map(
              (entry) => html`
                <div class="taskfold-project__evidence-item">
                  <span>${entry.label || entry.path || entry.url || t("taskfoldProject.artifact")}</span>
                  <small>${entry.path || entry.url || ""}</small>
                  <button
                    class="taskfold-project__icon-button"
                    type="button"
                    title=${t("common.delete")}
                    @click=${() => controller.deleteArtifact(card.id, entry.id)}
                  >&times;</button>
                </div>
              `,
            )
          : html`<p class="taskfold-project__detail-empty">${t(
              "taskfoldProject.noArtifacts",
            )}</p>`}
      </div>
      <form
        class="taskfold-project__evidence-form"
        @submit=${(event: SubmitEvent) => {
          event.preventDefault();
          controller.addArtifact(card.id, readForm(event));
        }}
      >
        <input name="label" placeholder=${t("taskfoldProject.evidenceLabel")} />
        <input name="path" placeholder=${t("taskfoldProject.artifactPath")} />
        <input name="url" placeholder=${t("taskfoldProject.evidenceUrl")} />
        <input name="mimeType" placeholder=${t("taskfoldProject.artifactMimeType")} />
        <button class="tf-btn" type="submit" ?disabled=${controller.state.busy}>
          ${t("taskfoldProject.addArtifact")}
        </button>
      </form>
    </details>
  `;
}

function renderMoveProjectModal(
  controller: TaskfoldProjectViewController,
  modal: Extract<TaskfoldProjectModal, { kind: "move-project" }>,
) {
  const project = controller.state.project;
  const card = project?.cards.find((candidate) => candidate.id === modal.cardId);
  if (!card) {
    return nothing;
  }
  const otherProjects = controller.state.projects.filter(
    (candidate) => candidate.id !== boardId(card) && !candidate.archivedAt,
  );
  const activeMilestones = modal.targetProject?.milestones.filter(
    (milestone) => milestone.state === "active",
  ) ?? [];
  const canMove = Boolean(modal.boardId && modal.milestoneId && !controller.state.busy);
  return html`
    <form
      class="taskfold-project__modal-panel"
      @submit=${(event: SubmitEvent) => {
        event.preventDefault();
        if (modal.boardId && modal.milestoneId) {
          controller.moveCardProject(card.id, modal.boardId, modal.milestoneId);
        }
      }}
    >
      <header><h2>${t("taskfoldProject.moveToProject")}</h2></header>
      <p class="taskfold-project__move-card-title">${card.title}</p>
      <label>
        ${t("taskfoldProject.moveToProject")}
        <select
          .value=${modal.boardId ?? ""}
          ?disabled=${controller.state.busy}
          @change=${(event: Event) =>
            controller.selectMoveCardProjectTarget(
              card.id,
              (event.currentTarget as HTMLSelectElement).value,
            )}
        >
          <option value="">${t("taskfoldProject.selectTargetProject")}</option>
          ${otherProjects.map(
            (candidate) => html`<option value=${candidate.id}>${boardName(candidate)}</option>`,
          )}
        </select>
      </label>
      <label>
        ${t("taskfoldProject.targetMilestone")}
        <select
          .value=${modal.milestoneId ?? ""}
          ?disabled=${controller.state.busy || !modal.targetProject || activeMilestones.length === 0}
          @change=${(event: Event) =>
            controller.openModal({
              ...modal,
              milestoneId: (event.currentTarget as HTMLSelectElement).value || undefined,
            })}
        >
          <option value="">${t("taskfoldProject.selectTargetMilestone")}</option>
          ${activeMilestones.map(
            (milestone) => html`<option value=${milestone.id}>${milestone.title}</option>`,
          )}
        </select>
      </label>
      ${modal.targetProject && activeMilestones.length === 0
        ? html`<p class="taskfold-project__empty-column">${t("taskfoldProject.noActiveMilestones")}</p>`
        : nothing}
      <footer>
        <button class="tf-btn" type="button" @click=${controller.closeModal}>${t("common.cancel")}</button>
        <button class="tf-btn tf-btn--primary" type="submit" ?disabled=${!canMove}>
          ${t("taskfoldProject.moveCard")}
        </button>
      </footer>
    </form>
  `;
}

function renderExecutionStartModal(
  controller: TaskfoldProjectViewController,
  modal: Extract<TaskfoldProjectModal, { kind: "execution-start" }>,
) {
  if (!controller.executionEnabled) {
    return nothing;
  }
  const card = controller.state.project?.cards.find((candidate) => candidate.id === modal.cardId);
  if (!card) {
    return nothing;
  }
  const preparation =
    controller.state.executionPreparationCardId === card.id
      ? controller.state.executionPreparation
      : null;
  const loading =
    controller.state.executionPreparationCardId === card.id &&
    controller.state.executionPreparationLoading;
  const error =
    controller.state.executionPreparationCardId === card.id
      ? controller.state.executionPreparationError
      : null;
  const model =
    preparation?.defaultProvider && preparation.defaultModel
      ? `${preparation.defaultProvider}/${preparation.defaultModel}`
      : preparation?.defaultModel ?? preparation?.defaultProvider;
  return html`
    <section class="taskfold-project__modal-panel taskfold-project__execution-confirmation">
      <header><h2>${t("taskfoldProject.startExecution")}</h2></header>
      <p class="taskfold-project__move-card-title">${card.title}</p>
      ${loading
        ? html`<p class="taskfold-project__detail-empty">${t(
            "taskfoldProject.preparingExecution",
          )}</p>`
        : error
          ? html`<p class="taskfold-project__execution-error">${error}</p>`
          : preparation
            ? html`
                ${isCompletedCard(card, statusRegistryOf(controller.state.project))
                  ? html`<p class="tf-callout">${t("taskfoldProject.executionDoneNotice")}</p>`
                  : nothing}
                <p class="tf-callout">${t("taskfoldProject.executionWorktreeNotice")}</p>
                <dl class="taskfold-project__execution-facts">
                  <div><dt>${t("taskfoldProject.executionAgent")}</dt><dd>${preparation.agentId}</dd></div>
                  ${model
                    ? html`<div><dt>${t("taskfoldProject.executionModel")}</dt><dd>${model}</dd></div>`
                    : nothing}
                  <div><dt>${t("taskfoldProject.executionSource")}</dt><dd>${preparation.sourceCheckout}</dd></div>
                  ${preparation.baseBranch
                    ? html`<div><dt>${t("taskfoldProject.executionBaseBranch")}</dt><dd>${preparation.baseBranch}</dd></div>`
                    : nothing}
                  <div><dt>${t("taskfoldProject.executionWorktree")}</dt><dd>${preparation.worktreeName}</dd></div>
                </dl>
                <details class="taskfold-project__execution-preview" open>
                  <summary>${t("taskfoldProject.executionPromptPreview")}</summary>
                  <pre>${preparation.promptPreview}</pre>
                </details>
              `
            : nothing}
      <footer>
        <button class="tf-btn" type="button" @click=${controller.closeModal}>
          ${t("common.cancel")}
        </button>
        <button
          class="tf-btn tf-btn--primary"
          type="button"
          ?disabled=${!preparation || loading || controller.state.busy}
          @click=${() => controller.startCardExecution(card.id)}
        >
          ${t("taskfoldProject.confirmStartExecution")}
        </button>
      </footer>
    </section>
  `;
}

function renderModal(controller: TaskfoldProjectViewController) {
  const { modal, project } = controller.state;
  if (!modal) {
    return nothing;
  }
  const closeOnBackdrop = (event: MouseEvent) => {
    if (event.target === event.currentTarget) {
      controller.closeModal();
    }
  };
  if (modal.kind === "card-detail") {
    const card = project?.cards.find((candidate) => candidate.id === modal.cardId);
    return card
      ? html`<openclaw-modal-dialog @click=${closeOnBackdrop} @modal-cancel=${controller.closeModal}>
          ${renderCardDetail(controller, card)}
        </openclaw-modal-dialog>`
      : nothing;
  }
  if (modal.kind === "status-delete") {
    return html`
      <openclaw-modal-dialog @click=${closeOnBackdrop} @modal-cancel=${controller.closeModal}>
        ${renderStatusDeleteModal(controller, modal.statusId)}
      </openclaw-modal-dialog>
    `;
  }
  if (modal.kind === "execution-start") {
    return html`
      <openclaw-modal-dialog @click=${closeOnBackdrop} @modal-cancel=${controller.closeModal}>
        ${renderExecutionStartModal(controller, modal)}
      </openclaw-modal-dialog>
    `;
  }
  if (modal.kind === "move-project") {
    return html`
      <openclaw-modal-dialog @click=${closeOnBackdrop} @modal-cancel=${controller.closeModal}>
        ${renderMoveProjectModal(controller, modal)}
      </openclaw-modal-dialog>
    `;
  }
  if (modal.kind === "project") {
    return html`
      <openclaw-modal-dialog @click=${closeOnBackdrop} @modal-cancel=${controller.closeModal}>
        <form
          class="taskfold-project__modal-panel"
          @submit=${(event: SubmitEvent) => {
            event.preventDefault();
            controller.createProject(readForm(event));
          }}
        >
          <header><h2>${t("taskfoldProject.newProject")}</h2></header>
          <fieldset class="taskfold-project__project-mode">
            <legend>${t("taskfoldProject.projectMode")}</legend>
            <label>
              <input
                type="radio"
                name="projectMode"
                value="new"
                checked
                @change=${setProjectCreateMode}
              />
              <span>${t("taskfoldProject.newBlankProject")}</span>
            </label>
            <label>
              <input
                type="radio"
                name="projectMode"
                value="existing"
                @change=${setProjectCreateMode}
              />
              <span>${t("taskfoldProject.initializeExistingProject")}</span>
            </label>
          </fieldset>
          <label>${t("taskfoldProject.projectId")}<input name="id" required pattern="[a-z0-9][a-z0-9._-]{0,79}" /></label>
          <label>${t("taskfoldProject.projectName")}<input name="name" required /></label>
          <label data-project-workspace hidden>
            ${t("taskfoldProject.existingWorkspace")}
            <input name="workspacePath" />
          </label>
          <footer>
            <button class="tf-btn" type="button" @click=${controller.closeModal}>${t("common.cancel")}</button>
            <button
              class="tf-btn tf-btn--primary"
              type="submit"
              ?disabled=${controller.state.busy || !controller.connected}
            >${t("taskfoldProject.createProject")}</button>
          </footer>
        </form>
      </openclaw-modal-dialog>
    `;
  }
  if (modal.kind === "card") {
    if (!project) {
      return nothing;
    }
    const cardKind = modal.cardKind ?? "task";
    return html`
      <openclaw-modal-dialog @click=${closeOnBackdrop} @modal-cancel=${controller.closeModal}>
        <form
          class="taskfold-project__modal-panel"
          @submit=${(event: SubmitEvent) => {
            event.preventDefault();
            controller.createCard(readForm(event));
          }}
        >
          <header><h2>${cardKind === "requirement" ? t("taskfoldProject.newRequirement") : t("taskfoldProject.newCard")}</h2></header>
          <input type="hidden" name="milestoneId" value=${modal.milestoneId ?? ""} />
          <input type="hidden" name="requirementId" value=${modal.requirementId ?? ""} />
          <input type="hidden" name="cardKind" value=${cardKind} />
          <input type="hidden" name="relatedCardId" value=${modal.relatedCardId ?? ""} />
          <label>${t("taskfoldProject.cardTitle")}<input name="title" required /></label>
          <div class="taskfold-project__detail-field">
            <span>${t("taskfoldProject.cardNotes")}</span>
            <taskfold-markdown-editor
              name="notes"
              .uploadImage=${async (file: File) => controller.cardImages.stage(file)}
              .resolveImage=${controller.cardImages.resolve}
              .acceptRef=${(ref: string) => controller.cardImages.isPending(ref) || ref.startsWith("../attachments/")}
            ></taskfold-markdown-editor>
          </div>
          ${modal.relatedCardId ? html`
            <label>${t("taskfoldProject.newCardRelation", { title: project.cards.find((card) => card.id === modal.relatedCardId)?.title ?? modal.relatedCardId })}
              <select name="relation">
                <option value="">${t("taskfoldProject.newCardRelation_none")}</option>
                <option value="follows" selected>${t("taskfoldProject.newCardRelation_follows")}</option>
                <option value="precedes">${t("taskfoldProject.newCardRelation_precedes")}</option>
                <option value="blocks">${t("taskfoldProject.newCardRelation_blocks")}</option>
                <option value="relates_to">${t("taskfoldProject.newCardRelation_relates_to")}</option>
              </select>
            </label>` : nothing}
          <div class="taskfold-project__modal-grid">
            <label>${t("taskfoldProject.status")}<select name="status">${renderStatusOptions(modal.status ?? statusRegistryOf(project).defaultStatus, statusRegistryOf(project))}</select></label>
            <label>${t("taskfoldProject.priority")}<select name="priority">${renderPriorityOptions("normal")}</select></label>
            <label>${t("taskfoldProject.assignee")}<input name="agentId" /></label>
          </div>
          <footer>
            <button class="tf-btn" type="button" @click=${controller.closeModal}>${t("common.cancel")}</button>
            <button
              class="tf-btn tf-btn--primary"
              type="submit"
              ?disabled=${controller.state.busy || !controller.connected}
            >${t("taskfoldProject.createCard")}</button>
          </footer>
        </form>
      </openclaw-modal-dialog>
    `;
  }
  if (modal.kind === "milestone") {
    const milestone = modal.milestone;
    return html`
      <openclaw-modal-dialog @click=${closeOnBackdrop} @modal-cancel=${controller.closeModal}>
        <form
          class="taskfold-project__modal-panel"
          @submit=${(event: SubmitEvent) => {
            event.preventDefault();
            controller.saveMilestone(readForm(event));
          }}
        >
          <header><h2>${milestone ? t("taskfoldProject.editMilestone") : t("taskfoldProject.newMilestone")}</h2></header>
          <input type="hidden" name="id" value=${milestone?.id ?? ""} />
          <label>${t("taskfoldProject.milestoneName")}<input name="title" required .value=${milestone?.title ?? ""} /></label>
          <label>${t("taskfoldProject.milestoneDescription")}<textarea name="description" .value=${milestone?.description ?? ""}></textarea></label>
          <label>Color<input name="color" .value=${milestone?.color ?? ""} /></label>
          <footer>
            <button class="tf-btn" type="button" @click=${controller.closeModal}>${t("common.cancel")}</button>
            <button
              class="tf-btn tf-btn--primary"
              type="submit"
              ?disabled=${controller.state.busy || !controller.connected}
            >
              ${milestone ? t("common.save") : t("taskfoldProject.createMilestone")}
            </button>
          </footer>
        </form>
      </openclaw-modal-dialog>
    `;
  }
  const document = modal.document;
  return html`
    <openclaw-modal-dialog @click=${closeOnBackdrop} @modal-cancel=${controller.closeModal}>
      <form
        class="taskfold-project__modal-panel taskfold-project__document-form"
        @submit=${(event: SubmitEvent) => {
          event.preventDefault();
          controller.saveDocument(readForm(event));
        }}
      >
        <header><h2>${document ? t("taskfoldProject.editDocument") : t("taskfoldProject.addDocument")}</h2></header>
        <input type="hidden" name="id" value=${document?.id ?? ""} />
        ${document
          ? nothing
          : html`<label>${t("taskfoldProject.documentKey")}<input name="key" required pattern="[a-z0-9][a-z0-9._-]{0,79}" /></label>`}
        <label>${t("taskfoldProject.documentTitle")}<input name="title" required .value=${document?.title ?? ""} /></label>
        <div class="taskfold-project__modal-grid">
          <label>
            ${t("taskfoldProject.documentSection")}
            <select name="section" ?disabled=${Boolean(document)}>
              ${DOCUMENT_SECTIONS.map(
                (section) =>
                  html`<option value=${section} ?selected=${section === (document?.section ?? "project")}>${sectionLabel(section)}</option>`,
              )}
            </select>
          </label>
          <label>
            ${t("taskfoldProject.documentType")}
            <select name="type">
              ${DOCUMENT_TYPES.map(
                (type) =>
                  html`<option value=${type} ?selected=${type === (document?.type ?? "path")}>${documentTypeLabel(type)}</option>`,
              )}
            </select>
          </label>
        </div>
        <label>${t("taskfoldProject.documentSummary")}<input name="summary" .value=${document?.summary ?? ""} /></label>
        <label>${t("taskfoldProject.documentTarget")}<input name="target" .value=${document?.target ?? ""} /></label>
        <label>${t("taskfoldProject.documentContent")}<textarea name="content" .value=${document?.content ?? ""}></textarea></label>
        <footer>
          <button class="tf-btn" type="button" @click=${controller.closeModal}>${t("common.cancel")}</button>
          <button class="tf-btn tf-btn--primary" type="submit" ?disabled=${controller.state.busy}>${t("taskfoldProject.saveDocument")}</button>
        </footer>
      </form>
    </openclaw-modal-dialog>
  `;
}

const NEW_STATUS_FORM_ID = "taskfold-new-status";

/** 状态设置页（需求/22-状态模型）：类别固定，状态名、顺序、颜色、角色由项目自己定。 */
function renderStatuses(controller: TaskfoldProjectViewController) {
  const { state } = controller;
  const project = state.project;
  if (!project) {
    return nothing;
  }
  const registry = statusRegistryOf(project);
  const rows = state.statusDraft ?? registry.list.map((status) => ({ ...status }));
  const dirty = state.statusDraft !== null;
  const archived = Boolean(project.board.archivedAt);
  const disabled = state.busy || !controller.connected || archived;
  const usage = new Map<string, number>();
  for (const card of project.cards) {
    usage.set(card.status, (usage.get(card.status) ?? 0) + 1);
  }
  const change = (index: number, update: (row: TaskfoldStatusDefinition) => void) => {
    const next = rows.map((row) => ({ ...row }));
    update(next[index]!);
    state.statusDraft = next;
    state.statusError = null;
    controller.requestUpdate();
  };
  /** 角色与默认状态在项目里只能各有一个：给这一行设置时从别处摘掉。 */
  const exclusive = (next: TaskfoldStatusDefinition[], row: TaskfoldStatusDefinition) => {
    for (const other of next) {
      if (other.id === row.id) continue;
      if (row.role && other.role === row.role) delete other.role;
      if (row.default && other.default) delete other.default;
    }
  };
  const move = (index: number, delta: number) => {
    const next = rows.map((row) => ({ ...row }));
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item!);
    state.statusDraft = next;
    controller.requestUpdate();
  };
  const addStatus = (event: SubmitEvent) => {
    event.preventDefault();
    const form = readForm(event);
    const id = (form.id ?? "").trim();
    if (!TASKFOLD_STATUS_ID_PATTERN.test(id)) {
      state.statusError = t("taskfoldProject.statusSettings.invalidId");
    } else if (rows.some((row) => row.id === id)) {
      state.statusError = t("taskfoldProject.statusSettings.duplicateId", { id });
    } else {
      const category = form.category as TaskfoldStatusCategory;
      const created: TaskfoldStatusDefinition = {
        id,
        category,
        ...(form.name?.trim() ? { name: form.name.trim() } : {}),
      };
      const lastOfCategory = rows.findLastIndex((row) => row.category === category);
      const next = rows.map((row) => ({ ...row }));
      next.splice(lastOfCategory + 1, 0, created);
      state.statusDraft = next;
      state.statusError = null;
      (event.currentTarget as HTMLFormElement).reset();
    }
    controller.requestUpdate();
  };
  const preview = state.statusMigration;
  return html`
    <section class="taskfold-project__statuses">
      <div class="taskfold-project__section-heading">
        <div>
          <h1>${t("taskfoldProject.statusSettings.title")}</h1>
          <p>${t("taskfoldProject.statusSettings.intro")}</p>
        </div>
        <div class="taskfold-project__form-actions">
          ${dirty
            ? html`<button class="tf-btn" type="button" ?disabled=${state.busy}
                @click=${() => { state.statusDraft = null; state.statusError = null; controller.requestUpdate(); }}
              >${t("taskfoldProject.statusSettings.discard")}</button>`
            : nothing}
          <button class="tf-btn tf-btn--primary" type="button" ?disabled=${disabled || !dirty}
            @click=${() => controller.saveStatuses(rows)}
          >${t("taskfoldProject.statusSettings.save")}</button>
        </div>
      </div>
      ${state.statusError ? html`<div class="tf-callout tf-callout--danger" role="alert">${state.statusError}</div>` : nothing}
      ${!project.statusesConfigured
        ? html`
            <div class="tf-callout taskfold-project__status-migrate">
              <strong>${t("taskfoldProject.statusSettings.unconfiguredTitle")}</strong>
              <p>${t("taskfoldProject.statusSettings.unconfiguredBody")}</p>
              ${preview
                ? html`<p class="taskfold-project__status-preview">${preview.rewrites.length === 0
                    ? t("taskfoldProject.statusSettings.previewNone", { total: String(preview.total) })
                    : t("taskfoldProject.statusSettings.previewRewrites", { total: String(preview.total), count: String(preview.rewrites.length) })}</p>
                  <ul>${preview.rewrites.map((rewrite) => html`<li>${project.cards.find((card) => card.id === rewrite.cardId)?.title ?? rewrite.cardId}: ${statusLabel(rewrite.from, registry, t)} → ${statusLabel(rewrite.to, registry, t)}</li>`)}</ul>`
                : nothing}
              <div class="taskfold-project__form-actions">
                <button class="tf-btn" type="button" ?disabled=${disabled}
                  @click=${controller.previewStatusMigration}>${t("taskfoldProject.statusSettings.preview")}</button>
                <button class="tf-btn tf-btn--primary" type="button" ?disabled=${disabled}
                  @click=${controller.migrateStatuses}>${t("taskfoldProject.statusSettings.migrate")}</button>
              </div>
            </div>
          `
        : nothing}
      <ul class="taskfold-project__status-list">
        ${rows.map((row, index) => {
          const count = usage.get(row.id) ?? 0;
          return html`
            <li class="taskfold-project__status-row" data-status-id=${row.id}>
              <input class="taskfold-project__status-color" type="color" aria-label=${t("taskfoldProject.statusSettings.color")}
                .value=${row.color && /^#[0-9a-fA-F]{6}$/.test(row.color) ? row.color : "#8b8f99"}
                ?disabled=${disabled}
                @input=${(event: Event) => change(index, (target) => { target.color = (event.currentTarget as HTMLInputElement).value; })} />
              <input class="taskfold-project__status-name" type="text" maxlength="40"
                aria-label=${t("taskfoldProject.statusSettings.name")}
                placeholder=${defaultStatusLabel(row.id, t)}
                .value=${row.name ?? ""} ?disabled=${disabled}
                @input=${(event: Event) => change(index, (target) => {
                  const value = (event.currentTarget as HTMLInputElement).value.trim();
                  if (value) target.name = value; else delete target.name;
                })} />
              <code class="taskfold-project__status-id" title=${t("taskfoldProject.statusSettings.idHelp")}>${row.id}</code>
              <select aria-label=${t("taskfoldProject.statusSettings.category")} ?disabled=${disabled}
                @change=${(event: Event) => change(index, (target) => {
                  target.category = (event.currentTarget as HTMLSelectElement).value as TaskfoldStatusCategory;
                  if (target.category !== "unstarted") delete target.default;
                })}>
                ${TASKFOLD_STATUS_CATEGORIES.map((category) => html`<option value=${category} ?selected=${row.category === category}>${t(`taskfoldProject.statusCategory.${category}`)}</option>`)}
              </select>
              <select aria-label=${t("taskfoldProject.statusSettings.role")} ?disabled=${disabled}
                @change=${(event: Event) => {
                  const value = (event.currentTarget as HTMLSelectElement).value as TaskfoldStatusRole | "";
                  const next = rows.map((entry) => ({ ...entry }));
                  if (value) next[index]!.role = value; else delete next[index]!.role;
                  exclusive(next, next[index]!);
                  state.statusDraft = next;
                  controller.requestUpdate();
                }}>
                <option value="" ?selected=${!row.role}>${t("taskfoldProject.statusSettings.roleNone")}</option>
                ${TASKFOLD_STATUS_ROLES.map((role) => html`<option value=${role} ?selected=${row.role === role}>${t(`taskfoldProject.statusSettings.role_${role}`)}</option>`)}
              </select>
              ${row.category === "unstarted"
                ? html`<label class="taskfold-project__status-default" title=${t("taskfoldProject.statusSettings.defaultHelp")}>
                    <input type="radio" name="taskfold-status-default" ?checked=${Boolean(row.default)}
                      ?disabled=${disabled}
                      @change=${() => {
                        const next = rows.map((entry) => ({ ...entry }));
                        next[index]!.default = true;
                        exclusive(next, next[index]!);
                        state.statusDraft = next;
                        controller.requestUpdate();
                      }} />
                    ${t("taskfoldProject.statusSettings.default")}
                  </label>`
                : html`<span></span>`}
              <span class="taskfold-project__status-count" title=${t("taskfoldProject.statusSettings.usedBy", { count: String(count) })}>${count}</span>
              ${renderOrderControls({
                canMoveUp: !disabled && index > 0,
                canMoveDown: !disabled && index < rows.length - 1,
                onMoveUp: () => move(index, -1),
                onMoveDown: () => move(index, 1),
              })}
              <button class="taskfold-project__icon-button" type="button" ?disabled=${disabled || dirty}
                title=${dirty ? t("taskfoldProject.statusSettings.saveFirst") : t("taskfoldProject.statusSettings.delete")}
                aria-label=${t("taskfoldProject.statusSettings.delete")}
                @click=${() => controller.openModal({ kind: "status-delete", statusId: row.id })}>&times;</button>
            </li>
          `;
        })}
      </ul>
      <form id=${NEW_STATUS_FORM_ID} class="taskfold-project__status-add" @submit=${addStatus}>
        <input name="id" type="text" required maxlength="40"
          placeholder=${t("taskfoldProject.statusSettings.idPlaceholder")}
          aria-label=${t("taskfoldProject.statusSettings.idPlaceholder")} ?disabled=${disabled} />
        <input name="name" type="text" maxlength="40"
          placeholder=${t("taskfoldProject.statusSettings.namePlaceholder")}
          aria-label=${t("taskfoldProject.statusSettings.name")} ?disabled=${disabled} />
        <select name="category" aria-label=${t("taskfoldProject.statusSettings.category")} ?disabled=${disabled}>
          ${TASKFOLD_STATUS_CATEGORIES.map((category) => html`<option value=${category} ?selected=${category === "started"}>${t(`taskfoldProject.statusCategory.${category}`)}</option>`)}
        </select>
        <button class="tf-btn" type="submit" ?disabled=${disabled}>${t("taskfoldProject.statusSettings.add")}</button>
      </form>
      <p class="taskfold-project__status-note">${t("taskfoldProject.statusSettings.categoryNote")}</p>
    </section>
  `;
}

/** 删除状态：还有卡在用就要先选一个去处，卡移过去之后才删。 */
function renderStatusDeleteModal(controller: TaskfoldProjectViewController, statusId: string) {
  const project = controller.state.project;
  const registry = statusRegistryOf(project);
  const count = project?.cards.filter((card) => card.status === statusId).length ?? 0;
  const targets = registry.ids.filter((id) => id !== statusId);
  const label = statusLabel(statusId, registry, t);
  return html`
    <form
      class="taskfold-project__modal-panel"
      @submit=${(event: SubmitEvent) => {
        event.preventDefault();
        controller.deleteStatus(statusId, count > 0 ? (readForm(event).target ?? targets[0]) : undefined);
      }}
    >
      <header><h2>${t("taskfoldProject.statusSettings.deleteTitle", { name: label })}</h2></header>
      <p>${count > 0
        ? t("taskfoldProject.statusSettings.deleteBodyUsed", { count: String(count), name: label })
        : t("taskfoldProject.statusSettings.deleteBodyUnused", { name: label })}</p>
      ${count > 0
        ? html`<label>${t("taskfoldProject.statusSettings.moveTo")}
            <select name="target">
              ${targets.map((id) => html`<option value=${id} ?selected=${id === registry.defaultStatus}>${statusLabel(id, registry, t)}</option>`)}
            </select>
          </label>`
        : nothing}
      <div class="taskfold-project__form-actions">
        <button class="tf-btn" type="button" @click=${controller.closeModal}>${t("common.cancel")}</button>
        <button class="tf-btn tf-btn--danger" type="submit" ?disabled=${controller.state.busy}>${t("taskfoldProject.statusSettings.delete")}</button>
      </div>
    </form>
  `;
}

function renderProjectTabs(controller: TaskfoldProjectViewController): TemplateResult {
  const { state } = controller;
  const tabs: Array<[TaskfoldProjectUiState["screen"], string]> = [
    ["board", "taskfoldProject.board"],
    ["graph", "taskfoldProject.graph"],
    ["statuses", "taskfoldProject.statuses"],
    ...(controller.projectManagementEnabled
      ? ([["settings", "taskfoldProject.settings"]] as Array<[TaskfoldProjectUiState["screen"], string]>)
      : []),
    ...(controller.documentsEnabled
      ? ([["documents", "taskfoldProject.documents"]] as Array<[TaskfoldProjectUiState["screen"], string]>)
      : []),
  ];
  return html`
    <nav class="taskfold-project__tabs" aria-label=${t("taskfoldProject.title")}>
      ${tabs.map(
        ([screen, key]) => html`
          <button
            class=${state.screen === screen ? "tf-is-active" : ""}
            type="button"
            aria-current=${state.screen === screen ? "page" : nothing}
            @click=${() => controller.setScreen(screen)}
          >${t(key)}</button>
        `,
      )}
    </nav>
  `;
}

export function renderTaskfoldProjects(controller: TaskfoldProjectViewController): TemplateResult {
  const { state } = controller;
  const projectView =
    state.screen === "overview"
      ? renderOverview(controller)
      : !state.project
        ? html`<section class="taskfold-project__blank"><p>${t("taskfoldProject.emptyProject")}</p></section>`
        : state.screen === "board"
          ? renderBoard(controller)
          : state.screen === "graph"
            ? renderGraph(controller)
            : state.screen === "settings"
              ? renderSettings(controller)
              : state.screen === "statuses"
                ? renderStatuses(controller)
                : renderDocuments(controller);
  return html`
    <section class="taskfold-project">
      <div class="taskfold-project__topbar">
        <div class="taskfold-project__brand">
          <strong>taskfold</strong>
          <span>${t("taskfoldProject.title")}</span>
        </div>
        <div class="taskfold-project__topbar-actions">
          ${state.loading ? html`<span class="taskfold-project__refreshing">${t("taskfoldProject.loading")}</span>` : nothing}
          <button class="taskfold-project__refresh" type="button" title=${t("taskfoldProject.refresh")} @click=${controller.refresh}>
            &#8635;
          </button>
          ${renderProjectSwitcher(controller)}
          <label class="taskfold-project__language">
            <span class="taskfold-project__sr-only">${t("taskfoldProject.language")}</span>
            <select
              class="taskfold-project__language-select"
              aria-label=${t("taskfoldProject.language")}
              .value=${controller.locale}
              ?disabled=${state.languageSwitching}
              @change=${(event: Event) =>
                controller.setLocale(
                  (event.currentTarget as HTMLSelectElement).value as TaskfoldLocale,
                )}
            >
              <option value="zh-CN">${t("languages.zhCN")}</option>
              <option value="en">${t("languages.en")}</option>
            </select>
          </label>
          ${controller.projectManagementEnabled
            ? html`
                <button
                  class="tf-btn tf-btn--primary"
                  type="button"
                  ?disabled=${!controller.connected}
                  @click=${() => controller.openModal({ kind: "project" })}
                >
                  ${t("taskfoldProject.newProject")}
                </button>
              `
            : nothing}
          ${state.languageError
            ? html`<span class="taskfold-project__language-error" role="status">${state.languageError}</span>`
            : nothing}
        </div>
      </div>
      ${!controller.connected
        ? html`<div class="tf-callout">${t("taskfoldProject.connectionRequired")}</div>`
        : nothing}
      ${state.error ? html`<div class="tf-callout tf-danger" role="alert">${state.error}</div>` : nothing}
      <main class="taskfold-project__main">
        ${state.project && state.screen !== "overview" ? renderProjectTabs(controller) : nothing}
        ${projectView}
      </main>
      ${renderModal(controller)}
    </section>
  `;
}
