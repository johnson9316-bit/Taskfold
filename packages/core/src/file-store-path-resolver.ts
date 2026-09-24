// Taskfold core：PathResolver（需求/18 §3.5 第 4 项、§3.6）。
//
// `.taskfold/` 纳入 Git，每个 worktree 都带着一份卡片副本。定案是任何宿主在任何 worktree 里
// 运行，都读写**主 checkout** 的 `.taskfold/`（全局锁、changes.log 也都在那里），worktree 里那份
// 副本视为过期快照，不读不写。主 checkout 用 `git rev-parse --git-common-dir` 定位：所有
// worktree 共用主 checkout 的 `.git`，它的上一级就是主 checkout 的根。
//
// 回退规则（一律原样返回调用方给的路径，不报错）：
//   - 不是 git 仓库、没装 git、路径还不存在的部分往上找不到仓库；
//   - common dir 不叫 `.git`（bare 仓库 + worktree、submodule 等）：这些布局里「主 checkout」
//     要么不存在，要么要另读 `core.worktree` 才能确定，这里不猜，按当前 worktree 处理。
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** 从 `target` 往上找到第一个存在的目录（真实路径），以及它下面还不存在的那几段。 */
function splitExistingAncestor(target: string): { existing: string; rest: string[] } {
  const rest: string[] = [];
  let current = target;
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    rest.unshift(path.basename(current));
    current = parent;
  }
  return { existing: fs.realpathSync(current), rest };
}

/** 从环境里去掉会覆盖仓库发现的 GIT_* 变量（在 git hook 里跑宿主时会带上），
 * 否则 git 按这些变量而不是按 `cwd` 找仓库，定位到的就不是调用方给的那个路径。 */
function repoDiscoveryEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_COMMON_DIR;
  return env;
}

function readGitLocation(cwd: string): { topLevel: string; commonDir: string } | undefined {
  let output: string;
  try {
    output = execFileSync("git", ["rev-parse", "--show-toplevel", "--git-common-dir"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      env: repoDiscoveryEnv(),
    });
  } catch {
    // 不是 git 仓库、没装 git、cwd 在 .git 目录里（没有工作区）：按回退规则处理。
    return undefined;
  }
  const [topLevel, commonDir] = output.split(/\r?\n/);
  if (!topLevel || !commonDir) {
    return undefined;
  }
  // 在主 checkout 里 `--git-common-dir` 输出相对 cwd 的路径（如 `../../.git`），在 worktree 里是
  // 绝对路径；统一按 cwd 解析后取真实路径，才能和 `--show-toplevel`（git 已给出真实路径）比较。
  return {
    topLevel: fs.realpathSync(topLevel),
    commonDir: fs.realpathSync(path.resolve(cwd, commonDir)),
  };
}

/**
 * 把 `target`（可以在某个 worktree 里，可以还不存在）映射到主 checkout 里的同一相对位置：
 * `<worktree>/.taskfold` → `<主 checkout>/.taskfold`，`<worktree>/sub/.taskfold` →
 * `<主 checkout>/sub/.taskfold`。已经在主 checkout 里、或命中回退规则（见模块头）时原样返回。
 */
export function resolveTaskfoldMainCheckoutPath(target: string): string {
  const absolute = path.resolve(target);
  const { existing, rest } = splitExistingAncestor(absolute);
  const location = readGitLocation(existing);
  if (!location || path.basename(location.commonDir) !== ".git") {
    return absolute;
  }
  const mainRoot = path.dirname(location.commonDir);
  if (mainRoot === location.topLevel) {
    return absolute;
  }
  const relative = path.relative(location.topLevel, path.join(existing, ...rest));
  return path.join(mainRoot, relative);
}
