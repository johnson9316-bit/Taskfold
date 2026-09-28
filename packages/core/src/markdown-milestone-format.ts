// Taskfold plugin module: 第 1 期格式层 —— 里程碑的 Markdown 表示。
//
// 范围边界与 markdown-card-format.ts 完全一致：本文件只做「字符串/对象 <-> 字符串/对象」
// 的纯函数转换，不碰文件系统、不分配里程碑 ID。
//
// 与 markdown-card-format.ts 同一套路（任务书明确要求）：
//   - Taskfold 独有字段放 `<!-- SECTION:TASKFOLD:BEGIN/END -->` 区块（JSON，理由见
//     markdown-card-format.ts 文件头「决策 1」——同样适用：里程碑没有任何外部工具会解析
//     这份文件，内部格式完全自由，JSON.stringify/JSON.parse 天然满足 R6）；
//   - `## Description` 必须带完整哨兵，即使为空（P0 雷 #2，同一防线）；
//   - Description/Taskfold 两个已识别区块之外的其余正文原样保留，不重新排版；
//   - 复用 markdown-card-format.ts 已导出的 YAML/frontmatter 编解码、哨兵查找、
//     旧展示 ID 解析，不重新实现一遍。
//
// 与卡片格式层的一处实质差异：TaskfoldMilestone 本身就带一个 `description` 字段
// （不像 TaskfoldCard——TaskfoldCard 完全没有 description，`## Description` 区块内容
// 是独立于卡片任何字段的纯用户内容）。这里 `## Description` 区块直接就是
// `milestone.description` 的载体，不是与业务字段脱钩的旁路内容，因此
// `MarkdownMilestoneDocument` 不需要像 `MarkdownCardDocument` 那样单独维护一份
// `descriptionBody`——直接读写 `milestone.description` 即可，少一样容易读写不同步的
// 重复状态。
//
// 里程碑没有 Backlog.md 对应的原生概念（backlog 的 frontmatter `milestone` 只是任务上的
// 一个字符串字段，不是独立实体），所以这里也没有 markdown-card-format.ts 那份
// `BacklogOnlyFrontmatterFields`——没有外部格式契约要兼容，frontmatter 白名单是
// Taskfold 自己定的，字段也就相应少得多。

import type { TaskfoldMilestone, TaskfoldMilestoneState } from "./contract/index.js";
import {
  buildSentinelSectionBlock,
  escapeTaskfoldBodyText,
  findSectionFamilyBlock,
  formatBacklogDateTime,
  numberValue,
  parseBacklogDateTime,
  resolvePreciseTimestamp,
  parseCardFrontmatterId,
  parseFrontmatterBlock,
  requiredString,
  splitFrontmatter,
  stringifyFrontmatterBlock,
  stringValue,
  type FrontmatterFieldValue,
} from "./markdown-card-format.js";

export type MarkdownMilestoneDocument = {
  milestone: TaskfoldMilestone;
  /**
   * Description/Taskfold 两个已识别区块之外的其余正文，按原始相对顺序原样保留——这些
   * 内容不是 Taskfold 写的，格式层不应该篡改（同 markdown-card-format.ts 的 `trailing`）。
   */
  trailing: string;
};

function buildTaskfoldMilestoneSectionJson(milestone: TaskfoldMilestone): string {
  const payload: Record<string, unknown> = {
    uuid: milestone.id,
    boardId: milestone.boardId,
    // 完整精度的排序值，同卡片的「决策 4」：frontmatter 的 ordinal 只是四舍五入的整数
    // 投影，给人看/给未来的排序 UI 用；权威值存在这里。
    position: milestone.position,
    // 毫秒精度的创建时间，同卡片（markdown-card-format.ts 的 resolvePreciseTimestamp）。
    createdAt: milestone.createdAt,
  };
  if (milestone.color !== undefined) payload.color = milestone.color;
  if (milestone.completedAt !== undefined) payload.completedAt = milestone.completedAt;
  if (milestone.archivedAt !== undefined) payload.archivedAt = milestone.archivedAt;
  return JSON.stringify(payload, null, 2);
}

