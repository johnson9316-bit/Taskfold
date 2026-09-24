// Taskfold plugin module resolves the on-disk layout for the file-backed store
// (需求/16-文件存储改造.md 第六节). This module only knows about paths and directory
// bootstrapping; it has no opinion on file formats or persistence semantics.
import fs from "node:fs";
import path from "node:path";
import type { TaskfoldWorkspace } from "./contract/index.js";

/** Mirrors sqlite-store.ts's TASKFOLD_SQLITE_DIR_MODE — same value, duplicated because that
 * constant is module-private there. */
export const TASKFOLD_FILE_STORE_DIR_MODE = 0o700;
/** Mirrors sqlite-store.ts's TASKFOLD_SQLITE_FILE_MODE — same value, duplicated for the same
 * reason as above. */
export const TASKFOLD_FILE_STORE_FILE_MODE = 0o600;

const PLUGIN_RELATIVE_PATH = ["plugins", "taskfold"] as const;

/**
 * Resolves the project data directory per 需求/16 第六节:
 *   数据目录 = (defaultWorkspace.sourcePath ?? defaultWorkspace.path) + "/.taskfold/"
 *
 * `worktree` workspaces must resolve to `sourcePath`, not `path`: `path` is the
 * temporary worktree checkout, which is deleted along with the worktree. Putting
 * project data there would delete it out from under the project the moment the
 * worktree is removed.
 */
export function resolveTaskfoldDataDir(workspace: TaskfoldWorkspace): string {
  const root = workspace.sourcePath ?? workspace.path;
  if (!root) {
    throw new Error(
      `taskfold file store requires a workspace with "path" or "sourcePath" (kind: ${workspace.kind}).`,
    );
  }
  return path.join(root, ".taskfold");
}

/** Resolves the plugin-level directory under a host's state dir. 需求/18 §3.8 之后这里只放
 * OpenClaw 专属的东西：项目注册表 `projects.json` 与通知订阅（changes.log 已移到每个项目的
 * `.taskfold/.runtime/`）。
 * `stateDir` 由调用方注入（OpenClaw 适配层传 `resolveStateDir(env)` 的结果），core 不再依赖宿主 SDK。 */
export function resolveTaskfoldPluginDir(stateDir: string): string {
  return path.join(stateDir, ...PLUGIN_RELATIVE_PATH);
}

export type TaskfoldFileStoreLayout = {
  /** `<repo>/.taskfold` */
  dataDir: string;
  cardsDir: string;
  archiveCardsDir: string;
  milestonesDir: string;
  documentsDir: string;
  attachmentsDir: string;
  /** `<repo>/.taskfold/.locks`：跨进程锁文件（需求/18 §3.4），由 `<repo>/.taskfold/.gitignore` 忽略。 */
  locksDir: string;
  /** `<repo>/.taskfold/.runtime/cards`：卡片运行态文件（需求/18 §3.7），`.runtime/` 由 `<repo>/.taskfold/.gitignore` 忽略。 */
  runtimeCardsDir: string;
  /** `<repo>/.taskfold/.runtime/changes.log`：本项目的变更日志（需求/18 §3.8），所有写入进程共用，
   * 在本项目的全局锁内追加（file-store-change-cursor.ts）。 */
  changesLogPath: string;
  /** `<repo>/.taskfold/config.yml`：记录格式版本（需求/18 §3.9，file-store-format.ts），纳入 Git。 */
  configPath: string;
  /** 宿主注入的插件级目录（见 {@link resolveTaskfoldPluginDir}），只放 OpenClaw 专属数据。 */
  pluginDir: string;
  projectsJsonPath: string;
  subscriptionsDir: string;
  /**
   * Reserved by 需求/16 第六节 for the M4 execution ledger and M9 metrics time
   * series. Neither is implemented anywhere in the codebase yet (confirmed by a
   * full grep on 2026-09-18), so this skeleton only reserves the path -- it does
   * not create the directory or define a format.
   */
  runsDir: string;
  /** Reserved; see `runsDir` above. */
  metricsDir: string;
};

