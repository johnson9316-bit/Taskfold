import { describe, expect, it } from "vitest";
import type { TaskfoldCard } from "@taskfold/core/contract/index.js";
import {
  buildCardFilename,
  escapeTaskfoldBodyText,
  findFlatMarkerBlock,
  findSectionFamilyBlock,
  formatBacklogDateTime,
  formatCardFrontmatterId,
  parseBacklogDateTime,
  parseCardFilename,
  parseCardFrontmatterId,
  parseMarkdownCard,
  parseYamlScalar,
  sanitizeCardFilenameTitle,
  serializeMarkdownCard,
  stringifyYamlScalar,
  type BacklogOnlyFrontmatterFields,
  type CardDisplayId,
  type MarkdownCardDocument,
} from "@taskfold/core/markdown-card-format.js";

/** 造一张最小可用的卡片，测试按需覆盖字段。 */
function baseCard(overrides: Partial<TaskfoldCard> = {}): TaskfoldCard {
  return {
    id: "3f2a8b1c-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
    title: "修复登录超时",
    status: "running",
    priority: "high",
    labels: [],
    position: 1024.5,
    createdAt: Date.UTC(2026, 8, 18, 10, 23),
    updatedAt: Date.UTC(2026, 8, 18, 11, 4),
    revision: 17,
    ...overrides,
  };
}

const displayId: CardDisplayId = { prefix: "CARD", numericId: 42 };

function baseDoc(overrides: Partial<MarkdownCardDocument> = {}): MarkdownCardDocument {
  return {
    card: baseCard(),
    displayId,
    backlogOnly: {},
    descriptionBody: "",
    trailing: "",
    ...overrides,
  };
}

describe("frontmatter 非法数值防护", () => {
  // 回归：集成期端到端验收时发现 position 缺失会让 `Math.round(undefined)` 写出
  // `ordinal: NaN`。contract 里 position 必填，正常路径不会触发，但外部写入者可能。
  // 写出 NaN 是真 js-yaml 读不回来的非法 YAML，属静默不可逆损坏，故加守卫。
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "position 为 %p 时省略 ordinal 键而不是写出非法标量",
    (bad) => {
      const md = serializeMarkdownCard(baseDoc({ card: { ...baseCard(), position: bad } }));
      expect(md).not.toMatch(/^ordinal:/m);
      expect(md).not.toContain("NaN");
      expect(md).not.toContain("Infinity");
    },
  );

  it("position 正常时仍写出四舍五入的 ordinal", () => {
    const md = serializeMarkdownCard(baseDoc({ card: { ...baseCard(), position: 1024.5 } }));
    expect(md).toMatch(/^ordinal: 1025$/m);
  });
});

