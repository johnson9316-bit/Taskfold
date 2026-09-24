import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  PersistedTaskfoldAttachment,
  PersistedTaskfoldBoard,
  PersistedTaskfoldCard,
  PersistedTaskfoldMilestone,
  PersistedTaskfoldNotificationSubscription,
  PersistedTaskfoldProjectDocument,
} from "@taskfold/core/persistence-types.js";
import { dispatchAndStartTaskfoldCards } from "../src/backend/src/dispatcher.js";
import { TaskfoldStore } from "../src/backend/src/store.js";
import { keyedStore } from "./helpers/memory-keyed-store.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function createStore(): TaskfoldStore {
  return new TaskfoldStore(keyedStore<PersistedTaskfoldCard>(), {
    boards: keyedStore<PersistedTaskfoldBoard>(),
    milestones: keyedStore<PersistedTaskfoldMilestone>(),
    documents: keyedStore<PersistedTaskfoldProjectDocument>(),
    subscriptions: keyedStore<PersistedTaskfoldNotificationSubscription>(),
    attachments: keyedStore<PersistedTaskfoldAttachment>(),
  });
}

function createGitCheckout(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-dispatcher-"));
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

describe("Taskfold dispatcher launch wiring (需求/15.7 步骤 3)", () => {
  it("leaves the card in `prepared` while subagent.run() has not resolved", async () => {
    const store = createStore();
    const card = await store.create({ title: "Pending admission", status: "ready" });
    // Mirrors upstream's beginPreparedDispatch technique (需求/15.7 §7 步骤 3): a
    // run() that never resolves proves the card is durably parked in `prepared`
    // rather than only transiently between two awaits.
    const run = vi.fn(() => new Promise<never>(() => {}));

    void dispatchAndStartTaskfoldCards({
      store,
      subagent: { run },
      options: { maxStarts: 1 },
    });

    await vi.waitFor(async () => {
      const current = await store.get(card.id);
      expect(current?.metadata?.automation?.launch?.phase).toBe("prepared");
    });

    const prepared = await store.get(card.id);
    expect(prepared?.status).toBe("running");
    expect(prepared?.sessionKey).toBeTruthy();
    expect(prepared?.runId).toBe(prepared?.metadata?.automation?.launch?.provisionalRunId);
    expect(prepared?.execution).toMatchObject({ status: "running" });
    expect(prepared?.metadata?.attempts).toHaveLength(1);
    expect(prepared?.metadata?.attempts?.[0]).toMatchObject({ status: "running" });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("fails the launch, blocks the card, clears the association, and cleans up the worktree when subagent.run() rejects", async () => {
    const store = createStore();
    const checkout = createGitCheckout();
    const card = await store.create({
      title: "Doomed launch",
      status: "ready",
      workspace: { kind: "worktree", sourcePath: checkout },
      workspaceAccess: { unrestricted: true },
    });
    const createWorktree = vi.fn(async ({ name }: { name: string }) => {
      const worktreePath = path.join(checkout, ".taskfold-worktrees", name);
      fs.mkdirSync(worktreePath, { recursive: true });
      return { path: worktreePath, branch: `taskfold/${name}` };
    });
    const removeIfLossless = vi.fn(async () => true);
    const run = vi.fn(async () => {
      throw new Error("host refused admission");
    });

    const result = await dispatchAndStartTaskfoldCards({
      store,
      subagent: { run },
      worktrees: { create: createWorktree, removeIfLossless } as never,
      options: { maxStarts: 1, materializeWorktree: true },
    });

    expect(result.started).toHaveLength(0);
    expect(result.startFailures).toHaveLength(1);
    expect(removeIfLossless).toHaveBeenCalledWith(
      expect.objectContaining({ ownerKind: "workboard", ownerId: card.id }),
    );

    const failed = await store.get(card.id);
    expect(failed?.status).toBe("blocked");
    expect(failed?.sessionKey).toBeUndefined();
    expect(failed?.runId).toBeUndefined();
    expect(failed?.execution).toBeUndefined();
    expect(failed?.metadata?.claim).toBeUndefined();
    expect(failed?.metadata?.attempts).toHaveLength(1);
    expect(failed?.metadata?.attempts?.at(-1)).toMatchObject({ status: "blocked" });
    expect(failed?.metadata?.automation?.launch).toMatchObject({
      phase: "failed",
      reason: expect.stringContaining("host refused admission"),
    });
  });

  it("accepts the launch once subagent.run() resolves, keying a single attempt and defensively reading sessionKey", async () => {
    const store = createStore();
    const card = await store.create({ title: "Healthy launch", status: "ready" });
    // The 2026.7.1-2 SubagentRunResult type Taskfold compiles against declares
    // only `{ runId }` (需求/15.7 §9 U2); the mock matches that shape so accept
    // must fall back to the requested session key rather than assume one.
    const run = vi.fn(async () => ({ runId: "run-accepted-1" }));

    const result = await dispatchAndStartTaskfoldCards({
      store,
      subagent: { run },
      options: { maxStarts: 1 },
    });

    expect(result.startFailures).toHaveLength(0);
    expect(result.started).toHaveLength(1);
    const startedSessionKey = result.started[0]?.sessionKey;
    expect(startedSessionKey).toBeTruthy();

    const accepted = await store.get(card.id);
    expect(accepted?.status).toBe("running");
    expect(accepted?.sessionKey).toBe(startedSessionKey);
    expect(accepted?.runId).toBe("run-accepted-1");
    expect(accepted?.execution).toMatchObject({
      status: "running",
      sessionKey: startedSessionKey,
      runId: "run-accepted-1",
    });
    expect(accepted?.metadata?.automation?.launch).toMatchObject({
      phase: "accepted",
      acceptedSessionKey: startedSessionKey,
      acceptedRunId: "run-accepted-1",
    });
    // The provisional identity must be rekeyed in place, not left as a second attempt.
    expect(accepted?.metadata?.attempts).toHaveLength(1);
    expect(accepted?.metadata?.attempts?.[0]).toMatchObject({
      status: "running",
      runId: "run-accepted-1",
      sessionKey: startedSessionKey,
    });
  });
});
