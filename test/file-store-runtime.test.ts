// 需求/18 §3.7：运行态移出卡片 md + contentHash 外部修改检测（TASK-3）。
//
//   #1 持有 revision r，手工改卡片 md 正文，再以 expectedRevision=r 写入 → 冲突；
//   #2 claim / heartbeat 只写 gitignore 的 `.runtime/`，不改任何 Git 跟踪文件；
//   #3 删除 `.runtime/` 后卡片内容完整、revision 重新初始化、后续写入正常；
//   旧格式：TASKFOLD 区块里带运行态字段的卡片照常读取，写一次后字段迁出。
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTaskfoldFileStores } from "@taskfold/core/file-store.js";
import { TaskfoldStore } from "../packages/openclaw/src/backend/src/store.js";

const roots: string[] = [];

afterEach(() => {
  vi.useRealTimers();
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function tempRoots(): { repoDir: string; dataDir: string; pluginDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-file-store-runtime-"));
  roots.push(root);
  const repoDir = path.join(root, "repo");
  return {
    repoDir,
    dataDir: path.join(repoDir, ".taskfold"),
    pluginDir: path.join(root, "plugin-state", "plugins", "taskfold"),
  };
}

function openStore(dataDir: string, pluginDir: string): TaskfoldStore {
  return TaskfoldStore.fromStores(createTaskfoldFileStores({ dataDir, pluginDir }));
}

function onlyCardFile(dataDir: string): string {
  const cardsDir = path.join(dataDir, "cards");
  const files = fs.readdirSync(cardsDir).filter((name) => name.endsWith(".md"));
  expect(files).toHaveLength(1);
  return path.join(cardsDir, files[0]!);
}

/** 模拟人手改 Description 正文——只动人关心的内容，不碰 TASKFOLD 区块。 */
function handEditDescription(filePath: string, text: string): void {
  const content = fs.readFileSync(filePath, "utf8");
  const updated = content.replace(
    "<!-- SECTION:DESCRIPTION:BEGIN -->\n",
    `<!-- SECTION:DESCRIPTION:BEGIN -->\n${text}\n`,
  );
  expect(updated).not.toBe(content);
  fs.writeFileSync(filePath, updated);
}

function taskfoldSectionPayload(markdown: string): Record<string, unknown> {
  const match = /<!-- SECTION:TASKFOLD:BEGIN -->\n([\s\S]*?)\n<!-- SECTION:TASKFOLD:END -->/.exec(markdown);
  if (!match) {
    throw new Error("找不到 TASKFOLD 区块");
  }
  return JSON.parse(match[1]!) as Record<string, unknown>;
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.invalid", ...args], {
    cwd,
    encoding: "utf8",
  });
}

