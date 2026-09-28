// Taskfold 适配层：SQLite 旧数据一次性迁到文件存储（TASK-10，`openclaw taskfold migrate-sqlite`）。
//
// 随插件发布：ClawHub 上可能有外部用户仍把数据放在 `<stateDir>/plugins/taskfold/taskfold.sqlite`。
// 本模块只**读** SQLite（只读连接打开一份临时快照，不经过 sqlite-store.ts 的 createDatabase，所以
// 不跑 schema 迁移、不碰 plugins/ 下另外三份历史库——flowboard、gsdboard 与宿主自带看板插件的库），把数据写成文件：
//
// - 项目注册表 → `<pluginDir>/projects.json`（全部项目原样写入，含没绑仓库、已归档的）；
// - 卡片、里程碑、文档、附件 → 各项目的数据根：绑了仓库的是仓库主 checkout 的 `.taskfold/`，没绑的
//   是 `<pluginDir>/projects/<boardId>/`（project-routed-stores.ts 的路由规则）；零数据的项目不建目录；
// - 通知订阅 → `<pluginDir>/subscriptions/`。
// - 不迁：`taskfold_meta`（变更游标改由各项目的 changes.log，前端整页刷新一次即可）与
//   `taskfold_schema_migrations`（SQLite 自己的 schema 版本）。
//
// 流程：检查目标（projects.json、迁移标记、各数据根已存在就拒绝）→ 复制 sqlite/-wal/-shm 快照（复制
// 期间文件变了就中止）→ 读快照 → 各项目先写进临时目录 → 从临时目录读回、与 SQLite 逐实体比对 →
// apply 时：把快照复制进 `<pluginDir>/backup/`，临时目录改名为正式目录，最后写 projects.json 与迁移
// 标记。dry-run 的临时目录在系统临时目录里，比对完就删，不碰任何仓库与插件目录。任何一步失败，
// 删掉本次建的所有目录与文件（备份除外），SQLite 原库始终不写。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { TaskfoldCard, TaskfoldMilestone, TaskfoldProjectDocument } from "@taskfold/core/contract/index.js";
import { writeFileAtomic } from "@taskfold/core/file-store-atomic.js";
import { createTaskfoldFileStores, resolveTaskfoldMainCheckoutPath } from "@taskfold/core/file-store.js";
import { createTaskfoldFileSubscriptionStore } from "@taskfold/core/file-store-subscriptions.js";
import { TASKFOLD_FILE_STORE_DIR_MODE, TASKFOLD_FILE_STORE_FILE_MODE } from "@taskfold/core/file-store-paths.js";
import type {
  PersistedTaskfoldAttachment,
  PersistedTaskfoldBoard,
  PersistedTaskfoldCard,
  PersistedTaskfoldMilestone,
  PersistedTaskfoldNotificationSubscription,
  PersistedTaskfoldProjectDocument,
} from "@taskfold/core/persistence-types.js";
import { taskfoldProjectDataDir } from "./project-routed-stores.js";
import { openTaskfoldSqliteStoresReadOnly } from "./sqlite-store.js";

export type TaskfoldSqliteMigrationMode = "dry-run" | "apply";

export const TASKFOLD_SQLITE_MIGRATION_MARKER = "migrated-from-sqlite.json";

/** 一个项目各实体的条数。卡片的子表（labels、events……）按行数计，与 SQLite 的表一一对应。 */
export type TaskfoldMigrationCounts = {
  cards: number;
  archivedCards: number;
  milestones: number;
  documents: number;
  /** taskfold_card_attachments（附件元数据，在卡片里） */
  attachments: number;
  /** taskfold_attachment_blobs（附件内容） */
  attachmentBlobs: number;
  labels: number;
  events: number;
  attempts: number;
  comments: number;
  links: number;
  proof: number;
  artifacts: number;
  delivery: number;
  sourceReferences: number;
  diagnostics: number;
  notifications: number;
  workerLogs: number;
  workerProtocol: number;
};