describe("serializeMarkdownCard / parseMarkdownCard 基础往返", () => {
  it("完整往返后卡片字段与展示 ID 不变", () => {
    const doc = baseDoc({ card: baseCard({ agentId: "agent-1", milestoneId: "m-1", labels: ["bug", "urgent"] }) });
    const markdown = serializeMarkdownCard(doc);
    const parsed = parseMarkdownCard(markdown);
    expect(parsed.card).toEqual(doc.card);
    expect(parsed.displayId).toEqual(displayId);
  });

  it("frontmatter id 写大写 prefix，文件名用小写", () => {
    const markdown = serializeMarkdownCard(baseDoc());
    expect(markdown).toContain("id: CARD-42");
    expect(buildCardFilename(displayId, "修复登录超时")).toBe("card-42 - 修复登录超时.md");
  });

  it("P0 雷 #2：Description 即使为空也带完整哨兵", () => {
    const markdown = serializeMarkdownCard(baseDoc({ descriptionBody: "" }));
    expect(markdown).toContain(
      "## Description\n\n<!-- SECTION:DESCRIPTION:BEGIN -->\n<!-- SECTION:DESCRIPTION:END -->",
    );
  });

  it("buildSectionBlock 风格：## Title + 空行 + BEGIN（Description/Taskfold 都是这个格式）", () => {
    const markdown = serializeMarkdownCard(baseDoc({ descriptionBody: "一些说明" }));
    expect(markdown).toContain("## Description\n\n<!-- SECTION:DESCRIPTION:BEGIN -->\n一些说明\n<!-- SECTION:DESCRIPTION:END -->");
    expect(markdown).toContain("## Taskfold\n\n<!-- SECTION:TASKFOLD:BEGIN -->\n{");
  });

  it("formatChecklistSection 风格：AC/DoD 是 ## Title + BEGIN（无空行）", () => {
    const markdown = serializeMarkdownCard(baseDoc({ acceptanceCriteriaBody: "- [ ] #1 一些验收项" }));
    expect(markdown).toContain("## Acceptance Criteria\n<!-- AC:BEGIN -->\n- [ ] #1 一些验收项\n<!-- AC:END -->");
  });

  it("AC/DoD 区块为空文本时整段省略（对齐 formatChecklistSection 行为）", () => {
    const markdown = serializeMarkdownCard(baseDoc({ acceptanceCriteriaBody: "   " }));
    expect(markdown).not.toContain("AC:BEGIN");
  });

  it("缺少 TASKFOLD 区块的文件会被拒绝（ID 收编不在格式层范围内）", () => {
    const markdown = "---\nid: CARD-1\ntitle: x\nstatus: todo\nassignee: []\ncreated_date: '2026-01-01 00:00'\nlabels: []\ndependencies: []\n---\n\n## Description\n\n<!-- SECTION:DESCRIPTION:BEGIN -->\n<!-- SECTION:DESCRIPTION:END -->\n";
    expect(() => parseMarkdownCard(markdown)).toThrow(/SECTION:TASKFOLD/);
  });

  it("缺少必填 frontmatter 字段（title）直接抛错", () => {
    const markdown = serializeMarkdownCard(baseDoc()).replace("title: 修复登录超时\n", "");
    expect(() => parseMarkdownCard(markdown)).toThrow(/title/);
  });

  it("frontmatter 缺 priority 时反序列化回退为 normal", () => {
    const markdown = serializeMarkdownCard(baseDoc()).replace("priority: high\n", "");
    const parsed = parseMarkdownCard(markdown);
    expect(parsed.card.priority).toBe("normal");
  });
});

describe("R6：round-trip 精确性（字段缺失 vs null vs 空数组 vs 数字 vs 嵌套空对象）", () => {
  it("缺失字段往返后仍然缺失，不会变成 null", () => {
    const doc = baseDoc({ card: baseCard() }); // 不设置 notes/sessionKey 等可选字段
    const parsed = parseMarkdownCard(serializeMarkdownCard(doc));
    expect("notes" in parsed.card).toBe(false);
    expect(parsed.card.notes).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(parsed.card, "notes")).toBe(false);
  });

  it("metadata 内部字段为 null 时原样保留（null 是真实值，不是缺失）", () => {
    const doc = baseDoc({
      card: baseCard({
        metadata: { automation: { tenant: null as unknown as string } },
      }),
    });
    const parsed = parseMarkdownCard(serializeMarkdownCard(doc));
    expect(parsed.card.metadata?.automation?.tenant).toBeNull();
  });

  it("空数组往返后仍是空数组，不会变成缺失", () => {
    const doc = baseDoc({ card: baseCard({ metadata: { diagnostics: [] } }) });
    const parsed = parseMarkdownCard(serializeMarkdownCard(doc));
    expect(parsed.card.metadata?.diagnostics).toEqual([]);
    expect(Array.isArray(parsed.card.metadata?.diagnostics)).toBe(true);
  });

  it("数字往返后仍是数字，不会变成字符串", () => {
    const doc = baseDoc({ card: baseCard({ revision: 17, position: 1024.5 }) });
    const parsed = parseMarkdownCard(serializeMarkdownCard(doc));
    expect(parsed.card.revision).toBe(17);
    expect(typeof parsed.card.revision).toBe("number");
    expect(parsed.card.position).toBe(1024.5);
    expect(typeof parsed.card.position).toBe("number");
  });

  it("嵌套对象里的空对象不会被丢掉", () => {
    const doc = baseDoc({ card: baseCard({ metadata: { automation: {} } }) });
    const parsed = parseMarkdownCard(serializeMarkdownCard(doc));
    expect(parsed.card.metadata?.automation).toEqual({});
  });

  it("position（REAL）不会因为 ordinal 的整数投影丢精度", () => {
    const doc = baseDoc({ card: baseCard({ position: 1024.5 }) });
    const markdown = serializeMarkdownCard(doc);
    expect(markdown).toContain("ordinal: 1025"); // Math.round(1024.5) === 1025，仅供 backlog 展示
    expect(markdown).toContain('"position": 1024.5'); // TASKFOLD 区块里的权威值
    const parsed = parseMarkdownCard(markdown);
    expect(parsed.card.position).toBe(1024.5);
  });
});

