// `taskfold statuses`（需求/22-状态模型 第 4 步）：真实子进程跑构建出来的 CLI bundle。
import fs from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildCliBundle, cardFilePath, cleanupTempDirs, makeTempGitRepo, runCliProcess, runJson } from "./helpers/cli-harness.js";

let bundle: string;
beforeAll(() => {
  bundle = buildCliBundle();
}, 60_000);
afterAll(() => cleanupTempDirs());

async function repo() {
  const dir = makeTempGitRepo();
  await runJson(bundle, ["init"], { cwd: dir });
  return dir;
}
const ids = (result: Record<string, any>) => (result.statuses as Array<{ id: string }>).map((status) => status.id);

describe("taskfold statuses", () => {
  it("没配置时列出默认 5 个（没卡在用 triage / backlog 就不列），configured=false", async () => {
    const dir = await repo();
    const result = await runJson(bundle, ["statuses"], { cwd: dir });
    expect(result).toMatchObject({ kind: "status-list", configured: false });
    expect(ids(result)).toEqual(["todo", "running", "review", "done", "cancelled"]);

    // 有卡在用旧的 triage 时，它会出现在列表里（与迁移后一致）。
    await runJson(bundle, ["create", "Idea", "--status", "triage"], { cwd: dir });
    expect(ids(await runJson(bundle, ["statuses"], { cwd: dir }))).toEqual([
      "triage",
      "todo",
      "running",
      "review",
      "done",
      "cancelled",
    ]);
  });

  it("add / edit / move / remove：写进 config.yml，格式版本升到 4", async () => {
    const dir = await repo();
    const added = await runJson(
      bundle,
      ["statuses", "add", "testing", "--category", "started", "--name", "测试中", "--before", "review"],
      { cwd: dir },
    );
    expect(ids(added)).toEqual(["todo", "running", "testing", "review", "done", "cancelled"]);
    const config = fs.readFileSync(`${dir}/.taskfold/config.yml`, "utf8");
    expect(config).toMatch(/^format_version: 4$/m);
    expect(config).toContain('name: "测试中"');

    const edited = await runJson(bundle, ["statuses", "edit", "testing", "--color", "#2563eb", "--role", "review"], { cwd: dir });
    const testing = (edited.statuses as any[]).find((status) => status.id === "testing");
    expect(testing).toMatchObject({ color: "#2563eb", role: "review" });
    // role 只能有一个：review 状态上的 role 被摘掉
    expect((edited.statuses as any[]).find((status) => status.id === "review").role).toBeUndefined();

    const moved = await runJson(bundle, ["statuses", "move", "testing", "--after", "done"], { cwd: dir });
    expect(ids(moved).indexOf("testing")).toBe(ids(moved).indexOf("done") + 1);

    const removed = await runJson(bundle, ["statuses", "remove", "testing"], { cwd: dir });
    expect(ids(removed)).not.toContain("testing");
    expect(removed.moved).toBe(0);
  });

  it("新状态能当卡片的状态；未知状态是 INVALID_ARGUMENT，并列出可选值", async () => {
    const dir = await repo();
    await runJson(bundle, ["statuses", "add", "testing", "--category", "started"], { cwd: dir });
    const card = (await runJson(bundle, ["create", "T", "--status", "testing"], { cwd: dir })).card;
    expect(card).toMatchObject({ status: "testing", phase: "running" });

    const bad = await runCliProcess(bundle, ["create", "X", "--status", "nope"], { cwd: dir });
    expect(bad.code).toBe(2);
    const error = JSON.parse(bad.stderr.trim()).error;
    expect(error.code).toBe("INVALID_ARGUMENT");
    expect(error.message).toContain("testing");

    const badList = await runCliProcess(bundle, ["list", "--status", "nope"], { cwd: dir });
    expect(badList.code).toBe(2);
  });

  it("remove：有卡在用必须指定 --move-cards-to，先移卡再删状态", async () => {
    const dir = await repo();
    await runJson(bundle, ["statuses", "add", "testing", "--category", "started"], { cwd: dir });
    const card = (await runJson(bundle, ["create", "T", "--status", "testing"], { cwd: dir })).card;

    const refused = await runCliProcess(bundle, ["statuses", "remove", "testing"], { cwd: dir });
    expect(refused.code).toBe(8);
    expect(refused.stderr).toContain("used by 1 card");

    const removed = await runJson(bundle, ["statuses", "remove", "testing", "--move-cards-to", "running"], { cwd: dir });
    expect(removed.moved).toBe(1);
    expect((await runJson(bundle, ["show", card.id], { cwd: dir })).card.status).toBe("running");
  });

  it("至少要保留一个 unstarted 和一个 completed 状态", async () => {
    const dir = await repo();
    await runJson(bundle, ["statuses", "add", "extra", "--category", "completed"], { cwd: dir });
    await runJson(bundle, ["statuses", "remove", "done"], { cwd: dir });
    const refused = await runCliProcess(bundle, ["statuses", "remove", "extra"], { cwd: dir });
    expect(refused.code).toBe(8);
    expect(JSON.parse(refused.stderr.trim()).error.message).toContain('"completed" status is required');
  });
});

describe("旧值兼容", () => {
  it("update --status ready 打派发标记，list --status ready 按阶段筛出来", async () => {
    const dir = await repo();
    const card = (await runJson(bundle, ["create", "Q"], { cwd: dir })).card;
    const updated = await runJson(bundle, ["update", card.id, "--status", "ready"], { cwd: dir });
    expect(updated.card).toMatchObject({ status: "todo", phase: "ready" });
    const listed = await runJson(bundle, ["list", "--status", "ready"], { cwd: dir });
    expect((listed.cards as any[]).map((entry) => entry.id)).toEqual([card.id]);
    const text = await runCliProcess(bundle, ["list"], { cwd: dir });
    expect(text.stdout).toContain("(ready)");
  });

  it("磁盘上的旧 blocked 卡：list 里显示 phase=blocked", async () => {
    const dir = await repo();
    const card = (await runJson(bundle, ["create", "B"], { cwd: dir })).card;
    const file = cardFilePath(dir, card.id);
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/^status: .*$/m, "status: blocked"));
    const shown = await runJson(bundle, ["show", card.id], { cwd: dir });
    expect(shown.card.phase).toBe("blocked");
  });
});
