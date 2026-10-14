import { describe, expect, it } from "vitest";
import type { TaskfoldCard } from "@taskfold/core/contract/index.js";
import {
  activeStatusOf,
  cardPhase,
  isBlockedCard,
  isDependencyPromotableCard,
  isDispatchReadyCard,
  isStartablePhase,
  phasePatch,
} from "@taskfold/core/card-phase.js";
import {
  createStatusRegistry,
  UNCONFIGURED_STATUS_REGISTRY,
  validateStatusDefinitions,
} from "@taskfold/core/status-registry.js";

const NOW = 1_800_000_000_000;
const custom = createStatusRegistry(
  validateStatusDefinitions([
    { id: "idea", category: "unstarted", role: "intake" },
    { id: "next", category: "unstarted", default: true },
    { id: "dev", name: "开发中", category: "started" },
    { id: "qa", name: "测试中", category: "started", role: "review" },
    { id: "shipped", category: "completed" },
    { id: "dropped", category: "cancelled" },
  ]),
);

function card(status: string, metadata: TaskfoldCard["metadata"] = {}): Pick<TaskfoldCard, "status" | "metadata"> {
  return { status, metadata };
}

describe("cardPhase：由类别、role 与标记推导阶段", () => {
  it("按类别与 role 归类", () => {
    expect(cardPhase(card("todo"), UNCONFIGURED_STATUS_REGISTRY, NOW)).toBe("todo");
    expect(cardPhase(card("backlog"), UNCONFIGURED_STATUS_REGISTRY, NOW)).toBe("todo");
    expect(cardPhase(card("triage"), UNCONFIGURED_STATUS_REGISTRY, NOW)).toBe("triage");
    expect(cardPhase(card("running"), UNCONFIGURED_STATUS_REGISTRY, NOW)).toBe("running");
    expect(cardPhase(card("review"), UNCONFIGURED_STATUS_REGISTRY, NOW)).toBe("review");
    expect(cardPhase(card("done"), UNCONFIGURED_STATUS_REGISTRY, NOW)).toBe("done");
    expect(cardPhase(card("cancelled"), UNCONFIGURED_STATUS_REGISTRY, NOW)).toBe("cancelled");
  });

  it("自定义状态按类别与 role 归类，状态名不影响阶段", () => {
    expect(cardPhase(card("idea"), custom, NOW)).toBe("triage");
    expect(cardPhase(card("next"), custom, NOW)).toBe("todo");
    expect(cardPhase(card("dev"), custom, NOW)).toBe("running");
    expect(cardPhase(card("qa"), custom, NOW)).toBe("review");
    expect(cardPhase(card("shipped"), custom, NOW)).toBe("done");
    expect(cardPhase(card("dropped"), custom, NOW)).toBe("cancelled");
  });

  it("标记：派发 → ready，阻塞 → blocked（在任何未结束状态里）", () => {
    expect(cardPhase(card("next", { dispatchReady: true }), custom, NOW)).toBe("ready");
    expect(cardPhase(card("idea", { dispatchReady: true }), custom, NOW)).toBe("ready");
    expect(cardPhase(card("dev", { blocked: { at: NOW } }), custom, NOW)).toBe("blocked");
    expect(cardPhase(card("next", { blocked: { at: NOW } }), custom, NOW)).toBe("blocked");
    // 已结束的卡不看阻塞标记
    expect(cardPhase(card("shipped", { blocked: { at: NOW } }), custom, NOW)).toBe("done");
  });

  it("定时：未开始且 scheduledAt 在将来 → scheduled，且优先于派发标记", () => {
    const future = { automation: { scheduledAt: NOW + 60_000 } };
    expect(cardPhase(card("next", future), custom, NOW)).toBe("scheduled");
    expect(cardPhase(card("next", { ...future, dispatchReady: true }), custom, NOW)).toBe("scheduled");
    expect(cardPhase(card("next", { automation: { scheduledAt: NOW - 1 } }), custom, NOW)).toBe("todo");
    // 进行中的卡不受 scheduledAt 影响
    expect(cardPhase(card("dev", future), custom, NOW)).toBe("running");
  });

  it("读取兼容：磁盘上旧的 ready / scheduled / blocked 状态按旧含义解释", () => {
    expect(cardPhase(card("ready"), UNCONFIGURED_STATUS_REGISTRY, NOW)).toBe("ready");
    expect(cardPhase(card("scheduled"), UNCONFIGURED_STATUS_REGISTRY, NOW)).toBe("scheduled");
    expect(cardPhase(card("blocked"), UNCONFIGURED_STATUS_REGISTRY, NOW)).toBe("blocked");
    expect(isBlockedCard(card("blocked"))).toBe(true);
    expect(isDispatchReadyCard(card("ready"))).toBe(true);
    expect(UNCONFIGURED_STATUS_REGISTRY.category("blocked")).toBe("started");
    expect(UNCONFIGURED_STATUS_REGISTRY.category("ready")).toBe("unstarted");
  });

  it("依赖链路只推进未开始且没被阻塞的卡", () => {
    expect(isDependencyPromotableCard(card("next"), custom)).toBe(true);
    expect(isDependencyPromotableCard(card("idea"), custom)).toBe(true);
    expect(isDependencyPromotableCard(card("next", { blocked: { at: NOW } }), custom)).toBe(false);
    expect(isDependencyPromotableCard(card("dev"), custom)).toBe(false);
    expect(isDependencyPromotableCard(card("shipped"), custom)).toBe(false);
    expect(isDependencyPromotableCard(card("ready"), UNCONFIGURED_STATUS_REGISTRY)).toBe(true);
    expect(isDependencyPromotableCard(card("blocked"), UNCONFIGURED_STATUS_REGISTRY)).toBe(false);
  });

  it("认领后能自动进入进行中的只有 todo 与 ready", () => {
    expect(["triage", "todo", "scheduled", "ready", "running", "review", "blocked", "done"].filter((phase) =>
      isStartablePhase(phase as never),
    )).toEqual(["todo", "ready"]);
  });
});

