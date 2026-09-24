// Taskfold plugin module: the change-cursor triple (changeEpoch / reserveChangeRevisions
// / dataVersion) for the file-backed store, ported from sqlite-store.ts's
// `ensureChangeEpoch` / `reserveChangeRevisions` / `PRAGMA data_version` wiring but backed
// by `changes.log` (需求/16 分叉 E2) instead of a `taskfold_meta` table.
//
// 需求/18 §3.8 之后：changes.log 在每个项目主 checkout 的 `.taskfold/.runtime/changes.log`
// （file-store-paths.ts），所有写入进程共用，每次追加都在**该项目**的全局锁内。
// 本模块另外提供文件后端的 ChangeSource（store-change-tracker.ts 的端口）：每次本进程提交
// 写入就在日志里记一条 reserve（revision = 新的 ceiling），别的进程轮询日志尾部，看到 ceiling
// 前进就知道有人写过——跨进程的变更感知只靠这份日志，不靠任何进程的内存。
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import type { TaskfoldChange } from "./contract/index.js";
import { readFileIfExists, writeFileAtomic } from "./file-store-atomic.js";
import {
  isTaskfoldLockConflictError,
  tryWithTaskfoldGlobalLockSync,
  withTaskfoldGlobalLock,
  withTaskfoldGlobalLockSync,
  type TaskfoldLockGuard,
} from "./file-store-locks.js";
import { TASKFOLD_FILE_STORE_FILE_MODE } from "./file-store-paths.js";
import type { TaskfoldChangeSource } from "./store-change-tracker.js";

type ChangeLogRecord = { type: "epoch"; epoch: string } | { type: "reserve"; ceiling: number };

/**
 * 日志超过这么多条记录，下一次追加时（全局锁内）压成「epoch + 最后一条 reserve」两行。
 * 每次写入都记一条，不压缩的话日志无限增长，而轮询每秒都要整份读一遍。压缩只丢掉中间的
 * 旧 ceiling，epoch 和最新 ceiling 不变，读者看到压缩前后的文件结论相同（tmp + rename，原子替换）。
 */
const CHANGE_LOG_COMPACT_THRESHOLD = 1000;

function parseLines(content: string): ChangeLogRecord[] {
  const records: ChangeLogRecord[] = [];
  for (const line of content.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    try {
      const parsed = JSON.parse(line) as unknown;
      if (
        parsed &&
        typeof parsed === "object" &&
        "type" in parsed &&
        ((parsed as { type: unknown }).type === "epoch" ||
          (parsed as { type: unknown }).type === "reserve")
      ) {
        records.push(parsed as ChangeLogRecord);
      }
    } catch {
      // A half-written last line (process killed mid-append) is dropped, not fatal:
      // the reservation it recorded is simply treated as if it never happened, and
      // the next reserveChangeRevisions call re-derives a safe base from whatever
      // full lines did land.
    }
  }
  return records;
}

function readChangeLogRecords(changesLogPath: string): ChangeLogRecord[] {
  const content = readFileIfExists(changesLogPath);
  return content ? parseLines(content) : [];
}

function firstEpoch(records: ChangeLogRecord[]): string | undefined {
  return records.find((record): record is { type: "epoch"; epoch: string } => record.type === "epoch")?.epoch;
}

/** 最后一条合法 ceiling；缺失或损坏按 0 处理，从不给出负数或非整数的基数。 */
function lastCeiling(records: ChangeLogRecord[]): number {
  let base = 0;
  for (const record of records) {
    if (record.type === "reserve" && Number.isSafeInteger(record.ceiling) && record.ceiling > 0) {
      base = record.ceiling;
    }
  }
  return base;
}

function epochLine(epoch: string): string {
  return `${JSON.stringify({ type: "epoch", epoch })}\n`;
}

function reserveLine(ceiling: number): string {
  return `${JSON.stringify({ type: "reserve", ceiling })}\n`;
}

