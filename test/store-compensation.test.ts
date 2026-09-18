import { describe, expect, it } from "vitest";
import type { TaskfoldCard, TaskfoldComment, TaskfoldWorkspace } from "../src/contract/index.js";
import {
  invertTaskfoldCardMutation,
  invertTaskfoldWorkspaceMutation,
  sameTaskfoldCardState,
} from "../src/backend/src/store-compensation.js";

const NOW = 1_700_000_000_000;

function makeCard(overrides: Partial<TaskfoldCard> = {}): TaskfoldCard {
  return {
    id: "card-1",
    title: "Title",
    status: "todo",
    priority: "normal",
    labels: [],
    position: 1000,
    createdAt: NOW,
    updatedAt: NOW,
    revision: 1,
    ...overrides,
  };
}

function comment(id: string, body: string): TaskfoldComment {
  return { id, body, createdAt: NOW };
}

describe("invertTaskfoldCardMutation", () => {
  it("keeps current untouched when this operation never actually changed the field (before === after)", () => {
    const before = makeCard({ notes: "unchanged" });
    const after = makeCard({ notes: "unchanged" });
    const current = makeCard({
      notes: "unchanged",
      title: "Host renamed it while we were busy",
      revision: 9,
      updatedAt: NOW + 10_000,
    });

    const merged = invertTaskfoldCardMutation(before, after, current);

    expect(merged.title).toBe("Host renamed it while we were busy");
    expect(merged.notes).toBe("unchanged");
  });

  it("rolls back fully to before when nobody touched the card since our edit (current === after)", () => {
    const before = makeCard({ notes: "original" });
    const after = makeCard({ notes: "edited by us" });
    const current = makeCard({ notes: "edited by us" });

    const merged = invertTaskfoldCardMutation(before, after, current);

    expect(merged.notes).toBe("original");
  });

  it("pins id and revision to current's regardless of what the merge computed for other fields", () => {
    const before = makeCard({ notes: "original" });
    const after = makeCard({ notes: "edited by us" });
    const current = makeCard({ notes: "edited by us", id: "card-1", revision: 42, updatedAt: NOW + 5 });

    const merged = invertTaskfoldCardMutation(before, after, current);

    expect(merged.id).toBe(current.id);
    expect(merged.revision).toBe(current.revision);
  });

  it("drops a stable-id array entry this operation added, once it confirms nobody adopted it", () => {
    const before = makeCard({ metadata: { comments: [] } });
    const after = makeCard({ metadata: { comments: [comment("a", "added by us")] } });
    const current = makeCard({
      metadata: { comments: [comment("a", "added by us"), comment("b", "added by host")] },
    });

    const merged = invertTaskfoldCardMutation(before, after, current);

    expect(merged.metadata?.comments).toEqual([comment("b", "added by host")]);
  });

  it("restores a stable-id array entry this operation removed, in its original position, keeping a host addition", () => {
    const a = comment("a", "a");
    const b = comment("b", "b");
    const c = comment("c", "c");
    const d = comment("d", "added by host");
    const before = makeCard({ metadata: { comments: [a, b, c] } });
    const after = makeCard({ metadata: { comments: [a, c] } }); // we removed b
    const current = makeCard({ metadata: { comments: [a, c, d] } }); // host appended d meanwhile

    const merged = invertTaskfoldCardMutation(before, after, current);

    expect(merged.metadata?.comments).toEqual([a, b, c, d]);
  });

  it("gives up on a genuinely concurrently-edited array field without a stable id (labels) and keeps current, without restoring our own edit", () => {
    // This is the interesting, non-trivial case: current diverges from BOTH
    // before and after, so the merge can't take either cheap shortcut and has
    // to fall back to the array-diff path -- which requires every element to
    // carry a stable `id`. Plain strings never do, so rollbackValue's
    // hasOnlyStableIds guard fails and it silently returns `current` whole,
    // discarding this operation's own edit (removing "b") while keeping the
    // concurrent host edit (adding "c"). This is documented, accepted
    // behavior (需求/15.8-并发与补偿设计.md §4.4), not a bug: it is pinned here
    // so it is not "fixed" by accident later.
    const before = makeCard({ labels: ["a", "b"] });
    const after = makeCard({ labels: ["a"] }); // we removed "b"
    const current = makeCard({ labels: ["a", "b", "c"] }); // host added "c" concurrently

    const merged = invertTaskfoldCardMutation(before, after, current);

    expect(merged.labels).toEqual(["a", "b", "c"]);
  });

  it("gives up on a genuinely concurrently-edited diagnostics array (kind-keyed, no id) and keeps current -- harmless because diagnostics are derived and recomputed every dispatch pass", () => {
    const staleDiagnostic = {
      kind: "stranded_ready" as const,
      severity: "warning" as const,
      title: "Stale",
      detail: "detail",
      firstSeenAt: NOW,
      lastSeenAt: NOW,
      count: 1,
      actions: [],
    };
    const freshDiagnostic = {
      kind: "missing_proof" as const,
      severity: "warning" as const,
      title: "Fresh",
      detail: "detail",
      firstSeenAt: NOW + 1,
      lastSeenAt: NOW + 1,
      count: 1,
      actions: [],
    };
    const before = makeCard({ metadata: { diagnostics: [staleDiagnostic] } });
    const after = makeCard({ metadata: { diagnostics: [] } }); // we cleared it
    const current = makeCard({ metadata: { diagnostics: [freshDiagnostic] } }); // a later dispatch pass recomputed a different one

    const merged = invertTaskfoldCardMutation(before, after, current);

    expect(merged.metadata?.diagnostics).toEqual([freshDiagnostic]);
  });
});

