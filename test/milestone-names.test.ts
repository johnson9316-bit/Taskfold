import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { TaskfoldMilestone } from "@taskfold/core/contract/index.js";
import { createTaskfoldFileStores } from "@taskfold/core/file-store.js";
import { createMarkdownMilestoneCodec } from "@taskfold/core/file-store-codec.js";
import { milestoneFileStem, selectMilestoneFileName, writeTaskfoldMilestoneFile } from "@taskfold/core/file-store-milestones.js";
import { migrateTaskfoldMilestones } from "@taskfold/core/file-store-milestone-migration.js";
import { parseMarkdownMilestone } from "@taskfold/core/markdown-milestone-format.js";

const roots: string[] = [];
const codec = createMarkdownMilestoneCodec();
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-milestone-names-"));
  roots.push(root);
  const dataDir = path.join(root, "repo", ".taskfold");
  const stores = createTaskfoldFileStores({ dataDir });
  const milestonesDir = path.join(dataDir, "milestones");
  const configPath = path.join(dataDir, "config.yml");
  const names = () => fs.readdirSync(milestonesDir).filter((name) => name.endsWith(".md"));
  return { root, dataDir, stores, milestonesDir, configPath, names };
}
function milestone(overrides: Partial<TaskfoldMilestone> = {}): TaskfoldMilestone {
  return { id: "12345678-1234-1234-1234-123456789abc", boardId: "demo", title: "项目看板",
    position: 2.5, state: "active", createdAt: 60000, updatedAt: 120000, ...overrides };
}
function legacy(value: TaskfoldMilestone, noUuid = false): string {
  const content = codec.serialize(value).replace("---\n", "---\nid: M-2\n");
  return noUuid ? content.replace(/  "uuid": .*\n/, "") : content;
}

