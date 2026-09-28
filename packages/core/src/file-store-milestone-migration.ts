/** 阶段文件格式迁移：默认只预览，执行前备份，执行后核对阶段及卡片原文。 */
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { createMarkdownMilestoneCodec } from "./file-store-codec.js";
import { assertTaskfoldFormatWritable, upgradeTaskfoldFormatVersion } from "./file-store-format.js";
import { withTaskfoldGlobalLock } from "./file-store-locks.js";
import { selectMilestoneFileName, writeTaskfoldMilestoneFile } from "./file-store-milestones.js";
import { splitFrontmatter } from "./markdown-card-format.js";
import { parseMarkdownMilestone } from "./markdown-milestone-format.js";

export async function migrateTaskfoldMilestones(options: {
  dataDir: string;
  backupRoot?: string;
  apply?: boolean;
}) {
  const dataDir = fs.realpathSync(options.dataDir);
  const milestonesDir = path.join(dataDir, "milestones");
  const configPath = path.join(dataDir, "config.yml");
  const codec = createMarkdownMilestoneCodec();
  const read = () => fs.readdirSync(milestonesDir).filter((name) => name.endsWith(".md")).sort().map((name) => {
    const content = fs.readFileSync(path.join(milestonesDir, name), "utf8");
    return { name, content, doc: parseMarkdownMilestone(content) };
  });
  const plan = (entries: ReturnType<typeof read>) => {
    const occupied = new Set(fs.readdirSync(milestonesDir));
    const ids = new Set<string>();
    return entries.map(({ name, doc }) => {
      if (ids.has(doc.milestone.id)) throw new Error(`重复阶段 UUID：${doc.milestone.id}`);
      ids.add(doc.milestone.id);
      const target = selectMilestoneFileName(doc.milestone, occupied, name, doc.milestone.title);
      occupied.delete(name);
      occupied.add(target);
      return { id: doc.milestone.id, from: name, to: target };
    });
  };
  assertTaskfoldFormatWritable(configPath);
  if (!options.apply) return { applied: false, files: plan(read()) };
  if (!options.backupRoot) throw new Error("执行迁移必须指定仓库外的 backupRoot");
  fs.mkdirSync(options.backupRoot, { recursive: true });
  const backupRoot = fs.realpathSync(options.backupRoot);
  const relative = path.relative(path.dirname(dataDir), backupRoot);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
    throw new Error("备份目录必须位于项目仓库外");
  }
  return await withTaskfoldGlobalLock(path.join(dataDir, ".locks"), (guard) => {
    assertTaskfoldFormatWritable(configPath);
    const entries = read();
    const files = plan(entries);
    // 卡片原文保持逐字节不变，包含全部阶段关联；也纳入备份，便于独立核验。
    const cardsDir = path.join(dataDir, "cards");
    const cardSnapshot = () => Object.fromEntries(fs.readdirSync(cardsDir).sort()
      .filter((name) => name.endsWith(".md"))
      .map((name) => [name, fs.readFileSync(path.join(cardsDir, name), "utf8")]));
    const cards = cardSnapshot();
    const backupPath = fs.mkdtempSync(path.join(backupRoot, "taskfold-milestones-"));
    fs.cpSync(milestonesDir, path.join(backupPath, "milestones"), { recursive: true });
    fs.cpSync(cardsDir, path.join(backupPath, "cards"), { recursive: true });
    if (fs.existsSync(configPath)) fs.copyFileSync(configPath, path.join(backupPath, "config.yml"));
    fs.writeFileSync(path.join(backupPath, "manifest.json"), JSON.stringify({ dataDir, files }, null, 2) + "\n");
    try {
      upgradeTaskfoldFormatVersion(configPath, guard.assertHeld);
      for (const entry of entries) {
        writeTaskfoldMilestoneFile({ milestonesDir, milestone: entry.doc.milestone, codec,
          existingPath: path.join(milestonesDir, entry.name), guard });
      }
      const after = read();
      const byId = (rows: typeof entries) => rows.map(({ doc }) => doc)
        .sort((a, b) => a.milestone.id.localeCompare(b.milestone.id));
      if (!isDeepStrictEqual(byId(entries), byId(after)) || !isDeepStrictEqual(cards, cardSnapshot())) {
        throw new Error("迁移后阶段业务内容、附加正文或卡片原文发生变化");
      }
      if (after.some(({ content }) => /^id:/m.test(splitFrontmatter(content).frontmatter))) throw new Error("迁移后仍存在展示编号");
      return { applied: true, backupPath, files, verifiedMilestones: after.length, verifiedCards: Object.keys(cards).length };
    } catch (error) {
      throw new Error(`阶段迁移未完成，备份保存在 ${backupPath}；修复后可重跑`, { cause: error });
    }
  });
}
