// TASK-10：position 相同时卡片的次级排序键。
//
// SQLite 后端的 entries() 是 `ORDER BY created_at ASC, id ASC`（sqlite-store.ts），上层
// compareCards 按 status → position → createdAt 排、稳定排序保留其余次序——所以迁移前 UI
// 实际看到的顺序，在三者都相同时由 id 的字节序（SQLite 默认 BINARY 排序规则）决定。文件后端的
// entries() 是目录顺序（按文件名 card-N），不带这层隐含次序；compareCards 显式加上 id 字节序
// 作为最后一级，两个后端才给出同一个顺序。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { TaskfoldCard } from "@taskfold/core/contract/index.js";
import { createTaskfoldFileStores } from "@taskfold/core/file-store.js";
import { createTaskfoldSqliteStores } from "../src/backend/src/sqlite-store.js";
import { TaskfoldStore } from "../src/backend/src/store.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-card-order-"));
  roots.push(root);
  return root;
}

const CREATED = Date.UTC(2026, 6, 29, 2, 41, 42, 225);

function tiedCard(id: string): TaskfoldCard {
  return {
    id,
    title: `卡 ${id}`,
    status: "done",
    priority: "normal",
    labels: [],
    position: 1000,
    createdAt: CREATED,
    updatedAt: CREATED,
    revision: 1,
    metadata: { automation: { boardId: "procloud" } },
  };
}

// 写入顺序故意与 id 字节序相反，且含 "-" 与字母混排（localeCompare 会忽略 "-"，与 SQLite 的
// BINARY 排序不同）：目录顺序 card-1..3 = c-b、cb、c-a。
const IDS_IN_WRITE_ORDER = ["c-b", "cb", "c-a"];

describe("compareCards：status/position/createdAt 全相同时按 id 字节序", () => {
  it("文件后端列出的顺序与 SQLite 后端完全一致", async () => {
    const root = tempRoot();
    const sqlite = createTaskfoldSqliteStores({ dbPath: path.join(root, "taskfold.sqlite") });
    const files = createTaskfoldFileStores({ dataDir: path.join(root, "repo", ".taskfold") });
    for (const id of IDS_IN_WRITE_ORDER) {
      await sqlite.cards.register(id, { version: 1, card: tiedCard(id) });
      await files.cards.register(id, { version: 1, card: tiedCard(id) });
    }
    const sqliteOrder = (await TaskfoldStore.fromStores(sqlite).list({ boardId: "procloud" })).map((c) => c.id);
    const fileOrder = (await TaskfoldStore.fromStores(files).list({ boardId: "procloud" })).map((c) => c.id);
    sqlite.close();
    expect(sqliteOrder).toEqual(["c-a", "c-b", "cb"]);
    expect(fileOrder).toEqual(sqliteOrder);
  });
});
