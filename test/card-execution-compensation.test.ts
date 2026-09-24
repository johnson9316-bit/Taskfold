import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  TaskfoldKeyedStore,
  PersistedTaskfoldAttachment,
  PersistedTaskfoldBoard,
  PersistedTaskfoldCard,
  PersistedTaskfoldMilestone,
  PersistedTaskfoldNotificationSubscription,
  PersistedTaskfoldProjectDocument,
} from "@taskfold/core/persistence-types.js";
import {
  startTaskfoldCardExecution,
  type TaskfoldCardExecutionOptions,
} from "../src/backend/src/card-execution.js";
import { TaskfoldStore } from "../src/backend/src/store.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function keyedStore<T>(): TaskfoldKeyedStore<T> {
  const values = new Map<string, T>();
  return {
    async register(key, value) {
      values.set(key, value);
    },
    async lookup(key) {
      return values.get(key);
    },
    async delete(key) {
      return values.delete(key);
    },
    async entries() {
      return [...values.entries()].map(([key, value]) => ({ key, value }));
    },
  };
}

/**
 * Two TaskfoldStore instances over one shared in-memory card map stand in for
 * an execution-starting process and a concurrent host/UI process: they share
 * no in-process mutation queue, only the underlying card storage.
 */
function openSharedCardStore(): { opStore: TaskfoldStore; hostStore: TaskfoldStore } {
  const sharedCards = keyedStore<PersistedTaskfoldCard>();
  const build = () =>
    new TaskfoldStore(sharedCards, {
      boards: keyedStore<PersistedTaskfoldBoard>(),
      milestones: keyedStore<PersistedTaskfoldMilestone>(),
      documents: keyedStore<PersistedTaskfoldProjectDocument>(),
      subscriptions: keyedStore<PersistedTaskfoldNotificationSubscription>(),
      attachments: keyedStore<PersistedTaskfoldAttachment>(),
    });
  return { opStore: build(), hostStore: build() };
}

function createGitCheckout(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-card-execution-compensation-"));
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

function executionOptions(params: {
  worktreeRoot: string;
  run: ReturnType<typeof vi.fn>;
}): TaskfoldCardExecutionOptions {
  const createWorktree = vi.fn(async ({ name }: { name: string }) => {
    const worktreePath = path.join(params.worktreeRoot, name);
    fs.mkdirSync(worktreePath, { recursive: true });
    return { path: worktreePath, branch: `taskfold/${name}` };
  });
  return {
    runtime: {
      agent: { defaults: { provider: "openai", model: "gpt-5.5" } },
      subagent: {
        run: params.run,
        getSessionMessages: vi.fn(async () => ({ messages: [] })),
      },
      worktrees: {
        create: createWorktree,
        removeIfLossless: vi.fn(async () => true),
      },
    } as never,
    workspaceAccess: { unrestricted: true },
    defaultAgentId: "main",
  };
}

describe("card-execution workspace-rollback compensation (需求/15.8-并发与补偿设计.md §2.4/§4.4)", () => {
  it("⭐ preserves a concurrent host edit to notes when a failed start rolls back the materialized workspace", async () => {
    const { opStore, hostStore } = openSharedCardStore();
    const checkout = createGitCheckout();
    await opStore.createProject({
      id: "alpha",
      name: "Alpha",
      initialMilestoneTitle: "Build",
      defaultWorkspace: { kind: "dir", path: checkout },
    });
    const card = await opStore.create({ boardId: "alpha", title: "Concurrent notes edit" });
    const run = vi.fn(async () => {
      await hostStore.update(card.id, { notes: "written by the host mid-start" });
      throw new Error("host refused admission");
    });
    const options = executionOptions({
      worktreeRoot: path.join(checkout, ".taskfold-worktrees"),
      run,
    });

    await expect(
      startTaskfoldCardExecution({
        store: opStore,
        id: card.id,
        expectedRevision: card.revision,
        options,
      }),
    ).rejects.toThrow("host refused admission");

    const finalCard = await hostStore.get(card.id);
    expect(finalCard?.notes).toBe("written by the host mid-start");
  });

  it("⭐ preserves a concurrent host edit to workspace itself when a failed start rolls back the materialized workspace", async () => {
    const { opStore, hostStore } = openSharedCardStore();
    const checkout = createGitCheckout();
    await opStore.createProject({
      id: "alpha",
      name: "Alpha",
      initialMilestoneTitle: "Build",
      defaultWorkspace: { kind: "dir", path: checkout },
    });
    const card = await opStore.create({ boardId: "alpha", title: "Concurrent workspace edit" });
    let hostWrittenWorkspace: unknown;
    const run = vi.fn(async () => {
      const updated = await hostStore.update(card.id, {
        workspace: { kind: "scratch" },
      });
      hostWrittenWorkspace = updated.metadata?.automation?.workspace;
      throw new Error("host refused admission");
    });
    const options = executionOptions({
      worktreeRoot: path.join(checkout, ".taskfold-worktrees"),
      run,
    });

    await expect(
      startTaskfoldCardExecution({
        store: opStore,
        id: card.id,
        expectedRevision: card.revision,
        options,
      }),
    ).rejects.toThrow("host refused admission");
    expect(hostWrittenWorkspace).toBeDefined();

    const finalCard = await hostStore.get(card.id);
    expect(finalCard?.metadata?.automation?.workspace).toEqual(hostWrittenWorkspace);
  });
});
