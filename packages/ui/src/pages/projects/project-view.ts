import { html, nothing, type TemplateResult } from "lit";
import type {
  TaskfoldBoardMetadata,
  TaskfoldBoardGroupBy,
  TaskfoldBoardSortBy,
  TaskfoldBoardSortDirection,
  TaskfoldBoardViewSettings,
  TaskfoldBoardSummary,
  TaskfoldCard,
  TaskfoldCardKind,
  TaskfoldDeliveryImplementationState,
  TaskfoldDeliveryReleaseState,
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
} from "@taskfold/core/contract/index.js";
import "../../components/modal-dialog.ts";
import "./graph-canvas.ts";
import { buildGraphModel, type GraphFilter, type GraphRelation } from "./graph-model.ts";
import { t, type TaskfoldLocale } from "../../i18n/index.ts";
import {
  taskfoldEditorHtmlToMarkdown,
  taskfoldMarkdownToEditorHtml,
  renderTaskfoldMarkdown,
} from "../../lib/markdown.ts";
import { styleProperties } from "../../lib/style-properties.ts";
import "../../styles/taskfold-project.css";

const STATUSES: readonly TaskfoldStatus[] = [
  "triage",
  "backlog",
  "todo",
  "scheduled",
  "ready",
  "running",
  "review",
  "blocked",
  "done",
];
const PRIORITIES: readonly TaskfoldPriority[] = ["low", "normal", "high", "urgent"];
const BOARD_GROUPS: readonly TaskfoldBoardGroupBy[] = ["milestone", "requirement", "status"];
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
    }
  | { kind: "milestone"; milestone?: TaskfoldMilestone }
  | { kind: "document"; document?: TaskfoldProjectDocument }
  | { kind: "card-detail"; cardId: string }
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
  screen: "overview" | "board" | "graph" | "settings" | "documents";
  modal: TaskfoldProjectModal | null;
  draggedCardId: string | null;
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
  updateCardStatus: (id: string, status: TaskfoldStatus) => void;
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
  formatDocument: (command: "bold" | "italic" | "formatBlock" | "insertUnorderedList") => void;
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
  return board.boardView ?? { groupBy: "milestone", sortBy: "manual", sortDirection: "asc" };
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

function renderStatusOptions(selected: TaskfoldStatus) {
  return STATUSES.map(
    (status) =>
      html`<option value=${status} ?selected=${status === selected}>${t(`workboard.status.${status}`)}</option>`,
  );
}