describe("YAML 1.1 陷阱（js-yaml@3.15.0 实测校验，对规划文档的说法做了修正）", () => {
  it("1.0 会被无引号解析成 number（规划文档说对了）", () => {
    expect(parseYamlScalar("1.0")).toBe(1);
    expect(typeof parseYamlScalar("1.0")).toBe("number");
    expect(stringifyYamlScalar("1.0")).toBe("'1.0'"); // 写入侧必须加引号防止recurrence
  });

  it("未加引号的日期不会被我们的解析器错误地转成 JS Date 对象（仍是字符串）", () => {
    expect(parseYamlScalar("2026-09-18")).toBe("2026-09-18");
    expect(typeof parseYamlScalar("2026-09-18")).toBe("string");
    expect(stringifyYamlScalar("2026-09-18")).toBe("'2026-09-18'");
  });

  it("true/True/TRUE 等会被 safeLoad 解析成 boolean（真实 js-yaml 行为，已实测验证）", () => {
    expect(parseYamlScalar("true")).toBe(true);
    expect(parseYamlScalar("True")).toBe(true);
    expect(parseYamlScalar("TRUE")).toBe(true);
    expect(parseYamlScalar("false")).toBe(false);
    expect(stringifyYamlScalar("true")).toBe("'true'");
  });

  it("修正：yes/no/on/off 在 js-yaml safeLoad 下不会变成 boolean，仍是字符串——" +
      "已用仓库内 Backlog.md checkout 自带的 js-yaml@3.15.0 实跑 safeLoad 验证，" +
      "与新后端硬性语义规格文档里的说法不一致（该文档这一条不准确）", () => {
    expect(parseYamlScalar("yes")).toBe("yes");
    expect(parseYamlScalar("no")).toBe("no");
    expect(parseYamlScalar("on")).toBe("on");
    expect(parseYamlScalar("off")).toBe("off");
  });

  it("但写入侧仍防御性地给 yes/no/on/off 加引号（照抄 js-yaml dumper 的 DEPRECATED_BOOLEANS_SYNTAX）", () => {
    expect(stringifyYamlScalar("yes")).toBe("'yes'");
    expect(stringifyYamlScalar("off")).toBe("'off'");
  });

  it("端到端：这几种危险取值经过完整往返都不会被破坏", () => {
    const cases: Array<[keyof BacklogOnlyFrontmatterFields, string]> = [
      ["type", "True"],
      ["project", "1.0"],
      ["dueDate", "2026-09-18"],
      ["onStatusChange", "yes"],
    ];
    for (const [field, value] of cases) {
      const doc = baseDoc({ backlogOnly: { [field]: value } as BacklogOnlyFrontmatterFields });
      const parsed = parseMarkdownCard(serializeMarkdownCard(doc));
      expect(parsed.backlogOnly[field]).toBe(value);
    }
  });
});

