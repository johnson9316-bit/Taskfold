// TASK-8：VS Code 扩展进程的 method 映射、卡片 CAS 与冲突三选一的各个分支。
//
// 数据用真实的临时 git 仓库 + core 文件存储（与 CLI 同样的打开方式）；界面交互（冲突框、diff、
// 打开文件）用 TaskfoldVscodeUi 替身记录调用并按用例给出用户的选择；LOCKED 由另一个真实进程
// 持卡锁制造（test/helpers/cli-lock-holder.ts）。
import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { initTaskfoldProject } from "@taskfold/cli/project.js";
import { taskfoldCardLockPath } from "@taskfold/core/file-store-locks.js";
import type { TaskfoldCard } from "@taskfold/core/contract/index.js";
import { taskfoldExtensionStrings } from "../packages/vscode/src/l10n.ts";
import {
  boardViewStateKey,
  createTaskfoldVscodeMethods,
  toWebviewError,
  type TaskfoldConflictChoice,
  type TaskfoldVscodeUi,
} from "../packages/vscode/src/methods.ts";
import { TaskfoldProjectRegistry, type TaskfoldWorkspaceFolder } from "../packages/vscode/src/projects.ts";
import {
  cardFilePath,
  cleanupTempDirs,
  holdLockInAnotherProcess,
  makeTempDir,
  makeTempGitRepo,
} from "./helpers/cli-harness.js";

afterAll(() => {
  cleanupTempDirs();
});

const strings = taskfoldExtensionStrings("en");

function fakeUi(choices: Array<TaskfoldConflictChoice | undefined> = []) {
  const queue = [...choices];
  const ui = {
    confirm: vi.fn(async () => true),
    chooseConflictResolution: vi.fn(async () => queue.shift()),
    showCardDiff: vi.fn(async () => undefined),
    openFile: vi.fn(async () => undefined),
  } satisfies TaskfoldVscodeUi;
  return ui;
}

function memento() {
  const values = new Map<string, unknown>();
  return {
    values,
    get: <T>(key: string) => values.get(key) as T | undefined,
    update: async (key: string, value: unknown) => {
      values.set(key, value);
    },
  };
}

function initRepo(name?: string): string {
  const repo = name ? path.join(makeTempDir("taskfold-vscode-"), name) : makeTempGitRepo();
  if (name) {
    fs.mkdirSync(repo);
  }
  initTaskfoldProject(repo);
  return repo;
}

function setup(folders: TaskfoldWorkspaceFolder[], ui: TaskfoldVscodeUi = fakeUi()) {
  const registry = new TaskfoldProjectRegistry(() => folders);
  const viewState = memento();
  const methods = createTaskfoldVscodeMethods({ registry, ui, viewState, strings });
  return { registry, viewState, methods, ui };
}

async function firstProject(methods: ReturnType<typeof setup>["methods"]) {
  const { projects } = (await methods.call("taskfold.projects.list", { includeArchived: true })) as {
    projects: Array<{ id: string; name: string }>;
  };
  return projects[0]!;
}

async function createCard(methods: ReturnType<typeof setup>["methods"], projectId: string, extra = {}) {
  const { card } = (await methods.call("taskfold.cards.create", {
    boardId: projectId,
    title: "Card",
    notes: "original body",
    status: "todo",
    priority: "normal",
    ...extra,
  })) as { card: TaskfoldCard };
  return card;
}

