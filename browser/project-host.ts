import { LitElement, html } from "lit";
import type {
  TaskfoldBoardSummary,
  TaskfoldBoardViewSettings,
  TaskfoldProjectDocument,
  TaskfoldProjectDocumentRead,
  TaskfoldProjectView,
  TaskfoldStatus,
} from "@taskfold/core/contract/index.js";
import {
  taskfoldHost,
  type TaskfoldCardWriteResult,
  type TaskfoldHostCapabilities,
  type TaskfoldHostEvent,
} from "./host.ts";
import { i18n, type TaskfoldLocale } from "./i18n/index.ts";
import { taskfoldEditorHtmlToMarkdown } from "./lib/markdown.ts";
import {
  createTaskfoldProjectUiState,
  renderTaskfoldProjects,
  type TaskfoldCardDraftFields,
  type TaskfoldCardExecutionInspection,
  type TaskfoldCardExecutionPreparation,
  type TaskfoldProjectModal,
  type TaskfoldProjectUiState,
} from "./pages/projects/project-view.ts";
import "./host.css";

type ProjectListResponse = {
  projects: TaskfoldBoardSummary[];
};

type ProjectResponse = {
  project: TaskfoldProjectView;
};

type ProjectDocumentsResponse = {
  documents: TaskfoldProjectDocument[];
};

type ProjectDocumentReadResponse = {
  preview: TaskfoldProjectDocumentRead;
};

type ProjectDocumentWriteResponse = {
  preview: TaskfoldProjectDocumentRead;
};

type CardExecutionPreparationResponse = TaskfoldCardExecutionPreparation;

type CardExecutionInspectionResponse = TaskfoldCardExecutionInspection;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeProjectDocument(document: TaskfoldProjectDocument): TaskfoldProjectDocument {
  return {
    ...document,
    source: document.source ?? "project",
  };
}

function normalizeProjectDocumentRead(
  preview: TaskfoldProjectDocumentRead,
): TaskfoldProjectDocumentRead {
  return {
    ...preview,
    document: normalizeProjectDocument(preview.document),
  };
}