describe("R7：stable-id 数组保序保 id", () => {
  it("links/comments/events/attempts 的 id 与相对顺序完整保留", () => {
    const doc = baseDoc({
      card: baseCard({
        events: [
          { id: "evt-3", kind: "created", at: 1 },
          { id: "evt-1", kind: "moved", at: 2 },
          { id: "evt-2", kind: "claimed", at: 3 },
        ],
        metadata: {
          links: [
            { id: "link-b", type: "blocks", createdAt: 1 },
            { id: "link-a", type: "relates_to", createdAt: 2 },
          ],
          comments: [
            { id: "c-2", body: "第二条", createdAt: 1 },
            { id: "c-1", body: "第一条", createdAt: 2 },
          ],
          attempts: [
            { id: "attempt-2", status: "failed", startedAt: 1 },
            { id: "attempt-1", status: "succeeded", startedAt: 2 },
          ],
        },
      }),
    });
    const parsed = parseMarkdownCard(serializeMarkdownCard(doc));
    expect(parsed.card.events?.map((e) => e.id)).toEqual(["evt-3", "evt-1", "evt-2"]);
    expect(parsed.card.metadata?.links?.map((l) => l.id)).toEqual(["link-b", "link-a"]);
    expect(parsed.card.metadata?.comments?.map((c) => c.id)).toEqual(["c-2", "c-1"]);
    expect(parsed.card.metadata?.attempts?.map((a) => a.id)).toEqual(["attempt-2", "attempt-1"]);
    // 深度相等：不仅 id 顺序对，每个元素本身也必须原样保留
    expect(parsed.card.metadata?.comments).toEqual(doc.card.metadata?.comments);
  });

  it("labels 和 diagnostics 没有 id，只能靠顺序保序", () => {
    const doc = baseDoc({
      card: baseCard({
        labels: ["urgent", "bug", "backend"],
        metadata: {
          diagnostics: [
            {
              kind: "stranded_ready",
              severity: "warning",
              title: "A",
              detail: "detail-a",
              firstSeenAt: 1,
              lastSeenAt: 2,
              count: 1,
              actions: [],
            },
            {
              kind: "blocked_too_long",
              severity: "error",
              title: "B",
              detail: "detail-b",
              firstSeenAt: 3,
              lastSeenAt: 4,
              count: 2,
              actions: [],
            },
          ],
        },
      }),
    });
    const parsed = parseMarkdownCard(serializeMarkdownCard(doc));
    expect(parsed.card.labels).toEqual(["urgent", "bug", "backend"]);
    expect(parsed.card.metadata?.diagnostics?.map((d) => d.title)).toEqual(["A", "B"]);
  });
});

describe("哨兵解析边界", () => {
  it("正文里行内提到哨兵文字不会被误判为区块边界", () => {
    const lines = [
      "## Taskfold",
      "",
      "<!-- SECTION:TASKFOLD:BEGIN -->",
      "正文里提到过 <!-- SECTION:TASKFOLD:END --> 这几个字，但这一整行不是哨兵（前面有多余文字）",
      "真正的结束在下面这一行",
      "<!-- SECTION:TASKFOLD:END -->",
    ];
    const block = findSectionFamilyBlock(lines, "Taskfold", "TASKFOLD");
    expect(block?.beginLineIndex).toBe(2);
    expect(block?.endLineIndex).toBe(5);
  });

  it("带前导空白的哨兵行不算数", () => {
    const lines = ["## Taskfold", "", "  <!-- SECTION:TASKFOLD:BEGIN -->", "{}", "<!-- SECTION:TASKFOLD:END -->"];
    expect(findSectionFamilyBlock(lines, "Taskfold", "TASKFOLD")).toBeUndefined();
  });

  it("允许哨兵行尾随空白", () => {
    const lines = ["## Taskfold", "", "<!-- SECTION:TASKFOLD:BEGIN -->  ", "{}", "<!-- SECTION:TASKFOLD:END -->\t"];
    const block = findSectionFamilyBlock(lines, "Taskfold", "TASKFOLD");
    expect(block).toBeDefined();
  });

  it("同族 BEGIN 做深度计数：嵌套的 BEGIN/END 被当成一个整体区块", () => {
    const lines = [
      "## Taskfold",
      "",
      "<!-- SECTION:TASKFOLD:BEGIN -->",
      "外层",
      "<!-- SECTION:TASKFOLD:BEGIN -->",
      "内层（历史上被重复写入过一次）",
      "<!-- SECTION:TASKFOLD:END -->",
      "外层结束",
      "<!-- SECTION:TASKFOLD:END -->",
    ];
    const block = findSectionFamilyBlock(lines, "Taskfold", "TASKFOLD");
    expect(block?.beginLineIndex).toBe(2);
    expect(block?.endLineIndex).toBe(8); // 跳过内层的 END，落在外层的 END
  });

  it("heading 大小写不敏感、允许尾随空白", () => {
    const lines = ["## taskfold  ", "<!-- SECTION:TASKFOLD:BEGIN -->", "{}", "<!-- SECTION:TASKFOLD:END -->"];
    expect(findSectionFamilyBlock(lines, "Taskfold", "TASKFOLD")).toBeDefined();
  });

  it("TASKFOLD 区块内出现已知 ## 标题时，自检必须转义它", () => {
    const escaped = escapeTaskfoldBodyText("## Description\n正文\n## Comments\n更多正文");
    expect(escaped).toBe(" ## Description\n正文\n ## Comments\n更多正文");
  });

  it("自检大小写不敏感地转义已知标题", () => {
    expect(escapeTaskfoldBodyText("## description")).toBe(" ## description");
    expect(escapeTaskfoldBodyText("## NOTES")).toBe(" ## NOTES");
  });

  it("自检转义任意通配 SECTION 哨兵行（不仅是我们自己的 TASKFOLD 家族）", () => {
    expect(escapeTaskfoldBodyText("<!-- SECTION:FOO:BEGIN -->")).toBe(" <!-- SECTION:FOO:BEGIN -->");
    expect(escapeTaskfoldBodyText("<!-- AC:BEGIN -->")).toBe(" <!-- AC:BEGIN -->");
  });

  it("自检不误伤行内提及或格式不完全匹配的行", () => {
    expect(escapeTaskfoldBodyText("提到 <!-- SECTION:FOO:BEGIN --> 这几个字")).toBe(
      "提到 <!-- SECTION:FOO:BEGIN --> 这几个字",
    );
    expect(escapeTaskfoldBodyText("### Description")).toBe("### Description"); // 三级标题不是已知的二级标题
  });

  it("往返时 Description 里的危险行会被转义一次，保证 P0 雷 #2/#6 不复发", () => {
    const doc = baseDoc({ descriptionBody: "## Description\n看起来像另一个 Description 小节的说明" });
    const parsed = parseMarkdownCard(serializeMarkdownCard(doc));
    expect(parsed.descriptionBody).toBe(" ## Description\n看起来像另一个 Description 小节的说明");
  });

  it("AC/DoD 扁平标记：找到第一个 BEGIN 到第一个 END", () => {
    const lines = [
      "## Acceptance Criteria",
      "<!-- AC:BEGIN -->",
      "- [ ] #1 x",
      "<!-- AC:END -->",
    ];
    const block = findFlatMarkerBlock(lines, "Acceptance Criteria", "AC");
    expect(block?.beginLineIndex).toBe(1);
    expect(block?.endLineIndex).toBe(3);
  });
});

