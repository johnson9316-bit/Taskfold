import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PersistedTaskfoldAttachment, PersistedTaskfoldCard } from "../src/backend/src/persistence-types.js";
import { createTaskfoldFileStores } from "../src/backend/src/file-store.js";
import { createMarkdownCardCodec } from "../src/backend/src/file-store-codec.js";
import { allocateNextTaskfoldCardId } from "../src/backend/src/file-store-card-id.js";
import { resolveTaskfoldDataDir } from "../src/backend/src/file-store-paths.js";
import { TaskfoldStore } from "../src/backend/src/store.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function tempRoots(): { dataDir: string; pluginDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-file-store-"));
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

describe("createTaskfoldFileStores: cards CAS (R1/R2/R3)", () => {
  it("compareAndSwap 正向成功：修改落盘且 lookup 立即可见", async () => {
    const { dataDir, pluginDir } = tempRoots();
    const stores = createTaskfoldFileStores({ dataDir, pluginDir });
    const created = baseCard();
    await stores.cards.register("CARD-1", created);

    const swapped = await stores.cards.compareAndSwap!("CARD-1", 1, {
      version: 1,
      card: { ...created.card, title: "改过的标题", revision: 2 },
    });

    expect(swapped).toBe(true);
    const lookedUp = await stores.cards.lookup("CARD-1");
    expect(lookedUp?.card.title).toBe("改过的标题");
    expect(lookedUp?.card.revision).toBe(2);
  });

  it("compareAndSwap 冲突返回 false，且不写入（不 throw）", async () => {
    const { dataDir, pluginDir } = tempRoots();
    const stores = createTaskfoldFileStores({ dataDir, pluginDir });
    const created = baseCard();
    await stores.cards.register("CARD-1", created);

    const swapped = await stores.cards.compareAndSwap!("CARD-1", 999, {
      version: 1,
      card: { ...created.card, title: "不该生效的标题", revision: 1000 },
    });

    expect(swapped).toBe(false);
    const lookedUp = await stores.cards.lookup("CARD-1");
    // Unchanged: the loser's write never landed.
    expect(lookedUp?.card.title).toBe("示例卡片");
    expect(lookedUp?.card.revision).toBe(1);
  });

  it("compareAndSwap 对不存在的 key 返回 false", async () => {
    const { dataDir, pluginDir } = tempRoots();
    const stores = createTaskfoldFileStores({ dataDir, pluginDir });
    const swapped = await stores.cards.compareAndSwap!("CARD-404", 1, baseCard({ id: "CARD-404" }));
    expect(swapped).toBe(false);
  });

  it("registerIfAbsent 竞态收敛：第一次成功，第二次失败，输家不覆盖赢家", async () => {
    const { dataDir, pluginDir } = tempRoots();
    const stores = createTaskfoldFileStores({ dataDir, pluginDir });

    const first = stores.cards.registerIfAbsent!("CARD-9", baseCard({ id: "CARD-9", title: "赢家" }));
    const second = stores.cards.registerIfAbsent!(
      "CARD-9",
      baseCard({ id: "CARD-9", title: "输家" }),
    );
    const [firstResult, secondResult] = await Promise.all([first, second]);

    // Exactly one side wins; both outcomes are the two-instance's-worth of a real
    // race, but the losing side must never have overwritten the winner (see
    // file-store-atomic.ts's module comment on why this is deterministic here).
    expect([firstResult, secondResult].filter(Boolean)).toHaveLength(1);
    const stored = await stores.cards.lookup("CARD-9");
    expect(stored?.card.title).toBe(firstResult ? "赢家" : "输家");
  });

  it("lookup/entries 返回独立对象：外部修改返回值不会污染下一次读取", async () => {
    const { dataDir, pluginDir } = tempRoots();
    const stores = createTaskfoldFileStores({ dataDir, pluginDir });
    await stores.cards.register("CARD-1", baseCard());

    const first = await stores.cards.lookup("CARD-1");
    (first as PersistedTaskfoldCard).card.revision = 555;
    const second = await stores.cards.lookup("CARD-1");
    expect(second?.card.revision).toBe(1);
  });

  it("delete 后 lookup 返回 undefined，不 throw（R8）", async () => {
    const { dataDir, pluginDir } = tempRoots();
    const stores = createTaskfoldFileStores({ dataDir, pluginDir });
    await stores.cards.register("CARD-1", baseCard());
    await stores.cards.delete("CARD-1");
    await expect(stores.cards.lookup("CARD-1")).resolves.toBeUndefined();
  });
});

