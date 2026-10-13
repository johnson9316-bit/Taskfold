import { describe, expect, it } from "vitest";
import type { TaskfoldCard } from "@taskfold/core/contract/index.js";
import { buildCardTimeline, cardComments } from "../packages/ui/src/lib/card-timeline.ts";

function card(extra: Partial<TaskfoldCard>): TaskfoldCard {
  return { id: "c", title: "c", status: "todo", priority: "normal", labels: [], position: 1, createdAt: 1, updatedAt: 1, revision: 1, ...extra };
}

describe("card timeline", () => {
  it("merges events and comments newest first, dropping heartbeats and duplicate comment events", () => {
    const timeline = buildCardTimeline(
      card({
        events: [
          { id: "e1", kind: "created", at: 10 },
          { id: "e2", kind: "heartbeat", at: 20 },
          { id: "e3", kind: "moved", at: 30, fromStatus: "todo", toStatus: "done" },
          { id: "e4", kind: "comment_added", at: 40 },
        ],
        metadata: { comments: [{ id: "k1", body: "hi", createdAt: 40 }] },
      }),
    );
    expect(timeline.map((entry) => entry.id)).toEqual(["k1", "e3", "e1"]);
  });

  it("returns nothing for a card without events or comments", () => {
    expect(buildCardTimeline(card({}))).toEqual([]);
    expect(cardComments(card({}))).toEqual([]);
  });

  it("lists comments newest first", () => {
    const comments = cardComments(
      card({ metadata: { comments: [{ id: "a", body: "a", createdAt: 1 }, { id: "b", body: "b", createdAt: 2 }] } }),
    );
    expect(comments.map((comment) => comment.id)).toEqual(["b", "a"]);
  });
});
