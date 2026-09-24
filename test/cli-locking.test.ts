// TASK-5 AC#2：锁冲突 → LOCKED，revision 冲突 → CONFLICT，各自非零退出码。
//
// 锁冲突由另一个真实进程持锁制造（test/helpers/cli-lock-holder.ts，与 core 相同的 proper-lockfile
// 参数），不 mock。要点是 store 层把锁超时与 revision 冲突都映射成 CAS 返回 false（需求/16 R2），
// CLI 必须靠 core 带出的失败原因区分：下面「revision 正确、只是锁被占着」的用例若被报成
// CONFLICT，说明原因没有带出来。
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { taskfoldCardLockPath, taskfoldGlobalLockPath } from "@taskfold/core/file-store-locks.js";
import { TASKFOLD_CLI_EXIT_CODES } from "@taskfold/cli/errors.js";
import {
  buildCliBundle,
  cardFilePath,
  cleanupTempDirs,
  holdLockInAnotherProcess,
  makeTempGitRepo,
  runCliProcess,
  runJson,
} from "./helpers/cli-harness.js";

let bundle: string;

beforeAll(() => {
  bundle = buildCliBundle();
}, 60_000);

afterAll(() => {
  cleanupTempDirs();
});

async function repoWithCard(): Promise<{ repo: string; card: Record<string, any> }> {
  const repo = makeTempGitRepo();
  await runJson(bundle, ["init"], { cwd: repo });
  const { card } = await runJson(bundle, ["create", "Locked card", "--notes", "original body"], { cwd: repo });
  return { repo, card };
}

function parseError(stderr: string): Record<string, any> {
  const payload = JSON.parse(stderr.trim()) as Record<string, any>;
  expect(payload.kind).toBe("error");
  return payload.error;
}

async function holdCardLock(repo: string, cardId: string) {
  const locksDir = path.join(repo, ".taskfold", ".locks");
  return await holdLockInAnotherProcess(cardFilePath(repo, cardId), taskfoldCardLockPath(locksDir, cardId));
}

describe("taskfold 锁冲突与 revision 冲突", () => {
  it("另一个进程占着卡锁：字段级更新约 2 秒后返回 LOCKED，卡片不变；放锁后同一命令成功", async () => {
    const { repo, card } = await repoWithCard();
    const holder = await holdCardLock(repo, card.id);
    let result;
    try {
      result = await runCliProcess(bundle, ["update", card.id, "--status", "done", "--json"], { cwd: repo });
    } finally {
      await holder.release();
    }
    expect(result.code).toBe(TASKFOLD_CLI_EXIT_CODES.LOCKED);
    expect(result.stdout).toBe("");
    expect(parseError(result.stderr)).toMatchObject({
      code: "LOCKED",
      details: { id: card.id, reason: "lock-timeout", expectedRevision: card.revision },
    });
    expect((await runJson(bundle, ["show", card.id], { cwd: repo })).card).toMatchObject({
      status: "todo",
      revision: card.revision,
    });
    const retried = await runJson(bundle, ["update", card.id, "--status", "done"], { cwd: repo });
    expect(retried.card).toMatchObject({ status: "done", revision: card.revision + 1 });
  }, 30_000);

  it("revision 正确、只是锁被占着：整体替换正文报 LOCKED，不是 CONFLICT", async () => {
    const { repo, card } = await repoWithCard();
    const holder = await holdCardLock(repo, card.id);
    let result;
    try {
      result = await runCliProcess(
        bundle,
        ["update", card.id, "--notes", "new body", "--expect-revision", String(card.revision)],
        { cwd: repo },
      );
    } finally {
      await holder.release();
    }
    expect(result.code).toBe(TASKFOLD_CLI_EXIT_CODES.LOCKED);
    expect(parseError(result.stderr)).toMatchObject({ code: "LOCKED", details: { reason: "lock-timeout" } });
    expect((await runJson(bundle, ["show", card.id], { cwd: repo })).card.notes).toBe("original body");
  }, 30_000);

  it("另一个进程占着全局锁：新建卡片返回 LOCKED，什么都没写", async () => {
    const { repo } = await repoWithCard();
    const locksDir = path.join(repo, ".taskfold", ".locks");
    const globalLock = taskfoldGlobalLockPath(locksDir);
    const holder = await holdLockInAnotherProcess(globalLock.slice(0, -".lock".length), globalLock);
    let result;
    try {
      result = await runCliProcess(bundle, ["create", "Should not land"], { cwd: repo });
    } finally {
      await holder.release();
    }
    expect(result.code).toBe(TASKFOLD_CLI_EXIT_CODES.LOCKED);
    expect(parseError(result.stderr)).toMatchObject({ code: "LOCKED", details: { reason: "lock-timeout" } });
    expect(fs.readdirSync(path.join(repo, ".taskfold", "cards"))).toHaveLength(1);
  }, 30_000);

  it("revision 冲突：另一个进程在读与写之间改过卡片，整体替换正文返回 CONFLICT", async () => {
    const { repo, card } = await repoWithCard();
    // 本方读到 revision R；另一个 CLI 进程随后追加了一段正文。
    const seen = (await runJson(bundle, ["show", card.id], { cwd: repo })).card;
    await runJson(bundle, ["update", card.id, "--append-notes", "concurrent edit"], { cwd: repo });
    const result = await runCliProcess(
      bundle,
      ["update", card.id, "--notes", "overwrite", "--expect-revision", String(seen.revision)],
      { cwd: repo },
    );
    expect(result.code).toBe(TASKFOLD_CLI_EXIT_CODES.CONFLICT);
    expect(result.code).not.toBe(TASKFOLD_CLI_EXIT_CODES.LOCKED);
    expect(parseError(result.stderr)).toMatchObject({
      code: "CONFLICT",
      details: { reason: "revision", expectedRevision: seen.revision, currentRevision: seen.revision + 1 },
    });
    expect((await runJson(bundle, ["show", card.id], { cwd: repo })).card.notes).toBe(
      "original body\n\nconcurrent edit",
    );
  }, 30_000);
});
