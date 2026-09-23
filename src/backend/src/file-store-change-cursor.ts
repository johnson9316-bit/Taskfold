// Taskfold plugin module: the change-cursor triple (changeEpoch / reserveChangeRevisions
// / dataVersion) for the file-backed store, ported from sqlite-store.ts's
// `ensureChangeEpoch` / `reserveChangeRevisions` / `PRAGMA data_version` wiring but backed
// by `changes.log` (需求/16 分叉 E2) instead of a `taskfold_meta` table.
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { createFileExclusive, readFileIfExists } from "./file-store-atomic.js";
import { TASKFOLD_FILE_STORE_FILE_MODE } from "./file-store-paths.js";

type ChangeLogRecord = { type: "epoch"; epoch: string } | { type: "reserve"; ceiling: number };

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

/**
 * Reads the log-level epoch, creating it if this is the first time anyone has opened
 * this project's change log. `createFileExclusive` (open with O_EXCL) is the
 * insert-if-absent primitive here, playing the same role `INSERT OR IGNORE` plays for
 * sqlite-store.ts's `ensureChangeEpoch`: if two callers race to create the file, only
 * one create wins, and both re-read the file afterwards so the actual winner's epoch is
 * what everyone uses. The epoch must be scoped to the log file (not generated fresh per
 * process) so a Gateway restart does not invalidate every UI's long-poll cursor.
 */
export function ensureFileChangeEpoch(changesLogPath: string): string {
  const existing = readChangeLogRecords(changesLogPath).find(
    (record): record is { type: "epoch"; epoch: string } => record.type === "epoch",
  );
  if (existing) {
    return existing.epoch;
  }
  const epoch = randomUUID();
  const line = `${JSON.stringify({ type: "epoch", epoch })}\n`;
  createFileExclusive(changesLogPath, line, TASKFOLD_FILE_STORE_FILE_MODE);
  // Re-read regardless of whether this call won the create: a concurrent creator's
  // value is the one that counts, exactly as sqlite-store.ts's comment notes for its
  // own SELECT-after-INSERT-OR-IGNORE.
  const stored = readChangeLogRecords(changesLogPath).find(
    (record): record is { type: "epoch"; epoch: string } => record.type === "epoch",
  );
  return stored?.epoch ?? epoch;
}

/**
 * Hands out a reserved block of change revisions, exactly like sqlite-store.ts's
 * `reserveChangeRevisions`: reads the last recorded ceiling (treating a missing or
 * corrupt value as 0, never as a negative or non-integer base), appends a new ceiling
 * `base + count`, and returns `base` (the block's lower bound) to the caller.
 */
export function reserveFileChangeRevisions(changesLogPath: string, count: number): number {
  const records = readChangeLogRecords(changesLogPath);
  let base = 0;
  for (const record of records) {
    if (record.type === "reserve" && Number.isSafeInteger(record.ceiling) && record.ceiling > 0) {
      base = record.ceiling;
    }
  }
  const nextCeiling = base + count;
  fs.appendFileSync(changesLogPath, `${JSON.stringify({ type: "reserve", ceiling: nextCeiling })}\n`, {
    mode: TASKFOLD_FILE_STORE_FILE_MODE,
  });
  return base;
}