describe("createTaskfoldFileStores: 整卡写原子性（R5）", () => {
  it("register 后目录里只留最终文件，没有残留 .tmp", async () => {
    const { dataDir, pluginDir } = tempRoots();
    const stores = createTaskfoldFileStores({ dataDir, pluginDir });
    await stores.cards.register("CARD-1", baseCard());

    const cardsDir = path.join(dataDir, "cards");
    const entries = fs.readdirSync(cardsDir);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatch(/^card-1 - /);
    expect(entries[0].endsWith(".tmp")).toBe(false);
  });

  // ⚠️ 2026-09-18 行为更正：本用例原先断言「改标题会重命名文件」，那是照着 需求/16 第七节
  // 的旧表述写的。格式契约调研实测证明 backlog 对 task **根本不重命名**（`preservesPath`
  // 逻辑，只有 draft/doc/decision 才按标题重命名并 unlink 旧文件），规划该条已更正，
  // Taskfold 跟随「不重命名」。文件名一旦分配就固定，标题变更只体现在 frontmatter 的
  // `title` 与正文里——这样展示 ID 与文件名才是稳定的引用锚点。
  it("改标题不重命名文件，展示 ID 与文件名保持稳定", async () => {
    const { dataDir, pluginDir } = tempRoots();
    const stores = createTaskfoldFileStores({ dataDir, pluginDir });
    await stores.cards.register("CARD-1", baseCard({ title: "旧标题" }));
    const cardsDir = path.join(dataDir, "cards");
    const afterFirst = fs.readdirSync(cardsDir);
    expect(afterFirst).toHaveLength(1);

    await stores.cards.register("CARD-1", baseCard({ title: "新标题" }));

    const afterRename = fs.readdirSync(cardsDir);
    expect(afterRename).toHaveLength(1);
    // 文件名原样不动（仍带旧标题），但内容里的标题已经更新。
    expect(afterRename[0]).toBe(afterFirst[0]);
    expect(afterRename[0]).toContain("旧标题");
    const stored = await stores.cards.lookup("CARD-1");
    expect(stored?.card.title).toBe("新标题");
  });
});

describe("createTaskfoldFileStores: 附件两段式（INNER JOIN 语义与整卡删除清理）", () => {
  const attachment: PersistedTaskfoldAttachment = {
    version: 1,
    attachment: {
      id: "attach-1",
      cardId: "CARD-1",
      createdAt: Date.now(),
      fileName: "note.txt",
      byteSize: 5,
    },
    contentBase64: Buffer.from("hello").toString("base64"),
  };

  it("只写 blob、卡片未索引时，半成品附件不可见", async () => {
    const { dataDir, pluginDir } = tempRoots();
    const stores = createTaskfoldFileStores({ dataDir, pluginDir });
    await stores.attachments.register("attach-1", attachment);

    await expect(stores.attachments.lookup("attach-1")).resolves.toBeUndefined();
    expect(await stores.attachments.entries()).toHaveLength(0);
    // The blob really is on disk -- it is invisible via the store API, not missing.
    expect(fs.existsSync(path.join(dataDir, "attachments", "attach-1"))).toBe(true);
  });

  it("卡片索引 + blob 都存在时可见，且能读回原始内容", async () => {
    const { dataDir, pluginDir } = tempRoots();
    const stores = createTaskfoldFileStores({ dataDir, pluginDir });
    await stores.attachments.register("attach-1", attachment);
    await stores.cards.register(
      "CARD-1",
      baseCard({ metadata: { attachments: [attachment.attachment] } }),
    );

    const looked = await stores.attachments.lookup("attach-1");
    expect(looked?.attachment.fileName).toBe("note.txt");
    expect(Buffer.from(looked!.contentBase64, "base64").toString("utf8")).toBe("hello");
  });

  it("删卡时没有数据库 CASCADE，必须显式清理其引用的 blob", async () => {
    const { dataDir, pluginDir } = tempRoots();
    const stores = createTaskfoldFileStores({ dataDir, pluginDir });
    await stores.attachments.register("attach-1", attachment);
    await stores.cards.register(
      "CARD-1",
      baseCard({ metadata: { attachments: [attachment.attachment] } }),
    );
    expect(await stores.attachments.lookup("attach-1")).toBeDefined();

    await stores.cards.delete("CARD-1");

    expect(fs.existsSync(path.join(dataDir, "attachments", "attach-1"))).toBe(false);
  });
});