export type TaskfoldMigrationProject = {
  boardId: string;
  name?: string;
  archived: boolean;
  /** 迁移后的数据根。 */
  dataDir: string;
  location: "repository" | "plugin";
  /** 零数据的项目不建目录（第一次写入时再建）。 */
  skipped: boolean;
  /** 从 SQLite 表直接数出来的条数。 */
  source: TaskfoldMigrationCounts;
  /** 从写好的文件里读回来数出来的条数（skipped 时没有）。 */
  written?: TaskfoldMigrationCounts;
  /** 新分配的卡片展示 ID 范围（按 createdAt、id 顺序分配）。 */
  cardDisplayIds?: { first: string; last: string };
  /** 带绝对路径、原样迁过去的字段条数（不改写数据，只列出来）。 */
  absolutePaths: { documentTargets: number; cardWorkspaces: number; sourceReferences: number };
};

export type TaskfoldSqliteMigrationReport = {
  mode: TaskfoldSqliteMigrationMode;
  sqlitePath: string;
  backupFiles: string[];
  projectsJsonPath: string;
  boards: number;
  subscriptions: number;
  projects: TaskfoldMigrationProject[];
  /** 非空时 apply 拒绝执行。 */
  blockers: string[];
  /** 里程碑的 updatedAt 只有分钟精度（created 另存毫秒，updated 不存），截断的条数。 */
  milestoneUpdatedAtTruncated: number;
  applied: boolean;
};

export class TaskfoldSqliteMigrationError extends Error {
  constructor(
    message: string,
    readonly report?: TaskfoldSqliteMigrationReport,
  ) {
    super(message);
    this.name = "TaskfoldSqliteMigrationError";
  }
}

const COUNT_KEYS: Array<keyof TaskfoldMigrationCounts> = [
  "cards",
  "archivedCards",
  "milestones",
  "documents",
  "attachments",
  "attachmentBlobs",
  "labels",
  "events",
  "attempts",
  "comments",
  "links",
  "proof",
  "artifacts",
  "delivery",
  "sourceReferences",
  "diagnostics",
  "notifications",
  "workerLogs",
  "workerProtocol",
];

/** 卡片子表 → 计数键。 */
const CARD_CHILD_TABLES: Array<[string, keyof TaskfoldMigrationCounts]> = [
  ["taskfold_card_labels", "labels"],
  ["taskfold_card_events", "events"],
  ["taskfold_card_attempts", "attempts"],
  ["taskfold_card_comments", "comments"],
  ["taskfold_card_links", "links"],
  ["taskfold_card_proof", "proof"],
  ["taskfold_card_artifacts", "artifacts"],
  ["taskfold_card_delivery", "delivery"],
  ["taskfold_card_source_references", "sourceReferences"],
  ["taskfold_card_diagnostics", "diagnostics"],
  ["taskfold_card_notifications", "notifications"],
  ["taskfold_worker_logs", "workerLogs"],
  ["taskfold_worker_protocol", "workerProtocol"],
  ["taskfold_card_attachments", "attachments"],
];

function zeroCounts(): TaskfoldMigrationCounts {
  return Object.fromEntries(COUNT_KEYS.map((key) => [key, 0])) as TaskfoldMigrationCounts;
}

function cardBoardId(card: TaskfoldCard): string {
  return card.metadata?.automation?.boardId ?? "default";
}

function isAbsolutePath(value: unknown): boolean {
  return typeof value === "string" && path.isAbsolute(value);
}

