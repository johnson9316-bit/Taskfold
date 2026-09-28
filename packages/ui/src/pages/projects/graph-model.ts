import type {
  TaskfoldCard,
  TaskfoldLinkType,
  TaskfoldProjectView,
  TaskfoldStatus,
} from "@taskfold/core/contract/index.js";

export type GraphMode = "mindmap" | "flow";
export type GraphRelation = "contains" | "parent" | "blocks" | "relates_to";
export type GraphNode = {
  id: string;
  title: string;
  kind: "project" | "group" | "requirement" | "card";
  cardId?: string;
  status?: TaskfoldStatus;
  statusLabel?: string;
  priority?: string;
  childCount: number;
};
export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  relation: GraphRelation;
};
export type GraphModel = { nodes: GraphNode[]; edges: GraphEdge[]; totalCards: number; truncated: boolean };
export type GraphFilter = {
  query: string;
  milestoneId: string;
  status: string;
  tag: string;
  relation: "all" | GraphRelation;
  focusCardId: string;
};

const MAX_CARDS = 200;

function requirementId(card: TaskfoldCard): string | undefined {
  return card.metadata?.links?.find((link) => link.type === "contained_by")?.targetCardId;
}

function relationFor(type: TaskfoldLinkType): GraphRelation | null {
  if (type === "parent" || type === "child") return "parent";
  if (type === "blocks" || type === "blocked_by") return "blocks";
  if (type === "relates_to") return "relates_to";
  return null;
}

export function buildGraphModel(
  project: TaskfoldProjectView,
  mode: GraphMode,
  filter: GraphFilter,
  labels: { requirements: string; noMilestone: string; status: (value: string) => string },
): GraphModel {
  const visible = project.cards.filter((card) =>
    !card.metadata?.archivedAt &&
    (!filter.query || card.title.toLocaleLowerCase().includes(filter.query.toLocaleLowerCase())) &&
    (!filter.milestoneId || card.milestoneId === filter.milestoneId) &&
    (!filter.status || card.status === filter.status) &&
    (!filter.tag || card.labels?.includes(filter.tag)),
  );
  const cards = visible.slice(0, MAX_CARDS);
  const byId = new Map(cards.map((card) => [card.id, card]));
  const parentByChild = new Map(cards.map((card) => [card.id, requirementId(card)]));
  const related = new Set<string>();
  if (filter.focusCardId && byId.has(filter.focusCardId)) {
    related.add(filter.focusCardId);
    for (const card of cards) {
      if (card.id === filter.focusCardId || parentByChild.get(card.id) === filter.focusCardId ||
        parentByChild.get(filter.focusCardId) === card.id ||
        card.metadata?.links?.some((link) => link.targetCardId === filter.focusCardId) ||
        byId.get(filter.focusCardId)?.metadata?.links?.some((link) => link.targetCardId === card.id)) {
        related.add(card.id);
      }
    }
  }
  const focused = related.size ? cards.filter((card) => related.has(card.id)) : cards;
  const selected = new Map(focused.map((card) => [card.id, card]));
  const nodes: GraphNode[] = mode === "mindmap"
    ? [{ id: "project", title: project.board.name || project.board.id, kind: "project", childCount: focused.length }]
    : [];
  const edges: GraphEdge[] = [];
  const groups = new Map<string, string>();
  const groupBy = project.board.boardView?.groupBy ?? "milestone";
  const groupFor = (card: TaskfoldCard): { id: string; title: string } => {
    if (groupBy === "status") return { id: `status:${card.status}`, title: labels.status(card.status) };
    if (groupBy === "requirement") return { id: "group:requirements", title: labels.requirements };
    const milestone = project.milestones.find((entry) => entry.id === card.milestoneId);
    return milestone
      ? { id: `milestone:${milestone.id}`, title: milestone.title }
      : { id: "milestone:none", title: labels.noMilestone };
  };
  for (const card of focused) {
    if (mode === "mindmap") {
      const group = groupFor(card);
      if (!groups.has(group.id)) {
        groups.set(group.id, group.title);
        nodes.push({ id: group.id, title: group.title, kind: "group", childCount: 0 });
        edges.push({ id: `project:${group.id}`, source: "project", target: group.id, relation: "contains" });
      }
      const groupNode = nodes.find((node) => node.id === group.id);
      if (groupNode) groupNode.childCount += 1;
      const parent = parentByChild.get(card.id);
      const source = parent && selected.has(parent) ? parent : group.id;
      edges.push({ id: `hierarchy:${card.id}`, source, target: card.id, relation: "contains" });
    }
    nodes.push({
      id: card.id,
      cardId: card.id,
      title: card.title,
      kind: card.kind === "requirement" ? "requirement" : "card",
      status: card.status,
      statusLabel: labels.status(card.status),
      priority: card.priority,
      childCount: focused.filter((child) => parentByChild.get(child.id) === card.id).length,
    });
  }
  if (mode === "flow") {
    const seen = new Set<string>();
    for (const card of focused) {
      for (const link of card.metadata?.links ?? []) {
        const relation = relationFor(link.type);
        if (!relation || (filter.relation !== "all" && filter.relation !== relation) ||
          !link.targetCardId || !selected.has(link.targetCardId)) continue;
        const source = link.type === "parent" || link.type === "blocked_by" ? link.targetCardId : card.id;
        const target = source === card.id ? link.targetCardId : card.id;
        const key = relation === "relates_to"
          ? `${relation}:${[source, target].sort().join(":")}`
          : `${relation}:${source}:${target}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({ id: key, source, target, relation });
      }
    }
  }
  return { nodes, edges, totalCards: visible.length, truncated: visible.length > MAX_CARDS };
}