describe("phasePatch：把目标阶段翻译成状态与标记", () => {
  const base = card("next");

  it("running / review / done / cancelled 取类别里的第一个状态或 role", () => {
    expect(phasePatch(base, "running", custom).status).toBe("dev");
    expect(phasePatch(base, "review", custom).status).toBe("qa");
    expect(phasePatch(base, "done", custom).status).toBe("shipped");
    expect(phasePatch(base, "cancelled", custom).status).toBe("dropped");
    expect(activeStatusOf(custom)).toBe("dev");
    // 没有 review role 时评审落在进行中状态
    const noReview = createStatusRegistry(
      validateStatusDefinitions([
        { id: "a", category: "unstarted" },
        { id: "b", category: "started" },
        { id: "c", category: "completed" },
      ]),
    );
    expect(phasePatch(base, "review", noReview).status).toBe("b");
  });

  it("目标阶段在项目里没有落点时抛错，不写不存在的状态", () => {
    const noCancel = createStatusRegistry(
      validateStatusDefinitions([
        { id: "a", category: "unstarted" },
        { id: "c", category: "completed" },
      ]),
    );
    expect(() => phasePatch(card("a"), "cancelled", noCancel)).toThrow(/no status for "cancelled"/);
    expect(() => phasePatch(card("a"), "running", noCancel)).toThrow(/no status for "running"/);
  });

  it("todo / ready：未开始的卡留在原状态，别的状态退回默认未开始状态", () => {
    expect(phasePatch(card("idea"), "todo", custom).status).toBe("idea");
    expect(phasePatch(card("dev"), "todo", custom).status).toBe("next");
    expect(phasePatch(card("dev"), "ready", custom)).toMatchObject({
      status: "next",
      flags: { dispatchReady: true, blocked: undefined },
    });
    // 旧的 ready 状态（已退役）换成默认状态
    expect(phasePatch(card("ready"), "todo", UNCONFIGURED_STATUS_REGISTRY).status).toBe("todo");
  });

  it("blocked：留在原状态并带上原因与时间；旧的内部状态换成真实状态", () => {
    expect(phasePatch(card("dev"), "blocked", custom, { reason: " 超时 ", now: NOW })).toEqual({
      status: "dev",
      flags: { blocked: { at: NOW, reason: "超时" }, dispatchReady: undefined },
    });
    expect(phasePatch(card("blocked"), "blocked", UNCONFIGURED_STATUS_REGISTRY, { now: NOW }).status).toBe("running");
    expect(phasePatch(card("ready"), "blocked", UNCONFIGURED_STATUS_REGISTRY, { now: NOW }).status).toBe("todo");
    expect(phasePatch(card("next"), "blocked", custom, { now: NOW }).flags.blocked).toEqual({ at: NOW });
  });

  it("别的阶段一律清掉两个标记", () => {
    for (const phase of ["triage", "todo", "scheduled", "running", "review", "done", "cancelled"] as const) {
      const patch = phasePatch(card("dev", { blocked: { at: NOW }, dispatchReady: true }), phase, custom);
      expect(patch.flags).toEqual({ blocked: undefined, dispatchReady: undefined });
    }
  });
});
