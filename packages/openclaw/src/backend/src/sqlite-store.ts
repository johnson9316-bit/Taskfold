// Taskfold 适配层：**只读**打开旧 SQLite 库（TASK-10 第二段后 SQLite 运行时后端已下线）。
//
// 唯一使用者是随插件发布的迁移工具（`openclaw taskfold migrate-sqlite`，sqlite-migration.ts）：
// 只读打开一份快照，把旧数据导出成文件存储。这里不建库、不跑 schema 迁移、不设 pragma、
// 不碰 plugins/ 下另外三份历史库（flowboard、gsdboard 与宿主自带看板插件的库），也**没有任何
// 写入路径**——只读 store 只实现 `lookup`/`entries`（TaskfoldReadOnlyKeyedStore）。
//
// 历史：SQLite 曾是生产真相源（fork 点 78d6c6c 起，直到 2026-09-28 TASK-10 真实迁移）。schema
// SQL、建库/旧库迁移/加固、写事务、change 游标预留与 dataVersion 探测等写路径已随 TASK-10
// 第二段删除；需要参考时看 git 历史（本文件在 merge ef6ab4e 之前的版本）。
import { DatabaseSync } from "node:sqlite";
import type {
  TaskfoldArtifact,
  TaskfoldAttachment,
  TaskfoldCard,
  TaskfoldCardKind,
  TaskfoldComment,
  TaskfoldDelivery,
  TaskfoldDiagnostic,
  TaskfoldEvent,
  TaskfoldExecution,
  TaskfoldLink,
  TaskfoldMetadata,
  TaskfoldMilestone,
  TaskfoldNotification,
  TaskfoldProof,
  TaskfoldProjectDocument,
  TaskfoldRunAttempt,
  TaskfoldSourceReference,
  TaskfoldWorkerLog,
} from "@taskfold/core/contract/index.js";
import type {
  PersistedTaskfoldAttachment,
  PersistedTaskfoldBoard,
  PersistedTaskfoldCard,
  PersistedTaskfoldMilestone,
  PersistedTaskfoldNotificationSubscription,
  PersistedTaskfoldProjectDocument,
  TaskfoldReadOnlyKeyedStore,
} from "@taskfold/core/persistence-types.js";

type Row = Record<string, unknown>;

function parseJson(value: unknown): unknown {
  if (typeof value !== "string" || !value) {
    return undefined;
  }
  return JSON.parse(value) as unknown;
}

