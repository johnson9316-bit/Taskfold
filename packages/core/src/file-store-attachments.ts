// Taskfold plugin module: the file-backed `attachments` KeyedStore
// (`.taskfold/attachments/<attachmentId>`, bare blob files, 需求/16 第六节).
//
// Two-phase split, ported verbatim from sqlite-store.ts's TaskfoldSqliteAttachmentStore:
// this store's `register` writes only the blob. Attachment *metadata*
// (fileName/byteSize/mimeType/cardId/...) lives inside the owning card's own file, in
// `metadata.attachments`, and is written by the card store whenever the caller updates
// the card (store-core.ts's `addAttachment`/`deleteAttachment`/`deleteDetachedAttachments`
// -- none of that business logic changes for this backend). `lookup`/`entries` here are
// the file-backed equivalent of sqlite-store.ts's
// `taskfold_card_attachments a JOIN taskfold_attachment_blobs b`: an attachment is only
// ever visible once *both* halves exist, so a half-finished attachment (blob written
// but not yet indexed into any card's metadata, or the reverse) is invisible -- the same
// implicit consistency fallback the SQL INNER JOIN gives sqlite-store.ts for free.
import path from "node:path";
import type { TaskfoldAttachment, TaskfoldCard } from "./contract/index.js";
import type { PersistedTaskfoldAttachment, TaskfoldKeyedStore } from "./persistence-types.js";
import { unsupportedTaskfoldCompareAndSwap } from "./file-store-cas.js";
import {
  asBlobContent,
  blobToBase64,
  listFileNamesSafe,
  readBufferIfExists,
  removeFileIfExists,
  writeFileAtomic,
} from "./file-store-atomic.js";
import type { TaskfoldCardCodec } from "./file-store-codec.js";

function assertValidAttachmentPayload(key: string, value: PersistedTaskfoldAttachment): void {
  if (value.version !== 1 || value.attachment.id !== key) {
    throw new Error("invalid taskfold attachment payload");
  }
}

/** Scans every card for one whose `metadata.attachments` references `attachmentId`.
 * There is no attachment-id index; at the ~100-card scale 需求/16 targets this is cheap,
 * and it is the only way to recover the JOIN semantics above without a database. */
function findAttachmentMetadata(
  cardsDir: string,
  cardCodec: TaskfoldCardCodec,
  attachmentId: string,
): TaskfoldAttachment | undefined {
  for (const fileName of listFileNamesSafe(cardsDir)) {
    if (!fileName.endsWith(".md")) {
      continue;
    }
    const content = readBufferIfExists(path.join(cardsDir, fileName))?.toString("utf8");
    if (content === undefined) {
      continue;
    }
    let card: TaskfoldCard;
    try {
      card = cardCodec.parse(content);
    } catch {
      // A card file that fails to parse is not this attachment's owner; skip it rather
      // than letting one bad file break every attachment lookup.
      continue;
    }
    const match = card.metadata?.attachments?.find((attachment) => attachment.id === attachmentId);
    if (match) {
      return match;
    }
  }
  return undefined;
}

export function createTaskfoldFileAttachmentStore(options: {
  attachmentsDir: string;
  cardsDir: string;
  cardCodec: TaskfoldCardCodec;
}): TaskfoldKeyedStore<PersistedTaskfoldAttachment> {
  const { attachmentsDir, cardsDir, cardCodec } = options;

  function blobPath(id: string): string {
    return path.join(attachmentsDir, id);
  }

  function lookupJoined(id: string): PersistedTaskfoldAttachment | undefined {
    const blob = readBufferIfExists(blobPath(id));
    if (!blob) {
      return undefined;
    }
    const attachment = findAttachmentMetadata(cardsDir, cardCodec, id);
    if (!attachment) {
      // Blob exists but no card indexes it yet (or any more) -- half-finished/orphaned,
      // stays invisible exactly like the SQL INNER JOIN's non-match.
      return undefined;
    }
    return { version: 1, attachment, contentBase64: blobToBase64(blob) };
  }

  return {
    async register(key, value) {
      assertValidAttachmentPayload(key, value);
      writeFileAtomic(blobPath(key), asBlobContent(value.contentBase64));
    },

    async lookup(key) {
      return lookupJoined(key);
    },

    async delete(key) {
      return removeFileIfExists(blobPath(key));
    },

    async entries() {
      const results: Array<{ key: string; value: PersistedTaskfoldAttachment }> = [];
      for (const id of listFileNamesSafe(attachmentsDir)) {
        const joined = lookupJoined(id);
        if (joined) {
          results.push({ key: id, value: joined });
        }
      }
      return results;
    },

    // 没有条件写的调用方（需求/16 R1 只要求卡片）；显式拒绝，绝不静默穿透成无条件写。
    compareAndSwap: unsupportedTaskfoldCompareAndSwap,
  };
}