describe("sameTaskfoldCardState", () => {
  it("treats two cards as the same state when only updatedAt and revision differ", () => {
    const left = makeCard({ notes: "same", updatedAt: 100, revision: 3 });
    const right = makeCard({ notes: "same", updatedAt: 200, revision: 9 });

    expect(sameTaskfoldCardState(left, right)).toBe(true);
  });

  it("still reports a real difference elsewhere on the card", () => {
    const left = makeCard({ notes: "a" });
    const right = makeCard({ notes: "b" });

    expect(sameTaskfoldCardState(left, right)).toBe(false);
  });
});

describe("invertTaskfoldWorkspaceMutation", () => {
  const scratchWorkspace: TaskfoldWorkspace = { kind: "scratch" };
  const materializedWorkspace: TaskfoldWorkspace = {
    kind: "worktree",
    path: "/tmp/worktree",
    branch: "taskfold/card-1",
    sourcePath: "/repo",
  };
  const hostWorkspace: TaskfoldWorkspace = { kind: "dir", path: "/host/edited" };

  it("rolls the workspace back to source when nobody touched it concurrently", () => {
    const before = makeCard({ metadata: { automation: { workspace: scratchWorkspace } } });
    const after = makeCard({ metadata: { automation: { workspace: materializedWorkspace } } });
    const current = makeCard({ metadata: { automation: { workspace: materializedWorkspace } } });

    const merged = invertTaskfoldWorkspaceMutation(before, after, current);

    expect(merged.metadata?.automation?.workspace).toEqual(scratchWorkspace);
  });

  it("lets a concurrent host edit to workspace win whole, instead of blending it with the rollback value", () => {
    const before = makeCard({ metadata: { automation: { workspace: scratchWorkspace } } });
    const after = makeCard({ metadata: { automation: { workspace: materializedWorkspace } } });
    const current = makeCard({
      metadata: { automation: { workspace: hostWorkspace, workspaceAccess: { unrestricted: true } } },
    });

    const merged = invertTaskfoldWorkspaceMutation(before, after, current);

    expect(merged.metadata?.automation?.workspace).toEqual(hostWorkspace);
    expect(merged.metadata?.automation?.workspaceAccess).toEqual({ unrestricted: true });
  });
});