describe("14 个子表字段归位（sourceReferences/delivery 顶层，其余在 metadata 下）", () => {
  it("sourceReferences 和 delivery 反序列化后落在 card 顶层，不在 metadata 里", () => {
    const doc = baseDoc({
      card: baseCard({
        sourceReferences: [
          { id: "sr-1", label: "spec", target: "docs/spec.md", position: 1, createdAt: 1, updatedAt: 2 },
        ],
        delivery: { objective: "修复超时", updatedAt: 1 },
        metadata: { failureCount: 2 },
      }),
    });
    const parsed = parseMarkdownCard(serializeMarkdownCard(doc));
    expect(parsed.card.sourceReferences).toEqual(doc.card.sourceReferences);
    expect(parsed.card.delivery).toEqual(doc.card.delivery);
    expect((parsed.card as unknown as { metadata: { sourceReferences?: unknown; delivery?: unknown } }).metadata)
      .not.toHaveProperty("sourceReferences");
    expect(parsed.card.metadata?.failureCount).toBe(2);
  });

  it("剩余 12 段（attempts/comments/links/proof/artifacts/attachments/workerLogs/workerProtocol/" +
      "automation/claim/diagnostics/notifications）全部落在 card.metadata 下", () => {
    const doc = baseDoc({
      card: baseCard({
        metadata: {
          attempts: [{ id: "a1", status: "running", startedAt: 1 }],
          comments: [{ id: "c1", body: "hi", createdAt: 1 }],
          links: [{ id: "l1", type: "blocks", createdAt: 1 }],
          proof: [{ id: "p1", status: "passed", createdAt: 1 }],
          artifacts: [{ id: "ar1", createdAt: 1 }],
          attachments: [{ id: "at1", cardId: "card-uuid", createdAt: 1, fileName: "x.png", byteSize: 10 }],
          workerLogs: [{ id: "w1", createdAt: 1, level: "info", message: "log" }],
          workerProtocol: { state: "idle", updatedAt: 1 },
          automation: { boardId: "default" },
          claim: { ownerId: "owner-1", token: "tok", claimedAt: 1, lastHeartbeatAt: 1 },
          diagnostics: [
            {
              kind: "stranded_ready",
              severity: "warning",
              title: "t",
              detail: "d",
              firstSeenAt: 1,
              lastSeenAt: 1,
              count: 1,
              actions: [],
            },
          ],
          notifications: [{ id: "n1", kind: "completed", createdAt: 1, message: "done" }],
        },
      }),
    });
    const parsed = parseMarkdownCard(serializeMarkdownCard(doc));
    expect(parsed.card.metadata).toEqual(doc.card.metadata);
  });
});

