// Taskfold plugin module: the file-backed `milestones` KeyedStore. No CAS here, matching
// sqlite-store.ts's TaskfoldSqliteMilestoneStore (register/lookup/delete/entries only) --
// milestones are never the target of an optimistic-concurrency retry loop today.
import path from "node:path";
import type { TaskfoldMilestone } from "./contract/index.js";
import type { PersistedTaskfoldMilestone, TaskfoldKeyedStore } from "./persistence-types.js";
import { unsupportedTaskfoldCompareAndSwap } from "./file-store-cas.js";
import {
  listFileNamesSafe,
  readFileIfExists,
  removeFileIfExists,
  sameEntityId,
  sanitizeFilenameSegment,
  writeFileAtomic,
} from "./file-store-atomic.js";
import { allocateNextTaskfoldMilestoneId } from "./file-store-card-id.js";
import type { TaskfoldMilestoneCodec } from "./file-store-codec.js";
import { withTaskfoldGlobalLock, type TaskfoldLockGuard } from "./file-store-locks.js";
import { extractTaskfoldSectionUuid, parseCardFrontmatterId, type CardDisplayId } from "./markdown-card-format.js";

const MILESTONE_EXTENSION = ".md";

function assertValidMilestonePayload(key: string, value: PersistedTaskfoldMilestone): void {
  if (value.version !== 1 || value.milestone.id !== key) {
    throw new Error("invalid taskfold milestone payload");
  }
}

/** Same lowercasing rule as file-store-cards.ts's `cardFileName`: frontmatter's `id` is
 * the uppercase canonical form ("M-1"), the filename segment is lowercase ("m-1 - ..."). */
function milestoneFileName(displayId: string, title: string): string {
  return `${displayId.toLowerCase()} - ${sanitizeFilenameSegment(title)}${MILESTONE_EXTENSION}`;
}

/** uuid-content scan, mirroring file-store-cards.ts's `findCardFilePath` -- see its doc
 * for why this can no longer be a filename match, and why a file that fails even the
 * minimal `extractTaskfoldSectionUuid` parse is skipped rather than aborting the scan. */
function findMilestoneFilePath(milestonesDir: string, id: string): string | undefined {
  for (const fileName of listFileNamesSafe(milestonesDir)) {
    if (!fileName.endsWith(MILESTONE_EXTENSION)) {
      continue;
    }
    const filePath = path.join(milestonesDir, fileName);
    const content = readFileIfExists(filePath);
    if (content === undefined) {
      continue;
    }
    const uuid = extractTaskfoldSectionUuid(content);
    if (uuid !== undefined && sameEntityId(uuid, id)) {
      return filePath;
    }
  }
  return undefined;
}

/** 真正的新里程碑：扫 `milestonesDir` 分配一个从未被占用过的展示 ID（file-store-card-id.ts
 * 的 `allocateNextTaskfoldMilestoneId`），镜像 file-store-cards.ts 的
 * `allocateNewCardFile`——理由同它：既构造文件名，也把同一个展示 ID 当 `displayIdHint`
 * 传给 codec，避免退化成占位 "M-0"。 */
function allocateNewMilestoneFile(
  milestonesDir: string,
  milestone: TaskfoldMilestone,
): { path: string; displayId: CardDisplayId } {
  const displayIdText = allocateNextTaskfoldMilestoneId(milestonesDir);
  const displayId = parseCardFrontmatterId(displayIdText);
  if (!displayId) {
    throw new Error(`taskfold file store: 分配器返回了无法解析的展示 ID "${displayIdText}"`);
  }
  return { path: path.join(milestonesDir, milestoneFileName(displayIdText, milestone.title)), displayId };
}

function readMilestoneAt(
  filePath: string,
  codec: TaskfoldMilestoneCodec,
): TaskfoldMilestone | undefined {
  const content = readFileIfExists(filePath);
  return content === undefined ? undefined : codec.parse(content);
}

/** Same round-trip-baseline concern as file-store-cards.ts's `writeCard`: the Markdown
 * document carries a displayId and unrecognized trailing prose that `TaskfoldMilestone`
 * itself does not, so an update to an existing file must hand the codec that file's
 * current content as a baseline (read here when the caller -- `register`, which has no
 * CAS branch to have read it already -- does not already have it) or those fields get
 * silently blanked on every write. See file-store-codec.ts's `TaskfoldMilestoneCodec`
 * doc for why. */
function writeMilestone(
  milestonesDir: string,
  value: PersistedTaskfoldMilestone,
  codec: TaskfoldMilestoneCodec,
  existingPath: string | undefined,
  guard?: TaskfoldLockGuard,
): void {
  // 镜像 file-store-cards.ts 的 `writeCard`：既有文件写回原路径（改标题**不重命名**，
  // 见 需求/16 第七节更正后的表述），真新建才分配展示 ID 并据此构造文件名。
  if (existingPath) {
    const baseline = readFileIfExists(existingPath);
    writeFileAtomic(existingPath, codec.serialize(value.milestone, baseline));
    return;
  }
  const { path: newPath, displayId } = allocateNewMilestoneFile(milestonesDir, value.milestone);
  writeFileAtomic(newPath, codec.serialize(value.milestone, undefined, displayId), undefined, guard?.assertHeld);
}

export function createTaskfoldFileMilestoneStore(options: {
  milestonesDir: string;
  codec: TaskfoldMilestoneCodec;
  /** `<repo>/.taskfold/.locks`：新建里程碑时的全局锁（file-store-locks.ts）。 */
  locksDir: string;
}): TaskfoldKeyedStore<PersistedTaskfoldMilestone> {
  const { milestonesDir, codec, locksDir } = options;

  return {
    async register(key, value) {
      assertValidMilestonePayload(key, value);
      const existingPath = findMilestoneFilePath(milestonesDir, key);
      if (existingPath) {
        writeMilestone(milestonesDir, value, codec, existingPath);
        return;
      }
      // 新里程碑：与卡片共用 allocateNextOrdinalId，同样要在全局锁内「重查 + 分配展示 ID +
      // 落盘」，否则两个进程会拿到同一个 M-<n>（需求/18 §3.3）。
      await withTaskfoldGlobalLock(locksDir, (guard) => {
        writeMilestone(milestonesDir, value, codec, findMilestoneFilePath(milestonesDir, key), guard);
      });
    },

    async lookup(key) {
      const filePath = findMilestoneFilePath(milestonesDir, key);
      if (!filePath) {
        return undefined;
      }
      const milestone = readMilestoneAt(filePath, codec);
      return milestone ? { version: 1, milestone } : undefined;
    },

    async delete(key) {
      const filePath = findMilestoneFilePath(milestonesDir, key);
      return filePath ? removeFileIfExists(filePath) : false;
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