function stringValue(row: Row, key: string): string | undefined {
  const value = row[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(row: Row, key: string): number | undefined {
  const value = row[key];
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  return undefined;
}

function requiredString(row: Row, key: string): string {
  const value = stringValue(row, key);
  if (!value) {
    throw new Error(`taskfold sqlite row missing ${key}`);
  }
  return value;
}

function requiredNumber(row: Row, key: string): number {
  const value = numberValue(row, key);
  if (value === undefined) {
    throw new Error(`taskfold sqlite row missing ${key}`);
  }
  return value;
}

function optional<T extends object>(value: T): T | undefined {
  return Object.keys(value).length > 0 ? value : undefined;
}

function blobToBase64(value: unknown): string {
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("base64");
  }
  if (typeof value === "string") {
    return Buffer.from(value).toString("base64");
  }
  return "";
}

function childRows(db: DatabaseSync, table: string, cardId: string): Row[] {
  return db
    .prepare(`SELECT * FROM ${table} WHERE card_id = ? ORDER BY ordinal ASC`)
    .all(cardId) as Row[];
}

function readLabels(db: DatabaseSync, cardId: string): string[] {
  return childRows(db, "taskfold_card_labels", cardId).flatMap((row) => {
    const label = stringValue(row, "label");
    return label ? [label] : [];
  });
}

function readEvents(db: DatabaseSync, cardId: string): TaskfoldEvent[] | undefined {
  const events = childRows(db, "taskfold_card_events", cardId).map((row) => {
    const event: TaskfoldEvent = {
      id: requiredString(row, "id"),
      kind: requiredString(row, "kind") as TaskfoldEvent["kind"],
      at: requiredNumber(row, "at"),
    };
    const fromStatus = stringValue(row, "from_status");
    const toStatus = stringValue(row, "to_status");
    const fromMilestoneId = stringValue(row, "from_milestone_id");
    const toMilestoneId = stringValue(row, "to_milestone_id");
    const sessionKey = stringValue(row, "session_key");
    const runId = stringValue(row, "run_id");
    if (fromStatus) {
      event.fromStatus = fromStatus as TaskfoldEvent["fromStatus"];
    }
    if (toStatus) {
      event.toStatus = toStatus as TaskfoldEvent["toStatus"];
    }
    if (fromMilestoneId) {
      event.fromMilestoneId = fromMilestoneId;
    }
    if (toMilestoneId) {
      event.toMilestoneId = toMilestoneId;
    }
    if (sessionKey) {
      event.sessionKey = sessionKey;
    }
    if (runId) {
      event.runId = runId;
    }
    return event;
  });
  return events.length > 0 ? events : undefined;
}

function readExecution(row: Row): TaskfoldExecution | undefined {
  const id = stringValue(row, "execution_id");
  if (!id) {
    return undefined;
  }
  return {
    id,
    kind: "agent-session",
    mode: requiredString(row, "execution_mode") as TaskfoldExecution["mode"],
    status: requiredString(row, "execution_status") as TaskfoldExecution["status"],
    ...(stringValue(row, "execution_engine")
      ? { engine: stringValue(row, "execution_engine") }
      : {}),
    ...(stringValue(row, "execution_model") ? { model: stringValue(row, "execution_model") } : {}),
    ...(stringValue(row, "execution_session_key")
      ? { sessionKey: stringValue(row, "execution_session_key") }
      : {}),
    ...(stringValue(row, "execution_run_id")
      ? { runId: stringValue(row, "execution_run_id") }
      : {}),
    startedAt: requiredNumber(row, "execution_started_at"),
    updatedAt: requiredNumber(row, "execution_updated_at"),
  };
}

function readMetadata(db: DatabaseSync, row: Row): TaskfoldMetadata | undefined {
  const cardId = requiredString(row, "id");
  const attempts = childRows(db, "taskfold_card_attempts", cardId).map((child) => {
    const entry: TaskfoldRunAttempt = {
      id: requiredString(child, "id"),
      status: requiredString(child, "status") as TaskfoldRunAttempt["status"],
      startedAt: requiredNumber(child, "started_at"),
    };
    const endedAt = numberValue(child, "ended_at");
    const engine = stringValue(child, "engine");
    const mode = stringValue(child, "mode");
    const model = stringValue(child, "model");
    const sessionKey = stringValue(child, "session_key");
    const runId = stringValue(child, "run_id");
    const error = stringValue(child, "error");
    const promptVersion = numberValue(child, "prompt_version");
    if (promptVersion !== undefined) {
      entry.promptVersion = promptVersion;
    }
    if (endedAt !== undefined) {
      entry.endedAt = endedAt;
    }
    if (engine) {
      entry.engine = engine as TaskfoldRunAttempt["engine"];
    }
    if (mode) {
      entry.mode = mode as TaskfoldRunAttempt["mode"];
    }
    if (model) {
      entry.model = model;
    }
    if (sessionKey) {
      entry.sessionKey = sessionKey;
    }
    if (runId) {
      entry.runId = runId;
    }
    if (error) {
      entry.error = error;
    }
    return entry;
  });
  const comments = childRows(db, "taskfold_card_comments", cardId).map((child) => {
    const entry: TaskfoldComment = {
      id: requiredString(child, "id"),
      body: requiredString(child, "body"),
      createdAt: requiredNumber(child, "created_at"),
    };
    const updatedAt = numberValue(child, "updated_at");
    if (updatedAt !== undefined) {
      entry.updatedAt = updatedAt;
    }
    return entry;
  });
  const links = childRows(db, "taskfold_card_links", cardId).map((child) => {
    const entry: TaskfoldLink = {
      id: requiredString(child, "id"),
      type: requiredString(child, "type") as TaskfoldLink["type"],
      createdAt: requiredNumber(child, "created_at"),
    };
    const targetCardId = stringValue(child, "target_card_id");
    const title = stringValue(child, "title");
    const url = stringValue(child, "url");
    if (targetCardId) {
      entry.targetCardId = targetCardId;
    }
    if (title) {
      entry.title = title;
    }
    if (url) {
      entry.url = url;
    }
    return entry;
  });
  const proof = childRows(db, "taskfold_card_proof", cardId).map((child) => {
    const entry: TaskfoldProof = {
      id: requiredString(child, "id"),
      status: requiredString(child, "status") as TaskfoldProof["status"],
      createdAt: requiredNumber(child, "created_at"),
    };
    const label = stringValue(child, "label");
    const command = stringValue(child, "command");
    const url = stringValue(child, "url");
    const note = stringValue(child, "note");
    if (label) {
      entry.label = label;
    }
    if (command) {
      entry.command = command;
    }
    if (url) {
      entry.url = url;
    }
    if (note) {
      entry.note = note;
    }
    return entry;
  });
  const artifacts = childRows(db, "taskfold_card_artifacts", cardId).map((child) => {
    const entry: TaskfoldArtifact = {
      id: requiredString(child, "id"),
      createdAt: requiredNumber(child, "created_at"),
    };
    const label = stringValue(child, "label");
    const url = stringValue(child, "url");
    const artifactPath = stringValue(child, "path");
    const mimeType = stringValue(child, "mime_type");
    if (label) {
      entry.label = label;
    }
    if (url) {
      entry.url = url;
    }
    if (artifactPath) {
      entry.path = artifactPath;
    }
    if (mimeType) {
      entry.mimeType = mimeType;
    }
    return entry;
  });
  const attachments = childRows(db, "taskfold_card_attachments", cardId).map((child) => {
    const entry: TaskfoldAttachment = {
      id: requiredString(child, "id"),
      cardId: requiredString(child, "card_id"),
      createdAt: requiredNumber(child, "created_at"),
      fileName: requiredString(child, "file_name"),
      byteSize: requiredNumber(child, "byte_size"),
    };
    const mimeType = stringValue(child, "mime_type");
    const note = stringValue(child, "note");
    if (mimeType) {
      entry.mimeType = mimeType;
    }
    if (note) {
      entry.note = note;
    }
    return entry;
  });
  const workerLogs = childRows(db, "taskfold_worker_logs", cardId).map((child) => {
    const entry: TaskfoldWorkerLog = {
      id: requiredString(child, "id"),
      createdAt: requiredNumber(child, "created_at"),
      level: requiredString(child, "level") as TaskfoldWorkerLog["level"],
      message: requiredString(child, "message"),
    };
    const sessionKey = stringValue(child, "session_key");
    const runId = stringValue(child, "run_id");
    if (sessionKey) {
      entry.sessionKey = sessionKey;
    }
    if (runId) {
      entry.runId = runId;
    }
    return entry;
  });
  const diagnostics = childRows(db, "taskfold_card_diagnostics", cardId).map((child) => ({
    kind: requiredString(child, "kind") as TaskfoldDiagnostic["kind"],
    severity: requiredString(child, "severity") as TaskfoldDiagnostic["severity"],
    title: requiredString(child, "title"),
    detail: requiredString(child, "detail"),
    firstSeenAt: requiredNumber(child, "first_seen_at"),
    lastSeenAt: requiredNumber(child, "last_seen_at"),
    count: requiredNumber(child, "count"),
    actions: (parseJson(child.actions_json) as TaskfoldDiagnostic["actions"] | undefined) ?? [],
  }));
  const notifications = childRows(db, "taskfold_card_notifications", cardId).map((child) => {
    const entry: TaskfoldNotification = {
      id: requiredString(child, "id"),
      kind: requiredString(child, "kind") as TaskfoldNotification["kind"],
      createdAt: requiredNumber(child, "created_at"),
      message: requiredString(child, "message"),
    };
    const sequence = numberValue(child, "sequence");
    const sessionKey = stringValue(child, "session_key");
    const runId = stringValue(child, "run_id");
    if (sequence !== undefined) {
      entry.sequence = sequence;
    }
    if (sessionKey) {
      entry.sessionKey = sessionKey;
    }
    if (runId) {
      entry.runId = runId;
    }
    return entry;
  });
  const protocol = db
    .prepare("SELECT * FROM taskfold_worker_protocol WHERE card_id = ?")
    .get(cardId) as Row | undefined;
  const automation = parseJson(row.automation_json) as TaskfoldMetadata["automation"] | undefined;
  const claim = parseJson(row.claim_json) as TaskfoldMetadata["claim"] | undefined;
  const stale = parseJson(row.stale_json) as TaskfoldMetadata["stale"] | undefined;
  const lifecycleStatusSourceUpdatedAt = numberValue(row, "lifecycle_status_source_updated_at");
  return optional({
    ...(attempts.length > 0 ? { attempts } : {}),
    ...(comments.length > 0 ? { comments } : {}),
    ...(links.length > 0 ? { links } : {}),
    ...(proof.length > 0 ? { proof } : {}),
    ...(artifacts.length > 0 ? { artifacts } : {}),
    ...(attachments.length > 0 ? { attachments } : {}),
    ...(workerLogs.length > 0 ? { workerLogs } : {}),
    ...(protocol
      ? {
          workerProtocol: {
            state: requiredString(protocol, "state") as NonNullable<
              TaskfoldMetadata["workerProtocol"]
            >["state"],
            updatedAt: requiredNumber(protocol, "updated_at"),
            ...(stringValue(protocol, "detail") ? { detail: stringValue(protocol, "detail") } : {}),
          },
        }
      : {}),
    ...(automation ? { automation } : {}),
    ...(claim ? { claim } : {}),
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
    ...(notifications.length > 0 ? { notifications } : {}),
    ...(stringValue(row, "template_id")
      ? { templateId: stringValue(row, "template_id") as TaskfoldMetadata["templateId"] }
      : {}),
    ...(numberValue(row, "archived_at") !== undefined
      ? { archivedAt: numberValue(row, "archived_at") }
      : {}),
    ...(stale ? { stale } : {}),
    ...(lifecycleStatusSourceUpdatedAt !== undefined ? { lifecycleStatusSourceUpdatedAt } : {}),
    ...(numberValue(row, "failure_count") !== undefined
      ? { failureCount: numberValue(row, "failure_count") }
      : {}),
  });
}

function readDelivery(db: DatabaseSync, cardId: string): TaskfoldDelivery | undefined {
  const row = db
    .prepare("SELECT * FROM taskfold_card_delivery WHERE card_id = ?")
    .get(cardId) as Row | undefined;
  if (!row) {
    return undefined;
  }
  const delivery: TaskfoldDelivery = {
    updatedAt: requiredNumber(row, "updated_at"),
  };
  const objective = stringValue(row, "objective");
  const deliverySummary = stringValue(row, "delivery_summary");
  const openItems = stringValue(row, "open_items");
  const implementationState = stringValue(row, "implementation_state");
  const verificationState = stringValue(row, "verification_state");
  const releaseState = stringValue(row, "release_state");
  if (objective) {
    delivery.objective = objective;
  }
  if (deliverySummary) {
    delivery.deliverySummary = deliverySummary;
  }
  if (openItems) {
    delivery.openItems = openItems;
  }
  if (implementationState) {
    delivery.implementationState =
      implementationState as TaskfoldDelivery["implementationState"];
  }
  if (verificationState) {
    delivery.verificationState =
      verificationState as TaskfoldDelivery["verificationState"];
  }
  if (releaseState) {
    delivery.releaseState = releaseState as TaskfoldDelivery["releaseState"];
  }
  return delivery;
}

function readSourceReferences(db: DatabaseSync, cardId: string): TaskfoldSourceReference[] {
  return childRows(db, "taskfold_card_source_references", cardId).map((child) => {
    const reference: TaskfoldSourceReference = {
      id: requiredString(child, "id"),
      label: requiredString(child, "label"),
      target: requiredString(child, "target"),
      position: requiredNumber(child, "position"),
      createdAt: requiredNumber(child, "created_at"),
      updatedAt: requiredNumber(child, "updated_at"),
    };
    const note = stringValue(child, "note");
    if (note) {
      reference.note = note;
    }
    return reference;
  });
}

function readCard(db: DatabaseSync, row: Row): TaskfoldCard {
  const card: TaskfoldCard = {
    id: requiredString(row, "id"),
    title: requiredString(row, "title"),
    status: requiredString(row, "status") as TaskfoldCard["status"],
    priority: requiredString(row, "priority") as TaskfoldCard["priority"],
    labels: readLabels(db, requiredString(row, "id")),
    position: requiredNumber(row, "position"),
    createdAt: requiredNumber(row, "created_at"),
    updatedAt: requiredNumber(row, "updated_at"),
    revision: numberValue(row, "revision") ?? 0,
  };
  const metadata = readMetadata(db, row);
  const delivery = readDelivery(db, card.id);
  const sourceReferences = readSourceReferences(db, card.id);
  return {
    ...card,
    ...(stringValue(row, "card_kind")
      ? { kind: stringValue(row, "card_kind") as TaskfoldCardKind }
      : {}),
    ...(stringValue(row, "notes") ? { notes: stringValue(row, "notes") } : {}),
    ...(stringValue(row, "agent_id") ? { agentId: stringValue(row, "agent_id") } : {}),
    ...(stringValue(row, "session_key") ? { sessionKey: stringValue(row, "session_key") } : {}),
    ...(stringValue(row, "run_id") ? { runId: stringValue(row, "run_id") } : {}),
    ...(stringValue(row, "task_id") ? { taskId: stringValue(row, "task_id") } : {}),
    ...(stringValue(row, "source_url") ? { sourceUrl: stringValue(row, "source_url") } : {}),
    ...(stringValue(row, "milestone_id") ? { milestoneId: stringValue(row, "milestone_id") } : {}),
    ...(readExecution(row) ? { execution: readExecution(row) } : {}),
    ...(delivery ? { delivery } : {}),
    ...(sourceReferences.length ? { sourceReferences } : {}),
    ...(numberValue(row, "started_at") !== undefined
      ? { startedAt: numberValue(row, "started_at") }
      : {}),
    ...(numberValue(row, "completed_at") !== undefined
      ? { completedAt: numberValue(row, "completed_at") }
      : {}),
    ...(readEvents(db, card.id) ? { events: readEvents(db, card.id) } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

/** 只读（迁移工具用）：写方法已随 SQLite 运行时后端下线，见文件头。 */
class TaskfoldSqliteCardStore implements TaskfoldReadOnlyKeyedStore<PersistedTaskfoldCard> {
  constructor(private readonly db: DatabaseSync) {}

  async lookup(key: string): Promise<PersistedTaskfoldCard | undefined> {
    const row = this.db.prepare("SELECT * FROM taskfold_cards WHERE id = ?").get(key) as
      | Row
      | undefined;
    return row ? { version: 1, card: readCard(this.db, row) } : undefined;
  }

  async entries(): Promise<Array<{ key: string; value: PersistedTaskfoldCard }>> {
    return (
      this.db
        .prepare("SELECT * FROM taskfold_cards ORDER BY created_at ASC, id ASC")
        .all() as Row[]
    ).map((row) => ({
      key: requiredString(row, "id"),
      value: { version: 1, card: readCard(this.db, row) },
    }));
  }
}

class TaskfoldSqliteBoardStore implements TaskfoldReadOnlyKeyedStore<PersistedTaskfoldBoard> {
  constructor(private readonly db: DatabaseSync) {}

  async lookup(key: string): Promise<PersistedTaskfoldBoard | undefined> {
    const row = this.db.prepare("SELECT * FROM taskfold_boards WHERE id = ?").get(key) as
      | Row
      | undefined;
    if (!row) {
      return undefined;
    }
    const defaultWorkspace = parseJson(row.default_workspace_json) as
      | PersistedTaskfoldBoard["board"]["defaultWorkspace"]
      | undefined;
    const orchestration = parseJson(row.orchestration_json) as
      | PersistedTaskfoldBoard["board"]["orchestration"]
      | undefined;
    const boardView = parseJson(row.board_view_json) as
      | PersistedTaskfoldBoard["board"]["boardView"]
      | undefined;
    return {
      version: 1,
      board: {
        id: requiredString(row, "id"),
        ...(stringValue(row, "name") ? { name: stringValue(row, "name") } : {}),
        ...(stringValue(row, "description")
          ? { description: stringValue(row, "description") }
          : {}),
        ...(stringValue(row, "icon") ? { icon: stringValue(row, "icon") } : {}),
        ...(stringValue(row, "color") ? { color: stringValue(row, "color") } : {}),
        ...(numberValue(row, "position") !== undefined
          ? { position: numberValue(row, "position") }
          : {}),
        ...(stringValue(row, "version") ? { version: stringValue(row, "version") } : {}),
        ...(stringValue(row, "current_objective")
          ? { currentObjective: stringValue(row, "current_objective") }
          : {}),
        ...(stringValue(row, "core_value") ? { coreValue: stringValue(row, "core_value") } : {}),
        ...(stringValue(row, "source_of_truth")
          ? { sourceOfTruth: stringValue(row, "source_of_truth") }
          : {}),
        ...(stringValue(row, "repository_url")
          ? { repositoryUrl: stringValue(row, "repository_url") }
          : {}),
        ...(stringValue(row, "planning_path")
          ? { planningPath: stringValue(row, "planning_path") }
          : {}),
        ...(stringValue(row, "homepage_url")
          ? { homepageUrl: stringValue(row, "homepage_url") }
          : {}),
        ...(defaultWorkspace ? { defaultWorkspace } : {}),
        ...(orchestration ? { orchestration } : {}),
        ...(boardView ? { boardView } : {}),
        createdAt: requiredNumber(row, "created_at"),
        updatedAt: requiredNumber(row, "updated_at"),
        ...(numberValue(row, "archived_at") !== undefined
          ? { archivedAt: numberValue(row, "archived_at") }
          : {}),
      },
    };
  }

  async entries(): Promise<Array<{ key: string; value: PersistedTaskfoldBoard }>> {
    const rows = this.db.prepare("SELECT id FROM taskfold_boards ORDER BY id ASC").all() as Row[];
    const entries: Array<{ key: string; value: PersistedTaskfoldBoard }> = [];
    for (const row of rows) {
      const key = requiredString(row, "id");
      const value = await this.lookup(key);
      if (value) {
        entries.push({ key, value });
      }
    }
    return entries;
  }
}

function readMilestone(row: Row): TaskfoldMilestone {
  return {
    id: requiredString(row, "id"),
    boardId: requiredString(row, "board_id"),
    title: requiredString(row, "title"),
    position: requiredNumber(row, "position"),
    state: requiredString(row, "state") as TaskfoldMilestone["state"],
    createdAt: requiredNumber(row, "created_at"),
    updatedAt: requiredNumber(row, "updated_at"),
    ...(stringValue(row, "description") ? { description: stringValue(row, "description") } : {}),
    ...(stringValue(row, "color") ? { color: stringValue(row, "color") } : {}),
    ...(numberValue(row, "completed_at") !== undefined
      ? { completedAt: numberValue(row, "completed_at") }
      : {}),
    ...(numberValue(row, "archived_at") !== undefined
      ? { archivedAt: numberValue(row, "archived_at") }
      : {}),
  };
}

class TaskfoldSqliteMilestoneStore implements TaskfoldReadOnlyKeyedStore<PersistedTaskfoldMilestone> {
  constructor(private readonly db: DatabaseSync) {}

  async lookup(key: string): Promise<PersistedTaskfoldMilestone | undefined> {
    const row = this.db.prepare("SELECT * FROM taskfold_milestones WHERE id = ?").get(key) as
      | Row
      | undefined;
    return row ? { version: 1, milestone: readMilestone(row) } : undefined;
  }

  async entries(): Promise<Array<{ key: string; value: PersistedTaskfoldMilestone }>> {
    return (
      this.db
        .prepare("SELECT * FROM taskfold_milestones ORDER BY board_id ASC, position ASC, id ASC")
        .all() as Row[]
    ).map((row) => ({
      key: requiredString(row, "id"),
      value: { version: 1, milestone: readMilestone(row) },
    }));
  }
}

function readProjectDocument(row: Row): TaskfoldProjectDocument {
  return {
    id: requiredString(row, "id"),
    boardId: requiredString(row, "board_id"),
    key: requiredString(row, "document_key"),
    section: requiredString(row, "section") as TaskfoldProjectDocument["section"],
    source: (stringValue(row, "source") ?? "project") as TaskfoldProjectDocument["source"],
    type: requiredString(row, "type") as TaskfoldProjectDocument["type"],
    title: requiredString(row, "title"),
    position: requiredNumber(row, "position"),
    createdAt: requiredNumber(row, "created_at"),
    updatedAt: requiredNumber(row, "updated_at"),
    ...(stringValue(row, "summary") ? { summary: stringValue(row, "summary") } : {}),
    ...(stringValue(row, "target") ? { target: stringValue(row, "target") } : {}),
    ...(stringValue(row, "content") ? { content: stringValue(row, "content") } : {}),
    ...(numberValue(row, "hidden_at") !== undefined
      ? { hiddenAt: numberValue(row, "hidden_at") }
      : {}),
    ...(numberValue(row, "system") === 1 ? { system: true } : {}),
  };
}

class TaskfoldSqliteProjectDocumentStore
  implements TaskfoldReadOnlyKeyedStore<PersistedTaskfoldProjectDocument>
{
  constructor(private readonly db: DatabaseSync) {}

  async lookup(key: string): Promise<PersistedTaskfoldProjectDocument | undefined> {
    const row = this.db
      .prepare("SELECT * FROM taskfold_project_documents WHERE id = ?")
      .get(key) as Row | undefined;
    return row ? { version: 1, document: readProjectDocument(row) } : undefined;
  }

  async entries(): Promise<Array<{ key: string; value: PersistedTaskfoldProjectDocument }>> {
    return (
      this.db
        .prepare(
          "SELECT * FROM taskfold_project_documents ORDER BY board_id ASC, section ASC, position ASC, id ASC",
        )
        .all() as Row[]
    ).map((row) => ({
      key: requiredString(row, "id"),
      value: { version: 1, document: readProjectDocument(row) },
    }));
  }
}

class TaskfoldSqliteSubscriptionStore
  implements TaskfoldReadOnlyKeyedStore<PersistedTaskfoldNotificationSubscription>
{
  constructor(private readonly db: DatabaseSync) {}

  async lookup(key: string): Promise<PersistedTaskfoldNotificationSubscription | undefined> {
    const row = this.db
      .prepare("SELECT * FROM taskfold_notification_subscriptions WHERE id = ?")
      .get(key) as Row | undefined;
    if (!row) {
      return undefined;
    }
    const eventKinds = parseJson(row.event_kinds_json) as
      | PersistedTaskfoldNotificationSubscription["subscription"]["eventKinds"]
      | undefined;
    const deliveredEventIds = parseJson(row.delivered_event_ids_json) as
      | PersistedTaskfoldNotificationSubscription["subscription"]["deliveredEventIds"]
      | undefined;
    return {
      version: 1,
      subscription: {
        id: requiredString(row, "id"),
        boardId: requiredString(row, "board_id"),
        ...(stringValue(row, "card_id") ? { cardId: stringValue(row, "card_id") } : {}),
        ...(stringValue(row, "session_key") ? { sessionKey: stringValue(row, "session_key") } : {}),
        ...(stringValue(row, "run_id") ? { runId: stringValue(row, "run_id") } : {}),
        ...(stringValue(row, "target") ? { target: stringValue(row, "target") } : {}),
        ...(eventKinds ? { eventKinds } : {}),
        ...(numberValue(row, "last_event_at") !== undefined
          ? { lastEventAt: numberValue(row, "last_event_at") }
          : {}),
        ...(stringValue(row, "last_event_id")
          ? { lastEventId: stringValue(row, "last_event_id") }
          : {}),
        ...(numberValue(row, "last_event_sequence") !== undefined
          ? { lastEventSequence: numberValue(row, "last_event_sequence") }
          : {}),
        ...(deliveredEventIds ? { deliveredEventIds } : {}),
        createdAt: requiredNumber(row, "created_at"),
        updatedAt: requiredNumber(row, "updated_at"),
      },
    };
  }

  async entries(): Promise<
    Array<{ key: string; value: PersistedTaskfoldNotificationSubscription }>
  > {
    const rows = this.db
      .prepare(
        "SELECT id FROM taskfold_notification_subscriptions ORDER BY created_at ASC, id ASC",
      )
      .all() as Row[];
    const entries: Array<{ key: string; value: PersistedTaskfoldNotificationSubscription }> = [];
    for (const row of rows) {
      const key = requiredString(row, "id");
      const value = await this.lookup(key);
      if (value) {
        entries.push({ key, value });
      }
    }
    return entries;
  }
}

class TaskfoldSqliteAttachmentStore
  implements TaskfoldReadOnlyKeyedStore<PersistedTaskfoldAttachment>
{
  constructor(private readonly db: DatabaseSync) {}

  async lookup(key: string): Promise<PersistedTaskfoldAttachment | undefined> {
    const row = this.db
      .prepare(
        `
          SELECT a.*, b.content
          FROM taskfold_card_attachments a
          JOIN taskfold_attachment_blobs b ON b.attachment_id = a.id
          WHERE a.id = ?
        `,
      )
      .get(key) as Row | undefined;
    if (!row) {
      return undefined;
    }
    return {
      version: 1,
      attachment: {
        id: requiredString(row, "id"),
        cardId: requiredString(row, "card_id"),
        createdAt: requiredNumber(row, "created_at"),
        fileName: requiredString(row, "file_name"),
        byteSize: requiredNumber(row, "byte_size"),
        ...(stringValue(row, "mime_type") ? { mimeType: stringValue(row, "mime_type") } : {}),
        ...(stringValue(row, "note") ? { note: stringValue(row, "note") } : {}),
      },
      contentBase64: blobToBase64(row.content),
    };
  }

  async entries(): Promise<Array<{ key: string; value: PersistedTaskfoldAttachment }>> {
    const rows = this.db
      .prepare(
        `
          SELECT a.id
          FROM taskfold_card_attachments a
          JOIN taskfold_attachment_blobs b ON b.attachment_id = a.id
          ORDER BY a.created_at ASC, a.id ASC
        `,
      )
      .all() as Row[];
    const entries: Array<{ key: string; value: PersistedTaskfoldAttachment }> = [];
    for (const row of rows) {
      const key = requiredString(row, "id");
      const value = await this.lookup(key);
      if (value) {
        entries.push({ key, value });
      }
    }
    return entries;
  }
}

/**
 * 只读打开一份 Taskfold SQLite 库（TASK-10 迁移工具专用）：`readOnly` 连接，不建目录、不跑
 * schema 迁移、不设 pragma、不碰旧 flowboard 库。写方法已随运行时后端下线，这里的 store 只
 * 实现 `lookup`/`entries`。`db` 给迁移工具按表计数用。
 */
export function openTaskfoldSqliteStoresReadOnly(dbPath: string) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  return {
    db,
    cards: new TaskfoldSqliteCardStore(db),
    boards: new TaskfoldSqliteBoardStore(db),
    milestones: new TaskfoldSqliteMilestoneStore(db),
    documents: new TaskfoldSqliteProjectDocumentStore(db),
    subscriptions: new TaskfoldSqliteSubscriptionStore(db),
    attachments: new TaskfoldSqliteAttachmentStore(db),
    close: () => db.close(),
  };
}