describe("Backlog.md 独有的 11 个字段：Taskfold 不用但读写不得丢弃", () => {
  it("全部 11 个字段完整往返", () => {
    const backlogOnly: BacklogOnlyFrontmatterFields = {
      reporter: "alice",
      dueDate: "2026-10-01",
      references: ["docs/a.md", "docs/b.md"],
      documentation: ["docs/c.md"],
      modifiedFiles: ["src/a.ts"],
      parentTaskId: "TASK-1",
      subtasks: ["TASK-2", "TASK-3"],
      type: "bug",
      project: "core",
      onStatusChange: "notify",
      dependencies: ["TASK-0"],
    };
    const doc = baseDoc({ backlogOnly });
    const parsed = parseMarkdownCard(serializeMarkdownCard(doc));
    expect(parsed.backlogOnly).toEqual(backlogOnly);
  });

  it("未设置时不会在 frontmatter 里出现（对齐 backlog 的条件写入规则）", () => {
    const markdown = serializeMarkdownCard(baseDoc());
    expect(markdown).not.toContain("reporter:");
    expect(markdown).not.toContain("due_date:");
    expect(markdown).not.toContain("references:");
    // dependencies 是无条件写入的（对齐 backlog 的 `dependencies: task.dependencies`）
    expect(markdown).toContain("dependencies: []");
  });
});

describe("assignee <-> agentId 映射", () => {
  it("有 agentId 时写成单元素数组，读回同一个 agentId", () => {
    const doc = baseDoc({ card: baseCard({ agentId: "agent-42" }) });
    const markdown = serializeMarkdownCard(doc);
    expect(markdown).toContain("assignee:\n  - agent-42");
    expect(parseMarkdownCard(markdown).card.agentId).toBe("agent-42");
  });

  it("没有 agentId 时写成空数组，读回时字段缺失而不是空字符串", () => {
    const markdown = serializeMarkdownCard(baseDoc());
    expect(markdown).toContain("assignee: []");
    expect(parseMarkdownCard(markdown).card.agentId).toBeUndefined();
  });
});

describe("日期格式：YYYY-MM-DD HH:mm，UTC，无秒无时区", () => {
  it("往返稳定", () => {
    const epoch = Date.UTC(2026, 8, 18, 10, 23, 0, 0);
    const text = formatBacklogDateTime(epoch);
    expect(text).toBe("2026-09-18 10:23");
    expect(parseBacklogDateTime(text)).toBe(epoch);
  });

  it("秒级精度会被截断（对齐 backlog 自身的存储精度，不是回归）", () => {
    const withSeconds = Date.UTC(2026, 8, 18, 10, 23, 45, 500);
    const text = formatBacklogDateTime(withSeconds);
    expect(text).toBe("2026-09-18 10:23");
    expect(parseBacklogDateTime(text)).toBe(Date.UTC(2026, 8, 18, 10, 23, 0, 0));
  });

  it("格式非法时抛错（对齐 due_date 特例：格式不合法直接 throw）", () => {
    expect(() => parseBacklogDateTime("2026/09/18 10:23")).toThrow();
  });
});

