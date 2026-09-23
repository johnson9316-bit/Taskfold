// Taskfold plugin module resolves the on-disk layout for the file-backed store
// (需求/16-文件存储改造.md 第六节). This module only knows about paths and directory
// bootstrapping; it has no opinion on file formats or persistence semantics.
import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "openclaw/plugin-sdk/state-paths";
import type { TaskfoldWorkspace } from "../../contract/index.js";

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

/** Resolves `~/.openclaw/plugins/taskfold/`, the plugin-level directory that holds the
 * project registry, the change log, and notification subscriptions -- everything that
 * must not disappear when a project's git branch is switched. */
export function resolveTaskfoldPluginDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveStateDir(env), ...PLUGIN_RELATIVE_PATH);
}

export type TaskfoldFileStoreLayout = {
  /** `<repo>/.taskfold` */
  dataDir: string;
  cardsDir: string;
  archiveCardsDir: string;
  milestonesDir: string;
  documentsDir: string;
  attachmentsDir: string;
  /** `~/.openclaw/plugins/taskfold` */
  pluginDir: string;
  projectsJsonPath: string;
  changesLogPath: string;
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
    pluginDir,
    projectsJsonPath: path.join(pluginDir, "projects.json"),
    changesLogPath: path.join(pluginDir, "changes.log"),
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

/**
 * Creates every directory this skeleton actually writes to and tightens
 * permissions the same way sqlite-store.ts's `hardenTaskfoldDatabaseFiles` does
 * for the database file (dir 0700 / file 0600). Deliberately excludes
 * `runsDir`/`metricsDir`: those are reserved paths for unimplemented M4/M9
 * features, not directories this skeleton owns yet.
 */
export function ensureTaskfoldFileStoreDirectories(layout: TaskfoldFileStoreLayout): void {
  // archiveCardsDir is deliberately not created here: nothing in the current
  // business layer moves a card file there yet (archive() only flips
  // metadata.archivedAt in place). It is still scanned by the id allocator
  // (file-store-card-id.ts) so a future physical-archive feature does not
  // silently reuse an id. A missing directory is treated as empty there.
  ensureHardenedDir(layout.cardsDir);
  ensureHardenedDir(layout.milestonesDir);
  ensureHardenedDir(layout.documentsDir);
  ensureHardenedDir(layout.attachmentsDir);
  ensureHardenedDir(layout.pluginDir);
  ensureHardenedDir(layout.subscriptionsDir);
}

export { chmodIfExists };
