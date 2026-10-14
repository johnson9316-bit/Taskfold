// `taskfold migrate`（需求/22-状态模型 第 3 步）：真实子进程跑构建出来的 CLI bundle。
import fs from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildCliBundle,
  cardFilePath,
  cleanupTempDirs,
  makeTempGitRepo,
  runCliProcess,
  runJson,
} from "./helpers/cli-harness.js";

let bundle: string;
beforeAll(() => {
  bundle = buildCliBundle();
}, 60_000);
afterAll(() => cleanupTempDirs());

async function repoWithLegacyCards() {
  const repo = makeTempGitRepo();
  await runJson(bundle, ["init"], { cwd: repo });
  const ready = (await runJson(bundle, ["create", "Was ready"], { cwd: repo })).card;
  const blocked = (await runJson(bundle, ["create", "Was blocked"], { cwd: repo })).card;
  for (const [card, status] of [
    [ready, "ready"],
    [blocked, "blocked"],
  ] as const) {
    const file = cardFilePath(repo, card.id);
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/^status: .*$/m, `status: ${status}`));
  }
  return { repo, ready, blocked };
}

describe("taskfold migrate", () => {
  it("--dry-run 只报告，--json 形状固定，不写任何文件", async () => {
    const { repo } = await repoWithLegacyCards();
    const report = await runJson(bundle, ["migrate", "--dry-run"], { cwd: repo });
    expect(report.kind).toBe("migration");
    expect(report).toMatchObject({ dryRun: true, changed: false, total: 2, conflicts: [] });
    expect(report.rewrites).toEqual([
      expect.objectContaining({ from: "ready", to: "todo" }),
      expect.objectContaining({ from: "blocked", to: "running" }),
    ]);
    expect(fs.readFileSync(`${repo}/.taskfold/config.yml`, "utf8")).toMatch(/^format_version: 2$/m);
  });

  it("迁移后 list 看到新状态，config.yml 是格式版本 4，再跑一次是空操作", async () => {
    const { repo, ready, blocked } = await repoWithLegacyCards();
    const report = await runJson(bundle, ["migrate"], { cwd: repo });
    expect(report).toMatchObject({ dryRun: false, changed: true, wroteStatuses: true });
    expect(report.backupDir).toContain(".taskfold/.runtime/backup-");

    const config = fs.readFileSync(`${repo}/.taskfold/config.yml`, "utf8");
    expect(config).toMatch(/^format_version: 4$/m);
    expect(config).toMatch(/^statuses:$/m);
    const shown = (id: string) => runJson(bundle, ["show", id], { cwd: repo });
    expect((await shown(ready.id)).card.status).toBe("todo");
    expect((await shown(blocked.id)).card.status).toBe("running");

    const again = await runJson(bundle, ["migrate"], { cwd: repo });
    expect(again).toMatchObject({ changed: false, wroteStatuses: false });
  });

  it("人类可读输出：报告每张被改写的卡与备份位置", async () => {
    const { repo } = await repoWithLegacyCards();
    const result = await runCliProcess(bundle, ["migrate"], { cwd: repo });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("rewrote");
    expect(result.stdout).toContain("ready -> todo");
    expect(result.stdout).toContain("Backup:");
    const second = await runCliProcess(bundle, ["migrate"], { cwd: repo });
    expect(second.stdout).toContain("Already migrated");
  });
});
