// Taskfold plugin module: the injection seam between this file-store skeleton and the
// real Markdown+frontmatter serializer (需求/16 第 6.1/6.2/6.3 节). 第 1 期集成后，
// markdown-card-format.ts / markdown-milestone-format.ts 已经落地，本文件是把它们的
// `MarkdownCardDocument`/`MarkdownMilestoneDocument`（比 TaskfoldCard/TaskfoldMilestone
// 多带 displayId/描述正文/未识别正文等旁路字段）适配成 file-store-cards.ts /
// file-store-milestones.ts 需要的窄接口（只认 TaskfoldCard/TaskfoldMilestone）的那一层。
import type { TaskfoldCard, TaskfoldMilestone } from "./contract/index.js";
import {
  parseCardFrontmatterId,
  parseMarkdownCard,
  serializeMarkdownCard,
  type CardDisplayId,
  type MarkdownCardDocument,
} from "./markdown-card-format.js";
import {
  parseMarkdownMilestone,
  serializeMarkdownMilestone,
  type MarkdownMilestoneDocument,
} from "./markdown-milestone-format.js";

/**
 * Injection point for card (de)serialization. The real implementation must satisfy R6:
 * lossless round-trip that distinguishes an ABSENT field from a field whose value is
 * `null`, and R7: stable-id array elements keep their `id` and relative order.
 *
 * `previousContent`, when given, is the raw content of the file this write is about to
 * replace (or `undefined` for a brand-new key). It exists because the underlying
 * Markdown document carries several fields that `TaskfoldCard` itself does not
 * (displayId, backlog-only frontmatter fields, the Description/AC/DoD bodies, and any
 * unrecognized trailing prose) -- a `serialize` that only ever saw the bare `card` would
 * have to fabricate blank values for all of those on every write, silently discarding
 * whatever a human (or a future backlog-compatible tool) had put there. Implementations
 * that do not need a baseline (the JSON placeholder below) are free to ignore it.
 *
 * `displayIdHint`, when given, is the 展示 ID（"CARD-42"）that file-store-cards.ts just
 * allocated for a brand-new card (via file-store-card-id.ts's `allocateNextTaskfoldCardId`)
 * -- see this file's `fallbackCardDisplayId` doc for why a real implementation must prefer
 * this over its own placeholder fallback whenever the caller supplies it.
 */
export type TaskfoldCardCodec = {
  serialize(card: TaskfoldCard, previousContent?: string, displayIdHint?: CardDisplayId): string;
  parse(content: string): TaskfoldCard;
};

/**
 * Injection point for milestone (de)serialization, mirroring {@link TaskfoldCardCodec}.
 */
export type TaskfoldMilestoneCodec = {
  serialize(milestone: TaskfoldMilestone, previousContent?: string): string;
  parse(content: string): TaskfoldMilestone;
};

/**
 * 轻量占位编解码器：写到磁盘的内容是 JSON 字符串，不是 Backlog.md 兼容的
 * frontmatter + 哨兵区块 Markdown。第 1 期集成后不再是 `createTaskfoldFileStores()` 的
 * 默认值（见 file-store.ts，默认已换成 {@link createMarkdownCardCodec}），仅保留给需要
 * 一个不关心 Markdown 细节、纯粹能跑起来的编解码器的场景（例如隔离测试某个不涉及格式层
 * 的行为）使用。
 *
 * JSON.stringify/JSON.parse happen to already satisfy R6's ABSENT-vs-null distinction
 * (an object key set to `undefined` is dropped by JSON.stringify, exactly like a
 * genuinely-missing key; a key set to `null` round-trips as `null`), and there is no
 * separate baseline to preserve (the entire card *is* the JSON document), so this codec
 * simply ignores `previousContent`.
 */
export function createPlaceholderJsonCardCodec(): TaskfoldCardCodec {
  return {
    serialize(card: TaskfoldCard): string {
      return JSON.stringify(card, null, 2);
    },
    parse(content: string): TaskfoldCard {
      return JSON.parse(content) as TaskfoldCard;
    },
  };
}

/** Milestone counterpart of {@link createPlaceholderJsonCardCodec}; same caveats apply. */
export function createPlaceholderJsonMilestoneCodec(): TaskfoldMilestoneCodec {
  return {
    serialize(milestone: TaskfoldMilestone): string {
      return JSON.stringify(milestone, null, 2);
    },
    parse(content: string): TaskfoldMilestone {
      return JSON.parse(content) as TaskfoldMilestone;
    },
  };
}