function countCards(cards: TaskfoldCard[], counts: TaskfoldMigrationCounts): void {
  for (const card of cards) {
    const metadata = card.metadata;
    counts.cards += 1;
    counts.archivedCards += metadata?.archivedAt ? 1 : 0;
    counts.labels += card.labels.length;
    counts.events += card.events?.length ?? 0;
    counts.delivery += card.delivery ? 1 : 0;
    counts.sourceReferences += card.sourceReferences?.length ?? 0;
    counts.attempts += metadata?.attempts?.length ?? 0;
    counts.comments += metadata?.comments?.length ?? 0;
    counts.links += metadata?.links?.length ?? 0;
    counts.proof += metadata?.proof?.length ?? 0;
    counts.artifacts += metadata?.artifacts?.length ?? 0;
    counts.attachments += metadata?.attachments?.length ?? 0;
    counts.diagnostics += metadata?.diagnostics?.length ?? 0;
    counts.notifications += metadata?.notifications?.length ?? 0;
    counts.workerLogs += metadata?.workerLogs?.length ?? 0;
    counts.workerProtocol += metadata?.workerProtocol ? 1 : 0;
  }
}

function localTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

function fileSignature(file: string): string {
  try {
    const stat = fs.statSync(file);
    return `${stat.size}:${stat.mtimeMs}`;
  } catch {
    return "missing";
  }
}

const SQLITE_SUFFIXES = ["", "-wal", "-shm"] as const;

/**
 * 复制 sqlite 与 -wal/-shm（存在几个复制几个）。复制前后主文件与 -wal 的大小、mtime 变了，说明有人
 * 在写这个库（例如旧版 Gateway 还开着）：删掉这次的副本并中止。-shm 是共享内存索引，读者也会碰它，不作判断。
 */
function copySqliteFiles(sqlitePath: string, destDir: string, baseName: string): string[] {
  fs.mkdirSync(destDir, { recursive: true, mode: TASKFOLD_FILE_STORE_DIR_MODE });
  const watched = [sqlitePath, `${sqlitePath}-wal`];
  const before = watched.map(fileSignature);
  const copied: string[] = [];
  try {
    for (const suffix of SQLITE_SUFFIXES) {
      const source = `${sqlitePath}${suffix}`;
      if (!fs.existsSync(source)) {
        continue;
      }
      const target = path.join(destDir, `${baseName}.sqlite${suffix}`);
      fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
      copied.push(target);
      fs.chmodSync(target, TASKFOLD_FILE_STORE_FILE_MODE);
    }
    if (!isDeepStrictEqual(watched.map(fileSignature), before)) {
      throw new TaskfoldSqliteMigrationError(
        `${sqlitePath} changed while it was being copied; stop whatever is writing it (an older Taskfold Gateway) and retry.`,
      );
    }
    return copied;
  } catch (error) {
    for (const file of copied) {
      fs.rmSync(file, { force: true });
    }
    throw error;
  }
}