describe("文件名 sanitize（逐字照抄 Backlog.md operations.ts 的算法）", () => {
  it("替换路径非法字符", () => {
    expect(sanitizeCardFilenameTitle('a/b\\c:d*e?f"g<h>i|j')).toBe("a-b-c-d-e-f-g-h-i-j");
  });

  it("删除噪音标点", () => {
    expect(sanitizeCardFilenameTitle("Fix(login)! [urgent] #42")).toBe("Fixlogin-urgent-42");
  });

  it("折叠空白为单个连字符，压缩连续连字符，去首尾连字符", () => {
    expect(sanitizeCardFilenameTitle("  a   b--c  ")).toBe("a-b-c");
  });

  it("纯标点标题回退为 untitled", () => {
    expect(sanitizeCardFilenameTitle("!!!???")).toBe("untitled");
  });

  it("文件名与展示 ID 的大小写不对称：frontmatter 大写、文件名小写", () => {
    const id = formatCardFrontmatterId(displayId);
    expect(id).toBe("CARD-42");
    expect(parseCardFrontmatterId(id)).toEqual(displayId);
    expect(parseCardFrontmatterId("card-42")).toEqual(displayId); // 大小写不敏感解析

    const filename = buildCardFilename(displayId, "修复登录超时");
    expect(filename).toBe("card-42 - 修复登录超时.md");
    expect(parseCardFilename(filename)).toEqual({ displayId, titleSlug: "修复登录超时" });
  });
});

describe("trailing：未识别的正文内容原样保留", () => {
  it("Description/AC/DoD/Taskfold 之外的内容原样往返", () => {
    const doc = baseDoc({ trailing: "## Random Notes\nkeep me please" });
    const parsed = parseMarkdownCard(serializeMarkdownCard(doc));
    expect(parsed.trailing).toBe("## Random Notes\nkeep me please");
  });
});