function renderPriorityOptions(selected: TaskfoldPriority) {
  return PRIORITIES.map(
    (priority) =>
      html`<option value=${priority} ?selected=${priority === selected}>${priority}</option>`,
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

function renderProjectToolbar(controller: TaskfoldProjectViewController) {
  const { state } = controller;
  const query = state.query.trim().toLocaleLowerCase();
  const projects = state.projects.filter((project) => {
    if (!state.showArchivedProjects && project.archivedAt) {
      return false;
    }
    return !query || `${project.name ?? ""} ${project.id}`.toLocaleLowerCase().includes(query);
  });
  return html`
    <nav class="taskfold-project__project-toolbar" aria-label=${t("taskfoldProject.allProjects")}>
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
      <div class="taskfold-project__project-list" role="list">
        ${projects.length
          ? projects.map(
              (project) => {
                const moveUp = reorderVisibleItemIds(state.projects, projects, project.id, -1);
                const moveDown = reorderVisibleItemIds(state.projects, projects, project.id, 1);
                return html`
                  <div class="taskfold-project__project-row" role="listitem">
                    <button
                      class="taskfold-project__nav-project ${state.selectedProjectId === project.id
                        ? "tf-is-selected"
                        : ""}"
                      type="button"
                      @click=${() => controller.selectProject(project.id)}
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
              },
            )
          : html`<p class="taskfold-project__empty-side">${t("taskfoldProject.emptyProject")}</p>`}
      </div>
    </nav>
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
                    @click=${() => controller.selectProject(project.id)}
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
  onDrop: (cardId: string) => void;
  onCreate: () => void;
};

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
  const orderedCards = options.manualOrder?.cards ?? [];
  const cardIndex = orderedCards.findIndex((candidate) => candidate.id === card.id);
  const previousCard = orderedCards[cardIndex - 1];
  const nextCard = orderedCards[cardIndex + 1];
  return html`
    <article
      class="taskfold-project__card ${archived ? "tf-is-archived" : ""} ${isRequirementCard(card) ? "tf-is-requirement" : ""}"
      draggable=${!archived && !isProjectArchived}
      @dragstart=${(event: DragEvent) => {
        state.draggedCardId = card.id;
        event.dataTransfer?.setData("text/plain", card.id);
        event.dataTransfer && (event.dataTransfer.effectAllowed = "move");
        controller.requestUpdate();
      }}
      @dragend=${() => {
        state.draggedCardId = null;
        controller.requestUpdate();
      }}
      @dragover=${(event: DragEvent) => event.preventDefault()}
      @drop=${(event: DragEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const id = event.dataTransfer?.getData("text/plain") || state.draggedCardId;
        if (options.manualOrder && id && id !== card.id) {
          controller.moveCardMilestone(
            id,
            options.manualOrder.milestoneId,
            Math.max(0, card.position - 1),
          );
        }
      }}
    >
      <button
        class="taskfold-project__card-main"
        type="button"
        @click=${() => controller.openModal({ kind: "card-detail", cardId: card.id })}
      >
        <span class="taskfold-project__priority tf-priority-${card.priority}"></span>
        <span class="taskfold-project__card-title">${card.title}</span>
        ${card.notes ? html`<span class="taskfold-project__card-notes">${card.notes}</span>` : nothing}
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
      <div class="taskfold-project__card-footer">
        <select
          class="taskfold-project__compact-select"
          aria-label=${t("taskfoldProject.status")}
          .value=${card.status}
          @change=${(event: Event) =>
            controller.updateCardStatus(
              card.id,
              (event.currentTarget as HTMLSelectElement).value as TaskfoldStatus,
            )}
        >
          ${renderStatusOptions(card.status)}
        </select>
        <select
          class="taskfold-project__compact-select taskfold-project__move-card"
          aria-label=${t("taskfoldProject.moveTo")}
          ?disabled=${isProjectArchived}
          .value=${card.milestoneId ?? ""}
          @change=${(event: Event) =>
            controller.moveCardMilestone(
              card.id,
              (event.currentTarget as HTMLSelectElement).value || undefined,
            )}
        >
          <option value="">${t("taskfoldProject.unassigned")}</option>
          ${project.milestones
            .filter((milestone) => milestone.state === "active")
            .map(
              (milestone) => html`
                <option value=${milestone.id}>${milestone.title}</option>
              `,
            )}
        </select>
        ${options.manualOrder
          ? renderOrderControls({
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
            })
          : nothing}
      </div>
      ${archived ? html`<span class="taskfold-project__card-archived">${t("taskfoldProject.archived")}</span>` : nothing}
    </article>
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
  return html`
    <section
      class="taskfold-project__column ${milestone ? `tf-is-${milestone.state}` : "tf-is-unassigned"}"
      @dragover=${(event: DragEvent) => event.preventDefault()}
      @drop=${(event: DragEvent) => {
        event.preventDefault();
        const id = event.dataTransfer?.getData("text/plain") || state.draggedCardId;
        if (id) {
          params.onDrop(id);
        }
      }}
    >
      <header class="taskfold-project__column-header">
        <div>
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
          <span>${params.subtitle || t("taskfoldProject.cards", { count: String(params.cards.length) })}</span>
        </div>
        <div class="taskfold-project__column-actions">
          ${milestone
            ? html`
                ${renderOrderControls({
                  canMoveUp: !projectArchived && Boolean(moveMilestoneUp),
                  canMoveDown: !projectArchived && Boolean(moveMilestoneDown),
                  onMoveUp: () => moveMilestoneUp && controller.reorderMilestones(moveMilestoneUp),
                  onMoveDown: () =>
                    moveMilestoneDown && controller.reorderMilestones(moveMilestoneDown),
                })}
                <button
                  class="taskfold-project__icon-button"
                  type="button"
                  title=${t("taskfoldProject.editMilestone")}
                  @click=${() => controller.openModal({ kind: "milestone", milestone })}
                >...</button>
                ${milestone.state === "active"
                  ? html`
                      <button
                        class="taskfold-project__icon-button"
                        type="button"
                        title=${t("taskfoldProject.completeMilestone")}
                        @click=${() => controller.completeMilestone(milestone.id)}
                      >&#10003;</button>
                      <button
                        class="taskfold-project__icon-button"
                        type="button"
                        title=${t("taskfoldProject.archiveMilestone")}
                        @click=${() => controller.archiveMilestone(milestone.id, true)}
                      >&#8942;</button>
                    `
                  : html`
                      <button
                        class="taskfold-project__icon-button"
                        type="button"
                        title=${t("taskfoldProject.restoreMilestone")}
                        @click=${() => controller.archiveMilestone(milestone.id, false)}
                      >&#8635;</button>
                    `}
              `
            : nothing}
          <button
            class="taskfold-project__icon-button"
            type="button"
            title=${t("taskfoldProject.newCard")}
            ?disabled=${!controller.connected || projectArchived || (milestone && milestone.state !== "active")}
            @click=${params.onCreate}
          >+</button>
        </div>
      </header>
      <div class="taskfold-project__card-list">
        ${params.cards.length
          ? params.cards.map((card) => renderCard(controller, card, { manualOrder: params.manualOrder }))
          : html`<p class="taskfold-project__empty-column">${t("taskfoldProject.emptyColumn")}</p>`}
      </div>
    </section>
  `;
}

function renderBoard(controller: TaskfoldProjectViewController) {
  const { state } = controller;
  const project = state.project;
  if (!project) {
    return nothing;
  }
  const view = boardView(project.board);
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
      });
    }
  } else {
    const byStatus = new Map<TaskfoldStatus, TaskfoldCard[]>();
    for (const card of cards) {
      const current = byStatus.get(card.status) ?? [];
      current.push(card);
      byStatus.set(card.status, current);
    }
    for (const status of STATUSES) {
      columns.push({
        id: status,
        title: t(`workboard.status.${status}`),
        cards: sorted(byStatus.get(status) ?? []),
        onDrop: (id) => controller.updateCardStatus(id, status),
        onCreate: () => controller.openModal({ kind: "card", status }),
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
                ${view.groupBy === "milestone"
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
      <div class="taskfold-project__board-controls">
        <label>
          ${t("taskfoldProject.groupBy")}
          <select
            @change=${(event: Event) => {
              const groupBy = (event.currentTarget as HTMLSelectElement).value as TaskfoldBoardGroupBy;
              controller.updateBoardView({
                groupBy,
                sortBy:
                  groupBy === "milestone"
                    ? view.sortBy
                    : view.sortBy === "manual"
                      ? "priority"
                      : view.sortBy,
                sortDirection: view.sortDirection,
              });
            }}
          >
            ${BOARD_GROUPS.map(
              (groupBy) =>
                html`<option value=${groupBy} .selected=${groupBy === view.groupBy}>${t(`taskfoldProject.groupBy${groupBy[0].toUpperCase()}${groupBy.slice(1)}`)}</option>`,
            )}
          </select>
        </label>
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
      <div class="taskfold-project__kanban" aria-label=${t("taskfoldProject.board")}>
        ${columns.map((column) => renderColumn(controller, column))}
      </div>
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
    status: (value) => t(`workboard.status.${value}`),
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
          <button class="taskfold-project__icon-button" type="button" title=${t("taskfoldProject.zoomOut")}
            @click=${(event: Event) => canvas(event)?.zoomBy(0.8)}>−</button>
          <button class="taskfold-project__icon-button" type="button" title=${t("taskfoldProject.fitGraph")}
            @click=${(event: Event) => canvas(event)?.fit()}>□</button>
          <button class="taskfold-project__icon-button" type="button" title=${t("taskfoldProject.zoomIn")}
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
          ${STATUSES.map((status) => html`<option value=${status} ?selected=${filter.status === status}>${t(`workboard.status.${status}`)}</option>`)}
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
              <option value=${relation} ?selected=${filter.relation === relation}>${t(`taskfoldProject.graphRelation.${relation}`)}</option>`)}
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
              const { source, target } = event.detail;
              const sourceCard = project.cards.find((card) => card.id === source);
              if (!sourceCard || isRequirementCard(sourceCard)) return;
              const targetCard = project.cards.find((card) => card.id === target);
              if (targetCard && isRequirementCard(targetCard)) controller.moveCardRequirement(source, target);
              else if (target === "project" || target === "group:requirements") controller.moveCardRequirement(source);
              else if (target.startsWith("milestone:")) controller.moveCardMilestone(source, target === "milestone:none" ? undefined : target.slice("milestone:".length));
              else if (target.startsWith("status:")) controller.updateCardStatus(source, target.slice("status:".length) as TaskfoldStatus);
            }}
          ></taskfold-graph-canvas>
        </div>
        <aside class="taskfold-project__graph-inspector">
          <strong>${selected?.title ?? t("taskfoldProject.graphSelectNode")}</strong>
          ${selectedCard ? html`<small>${t(`workboard.status.${selectedCard.status}`)} · ${selectedCard.priority} · ${selected?.childCount ?? 0}</small>` : nothing}
          <div class="taskfold-project__graph-inspector-actions">
            ${selectedCard ? html`<button type="button" @click=${() => controller.openModal({ kind: "card-detail", cardId: selectedCard.id })}>${t("taskfoldProject.graphOpenCard")}</button>` : nothing}
            <button type="button" ?disabled=${!controller.connected || Boolean(project.board.archivedAt)} @click=${createAtSelection}>${t("taskfoldProject.newCard")}</button>
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
                ${relationTypes.map((relation) => html`<option value=${relation} ?selected=${state.graphLinkType === relation}>${t(`taskfoldProject.graphRelation.${relation}`)}</option>`)}
              </select>
              <button type="button" ?disabled=${!state.graphLinkTargetId || !controller.connected || Boolean(project.board.archivedAt)}
                @click=${() => controller.createGraphRelation(selectedCard.id, state.graphLinkTargetId, state.graphLinkType)}>${t("taskfoldProject.graphAddRelation")}</button>
              <div class="taskfold-project__graph-relation-list">
                ${currentEdges.filter((edge) => edge.source === selectedCard.id || edge.target === selectedCard.id).map((edge) => html`
                  <div><span>${t(`taskfoldProject.graphRelation.${edge.relation}`)}: ${model.nodes.find((node) => node.id === edge.source)?.title} → ${model.nodes.find((node) => node.id === edge.target)?.title}</span>
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
    <div class="taskfold-project__document-index" role="list">
      ${documentIndexGroups(documents).map(
        (group) => html`
          <section class="taskfold-project__document-group">
            <h2>${group.label}</h2>
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
                          @click=${() => controller.openDocument(document.id)}
                        >
                          <span>${document.title}</span>
                          <small>
                            ${documentPathLabel(document.target, workspacePath) ??
                            documentTypeLabel(document.type)}
                          </small>
                          <em>${documentSourceLabel(document.source)}</em>
                        </button>
                      `,
                    )}
                  </div>
                `
              : html`<p class="taskfold-project__empty-column">${t(
                  "taskfoldProject.noDocuments",
                )}</p>`}
          </section>
        `,
      )}
    </div>
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
      ${renderDocumentIndex(controller, visibleDocuments)}
      ${renderDocumentPreview(controller)}
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
                  <div
                    class="taskfold-project__document-editor-toolbar"
                    role="toolbar"
                    aria-label=${t("taskfoldProject.richTextToolbar")}
                  >
                    <button
                      class="taskfold-project__editor-button"
                      type="button"
                      title=${t("taskfoldProject.formatBold")}
                      aria-label=${t("taskfoldProject.formatBold")}
                      @mousedown=${(event: MouseEvent) => event.preventDefault()}
                      @click=${() => controller.formatDocument("bold")}
                    ><strong>B</strong></button>
                    <button
                      class="taskfold-project__editor-button"
                      type="button"
                      title=${t("taskfoldProject.formatItalic")}
                      aria-label=${t("taskfoldProject.formatItalic")}
                      @mousedown=${(event: MouseEvent) => event.preventDefault()}
                      @click=${() => controller.formatDocument("italic")}
                    ><em>I</em></button>
                    <button
                      class="taskfold-project__editor-button"
                      type="button"
                      title=${t("taskfoldProject.formatHeading")}
                      aria-label=${t("taskfoldProject.formatHeading")}
                      @mousedown=${(event: MouseEvent) => event.preventDefault()}
                      @click=${() => controller.formatDocument("formatBlock")}
                    >H</button>
                    <button
                      class="taskfold-project__editor-button"
                      type="button"
                      title=${t("taskfoldProject.formatList")}
                      aria-label=${t("taskfoldProject.formatList")}
                      @mousedown=${(event: MouseEvent) => event.preventDefault()}
                      @click=${() => controller.formatDocument("insertUnorderedList")}
                    >${t("taskfoldProject.formatList")}</button>
                  </div>
                  <div
                    class="taskfold-project__rich-editor"
                    contenteditable="true"
                    role="textbox"
                    aria-multiline="true"
                    aria-label=${t("taskfoldProject.documentContent")}
                    .innerHTML=${taskfoldMarkdownToEditorHtml(content)}
                    @input=${(event: InputEvent) => {
                      state.documentDraft = taskfoldEditorHtmlToMarkdown(
                        (event.currentTarget as HTMLElement).innerHTML,
                      );
                    }}
                    @keydown=${(event: KeyboardEvent) => {
                      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "s") {
                        event.preventDefault();
                        controller.saveDocumentContent();
                      }
                    }}
                  ></div>
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
              ? html`<article class="taskfold-markdown">${renderTaskfoldMarkdown(content)}</article>`
              : html`<p class="taskfold-project__document-reader-message">${t(
                  "taskfoldProject.noDocumentContent",
                )}</p>`}
    </section>
  `;
}