export function resolveTaskfoldFileStoreLayout(options: {
  dataDir: string;
  pluginDir: string;
}): TaskfoldFileStoreLayout {
  const dataDir = path.resolve(options.dataDir);
  const pluginDir = path.resolve(options.pluginDir);
  return {
    dataDir,
    cardsDir: path.join(dataDir, "cards"),
    archiveCardsDir: path.join(dataDir, "archive", "cards"),
    milestonesDir: path.join(dataDir, "milestones"),
    documentsDir: path.join(dataDir, "documents"),
    attachmentsDir: path.join(dataDir, "attachments"),
    locksDir: path.join(dataDir, ".locks"),
    runtimeCardsDir: path.join(dataDir, ".runtime", "cards"),
    changesLogPath: path.join(dataDir, ".runtime", "changes.log"),
    configPath: path.join(dataDir, "config.yml"),
    pluginDir,
    projectsJsonPath: path.join(pluginDir, "projects.json"),
    subscriptionsDir: path.join(pluginDir, "subscriptions"),
    runsDir: path.join(pluginDir, "runs"),
    metricsDir: path.join(pluginDir, "metrics"),
  };
}

function chmodIfExists(targetPath: string, mode: number): void {
  try {
    fs.chmodSync(targetPath, mode);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }
}

function ensureHardenedDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: TASKFOLD_FILE_STORE_DIR_MODE });
  chmodIfExists(dir, TASKFOLD_FILE_STORE_DIR_MODE);
}

/** `.taskfold/` 纳入 Git，但锁文件（`.locks/`）与卡片运行态（`.runtime/`）是纯运行时产物。 */
const RUNTIME_GITIGNORE_ENTRIES = [".locks/", ".runtime/"] as const;

/** 确保 `.taskfold/.gitignore` 里有 {@link RUNTIME_GITIGNORE_ENTRIES} 的每一项，缺哪项补哪项。 */
function ensureRuntimeGitignored(dataDir: string): void {
  const gitignorePath = path.join(dataDir, ".gitignore");
  let existing: string | undefined;
  try {
    existing = fs.readFileSync(gitignorePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }
  const presentLines = new Set((existing ?? "").split(/\r?\n/).map((line) => line.trim()));
  const missing = RUNTIME_GITIGNORE_ENTRIES.filter((entry) => !presentLines.has(entry));
  if (missing.length === 0) {
    return;
  }
  const text = missing.map((entry) => `${entry}\n`).join("");
  if (existing === undefined) {
    fs.writeFileSync(gitignorePath, text);
    return;
  }
  const separator = existing.length === 0 || existing.endsWith("\n") ? "" : "\n";
  fs.appendFileSync(gitignorePath, `${separator}${text}`);
}

/**
 * Creates every directory this skeleton actually writes to under the project's
 * `.taskfold/` and tightens permissions the same way sqlite-store.ts's
 * `hardenTaskfoldDatabaseFiles` does for the database file (dir 0700 / file 0600).
 * 会改动 `.taskfold/`，调用方须先确认格式版本可写（file-store-format.ts）；插件级目录见
 * {@link ensureTaskfoldPluginDirectories}。
 */
export function ensureTaskfoldDataDirectories(layout: TaskfoldFileStoreLayout): void {
  // archiveCardsDir is deliberately not created here: nothing in the current
  // business layer moves a card file there yet (archive() only flips
  // metadata.archivedAt in place). It is still scanned by the id allocator
  // (file-store-card-id.ts) so a future physical-archive feature does not
  // silently reuse an id. A missing directory is treated as empty there.
  ensureHardenedDir(layout.cardsDir);
  ensureHardenedDir(layout.milestonesDir);
  ensureHardenedDir(layout.documentsDir);
  ensureHardenedDir(layout.attachmentsDir);
  ensureHardenedDir(layout.locksDir);
  ensureHardenedDir(layout.runtimeCardsDir);
  ensureRuntimeGitignored(layout.dataDir);
}

/** 插件级目录（宿主注入的 `pluginDir`）。Deliberately excludes `runsDir`/`metricsDir`: those
 * are reserved paths for unimplemented M4/M9 features, not directories this skeleton owns yet. */
export function ensureTaskfoldPluginDirectories(layout: TaskfoldFileStoreLayout): void {
  ensureHardenedDir(layout.pluginDir);
  ensureHardenedDir(layout.subscriptionsDir);
}

export { chmodIfExists };