describe("createTaskfoldFileStores: change cursor 三件套（E2，changes.log）", () => {
  it("changeEpoch 跨『重启』稳定（两次构造同一目录，得到同一 epoch）", () => {
    const { dataDir, pluginDir } = tempRoots();
    const first = createTaskfoldFileStores({ dataDir, pluginDir });
    const second = createTaskfoldFileStores({ dataDir, pluginDir });
    expect(second.changeEpoch).toBe(first.changeEpoch);
    expect(first.changeEpoch.length).toBeGreaterThan(0);
  });

  it("reserveChangeRevisions 跨『重启』单调，不重叠", () => {
    const { dataDir, pluginDir } = tempRoots();
    const first = createTaskfoldFileStores({ dataDir, pluginDir });
    expect(first.reserveChangeRevisions(5)).toBe(0);
    expect(first.reserveChangeRevisions(5)).toBe(5);

    // Simulate a Gateway restart: a brand new factory call over the same changes.log.
    const second = createTaskfoldFileStores({ dataDir, pluginDir });
    const base = second.reserveChangeRevisions(3);
    expect(base).toBeGreaterThanOrEqual(10);
  });

  it("dataVersion 只在别的写者提交后才变化——自己的写不触发", async () => {
    const { dataDir, pluginDir } = tempRoots();
    const stores = createTaskfoldFileStores({ dataDir, pluginDir });
    const before = stores.dataVersion();
    await stores.cards.register("CARD-1", baseCard());
    expect(stores.dataVersion()).toBe(before);
  });

  it("dataVersion 会感知到绕过这个 store 实例的外部写入", async () => {
    const { dataDir, pluginDir } = tempRoots();
    const stores = createTaskfoldFileStores({ dataDir, pluginDir });
    const before = stores.dataVersion();

    // Simulate a second writer (backlog CLI / a human editor) that never goes
    // through this store instance's `onWrite` hook.
    fs.writeFileSync(path.join(dataDir, "cards", "card-99 - 外部写入.md"), "external");

    expect(stores.dataVersion()).toBeGreaterThan(before);
  });
});

describe("createTaskfoldFileStores: 与 TaskfoldStore.fromSqliteStores 的接缝", () => {
  it("revision 每次写 +1（经业务层 update）", async () => {
    const { dataDir, pluginDir } = tempRoots();
    const stores = createTaskfoldFileStores({ dataDir, pluginDir });
    const store = TaskfoldStore.fromSqliteStores(stores);

    const created = await store.create({ title: "接缝测试卡片" });
    expect(created.revision).toBe(1);

    const once = await store.update(created.id, { notes: "第一次修改" });
    expect(once.revision).toBe(2);

    const twice = await store.update(created.id, { notes: "第二次修改" });
    expect(twice.revision).toBe(3);
  });

  it("compareAndSwap 冲突通过业务层的 update({expectedRevision}) 会抛出 revision 冲突错误", async () => {
    const { dataDir, pluginDir } = tempRoots();
    const stores = createTaskfoldFileStores({ dataDir, pluginDir });
    const store = TaskfoldStore.fromSqliteStores(stores);

    const created = await store.create({ title: "冲突测试卡片" });
    await store.update(created.id, { notes: "别人先改了" });

    await expect(
      store.update(created.id, { notes: "基于旧 revision 的修改" }, { expectedRevision: created.revision }),
    ).rejects.toThrow(/changed since revision/);
  });
});

