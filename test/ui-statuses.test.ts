import { describe, expect, it } from "vitest";
import type { TaskfoldCard, TaskfoldStatusDefinition } from "@taskfold/core/contract/index.js";
import {
  boardStatusColumns,
  cardMark,
  checkedStatusFor,
  displayStatusId,
  isCompletedCard,
  isFinishedCard,
  statusLabel,
  statusRegistryOf,
} from "../packages/ui/src/lib/statuses.ts";

const NOW = 1_800_000_000_000;
const dictionary: Record<string, string> = {
  "taskfoldProject.statusDefault.todo": "待办",
  "taskfoldProject.statusDefault.running": "进行中",
  "taskfoldProject.statusDefault.done": "已完成",
};
const translate = (key: string) => dictionary[key] ?? key;
const custom: TaskfoldStatusDefinition[] = [
  { id: "next", name: "排队", category: "unstarted", default: true },
  { id: "dev", category: "started" },
  { id: "qa", name: "测试中", category: "started", role: "review" },
  { id: "shipped", category: "completed" },
  { id: "dropped", category: "cancelled" },
];
function card(status: string, metadata: TaskfoldCard["metadata"] = {}): TaskfoldCard {
  return { id: status, title: status, status, priority: "normal", labels: [], position: 1, createdAt: 1, updatedAt: 1, revision: 1, metadata };
}

describe("前端状态辅助", () => {
  it("没有状态定义（旧后端 / 空列表）用未配置默认集；有定义就按定义", () => {
    expect(statusRegistryOf(undefined).has("todo")).toBe(true);
    expect(statusRegistryOf({ statuses: [] }).has("todo")).toBe(true);
    const registry = statusRegistryOf({ statuses: custom });
    expect(registry.ids).toEqual(["next", "dev", "qa", "shipped", "dropped"]);
    // 同一份定义复用同一个注册表（按引用缓存）
    const statuses = [...custom];
    expect(statusRegistryOf({ statuses })).toBe(statusRegistryOf({ statuses }));
  });

  it("显示名：项目自己的名字 > 内置译名 > id", () => {
    const registry = statusRegistryOf({ statuses: custom });
    expect(statusLabel("next", registry, translate)).toBe("排队");
    expect(statusLabel("dev", registry, translate)).toBe("dev");
    expect(statusLabel("qa", registry, translate)).toBe("测试中");
    const defaults = statusRegistryOf(undefined);
    expect(statusLabel("running", defaults, translate)).toBe("进行中");
    expect(statusLabel("whatever", defaults, translate)).toBe("whatever");
  });

  it("旧卡上已退役的 ready / scheduled / blocked 落在迁移后的归宿列，不会凭空消失", () => {
    const registry = statusRegistryOf(undefined);
    expect(displayStatusId(card("ready"), registry)).toBe("todo");
    expect(displayStatusId(card("scheduled"), registry)).toBe("todo");
    expect(displayStatusId(card("blocked"), registry)).toBe("running");
    expect(displayStatusId(card("running"), registry)).toBe("running");
  });

  it("状态视图的列：项目状态按顺序，外加卡片上出现的、不在状态集里的 id", () => {
    const registry = statusRegistryOf({ statuses: custom });
    const columns = boardStatusColumns(registry, [card("dev"), card("mystery"), card("mystery")]);
    expect(columns.map((column) => column.id)).toEqual(["next", "dev", "qa", "shipped", "dropped", "mystery"]);
    expect(columns.at(-1)).toMatchObject({ id: "mystery", orphan: true });
    expect(columns[0]!.definition?.name).toBe("排队");
  });

  it("已完成与已取消都置灰；勾选框只对已完成打勾", () => {
    const registry = statusRegistryOf({ statuses: custom });
    expect(isFinishedCard(card("shipped"), registry)).toBe(true);
    expect(isFinishedCard(card("dropped"), registry)).toBe(true);
    expect(isFinishedCard(card("dev"), registry)).toBe(false);
    expect(isCompletedCard(card("dropped"), registry)).toBe(false);
    expect(isCompletedCard(card("shipped"), registry)).toBe(true);
    expect(checkedStatusFor(registry, true)).toBe("shipped");
    expect(checkedStatusFor(registry, false)).toBe("next");
  });

  it("卡片标记：阻塞 / 已派发 / 定时未到；普通卡没有标记", () => {
    const registry = statusRegistryOf({ statuses: custom });
    expect(cardMark(card("dev", { blocked: { at: NOW } }), registry, NOW)).toBe("blocked");
    expect(cardMark(card("next", { dispatchReady: true }), registry, NOW)).toBe("ready");
    expect(cardMark(card("next", { automation: { scheduledAt: NOW + 1000 } }), registry, NOW)).toBe("scheduled");
    expect(cardMark(card("dev"), registry, NOW)).toBeUndefined();
    expect(cardMark(card("shipped", { blocked: { at: NOW } }), registry, NOW)).toBeUndefined();
    // 旧的 ready 状态（磁盘上还没迁移）也认
    expect(cardMark(card("ready"), statusRegistryOf(undefined), NOW)).toBe("ready");
  });
});
