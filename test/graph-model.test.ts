import { describe, expect, it } from "vitest";
import type { TaskfoldCard, TaskfoldProjectView } from "@taskfold/core/contract/index.js";
import { buildGraphModel, type GraphFilter } from "../packages/ui/src/pages/projects/graph-model.ts";

const filter: GraphFilter = { query: "", milestoneId: "", status: "", tag: "", relation: "all", focusCardId: "" };
const labels = { requirements: "Requirements", noMilestone: "Unassigned", status: (value: string) => value };
function card(id: string, extra: Partial<TaskfoldCard> = {}): TaskfoldCard {
  return { id, title: id, status: "todo", priority: "normal", labels: [], position: 1, createdAt: 1, updatedAt: 1, revision: 1, ...extra };
}
function project(cards: TaskfoldCard[]): TaskfoldProjectView {
  return { board: { id: "project", name: "Project", position: 1, createdAt: 1, updatedAt: 1, boardView: { groupBy: "milestone", sortBy: "manual", sortDirection: "asc" } }, milestones: [], cards } as TaskfoldProjectView;
}

describe("graph model", () => {
  it("shows isolated cards in the flow without artificial relation edges", () => {
    const model = buildGraphModel(project([card("a"), card("b")]), "flow", filter, labels);
    expect(model.nodes.map((node) => node.id)).toEqual(["a", "b"]);
    expect(model.edges).toHaveLength(0);
  });

  it("keeps hierarchy separate from prerequisite, blocker and related edges", () => {
    const requirement = card("req", { kind: "requirement" });
    const a = card("a", { metadata: { links: [
      { id: "hierarchy", type: "contained_by", targetCardId: "req", createdAt: 1 },
      { id: "dependency", type: "child", targetCardId: "b", createdAt: 1 },
      { id: "blocker", type: "blocks", targetCardId: "b", createdAt: 1 },
      { id: "related", type: "relates_to", targetCardId: "b", createdAt: 1 },
    ] } });
    const model = buildGraphModel(project([requirement, a, card("b")]), "flow", filter, labels);
    expect(model.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "a", target: "b", relation: "parent" }),
      expect.objectContaining({ source: "a", target: "b", relation: "blocks" }),
      expect.objectContaining({ source: "a", target: "b", relation: "relates_to" }),
    ]));
    expect(model.edges.some((edge) => edge.relation === "contains")).toBe(false);
    expect(buildGraphModel(project([requirement, a, card("b")]), "mindmap", filter, labels).edges.every((edge) => edge.relation === "contains")).toBe(true);
  });

  it("filters and focuses without changing project data", () => {
    const cards = [card("a", { labels: ["one"] }), card("b", { labels: ["two"], metadata: { links: [{ id: "r", type: "relates_to", targetCardId: "a", createdAt: 1 }] } }), card("c")];
    expect(buildGraphModel(project(cards), "flow", { ...filter, tag: "one" }, labels).nodes.some((node) => node.id === "b")).toBe(false);
    const focused = buildGraphModel(project(cards), "flow", { ...filter, focusCardId: "a" }, labels);
    expect(focused.nodes.map((node) => node.id)).toContain("b");
    expect(focused.nodes.map((node) => node.id)).not.toContain("c");
    expect(cards).toHaveLength(3);
  });
});