describe("createTaskfoldFileStores: Markdown codec 往返不丢用户内容（任务 1）", () => {
  /** 一张"手写"的卡片文件：带 frontmatter、AC、DoD 区块，外加一段 Taskfold 从未写过的
   * 自定义 `## 我的笔记` 正文——模拟用户在 Taskfold 写入之前/之后手工编辑过这个文件。 */
  function handwrittenCardMarkdown(): string {
    return [
      "---",
      "id: CARD-1",
      "title: 手写卡片",
      "status: backlog",
      "assignee: []",
      "created_date: '2026-09-18 10:00'",
      "updated_date: '2026-09-18 10:00'",
      "labels: []",
      "dependencies: []",
      "priority: normal",
      "ordinal: 1",
      "---",
      "",
      "## Description",
      "",
      "<!-- SECTION:DESCRIPTION:BEGIN -->",
      "手写的描述",
      "<!-- SECTION:DESCRIPTION:END -->",
      "",
      "## Acceptance Criteria",
      "<!-- AC:BEGIN -->",
      "- [ ] #1 验收项一",
      "<!-- AC:END -->",
      "",
      "## Definition of Done",
      "<!-- DOD:BEGIN -->",
      "- [ ] #1 完成项一",
      "<!-- DOD:END -->",
      "",
      "## 我的笔记",
      "这是我自己加的段落，Taskfold 不该动它。",
      "",
      "## Taskfold",
      "",
      "<!-- SECTION:TASKFOLD:BEGIN -->",
      JSON.stringify({ uuid: "CARD-1", revision: 1, position: 1 }, null, 2),
      "<!-- SECTION:TASKFOLD:END -->",
      "",
    ].join("\n");
  }

  it("经文件后端改一次 status，AC/DoD/自定义段落逐字存活（不是只做 parse(content).card 那种会静默丢数据的适配）", async () => {
    const { dataDir, pluginDir } = tempRoots();
    // 不传 cardCodec：验证 createTaskfoldFileStores() 的默认值就是真正的 Markdown
    // 编解码器，不是占位 JSON（file-store-codec.ts 的 createMarkdownCardCodec）。
    const stores = createTaskfoldFileStores({ dataDir, pluginDir });
    const cardsDir = path.join(dataDir, "cards");
    fs.mkdirSync(cardsDir, { recursive: true });
    const filePath = path.join(cardsDir, "card-1 - 手写卡片.md");
    fs.writeFileSync(filePath, handwrittenCardMarkdown());

    const lookedUp = await stores.cards.lookup("CARD-1");
    expect(lookedUp?.card.status).toBe("backlog");
    expect(lookedUp?.card.revision).toBe(1);

    const swapped = await stores.cards.compareAndSwap!("CARD-1", 1, {
      version: 1,
      card: { ...lookedUp!.card, status: "ready", revision: 2 },
    });
    expect(swapped).toBe(true);

    // 文件名不变（标题没变），可以直接重读同一路径。
    const rewritten = fs.readFileSync(filePath, "utf8");
    expect(rewritten).toContain("status: ready");
    expect(rewritten).toContain(
      "## Acceptance Criteria\n<!-- AC:BEGIN -->\n- [ ] #1 验收项一\n<!-- AC:END -->",
    );
    expect(rewritten).toContain(
      "## Definition of Done\n<!-- DOD:BEGIN -->\n- [ ] #1 完成项一\n<!-- DOD:END -->",
    );
    expect(rewritten).toContain("## 我的笔记\n这是我自己加的段落，Taskfold 不该动它。");
    expect(rewritten).toContain("手写的描述");

    // register() 路径（无 CAS）同样不能丢——业务层有 9 处直接 register() 整卡覆盖写。
    const afterCas = await stores.cards.lookup("CARD-1");
    await stores.cards.register("CARD-1", {
      version: 1,
      card: { ...afterCas!.card, status: "done", revision: 3 },
    });
    const afterRegister = fs.readFileSync(filePath, "utf8");
    expect(afterRegister).toContain("status: done");
    expect(afterRegister).toContain("- [ ] #1 验收项一");
    expect(afterRegister).toContain("- [ ] #1 完成项一");
    expect(afterRegister).toContain("这是我自己加的段落，Taskfold 不该动它。");
  });
});

