// 需求/16 第 1 期 R4：外部变更检测 + 重盖 revision。
//
// 覆盖的场景（对应任务书「测试要求」逐条）：
//   1. 手工改文件（绕过 store）后，reconcileExternalChanges() 能检测到并推进 revision
//   2. 重盖后用旧 expectedRevision 做 CAS 会失败（端到端断言：这是整件事的目的）
//   3. 重盖不丢用户改动（改后的标题原样保留）
//   4. 防自激：连续调两次，第二次不产生新的写
//   5. git checkout 式批量替换（一次改多个文件）
//   6. 外部删除文件的情况
//
// 落点：file-store-reconcile.ts 的 createTaskfoldExternalChangeReconciler（见该文件
// 头部注释的分层理由）。这里既直接测这个模块接进 createTaskfoldFileStores() 之后的
// 底层行为（`stores.dataVersion()`/`stores.cards`），也测经业务层
// TaskfoldStore.reconcileExternalChanges() 的端到端行为——后者才是真实调用路径
// （change-events.ts 的定时器最终调的是 store-core.ts 的 reconcileExternalChanges()）。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PersistedTaskfoldCard } from "@taskfold/core/persistence-types.js";
import { createTaskfoldFileStores } from "@taskfold/core/file-store.js";
import { TaskfoldStore } from "../packages/openclaw/src/backend/src/store.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function tempRoots(): { dataDir: string; pluginDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-file-store-reconcile-"));
  roots.push(root);
  return {
    dataDir: path.join(root, "repo", ".taskfold"),
    pluginDir: path.join(root, "plugin-state", "plugins", "taskfold"),
  };
}

function baseCard(overrides: Partial<PersistedTaskfoldCard["card"]> = {}): PersistedTaskfoldCard {
  const now = Date.now();
  return {
    version: 1,
    card: {
      id: "CARD-1",
      title: "示例卡片",
      status: "backlog",
      priority: "normal",
      labels: [],
      position: 1,
      createdAt: now,
      updatedAt: now,
      revision: 1,
      ...overrides,
    },
  };
}

/** 定位刚创建的卡片对应的 .md 文件——文件名里带展示 ID 与标题（file-store-cards.ts 的
 * cardFileName），按标题子串找即可，测试用的标题都特意避开会互相包含的写法。 */
function findCardFile(cardsDir: string, titleSubstring: string): string {
  const match = fs
    .readdirSync(cardsDir)
    .find((name) => name.endsWith(".md") && name.includes(titleSubstring));
  if (!match) {
    throw new Error(`test setup: 在 ${cardsDir} 找不到标题含"${titleSubstring}"的卡片文件`);
  }
  return path.join(cardsDir, match);
}

/** 模拟人手用编辑器打开 .md 文件、只改了 frontmatter 的 title 字段就保存——这类外部
 * 写入者根本不知道 TASKFOLD 哨兵区块里还藏着一个 revision，所以故意不碰那部分。 */
function handEditTitle(filePath: string, newTitle: string): void {
  const content = fs.readFileSync(filePath, "utf8");
  const originalLine = content.split("\n").find((line) => line.startsWith("title:"));
  if (!originalLine) {
    throw new Error(`test setup: ${filePath} 里找不到 frontmatter 的 title 行`);
  }
  const updated = content.replace(originalLine, `title: ${newTitle}`);
  fs.writeFileSync(filePath, updated);
}

describe("createTaskfoldFileStores 底层：dataVersion() 本身即完成「探测 + 重盖」", () => {
  it("手工改动被 dataVersion() 探测到后，cards.lookup() 立即看到重盖后的 revision 与新内容", async () => {
    const { dataDir, pluginDir } = tempRoots();
    const stores = createTaskfoldFileStores({ dataDir, pluginDir });
    const cardsDir = path.join(dataDir, "cards");
    await stores.cards.register("CARD-1", baseCard());

    handEditTitle(findCardFile(cardsDir, "示例卡片"), "手工改过的标题");

    // dataVersion() 的返回值变化即代表探测到了外部改动；重盖发生在这次调用内部。
    const before = 0; // 构造之后、外部编辑之前从未调用过，基线尚未被观察。
    const after = stores.dataVersion();
    expect(after).toBeGreaterThan(before);

    const lookedUp = await stores.cards.lookup("CARD-1");
    expect(lookedUp?.card.revision).toBe(2);
    expect(lookedUp?.card.title).toBe("手工改过的标题");
  });
});