/**
 * 展示 ID 分配器（file-store-card-id.ts 的 `allocateNextTaskfoldCardId`）现在接在
 * file-store-cards.ts 的写路径里，不是接在业务层的卡片创建路径——`card.id` 本身永远是
 * UUID（业务层不变，见需求/16 集成任务书的关键设计约束），从不会是 "PREFIX-N" 形态。
 * 所以这里 `parseCardFrontmatterId(card.id)` 这条分支在正常写路径下必然解析不出、必然
 * 走到占位 "CARD-0"——真正的展示 ID 现在由调用方通过 `serialize` 的 `displayIdHint`
 * 参数显式传入（见 {@link TaskfoldCardCodec} 的文档），本函数只在调用方没有传
 * `displayIdHint`（也没有可复用的 `previousContent`）时才会被触发，纯粹是防止
 * `MarkdownCardDocument.displayId`（必填字段）拿到 `undefined` 崩掉的最后一道防线，
 * 不代表真实分配结果。保留它而不删掉的理由：`serialize` 是导出的公共接口，不能假设
 * 未来所有调用方都会记得传 `displayIdHint`（比如测试直接调用 codec，或者将来加的新
 * 调用点忘了传）——防御性兜底比让 `serializeMarkdownCard` 直接抛异常/拿到 undefined
 * 更安全，代价只是极端情况下写出一个占位 ID，而不是整次写入失败。
 */
function fallbackCardDisplayId(card: TaskfoldCard): CardDisplayId {
  return parseCardFrontmatterId(card.id) ?? { prefix: "CARD", numericId: 0 };
}

/**
 * 真正的 Markdown+frontmatter 卡片编解码器（需求/16 第 6.1/6.2/6.3 节），桥接
 * markdown-card-format.ts 的 `MarkdownCardDocument`（比 `TaskfoldCard` 多带 displayId /
 * backlogOnly / descriptionBody / acceptanceCriteriaBody / definitionOfDoneBody /
 * trailing 六样）与 file-store-cards.ts 需要的窄接口。
 *
 * ⚠️ 这是本次集成要修的核心阻抗失配：如果 `serialize` 只认 `card`、每次都从空白
 * `MarkdownCardDocument` 重新生成，用户手写的验收条件/DoD/自定义段落会在 Taskfold
 * 第一次改状态时被整段抹掉（静默数据丢失）。做法：有 `previousContent` 时先从中还原
 * 完整的旧 doc，只用新 `card` 替换 `doc.card`，displayId/backlogOnly/描述正文/AC/DoD/
 * 未识别正文这六样原样保留；没有 `previousContent`（真正的新卡）才用全新的空白值。
 */
export function createMarkdownCardCodec(): TaskfoldCardCodec {
  return {
    serialize(card, previousContent, displayIdHint) {
      const previous = previousContent === undefined ? undefined : parseMarkdownCard(previousContent);
      const doc: MarkdownCardDocument = {
        card,
        displayId: previous?.displayId ?? displayIdHint ?? fallbackCardDisplayId(card),
        backlogOnly: previous?.backlogOnly ?? {},
        descriptionBody: previous?.descriptionBody ?? "",
        acceptanceCriteriaBody: previous?.acceptanceCriteriaBody,
        definitionOfDoneBody: previous?.definitionOfDoneBody,
        trailing: previous?.trailing ?? "",
      };
      return serializeMarkdownCard(doc);
    },
    parse(content) {
      return parseMarkdownCard(content).card;
    },
  };
}

/**
 * Milestone 版本的 {@link createMarkdownCardCodec}。比卡片简单：`TaskfoldMilestone`
 * 自带 `description` 字段（卡片没有对应字段），`## Description` 区块直接是它的载体，
 * 不需要像卡片那样单独保留一份「与业务字段脱钩」的正文——每次 serialize 都以
 * `milestone.description` 为准即可，天然与业务层的读改写循环一致。真正需要从
 * `previousContent` 找回来的只有未识别的 trailing 正文，这些内容
 * `TaskfoldMilestone` 上完全没有对应字段。
 */
export function createMarkdownMilestoneCodec(): TaskfoldMilestoneCodec {
  return {
    serialize(milestone, previousContent) {
      const previous = previousContent === undefined ? undefined : parseMarkdownMilestone(previousContent);
      const doc: MarkdownMilestoneDocument = {
        milestone,
        trailing: previous?.trailing ?? "",
      };
      return serializeMarkdownMilestone(doc);
    },
    parse(content) {
      return parseMarkdownMilestone(content).milestone;
    },
  };
}