describe("createTaskfoldFileStores: entries() 遇坏文件不整体炸掉（任务 3）", () => {
  it("卡片目录里一个文件解析失败时，其余卡片仍能通过 entries() 读出，且 console.warn 带文件名", async () => {
    const { dataDir, pluginDir } = tempRoots();
    const stores = createTaskfoldFileStores({ dataDir, pluginDir });
    await stores.cards.register("CARD-1", baseCard({ id: "CARD-1", title: "好卡片" }));

    const cardsDir = path.join(dataDir, "cards");
    const badFilePath = path.join(cardsDir, "card-2 - 坏卡片.md");
    fs.writeFileSync(badFilePath, "这不是合法的 Taskfold 卡片文件，没有 frontmatter。\n");

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const entries = await stores.cards.entries();
      expect(entries).toHaveLength(1);
      expect(entries[0]?.value.card.title).toBe("好卡片");
      expect(warn).toHaveBeenCalledTimes(1);
      const [message] = warn.mock.calls[0] ?? [];
      expect(String(message)).toContain("card-2 - 坏卡片.md");
    } finally {
      warn.mockRestore();
    }
  });

  // ⚠️ 2026-09-18 语义裁定：本用例原先断言「lookup 对坏文件抛错，不能当成不存在」。
  // 接入可读展示 ID 后文件名不再包含 UUID（`card-42 - 标题.md`），`findCardFilePath`
  // 必须读出正文 TASKFOLD 区块里的 uuid 才能定位——**坏文件读不出 uuid，于是「不存在」
  // 与「存在但坏了」在技术上不可区分**。
  //
  // 强行让 lookup 抛错会更糟：目录里只要有一个与本次查询无关的坏文件，任何针对不存在
  // 卡片的 lookup 都会失败（`create` 前的存在性检查也会被带崩）。
  //
  // 因此采用 Backlog.md 验证过的路线：读侧跳过 + 体检兜底。坏文件由 `entries()` 的
  // console.warn 暴露，系统性检测与修复归 `taskfold doctor`（需求/16 第四节第 5 条，
  // 属第 2 期）。新卡用 randomUUID，撞上坏文件 uuid 的概率为 0，不存在覆盖风险。
  it("对存在但解析失败的卡片，lookup 表现为『找不到』（坏文件检测归第 2 期 doctor）", async () => {
    const { dataDir, pluginDir } = tempRoots();
    const stores = createTaskfoldFileStores({ dataDir, pluginDir });
    const cardsDir = path.join(dataDir, "cards");
    fs.mkdirSync(cardsDir, { recursive: true });
    fs.writeFileSync(path.join(cardsDir, "card-3 - 坏卡片.md"), "不是合法内容");

    await expect(stores.cards.lookup("CARD-3")).resolves.toBeUndefined();
  });

  it("里程碑目录里一个文件解析失败时，其余里程碑仍能通过 entries() 读出", async () => {
    const { dataDir, pluginDir } = tempRoots();
    const stores = createTaskfoldFileStores({ dataDir, pluginDir });
    const milestonesDir = path.join(dataDir, "milestones");
    fs.mkdirSync(milestonesDir, { recursive: true });
    fs.writeFileSync(path.join(milestonesDir, "m-9 - 坏里程碑.md"), "不是合法内容");

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const entries = await stores.milestones.entries();
      expect(entries).toHaveLength(0);
      expect(warn).toHaveBeenCalledTimes(1);
      const [message] = warn.mock.calls[0] ?? [];
      expect(String(message)).toContain("m-9 - 坏里程碑.md");
    } finally {
      warn.mockRestore();
    }
  });
});

describe("TaskfoldStore.fromStores（任务 4：不依赖 SQLite 的共享接线点）", () => {
  it("fromStores 与 fromSqliteStores 对文件后端行为一致（同一份 stores，直接委托）", async () => {
    const { dataDir, pluginDir } = tempRoots();
    const stores = createTaskfoldFileStores({ dataDir, pluginDir });
    const store = TaskfoldStore.fromStores(stores);

    const created = await store.create({ title: "fromStores 测试卡片" });
    expect(created.revision).toBe(1);
    const updated = await store.update(created.id, { notes: "改一次" });
    expect(updated.revision).toBe(2);
    expect(updated.notes).toBe("改一次");
  });
});

describe("resolveTaskfoldDataDir: worktree 必须取 sourcePath 而非 path", () => {
  it("worktree 类型取 sourcePath", () => {
    const dir = resolveTaskfoldDataDir({
      kind: "worktree",
      path: "/tmp/some-temporary-worktree",
      sourcePath: "/home/john/src/personal/Taskfold",
    });
    expect(dir).toBe(path.join("/home/john/src/personal/Taskfold", ".taskfold"));
  });

  it("dir 类型取 path", () => {
    const dir = resolveTaskfoldDataDir({ kind: "dir", path: "/home/john/src/lz/procloud" });
    expect(dir).toBe(path.join("/home/john/src/lz/procloud", ".taskfold"));
  });
});

