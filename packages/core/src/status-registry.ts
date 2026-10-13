// Taskfold core：状态注册表（需求/22-状态模型）。纯函数，无 IO。
//
// 状态的类别固定为 unstarted / started / completed / cancelled，状态 id 与显示名由项目在
// `.taskfold/config.yml` 的 `statuses` 里定义（读写见 file-store-statuses.ts）。引擎一律经本模块
// 取状态，不再写状态字面量：
//   - 开始执行 → `firstOf("started")`；完成 → `firstOf("completed")`；新卡默认 → `firstOf("unstarted")`
//   - run 结束待评审 → `withRole("review")`；自动拆解 / specify 入口 → `withRole("intake")`
import {
  TASKFOLD_STATUS_CATEGORIES,
  TASKFOLD_STATUS_ROLES,
  type TaskfoldStatus,
  type TaskfoldStatusCategory,
  type TaskfoldStatusDefinition,
  type TaskfoldStatusRole,
} from "./contract/index.js";

/** 状态 id：小写字母、数字、下划线、连字符，首字符为字母或数字。 */
export const TASKFOLD_STATUS_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;
export const TASKFOLD_STATUS_NAME_MAX_LENGTH = 40;
export const TASKFOLD_STATUS_MAX_COUNT = 24;

/** 新项目与未配置 `statuses` 的 v4 项目的默认状态集；沿用既有 id，旧卡文件不用重写。 */
export const DEFAULT_TASKFOLD_STATUSES: readonly TaskfoldStatusDefinition[] = Object.freeze([
  { id: "todo", category: "unstarted" },
  { id: "running", category: "started" },
  { id: "review", category: "started", role: "review" },
  { id: "done", category: "completed" },
  { id: "cancelled", category: "cancelled" },
]);

/**
 * 改造前的九个固定状态及其类别。仅在 `statuses` 尚未配置、也未迁移的项目里作为过渡默认集，让
 * 引擎在迁移完成之前仍接受旧值（需求/22 第 3 步迁移后即不再使用）。`scheduled` / `ready` /
 * `blocked` 是系统内部状态，读取时会被映射成 todo / running 加卡片标记（见 status-legacy.ts）。
 */
export const LEGACY_TASKFOLD_STATUSES: readonly TaskfoldStatusDefinition[] = Object.freeze([
  { id: "triage", category: "unstarted", role: "intake" },
  { id: "backlog", category: "unstarted" },
  { id: "todo", category: "unstarted", default: true },
  { id: "scheduled", category: "unstarted" },
  { id: "ready", category: "unstarted" },
  { id: "running", category: "started" },
  { id: "review", category: "started", role: "review" },
  { id: "blocked", category: "started" },
  { id: "done", category: "completed" },
]);

/** 状态配置不合法（`config.yml` 手改坏了，或保存的状态列表违反约束）。 */
export class TaskfoldStatusConfigError extends Error {
  constructor(message: string) {
    super(`taskfold statuses: ${message}`);
    this.name = "TaskfoldStatusConfigError";
  }
}

/**
 * 校验并规范化一份状态列表，违反约束就抛 {@link TaskfoldStatusConfigError}：
 * id 合法且唯一、类别合法、role 合法且每种至多一个、数量上限，以及至少一个 `unstarted`
 * 与一个 `completed`（否则新卡没有落点、也无法完成）。顺序原样保留。
 */
export function validateStatusDefinitions(input: unknown): TaskfoldStatusDefinition[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new TaskfoldStatusConfigError("must be a non-empty list.");
  }
  if (input.length > TASKFOLD_STATUS_MAX_COUNT) {
    throw new TaskfoldStatusConfigError(`at most ${TASKFOLD_STATUS_MAX_COUNT} statuses are allowed.`);
  }
  const seenIds = new Set<string>();
  const seenRoles = new Set<TaskfoldStatusRole>();
  let seenDefault = false;
  const result: TaskfoldStatusDefinition[] = [];
  for (const [index, raw] of input.entries()) {
    const where = `statuses[${index}]`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new TaskfoldStatusConfigError(`${where} must be an object.`);
    }
    const record = raw as Record<string, unknown>;
    const id = record.id;
    if (typeof id !== "string" || !TASKFOLD_STATUS_ID_PATTERN.test(id)) {
      throw new TaskfoldStatusConfigError(
        `${where}.id must match ${TASKFOLD_STATUS_ID_PATTERN} (lowercase letters, digits, "_" or "-").`,
      );
    }
    if (seenIds.has(id)) {
      throw new TaskfoldStatusConfigError(`duplicate status id "${id}".`);
    }
    seenIds.add(id);
    const category = record.category;
    if (!(TASKFOLD_STATUS_CATEGORIES as readonly unknown[]).includes(category)) {
      throw new TaskfoldStatusConfigError(
        `${where}.category must be one of: ${TASKFOLD_STATUS_CATEGORIES.join(", ")}.`,
      );
    }
    const definition: TaskfoldStatusDefinition = {
      id,
      category: category as TaskfoldStatusCategory,
    };
    if (record.name !== undefined) {
      const name = typeof record.name === "string" ? record.name.trim() : "";
      if (!name || name.length > TASKFOLD_STATUS_NAME_MAX_LENGTH) {
        throw new TaskfoldStatusConfigError(
          `${where}.name must be 1-${TASKFOLD_STATUS_NAME_MAX_LENGTH} characters.`,
        );
      }
      definition.name = name;
    }
    if (record.color !== undefined) {
      const color = typeof record.color === "string" ? record.color.trim() : "";
      // 颜色会写进 CSS：只收 #hex 与 CSS 命名色，拒绝 url()、分号等能夹带样式的内容。
      if (!/^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20})$/.test(color)) {
        throw new TaskfoldStatusConfigError(`${where}.color must be a #hex value or a CSS color name.`);
      }
      definition.color = color;
    }
    if (record.role !== undefined) {
      const role = record.role;
      if (!(TASKFOLD_STATUS_ROLES as readonly unknown[]).includes(role)) {
        throw new TaskfoldStatusConfigError(`${where}.role must be one of: ${TASKFOLD_STATUS_ROLES.join(", ")}.`);
      }
      if (seenRoles.has(role as TaskfoldStatusRole)) {
        throw new TaskfoldStatusConfigError(`role "${String(role)}" is assigned to more than one status.`);
      }
      seenRoles.add(role as TaskfoldStatusRole);
      definition.role = role as TaskfoldStatusRole;
    }
    if (record.default !== undefined && record.default !== false && record.default !== "false") {
      if (record.default !== true && record.default !== "true") {
        throw new TaskfoldStatusConfigError(`${where}.default must be true or false.`);
      }
      if (definition.category !== "unstarted") {
        throw new TaskfoldStatusConfigError(`${where}.default is only allowed on an "unstarted" status.`);
      }
      if (seenDefault) {
        throw new TaskfoldStatusConfigError("only one status can be the default.");
      }
      seenDefault = true;
      definition.default = true;
    }
    result.push(definition);
  }
  for (const required of ["unstarted", "completed"] as const) {
    if (!result.some((status) => status.category === required)) {
      throw new TaskfoldStatusConfigError(`at least one "${required}" status is required.`);
    }
  }
  return result;
}