describe("TaskfoldStore.reconcileExternalChanges()：R4 端到端", () => {
  it("手工改文件后能检测到并推进 revision", async () => {
    const { dataDir, pluginDir } = tempRoots();
    const stores = createTaskfoldFileStores({ dataDir, pluginDir });
    const store = TaskfoldStore.fromSqliteStores(stores);
    const cardsDir = path.join(dataDir, "cards");

    const created = await store.create({ title: "外部编辑测试卡" });
    expect(created.revision).toBe(1);

    handEditTitle(findCardFile(cardsDir, "外部编辑测试卡"), "被用户手工改过的标题");

    expect(store.reconcileExternalChanges()).toBe(true);

    const reloaded = await store.get(created.id);
    expect(reloaded?.revision).toBe(2);
  });

  it("重盖后用旧 expectedRevision 做 CAS 会失败——不会静默覆盖用户的手工改动", async () => {
    const { dataDir, pluginDir } = tempRoots();
    const stores = createTaskfoldFileStores({ dataDir, pluginDir });
    const store = TaskfoldStore.fromSqliteStores(stores);
    const cardsDir = path.join(dataDir, "cards");

    const created = await store.create({ title: "CAS 冲突测试卡" });
    const staleRevision = created.revision; // UI 此刻缓存的 revision。

    handEditTitle(findCardFile(cardsDir, "CAS 冲突测试卡"), "用户在 UI 之外改的标题");
    store.reconcileExternalChanges();

    // UI 还攥着 staleRevision，基于它提交一次修改：这必须失败，走结构化冲突，而不是
    // 静默覆盖用户刚做的手工改动——这是整件事的目的。
    await expect(
      store.update(
        created.id,
        { notes: "UI 基于旧 revision 提交的修改" },
        { expectedRevision: staleRevision },
      ),
    ).rejects.toThrow(/changed since revision/);

    // 确认真的没有被覆盖：标题仍是用户手工改的那个,不是 UI 那次失败的写。
    const survived = await store.get(created.id);
    expect(survived?.title).toBe("用户在 UI 之外改的标题");
  });

  it("重盖不丢用户改动：手工改过的标题原样保留", async () => {
    const { dataDir, pluginDir } = tempRoots();
    const stores = createTaskfoldFileStores({ dataDir, pluginDir });
    const store = TaskfoldStore.fromSqliteStores(stores);
    const cardsDir = path.join(dataDir, "cards");

    const created = await store.create({ title: "改动保留测试卡" });
    handEditTitle(findCardFile(cardsDir, "改动保留测试卡"), "改动保留测试卡-手工新标题");
    expect(store.reconcileExternalChanges()).toBe(true);

    // 同时断言 revision 确实被重盖了（证明真的走了 R4 的重盖路径，不是 lookup 本来就会
    // 原样读到磁盘最新内容这个无关事实凑巧让断言通过）和内容没有被丢掉/还原。
    const reloaded = await store.get(created.id);
    expect(reloaded?.revision).toBe(created.revision + 1);
    expect(reloaded?.title).toBe("改动保留测试卡-手工新标题");
    expect(reloaded?.title).not.toBe("改动保留测试卡");
  });

  it("防自激：连续调两次，第二次不产生新的写", async () => {
    const { dataDir, pluginDir } = tempRoots();
    const stores = createTaskfoldFileStores({ dataDir, pluginDir });
    const store = TaskfoldStore.fromSqliteStores(stores);
    const cardsDir = path.join(dataDir, "cards");

    const created = await store.create({ title: "防自激测试卡" });
    const filePath = findCardFile(cardsDir, "防自激测试卡");
    handEditTitle(filePath, "防自激测试卡-手工改动一次");

    expect(store.reconcileExternalChanges()).toBe(true);
    const afterFirst = await store.get(created.id);
    expect(afterFirst?.revision).toBe(2);
    const contentAfterFirst = fs.readFileSync(filePath, "utf8");

    // 第二次调用：没有任何新的外部改动，不应该再重盖一次，也不应该再广播一次变化。
    expect(store.reconcileExternalChanges()).toBe(false);
    const afterSecond = await store.get(created.id);
    expect(afterSecond?.revision).toBe(2);
    expect(fs.readFileSync(filePath, "utf8")).toBe(contentAfterFirst);
  });

  it("git checkout 式批量替换：一次改多个文件，每张改过的卡各自重盖一次，没改的不受影响", async () => {
    const { dataDir, pluginDir } = tempRoots();
    const stores = createTaskfoldFileStores({ dataDir, pluginDir });
    const store = TaskfoldStore.fromSqliteStores(stores);
    const cardsDir = path.join(dataDir, "cards");

    const cardA = await store.create({ title: "批量卡A" });
    const cardB = await store.create({ title: "批量卡B" });
    const cardC = await store.create({ title: "批量卡C" });

    // 模拟 git checkout：几乎同一时刻把多个文件的内容整体换掉；C 故意不改。
    handEditTitle(findCardFile(cardsDir, "批量卡A"), "批量卡A-已切换分支");
    handEditTitle(findCardFile(cardsDir, "批量卡B"), "批量卡B-已切换分支");

    expect(store.reconcileExternalChanges()).toBe(true);

    const [reloadedA, reloadedB, reloadedC] = await Promise.all([
      store.get(cardA.id),
      store.get(cardB.id),
      store.get(cardC.id),
    ]);
    expect(reloadedA?.revision).toBe(2);
    expect(reloadedA?.title).toBe("批量卡A-已切换分支");
    expect(reloadedB?.revision).toBe(2);
    expect(reloadedB?.title).toBe("批量卡B-已切换分支");
    // 没被外部改过的卡不应该被误判、误重盖。
    expect(reloadedC?.revision).toBe(1);
    expect(reloadedC?.title).toBe("批量卡C");
  });

  it("外部删除文件：能感知到变化、查询返回 undefined，且不抛错、不死循环", async () => {
    const { dataDir, pluginDir } = tempRoots();
    const stores = createTaskfoldFileStores({ dataDir, pluginDir });
    const store = TaskfoldStore.fromSqliteStores(stores);
    const cardsDir = path.join(dataDir, "cards");

    const created = await store.create({ title: "待删除测试卡" });
    fs.unlinkSync(findCardFile(cardsDir, "待删除测试卡"));

    let changed: boolean | undefined;
    expect(() => {
      changed = store.reconcileExternalChanges();
    }).not.toThrow();
    expect(changed).toBe(true);

    const reloaded = await store.get(created.id);
    expect(reloaded).toBeUndefined();

    // 再调一次：同样的防自激保证在删除场景下也要成立，不能抛错也不能反复广播。
    expect(() => store.reconcileExternalChanges()).not.toThrow();
    expect(store.reconcileExternalChanges()).toBe(false);
  });
});