describe("projects", () => {
  it("资料库支持元数据与 Markdown/路径文档读写，拒绝过期 revision 和仓库外路径", async () => {
    const repo = initRepo();
    const { methods } = setup([{ name: "alpha", path: repo }]);
    const project = await firstProject(methods);
    const created = (await methods.call("taskfold.projects.documents.create", {
      boardId: project.id, key: "note", section: "project", type: "markdown", title: "Note", content: "one",
    })) as { document: { id: string; boardId: string } };
    expect(created.document.boardId).toBe(project.id);
    const read = (await methods.call("taskfold.projects.documents.read", { id: created.document.id })) as { preview: { content: string; revision: string } };
    expect(read.preview.content).toBe("one");
    const written = (await methods.call("taskfold.projects.documents.write", {
      id: created.document.id, content: "two", expectedRevision: read.preview.revision,
    })) as { preview: { content: string } };
    expect(written.preview.content).toBe("two");
    await expect(methods.call("taskfold.projects.documents.write", {
      id: created.document.id, content: "stale", expectedRevision: read.preview.revision,
    })).rejects.toThrow("changed");

    fs.mkdirSync(path.join(repo, "docs"));
    const target = path.join(repo, "docs", "spec.md");
    fs.writeFileSync(target, "before");
    const pathDoc = (await methods.call("taskfold.projects.documents.create", {
      boardId: project.id, key: "spec", section: "project", type: "path", title: "Spec", target,
    })) as { document: { id: string } };
    const pathRead = (await methods.call("taskfold.projects.documents.read", { id: pathDoc.document.id })) as { preview: { revision: string } };
    await methods.call("taskfold.projects.documents.write", {
      id: pathDoc.document.id, content: "after", expectedRevision: pathRead.preview.revision,
    });
    expect(fs.readFileSync(target, "utf8")).toBe("after");
    await methods.call("taskfold.projects.documents.update", { id: created.document.id, title: "Renamed" });
    await methods.call("taskfold.projects.documents.reorder", {
      boardId: project.id, documentIds: [pathDoc.document.id, created.document.id],
    });
    await methods.call("taskfold.projects.documents.hide", { id: created.document.id });
    await methods.call("taskfold.projects.documents.restore", { id: created.document.id });
    const listed = (await methods.call("taskfold.projects.documents.list", { boardId: project.id })) as { documents: Array<{ id: string }> };
    expect(listed.documents.map((document) => document.id)).toEqual([pathDoc.document.id, created.document.id]);

    const outside = path.join(makeTempDir("taskfold-outside-"), "outside.md");
    fs.writeFileSync(outside, "private");
    const outsideDoc = (await methods.call("taskfold.projects.documents.create", {
      boardId: project.id, key: "outside", section: "project", type: "path", title: "Outside", target: outside,
    })) as { document: { id: string } };
    await expect(methods.call("taskfold.projects.documents.read", { id: outsideDoc.document.id })).rejects.toThrow("outside");
    expect(await methods.call("taskfold.projects.documents.delete", { id: outsideDoc.document.id })).toEqual({ deleted: true });
  });
  it("one project per workspace folder with .taskfold/, named after the folder; none without it", async () => {
    const repo = initRepo();
    const bare = makeTempGitRepo();
    const { methods } = setup([
      { name: "alpha", path: repo },
      { name: "no-taskfold", path: bare },
    ]);
    const { projects } = (await methods.call("taskfold.projects.list")) as { projects: any[] };
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ id: "alpha", name: "alpha" });

    const empty = setup([{ name: "no-taskfold", path: bare }]);
    expect(await empty.methods.call("taskfold.projects.list")).toEqual({ projects: [] });
  });

  it("two repos on the same `default` board get distinct project ids, and cards carry the project id", async () => {
    const first = initRepo("same");
    const second = initRepo("same");
    const { methods } = setup([
      { name: "same", path: first },
      { name: "same", path: second },
    ]);
    const { projects } = (await methods.call("taskfold.projects.list")) as { projects: any[] };
    expect(projects.map((project) => project.id)).toEqual(["same", "same-2"]);

    const card = await createCard(methods, "same-2");
    expect(card.metadata?.automation?.boardId).toBe("same-2");
    const { project } = (await methods.call("taskfold.projects.get", { id: "same-2" })) as { project: any };
    expect(project.board).toMatchObject({ id: "same-2", name: "same" });
    expect(project.cards.map((candidate: TaskfoldCard) => candidate.id)).toEqual([card.id]);
    // 卡片真正写进了第二个仓库、`default` board。
    const { project: other } = (await methods.call("taskfold.projects.get", { id: "same" })) as { project: any };
    expect(other.cards).toEqual([]);
    expect(fs.readdirSync(path.join(second, ".taskfold", "cards"))).toHaveLength(1);
  });

  it("cards.create ignores workspace / metadata fields the webview must not set", async () => {
    const repo = initRepo();
    const { methods, registry } = setup([{ name: "alpha", path: repo }]);
    const project = await firstProject(methods);
    const card = await createCard(methods, project.id, {
      workspace: { kind: "dir", path: "/etc" },
      workspaceAccess: { unrestricted: true },
      metadata: { archivedAt: 1 },
    });
    const stored = (await registry.byCardId(card.id)).card;
    expect(stored.metadata?.automation?.workspace).toBeUndefined();
    expect(stored.metadata?.automation?.workspaceAccess).toBeUndefined();
    expect(stored.metadata?.archivedAt).toBeUndefined();
  });

  it("board view settings are kept in workspace state and survive a new registry", async () => {
    const repo = initRepo();
    const first = setup([{ name: "alpha", path: repo }]);
    const project = await firstProject(first.methods);
    const boardView = { groupBy: "status", sortBy: "priority", sortDirection: "desc" };
    await first.methods.call("taskfold.projects.boardView.update", { id: project.id, boardView });
    const [stored] = [...first.viewState.values.values()];
    expect(stored).toEqual(boardView);

    // 重开 VS Code：新的 registry（core 的项目注册表是进程内存，已经没了），同一份 workspaceState。
    const registry = new TaskfoldProjectRegistry(() => [{ name: "alpha", path: repo }]);
    const methods = createTaskfoldVscodeMethods({ registry, ui: fakeUi(), viewState: first.viewState, strings });
    await methods.call("taskfold.projects.list");
    const { project: view } = (await methods.call("taskfold.projects.get", { id: project.id })) as { project: any };
    expect(view.board.boardView).toEqual(boardView);
    expect(boardViewStateKey((await registry.list())[0]!)).toContain(fs.realpathSync(repo));
  });

  it("unsupported methods (project management and execution) fail with UNSUPPORTED", async () => {
    const repo = initRepo();
    const { methods } = setup([{ name: "alpha", path: repo }]);
    for (const method of [
      "taskfold.projects.create",
      "taskfold.projects.archive",
      "taskfold.projects.reorder",
      "taskfold.cards.moveProject",
      "taskfold.cards.execution.start",
    ]) {
      const error = await methods.call(method, {}).catch((caught: unknown) => caught);
      expect(toWebviewError(error, strings)).toMatchObject({ code: "UNSUPPORTED" });
    }
  });

  it("cards.openFile opens the card's Markdown file", async () => {
    const repo = initRepo();
    const ui = fakeUi();
    const { methods } = setup([{ name: "alpha", path: repo }], ui);
    const card = await createCard(methods, (await firstProject(methods)).id);
    await methods.call("taskfold.cards.openFile", { id: card.id });
    expect(ui.openFile).toHaveBeenCalledWith(cardFilePath(repo, card.id));
  });
});

