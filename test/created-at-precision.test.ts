// TASK-10：createdAt 保留毫秒精度。
//
// frontmatter 的 `created_date` 是 Backlog 兼容的「YYYY-MM-DD HH:mm」，只到分钟；SQLite 里的
// createdAt 是毫秒。迁移后看板按 createdAt 排序（Taskfold 看板）或按它给同 position 的卡决胜
// （store-card-helpers.ts 的 compareCards），截到分钟会让同一分钟里建的卡换位。定案：毫秒值另存
// 在 TASKFOLD 区块（createdAt 建卡后不再变，不会造成 Git 抖动），created_date 照旧写分钟值给
// Backlog 看；读取时两者在分钟粒度上一致才用毫秒值——有人手改了 created_date 就以它为准。
// 里程碑同样处理。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { TaskfoldCard, TaskfoldMilestone } from "@taskfold/core/contract/index.js";
import { createTaskfoldFileStores } from "@taskfold/core/file-store.js";
import {
  parseMarkdownCard,
  serializeMarkdownCard,
  type MarkdownCardDocument,
} from "@taskfold/core/markdown-card-format.js";
import {
  parseMarkdownMilestone,
  serializeMarkdownMilestone,
} from "@taskfold/core/markdown-milestone-format.js";

const CREATED_MS = Date.UTC(2026, 6, 29, 2, 41, 42, 225);
const UPDATED_MS = Date.UTC(2026, 8, 18, 5, 49, 27, 320);

function card(overrides: Partial<TaskfoldCard> = {}): TaskfoldCard {
  return {
    id: "0104be72-1b09-4378-a25c-3be577861521",
    title: "毫秒精度",
    status: "todo",
    priority: "normal",
    labels: [],
    position: 1000,
    createdAt: CREATED_MS,
    updatedAt: UPDATED_MS,
    revision: 3,
    ...overrides,
  };
}

function cardDoc(value: TaskfoldCard): MarkdownCardDocument {
  return {
    card: value,
    displayId: { prefix: "CARD", numericId: 1 },
    backlogOnly: {},
    descriptionBody: "",
    trailing: "",
  };
}

function milestone(overrides: Partial<TaskfoldMilestone> = {}): TaskfoldMilestone {
  return {
    id: "715bbd46-bfe0-448f-be4a-370388287883",
    boardId: "flowboard",
    title: "M1",
    position: 1000,
    state: "active",
    createdAt: CREATED_MS,
    updatedAt: Date.UTC(2026, 6, 29, 3, 0),
    ...overrides,
  };
}

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function tempDataDir(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-created-at-"));
  roots.push(root);
  return path.join(root, "repo", ".taskfold");
}

describe("卡片 createdAt 毫秒精度", () => {
  it("往返后 createdAt 保留毫秒，created_date 仍是 Backlog 的分钟格式", () => {
    const markdown = serializeMarkdownCard(cardDoc(card()));
    expect(markdown).toMatch(/^created_date: '?2026-07-29 02:41'?$/m);
    expect(parseMarkdownCard(markdown).card.createdAt).toBe(CREATED_MS);
  });

  it("有人手改了 created_date（分钟对不上）：以 created_date 为准", () => {
    const markdown = serializeMarkdownCard(cardDoc(card())).replace("2026-07-29 02:41", "2026-07-30 08:15");
    expect(parseMarkdownCard(markdown).card.createdAt).toBe(Date.UTC(2026, 6, 30, 8, 15));
  });

  it("旧文件的 TASKFOLD 区块里没有 createdAt：回退到 created_date 的分钟值", () => {
    const markdown = serializeMarkdownCard(cardDoc(card())).replace(/,\n\s*"createdAt": \d+/, "");
    expect(markdown).not.toContain('"createdAt"');
    expect(parseMarkdownCard(markdown).card.createdAt).toBe(Date.UTC(2026, 6, 29, 2, 41));
  });

  it("文件后端：写入后读回的 createdAt 与写入值逐毫秒一致", async () => {
    const stores = createTaskfoldFileStores({ dataDir: tempDataDir() });
    await stores.cards.register(card().id, { version: 1, card: card() });
    const stored = await stores.cards.lookup(card().id);
    expect(stored?.card.createdAt).toBe(CREATED_MS);
    expect(stored?.card.updatedAt).toBe(UPDATED_MS);
  });
});

describe("里程碑 createdAt 毫秒精度", () => {
  it("往返后 createdAt 保留毫秒，created_date 仍是分钟格式", () => {
    const markdown = serializeMarkdownMilestone({
      milestone: milestone(),
      displayId: { prefix: "M", numericId: 1 },
      trailing: "",
    });
    expect(markdown).toMatch(/^created_date: '?2026-07-29 02:41'?$/m);
    expect(parseMarkdownMilestone(markdown).milestone.createdAt).toBe(CREATED_MS);
  });

  it("有人手改了 created_date：以 created_date 为准", () => {
    const markdown = serializeMarkdownMilestone({
      milestone: milestone(),
      displayId: { prefix: "M", numericId: 1 },
      trailing: "",
    }).replace("2026-07-29 02:41", "2026-07-30 08:15");
    expect(parseMarkdownMilestone(markdown).milestone.createdAt).toBe(Date.UTC(2026, 6, 30, 8, 15));
  });

  it("文件后端：写入后读回的里程碑 createdAt 逐毫秒一致", async () => {
    const stores = createTaskfoldFileStores({ dataDir: tempDataDir() });
    await stores.milestones.register(milestone().id, { version: 1, milestone: milestone() });
    expect((await stores.milestones.lookup(milestone().id))?.milestone.createdAt).toBe(CREATED_MS);
  });
});
