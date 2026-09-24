// Taskfold plugin module: the card id allocator (需求/16 第七节).
//
// Why this scans the directory instead of keeping a counter in config.yml (原规划的
// 理由已失效, 新理由如下): 需求/16 originally rejected a config.yml counter because
// the `backlog` CLI could create cards in the same directory without updating it. That
// specific reason evaporated once cards moved to `<repo>/.taskfold/cards/` and gave up
// backlog CLI interoperability (2026-09-18 决策，见任务书). The conclusion still holds
// for a different reason: this directory is a tracked, human- and git-editable part of
// the repo. Someone can hand-create a card file, and `git checkout`/`git pull` can swap
// the whole directory's contents for a different branch's -- either one leaves a stored
// counter arbitrarily stale relative to what is actually on disk, with no way to detect
// the drift short of scanning anyway. Scanning for the max id on every allocation is the
// only source of truth that cannot drift from disk, and at the scale this project runs
// at (~100 cards) it costs nothing.
import path from "node:path";
import {
  filenameIdToken,
  listFileNamesSafe,
  parseCanonicalOrdinalId,
} from "./file-store-atomic.js";

/**
 * Scans `directories` for filenames whose leading id token (before " - ", or the whole
 * stem if there is none) canonically matches `prefix`, and returns `PREFIX-<max + 1>`
 * (uppercase, no leading zeros) -- one past the highest ordinal found. An id allocator
 * that only ever looked at `cards/` would reuse an id the moment a card is archived by
 * a future physical-archive feature (需求/16 第六节), so `archiveDirectories` (typically
 * `.taskfold/archive/cards`) is scanned too even though nothing populates it yet.
 */
export function allocateNextOrdinalId(options: {
  prefix: string;
  directories: readonly string[];
}): string {
  const canonicalPrefix = options.prefix.toUpperCase();
  let max = 0;
  for (const dir of options.directories) {
    for (const fileName of listFileNamesSafe(dir)) {
      const stem = fileName.slice(0, fileName.length - path.extname(fileName).length);
      const parsed = parseCanonicalOrdinalId(filenameIdToken(stem));
      if (parsed && parsed.prefix === canonicalPrefix) {
        max = Math.max(max, parsed.number);
      }
    }
  }
  return `${canonicalPrefix}-${max + 1}`;
}

/** Convenience wrapper for cards specifically: `CARD-<n>`, scanning `cardsDir` and
 * `archiveCardsDir`. */
export function allocateNextTaskfoldCardId(cardsDir: string, archiveCardsDir: string): string {
  return allocateNextOrdinalId({ prefix: "CARD", directories: [cardsDir, archiveCardsDir] });
}

/** Convenience wrapper for milestones: `M-<n>`, scanning `milestonesDir`. */
export function allocateNextTaskfoldMilestoneId(milestonesDir: string): string {
  return allocateNextOrdinalId({ prefix: "M", directories: [milestonesDir] });
}
