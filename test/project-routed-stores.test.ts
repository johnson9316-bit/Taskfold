// TASK-10：OpenClaw 适配层的多项目路由（组合 store）。
//
// core 的文件后端一个实例只管一个项目的 `.taskfold/`，而 Gateway 里所有工具、网关方法、调度都
// 只吃一个 TaskfoldStore。适配层把各项目的文件 store 组合成一套：按 boardId 查 projects.json，
// 项目绑了仓库（defaultWorkspace 为 dir/worktree）就落到仓库主 checkout 的 `.taskfold/`，没绑
// （default、fb-probe 这类）就落到 `<pluginDir>/projects/<boardId>/`。零数据项目第一次写入时才建
// 目录。跨项目移卡先写新项目、再删旧项目；中途失败时卡片至少留在一边，两边都在时按 revision 取
// 新的一份并告警。
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTaskfoldProjectRoutedStores } from "../packages/openclaw/src/backend/src/project-routed-stores.js";
import { TaskfoldStore } from "../packages/openclaw/src/backend/src/store.js";

const roots: string[] = [];
const chmodRestore: string[] = [];

afterEach(() => {
  for (const dir of chmodRestore.splice(0)) {
    fs.chmodSync(dir, 0o700);
  }
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function gitRepo(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  execFileSync("git", ["init", "-q", dir], { stdio: "pipe" });
  return fs.realpathSync(dir);
}

async function setup() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-routed-")));
  roots.push(root);
  const pluginDir = path.join(root, "state", "plugins", "taskfold");
  const repo = gitRepo(path.join(root, "repo"));
  const emptyRepo = gitRepo(path.join(root, "empty-repo"));
  const warnings: string[] = [];
  const open = () =>
    TaskfoldStore.fromStores(createTaskfoldProjectRoutedStores({ pluginDir, warn: (m) => warnings.push(m) }));
  const store = open();
  await store.upsertBoard({ id: "repo-proj", name: "有仓库", defaultWorkspace: { kind: "dir", path: repo } });
  await store.upsertBoard({ id: "empty-proj", name: "零数据", defaultWorkspace: { kind: "dir", path: emptyRepo } });
  await store.upsertBoard({ id: "no-ws", name: "没绑仓库" });
  return { root, pluginDir, repo, emptyRepo, store, open, warnings };
}

function mdFiles(dir: string): string[] {
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.endsWith(".md")) : [];
}

describe("组合 store：按 boardId 路由到各项目的数据根", () => {
  it("绑了仓库的写进主 checkout 的 .taskfold/，没绑的写进 pluginDir/projects/<id>/", async () => {
    const { pluginDir, repo, store } = await setup();
    const inRepo = await store.create({ title: "仓库里的卡", boardId: "repo-proj" });
    const inDefault = await store.create({ title: "default 项目的卡" });
    const milestone = await store.createMilestone({ boardId: "no-ws", title: "M1" });
    await store.createProjectDocument({
      boardId: "repo-proj",
      key: "notes",
      section: "project",
      type: "markdown",
      title: "说明",
      content: "正文",
    });

    expect(mdFiles(path.join(repo, ".taskfold", "cards"))).toHaveLength(1);
    expect(mdFiles(path.join(pluginDir, "projects", "default", "cards"))).toHaveLength(1);
    expect(mdFiles(path.join(pluginDir, "projects", "no-ws", "milestones"))).toHaveLength(1);
    expect(fs.readdirSync(path.join(repo, ".taskfold", "documents"))).toHaveLength(1);
    expect(JSON.parse(fs.readFileSync(path.join(pluginDir, "projects.json"), "utf8"))).toHaveProperty("repo-proj");

    const reopened = TaskfoldStore.fromStores(createTaskfoldProjectRoutedStores({ pluginDir }));
    expect((await reopened.list()).map((card) => card.id).toSorted()).toEqual([inRepo.id, inDefault.id].toSorted());
    expect((await reopened.listMilestones("no-ws")).milestones.map((m) => m.id)).toEqual([milestone.id]);
    expect((await reopened.get(inRepo.id))?.title).toBe("仓库里的卡");
  });

  it("项目指向某个 worktree 时，数据写进主 checkout 的 .taskfold/", async () => {
    const { root, repo, store } = await setup();
    execFileSync("git", ["-C", repo, "commit", "-q", "--allow-empty", "-m", "init"], { stdio: "pipe" });
    const worktree = path.join(root, "repo-wt");
    execFileSync("git", ["-C", repo, "worktree", "add", "-q", worktree], { stdio: "pipe" });
    await store.upsertBoard({ id: "wt-proj", defaultWorkspace: { kind: "dir", path: worktree } });
    await store.create({ title: "worktree 项目的卡", boardId: "wt-proj" });
    expect(mdFiles(path.join(repo, ".taskfold", "cards"))).toHaveLength(1);
    expect(fs.existsSync(path.join(worktree, ".taskfold"))).toBe(false);
  });

  it("零数据项目：读取不建目录，第一次写入才建 .taskfold/", async () => {
    const { emptyRepo, store } = await setup();
    await store.listProjects({ includeArchived: true });
    await store.getProject("empty-proj");
    await store.list({ boardId: "empty-proj" });
    expect(fs.existsSync(path.join(emptyRepo, ".taskfold"))).toBe(false);

    await store.create({ title: "第一张卡", boardId: "empty-proj" });
    expect(mdFiles(path.join(emptyRepo, ".taskfold", "cards"))).toHaveLength(1);
  });
});

