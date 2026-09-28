// 需求/18 §3.6 / TASK-4 AC#1：任何宿主在任何 git worktree 里调用 core，读写都落到主 checkout
// 的 `.taskfold/`（全局锁、changes.log 也在那里），worktree 里那份副本视为过期快照，不读不写。
// 主 checkout 由 PathResolver（file-store-path-resolver.ts）经 `git rev-parse --git-common-dir` 定位。
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTaskfoldFileStores } from "@taskfold/core/file-store.js";
import { resolveTaskfoldMainCheckoutPath } from "@taskfold/core/file-store-path-resolver.js";
import { TaskfoldStore } from "../packages/openclaw/src/backend/src/store.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function tempRoot(): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-worktree-")));
  roots.push(root);
  return root;
}

function git(cwd: string, args: string[]): string {
  return execFileSync(
    "git",
    ["-c", "user.name=test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", ...args],
    { cwd, encoding: "utf8" },
  );
}

/** 建一个带一次提交的主 checkout，再从它拉出一个 worktree。 */
function mainWithWorktree(root: string): { main: string; worktree: string } {
  const main = path.join(root, "main");
  fs.mkdirSync(main, { recursive: true });
  git(main, ["init", "-q"]);
  git(main, ["commit", "-q", "--allow-empty", "-m", "init"]);
  const worktree = path.join(root, "worktree");
  git(main, ["worktree", "add", "-q", worktree, "-b", "feature"]);
  return { main, worktree };
}

/** 目录下每个文件的相对路径 → 内容（不存在的目录为空快照）。 */
function snapshot(dir: string): Record<string, string> {
  if (!fs.existsSync(dir)) {
    return {};
  }
  const files: Record<string, string> = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) {
      const filePath = path.join(entry.parentPath, entry.name);
      files[path.relative(dir, filePath)] = fs.readFileSync(filePath, "utf8");
    }
  }
  return files;
}

function cardFiles(dataDir: string): string[] {
  return fs.readdirSync(path.join(dataDir, "cards")).filter((name) => name.endsWith(".md"));
}

describe("TASK-4 AC#1：worktree 里调用 core，读写落到主 checkout", () => {
  it("#1 在 git worktree 内调用 core，读写都落到主 checkout 的 .taskfold/，worktree 副本不读不写", async () => {
    const root = tempRoot();
    const pluginDir = path.join(root, "plugin-state", "plugins", "taskfold");
    const main = path.join(root, "main");
    fs.mkdirSync(main, { recursive: true });
    git(main, ["init", "-q"]);
    const mainDataDir = path.join(main, ".taskfold");
    const mainStore = TaskfoldStore.fromStores(createTaskfoldFileStores({ dataDir: mainDataDir, pluginDir }));
    const seeded = await mainStore.create({ title: "主 checkout 里建的卡" });
    git(main, ["add", "-A"]);
    git(main, ["commit", "-q", "-m", "seed"]);
    const worktree = path.join(root, "worktree");
    git(main, ["worktree", "add", "-q", worktree, "-b", "feature"]);
    const worktreeDataDir = path.join(worktree, ".taskfold");
    // worktree 里带着一份入库的卡片副本。
    expect(cardFiles(worktreeDataDir)).toHaveLength(1);
    // worktree 建好之后主 checkout 又改了这张卡：worktree 里那份成了过期快照。
    await mainStore.update(seeded.id, { notes: "worktree 建好之后才写的" });
    const worktreeBefore = snapshot(worktreeDataDir);

    const worktreeStore = TaskfoldStore.fromStores(
      createTaskfoldFileStores({ dataDir: worktreeDataDir, pluginDir }),
    );
    // 读：拿到的是主 checkout 的最新内容，不是 worktree 里的快照。
    expect((await worktreeStore.get(seeded.id))?.notes).toBe("worktree 建好之后才写的");
    // 写：新建与修改都落到主 checkout。
    const created = await worktreeStore.create({ title: "worktree 里建的卡" });
    await worktreeStore.update(seeded.id, { notes: "worktree 里改的" });

    expect(cardFiles(mainDataDir)).toHaveLength(2);
    expect((await mainStore.get(created.id))?.title).toBe("worktree 里建的卡");
    expect((await mainStore.get(seeded.id))?.notes).toBe("worktree 里改的");
    // 锁、运行态、changes.log 都在主 checkout。
    expect(fs.existsSync(path.join(mainDataDir, ".locks"))).toBe(true);
    expect(fs.existsSync(path.join(mainDataDir, ".runtime", "changes.log"))).toBe(true);
    // worktree 里的副本一个字节都没动，也没长出 .locks/、.runtime/。
    expect(snapshot(worktreeDataDir)).toEqual(worktreeBefore);
  });
});

describe("PathResolver：resolveTaskfoldMainCheckoutPath", () => {
  it("worktree 里（含还不存在的子目录）映射到主 checkout 的同一相对位置", () => {
    const { main, worktree } = mainWithWorktree(tempRoot());
    expect(resolveTaskfoldMainCheckoutPath(path.join(worktree, ".taskfold"))).toBe(path.join(main, ".taskfold"));
    expect(resolveTaskfoldMainCheckoutPath(path.join(worktree, "packages", "app", ".taskfold"))).toBe(
      path.join(main, "packages", "app", ".taskfold"),
    );
  });

  it("已经在主 checkout 里：原样返回", () => {
    const { main } = mainWithWorktree(tempRoot());
    expect(resolveTaskfoldMainCheckoutPath(path.join(main, ".taskfold"))).toBe(path.join(main, ".taskfold"));
  });

  it("不是 git 仓库：回退为原样返回", () => {
    const plain = path.join(tempRoot(), "not-a-repo", ".taskfold");
    expect(resolveTaskfoldMainCheckoutPath(plain)).toBe(plain);
  });

  it("环境里残留的 GIT_DIR（在 git hook 里跑宿主）不影响定位", () => {
    const { main, worktree } = mainWithWorktree(tempRoot());
    const other = mainWithWorktree(tempRoot());
    const saved = process.env.GIT_DIR;
    process.env.GIT_DIR = path.join(other.main, ".git");
    try {
      expect(resolveTaskfoldMainCheckoutPath(path.join(worktree, ".taskfold"))).toBe(path.join(main, ".taskfold"));
    } finally {
      if (saved === undefined) {
        delete process.env.GIT_DIR;
      } else {
        process.env.GIT_DIR = saved;
      }
    }
  });
});