describe("allocateNextTaskfoldCardId: 扫目录取 max+1（含 archive，不用计数器）", () => {
  it("综合 cards/ 与 archive/cards/ 里的既有编号，返回下一个", () => {
    const { dataDir } = tempRoots();
    const cardsDir = path.join(dataDir, "cards");
    const archiveCardsDir = path.join(dataDir, "archive", "cards");
    fs.mkdirSync(cardsDir, { recursive: true });
    fs.mkdirSync(archiveCardsDir, { recursive: true });
    fs.writeFileSync(path.join(cardsDir, "card-3 - foo.md"), "");
    fs.writeFileSync(path.join(cardsDir, "CARD-007 - bar.md"), "");
    fs.writeFileSync(path.join(archiveCardsDir, "card-10 - baz.md"), "");

    expect(allocateNextTaskfoldCardId(cardsDir, archiveCardsDir)).toBe("CARD-11");
  });

  it("两个目录都空时从 1 开始", () => {
    const { dataDir } = tempRoots();
    const cardsDir = path.join(dataDir, "cards");
    const archiveCardsDir = path.join(dataDir, "archive", "cards");
    expect(allocateNextTaskfoldCardId(cardsDir, archiveCardsDir)).toBe("CARD-1");
  });
});

/**
 * 架构守卫（需求/16 第十二节待办 ③，抄 Backlog.md 的 `local-task-command-performance.test.ts`
 * 思路：把"绝不该在这条路径上发生的事"做成会失败的断言，而不是靠人自觉）。
 *
 * ⚠️ 规划原文写的是"单卡片读写不触碰**全量扫描**"，但接入可读展示 ID 后这条守不住、
 * 也不该守：文件名是 `card-42 - 标题.md`，不含业务主键 UUID，`findCardFilePath` 必须
 * 逐个文件读出 TASKFOLD 区块里的 uuid 才能定位——扫目录是**必需**的。
 *
 * 真正该守的是**全量解析**。性能实测（2000 张卡 165ms）给出的分解是：解析占 80~84%、
 * I/O 只占 16~20%。所以守卫的目标从"不扫目录"改成"**不全量 `codec.parse`**"：定位阶段
 * 只用轻量的 `extractTaskfoldSectionUuid`（只切 frontmatter + 找哨兵块 + JSON.parse 取一个
 * 字段），完整的 `parseMarkdownCard` 只对命中的那一个文件调用一次。
 *
 * 这条一旦被破坏（例如有人图省事把定位改成"全部 parse 出来再按 id 过滤"），单卡 lookup
 * 的成本会从 O(1) 次解析退化成 O(N) 次，而且不会有任何测试变红——正是这类测试存在的理由。
 */
describe("架构守卫：单卡读写不触发全量解析", () => {
  function countingCardCodec() {
    const inner = createMarkdownCardCodec();
    let parseCalls = 0;
    return {
      codec: {
        serialize: (card: Parameters<typeof inner.serialize>[0], prev?: string, hint?: Parameters<typeof inner.serialize>[2]) =>
          inner.serialize(card, prev, hint),
        parse: (content: string) => {
          parseCalls += 1;
          return inner.parse(content);
        },
      },
      reset: () => {
        parseCalls = 0;
      },
      get calls() {
        return parseCalls;
      },
    };
  }

  const CARD_COUNT = 20;

  async function seedStore() {
    const { dataDir, pluginDir } = tempRoots();
    const counter = countingCardCodec();
    const stores = createTaskfoldFileStores({ dataDir, pluginDir, cardCodec: counter.codec });
    const uuids: string[] = [];
    for (let i = 1; i <= CARD_COUNT; i += 1) {
      const uuid = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
      uuids.push(uuid);
      await stores.cards.register(uuid, baseCard({ id: uuid, title: `卡片 ${i}` }));
    }
    return { stores, counter, uuids };
  }

  it("lookup 命中时，完整 parse 只发生在目标文件上（不是 N 次）", async () => {
    const { stores, counter, uuids } = await seedStore();
    counter.reset();

    const found = await stores.cards.lookup(uuids[CARD_COUNT - 1]!);

    expect(found?.card.title).toBe(`卡片 ${CARD_COUNT}`);
    // 定位阶段走 extractTaskfoldSectionUuid（不计入 codec.parse）；命中后才完整解析一次。
    expect(counter.calls).toBe(1);
  });

  it("lookup 未命中时，完全不发生完整 parse", async () => {
    const { stores, counter } = await seedStore();
    counter.reset();

    const missing = await stores.cards.lookup("ffffffff-ffff-4fff-8fff-ffffffffffff");

    expect(missing).toBeUndefined();
    expect(counter.calls).toBe(0);
  });

  it("entries() 才是那条允许全量解析的路径（对照组，防止守卫写反）", async () => {
    const { stores, counter } = await seedStore();
    counter.reset();

    const all = await stores.cards.entries();

    expect(all).toHaveLength(CARD_COUNT);
    expect(counter.calls).toBe(CARD_COUNT);
  });
});
