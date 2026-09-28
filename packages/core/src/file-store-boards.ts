// Taskfold plugin module: the file-backed `boards` KeyedStore
// (`<pluginDir>/projects.json`，pluginDir 由宿主注入，需求/16 第六节、需求/18 §3.8).
//
// Unlike cards/milestones/documents (one file per entity), boards -- Taskfold's name
// for what 需求/16 calls "projects" -- share a single aggregate JSON file, because that
// file doubles as the project registry: "要先知道有哪些项目、在哪，才能去读它们的
// .taskfold/" (需求/16 第六节). It has to live in the plugin directory and be readable
// before any project's own data directory is known, which rules out one-file-per-board
// under a project root. No CAS, matching sqlite-store.ts's TaskfoldSqliteBoardStore.
import type { PersistedTaskfoldBoard, TaskfoldKeyedStore } from "./persistence-types.js";
import { unsupportedTaskfoldCompareAndSwap } from "./file-store-cas.js";
import { readFileIfExists, writeFileAtomic } from "./file-store-atomic.js";

type ProjectsRegistry = Record<string, PersistedTaskfoldBoard>;

function assertValidBoardPayload(key: string, value: PersistedTaskfoldBoard): void {
  if (value.version !== 1 || value.board.id !== key) {
    throw new Error("invalid taskfold board payload");
  }
}

function readRegistry(projectsJsonPath: string): ProjectsRegistry {
  const content = readFileIfExists(projectsJsonPath);
  if (content === undefined) {
    return {};
  }
  try {
    const parsed = JSON.parse(content) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as ProjectsRegistry) : {};
  } catch {
    // A half-written registry (process killed mid-write) is treated as empty rather
    // than thrown: writeFileAtomic's tmp+rename means this can only happen to the *old*
    // file, never mid-write, but guarding costs nothing and avoids a hard crash on a
    // registry damaged by some other means (for example, a hand edit).
    return {};
  }
}

function writeRegistry(projectsJsonPath: string, registry: ProjectsRegistry): void {
  writeFileAtomic(projectsJsonPath, JSON.stringify(registry, null, 2));
}

export function createTaskfoldFileBoardStore(options: {
  projectsJsonPath: string;
}): TaskfoldKeyedStore<PersistedTaskfoldBoard> {
  const { projectsJsonPath } = options;

  return {
    async register(key, value) {
      assertValidBoardPayload(key, value);
      // Read-modify-write the whole registry with no `await` in between (see
      // file-store-atomic.ts's module comment): safe under A1 without a lock.
      const registry = readRegistry(projectsJsonPath);
      registry[key] = value;
      writeRegistry(projectsJsonPath, registry);
    },

    async lookup(key) {
      return readRegistry(projectsJsonPath)[key];
    },

    async delete(key) {
      const registry = readRegistry(projectsJsonPath);
      if (!(key in registry)) {
        return false;
      }
      delete registry[key];
      writeRegistry(projectsJsonPath, registry);
      return true;
    },

    async entries() {
      return Object.entries(readRegistry(projectsJsonPath)).map(([key, value]) => ({
        key,
        value,
      }));
    },

    // 没有条件写的调用方（需求/16 R1 只要求卡片）；显式拒绝，绝不静默穿透成无条件写。
    compareAndSwap: unsupportedTaskfoldCompareAndSwap,
  };
}
