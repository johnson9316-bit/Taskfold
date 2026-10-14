// Taskfold core：卡片阶段（需求/22-状态模型）。纯函数，无 IO。
//
// 项目的状态（`todo`、`running`、自定义的"测试中"……）只有类别与少量 role 是引擎认得的。引擎真正
// 关心的"这张卡现在处在工作流的哪个阶段"，由 状态的类别 + role + 卡片标记（阻塞、派发、定时）
// 推导出来，而不是让引擎去比较状态名：
//
//   triage     未开始，在 intake 状态里（等待自动拆解 / specify）
//   todo       未开始
//   scheduled  未开始，定时还没到（`automation.scheduledAt > now`）
//   ready      未开始，带派发标记：调度器可以拾取
//   running    进行中（类别 started，且不是 review role）
//   review     进行中的评审状态（role = review）
//   blocked    带阻塞标记（在任何未结束的状态里）
//   done       类别 completed
//   cancelled  类别 cancelled
//
// 反方向 {@link phasePatch} 把一个目标阶段翻译成要写进卡片的 `status` 与标记，所以引擎各处都写
// `phasePatch(card, "running", registry)`，不再写 `status: "running"`。
//
// 读取兼容：磁盘上还没迁移的旧卡可能写着 `status: ready / scheduled / blocked`（已退役的内部状态），
// {@link cardPhase} 按旧含义解释它们；写入一律写成新表示。
import type { TaskfoldBlockedState, TaskfoldCard, TaskfoldStatus } from "./contract/index.js";
import { isRetiredTaskfoldStatusId, type TaskfoldStatusRegistry } from "./status-registry.js";

export const TASKFOLD_CARD_PHASES = [
  "triage",
  "todo",
  "scheduled",
  "ready",
  "running",
  "review",
  "blocked",
  "done",
  "cancelled",
] as const;
export type TaskfoldCardPhase = (typeof TASKFOLD_CARD_PHASES)[number];

type PhaseCard = Pick<TaskfoldCard, "status" | "metadata">;

/** 这张卡当前所处的阶段。`now` 只影响"定时还没到"的判断。 */
export function cardPhase(card: PhaseCard, registry: TaskfoldStatusRegistry, now: number = Date.now()): TaskfoldCardPhase {
  const status = card.status;
  if (registry.isCompleted(status)) return "done";
  if (registry.isCancelled(status)) return "cancelled";
  if (status === "blocked" || card.metadata?.blocked) return "blocked";
  if (status === "scheduled") return "scheduled";
  if (status === "ready") return "ready";
  if (registry.isStarted(status)) {
    return registry.get(status)?.role === "review" ? "review" : "running";
  }
  const scheduledAt = card.metadata?.automation?.scheduledAt;
  if (scheduledAt && scheduledAt > now) return "scheduled";
  if (card.metadata?.dispatchReady) return "ready";
  if (registry.get(status)?.role === "intake") return "triage";
  return "todo";
}

/** 已结束：完成或取消。 */
export function isTerminalCard(card: PhaseCard, registry: TaskfoldStatusRegistry): boolean {
  return registry.isTerminal(card.status);
}

/** 未开始类别（含退役的 scheduled / ready）。 */
export function isUnstartedCard(card: PhaseCard, registry: TaskfoldStatusRegistry): boolean {
  return registry.isUnstarted(card.status);
}

export function isBlockedCard(card: PhaseCard): boolean {
  return card.status === "blocked" || Boolean(card.metadata?.blocked);
}

/** 带派发标记（或旧的 `ready` 状态）。 */
export function isDispatchReadyCard(card: PhaseCard): boolean {
  return card.status === "ready" || card.metadata?.dispatchReady === true;
}

/**
 * 依赖链路里能被自动推进的卡：未开始、没被阻塞。对应旧的 triage / backlog / todo / scheduled / ready
 * （blocked 当时是独立状态，不在其中）。
 */
export function isDependencyPromotableCard(card: PhaseCard, registry: TaskfoldStatusRegistry): boolean {
  return registry.isUnstarted(card.status) && !isBlockedCard(card);
}

/** 认领后可以自动进入进行中的阶段（对应旧的 backlog / todo / ready；triage 与 scheduled 不行）。 */
export function isStartablePhase(phase: TaskfoldCardPhase): boolean {
  return phase === "todo" || phase === "ready";
}

/** "进行中"落点：第一个 started 且不是 review role 的状态，没有就退到第一个 started。 */
export function activeStatusOf(registry: TaskfoldStatusRegistry): TaskfoldStatus | undefined {
  return (
    registry.list.find((status) => status.category === "started" && status.role !== "review")?.id ??
    registry.firstOf("started")
  );
}

export type TaskfoldPhaseFlags = {
  /** 键存在即覆盖：`undefined` 表示清除。 */
  blocked: TaskfoldBlockedState | undefined;
  dispatchReady: true | undefined;
};

export type TaskfoldPhasePatch = {
  status: TaskfoldStatus;
  /** 展开进 `metadata` 补丁里，例如 `metadata: { ...latest.metadata, ...patch.flags }`。 */
  flags: TaskfoldPhaseFlags;
};

/**
 * 把一个目标阶段翻译成要写进卡片的 `status` 与标记。目标阶段在项目里找不到落点（比如要取消、
 * 项目却没有 cancelled 状态）时抛错，而不是悄悄写一个不存在的状态。
 */
export function phasePatch(
  card: PhaseCard,
  phase: TaskfoldCardPhase,
  registry: TaskfoldStatusRegistry,
  options: { reason?: string; now?: number } = {},
): TaskfoldPhasePatch {
  const now = options.now ?? Date.now();
  const keepUnstarted = (): TaskfoldStatus =>
    registry.has(card.status) && registry.isUnstarted(card.status) ? card.status : registry.defaultStatus;
  const need = (status: TaskfoldStatus | undefined, what: string): TaskfoldStatus => {
    if (status === undefined) {
      throw new Error(`this project has no status for "${what}"; add one in the project's statuses.`);
    }
    return status;
  };
  const cleared: TaskfoldPhaseFlags = { blocked: undefined, dispatchReady: undefined };
  switch (phase) {
    case "triage":
      return { status: registry.withRole("intake") ?? registry.defaultStatus, flags: cleared };
    case "todo":
    case "scheduled":
      return { status: keepUnstarted(), flags: cleared };
    case "ready":
      return { status: keepUnstarted(), flags: { ...cleared, dispatchReady: true } };
    case "running":
      return { status: need(activeStatusOf(registry), "running"), flags: cleared };
    case "review":
      return {
        status: need(registry.withRole("review") ?? activeStatusOf(registry), "review"),
        flags: cleared,
      };
    case "blocked": {
      // 阻塞的卡留在原来的状态里；旧的内部状态（blocked / ready / scheduled）要换成真实状态。
      let status = card.status;
      if (isRetiredTaskfoldStatusId(status) || !registry.has(status)) {
        status = registry.isStarted(card.status) ? need(activeStatusOf(registry), "running") : registry.defaultStatus;
      }
      const reason = options.reason?.trim();
      return {
        status,
        flags: { blocked: { at: now, ...(reason ? { reason } : {}) }, dispatchReady: undefined },
      };
    }
    case "done":
      return { status: need(registry.firstOf("completed"), "done"), flags: cleared };
    case "cancelled":
      return { status: need(registry.firstOf("cancelled"), "cancelled"), flags: cleared };
  }
}