/**
 * 全局锁内：读最后一个 ceiling → 追加新 ceiling `base + count`，返回日志的 epoch 与 `base`。
 * 日志没有 epoch（首次使用，或 `.runtime/` 被删过）时连同新 epoch 整份重写；记录过多时顺带压缩。
 */
function reserveLocked(
  changesLogPath: string,
  count: number,
  guard: TaskfoldLockGuard,
): { epoch: string; base: number } {
  const records = readChangeLogRecords(changesLogPath);
  const base = lastCeiling(records);
  const existingEpoch = firstEpoch(records);
  guard.assertHeld();
  if (existingEpoch === undefined || records.length >= CHANGE_LOG_COMPACT_THRESHOLD) {
    const epoch = existingEpoch ?? randomUUID();
    writeFileAtomic(
      changesLogPath,
      `${epochLine(epoch)}${reserveLine(base + count)}`,
      TASKFOLD_FILE_STORE_FILE_MODE,
      guard.assertHeld,
    );
    return { epoch, base };
  }
  fs.appendFileSync(changesLogPath, reserveLine(base + count), { mode: TASKFOLD_FILE_STORE_FILE_MODE });
  return { epoch: existingEpoch, base };
}

/**
 * Reads the log-level epoch, creating it if this is the first time anyone has opened
 * this project's change log. The epoch must be scoped to the log file (not generated
 * fresh per process) so a Gateway restart does not invalidate every UI's long-poll cursor.
 * 创建在全局锁内（锁内重查一次），与 reserve 的整份重写互斥，不会出现两个 epoch。
 * `canWrite` 为 false（格式版本高于本版 core，只读）时不创建，日志里没有 epoch 就给一个
 * 不落盘的进程内 epoch——只读进程不往日志里写，这个值也不会被别人看到。
 */
export function ensureFileChangeEpoch(
  changesLogPath: string,
  locksDir: string,
  canWrite: boolean = true,
): string {
  const existing = firstEpoch(readChangeLogRecords(changesLogPath));
  if (existing !== undefined) {
    return existing;
  }
  if (!canWrite) {
    return randomUUID();
  }
  return withTaskfoldGlobalLockSync(locksDir, (guard) => {
    const records = readChangeLogRecords(changesLogPath);
    const raced = firstEpoch(records);
    if (raced !== undefined) {
      return raced;
    }
    const epoch = randomUUID();
    const ceiling = lastCeiling(records);
    guard.assertHeld();
    writeFileAtomic(
      changesLogPath,
      `${epochLine(epoch)}${ceiling > 0 ? reserveLine(ceiling) : ""}`,
      TASKFOLD_FILE_STORE_FILE_MODE,
      guard.assertHeld,
    );
    return epoch;
  });
}

/**
 * Hands out a reserved block of change revisions, exactly like sqlite-store.ts's
 * `reserveChangeRevisions`: reads the last recorded ceiling (treating a missing or
 * corrupt value as 0, never as a negative or non-integer base), appends a new ceiling
 * `base + count`, and returns `base` (the block's lower bound) to the caller.
 */
export function reserveFileChangeRevisions(changesLogPath: string, count: number, locksDir: string): number {
  // 「读最后一个 ceiling → 追加新 ceiling」在全局锁内完成（需求/18 §3.3），否则两个进程会
  // 读到同一个 base、拿到重叠的 revision 区间。同步锁：调用链（store-change-tracker.ts）是同步的。
  // 日志与锁同在一个项目的 `.taskfold/` 下，锁的范围正好就是这份日志的写入者。
  return withTaskfoldGlobalLockSync(locksDir, (guard) => reserveLocked(changesLogPath, count, guard).base);
}

