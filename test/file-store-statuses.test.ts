import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { TaskfoldStatusDefinition } from "@taskfold/core/contract/index.js";
import { createTaskfoldFileStores } from "@taskfold/core/file-store.js";
import {
  parseTaskfoldStatusesConfig,
  renderTaskfoldStatusesConfig,
} from "@taskfold/core/file-store-statuses.js";
import {
  TASKFOLD_STATUS_MODEL_FORMAT_VERSION,
  TaskfoldFormatTooNewError,
} from "@taskfold/core/file-store-format.js";
import { TaskfoldStatusConfigError } from "@taskfold/core/status-registry.js";
import { TaskfoldStore } from "../packages/openclaw/src/backend/src/store.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-statuses-"));
  roots.push(root);
  const dataDir = path.join(root, "repo", ".taskfold");
  const stores = createTaskfoldFileStores({ dataDir });
  const store = TaskfoldStore.fromStores(stores);
  const configPath = path.join(dataDir, "config.yml");
  return { dataDir, stores, store, configPath, read: () => fs.readFileSync(configPath, "utf8") };
}

const custom: TaskfoldStatusDefinition[] = [
  { id: "triage", category: "unstarted", role: "intake" },
  { id: "todo", name: "待办: 近期", category: "unstarted", default: true },
  { id: "doing", name: "进行中 #1", category: "started", color: "#2563eb" },
  { id: "review", category: "started", role: "review" },
  { id: "done", category: "completed" },
  { id: "cancelled", category: "cancelled" },
];

describe("config.yml 的 statuses", () => {
  it("没有 statuses 键时读出 undefined，写入后原样读回（含冒号、#、中文的名称）", async () => {
    const { stores, read } = setup();
    expect(await stores.statusConfig.read("demo")).toBeUndefined();

    await stores.statusConfig.write("demo", custom);

    expect(await stores.statusConfig.read("demo")).toEqual(custom);
    expect(read()).toContain('name: "待办: 近期"');
    expect(read()).toContain('name: "进行中 #1"');
  });

  it("首次写入把格式版本惰性升到 4，其他键与注释原样保留", async () => {
    const { stores, configPath, read } = setup();
    expect(read()).toMatch(/^format_version: 2$/m);
    fs.writeFileSync(configPath, "# 项目设置\nproject_name: \"demo\"\nformat_version: 2 # 保留我\n");

    await stores.statusConfig.write("demo", custom);

    const content = read();
    expect(content).toContain("# 项目设置");
    expect(content).toContain('project_name: "demo"');
    expect(content).toContain(`format_version: ${TASKFOLD_STATUS_MODEL_FORMAT_VERSION} # 保留我`);
    expect(content).toMatch(/^statuses:$/m);
  });

  it("再次写入只替换 statuses 段，后面的键不受影响", () => {
    const before = renderTaskfoldStatusesConfig("format_version: 4\nlabels_color: blue\n", custom);
    const after = renderTaskfoldStatusesConfig(
      `${before}tail_key: keep\n`,
      [
        { id: "todo", category: "unstarted" },
        { id: "done", category: "completed" },
      ],
    );
    expect(after).toContain("labels_color: blue");
    expect(after).toContain("tail_key: keep");
    expect(parseTaskfoldStatusesConfig(after)?.map((status) => status.id)).toEqual(["todo", "done"]);
    expect(after.match(/^statuses:$/gm)).toHaveLength(1);
  });

  it("读取支持块序列在行首、单引号、行尾注释", () => {
    const parsed = parseTaskfoldStatusesConfig(
      [
        "format_version: 4",
        "statuses:",
        "- id: todo # 默认",
        "  name: 'It''s on'",
        "  category: unstarted",
        "- id: done",
        "  category: completed",
        "next_key: 1",
      ].join("\n"),
    );
    expect(parsed).toEqual([
      { id: "todo", name: "It's on", category: "unstarted" },
      { id: "done", category: "completed" },
    ]);
  });

  it("手改坏了：抛出明确的配置错误，不当成没配置", () => {
    expect(() => parseTaskfoldStatusesConfig("statuses: []\n")).toThrow(TaskfoldStatusConfigError);
    expect(() => parseTaskfoldStatusesConfig("statuses:\n  - id: todo\n    category: weird\n")).toThrow(
      /category must be one of/,
    );
    expect(() => parseTaskfoldStatusesConfig("statuses:\n  - id: todo\n  garbage line\n")).toThrow(
      TaskfoldStatusConfigError,
    );
  });

  it("格式版本比本版新时拒绝写入", async () => {
    const { stores, configPath } = setup();
    fs.writeFileSync(configPath, "format_version: 999\n");
    await expect(stores.statusConfig.write("demo", custom)).rejects.toBeInstanceOf(TaskfoldFormatTooNewError);
  });
});

describe("TaskfoldStore 的状态方法", () => {
  it("没配置时用过渡默认集；新卡按注册表的默认状态落点", async () => {
    const { store } = setup();
    const statuses = await store.listStatuses("demo");
    // 界面用的列表：没有卡在用 triage / backlog 就不列出来（与迁移后一致）。
    expect(statuses.map((status) => status.id)).toEqual(["todo", "running", "review", "done", "cancelled"]);
    // 但引擎仍接受旧的 triage / backlog 作为输入。
    const registry = await store.statusRegistryFor("demo");
    expect(registry.has("triage") && registry.has("backlog")).toBe(true);

    const card = await store.create({ title: "A", boardId: "demo" });
    expect(card.status).toBe("todo");
  });

  it("保存后校验使用新列表：不在列表里的状态被拒绝，错误信息列出可选值", async () => {
    const { store } = setup();
    await store.saveStatuses("demo", custom);

    const card = await store.create({ title: "A", boardId: "demo", status: "doing" });
    expect(card.status).toBe("doing");
    await expect(store.create({ title: "B", boardId: "demo", status: "running" })).rejects.toThrow(
      "status must be one of: triage, todo, doing, review, done, cancelled.",
    );
    // 另一个没配置的项目不受影响（单项目后端共用一份 config，这里只验证校验走的是已保存的列表）
    expect((await store.listStatuses("demo")).map((status) => status.id)).toEqual(custom.map((status) => status.id));
  });

  it("还有卡在用的状态不能从列表里删掉", async () => {
    const { store } = setup();
    await store.saveStatuses("demo", custom);
    await store.create({ title: "A", boardId: "demo", status: "doing" });

    await expect(
      store.saveStatuses("demo", custom.filter((status) => status.id !== "doing")),
    ).rejects.toThrow(/cannot remove statuses that cards still use: doing \(1\)/);
    expect((await store.listStatuses("demo")).some((status) => status.id === "doing")).toBe(true);
  });

  it("保存会前进变更游标，订阅者能收到通知", async () => {
    const { store } = setup();
    const changes: unknown[] = [];
    store.subscribeChanges((change) => changes.push(change));

    await store.saveStatuses("demo", custom);

    expect(changes.length).toBeGreaterThan(0);
  });

  it("保存不合法的列表直接拒绝", async () => {
    const { store } = setup();
    await expect(store.saveStatuses("demo", [{ id: "todo", category: "unstarted" }])).rejects.toThrow(
      /"completed" status is required/,
    );
  });
});
