// 定位 / 初始化 / 打开一个仓库的 `.taskfold/`（需求/18 §3.6、§3.8）。
//
// CLI 没有项目注册表：从当前目录往上找 `.taskfold/`。worktree 里的那份副本不读不写——先经
// core 的 PathResolver 把当前目录映射到主 checkout 里的同一位置，再往上找，止于主 checkout 的根；
// 不在 git 仓库里时一直找到文件系统根。打开时不传 pluginDir，`.taskfold/` 之外一个文件都不碰，
// 不依赖 OpenClaw、Gateway 或 `~/.openclaw`。
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createTaskfoldFileStores } from "@taskfold/core/file-store.js";
import { assertTaskfoldFormatWritable, TASKFOLD_FORMAT_VERSION } from "@taskfold/core/file-store-format.js";
import { resolveTaskfoldMainCheckoutPath } from "@taskfold/core/file-store-path-resolver.js";
import { TaskfoldProjectStore } from "@taskfold/core/store-projects.js";
import { TaskfoldCliError } from "./errors.js";

const DATA_DIR_NAME = ".taskfold";

function nearestExistingDir(target: string): string {
  let current = path.resolve(target);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return current;
}

/** 把已存在的那段前缀换成真实路径（git 给出的都是真实路径，比较前要对齐），不存在的尾巴原样接上。 */
function realpathOfExistingPrefix(target: string): string {
  const absolute = path.resolve(target);
  const existing = nearestExistingDir(absolute);
  return path.join(fs.realpathSync(existing), path.relative(existing, absolute));
}

/** `dir` 所在工作区（主 checkout 或某个 worktree）的根；不在 git 仓库里为 `undefined`。 */
export function gitTopLevel(dir: string): string | undefined {
  // 与 core 的 PathResolver 一样去掉 GIT_DIR 等变量：在 git hook 里跑时它们会让 git 无视 cwd。
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_COMMON_DIR;
  try {
    const output = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: nearestExistingDir(dir),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      env,
    }).trim();
    return output ? fs.realpathSync(output) : undefined;
  } catch {
    return undefined;
  }
}

function isDirectory(target: string): boolean {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

/** 从 `cwd` 往上找 `.taskfold/`（落到主 checkout，见模块头）；找不到为 `undefined`。 */
export function findTaskfoldDataDir(cwd: string): string | undefined {
  const start = realpathOfExistingPrefix(resolveTaskfoldMainCheckoutPath(cwd));
  const stopAt = gitTopLevel(start);
  let dir = start;
  for (;;) {
    const candidate = path.join(dir, DATA_DIR_NAME);
    if (isDirectory(candidate)) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (dir === stopAt || parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

export type TaskfoldInitResult = {
  dataDir: string;
  /** false：`.taskfold/` 原本就在，这次只补齐了缺失的结构。 */
  created: boolean;
  formatVersion: number;
};

/**
 * 在当前仓库主 checkout 的根建 `.taskfold/`（不在 git 仓库里时建在 `cwd`）。结构由 core 的
 * 工厂负责：各数据目录、`.gitignore`（忽略 `.locks/`、`.runtime/`）、带 `format_version` 的
 * `config.yml`、`.runtime/changes.log` 的 epoch。已存在时幂等，只补缺的部分。
 */
export function initTaskfoldProject(cwd: string): TaskfoldInitResult {
  const topLevel = gitTopLevel(cwd);
  const root = topLevel ? resolveTaskfoldMainCheckoutPath(topLevel) : path.resolve(cwd);
  const dataDir = path.join(root, DATA_DIR_NAME);
  const existed = fs.existsSync(dataDir);
  if (existed && !isDirectory(dataDir)) {
    throw new TaskfoldCliError("REJECTED", `${dataDir} exists but is not a directory.`);
  }
  if (existed) {
    // 工厂遇到更新的格式只会静默转只读、不初始化；init 要把这件事报出来（FORMAT_TOO_NEW）。
    assertTaskfoldFormatWritable(path.join(dataDir, "config.yml"));
  }
  createTaskfoldFileStores({ dataDir }).close();
  return { dataDir, created: !existed, formatVersion: TASKFOLD_FORMAT_VERSION };
}

export type TaskfoldProject = {
  dataDir: string;
  store: TaskfoldProjectStore;
};

/** 打开 `cwd` 所属仓库的 `.taskfold/`；没初始化抛 NOT_INITIALIZED。 */
export function openTaskfoldProject(cwd: string): TaskfoldProject {
  const dataDir = findTaskfoldDataDir(cwd);
  if (!dataDir) {
    throw new TaskfoldCliError(
      "NOT_INITIALIZED",
      `no ${DATA_DIR_NAME}/ directory found from ${path.resolve(cwd)} up to the repository root; run \`taskfold init\` first.`,
    );
  }
  const stores = createTaskfoldFileStores({ dataDir });
  return { dataDir, store: new TaskfoldProjectStore(stores.cards, stores) };
}
