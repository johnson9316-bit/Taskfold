// TASK-10：Gateway 启动检查——taskfold.sqlite 还在、projects.json 还没有，说明旧数据没迁移：
// 打一条 WARN 提示运行 `openclaw taskfold migrate-sqlite`。只提示，不自动迁移。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTaskfoldSqliteMigrationCheckService } from "../packages/openclaw/src/backend/src/sqlite-migration-check.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function pluginDirWith(files: string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-migration-check-"));
  roots.push(root);
  const pluginDir = path.join(root, "plugins", "taskfold");
  fs.mkdirSync(pluginDir, { recursive: true });
  for (const file of files) {
    fs.writeFileSync(path.join(pluginDir, file), "");
  }
  return pluginDir;
}

async function warningsOnStart(pluginDir: string): Promise<string[]> {
  const warnings: string[] = [];
  const service = createTaskfoldSqliteMigrationCheckService(pluginDir);
  await service.start({ logger: { info() {}, warn: (m: string) => warnings.push(m), error() {} } } as never);
  return warnings;
}

describe("启动检查：未迁移的 SQLite 数据", () => {
  it("有 taskfold.sqlite、没有 projects.json：WARN 一条，提示迁移命令", async () => {
    const warnings = await warningsOnStart(pluginDirWith(["taskfold.sqlite"]));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("openclaw taskfold migrate-sqlite --dry-run");
    expect(warnings[0]).toContain("--apply");
  });

  it("已经有 projects.json，或者根本没有 SQLite：不提示", async () => {
    expect(await warningsOnStart(pluginDirWith(["taskfold.sqlite", "projects.json"]))).toEqual([]);
    expect(await warningsOnStart(pluginDirWith([]))).toEqual([]);
  });
});