describe("card CAS and the Reload / Overwrite / View Diff choice", () => {
  async function conflicted(choices: Array<TaskfoldConflictChoice | undefined>) {
    const repo = initRepo();
    const ui = fakeUi(choices);
    const { methods, registry } = setup([{ name: "alpha", path: repo }], ui);
    const project = await firstProject(methods);
    const card = await createCard(methods, project.id);
    // 别的进程（这里直接用同一个 core store 模拟 CLI）在前端读到之后改了这张卡。
    const { project: vscodeProject } = await registry.byCardId(card.id);
    const external = await vscodeProject.store.update(card.id, { title: "changed by CLI" });
    return { repo, ui, methods, registry, project, card, external, store: vscodeProject.store };
  }

  it("cards.update with the current revision writes without asking", async () => {
    const repo = initRepo();
    const ui = fakeUi();
    const { methods } = setup([{ name: "alpha", path: repo }], ui);
    const card = await createCard(methods, (await firstProject(methods)).id);
    const result = (await methods.call("taskfold.cards.update", {
      id: card.id,
      notes: "edited in VS Code",
      expectedRevision: card.revision,
    })) as any;
    expect(result.conflict).toBeUndefined();
    expect(result.card).toMatchObject({ notes: "edited in VS Code", revision: card.revision + 1 });
    expect(ui.chooseConflictResolution).not.toHaveBeenCalled();
  });

  it("Reload writes nothing and tells the webview to drop its changes", async () => {
    const { methods, card, external, store, ui } = await conflicted(["reload"]);
    const result = await methods.call("taskfold.cards.update", {
      id: card.id,
      notes: "edited in VS Code",
      expectedRevision: card.revision,
    });
    expect(result).toEqual({ conflict: "reloaded" });
    expect(ui.chooseConflictResolution).toHaveBeenCalledWith("changed by CLI");
    expect(await store.get(card.id)).toMatchObject({ notes: "original body", revision: external.revision });
  });

  it("Overwrite re-applies only the local changes on the latest revision", async () => {
    const { methods, card, external, store } = await conflicted(["overwrite"]);
    const result = (await methods.call("taskfold.cards.update", {
      id: card.id,
      notes: "edited in VS Code",
      expectedRevision: card.revision,
    })) as any;
    expect(result.conflict).toBe("overwritten");
    expect(await store.get(card.id)).toMatchObject({
      title: "changed by CLI",
      notes: "edited in VS Code",
      revision: external.revision + 1,
    });
  });

  it("View Diff shows disk vs local, then asks again", async () => {
    const { repo, methods, card, ui, store } = await conflicted(["diff", undefined]);
    const result = await methods.call("taskfold.cards.update", {
      id: card.id,
      notes: "edited in VS Code",
      expectedRevision: card.revision,
    });
    expect(result).toEqual({ conflict: "cancelled" });
    expect(ui.chooseConflictResolution).toHaveBeenCalledTimes(2);
    expect(ui.showCardDiff).toHaveBeenCalledTimes(1);
    const [diff] = ui.showCardDiff.mock.calls[0] as unknown as [{ diskPath: string; localContent: string }];
    expect(diff.diskPath).toBe(cardFilePath(repo, card.id));
    const disk = fs.readFileSync(diff.diskPath, "utf8");
    expect(disk).toContain("original body");
    expect(diff.localContent).toContain("edited in VS Code");
    expect(diff.localContent).toContain("changed by CLI");
    expect(diff.localContent).not.toContain("original body");
    expect((await store.get(card.id))?.notes).toBe("original body");
  });

  it("closing the dialog writes nothing and keeps the local changes", async () => {
    const { methods, card, external, store } = await conflicted([undefined]);
    expect(
      await methods.call("taskfold.cards.update", { id: card.id, notes: "x", expectedRevision: card.revision }),
    ).toEqual({ conflict: "cancelled" });
    expect((await store.get(card.id))?.revision).toBe(external.revision);
  });

  it("Overwrite that loses again to another write asks again", async () => {
    const { methods, card, store, ui } = await conflicted(["overwrite", "overwrite"]);
    let raced = false;
    ui.chooseConflictResolution.mockImplementation(async () => {
      if (!raced) {
        raced = true;
        // 用户在框里犹豫时，又有人写了一次：第一次 Overwrite 用的 revision 已经过期。
        await store.update(card.id, { priority: "high" });
      }
      return "overwrite";
    });
    const result = (await methods.call("taskfold.cards.update", {
      id: card.id,
      notes: "edited in VS Code",
      expectedRevision: card.revision,
    })) as any;
    expect(result.conflict).toBe("overwritten");
    expect(ui.chooseConflictResolution).toHaveBeenCalledTimes(2);
    expect(await store.get(card.id)).toMatchObject({ priority: "high", notes: "edited in VS Code" });
  });

  it("drag to another status column (cards.move) is a CAS too", async () => {
    const { methods, card, store, ui } = await conflicted(["reload"]);
    expect(
      await methods.call("taskfold.cards.move", { id: card.id, status: "review", expectedRevision: card.revision }),
    ).toEqual({ conflict: "reloaded" });
    expect((await store.get(card.id))?.status).toBe("todo");

    ui.chooseConflictResolution.mockResolvedValueOnce("overwrite");
    const result = (await methods.call("taskfold.cards.move", {
      id: card.id,
      status: "review",
      expectedRevision: card.revision,
    })) as any;
    expect(result).toMatchObject({ conflict: "overwritten", card: { status: "review", title: "changed by CLI" } });
  });

  it("drag to another milestone (cards.moveMilestone) is a CAS too, and only the dragged card changes", async () => {
    const { methods, card, store, ui, project } = await conflicted([]);
    const other = await createCard(methods, project.id, { title: "Other" });
    const { milestone } = (await methods.call("taskfold.projects.milestones.create", {
      boardId: project.id,
      title: "M1",
    })) as { milestone: { id: string } };

    ui.chooseConflictResolution.mockResolvedValueOnce("diff").mockResolvedValueOnce("overwrite");
    const result = (await methods.call("taskfold.cards.moveMilestone", {
      id: card.id,
      milestoneId: milestone.id,
      expectedRevision: card.revision,
    })) as any;
    expect(result).toMatchObject({ conflict: "overwritten", card: { milestoneId: milestone.id } });
    expect(ui.showCardDiff).toHaveBeenCalledTimes(1);
    expect(await store.get(other.id)).toMatchObject({ revision: other.revision });
    expect(await store.get(card.id)).toMatchObject({ milestoneId: milestone.id, title: "changed by CLI" });
  });

  it("another process holding the card lock is LOCKED with a retry message, no dialog", async () => {
    const repo = initRepo();
    const ui = fakeUi();
    const { methods } = setup([{ name: "alpha", path: repo }], ui);
    const card = await createCard(methods, (await firstProject(methods)).id);
    const holder = await holdLockInAnotherProcess(
      cardFilePath(repo, card.id),
      taskfoldCardLockPath(path.join(repo, ".taskfold", ".locks"), card.id),
    );
    let error: unknown;
    try {
      error = await methods
        .call("taskfold.cards.update", { id: card.id, notes: "x", expectedRevision: card.revision })
        .catch((caught: unknown) => caught);
    } finally {
      await holder.release();
    }
    expect(toWebviewError(error, strings)).toEqual({ code: "LOCKED", message: strings.locked });
    expect(ui.chooseConflictResolution).not.toHaveBeenCalled();
    // 放锁后同一个请求成功。
    const retried = (await methods.call("taskfold.cards.update", {
      id: card.id,
      notes: "x",
      expectedRevision: card.revision,
    })) as any;
    expect(retried.card.notes).toBe("x");
  }, 30_000);
});