describe("组合 store：跨项目移卡", () => {
  async function cardToMove() {
    const env = await setup();
    const target = await env.store.createMilestone({ boardId: "no-ws", title: "目标里程碑" });
    const card = await env.store.create({ title: "要移走的卡", boardId: "repo-proj" });
    return { ...env, card, targetMilestoneId: target.id };
  }

  it("先写新项目、再删旧项目：旧项目里不再有这张卡", async () => {
    const { pluginDir, repo, store, card, targetMilestoneId } = await cardToMove();
    await store.moveProject(card.id, { boardId: "no-ws", milestoneId: targetMilestoneId });

    expect(mdFiles(path.join(repo, ".taskfold", "cards"))).toHaveLength(0);
    expect(mdFiles(path.join(pluginDir, "projects", "no-ws", "cards"))).toHaveLength(1);
    const moved = await store.get(card.id);
    expect(moved?.metadata?.automation?.boardId).toBe("no-ws");
    expect((await store.list()).filter((c) => c.id === card.id)).toHaveLength(1);
  });

  it("旧副本删不掉：两边都在，按 revision 取新写的那份，并告警写出两边的位置", async () => {
    const { pluginDir, repo, store, open, warnings, card, targetMilestoneId } = await cardToMove();
    const oldCardsDir = path.join(repo, ".taskfold", "cards");
    fs.chmodSync(oldCardsDir, 0o500);
    chmodRestore.push(oldCardsDir);

    await store.moveProject(card.id, { boardId: "no-ws", milestoneId: targetMilestoneId });

    expect(mdFiles(oldCardsDir)).toHaveLength(1);
    expect(mdFiles(path.join(pluginDir, "projects", "no-ws", "cards"))).toHaveLength(1);
    const fresh = open();
    const listed = (await fresh.list()).filter((c) => c.id === card.id);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.metadata?.automation?.boardId).toBe("no-ws");
    expect((await fresh.get(card.id))?.metadata?.automation?.boardId).toBe("no-ws");
    expect(warnings.join("\n")).toContain(path.join(repo, ".taskfold"));
    expect(warnings.join("\n")).toContain(path.join(pluginDir, "projects", "no-ws"));
  });

  it("新项目写不进去：移卡失败，卡原样留在旧项目", async () => {
    const { pluginDir, repo, store, card, targetMilestoneId } = await cardToMove();
    const targetCardsDir = path.join(pluginDir, "projects", "no-ws", "cards");
    fs.mkdirSync(targetCardsDir, { recursive: true });
    fs.chmodSync(targetCardsDir, 0o500);
    chmodRestore.push(targetCardsDir);

    await expect(store.moveProject(card.id, { boardId: "no-ws", milestoneId: targetMilestoneId })).rejects.toThrow();

    expect(mdFiles(path.join(repo, ".taskfold", "cards"))).toHaveLength(1);
    expect((await store.get(card.id))?.metadata?.automation?.boardId).toBe("repo-proj");
  });
});
