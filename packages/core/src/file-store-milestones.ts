// 阶段以 UUID 关联，文件名使用具体标题；所有变更在项目全局锁内完成。
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { TaskfoldMilestone } from "./contract/index.js";
import type { PersistedTaskfoldMilestone, TaskfoldKeyedStore } from "./persistence-types.js";
import { unsupportedTaskfoldCompareAndSwap } from "./file-store-cas.js";
import {
  createFileExclusive,
  listFileNamesSafe,
  readFileIfExists,
  removeFileIfExists,
  sameEntityId,
  sanitizeFilenameSegment,
  writeFileAtomic,
} from "./file-store-atomic.js";
import type { TaskfoldMilestoneCodec } from "./file-store-codec.js";
import { assertTaskfoldFormatWritable, upgradeTaskfoldFormatVersion } from "./file-store-format.js";
import { withTaskfoldGlobalLock, type TaskfoldLockGuard } from "./file-store-locks.js";

const MILESTONE_EXTENSION = ".md";

/** 独立文件名不能是 Windows 设备名、点目录或以点结尾。 */
export function milestoneFileStem(title: string): string {
  // 给冲突后缀和原子写临时文件名留空间；按 UTF-8 字节截断，避免中文长标题超限。
  let stem = "";
  for (const char of sanitizeFilenameSegment(title)) {
    if (Buffer.byteLength(stem + char) > 140) break;
    stem += char;
  }
  stem = stem.replace(/[. ]+$/, "") || "untitled";
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem) ? `_${stem}` : stem;
}

/** UUID 只在同名时出现在文件名里；兼容非 UUID 的历史实体标识。 */
function collisionToken(id: string): string {
  return /^[0-9a-f]{8}-[0-9a-f-]+$/i.test(id)
    ? id.replaceAll("-", "").toLowerCase()
    : createHash("sha256").update(id).digest("hex");
}

/** 纯路径规划，可供迁移预览复用。occupied 包含坏文件、目录和符号链接，均不可覆盖。 */
export function selectMilestoneFileName(
  milestone: TaskfoldMilestone,
  occupied: ReadonlySet<string>,
  existingName?: string,
  previousTitle?: string,
): string {
  const stem = milestoneFileStem(milestone.title);
  const token = collisionToken(milestone.id);
  const candidates = [`${stem}.md`];
  for (let length = 8; length <= token.length; length += 4) {
    candidates.push(`${stem} - ${token.slice(0, length)}.md`);
  }
  if (previousTitle === milestone.title && existingName && candidates.includes(existingName)) {
    return existingName;
  }
  const occupiedFolded = new Set([...occupied].filter((name) => name !== existingName).map((name) => name.toLowerCase()));
  const available = candidates.find((name) => !occupiedFolded.has(name.toLowerCase()));
  if (!available) throw new Error(`无法为阶段分配不冲突的文件名：${milestone.title}`);
  return available;
}

function findMilestoneFilePath(milestonesDir: string, id: string, codec: TaskfoldMilestoneCodec): string | undefined {
  for (const fileName of listFileNamesSafe(milestonesDir)) {
    if (!fileName.endsWith(MILESTONE_EXTENSION)) continue;
    const filePath = path.join(milestonesDir, fileName);
    const content = readFileIfExists(filePath);
    if (content === undefined) continue;
    try {
      if (sameEntityId(codec.parse(content).id, id)) return filePath;
    } catch {
      // 坏文件不参与定位，但路径仍被占用；entries 会报告解析错误。
    }
  }
  return undefined;
}

/** 调用方持有全局锁；先改名再写内容，失败时仍留下一份可读的原阶段。 */
export function writeTaskfoldMilestoneFile(options: {
  milestonesDir: string;
  milestone: TaskfoldMilestone;
  codec: TaskfoldMilestoneCodec;
  existingPath?: string;
  guard: TaskfoldLockGuard;
}): void {
  const { milestonesDir, milestone, codec, existingPath, guard } = options;
  const baseline = existingPath ? readFileIfExists(existingPath) : undefined;
  const content = codec.serialize(milestone, baseline);
  const fileName = selectMilestoneFileName(
    milestone,
    new Set(fs.readdirSync(milestonesDir)),
    existingPath && path.basename(existingPath),
    baseline === undefined ? undefined : codec.parse(baseline).title,
  );
  const target = path.join(milestonesDir, fileName);
  guard.assertHeld();
  if (!existingPath) {
    if (!createFileExclusive(target, content)) throw new Error(`阶段文件已存在：${target}`);
    return;
  }
  if (existingPath !== target) {
    // 全局锁保护合作写入者；同步重查也避免覆盖已经存在的非阶段文件。
    if (fs.existsSync(target)) throw new Error(`阶段文件已存在：${target}`);
    fs.renameSync(existingPath, target);
  }
  writeFileAtomic(target, content, undefined, guard.assertHeld);
}

export function createTaskfoldFileMilestoneStore(options: {
  milestonesDir: string;
  codec: TaskfoldMilestoneCodec;
  locksDir: string;
  configPath: string;
}): TaskfoldKeyedStore<PersistedTaskfoldMilestone> {
  const { milestonesDir, codec, locksDir, configPath } = options;
  return {
    async register(key, value) {
      if (value.version !== 1 || value.milestone.id !== key) throw new Error("invalid taskfold milestone payload");
      await withTaskfoldGlobalLock(locksDir, (guard) => {
        const existingPath = findMilestoneFilePath(milestonesDir, key, codec);
        upgradeTaskfoldFormatVersion(configPath, guard.assertHeld);
        writeTaskfoldMilestoneFile({ milestonesDir, milestone: value.milestone, codec, existingPath, guard });
      });
    },
    async lookup(key) {
      const filePath = findMilestoneFilePath(milestonesDir, key, codec);
      const content = filePath ? readFileIfExists(filePath) : undefined;
      return content === undefined ? undefined : { version: 1, milestone: codec.parse(content) };
    },
    async delete(key) {
      return await withTaskfoldGlobalLock(locksDir, (guard) => {
        assertTaskfoldFormatWritable(configPath);
        const filePath = findMilestoneFilePath(milestonesDir, key, codec);
        guard.assertHeld();
        return filePath ? removeFileIfExists(filePath) : false;
      });
    },
    async entries() {
      const results: Array<{ key: string; value: PersistedTaskfoldMilestone }> = [];
      for (const fileName of listFileNamesSafe(milestonesDir)) {
        if (!fileName.endsWith(MILESTONE_EXTENSION)) {
          continue;
        }
        const filePath = path.join(milestonesDir, fileName);
        const content = readFileIfExists(filePath);
        if (content === undefined) {
          continue;
        }
        let milestone: TaskfoldMilestone;
        try {
          milestone = codec.parse(content);
        } catch (error) {
          // 同 file-store-cards.ts 的任务 3 折中：跳过坏文件让其余里程碑可用，但绝不
          // 悄悄蒸发——console.warn 带上文件名与原因。
          console.warn(
            `taskfold file store: 跳过无法解析的里程碑文件 "${fileName}": ${(error as Error).message}`,
          );
          continue;
        }
        results.push({ key: milestone.id, value: { version: 1, milestone } });
      }
      return results;
    },

    // 没有条件写的调用方（需求/16 R1 只要求卡片）；显式拒绝，绝不静默穿透成无条件写。
    compareAndSwap: unsupportedTaskfoldCompareAndSwap,
  };
}
