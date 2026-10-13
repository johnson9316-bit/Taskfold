import type { TaskfoldCard, TaskfoldEvent } from "@taskfold/core/contract/index.js";

export type TaskfoldTimelineEntry =
  | { type: "event"; id: string; at: number; event: TaskfoldEvent }
  | { type: "comment"; id: string; at: number; body: string };

/** 心跳与「评论已添加」事件不进历史：前者是噪音，后者与评论条目本身重复。 */
const HIDDEN_EVENT_KINDS: ReadonlySet<TaskfoldEvent["kind"]> = new Set(["heartbeat", "comment_added"]);

/** 评论与事件按时间倒序合并成一条时间线（最新在前）。 */
export function buildCardTimeline(card: TaskfoldCard): TaskfoldTimelineEntry[] {
  const entries: TaskfoldTimelineEntry[] = [
    ...(card.events ?? [])
      .filter((event) => !HIDDEN_EVENT_KINDS.has(event.kind))
      .map((event): TaskfoldTimelineEntry => ({ type: "event", id: event.id, at: event.at, event })),
    ...(card.metadata?.comments ?? []).map(
      (comment): TaskfoldTimelineEntry => ({ type: "comment", id: comment.id, at: comment.createdAt, body: comment.body }),
    ),
  ];
  return entries.toSorted((left, right) => right.at - left.at);
}

/** 评论列表：最新在前。 */
export function cardComments(card: TaskfoldCard) {
  return [...(card.metadata?.comments ?? [])].toSorted((left, right) => right.createdAt - left.createdAt);
}
