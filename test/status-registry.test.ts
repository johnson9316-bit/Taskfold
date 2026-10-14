import { describe, expect, it } from "vitest";
import {
  createStatusRegistry,
  DEFAULT_TASKFOLD_STATUSES,
  UNCONFIGURED_STATUS_REGISTRY,
  LEGACY_TASKFOLD_STATUSES,
  resolveStatusRegistry,
  TaskfoldStatusConfigError,
  validateStatusDefinitions,
} from "@taskfold/core/status-registry.js";
import { normalizeStatus } from "@taskfold/core/store-normalizers.js";

const valid = [
  { id: "todo", category: "unstarted" },
  { id: "doing", name: "进行中", category: "started", color: "#2563eb" },
  { id: "review", category: "started", role: "review" },
  { id: "done", category: "completed" },
];

describe("状态注册表", () => {
  it("默认集是 5 个，沿用旧 id", () => {
    expect(DEFAULT_TASKFOLD_STATUSES.map((status) => status.id)).toEqual([
      "todo",
      "running",
      "review",
      "done",
      "cancelled",
    ]);
    expect(() => validateStatusDefinitions(DEFAULT_TASKFOLD_STATUSES)).not.toThrow();
  });

  it("过渡默认集保留九个旧状态，新卡默认仍是 todo（而不是排在前面的 triage）", () => {
    expect(LEGACY_TASKFOLD_STATUSES.map((status) => status.id)).toEqual([
      "triage",
      "backlog",
      "todo",
      "scheduled",
      "ready",
      "running",
      "review",
      "blocked",
      "done",
    ]);
    expect(UNCONFIGURED_STATUS_REGISTRY.defaultStatus).toBe("todo");
    expect(resolveStatusRegistry().ids).toEqual(UNCONFIGURED_STATUS_REGISTRY.ids);
  });

  it("按类别与 role 查询", () => {
    const registry = createStatusRegistry(validateStatusDefinitions(valid));
    expect(registry.firstOf("started")).toBe("doing");
    expect(registry.firstOf("completed")).toBe("done");
    expect(registry.firstOf("cancelled")).toBeUndefined();
    expect(registry.withRole("review")).toBe("review");
    expect(registry.withRole("intake")).toBeUndefined();
    expect(registry.isTerminal("done")).toBe(true);
    expect(registry.isTerminal("doing")).toBe(false);
    expect(registry.category("nope")).toBeUndefined();
    expect(registry.rank("review")).toBe(2);
    expect(registry.rank("nope")).toBe(registry.list.length);
  });

  it("默认状态：显式 default 优先，其次是第一个非 intake 的 unstarted", () => {
    const withIntake = createStatusRegistry(
      validateStatusDefinitions([
        { id: "triage", category: "unstarted", role: "intake" },
        { id: "backlog", category: "unstarted" },
        { id: "todo", category: "unstarted" },
        { id: "done", category: "completed" },
      ]),
    );
    expect(withIntake.defaultStatus).toBe("backlog");
    const explicit = createStatusRegistry(
      validateStatusDefinitions([
        { id: "triage", category: "unstarted", role: "intake" },
        { id: "backlog", category: "unstarted" },
        { id: "todo", category: "unstarted", default: "true" },
        { id: "done", category: "completed" },
      ]),
    );
    expect(explicit.defaultStatus).toBe("todo");
  });

  it.each([
    ["空列表", [], /non-empty/],
    ["不是数组", {}, /non-empty/],
    ["id 非法", [{ id: "Bad Id", category: "unstarted" }, valid[3]], /id must match/],
    ["id 重复", [valid[0], valid[0], valid[3]], /duplicate status id "todo"/],
    ["类别非法", [{ id: "x", category: "doing" }, valid[0], valid[3]], /category must be one of/],
    ["role 非法", [{ ...valid[1], role: "boss" }, valid[0], valid[3]], /role must be one of/],
    ["role 重复", [{ ...valid[2] }, { id: "r2", category: "started", role: "review" }, valid[0], valid[3]], /more than one status/],
    ["缺 unstarted", [valid[1], valid[3]], /"unstarted" status is required/],
    ["缺 completed", [valid[0], valid[1]], /"completed" status is required/],
    ["name 为空", [{ ...valid[0], name: "  " }, valid[3]], /name must be/],
    ["颜色夹带样式", [{ ...valid[0], color: "red; background:url(x)" }, valid[3]], /color must be/],
    ["default 不在 unstarted", [valid[0], { ...valid[3], default: true }], /only allowed on an "unstarted"/],
    ["default 重复", [{ ...valid[0], default: true }, { id: "t2", category: "unstarted", default: true }, valid[3]], /only one status can be the default/],
  ])("拒绝不合法的配置：%s", (_label, input, message) => {
    expect(() => validateStatusDefinitions(input)).toThrow(TaskfoldStatusConfigError);
    expect(() => validateStatusDefinitions(input)).toThrow(message);
  });

  it("normalizeStatus 按注册表校验，错误信息列出该项目的状态", () => {
    const registry = createStatusRegistry(validateStatusDefinitions(valid));
    expect(normalizeStatus("doing", "todo", registry)).toBe("doing");
    expect(normalizeStatus(undefined, "todo", registry)).toBe("todo");
    expect(() => normalizeStatus("running", "todo", registry)).toThrow(
      "status must be one of: todo, doing, review, done.",
    );
    // 不传注册表用"未配置"默认集；已退役的 blocked 不再是状态（旧值由 updateCard 翻译成标记）。
    expect(normalizeStatus("backlog", "todo")).toBe("backlog");
    expect(() => normalizeStatus("blocked", "todo")).toThrow(
      "status must be one of: triage, backlog, todo, running, review, done, cancelled.",
    );
  });
});
