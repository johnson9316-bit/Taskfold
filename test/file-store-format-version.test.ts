// 需求/18 §3.9 / TASK-4 AC#3：`.taskfold/config.yml` 记录格式版本；core 遇到比自己新的格式
// 只读不写——读照常，写操作被拒并提示升级，`.taskfold/` 一个字节都不改（包括运行态重盖、
// changes.log 追加、目录初始化这些后台写入）。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PersistedTaskfoldCard } from "@taskfold/core/persistence-types.js";
import {
  createTaskfoldFileStores,
  TASKFOLD_FORMAT_VERSION,
  TaskfoldFormatTooNewError,
} from "@taskfold/core/file-store.js";
import { TaskfoldStore } from "../packages/openclaw/src/backend/src/store.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function tempRoots(): { dataDir: string; pluginDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-format-version-"));
  roots.push(root);
  return {
    dataDir: path.join(root, "repo", ".taskfold"),
    pluginDir: path.join(root, "plugin-state", "plugins", "taskfold"),
  };
}

function openStore(dataDir: string, pluginDir: string): TaskfoldStore {
  return TaskfoldStore.fromStores(createTaskfoldFileStores({ dataDir, pluginDir }));
}

/** 目录下每个文件的相对路径 → 内容。 */
function snapshot(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) {
      const filePath = path.join(entry.parentPath, entry.name);
      files[path.relative(dir, filePath)] = fs.readFileSync(filePath, "utf8");
    }
  }
  return files;
}

function onlyCardFile(dataDir: string): string {
  const [fileName] = fs.readdirSync(path.join(dataDir, "cards")).filter((name) => name.endsWith(".md"));
  return path.join(dataDir, "cards", fileName!);
}

const UPGRADE_HINT = /format_version 是 \d+，本版 Taskfold 只支持到 \d+.*只读.*请把 Taskfold.*升级/s;

describe("TASK-4 AC#3：config.yml 格式版本高于 core 时只读不写", () => {
  it("#3 版本号高于 core：读照常，写操作被拒并提示升级，.taskfold/ 一个字节都不改", async () => {
    const { dataDir, pluginDir } = tempRoots();
    const current = openStore(dataDir, pluginDir);
    const card = await current.create({ title: "新格式项目里的卡" });
    // 模拟更新版本的 core 升级了格式，并且有人手改过卡片（本来会触发运行态重盖）。
    fs.writeFileSync(path.join(dataDir, "config.yml"), `format_version: ${TASKFOLD_FORMAT_VERSION + 1}\n`);
    fs.appendFileSync(onlyCardFile(dataDir), "\n人手补的一行\n");
    const before = snapshot(dataDir);

    const store = openStore(dataDir, pluginDir);
    store.announceChangeEpoch();
    store.reconcileExternalChanges();
    expect((await store.get(card.id))?.title).toBe("新格式项目里的卡");
    expect(await store.list()).toHaveLength(1);

    await expect(store.create({ title: "不该落盘" })).rejects.toThrow(UPGRADE_HINT);
    await expect(store.update(card.id, { notes: "不该落盘" })).rejects.toThrow(TaskfoldFormatTooNewError);
    await expect(store.delete(card.id)).rejects.toThrow(TaskfoldFormatTooNewError);

    const raw = createTaskfoldFileStores({ dataDir, pluginDir });
    const persisted = (await raw.cards.lookup(card.id)) as PersistedTaskfoldCard;
    await expect(raw.cards.register(card.id, persisted)).rejects.toThrow(UPGRADE_HINT);
    await expect(raw.cards.compareAndSwap(card.id, persisted.card.revision, persisted)).rejects.toThrow(
      TaskfoldFormatTooNewError,
    );
    await expect(raw.cards.delete(card.id)).rejects.toThrow(TaskfoldFormatTooNewError);
    expect(() => raw.reserveChangeRevisions(1)).toThrow(TaskfoldFormatTooNewError);
    raw.dataVersion();

    expect(snapshot(dataDir)).toEqual(before);
  });

  it("运行期间被别的进程升级了格式：本进程的下一次写入就被拒", async () => {
    const { dataDir, pluginDir } = tempRoots();
    const store = openStore(dataDir, pluginDir);
    const card = await store.create({ title: "运行中被升级" });
    fs.writeFileSync(path.join(dataDir, "config.yml"), `format_version: ${TASKFOLD_FORMAT_VERSION + 1}\n`);

    await expect(store.update(card.id, { notes: "不该落盘" })).rejects.toThrow(UPGRADE_HINT);
    expect((await store.get(card.id))?.notes).toBeUndefined();
  });

  it("无法识别的版本值同样只读", async () => {
    const { dataDir, pluginDir } = tempRoots();
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, "config.yml"), "format_version: next\n");

    await expect(openStore(dataDir, pluginDir).create({ title: "不该落盘" })).rejects.toThrow(
      TaskfoldFormatTooNewError,
    );
    expect(fs.readdirSync(dataDir)).toEqual(["config.yml"]);
  });

  it("版本号不高于 core 时照常读写；新项目初始化时写下当前格式版本", async () => {
    const { dataDir, pluginDir } = tempRoots();
    const store = openStore(dataDir, pluginDir);
    expect(fs.readFileSync(path.join(dataDir, "config.yml"), "utf8")).toBe(
      `format_version: ${TASKFOLD_FORMAT_VERSION}\n`,
    );
    const card = await store.create({ title: "当前格式" });
    expect((await store.update(card.id, { notes: "照常写" })).notes).toBe("照常写");
  });

  it("已有 config.yml 但没有版本键：补一行，其他内容原样保留", () => {
    const { dataDir, pluginDir } = tempRoots();
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, "config.yml"), 'project_name: "demo"');

    createTaskfoldFileStores({ dataDir, pluginDir });

    expect(fs.readFileSync(path.join(dataDir, "config.yml"), "utf8")).toBe(
      `project_name: "demo"\nformat_version: ${TASKFOLD_FORMAT_VERSION}\n`,
    );
  });
});