/** 某个项目当前生效的状态集及其查询。 */
export type TaskfoldStatusRegistry = {
  /** 按看板列顺序排列的状态。 */
  readonly list: readonly TaskfoldStatusDefinition[];
  readonly ids: readonly TaskfoldStatus[];
  has(id: string): boolean;
  get(id: string): TaskfoldStatusDefinition | undefined;
  category(id: string): TaskfoldStatusCategory | undefined;
  /** 该类别在列表里的第一个状态。 */
  firstOf(category: TaskfoldStatusCategory): TaskfoldStatus | undefined;
  /** 带某个 role 的状态。 */
  withRole(role: TaskfoldStatusRole): TaskfoldStatus | undefined;
  isUnstarted(id: string): boolean;
  isStarted(id: string): boolean;
  isCompleted(id: string): boolean;
  isCancelled(id: string): boolean;
  /** 已结束：completed 或 cancelled（TAPD 的"结束状态"）。 */
  isTerminal(id: string): boolean;
  /** 在列表里的下标，未知 id 排在最后；用于按看板列顺序给卡排序。 */
  rank(id: string): number;
  /** 新建卡片的默认状态（总是一个 unstarted 状态）。 */
  readonly defaultStatus: TaskfoldStatus;
};

export function createStatusRegistry(definitions: readonly TaskfoldStatusDefinition[]): TaskfoldStatusRegistry {
  const list = Object.freeze([...definitions]);
  const byId = new Map(list.map((definition) => [definition.id, definition]));
  const category = (id: string) => byId.get(id)?.category;
  const unstarted = list.filter((definition) => definition.category === "unstarted");
  const defaultStatus = (
    unstarted.find((definition) => definition.default) ??
    unstarted.find((definition) => definition.role !== "intake") ??
    unstarted[0]
  )?.id;
  if (defaultStatus === undefined) {
    throw new TaskfoldStatusConfigError('at least one "unstarted" status is required.');
  }
  return {
    defaultStatus,
    list,
    ids: Object.freeze(list.map((definition) => definition.id)),
    has: (id) => byId.has(id),
    get: (id) => byId.get(id),
    category,
    firstOf: (wanted) => list.find((definition) => definition.category === wanted)?.id,
    withRole: (role) => list.find((definition) => definition.role === role)?.id,
    isUnstarted: (id) => category(id) === "unstarted",
    isStarted: (id) => category(id) === "started",
    isCompleted: (id) => category(id) === "completed",
    isCancelled: (id) => category(id) === "cancelled",
    isTerminal: (id) => {
      const value = category(id);
      return value === "completed" || value === "cancelled";
    },
    rank: (id) => {
      const index = list.findIndex((definition) => definition.id === id);
      return index === -1 ? list.length : index;
    },
  };
}

/**
 * 解析项目生效的注册表：配置了 `statuses` 就用它，没配置用过渡默认集（九个旧状态）。
 * 迁移到格式版本 4 之后（需求/22 第 3 步）"没配置"改为 {@link DEFAULT_TASKFOLD_STATUSES}。
 */
export function resolveStatusRegistry(
  configured?: readonly TaskfoldStatusDefinition[] | undefined,
): TaskfoldStatusRegistry {
  return createStatusRegistry(configured ?? LEGACY_TASKFOLD_STATUSES);
}

/** 过渡默认集的注册表（单例，没有项目上下文的纯函数用它兜底）。 */
export const LEGACY_STATUS_REGISTRY: TaskfoldStatusRegistry = createStatusRegistry(LEGACY_TASKFOLD_STATUSES);