describe("运行态文件 + contentHash（需求/18 §3.7）", () => {
  it("#1 持有旧 revision 的写入方，在卡片 md 被手工改过之后写入被判冲突", async () => {
    const { dataDir, pluginDir } = tempRoots();
    const store = openStore(dataDir, pluginDir);
    const created = await store.create({ title: "外部修改检测卡" });
    const heldRevision = created.revision;

    handEditDescription(onlyCardFile(dataDir), "人手在编辑器里补的一段描述");

    // 不调用 reconcileExternalChanges()：检测必须发生在写入方拿到卡锁之后，不依赖轮询。
    await expect(
      store.update(created.id, { notes: "持旧 revision 的写入" }, { expectedRevision: heldRevision }),
    ).rejects.toThrow(/changed since revision/);

    const reloaded = await store.get(created.id);
    expect(reloaded?.revision).toBe(heldRevision + 1);
    expect(reloaded?.notes).toBeUndefined();
    expect(fs.readFileSync(onlyCardFile(dataDir), "utf8")).toContain("人手在编辑器里补的一段描述");
  });

  it("#2 claim 与心跳不改动任何 Git 跟踪文件", async () => {
    const { repoDir, dataDir, pluginDir } = tempRoots();
    fs.mkdirSync(repoDir, { recursive: true });
    git(repoDir, ["init", "-q"]);
    const store = openStore(dataDir, pluginDir);
    // 先让卡处于 running 且已有 agentId：claim 自身的状态流转（backlog→running、补 agentId）
    // 是人关心的状态，本来就该进 md，不在本条验收范围内。
    const created = await store.create({ title: "运行态隔离卡" });
    await store.update(created.id, { status: "running", agentId: "worker-1" });
    git(repoDir, ["add", "-A"]);
    git(repoDir, ["commit", "-q", "-m", "seed"]);
    expect(git(repoDir, ["status", "--porcelain"])).toBe("");

    // 只假造 Date：心跳跨越多个分钟，md 的 updated_date（分钟精度）若被改写就会露馅。
    const start = Date.now();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start + 60_000);
    const { token } = await store.claim(created.id, { ownerId: "worker-1" });
    let lastHeartbeatAt = 0;
    for (let i = 0; i < 3; i += 1) {
      vi.setSystemTime(start + (i + 2) * 120_000);
      lastHeartbeatAt = Date.now();
      await store.heartbeat(created.id, { token, ownerId: "worker-1" });
    }

    expect(git(repoDir, ["status", "--porcelain"])).toBe("");
    const reloaded = await store.get(created.id);
    expect(reloaded?.metadata?.claim?.token).toBe(token);
    expect(reloaded?.events?.at(-1)?.kind).toBe("heartbeat");
    // 上层看到的 updatedAt 仍是最后一次写入的时间，不停在 md 里的旧值上。
    expect(reloaded?.updatedAt).toBe(lastHeartbeatAt);
  });

  it("#3 删除 .runtime/ 后卡片内容完整、revision 重新初始化、后续写入正常", async () => {
    const { dataDir, pluginDir } = tempRoots();
    const store = openStore(dataDir, pluginDir);
    const created = await store.create({ title: "运行态丢失卡", notes: "人写的备注" });
    await store.update(created.id, { notes: "人写的备注 v2" });
    await store.update(created.id, { notes: "人写的备注 v3" });
    expect((await store.get(created.id))?.revision).toBe(3);

    fs.rmSync(path.join(dataDir, ".runtime"), { recursive: true, force: true });

    const reopened = openStore(dataDir, pluginDir);
    const reloaded = await reopened.get(created.id);
    expect(reloaded?.title).toBe("运行态丢失卡");
    expect(reloaded?.notes).toBe("人写的备注 v3");
    expect(reloaded?.revision).toBe(1);

    const written = await reopened.update(created.id, { notes: "丢失后再写" }, { expectedRevision: 1 });
    expect(written.revision).toBe(2);
    expect((await reopened.get(created.id))?.notes).toBe("丢失后再写");
  });

  it("旧格式：TASKFOLD 区块里带运行态字段的卡片照常读取，写一次后字段迁出", async () => {
    const { dataDir, pluginDir } = tempRoots();
    const cardsDir = path.join(dataDir, "cards");
    fs.mkdirSync(cardsDir, { recursive: true });
    const claim = { ownerId: "worker-1", token: "legacy-token", claimedAt: 1, lastHeartbeatAt: 2 };
    const execution = {
      id: "exec-1",
      kind: "agent-session",
      mode: "autonomous",
      status: "running",
      startedAt: 1,
      updatedAt: 2,
    };
    const legacyPayload = {
      uuid: "legacy-card-uuid",
      revision: 7,
      position: 1,
      notes: "旧格式备注",
      sessionKey: "session-legacy",
      runId: "run-legacy",
      taskId: "task-legacy",
      execution,
      events: [{ id: "e1", kind: "created", at: 1 }],
      metadata: { claim, comments: [{ id: "c1", body: "留着", createdAt: 1 }] },
    };
    fs.writeFileSync(
      path.join(cardsDir, "card-1 - 旧格式卡.md"),
      [
        "---",
        "id: CARD-1",
        "title: 旧格式卡",
        "status: running",
        "assignee: []",
        "created_date: '2026-09-18 00:00'",
        "labels: []",
        "dependencies: []",
        "priority: normal",
        "ordinal: 1",
        "---",
        "",
        "## Description",
        "",
        "<!-- SECTION:DESCRIPTION:BEGIN -->",
        "旧描述",
        "<!-- SECTION:DESCRIPTION:END -->",
        "",
        "## Taskfold",
        "",
        "<!-- SECTION:TASKFOLD:BEGIN -->",
        JSON.stringify(legacyPayload, null, 2),
        "<!-- SECTION:TASKFOLD:END -->",
        "",
      ].join("\n"),
    );

    const store = openStore(dataDir, pluginDir);
    const read = await store.get("legacy-card-uuid");
    // 旧格式初始化保守取 md 里的 revision + 1（运行态缺失期间 md 可能被外部改过）。
    expect(read?.revision).toBe(8);
    expect(read?.sessionKey).toBe("session-legacy");
    expect(read?.runId).toBe("run-legacy");
    expect(read?.taskId).toBe("task-legacy");
    expect(read?.execution).toEqual(execution);
    expect(read?.events?.[0]?.id).toBe("e1");
    expect(read?.metadata?.claim).toEqual(claim);
    expect(read?.metadata?.comments?.[0]?.body).toBe("留着");

    const written = await store.update("legacy-card-uuid", { notes: "新备注" }, { expectedRevision: 8 });
    expect(written.revision).toBe(9);

    const payload = taskfoldSectionPayload(fs.readFileSync(onlyCardFile(dataDir), "utf8"));
    for (const key of ["revision", "sessionKey", "runId", "taskId", "execution", "events"]) {
      expect(payload).not.toHaveProperty(key);
    }
    expect(payload.metadata).not.toHaveProperty("claim");
    expect(payload.notes).toBe("新备注");

    const after = await openStore(dataDir, pluginDir).get("legacy-card-uuid");
    expect(after?.revision).toBe(9);
    expect(after?.events?.[0]?.id).toBe("e1");
    expect(after?.sessionKey).toBe("session-legacy");
    expect(after?.taskId).toBe("task-legacy");
    expect(after?.execution?.id).toBe("exec-1");
    expect(after?.metadata?.claim?.token).toBe("legacy-token");
    expect(after?.metadata?.comments?.[0]?.body).toBe("留着");
  });

  it("旧格式卡片在运行态缺失期间被外部改过：持 md 里旧 revision 的写入被判冲突", async () => {
    const { dataDir, pluginDir } = tempRoots();
    const cardsDir = path.join(dataDir, "cards");
    fs.mkdirSync(cardsDir, { recursive: true });
    const filePath = path.join(cardsDir, "card-2 - 旧格式外改卡.md");
    fs.writeFileSync(
      filePath,
      [
        "---",
        "id: CARD-2",
        "title: 旧格式外改卡",
        "status: todo",
        "assignee: []",
        "created_date: '2026-09-18 00:00'",
        "labels: []",
        "dependencies: []",
        "priority: normal",
        "ordinal: 1",
        "---",
        "",
        "## Description",
        "",
        "<!-- SECTION:DESCRIPTION:BEGIN -->",
        "<!-- SECTION:DESCRIPTION:END -->",
        "",
        "## Taskfold",
        "",
        "<!-- SECTION:TASKFOLD:BEGIN -->",
        JSON.stringify({ uuid: "legacy-edited-uuid", revision: 5, position: 1 }, null, 2),
        "<!-- SECTION:TASKFOLD:END -->",
        "",
      ].join("\n"),
    );
    // 写入方此前读到 revision 5；随后 md 在没有运行态的情况下被外部改过。
    handEditDescription(filePath, "运行态缺失期间的外部修改");

    const store = openStore(dataDir, pluginDir);
    await expect(
      store.update("legacy-edited-uuid", { notes: "持旧 revision 的写入" }, { expectedRevision: 5 }),
    ).rejects.toThrow(/changed since revision/);
    expect(fs.readFileSync(filePath, "utf8")).toContain("运行态缺失期间的外部修改");
    expect((await store.get("legacy-edited-uuid"))?.notes).toBeUndefined();
  });
});