class TaskfoldProjectHost extends LitElement {
  private connectedToGateway = false;
  // 宿主能力开关在挂载时读一次；render() 不直接碰宿主（卸载后仍可能有一次待执行的渲染）。
  private executionEnabled = false;
  private capabilities: TaskfoldHostCapabilities = {
    execution: false,
    cardRevisionCheck: false,
    cardEditing: false,
    projectManagement: false,
    documents: false,
    openCardFile: false,
  };
  private stopped = false;
  private refreshGeneration = 0;
  private executionRefreshTimer: number | null = null;
  private unsubscribeI18n?: () => void;
  private unsubscribeHost?: () => void;
  private readonly state: TaskfoldProjectUiState = createTaskfoldProjectUiState();

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.stopped = false;
    this.capabilities = { ...taskfoldHost().capabilities };
    this.executionEnabled = this.capabilities.execution;
    this.unsubscribeI18n = i18n.subscribe((locale) => {
      document.documentElement.lang = locale;
      this.requestUpdate();
    });
    document.documentElement.lang = i18n.getLocale();
    this.state.languageSwitching = true;
    void i18n
      .initialize(taskfoldHost().locale)
      .then((applied) => {
        if (!applied && !this.stopped) {
          this.state.languageError = i18n.t("taskfoldProject.languageChangeFailed");
        }
      })
      .finally(() => {
        if (!this.stopped) {
          this.state.languageSwitching = false;
          this.requestUpdate();
        }
      });
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    // 宿主负责连接与变更感知（OpenClaw 实现里是共享 Gateway 连接 + `changes.wait`
    // 长轮询，见 `openclaw-host.ts`）。`subscribe()` 注册时不回调，初始连接状态由
    // 下面这一次显式调用同步。
    this.unsubscribeHost = taskfoldHost().subscribe((event) => this.handleHostEvent(event));
    this.syncConnectionState();
  }

  disconnectedCallback() {
    this.stopped = true;
    this.refreshGeneration += 1;
    this.clearExecutionRefreshTimer();
    this.unsubscribeI18n?.();
    this.unsubscribeI18n = undefined;
    this.unsubscribeHost?.();
    this.unsubscribeHost = undefined;
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    super.disconnectedCallback();
  }

  private readonly handleVisibilityChange = () => {
    if (document.visibilityState === "visible" && this.connectedToGateway) {
      void this.refresh();
    }
  };

  private setLocale(locale: TaskfoldLocale) {
    if (this.state.languageSwitching) {
      return;
    }
    this.state.languageSwitching = true;
    this.state.languageError = null;
    this.requestUpdate();
    void i18n
      .setLocale(locale)
      .then((applied) => {
        if (!applied && !this.stopped) {
          this.state.languageError = i18n.t("taskfoldProject.languageChangeFailed");
        }
      })
      .finally(() => {
        if (!this.stopped) {
          this.state.languageSwitching = false;
          this.requestUpdate();
        }
      });
  }

  private handleHostEvent(event: TaskfoldHostEvent) {
    if (event.type === "changes") {
      if (this.connectedToGateway) {
        void this.refresh();
      }
      return;
    }
    this.syncConnectionState();
  }

  private syncConnectionState() {
    const wasConnected = this.connectedToGateway;
    const isConnected = taskfoldHost().connected;
    this.connectedToGateway = isConnected;
    if (isConnected && !wasConnected) {
      void this.refresh();
    } else if (!isConnected && wasConnected) {
      // The host does not surface a disconnect reason string the way the old
      // self-managed WebSocket did; reuse the same "waiting on the Gateway"
      // copy `mutate()` already shows for the same underlying condition.
      this.state.error = i18n.t("taskfoldProject.connectionRequired");
    }
    this.requestUpdate();
  }

  private async refresh() {
    if (!this.connectedToGateway) {
      return;
    }
    const generation = ++this.refreshGeneration;
    this.state.loading = true;
    this.state.error = null;
    this.requestUpdate();
    try {
      const list = await taskfoldHost().request<ProjectListResponse>("taskfold.projects.list", {
        includeArchived: true,
      });
      if (generation !== this.refreshGeneration) {
        return;
      }
      this.state.projects = list.projects;
      const selectedId = this.state.selectedProjectId;
      if (selectedId && !list.projects.some((project) => project.id === selectedId)) {
        this.state.selectedProjectId = null;
        this.state.project = null;
        this.state.documents = [];
        this.state.selectedDocumentId = null;
        this.state.documentPreview = null;
        this.state.documentPreviewError = null;
        this.state.documentEditing = false;
        this.state.documentDraft = null;
        this.clearExecutionState();
        this.state.screen = "overview";
      } else if (selectedId) {
        const project = await taskfoldHost().request<ProjectResponse>("taskfold.projects.get", {
          id: selectedId,
        });
        if (generation !== this.refreshGeneration) {
          return;
        }
        this.state.project = project.project;
        if (this.state.screen === "documents") {
          const documents = await taskfoldHost().request<ProjectDocumentsResponse>(
            "taskfold.projects.documents.list",
            {
              boardId: selectedId,
              includeHidden: true,
            },
          );
          if (generation !== this.refreshGeneration) {
            return;
          }
          this.state.documents = documents.documents.map(normalizeProjectDocument);
          if (
            this.state.selectedDocumentId &&
            !documents.documents.some((document) => document.id === this.state.selectedDocumentId)
          ) {
            this.state.selectedDocumentId = null;
            this.state.documentPreview = null;
            this.state.documentPreviewError = null;
            this.state.documentEditing = false;
            this.state.documentDraft = null;
          }
        }
      }
      this.state.loaded = true;
    } catch (error) {
      if (generation === this.refreshGeneration) {
        this.state.error = errorMessage(error);
      }
    } finally {
      if (generation === this.refreshGeneration) {
        this.state.loading = false;
        this.requestUpdate();
      }
    }
  }

  private selectProject(id: string) {
    this.state.selectedProjectId = id;
    this.state.screen = "board";
    this.state.documents = [];
    this.state.selectedDocumentId = null;
    this.state.documentPreview = null;
    this.state.documentPreviewError = null;
    this.state.documentEditing = false;
    this.state.documentDraft = null;
    void this.refresh();
  }

  private setScreen(screen: TaskfoldProjectUiState["screen"]) {
    if (
      (screen === "settings" && !this.capabilities.projectManagement) ||
      (screen === "documents" && !this.capabilities.documents)
    ) {
      return;
    }
    if (screen !== "overview" && !this.state.selectedProjectId) {
      this.state.screen = "overview";
      this.requestUpdate();
      return;
    }
    this.state.screen = screen;
    if (screen === "documents") {
      void this.refresh();
    } else {
      this.requestUpdate();
    }
  }

  private openModal(modal: TaskfoldProjectModal) {
    this.clearExecutionRefreshTimer();
    this.clearCardEditState();
    this.state.modal = modal;
    this.requestUpdate();
    if (modal.kind === "card-detail") {
      void this.refreshCardExecution(modal.cardId);
    }
  }

  private closeModal() {
    this.clearExecutionRefreshTimer();
    this.clearCardEditState();
    this.state.modal = null;
    this.requestUpdate();
  }

  private clearCardEditState() {
    this.state.cardDraft = null;
    this.state.cardDraftError = null;
    this.state.deliveryBaseRevision = null;
  }

  /** 前端此刻读到的卡片 revision（拖拽、状态下拉这类即时操作用它做 CAS）。 */
  private cardRevision(id: string): number | undefined {
    return this.state.project?.cards.find((card) => card.id === id)?.revision;
  }

  /** 宿主声明支持卡片 CAS（`capabilities.cardRevisionCheck`）时才带 `expectedRevision`。 */
  private casParams(expectedRevision: number | undefined): { expectedRevision?: number } {
    return this.capabilities.cardRevisionCheck && expectedRevision !== undefined
      ? { expectedRevision }
      : {};
  }

  /**
   * 处理打开了卡片 CAS 的宿主返回的冲突结果（{@link TaskfoldCardWriteResult}）。`reloaded`：丢掉
   * 这张卡的全部本地修改——编辑草稿、交付事实表单里还没提交的输入（关掉再重开卡片详情，表单
   * 整个重建）。`cancelled`：什么都没写，草稿与交付事实的基准 revision 原样保留，可以再提交。
   * 一次写成且草稿正基于这次写入前的 revision 时，把草稿的基准挪到新 revision：这是自己的写入，
   * 不应让之后保存草稿时和自己冲突。
   */
  private async applyCardWriteResult(
    result: unknown,
    cardId: string,
    expectedRevision: number | undefined,
  ): Promise<TaskfoldCardWriteResult["conflict"]> {
    const { conflict, card } = (result ?? {}) as TaskfoldCardWriteResult & {
      card?: { id?: unknown; revision?: unknown };
    };
    if (conflict === "reloaded") {
      this.clearCardEditState();
      const modal = this.state.modal;
      if (modal?.kind === "card-detail" && modal.cardId === cardId) {
        this.state.modal = null;
        this.requestUpdate();
        await this.updateComplete;
        this.state.modal = modal;
      }
      return conflict;
    }
    if (conflict === "cancelled") {
      return conflict;
    }
    const draft = this.state.cardDraft;
    if (
      !conflict &&
      draft?.cardId === cardId &&
      draft.baseRevision === expectedRevision &&
      card?.id === cardId &&
      typeof card.revision === "number"
    ) {
      draft.baseRevision = card.revision;
    }
    return conflict;
  }

  private clearExecutionRefreshTimer() {
    if (this.executionRefreshTimer !== null) {
      window.clearTimeout(this.executionRefreshTimer);
      this.executionRefreshTimer = null;
    }
  }

  private clearExecutionState() {
    this.clearExecutionRefreshTimer();
    this.state.executionPreparationCardId = null;
    this.state.executionPreparation = null;
    this.state.executionPreparationLoading = false;
    this.state.executionPreparationError = null;
    this.state.executionInspectionCardId = null;
    this.state.executionInspection = null;
    this.state.executionInspectionLoading = false;
    this.state.executionInspectionError = null;
  }

  private scheduleExecutionRefresh(cardId: string) {
    this.clearExecutionRefreshTimer();
    if (
      this.stopped ||
      !this.connectedToGateway ||
      this.state.modal?.kind !== "card-detail" ||
      this.state.modal.cardId !== cardId
    ) {
      return;
    }
    this.executionRefreshTimer = window.setTimeout(() => {
      this.executionRefreshTimer = null;
      void this.refreshCardExecution(cardId);
    }, 3_000);
  }

  private async mutate(action: () => Promise<void>, options: { closeModal?: boolean } = {}) {
    if (this.state.busy) {
      return;
    }
    if (!this.connectedToGateway) {
      this.state.error = i18n.t("taskfoldProject.connectionRequired");
      this.requestUpdate();
      return;
    }
    this.state.busy = true;
    this.state.error = null;
    this.requestUpdate();
    try {
      await action();
      if (options.closeModal !== false) {
        this.state.modal = null;
      }
      await this.refresh();
    } catch (error) {
      this.state.error = errorMessage(error);
      this.requestUpdate();
    } finally {
      this.state.busy = false;
      this.requestUpdate();
    }
  }

  private createProject(data: Record<string, string>) {
    void this.mutate(async () => {
      const projectMode = data.projectMode === "existing" ? "existing" : "new";
      const workspacePath = data.workspacePath?.trim();
      if (projectMode === "existing" && !workspacePath) {
        throw new Error(i18n.t("taskfoldProject.existingWorkspaceRequired"));
      }
      const response = await taskfoldHost().request<ProjectResponse>("taskfold.projects.create", {
        id: data.id,
        name: data.name,
        projectMode,
        ...(projectMode === "existing"
          ? { defaultWorkspace: { kind: "dir", path: workspacePath } }
          : {}),
      });
      this.state.selectedProjectId = response.project.board.id;
      this.state.screen = "board";
    });
  }

  private updateProject(data: Record<string, string>) {
    const project = this.state.project;
    if (!project) {
      return;
    }
    void this.mutate(async () => {
      const workspacePath = data.workspacePath?.trim();
      await taskfoldHost().request("taskfold.projects.update", {
        id: project.board.id,
        name: data.name,
        version: data.version,
        currentObjective: data.currentObjective,
        coreValue: data.coreValue,
        sourceOfTruth: data.sourceOfTruth,
        repositoryUrl: data.repositoryUrl,
        planningPath: data.planningPath,
        homepageUrl: data.homepageUrl,
        ...(workspacePath
          ? { defaultWorkspace: { kind: "dir", path: workspacePath } }
          : {}),
      });
    }, { closeModal: false });
  }

  private async archiveProject(archived: boolean) {
    const project = this.state.project;
    if (!project) {
      return;
    }
    if (
      archived &&
      !(await taskfoldHost().confirm(
        i18n.t("taskfoldProject.archiveProjectConfirm"),
      ))
    ) {
      return;
    }
    void this.mutate(async () => {
      await taskfoldHost().request(
        archived ? "taskfold.projects.archive" : "taskfold.projects.restore",
        { id: project.board.id },
      );
    }, { closeModal: false });
  }

  private createCard(data: Record<string, string>) {
    const project = this.state.project;
    if (!project) {
      return;
    }
    void this.mutate(async () => {
      await taskfoldHost().request("taskfold.cards.create", {
        boardId: project.board.id,
        title: data.title,
        notes: data.notes,
        status: data.status,
        priority: data.priority,
        agentId: data.agentId,
        ...(data.milestoneId ? { milestoneId: data.milestoneId } : {}),
        ...(data.requirementId ? { requirementId: data.requirementId } : {}),
        ...(data.cardKind === "requirement" ? { kind: "requirement" } : {}),
      });
    });
  }

  private updateCardStatus(id: string, status: TaskfoldStatus) {
    const expectedRevision = this.cardRevision(id);
    void this.mutate(async () => {
      const result = await taskfoldHost().request("taskfold.cards.move", {
        id,
        status,
        ...this.casParams(expectedRevision),
      });
      await this.applyCardWriteResult(result, id, expectedRevision);
    }, { closeModal: false });
  }

  private archiveCard(id: string, archived: boolean) {
    void this.mutate(async () => {
      await taskfoldHost().request("taskfold.cards.archive", { id, archived });
    }, { closeModal: false });
  }

  private moveCardMilestone(id: string, milestoneId?: string, position?: number) {
    const project = this.state.project;
    if (project?.board.archivedAt) {
      return;
    }
    const expectedRevision = this.cardRevision(id);
    void this.mutate(async () => {
      const result = await taskfoldHost().request("taskfold.cards.moveMilestone", {
        id,
        ...(milestoneId ? { milestoneId } : {}),
        ...(position !== undefined ? { position } : {}),
        ...this.casParams(expectedRevision),
      });
      await this.applyCardWriteResult(result, id, expectedRevision);
    }, { closeModal: false });
  }

  private moveCardRequirement(id: string, requirementId?: string) {
    const project = this.state.project;
    if (project?.board.archivedAt) {
      return;
    }
    void this.mutate(async () => {
      await taskfoldHost().request("taskfold.cards.requirement.set", {
        id,
        ...(requirementId ? { requirementId } : {}),
      });
    }, { closeModal: false });
  }

  private updateBoardView(boardView: TaskfoldBoardViewSettings) {
    const project = this.state.project;
    if (!project || project.board.archivedAt) {
      return;
    }
    void this.mutate(async () => {
      await taskfoldHost().request("taskfold.projects.boardView.update", {
        id: project.board.id,
        boardView,
      });
    }, { closeModal: false });
  }

  private setGraphMode(mode: TaskfoldProjectUiState["graphMode"]) {
    this.state.graphMode = mode;
    this.requestUpdate();
  }

  private setGraphZoom(zoom: number) {
    this.state.graphZoom = Math.min(1.5, Math.max(0.7, Math.round(zoom * 10) / 10));
    this.requestUpdate();
  }

  private moveCardProject(id: string, boardId: string, milestoneId: string) {
    const target = this.state.projects.find((project) => project.id === boardId);
    if (!target || !milestoneId) {
      return;
    }
    void this.mutate(async () => {
      await taskfoldHost().request("taskfold.cards.moveProject", { id, boardId, milestoneId });
    });
  }

  private selectMoveCardProjectTarget(cardId: string, boardId: string) {
    if (!boardId) {
      this.state.modal = { kind: "move-project", cardId };
      this.requestUpdate();
      return;
    }
    this.state.modal = { kind: "move-project", cardId, boardId };
    this.state.busy = true;
    this.state.error = null;
    this.requestUpdate();
    void taskfoldHost()
      .request<ProjectResponse>("taskfold.projects.get", { id: boardId })
      .then((response) => {
        const modal = this.state.modal;
        if (
          modal?.kind === "move-project" &&
          modal.cardId === cardId &&
          modal.boardId === boardId
        ) {
          this.state.modal = { ...modal, targetProject: response.project };
        }
      })
      .catch((error) => {
        this.state.error = errorMessage(error);
      })
      .finally(() => {
        this.state.busy = false;
        this.requestUpdate();
      });
  }

  private reorderProjects(ids: string[]) {
    void this.mutate(async () => {
      await taskfoldHost().request("taskfold.projects.reorder", { ids });
    }, { closeModal: false });
  }

  private reorderMilestones(milestoneIds: string[]) {
    const project = this.state.project;
    if (!project || project.board.archivedAt) {
      return;
    }
    void this.mutate(async () => {
      await taskfoldHost().request("taskfold.projects.milestones.reorder", {
        boardId: project.board.id,
        milestoneIds,
      });
    }, { closeModal: false });
  }

  private reorderDocuments(documentIds: string[]) {
    const project = this.state.project;
    if (!project) {
      return;
    }
    void this.mutate(async () => {
      await taskfoldHost().request("taskfold.projects.documents.reorder", {
        boardId: project.board.id,
        documentIds,
      });
    }, { closeModal: false });
  }

  private openDocument(id: string) {
    void this.readDocument(id);
  }

  private refreshDocument() {
    if (this.state.selectedDocumentId) {
      void this.readDocument(this.state.selectedDocumentId);
    }
  }

  private startDocumentEdit() {
    const document = this.state.documents.find(
      (candidate) => candidate.id === this.state.selectedDocumentId,
    );
    const preview = this.state.documentPreview;
    if (
      !document ||
      !preview ||
      preview.document.id !== document.id ||
      (document.type !== "markdown" && !(document.type === "path" && preview.source === "path"))
    ) {
      return;
    }
    this.state.documentDraft ??= preview.content;
    this.state.documentEditing = true;
    this.state.documentPreviewError = null;
    this.requestUpdate();
  }

  private previewDocumentDraft() {
    if (this.state.documentDraft === null) {
      return;
    }
    this.state.documentEditing = false;
    this.requestUpdate();
  }

  private formatDocument(
    command: "bold" | "italic" | "formatBlock" | "insertUnorderedList",
  ) {
    const editor = this.querySelector<HTMLElement>(".taskfold-project__rich-editor");
    if (!editor) {
      return;
    }
    editor.focus();
    document.execCommand(command, false, command === "formatBlock" ? "h2" : undefined);
    this.state.documentDraft = taskfoldEditorHtmlToMarkdown(editor.innerHTML);
  }

  private cancelDocumentEdit() {
    this.state.documentEditing = false;
    this.state.documentDraft = null;
    this.state.documentPreviewError = null;
    this.requestUpdate();
  }

  private saveDocumentContent() {
    const document = this.state.documents.find(
      (candidate) => candidate.id === this.state.selectedDocumentId,
    );
    const preview = this.state.documentPreview;
    const content = this.state.documentDraft;
    if (
      this.state.busy ||
      !document ||
      !preview ||
      preview.document.id !== document.id ||
      content === null
    ) {
      return;
    }
    if (!this.connectedToGateway) {
      this.state.documentPreviewError = i18n.t("taskfoldProject.connectionRequired");
      this.requestUpdate();
      return;
    }
    this.state.busy = true;
    this.state.documentPreviewError = null;
    this.requestUpdate();
    void taskfoldHost()
      .request<ProjectDocumentWriteResponse>("taskfold.projects.documents.write", {
        id: document.id,
        content,
        expectedRevision: preview.revision,
      })
      .then((response) => {
        if (this.state.selectedDocumentId !== document.id) {
          return;
        }
        this.state.documents = this.state.documents.map((candidate) =>
          candidate.id === document.id
            ? normalizeProjectDocument(response.preview.document)
            : candidate,
        );
        this.state.documentPreview = normalizeProjectDocumentRead(response.preview);
        this.state.documentEditing = false;
        this.state.documentDraft = null;
      })
      .catch((error) => {
        if (this.state.selectedDocumentId === document.id) {
          this.state.documentPreviewError = errorMessage(error);
        }
      })
      .finally(() => {
        this.state.busy = false;
        this.requestUpdate();
      });
  }

  private async readDocument(id: string) {
    if (this.state.documentPreviewLoading) {
      return;
    }
    const selectionChanged = this.state.selectedDocumentId !== id;
    this.state.selectedDocumentId = id;
    this.state.documentPreview = null;
    this.state.documentPreviewError = null;
    if (selectionChanged) {
      this.state.documentEditing = false;
      this.state.documentDraft = null;
    }
    this.state.documentPreviewLoading = true;
    this.requestUpdate();
    try {
      const response = await taskfoldHost().request<ProjectDocumentReadResponse>(
        "taskfold.projects.documents.read",
        { id },
      );
      if (this.state.selectedDocumentId === id) {
        this.state.documentPreview = normalizeProjectDocumentRead(response.preview);
      }
    } catch (error) {
      if (this.state.selectedDocumentId === id) {
        this.state.documentPreviewError = errorMessage(error);
      }
    } finally {
      if (this.state.selectedDocumentId === id) {
        this.state.documentPreviewLoading = false;
        this.requestUpdate();
      }
    }
  }

  private saveMilestone(data: Record<string, string>) {
    const project = this.state.project;
    if (!project) {
      return;
    }
    void this.mutate(async () => {
      if (data.id) {
        await taskfoldHost().request("taskfold.projects.milestones.update", {
          id: data.id,
          title: data.title,
          description: data.description,
          color: data.color,
        });
        return;
      }
      await taskfoldHost().request("taskfold.projects.milestones.create", {
        boardId: project.board.id,
        title: data.title,
        description: data.description,
        color: data.color,
      });
    });
  }

  private completeMilestone(id: string) {
    void this.mutate(async () => {
      await taskfoldHost().request("taskfold.projects.milestones.complete", { id });
    }, { closeModal: false });
  }

  private archiveMilestone(id: string, archived: boolean) {
    void this.mutate(async () => {
      await taskfoldHost().request(
        archived ? "taskfold.projects.milestones.archive" : "taskfold.projects.milestones.restore",
        { id },
      );
    }, { closeModal: false });
  }

  private saveDocument(data: Record<string, string>) {
    const project = this.state.project;
    if (!project) {
      return;
    }
    void this.mutate(async () => {
      const common = {
        title: data.title,
        type: data.type,
        summary: data.summary,
        target: data.target,
        content: data.content,
      };
      if (data.id) {
        await taskfoldHost().request("taskfold.projects.documents.update", { id: data.id, ...common });
        return;
      }
      await taskfoldHost().request("taskfold.projects.documents.create", {
        boardId: project.board.id,
        key: data.key,
        section: data.section,
        ...common,
      });
    });
  }

  private hideDocument(id: string, hidden: boolean) {
    void this.mutate(async () => {
      await taskfoldHost().request(
        hidden ? "taskfold.projects.documents.hide" : "taskfold.projects.documents.restore",
        { id },
      );
    }, { closeModal: false });
  }

  private async deleteDocument(id: string) {
    if (!(await taskfoldHost().confirm(i18n.t("common.delete")))) {
      return;
    }
    void this.mutate(async () => {
      await taskfoldHost().request("taskfold.projects.documents.delete", { id });
    }, { closeModal: false });
  }

  private beginDeliveryEdit(id: string, revision: number) {
    if (this.state.deliveryBaseRevision?.cardId !== id) {
      this.state.deliveryBaseRevision = { cardId: id, revision };
    }
  }

  private updateCardDelivery(id: string, data: Record<string, string>) {
    const base = this.state.deliveryBaseRevision;
    const expectedRevision = base?.cardId === id ? base.revision : this.cardRevision(id);
    void this.mutate(async () => {
      const result = await taskfoldHost().request("taskfold.cards.update", {
        id,
        delivery: {
          objective: data.objective,
          deliverySummary: data.deliverySummary,
          openItems: data.openItems,
          implementationState: data.implementationState,
          verificationState: data.verificationState,
          releaseState: data.releaseState,
        },
        ...this.casParams(expectedRevision),
      });
      const conflict = await this.applyCardWriteResult(result, id, expectedRevision);
      if (conflict !== "cancelled" && this.state.deliveryBaseRevision?.cardId === id) {
        this.state.deliveryBaseRevision = null;
      }
    }, { closeModal: false });
  }

  private startCardEdit(id: string) {
    if (!this.capabilities.cardEditing) {
      return;
    }
    const card = this.state.project?.cards.find((candidate) => candidate.id === id);
    if (!card) {
      return;
    }
    const base: TaskfoldCardDraftFields = {
      title: card.title,
      priority: card.priority,
      notes: card.notes ?? "",
    };
    this.state.cardDraft = { cardId: id, baseRevision: card.revision, base, ...base };
    this.state.cardDraftError = null;
    this.requestUpdate();
  }

  private cancelCardEdit() {
    this.state.cardDraft = null;
    this.state.cardDraftError = null;
    this.requestUpdate();
  }

  /** 保存编辑草稿：只发与进入编辑时不同的字段，以进入编辑时的 revision 做 CAS。 */
  private saveCardEdit() {
    const draft = this.state.cardDraft;
    if (!draft || this.state.busy) {
      return;
    }
    const patch: Partial<TaskfoldCardDraftFields> = {};
    for (const field of ["title", "priority", "notes"] as const) {
      if (draft[field] !== draft.base[field]) {
        Object.assign(patch, { [field]: draft[field] });
      }
    }
    if (Object.keys(patch).length === 0) {
      this.cancelCardEdit();
      return;
    }
    this.state.cardDraftError = null;
    void this.mutate(async () => {
      try {
        const result = await taskfoldHost().request("taskfold.cards.update", {
          id: draft.cardId,
          ...patch,
          ...this.casParams(draft.baseRevision),
        });
        const conflict = await this.applyCardWriteResult(result, draft.cardId, draft.baseRevision);
        if (conflict !== "cancelled" && this.state.cardDraft === draft) {
          this.state.cardDraft = null;
        }
      } catch (error) {
        // 错误显示在编辑表单里，草稿保留，可以重试（LOCKED 等）。
        if (this.state.cardDraft === draft) {
          this.state.cardDraftError = errorMessage(error);
        } else {
          throw error;
        }
      }
    }, { closeModal: false });
  }

  private openCardFile(id: string) {
    if (!this.capabilities.openCardFile) {
      return;
    }
    void taskfoldHost()
      .request("taskfold.cards.openFile", { id })
      .catch((error) => {
        this.state.error = errorMessage(error);
        this.requestUpdate();
      });
  }

  private prepareCardExecution(id: string) {
    if (!this.executionEnabled) {
      return;
    }
    if (!this.connectedToGateway) {
      this.state.error = i18n.t("taskfoldProject.connectionRequired");
      this.requestUpdate();
      return;
    }
    this.clearExecutionRefreshTimer();
    this.state.modal = { kind: "execution-start", cardId: id };
    this.state.executionPreparationCardId = id;
    this.state.executionPreparation = null;
    this.state.executionPreparationLoading = true;
    this.state.executionPreparationError = null;
    this.requestUpdate();
    void taskfoldHost()
      .request<CardExecutionPreparationResponse>("taskfold.cards.execution.prepare", { id })
      .then((preparation) => {
        if (
          this.state.executionPreparationCardId !== id ||
          this.state.modal?.kind !== "execution-start" ||
          this.state.modal.cardId !== id
        ) {
          return;
        }
        this.state.executionPreparation = preparation;
        if (preparation.active) {
          this.state.modal = { kind: "card-detail", cardId: id };
          void this.refreshCardExecution(id);
        }
      })
      .catch((error) => {
        if (this.state.executionPreparationCardId === id) {
          this.state.executionPreparationError = errorMessage(error);
        }
      })
      .finally(() => {
        if (this.state.executionPreparationCardId === id) {
          this.state.executionPreparationLoading = false;
          this.requestUpdate();
        }
      });
  }

  private startCardExecution(id: string) {
    if (!this.executionEnabled) {
      return;
    }
    const preparation =
      this.state.executionPreparationCardId === id ? this.state.executionPreparation : null;
    if (!preparation) {
      return;
    }
    void this.mutate(
      async () => {
        await taskfoldHost().request("taskfold.cards.execution.start", {
          id,
          expectedRevision: preparation.expectedRevision,
        });
        this.state.modal = { kind: "card-detail", cardId: id };
        this.state.executionPreparation = null;
        this.state.executionPreparationError = null;
        this.state.executionInspectionCardId = id;
        this.state.executionInspection = null;
        this.refreshCardExecution(id);
      },
      { closeModal: false },
    );
  }

  private refreshCardExecution(id: string) {
    if (
      !this.executionEnabled ||
      !this.connectedToGateway ||
      this.state.executionInspectionLoading
    ) {
      return;
    }
    this.state.executionInspectionCardId = id;
    this.state.executionInspectionLoading = true;
    this.state.executionInspectionError = null;
    this.requestUpdate();
    // Read-only. Card state is converged by the Gateway-side reconciler service,
    // so the UI never writes lifecycle state — it would only be correct while a
    // browser happened to be open on the right card.
    void taskfoldHost()
      .request<CardExecutionInspectionResponse>("taskfold.cards.execution.inspect", { id })
      .then((inspection) => {
        if (this.state.executionInspectionCardId !== id) {
          return;
        }
        this.state.executionInspection = inspection;
        if (inspection.active) {
          this.scheduleExecutionRefresh(id);
        } else {
          this.clearExecutionRefreshTimer();
        }
      })
      .catch((error) => {
        if (this.state.executionInspectionCardId === id) {
          this.state.executionInspectionError = errorMessage(error);
          const card = this.state.project?.cards.find((candidate) => candidate.id === id);
          const stillActive =
            this.state.executionInspection?.active ||
            card?.execution?.status === "running" ||
            Boolean(card?.metadata?.attempts?.some((attempt) => attempt.status === "running"));
          if (stillActive) {
            this.scheduleExecutionRefresh(id);
          }
        }
      })
      .finally(() => {
        if (this.state.executionInspectionCardId === id) {
          this.state.executionInspectionLoading = false;
          this.requestUpdate();
        }
      });
  }

  private steerCardExecution(id: string, message: string) {
    if (!this.executionEnabled || !message.trim()) {
      return;
    }
    void this.mutate(
      async () => {
        const card = this.state.project?.cards.find((candidate) => candidate.id === id);
        const sessionKey = card?.execution?.sessionKey ?? card?.sessionKey;
        if (!sessionKey) {
          throw new Error("active execution has no session.");
        }
        const response = await taskfoldHost().request<{ runId?: unknown }>("sessions.steer", {
          key: sessionKey,
          message,
        });
        await taskfoldHost().request("taskfold.cards.execution.steer", {
          id,
          ...(typeof response.runId === "string" && response.runId.trim()
            ? { nextRunId: response.runId }
            : {}),
        });
        this.refreshCardExecution(id);
      },
      { closeModal: false },
    );
  }

  private async abortCardExecution(id: string) {
    if (
      !this.executionEnabled ||
      !(await taskfoldHost().confirm(i18n.t("taskfoldProject.stopExecutionConfirm")))
    ) {
      return;
    }
    void this.mutate(
      async () => {
        const card = this.state.project?.cards.find((candidate) => candidate.id === id);
        const sessionKey = card?.execution?.sessionKey ?? card?.sessionKey;
        const runId = card?.execution?.runId ?? card?.runId;
        if (!sessionKey) {
          throw new Error("active execution has no session.");
        }
        const aborted = await taskfoldHost().request<{ aborted?: unknown; runIds?: unknown }>(
          "chat.abort",
          {
            sessionKey,
            ...(runId ? { runId } : {}),
          },
        );
        const confirmed =
          aborted.aborted === true ||
          (Array.isArray(aborted.runIds) && aborted.runIds.some((candidate) => candidate === runId));
        if (!confirmed) {
          throw new Error("OpenClaw did not confirm that the active run was stopped.");
        }
        await taskfoldHost().request("taskfold.cards.execution.abort", {
          id,
          ...(runId ? { expectedRunId: runId } : {}),
        });
        this.refreshCardExecution(id);
      },
      { closeModal: false },
    );
  }

  private createSourceReference(id: string, data: Record<string, string>) {
    void this.mutate(async () => {
      await taskfoldHost().request("taskfold.cards.sources.create", { id, ...data });
    }, { closeModal: false });
  }

  private updateSourceReference(id: string, data: Record<string, string>) {
    void this.mutate(async () => {
      await taskfoldHost().request("taskfold.cards.sources.update", { id, ...data });
    }, { closeModal: false });
  }

  private deleteSourceReference(id: string, sourceReferenceId: string) {
    void this.mutate(async () => {
      await taskfoldHost().request("taskfold.cards.sources.delete", { id, sourceReferenceId });
    }, { closeModal: false });
  }

  private reorderSourceReferences(id: string, sourceReferenceIds: string[]) {
    void this.mutate(async () => {
      await taskfoldHost().request("taskfold.cards.sources.reorder", { id, sourceReferenceIds });
    }, { closeModal: false });
  }

  private addProof(id: string, data: Record<string, string>) {
    void this.mutate(async () => {
      await taskfoldHost().request("taskfold.cards.proof", { id, ...data });
    }, { closeModal: false });
  }

  private deleteProof(id: string, proofId: string) {
    void this.mutate(async () => {
      await taskfoldHost().request("taskfold.cards.proof.delete", { id, proofId });
    }, { closeModal: false });
  }

  private addArtifact(id: string, data: Record<string, string>) {
    void this.mutate(async () => {
      await taskfoldHost().request("taskfold.cards.artifact", { id, ...data });
    }, { closeModal: false });
  }

  private deleteArtifact(id: string, artifactId: string) {
    void this.mutate(async () => {
      await taskfoldHost().request("taskfold.cards.artifact.delete", { id, artifactId });
    }, { closeModal: false });
  }

  render() {
    return html`${renderTaskfoldProjects({
      state: this.state,
      connected: this.connectedToGateway,
      executionEnabled: this.executionEnabled,
      cardEditingEnabled: this.capabilities.cardEditing,
      projectManagementEnabled: this.capabilities.projectManagement,
      documentsEnabled: this.capabilities.documents,
      openCardFileEnabled: this.capabilities.openCardFile,
      requestUpdate: () => this.requestUpdate(),
      refresh: () => void this.refresh(),
      locale: i18n.getLocale(),
      setLocale: (locale) => this.setLocale(locale),
      selectProject: (id) => this.selectProject(id),
      setScreen: (screen) => this.setScreen(screen),
      openModal: (modal) => this.openModal(modal),
      closeModal: () => this.closeModal(),
      createProject: (data) => this.createProject(data),
      updateProject: (data) => this.updateProject(data),
      archiveProject: (archived) => this.archiveProject(archived),
      createCard: (data) => this.createCard(data),
      updateCardStatus: (id, status) => this.updateCardStatus(id, status),
      archiveCard: (id, archived) => this.archiveCard(id, archived),
      moveCardMilestone: (id, milestoneId, position) =>
        this.moveCardMilestone(id, milestoneId, position),
      moveCardRequirement: (id, requirementId) => this.moveCardRequirement(id, requirementId),
      moveCardProject: (id, boardId, milestoneId) =>
        this.moveCardProject(id, boardId, milestoneId),
      updateBoardView: (boardView) => this.updateBoardView(boardView),
      setGraphMode: (mode) => this.setGraphMode(mode),
      setGraphZoom: (zoom) => this.setGraphZoom(zoom),
      selectMoveCardProjectTarget: (cardId, boardId) =>
        this.selectMoveCardProjectTarget(cardId, boardId),
      reorderProjects: (ids) => this.reorderProjects(ids),
      reorderMilestones: (ids) => this.reorderMilestones(ids),
      reorderDocuments: (ids) => this.reorderDocuments(ids),
      openDocument: (id) => this.openDocument(id),
      refreshDocument: () => this.refreshDocument(),
      startDocumentEdit: () => this.startDocumentEdit(),
      previewDocumentDraft: () => this.previewDocumentDraft(),
      cancelDocumentEdit: () => this.cancelDocumentEdit(),
      saveDocumentContent: () => this.saveDocumentContent(),
      formatDocument: (command) => this.formatDocument(command),
      saveMilestone: (data) => this.saveMilestone(data),
      completeMilestone: (id) => this.completeMilestone(id),
      archiveMilestone: (id, archived) => this.archiveMilestone(id, archived),
      saveDocument: (data) => this.saveDocument(data),
      hideDocument: (id, hidden) => this.hideDocument(id, hidden),
      deleteDocument: (id) => this.deleteDocument(id),
      updateCardDelivery: (id, data) => this.updateCardDelivery(id, data),
      beginDeliveryEdit: (id, revision) => this.beginDeliveryEdit(id, revision),
      startCardEdit: (id) => this.startCardEdit(id),
      cancelCardEdit: () => this.cancelCardEdit(),
      saveCardEdit: () => this.saveCardEdit(),
      openCardFile: (id) => this.openCardFile(id),
      prepareCardExecution: (id) => this.prepareCardExecution(id),
      startCardExecution: (id) => this.startCardExecution(id),
      refreshCardExecution: (id) => this.refreshCardExecution(id),
      steerCardExecution: (id, message) => this.steerCardExecution(id, message),
      abortCardExecution: (id) => this.abortCardExecution(id),
      createSourceReference: (id, data) => this.createSourceReference(id, data),
      updateSourceReference: (id, data) => this.updateSourceReference(id, data),
      deleteSourceReference: (id, sourceReferenceId) =>
        this.deleteSourceReference(id, sourceReferenceId),
      reorderSourceReferences: (id, sourceReferenceIds) =>
        this.reorderSourceReferences(id, sourceReferenceIds),
      addProof: (id, data) => this.addProof(id, data),
      deleteProof: (id, proofId) => this.deleteProof(id, proofId),
      addArtifact: (id, data) => this.addArtifact(id, data),
      deleteArtifact: (id, artifactId) => this.deleteArtifact(id, artifactId),
    })}`;
  }
}

// `browser/index.ts`'s page `mount()` creates a `<taskfold-app>` element and
// appends it into the host-provided container, so this definition just needs
// to exist before that happens. Guarded because the host may keep the module
// registered across a mount/unmount cycle (page navigation away and back)
// while `customElements.define()` may only run once per tag name.
if (!customElements.get("taskfold-app")) {
  customElements.define("taskfold-app", TaskfoldProjectHost);
}
