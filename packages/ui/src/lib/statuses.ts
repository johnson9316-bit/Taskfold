// 看板前端的状态辅助（需求/22-状态模型）：项目的状态定义由后端给出（`project.statuses`），列、下拉、
// 置灰、标签都从它来，不再有写死的状态清单。纯函数，不碰 DOM。
import { cardPhase, phasePatch, type TaskfoldCardPhase } from "@taskfold/core/card-phase.js";
import type { TaskfoldCard, TaskfoldStatusDefinition } from "@taskfold/core/contract/index.js";
import {
  createStatusRegistry,
  isRetiredTaskfoldStatusId,
  UNCONFIGURED_STATUS_REGISTRY,
  type TaskfoldStatusRegistry,
} from "@taskfold/core/status-registry.js";

const registries = new WeakMap<readonly TaskfoldStatusDefinition[], TaskfoldStatusRegistry>();

/** 项目的状态注册表；后端没给（旧后端）或给了空列表时用"未配置"默认集。 */
export function statusRegistryOf(
  project: { statuses?: readonly TaskfoldStatusDefinition[] } | null | undefined,
): TaskfoldStatusRegistry {
  const statuses = project?.statuses;
  if (!statuses || statuses.length === 0) {
    return UNCONFIGURED_STATUS_REGISTRY;
  }
  let registry = registries.get(statuses);
  if (!registry) {
    registry = createStatusRegistry(statuses);
    registries.set(statuses, registry);
  }
  return registry;
}

/**
 * 状态的显示名：项目自己起的名字优先，其次是内置 id 的译名，最后是 id 本身。`translate` 在 key 缺失时
 * 原样返回 key（见 i18n），据此判断有没有译名。
 */
export function statusLabel(
  id: string,
  registry: TaskfoldStatusRegistry,
  translate: (key: string) => string,
): string {
  const name = registry.get(id)?.name;
  return name ? name : defaultStatusLabel(id, translate);
}

/** 内置 id 的默认译名（不看项目有没有改名）；没有译名就是 id。状态设置页的输入框占位符用它。 */
export function defaultStatusLabel(id: string, translate: (key: string) => string): string {
  const key = `taskfoldProject.statusDefault.${id}`;
  const text = translate(key);
  return text !== key ? text : id;
}

/**
 * 卡片在状态列里该放哪一列。磁盘上还没迁移的旧卡可能写着已退役的 ready / scheduled / blocked，它们按
 * 迁移时的归宿显示（待办 / 待办 / 进行中），否则看板上会凭空消失。其余原样返回。
 */
export function displayStatusId(card: TaskfoldCard, registry: TaskfoldStatusRegistry): string {
  if (isRetiredTaskfoldStatusId(card.status) && !registry.has(card.status)) {
    return phasePatch(card, cardPhase(card, registry), registry).status;
  }
  return card.status;
}

export type TaskfoldStatusColumn = {
  id: string;
  definition?: TaskfoldStatusDefinition;
  /** 卡片的状态不在项目状态集里（数据被手改过）：单独列一列，别让卡消失。 */
  orphan?: boolean;
};

/** 状态视图的列：项目状态按看板顺序，外加出现在卡片上却不在状态集里的 id。 */
export function boardStatusColumns(
  registry: TaskfoldStatusRegistry,
  cards: readonly TaskfoldCard[],
): TaskfoldStatusColumn[] {
  const columns: TaskfoldStatusColumn[] = registry.list.map((definition) => ({ id: definition.id, definition }));
  const known = new Set(registry.ids);
  for (const card of cards) {
    const id = displayStatusId(card, registry);
    if (!known.has(id)) {
      known.add(id);
      columns.push({ id, orphan: true });
    }
  }
  return columns;
}

/** 已完成或已取消：看板上置灰、不再算"待处理"。 */
export function isFinishedCard(card: TaskfoldCard, registry: TaskfoldStatusRegistry): boolean {
  return registry.isTerminal(displayStatusId(card, registry));
}

/** 已完成（勾选框的状态）。 */
export function isCompletedCard(card: TaskfoldCard, registry: TaskfoldStatusRegistry): boolean {
  return registry.isCompleted(displayStatusId(card, registry));
}

export type TaskfoldCardMark = "blocked" | "ready" | "scheduled";

/** 卡片上要显示的标记：阻塞、已派发、定时未到（它们不是状态，只能从阶段看出来）。 */
export function cardMark(
  card: TaskfoldCard,
  registry: TaskfoldStatusRegistry,
  now: number = Date.now(),
): TaskfoldCardMark | undefined {
  const phase: TaskfoldCardPhase = cardPhase(card, registry, now);
  return phase === "blocked" || phase === "ready" || phase === "scheduled" ? phase : undefined;
}

/** 拖到某一列 / 勾选时的目标状态：已完成取第一个完成类状态，取消勾选退回项目默认的未开始状态。 */
export function checkedStatusFor(registry: TaskfoldStatusRegistry, checked: boolean): string {
  return checked ? (registry.firstOf("completed") ?? registry.defaultStatus) : registry.defaultStatus;
}
