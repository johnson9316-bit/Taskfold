import { describe, expect, it } from "vitest";
import type { TaskfoldMilestone } from "../src/contract/index.js";
import {
  parseMarkdownMilestone,
  serializeMarkdownMilestone,
  type MarkdownMilestoneDocument,
  type MilestoneDisplayId,
} from "../src/backend/src/markdown-milestone-format.js";

/** 造一张最小可用的里程碑，测试按需覆盖字段。 */
function baseMilestone(overrides: Partial<TaskfoldMilestone> = {}): TaskfoldMilestone {
  return {
    id: "3f2a8b1c-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
    boardId: "default",
    title: "第一个可用版本",
    position: 1,
    state: "active",
    createdAt: Date.UTC(2026, 8, 18, 10, 23),
    updatedAt: Date.UTC(2026, 8, 18, 11, 4),
    ...overrides,
  };
}

const displayId: MilestoneDisplayId = { prefix: "M", numericId: 1 };

function baseDoc(overrides: Partial<MarkdownMilestoneDocument> = {}): MarkdownMilestoneDocument {
  return {
    milestone: baseMilestone(),
    displayId,
    trailing: "",
    ...overrides,
  };
}

describe("serializeMarkdownMilestone / parseMarkdownMilestone 基础往返", () => {
  it("完整往返后里程碑字段与展示 ID 不变", () => {
    const doc = baseDoc({
      milestone: baseMilestone({
        description: "一些说明",
        color: "#ff0000",
        completedAt: Date.UTC(2026, 8, 19),
        archivedAt: undefined,
      }),
    });
    const markdown = serializeMarkdownMilestone(doc);
    const parsed = parseMarkdownMilestone(markdown);
    expect(parsed.milestone).toEqual(doc.milestone);
    expect(parsed.displayId).toEqual(displayId);
  });

  it("frontmatter id 写大写 prefix M，数字紧随", () => {
    const markdown = serializeMarkdownMilestone(baseDoc());
    expect(markdown).toContain("id: M-1");
  });

  it("P0 雷 #2：Description 即使为空也带完整哨兵", () => {
    const markdown = serializeMarkdownMilestone(baseDoc());
    expect(markdown).toContain(
      "## Description\n\n<!-- SECTION:DESCRIPTION:BEGIN -->\n<!-- SECTION:DESCRIPTION:END -->",
    );
  });

  it("description 字段的内容进 Description 区块", () => {
    const markdown = serializeMarkdownMilestone(baseDoc({ milestone: baseMilestone({ description: "里程碑说明" }) }));
    expect(markdown).toContain(
      "## Description\n\n<!-- SECTION:DESCRIPTION:BEGIN -->\n里程碑说明\n<!-- SECTION:DESCRIPTION:END -->",
    );
  });

  it("缺少 TASKFOLD 区块的文件会被拒绝", () => {
    const markdown =
      "---\nid: M-1\ntitle: x\nstate: active\ncreated_date: '2026-01-01 00:00'\n---\n\n## Description\n\n<!-- SECTION:DESCRIPTION:BEGIN -->\n<!-- SECTION:DESCRIPTION:END -->\n";
    expect(() => parseMarkdownMilestone(markdown)).toThrow(/SECTION:TASKFOLD/);
  });

  it("缺少必填 frontmatter 字段（title）直接抛错", () => {
    const markdown = serializeMarkdownMilestone(baseDoc()).replace("title: 第一个可用版本\n", "");
    expect(() => parseMarkdownMilestone(markdown)).toThrow(/title/);
  });

  it("未识别正文（自定义 ## 段落）原样保留，不被 Taskfold 篡改", () => {
    const doc = baseDoc({ trailing: "## 我的笔记\n这是我自己加的段落。" });
    const markdown = serializeMarkdownMilestone(doc);
    expect(markdown).toContain("## 我的笔记\n这是我自己加的段落。");
    const parsed = parseMarkdownMilestone(markdown);
    expect(parsed.trailing).toBe("## 我的笔记\n这是我自己加的段落。");
  });

  it("description 缺失时往返后仍然缺失，不会变成空字符串字段", () => {
    const doc = baseDoc({ milestone: baseMilestone() }); // 不设置 description
    const parsed = parseMarkdownMilestone(serializeMarkdownMilestone(doc));
    expect("description" in parsed.milestone).toBe(false);
  });

  it("position 的完整精度存进 TASKFOLD 区块，往返不因 ordinal 四舍五入丢精度", () => {
    const doc = baseDoc({ milestone: baseMilestone({ position: 1024.5 }) });
    const markdown = serializeMarkdownMilestone(doc);
    expect(markdown).toContain("ordinal: 1025");
    const parsed = parseMarkdownMilestone(markdown);
    expect(parsed.milestone.position).toBe(1024.5);
  });
});