/** JSON 往返后比较：去掉值为 undefined 的键，与落盘语义一致。 */
function normalized(value: unknown): unknown {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function floorToMinute(epochMs: number): number {
  return Math.floor(epochMs / 60_000) * 60_000;
}

type SourceData = {
  boards: Map<string, PersistedTaskfoldBoard>;
  cards: TaskfoldCard[];
  milestones: TaskfoldMilestone[];
  documents: TaskfoldProjectDocument[];
  attachments: PersistedTaskfoldAttachment[];
  subscriptions: Array<{ key: string; value: PersistedTaskfoldNotificationSubscription }>;
  /** boardId → 从 SQLite 表直接数出来的条数 */
  counts: Map<string, TaskfoldMigrationCounts>;
};

async function readSource(snapshotPath: string): Promise<SourceData> {
  const sqlite = openTaskfoldSqliteStoresReadOnly(snapshotPath);
  try {
    const boards = new Map(
      (await sqlite.boards.entries())
        .filter((entry) => entry.value?.version === 1)
        .map((entry) => [entry.key, entry.value] as const),
    );
    const counts = new Map<string, TaskfoldMigrationCounts>();
    const countsFor = (boardId: string) => {
      let value = counts.get(boardId);
      if (!value) {
        value = zeroCounts();
        counts.set(boardId, value);
      }
      return value;
    };
    type CountRow = { board_id: string; n: number | bigint; archived?: number | bigint };
    const rows = (sql: string) => sqlite.db.prepare(sql).all() as CountRow[];
    for (const row of rows(
      "SELECT board_id, COUNT(*) AS n, SUM(archived_at IS NOT NULL) AS archived FROM taskfold_cards GROUP BY board_id",
    )) {
      countsFor(row.board_id).cards = Number(row.n);
      countsFor(row.board_id).archivedCards = Number(row.archived ?? 0);
    }
    for (const [table, key] of CARD_CHILD_TABLES) {
      for (const row of rows(
        `SELECT c.board_id AS board_id, COUNT(*) AS n FROM ${table} x JOIN taskfold_cards c ON c.id = x.card_id GROUP BY c.board_id`,
      )) {
        countsFor(row.board_id)[key] = Number(row.n);
      }
    }
    for (const row of rows(
      `SELECT c.board_id AS board_id, COUNT(*) AS n FROM taskfold_attachment_blobs b
         JOIN taskfold_card_attachments a ON a.id = b.attachment_id
         JOIN taskfold_cards c ON c.id = a.card_id GROUP BY c.board_id`,
    )) {
      countsFor(row.board_id).attachmentBlobs = Number(row.n);
    }
    for (const row of rows("SELECT board_id, COUNT(*) AS n FROM taskfold_milestones GROUP BY board_id")) {
      countsFor(row.board_id).milestones = Number(row.n);
    }
    for (const row of rows("SELECT board_id, COUNT(*) AS n FROM taskfold_project_documents GROUP BY board_id")) {
      countsFor(row.board_id).documents = Number(row.n);
    }
    return {
      boards,
      cards: (await sqlite.cards.entries()).map((entry) => entry.value.card),
      milestones: (await sqlite.milestones.entries()).map((entry) => entry.value.milestone),
      documents: (await sqlite.documents.entries()).map((entry) => entry.value.document),
      attachments: (await sqlite.attachments.entries()).map((entry) => entry.value),
      subscriptions: await sqlite.subscriptions.entries(),
      counts,
    };
  } finally {
    sqlite.close();
  }
}

type RootPlan = {
  dataDir: string;
  boardIds: string[];
  cards: TaskfoldCard[];
  milestones: TaskfoldMilestone[];
  documents: TaskfoldProjectDocument[];
  attachments: PersistedTaskfoldAttachment[];
};

function byCreatedThenId(a: { createdAt: number; id: string }, b: { createdAt: number; id: string }): number {
  return a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function byPositionThenId(a: { position: number; createdAt: number; id: string }, b: typeof a): number {
  return a.position - b.position || byCreatedThenId(a, b);
}

/** 把一个数据根的数据写进 `stagingDir`，再从 `stagingDir` 读回来逐实体比对。返回按 boardId 的读回计数。 */
async function writeAndVerifyRoot(
  plan: RootPlan,
  stagingDir: string,
): Promise<{
  written: Map<string, TaskfoldMigrationCounts>;
  displayIds: Map<string, { first: string; last: string }>;
  milestoneUpdatedAtTruncated: number;
}> {
  const target = createTaskfoldFileStores({ dataDir: stagingDir });
  for (const milestone of plan.milestones.toSorted(byPositionThenId)) {
    await target.milestones.register(milestone.id, { version: 1, milestone });
  }
  for (const card of plan.cards.toSorted(byCreatedThenId)) {
    await target.cards.register(card.id, { version: 1, card: structuredClone(card) });
  }
  for (const document of plan.documents.toSorted(byPositionThenId)) {
    await target.documents.register(document.id, { version: 1, document });
  }
  for (const attachment of plan.attachments) {
    await target.attachments.register(attachment.attachment.id, attachment);
  }

  // 从临时目录重新打开一份，读回来比对。
  const reread = createTaskfoldFileStores({ dataDir: stagingDir });
  const mismatches: string[] = [];
  for (const card of plan.cards) {
    const stored = await reread.cards.lookup(card.id);
    if (!isDeepStrictEqual(normalized(stored?.card), normalized(card))) {
      mismatches.push(`card ${card.id}`);
    }
  }
  let milestoneUpdatedAtTruncated = 0;
  for (const milestone of plan.milestones) {
    const stored = (await reread.milestones.lookup(milestone.id))?.milestone;
    const expected = { ...milestone, updatedAt: floorToMinute(milestone.updatedAt) };
    if (!isDeepStrictEqual(normalized(stored), normalized(expected))) {
      mismatches.push(`milestone ${milestone.id}`);
    }
    milestoneUpdatedAtTruncated += expected.updatedAt === milestone.updatedAt ? 0 : 1;
  }
  for (const document of plan.documents) {
    const stored = (await reread.documents.lookup(document.id))?.document;
    if (!isDeepStrictEqual(normalized(stored), normalized(document))) {
      mismatches.push(`document ${document.id}`);
    }
  }
  const blobBoards = new Map<string, number>();
  for (const attachment of plan.attachments) {
    const stored = await reread.attachments.lookup(attachment.attachment.id);
    if (!isDeepStrictEqual(normalized(stored), normalized(attachment))) {
      mismatches.push(`attachment ${attachment.attachment.id}`);
      continue;
    }
    const owner = plan.cards.find((card) => card.id === attachment.attachment.cardId);
    const boardId = owner ? cardBoardId(owner) : "default";
    blobBoards.set(boardId, (blobBoards.get(boardId) ?? 0) + 1);
  }
  if (mismatches.length > 0) {
    throw new TaskfoldSqliteMigrationError(
      `read-back check failed for ${mismatches.length} entities in ${stagingDir}: ${mismatches.slice(0, 10).join(", ")}`,
    );
  }
  const storedCards = (await reread.cards.entries()).map((entry) => entry.value.card);
  const storedMilestones = (await reread.milestones.entries()).map((entry) => entry.value.milestone);
  const storedDocuments = (await reread.documents.entries()).map((entry) => entry.value.document);
  const written = new Map<string, TaskfoldMigrationCounts>();
  const displayIds = new Map<string, { first: string; last: string }>();
  for (const boardId of plan.boardIds) {
    const counts = zeroCounts();
    countCards(storedCards.filter((card) => cardBoardId(card) === boardId), counts);
    counts.milestones = storedMilestones.filter((milestone) => milestone.boardId === boardId).length;
    counts.documents = storedDocuments.filter((document) => document.boardId === boardId).length;
    counts.attachmentBlobs = blobBoards.get(boardId) ?? 0;
    written.set(boardId, counts);
  }
  // 展示 ID：从卡片文件名里取（`card-N - 标题.md`），按 board 汇总首尾。
  const cardsDir = path.join(stagingDir, "cards");
  const files = fs.existsSync(cardsDir) ? fs.readdirSync(cardsDir).filter((name) => name.endsWith(".md")) : [];
  const idOf = (name: string) => name.split(" - ")[0]!;
  const numberOf = (name: string) => Number.parseInt(idOf(name).replace(/^\D+-/, ""), 10);
  for (const boardId of plan.boardIds) {
    const own = new Set(storedCards.filter((card) => cardBoardId(card) === boardId).map((card) => card.id));
    const mine = files
      .filter((name) => {
        const content = fs.readFileSync(path.join(cardsDir, name), "utf8");
        return [...own].some((id) => content.includes(`"uuid": ${JSON.stringify(id)}`));
      })
      .toSorted((a, b) => numberOf(a) - numberOf(b));
    if (mine.length > 0) {
      displayIds.set(boardId, { first: idOf(mine[0]!), last: idOf(mine.at(-1)!) });
    }
  }
  return { written, displayIds, milestoneUpdatedAtTruncated };
}

function stagingPathFor(dataDir: string, stamp: string): string {
  return path.join(path.dirname(dataDir), `.${path.basename(dataDir).replace(/^\./, "")}.migrating-${stamp}`);
}

export async function runTaskfoldSqliteMigration(options: {
  /** `resolveTaskfoldPluginDir(stateDir)`，即 `~/.openclaw/plugins/taskfold`。 */
  pluginDir: string;
  mode: TaskfoldSqliteMigrationMode;
  now?: Date;
}): Promise<TaskfoldSqliteMigrationReport> {
  const pluginDir = path.resolve(options.pluginDir);
  const { mode } = options;
  const stamp = localTimestamp(options.now ?? new Date());
  const sqlitePath = path.join(pluginDir, "taskfold.sqlite");
  const projectsJsonPath = path.join(pluginDir, "projects.json");
  const markerPath = path.join(pluginDir, TASKFOLD_SQLITE_MIGRATION_MARKER);
  const projectsRootDir = path.join(pluginDir, "projects");
  if (!fs.existsSync(sqlitePath)) {
    throw new TaskfoldSqliteMigrationError(`no SQLite database at ${sqlitePath}; nothing to migrate.`);
  }

  const blockers: string[] = [];
  if (fs.existsSync(markerPath)) {
    blockers.push(`${markerPath} already exists (this state directory was already migrated)`);
  }
  if (fs.existsSync(projectsJsonPath)) {
    blockers.push(`${projectsJsonPath} already exists`);
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-migrate-sqlite-"));
  // 本次建的东西，失败时按逆序删掉（备份不删）。
  const created: string[] = [];
  let applied = false;
  try {
    const pristine = copySqliteFiles(sqlitePath, path.join(workDir, "pristine"), "taskfold");
    const readDir = path.join(workDir, "read");
    fs.mkdirSync(readDir);
    for (const file of pristine) {
      fs.copyFileSync(file, path.join(readDir, path.basename(file)));
    }
    const source = await readSource(path.join(readDir, "taskfold.sqlite"));

    // 按项目分组；多个项目指向同一个数据根时合在一起写。
    const mainCheckoutCache = new Map<string, string>();
    const dataDirOf = (boardId: string) => {
      const board = source.boards.get(boardId)?.board;
      const raw = taskfoldProjectDataDir(pluginDir, boardId, board);
      let resolved = mainCheckoutCache.get(raw);
      if (resolved === undefined) {
        resolved = resolveTaskfoldMainCheckoutPath(raw);
        mainCheckoutCache.set(raw, resolved);
      }
      return resolved;
    };
    const boardIds = new Set<string>([
      ...source.boards.keys(),
      ...source.cards.map(cardBoardId),
      ...source.milestones.map((milestone) => milestone.boardId),
      ...source.documents.map((document) => document.boardId),
    ]);
    const position = (boardId: string) => source.boards.get(boardId)?.board.position ?? Number.MAX_SAFE_INTEGER;
    const orderedBoardIds = [...boardIds].toSorted((a, b) => position(a) - position(b) || a.localeCompare(b));
    const cardBoard = new Map(source.cards.map((card) => [card.id, cardBoardId(card)]));

    const plans = new Map<string, RootPlan>();
    const projects: TaskfoldMigrationProject[] = [];
    for (const boardId of orderedBoardIds) {
      const board = source.boards.get(boardId)?.board;
      const dataDir = dataDirOf(boardId);
      const cards = source.cards.filter((card) => cardBoardId(card) === boardId);
      const milestones = source.milestones.filter((milestone) => milestone.boardId === boardId);
      const documents = source.documents.filter((document) => document.boardId === boardId);
      const attachments = source.attachments.filter(
        (attachment) => cardBoard.get(attachment.attachment.cardId) === boardId,
      );
      const skipped = cards.length + milestones.length + documents.length + attachments.length === 0;
      projects.push({
        boardId,
        ...(board?.name ? { name: board.name } : {}),
        archived: Boolean(board?.archivedAt),
        dataDir,
        location: dataDir.startsWith(`${projectsRootDir}${path.sep}`) ? "plugin" : "repository",
        skipped,
        source: source.counts.get(boardId) ?? zeroCounts(),
        absolutePaths: {
          documentTargets: documents.filter((document) => isAbsolutePath(document.target)).length,
          cardWorkspaces: cards.filter((card) => {
            const workspace = card.metadata?.automation?.workspace;
            return isAbsolutePath(workspace?.path) || isAbsolutePath(workspace?.sourcePath);
          }).length,
          sourceReferences: cards.reduce(
            (total, card) =>
              total + (card.sourceReferences ?? []).filter((reference) => isAbsolutePath(reference.target)).length,
            0,
          ),
        },
      });
      if (skipped) {
        continue;
      }
      const plan = plans.get(dataDir) ?? { dataDir, boardIds: [], cards: [], milestones: [], documents: [], attachments: [] };
      plan.boardIds.push(boardId);
      plan.cards.push(...cards);
      plan.milestones.push(...milestones);
      plan.documents.push(...documents);
      plan.attachments.push(...attachments);
      plans.set(dataDir, plan);
    }
    for (const plan of plans.values()) {
      if (fs.existsSync(plan.dataDir)) {
        blockers.push(`${plan.dataDir} already exists`);
      }
    }

    const report: TaskfoldSqliteMigrationReport = {
      mode,
      sqlitePath,
      backupFiles: [],
      projectsJsonPath,
      boards: source.boards.size,
      subscriptions: source.subscriptions.length,
      projects,
      blockers,
      milestoneUpdatedAtTruncated: 0,
      applied: false,
    };
    if (mode === "apply" && blockers.length > 0) {
      throw new TaskfoldSqliteMigrationError(`refusing to migrate: ${blockers.join("; ")}`, report);
    }

    if (mode === "apply") {
      const backupDir = path.join(pluginDir, "backup");
      fs.mkdirSync(backupDir, { recursive: true, mode: TASKFOLD_FILE_STORE_DIR_MODE });
      for (const file of pristine) {
        const target = path.join(backupDir, path.basename(file).replace(/^taskfold\./, `taskfold-premigrate-${stamp}.`));
        fs.copyFileSync(file, target, fs.constants.COPYFILE_EXCL);
        fs.chmodSync(target, TASKFOLD_FILE_STORE_FILE_MODE);
        report.backupFiles.push(target);
      }
    }

    // 写临时目录 + 读回比对。
    const staged: Array<{ plan: RootPlan; stagingDir: string }> = [];
    const projectsRootExisted = fs.existsSync(projectsRootDir);
    let index = 0;
    for (const plan of plans.values()) {
      index += 1;
      const stagingDir =
        mode === "apply" ? stagingPathFor(plan.dataDir, stamp) : path.join(workDir, "stage", String(index), ".taskfold");
      if (mode === "apply") {
        if (!projectsRootExisted && plan.dataDir.startsWith(`${projectsRootDir}${path.sep}`) && !created.includes(projectsRootDir)) {
          created.push(projectsRootDir);
        }
        created.push(stagingDir);
      }
      const result = await writeAndVerifyRoot(plan, stagingDir);
      report.milestoneUpdatedAtTruncated += result.milestoneUpdatedAtTruncated;
      for (const project of projects) {
        if (plan.boardIds.includes(project.boardId)) {
          project.written = result.written.get(project.boardId);
          const displayIds = result.displayIds.get(project.boardId);
          if (displayIds) {
            project.cardDisplayIds = displayIds;
          }
        }
      }
      staged.push({ plan, stagingDir });
    }
    for (const project of projects) {
      if (!project.skipped && !isDeepStrictEqual(project.written, project.source)) {
        throw new TaskfoldSqliteMigrationError(
          `count check failed for project ${project.boardId}: SQLite ${JSON.stringify(project.source)} vs files ${JSON.stringify(project.written)}`,
          report,
        );
      }
    }

    if (mode === "apply") {
      for (const { plan, stagingDir } of staged) {
        if (fs.existsSync(plan.dataDir)) {
          throw new TaskfoldSqliteMigrationError(`${plan.dataDir} appeared during the migration; nothing was committed.`);
        }
        fs.renameSync(stagingDir, plan.dataDir);
        created[created.indexOf(stagingDir)] = plan.dataDir;
      }
      fs.mkdirSync(pluginDir, { recursive: true, mode: TASKFOLD_FILE_STORE_DIR_MODE });
      created.push(projectsJsonPath);
      writeFileAtomic(projectsJsonPath, JSON.stringify(Object.fromEntries(source.boards), null, 2));
      if (source.subscriptions.length > 0) {
        const subscriptionsDir = path.join(pluginDir, "subscriptions");
        if (!fs.existsSync(subscriptionsDir)) {
          created.push(subscriptionsDir);
        }
        const subscriptions = createTaskfoldFileSubscriptionStore({ subscriptionsDir });
        for (const { key, value } of source.subscriptions) {
          await subscriptions.register(key, value);
        }
      }
      created.push(markerPath);
      writeFileAtomic(
        markerPath,
        JSON.stringify(
          {
            migratedAt: new Date().toISOString(),
            source: sqlitePath,
            backupFiles: report.backupFiles,
            projects: projects.map(({ boardId, dataDir, skipped, written }) => ({ boardId, dataDir, skipped, written })),
          },
          null,
          2,
        ),
      );
      applied = true;
      report.applied = true;
    }
    return report;
  } catch (error) {
    if (!applied) {
      for (const target of created.toReversed()) {
        fs.rmSync(target, { recursive: true, force: true });
      }
    }
    throw error;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

function formatCounts(counts: TaskfoldMigrationCounts | undefined): string {
  if (!counts) {
    return "-";
  }
  return COUNT_KEYS.filter((key) => counts[key] > 0)
    .map((key) => `${key} ${counts[key]}`)
    .join(", ") || "empty";
}

/** CLI 的文本输出。 */
export function formatTaskfoldSqliteMigrationReport(report: TaskfoldSqliteMigrationReport): string {
  const lines = [
    `Taskfold SQLite → files migration (${report.mode})`,
    `source: ${report.sqlitePath} (read from a read-only snapshot; never written)`,
  ];
  if (report.backupFiles.length > 0) {
    lines.push(`backup: ${report.backupFiles.join(", ")}`);
  }
  lines.push(`registry: ${report.boards} projects → ${report.projectsJsonPath}; subscriptions ${report.subscriptions}`);
  for (const project of report.projects) {
    const label = `${project.boardId}${project.name ? ` "${project.name}"` : ""}${project.archived ? " (archived)" : ""}`;
    if (project.skipped) {
      lines.push(`- ${label}: no data; ${project.dataDir} is created on the first write`);
      continue;
    }
    const same = isDeepStrictEqual(project.source, project.written);
    lines.push(`- ${label} → ${project.dataDir} [${project.location}]`);
    lines.push(`    SQLite: ${formatCounts(project.source)}`);
    lines.push(`    files:  ${same ? "identical" : formatCounts(project.written)}`);
    if (project.cardDisplayIds) {
      lines.push(`    card ids: ${project.cardDisplayIds.first} … ${project.cardDisplayIds.last}`);
    }
    const { documentTargets, cardWorkspaces, sourceReferences } = project.absolutePaths;
    if (documentTargets + cardWorkspaces + sourceReferences > 0) {
      lines.push(
        `    absolute paths kept as-is: document targets ${documentTargets}, card workspaces ${cardWorkspaces}, source references ${sourceReferences}`,
      );
    }
  }
  if (report.milestoneUpdatedAtTruncated > 0) {
    lines.push(`note: ${report.milestoneUpdatedAtTruncated} milestone updatedAt values keep minute precision only`);
  }
  lines.push(report.blockers.length > 0 ? `blockers: ${report.blockers.join("; ")}` : "blockers: none");
  lines.push(
    report.applied
      ? "result: applied and verified"
      : report.blockers.length > 0
        ? "result: verified in a temporary directory; --apply would be refused"
        : "result: verified in a temporary directory; nothing written (run with --apply to migrate)",
  );
  return lines.join("\n");
}
