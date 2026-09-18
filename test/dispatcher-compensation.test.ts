import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchAndStartTaskfoldCards } from "../src/backend/src/dispatcher.js";
import { createTaskfoldSqliteStores } from "../src/backend/src/sqlite-store.js";
import { TaskfoldStore } from "../src/backend/src/store.js";

const roots: string[] = [];
const closers: Array<() => void> = [];

afterEach(() => {
  for (const close of closers.splice(0)) {
    close();
  }
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/**
 * Two stores over one database file stand in for a dispatch process and a
 * concurrent host/UI process editing the same card: they share no in-process
 * mutation queue, matching test/card-revision.test.ts's openSharedDatabase().
 */
function openSharedDatabase(): { open: () => TaskfoldStore } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-dispatch-compensation-"));
  roots.push(root);
  const dbPath = path.join(root, "taskfold.sqlite");
  return {
    open: () => {
      const stores = createTaskfoldSqliteStores({ dbPath });
      closers.push(stores.close);
      return TaskfoldStore.fromSqliteStores(stores);
    },
  };
}

function createGitCheckout(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-dispatch-compensation-repo-"));
  roots.push(root);
  fs.writeFileSync(path.join(root, "README.md"), "# Test checkout\n");
  execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "taskfold@example.test"], {
    cwd: root,
    stdio: "ignore",
  });
  execFileSync("git", ["config", "user.name", "Taskfold Test"], {
    cwd: root,
    stdio: "ignore",
  });
  execFileSync("git", ["add", "README.md"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "Initial commit"], { cwd: root, stdio: "ignore" });
  return root;
}

function dispatchOptions(checkout: string) {
  const createWorktree = vi.fn(async ({ name }: { name: string }) => {
    const worktreePath = path.join(checkout, ".taskfold-worktrees", name);
    fs.mkdirSync(worktreePath, { recursive: true });
    return { path: worktreePath, branch: `taskfold/${name}` };
  });
  const removeIfLossless = vi.fn(async () => true);
  return { worktrees: { create: createWorktree, removeIfLossless } as never };
}

describe("dispatcher workspace-rollback compensation (需求/15.8-并发与补偿设计.md §2.4/§4.4)", () => {
  it("⭐ preserves a concurrent host edit to notes when a failed start rolls back the materialized workspace", async () => {
    const { open } = openSharedDatabase();
    const dispatchStore = open();
    const hostStore = open();
    const checkout = createGitCheckout();
    const card = await dispatchStore.create({
      title: "Concurrent notes edit",
      status: "ready",
      workspace: { kind: "worktree", sourcePath: checkout },
      workspaceAccess: { unrestricted: true },
    });
    const run = vi.fn(async () => {
      // A UI/agent write lands on a second Gateway process while this run is
      // still being admitted -- fully committed before the run rejects, so
      // this is not a timing-dependent race.
      await hostStore.update(card.id, { notes: "written by the host mid-dispatch" });
      throw new Error("host refused admission");
    });

    const result = await dispatchAndStartTaskfoldCards({
      store: dispatchStore,
      subagent: { run },
      ...dispatchOptions(checkout),
      options: { maxStarts: 1, materializeWorktree: true },
    });

    expect(result.started).toHaveLength(0);
    expect(result.startFailures).toHaveLength(1);

    const finalCard = await hostStore.get(card.id);
    expect(finalCard?.notes).toBe("written by the host mid-dispatch");
  });

  it("⭐ preserves a concurrent host edit to workspace itself when a failed start rolls back the materialized workspace", async () => {
    const { open } = openSharedDatabase();
    const dispatchStore = open();
    const hostStore = open();
    const checkout = createGitCheckout();
    const card = await dispatchStore.create({
      title: "Concurrent workspace edit",
      status: "ready",
      workspace: { kind: "worktree", sourcePath: checkout },
      workspaceAccess: { unrestricted: true },
    });
    // normalizeWorkspace() carries forward fields the patch omits (e.g. a
    // stale `branch`) from whatever workspace was persisted at write time, so
    // the assertion below compares against what the host's own write actually
    // persisted rather than the literal patch.
    let hostWrittenWorkspace: unknown;
    const run = vi.fn(async () => {
      const updated = await hostStore.update(card.id, {
        workspace: { kind: "dir", path: checkout },
      });
      hostWrittenWorkspace = updated.metadata?.automation?.workspace;
      throw new Error("host refused admission");
    });

    const result = await dispatchAndStartTaskfoldCards({
      store: dispatchStore,
      subagent: { run },
      ...dispatchOptions(checkout),
      options: { maxStarts: 1, materializeWorktree: true },
    });

    expect(result.started).toHaveLength(0);
    expect(result.startFailures).toHaveLength(1);
    expect(hostWrittenWorkspace).toBeDefined();

    const finalCard = await hostStore.get(card.id);
    expect(finalCard?.metadata?.automation?.workspace).toEqual(hostWrittenWorkspace);
  });
});