export function serializeMarkdownMilestone(doc: MarkdownMilestoneDocument): string {
  const { milestone } = doc;

  const frontmatterEntries: ReadonlyArray<readonly [string, FrontmatterFieldValue]> = [
    ["title", milestone.title],
    // state 不校验值域，照抄卡片格式层「决策 7」对 status 的做法。
    ["state", milestone.state],
    ["created_date", formatBacklogDateTime(milestone.createdAt)],
    ["updated_date", formatBacklogDateTime(milestone.updatedAt)],
    ["ordinal", Math.round(milestone.position)],
  ];
  const frontmatterText = stringifyFrontmatterBlock(frontmatterEntries);

  const bodyParts: string[] = [];
  bodyParts.push(
    buildSentinelSectionBlock(
      "Description",
      "DESCRIPTION",
      escapeTaskfoldBodyText(milestone.description ?? ""),
    ),
  );
  if (doc.trailing.trim()) {
    bodyParts.push(doc.trailing.trim());
  }
  bodyParts.push(buildSentinelSectionBlock("Taskfold", "TASKFOLD", buildTaskfoldMilestoneSectionJson(milestone)));

  const body = bodyParts.filter((part) => part.length > 0).join("\n\n");

  return `---\n${frontmatterText}\n---\n\n${body}\n`;
}

export function parseMarkdownMilestone(markdown: string): MarkdownMilestoneDocument {
  const { frontmatter, body } = splitFrontmatter(markdown);
  const fm = parseFrontmatterBlock(frontmatter);
  const lines = body.split("\n");

  const taskfoldBlock = findSectionFamilyBlock(lines, "Taskfold", "TASKFOLD");
  if (!taskfoldBlock) {
    throw new Error(
      "markdown-milestone-format: 缺少 <!-- SECTION:TASKFOLD:BEGIN/END --> 区块——该文件尚未被 Taskfold 写入过。" +
        "把一份非 Taskfold 写入的文件收编为里程碑文件不在格式层范围内，本函数对此直接抛错。",
    );
  }
  const taskfoldJsonText = lines.slice(taskfoldBlock.beginLineIndex + 1, taskfoldBlock.endLineIndex).join("\n");
  const payload = JSON.parse(taskfoldJsonText) as Record<string, unknown>;

  const title = requiredString(fm, "title");
  const state = requiredString(fm, "state") as TaskfoldMilestoneState;
  const createdAt = resolvePreciseTimestamp(
    payload.createdAt,
    parseBacklogDateTime(requiredString(fm, "created_date")),
  );
  const updatedDateRaw = stringValue(fm, "updated_date");
  const updatedAt = updatedDateRaw ? parseBacklogDateTime(updatedDateRaw) : createdAt;

  const positionFromPayload = typeof payload.position === "number" ? payload.position : undefined;
  const ordinal = numberValue(fm, "ordinal");
  const position = positionFromPayload ?? ordinal ?? 0;

  // 旧格式没有 UUID 时，保留原有展示标识作为实体标识；新格式必须有 UUID。
  const legacyId = stringValue(fm, "id");
  const uuid = typeof payload.uuid === "string" && payload.uuid
    ? payload.uuid
    : legacyId && parseCardFrontmatterId(legacyId) ? legacyId : undefined;
  if (!uuid) {
    throw new Error("markdown-milestone-format: 缺少 UUID 或有效的旧格式 id");
  }
  const boardId = typeof payload.boardId === "string" && payload.boardId ? payload.boardId : "default";

  const descriptionBlock = findSectionFamilyBlock(lines, "Description", "DESCRIPTION");
  const descriptionBody = descriptionBlock
    ? lines.slice(descriptionBlock.beginLineIndex + 1, descriptionBlock.endLineIndex).join("\n")
    : "";

  const milestone: TaskfoldMilestone = {
    id: uuid,
    boardId,
    title,
    ...(descriptionBody !== "" ? { description: descriptionBody } : {}),
    position,
    state,
    createdAt,
    updatedAt,
    ...(typeof payload.color === "string" ? { color: payload.color } : {}),
    ...(typeof payload.completedAt === "number" ? { completedAt: payload.completedAt } : {}),
    ...(typeof payload.archivedAt === "number" ? { archivedAt: payload.archivedAt } : {}),
  };

  const consumedLineIndexes = new Set<number>();
  const markConsumed = (block: { headingLineIndex: number; endLineIndex: number } | undefined) => {
    if (!block) return;
    for (let i = block.headingLineIndex; i <= block.endLineIndex; i += 1) {
      consumedLineIndexes.add(i);
    }
  };
  markConsumed(descriptionBlock);
  markConsumed(taskfoldBlock);
  const trailing = lines
    .filter((_line, index) => !consumedLineIndexes.has(index))
    .join("\n")
    .trim();

  return { milestone, trailing };
}