// ============================================================================
// Golden 测试：写入侧输出对照真实 js-yaml@3.15.0（Backlog.md v1.52.0 实际依赖版本）
// ============================================================================
//
// 下面这些期望值不是靠读正则推出来的，是拿 Backlog.md 实际用的 js-yaml@3.15.0 真跑
// `safeDump()` 生成、原样抄进来的——这就是"用真实依赖跑一次实测校验"这件事本身被固化
// 进测试套件，而不是只存在于某次会话记录里。下次有人改了 stringifyYamlScalar /
// isAmbiguousYamlScalar 的判定逻辑，这里会红；下次 Backlog.md 升级它自己的 YAML 库
// 版本，重跑下面这条命令、把输出贴回来即可知道兼容性有没有变。
//
// 不在测试里 import 真实 js-yaml：那是 /home/john/src/lz/Backlog.md（另一个仓库）的
// node_modules，CI / 其它机器上不存在，而且不该对别人的仓库建立运行期依赖。
//
// 重新生成 golden 值的命令（在能访问 Backlog.md checkout 的机器上跑）：
//
//   cd /home/john/src/lz/Backlog.md && node -e '
//     const yaml = require("./node_modules/js-yaml/index.js");
//     const cases = {
//       hex_lower: "0x1F", hex_upper_prefix: "0X1f",
//       octal_prefix_lower: "0o17", octal_prefix_upper: "0O17", octal_leading_zero: "010",
//       binary_lower: "0b1011", binary_upper_prefix: "0B1011",
//       inf_lower: ".inf", inf_camel: ".Inf", inf_upper: ".INF", neg_inf: "-.inf",
//       nan_lower: ".nan", nan_camel: ".NaN", nan_upper: ".NAN",
//       sexagesimal_hm: "1:30", sexagesimal_hms: "12:34:56",
//       chinese_title: "修复登录超时",
//       colon_value: "http://example.com/path:tag", double_slash: "https://example.com/a//b",
//       at_prefixed: "@bot-account", plain_id: "CARD-42", plain_status: "running",
//     };
//     for (const [k, v] of Object.entries(cases)) {
//       console.log(k, JSON.stringify(yaml.safeDump({ v }).trim().slice("v: ".length)));
//     }
//     console.log("EMPTY_ARRAY", JSON.stringify(yaml.safeDump({ v: [] })));
//     console.log("NONEMPTY_ARRAY", JSON.stringify(yaml.safeDump({ v: ["bug","urgent","backend"] })));
//   '
//
// 版本信息：实测时 /home/john/src/lz/Backlog.md/node_modules/js-yaml/package.json 的
// version 字段为 "3.15.0"，与 gray-matter 4.0.3 的默认 YAML 引擎一致（frontmatter.ts
// 只用 matter.stringify/matter，底层就是 yaml.safeLoad/safeDump）。
describe("golden：写入侧输出与真实 js-yaml@3.15.0 逐字对照", () => {
  // [被测字符串值, 真实 js-yaml safeDump({v: 值}).trim() 里 "v: " 之后的部分]
  const scalarGoldens: ReadonlyArray<readonly [string, string]> = [
    // 补丁 1 列出的歧义形态——逐一实测校验，包含大小写变体：
    ["0x1F", "'0x1F'"],
    // 大写 0X 前缀：真实 resolveYamlInteger 的字符比较是大小写敏感的，只认小写 'x'，
    // 所以这个值本来就不会被误判，不加引号才是跟真实 js-yaml 一致的正确行为。
    ["0X1f", "0X1f"],
    // 0o/0O 前缀八进制是 YAML 1.2 写法，js-yaml 3.15.0（YAML 1.1）完全不支持，
    // 两种大小写都不会被误判，不加引号同样是跟真实输出一致的正确行为。
    ["0o17", "0o17"],
    ["0O17", "0O17"],
    // 裸前导零才是真正会被 resolveYamlInteger 当成八进制的形态：
    ["010", "'010'"],
    ["0b1011", "'0b1011'"],
    // 同 0X：大写 0B 前缀真实 resolver 不认，不需要加引号。
    ["0B1011", "0B1011"],
    [".inf", "'.inf'"],
    [".Inf", "'.Inf'"],
    [".INF", "'.INF'"],
    ["-.inf", "'-.inf'"],
    [".nan", "'.nan'"],
    [".NaN", "'.NaN'"],
    [".NAN", "'.NAN'"],
    // 60 进制：这两个值本来就含冒号，已经被"任何含冒号的标量都不算 plain"这条规则
    // 拦下来了，是不是真的会被 resolve 成数字反而不重要——golden 只锁"确实加了引号"
    // 这个可观察结果。
    ["1:30", "'1:30'"],
    ["12:34:56", "'12:34:56'"],
    // 补丁 2 要求覆盖的其它形态：
    ["修复登录超时", "修复登录超时"],
    ["http://example.com/path:tag", "'http://example.com/path:tag'"],
    ["https://example.com/a//b", "'https://example.com/a//b'"],
    ["@bot-account", "'@bot-account'"],
    ["CARD-42", "CARD-42"],
    ["running", "running"],
  ];

  it.each(scalarGoldens)("stringifyYamlScalar(%j) 与真实 js-yaml 输出逐字一致", (value, expected) => {
    expect(stringifyYamlScalar(value)).toBe(expected);
  });

  it("空数组内联 [] 与真实 js-yaml 一致", () => {
    const markdown = serializeMarkdownCard(baseDoc());
    expect(markdown).toMatch(/^labels: \[\]$/m);
  });

  it("非空数组的块序列缩进（2 空格）与真实 js-yaml 一致", () => {
    const doc = baseDoc({ card: baseCard({ labels: ["bug", "urgent", "backend"] }) });
    const markdown = serializeMarkdownCard(doc);
    expect(markdown).toContain("labels:\n  - bug\n  - urgent\n  - backend\n");
  });

  it("这些危险取值经过我们自己的 stringify -> parse 往返后得到原始字符串", () => {
    for (const [value] of scalarGoldens) {
      expect(parseYamlScalar(stringifyYamlScalar(value))).toBe(value);
    }
  });

  it("端到端：危险取值塞进真实卡片字段，完整往返不受影响", () => {
    const doc = baseDoc({
      card: baseCard({ labels: ["0x1F", ".inf", "010", "0b1011"] }),
      backlogOnly: { type: "12:34:56", project: "0o17", onStatusChange: "0X1f" },
    });
    const markdown = serializeMarkdownCard(doc);
    // 四个 label 里真正需要引号保护的三个必须被引号包住；0o17 式的假阳性不应该被引号包住。
    expect(markdown).toContain("  - '0x1F'");
    expect(markdown).toContain("  - '.inf'");
    expect(markdown).toContain("  - '010'");
    expect(markdown).toContain("  - '0b1011'");
    expect(markdown).toContain("project: 0o17");
    const parsed = parseMarkdownCard(markdown);
    expect(parsed.card.labels).toEqual(["0x1F", ".inf", "010", "0b1011"]);
    expect(parsed.backlogOnly.type).toBe("12:34:56");
    expect(parsed.backlogOnly.project).toBe("0o17");
    expect(parsed.backlogOnly.onStatusChange).toBe("0X1f");
  });
});