describe("阶段文件按名称保存", () => {
  it("创建不分配编号；改标题自动改名；重复保存不改路径", async () => {
    const { stores, names, milestonesDir } = setup();
    const value = milestone();
    await stores.milestones.register(value.id, { version: 1, milestone: value });
    expect(names()).toEqual(["项目看板.md"]);
    expect(fs.readFileSync(path.join(milestonesDir, names()[0]!), "utf8")).not.toMatch(/^id:/m);
    value.title = "文件存储迁移";
    await stores.milestones.register(value.id, { version: 1, milestone: value });
    await stores.milestones.register(value.id, { version: 1, milestone: value });
    expect(names()).toEqual(["文件存储迁移.md"]);
    expect((await stores.milestones.lookup(value.id))?.milestone).toEqual(value);
  });

  it("保留用户指定 M1 标题；同名及清理后同名不覆盖；后缀路径保持稳定", async () => {
    const { stores, names } = setup();
    const first = milestone({ title: "M1" });
    const second = milestone({ id: "abcdef12-1234-1234-1234-123456789abc", title: "M1." });
    for (const item of [first, second]) await stores.milestones.register(item.id, { version: 1, milestone: item });
    expect(names().sort()).toEqual(["M1 - abcdef12.md", "M1.md"]);
    await stores.milestones.delete(first.id);
    await stores.milestones.register(second.id, { version: 1, milestone: second });
    expect(names()).toEqual(["M1 - abcdef12.md"]);
  });

  it("处理设备名、非法字符、空名称和中文长标题，短 UUID 冲突时延长", async () => {
    expect(milestoneFileStem("CON")).toBe("_CON");
    expect(milestoneFileStem("nul.txt")).toBe("_nul.txt");
    expect(milestoneFileStem(".. ")).toBe("untitled");
    expect(milestoneFileStem("登录/权限:设置...")).toBe("登录 权限 设置");
    const value = milestone();
    expect(selectMilestoneFileName(value, new Set(["项目看板.md", "项目看板 - 12345678.md"])))
      .toBe("项目看板 - 123456781234.md");
    const { stores, names } = setup();
    for (const suffix of ["甲", "乙"]) {
      const item = milestone({ id: suffix, title: "长".repeat(120) + suffix });
      await stores.milestones.register(item.id, { version: 1, milestone: item });
      await stores.milestones.register(item.id, { version: 1, milestone: item });
    }
    expect(names()).toHaveLength(2);
    expect((await stores.milestones.entries())).toHaveLength(2);
  });

  it("兼容旧格式及无 UUID 的旧标识，读取不迁移，写入升级并保留配置", async () => {
    const { stores, milestonesDir, configPath, names } = setup();
    fs.writeFileSync(configPath, "# settings\nformat_version: 1 # legacy\ncustom: keep\n");
    fs.writeFileSync(path.join(milestonesDir, "m-2 - old.md"), legacy(milestone(), true));
    const entry = await stores.milestones.lookup("M-2");
    expect(entry?.milestone.id).toBe("M-2");
    expect(names()).toEqual(["m-2 - old.md"]);
    expect(fs.readFileSync(configPath, "utf8")).toContain("format_version: 1");
    await stores.milestones.register("M-2", entry!);
    expect(names()).toEqual(["项目看板.md"]);
    expect(fs.readFileSync(configPath, "utf8")).toBe("# settings\nformat_version: 2 # legacy\ncustom: keep\n");
    expect((await stores.milestones.lookup("M-2"))?.milestone.id).toBe("M-2");
    expect(() => parseMarkdownMilestone(codec.serialize(milestone()).replace(/  "uuid": .*\n/, ""))).toThrow(/UUID/);
  });

  it("改名后写入失败仍保留一份原内容，不留下重复实体", async () => {
    const { milestonesDir, names } = setup();
    const original = milestone();
    const existingPath = path.join(milestonesDir, "项目看板.md");
    const content = codec.serialize(original);
    fs.writeFileSync(existingPath, content);
    let checks = 0;
    expect(() => writeTaskfoldMilestoneFile({ milestonesDir, existingPath, codec,
      milestone: { ...original, title: "新名称" },
      guard: { assertHeld() { if (++checks === 2) throw new Error("锁失效"); } },
    })).toThrow("锁失效");
    expect(names()).toEqual(["新名称.md"]);
    expect(fs.readFileSync(path.join(milestonesDir, "新名称.md"), "utf8")).toBe(content);
    expect(fs.readdirSync(milestonesDir)).toEqual(["新名称.md"]);
  });

  it("迁移预览无修改，执行前备份且保留关联、业务字段及正文，重跑幂等", async () => {
    const { root, dataDir, milestonesDir, configPath } = setup();
    fs.writeFileSync(configPath, "format_version: 1\ncustom: keep\n");
    const content = legacy(milestone()).replace("## Taskfold", "## 笔记\n保留这段\n\n## Taskfold");
    fs.writeFileSync(path.join(milestonesDir, "m-2 - M2.md"), content);
    const cardsPath = path.join(dataDir, "cards", "card-1.md");
    fs.writeFileSync(cardsPath, "卡片原文和关联不应被改写");
    const preview = await migrateTaskfoldMilestones({ dataDir });
    expect(preview.files[0]?.to).toBe("项目看板.md");
    expect(fs.readFileSync(configPath, "utf8")).toContain("format_version: 1");
    const result = await migrateTaskfoldMilestones({ dataDir, apply: true, backupRoot: path.join(root, "backup") });
    expect(result).toMatchObject({ applied: true, verifiedMilestones: 1, verifiedCards: 1 });
    const after = fs.readFileSync(path.join(milestonesDir, "项目看板.md"), "utf8");
    expect(parseMarkdownMilestone(after)).toEqual(parseMarkdownMilestone(content));
    await migrateTaskfoldMilestones({ dataDir, apply: true, backupRoot: path.join(root, "backup") });
    expect(fs.readFileSync(path.join(milestonesDir, "项目看板.md"), "utf8")).toBe(after);
    expect(fs.readFileSync(cardsPath, "utf8")).toBe("卡片原文和关联不应被改写");
  });
});