function renderCardDetail(controller: TaskfoldProjectViewController, card: TaskfoldCard) {
  const project = controller.state.project;
  if (!project) {
    return nothing;
  }
  const otherProjects = controller.state.projects.filter(
    (candidate) => candidate.id !== boardId(card) && !candidate.archivedAt,
  );
  return html`
    <div class="taskfold-project__modal-panel taskfold-project__detail-panel">
      <header>
        <div>
          <small>${boardName(project.board)}</small>
          <h2>${t("taskfoldProject.details")}</h2>
        </div>
        <button class="taskfold-project__icon-button" type="button" @click=${controller.closeModal}>&times;</button>
      </header>
      <div class="taskfold-project__detail-body">
        ${controller.cardEditingEnabled && controller.state.cardDraft?.cardId === card.id
          ? renderCardEditForm(controller, controller.state.cardDraft)
          : html`
              <h3>${card.title}</h3>
              ${card.notes ? html`<p class="taskfold-project__detail-notes">${card.notes}</p>` : nothing}
              ${controller.cardEditingEnabled || controller.openCardFileEnabled
                ? html`
                    <div class="taskfold-project__inline-actions">
                      ${controller.cardEditingEnabled
                        ? html`
                            <button
                              class="tf-btn"
                              type="button"
                              data-taskfold-action="edit-card"
                              ?disabled=${controller.state.busy}
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
        <dl>
          <div><dt>${t("taskfoldProject.status")}</dt><dd>${t(`workboard.status.${card.status}`)}</dd></div>
          <div><dt>${t("taskfoldProject.priority")}</dt><dd>${card.priority}</dd></div>
          <div><dt>${t("taskfoldProject.assignee")}</dt><dd>${card.agentId || t("taskfoldProject.unassigned")}</dd></div>
          <div><dt>${t("taskfoldProject.viewProject")}</dt><dd>${boardId(card)}</dd></div>
        </dl>
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
            ${renderStatusOptions(card.status)}
          </select>
        </label>
        <label>
          ${t("taskfoldProject.moveTo")}
          <select
            .value=${card.milestoneId ?? ""}
            ?disabled=${Boolean(project.board.archivedAt)}
            @change=${(event: Event) =>
              controller.moveCardMilestone(
                card.id,
                (event.currentTarget as HTMLSelectElement).value || undefined,
              )}
          >
            <option value="">${t("taskfoldProject.unassigned")}</option>
            ${project.milestones
              .filter((milestone) => milestone.state === "active")
              .map(
                (milestone) =>
                  html`<option value=${milestone.id}>${milestone.title}</option>`,
              )}
          </select>
        </label>
        ${renderExecutionSection(controller, card)}
        ${renderDeliverySection(controller, card)}
        ${renderSourceReferenceSection(controller, card)}
        ${renderEvidenceSection(controller, card)}
        ${controller.projectManagementEnabled && otherProjects.length
          ? html`
              <button
                class="tf-btn"
                type="button"
                ?disabled=${Boolean(project.board.archivedAt)}
                @click=${() => controller.openModal({ kind: "move-project", cardId: card.id })}
              >
                ${t("taskfoldProject.moveToProject")}
              </button>
            `
          : nothing}
      </div>
      <footer>
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
        ${t("taskfoldProject.priority")}
        <select
          name="priority"
          .value=${draft.priority}
          @change=${(event: Event) => {
            draft.priority = (event.currentTarget as HTMLSelectElement).value as TaskfoldPriority;
          }}
        >
          ${renderPriorityOptions(draft.priority)}
        </select>
      </label>
      <label>
        ${t("taskfoldProject.cardNotes")}
        <textarea
          name="notes"
          rows="10"
          .value=${draft.notes}
          @input=${(event: InputEvent) => {
            draft.notes = (event.currentTarget as HTMLTextAreaElement).value;
          }}
        ></textarea>
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

  return html`
    <section class="taskfold-project__detail-section taskfold-project__execution-section">
      <div class="taskfold-project__execution-heading">
        <h3>${t("taskfoldProject.execution")}</h3>
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
    </section>
  `;
}

function renderDeliverySection(controller: TaskfoldProjectViewController, card: TaskfoldCard) {
  const delivery = card.delivery;
  return html`
    <section class="taskfold-project__detail-section">
      <h3>${t("taskfoldProject.deliveryFacts")}</h3>
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
    </section>
  `;
}

function renderSourceReferenceSection(controller: TaskfoldProjectViewController, card: TaskfoldCard) {
  const references = [...(card.sourceReferences ?? [])].toSorted(
    (left, right) => left.position - right.position || left.createdAt - right.createdAt,
  );
  return html`
    <section class="taskfold-project__detail-section">
      <h3>${t("taskfoldProject.sourceReferences")}</h3>
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
    </section>
  `;
}

function renderEvidenceSection(controller: TaskfoldProjectViewController, card: TaskfoldCard) {
  const proof = card.metadata?.proof ?? [];
  const artifacts = card.metadata?.artifacts ?? [];
  return html`
    <section class="taskfold-project__detail-section">
      <h3>${t("taskfoldProject.proof")}</h3>
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
    </section>
    <section class="taskfold-project__detail-section">
      <h3>${t("taskfoldProject.artifacts")}</h3>
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
    </section>
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
                ${card.status === "done"
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
          <label>${t("taskfoldProject.cardTitle")}<input name="title" required /></label>
          <label>${t("taskfoldProject.cardNotes")}<textarea name="notes"></textarea></label>
          <div class="taskfold-project__modal-grid">
            <label>${t("taskfoldProject.status")}<select name="status">${renderStatusOptions(modal.status ?? "todo")}</select></label>
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

function renderProjectTabs(controller: TaskfoldProjectViewController): TemplateResult {
  const { state } = controller;
  const tabs: Array<[TaskfoldProjectUiState["screen"], string]> = [
    ["board", "taskfoldProject.board"],
    ["graph", "taskfoldProject.graph"],
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
          <button
            class="tf-btn taskfold-project__all-projects ${state.screen === "overview" ? "tf-is-active" : ""}"
            type="button"
            @click=${() => controller.setScreen("overview")}
          >
            <span>${t("taskfoldProject.allProjects")}</span>
            <strong>${state.projects.length}</strong>
          </button>
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
      ${renderProjectToolbar(controller)}
      <main class="taskfold-project__main">
        ${state.project && state.screen !== "overview" ? renderProjectTabs(controller) : nothing}
        ${projectView}
      </main>
      ${renderModal(controller)}
    </section>
  `;
}
