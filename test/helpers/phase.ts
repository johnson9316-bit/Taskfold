import type { TaskfoldCard } from "@taskfold/core/contract/index.js";
import { cardPhase, type TaskfoldCardPhase } from "@taskfold/core/card-phase.js";
import { UNCONFIGURED_STATUS_REGISTRY } from "@taskfold/core/status-registry.js";

/**
 * 测试里断言卡片"处在哪个阶段"（需求/22-状态模型）：`scheduled` / `ready` / `blocked` 不再是
 * 状态，而是由卡片标记推导出来的阶段，所以不要断言 `card.status === "ready"`。
 */
export function phaseOf(card: TaskfoldCard | undefined, now: number = Date.now()): TaskfoldCardPhase | undefined {
  return card ? cardPhase(card, UNCONFIGURED_STATUS_REGISTRY, now) : undefined;
}