/** 日志当前的游标：epoch + 最后一个 ceiling。还没有任何 reserve（ceiling 为 0）时没有合法游标。 */
function readFileChangeHead(changesLogPath: string): TaskfoldChange | undefined {
  const records = readChangeLogRecords(changesLogPath);
  const epoch = firstEpoch(records);
  const revision = lastCeiling(records);
  return epoch !== undefined && revision > 0 ? { epoch, revision } : undefined;
}

function isAhead(head: TaskfoldChange, seen: TaskfoldChange | undefined): boolean {
  return !seen || head.epoch !== seen.epoch || head.revision > seen.revision;
}

/**
 * 文件后端的 ChangeSource（需求/18 §3.3 第 6 行、§3.5 第 3 项）。游标就是日志本身：epoch 取日志
 * 的 epoch，revision 取日志最后一个 ceiling，所以同一个项目的所有进程看到的是同一条单调序列。
 *
 * - `record()`：本进程提交了写入，全局锁内追加一条 reserve（+1），返回新游标。**异步等锁**，
 *   锁被别的进程占着时不阻塞事件循环（TASK-10）。等锁超时不 throw（写入本身已经成功，不能因为
 *   记日志失败而报错），记下「欠一条」，由下次 `poll()` 补记。
 * - `poll()`：先看 `dataVersion`（file-store-reconcile.ts：人手改文件、`git checkout` 等绕过
 *   core 的改动，探测到时已在卡锁内重盖了 revision），有就记一条，让别的进程也能从日志感知；
 *   再看日志的 ceiling 有没有越过本进程上次见到的位置——越过了就是别的进程写过。poll 是同步
 *   契约（每秒一次），补记那一条**只试一次**锁，被占着就留到下一次 poll。
 * - `announce()`：给出启动时的游标（日志已有游标就直接用，不追加；要追加时同样只试一次）。
 *
 * `canWrite` 为 false（格式版本高于本版 core，只读）时不追加，只读别人写下的游标。
 */
export function createTaskfoldFileChangeSource(options: {
  changesLogPath: string;
  locksDir: string;
  dataVersion?: () => number;
  canWrite?: () => boolean;
}): TaskfoldChangeSource {
  const { changesLogPath, locksDir, dataVersion } = options;
  const canWrite = options.canWrite ?? (() => true);
  let seen = readFileChangeHead(changesLogPath);
  let externalDataVersion = dataVersion?.();
  let recordPending = false;

  function recorded({ epoch, base }: { epoch: string; base: number }): TaskfoldChange {
    recordPending = false;
    seen = { epoch, revision: base + 1 };
    return seen;
  }

  function deferOnLockConflict(error: unknown): undefined {
    if (isTaskfoldLockConflictError(error)) {
      recordPending = true;
      return undefined;
    }
    throw error;
  }

  /** 同步、只试一次：poll 与 announce 用。 */
  function recordOnce(): TaskfoldChange | undefined {
    if (!canWrite()) {
      return undefined;
    }
    try {
      return recorded(tryWithTaskfoldGlobalLockSync(locksDir, (guard) => reserveLocked(changesLogPath, 1, guard)));
    } catch (error) {
      return deferOnLockConflict(error);
    }
  }

  return {
    announce() {
      const head = readFileChangeHead(changesLogPath);
      if (head) {
        seen = head;
        return head;
      }
      return recordOnce();
    },
    async record() {
      if (!canWrite()) {
        return undefined;
      }
      try {
        return recorded(await withTaskfoldGlobalLock(locksDir, (guard) => reserveLocked(changesLogPath, 1, guard)));
      } catch (error) {
        return deferOnLockConflict(error);
      }
    },
    poll() {
      if (dataVersion) {
        const current = dataVersion();
        if (current !== externalDataVersion) {
          externalDataVersion = current;
          recordPending = true;
        }
      }
      if (recordPending) {
        const change = recordOnce();
        if (change) {
          return change;
        }
      }
      const head = readFileChangeHead(changesLogPath);
      if (head && isAhead(head, seen)) {
        seen = head;
        return head;
      }
      return undefined;
    },
  };
}
