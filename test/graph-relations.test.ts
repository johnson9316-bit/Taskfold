import { describe, expect, it } from "vitest";
import type {
  PersistedTaskfoldAttachment, PersistedTaskfoldBoard, PersistedTaskfoldCard,
  PersistedTaskfoldMilestone, PersistedTaskfoldNotificationSubscription,
  PersistedTaskfoldProjectDocument,
} from "@taskfold/core/persistence-types.js";
import { TaskfoldStore } from "../packages/openclaw/src/backend/src/store.ts";
import { keyedStore } from "./helpers/memory-keyed-store.ts";

function store(): TaskfoldStore {
  return new TaskfoldStore(keyedStore<PersistedTaskfoldCard>(), {
    boards: keyedStore<PersistedTaskfoldBoard>(),
    milestones: keyedStore<PersistedTaskfoldMilestone>(),
    documents: keyedStore<PersistedTaskfoldProjectDocument>(),
    subscriptions: keyedStore<PersistedTaskfoldNotificationSubscription>(),
    attachments: keyedStore<PersistedTaskfoldAttachment>(),
  });
}

describe("graph relation editing", () => {
  it("creates and deletes reciprocal prerequisite links", async () => {
    const s = store();
    const source = await s.create({ title: "first" });
    const target = await s.create({ title: "second" });
    await s.createGraphRelation(source.id, target.id, "parent");
    expect((await s.get(source.id))?.metadata?.links).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "child", targetCardId: target.id }),
    ]));
    expect((await s.get(target.id))?.metadata?.links).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "parent", targetCardId: source.id }),
    ]));
    await s.deleteGraphRelation(source.id, target.id, "parent");
    expect((await s.get(source.id))?.metadata?.links?.some((link) => link.targetCardId === target.id)).toBeFalsy();
    expect((await s.get(target.id))?.metadata?.links?.some((link) => link.targetCardId === source.id)).toBeFalsy();
  });

  it("creates and deletes blockers and ordinary links without duplicates", async () => {
    const s = store();
    const source = await s.create({ title: "source" });
    const target = await s.create({ title: "target" });
    for (const type of ["blocks", "relates_to"] as const) {
      await s.createGraphRelation(source.id, target.id, type);
      await s.createGraphRelation(source.id, target.id, type);
      expect((await s.get(source.id))?.metadata?.links?.filter((link) => link.type === type && link.targetCardId === target.id)).toHaveLength(1);
      await s.deleteGraphRelation(source.id, target.id, type);
      expect((await s.get(source.id))?.metadata?.links?.some((link) => link.type === type && link.targetCardId === target.id)).toBeFalsy();
    }
  });

  it("rejects missing, self and cross-project targets", async () => {
    const s = store();
    const source = await s.create({ title: "source", boardId: "one" });
    const target = await s.create({ title: "target", boardId: "two" });
    await expect(s.createGraphRelation(source.id, source.id, "blocks")).rejects.toThrow("itself");
    await expect(s.createGraphRelation(source.id, "missing", "blocks")).rejects.toThrow("not found");
    await expect(s.createGraphRelation(source.id, target.id, "blocks")).rejects.toThrow("same project");
  });
});
