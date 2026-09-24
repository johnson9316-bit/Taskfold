// Taskfold plugin module: the file-backed `documents` KeyedStore
// (`.taskfold/documents/<documentKey>.json`, 需求/16 第六节).
//
// Documents are the one entity in this skeleton where the KeyedStore `key` (always
// `document.id`, per the "key = the entity's own id" rule) and the filename disagree:
// the file is named after the separate, human-readable `document.key` slug, not the
// id. That mirrors sqlite-store.ts's TaskfoldSqliteProjectDocumentStore, where `id` is
// the primary key but `document_key` is a distinct column whose uniqueness is checked
// by the business layer scanning `entries()`, not by this store. Because filename and
// key are independent, finding a document by id means reading candidate files (there are
// only ever a few dozen per project), not just pattern-matching filenames.
import path from "node:path";
import type { TaskfoldProjectDocument } from "./contract/index.js";
import type { PersistedTaskfoldProjectDocument, TaskfoldKeyedStore } from "./persistence-types.js";
import {
  listFileNamesSafe,
  readFileIfExists,
  removeFileIfExists,
  writeFileAtomic,
} from "./file-store-atomic.js";

const DOCUMENT_EXTENSION = ".json";

function assertValidDocumentPayload(key: string, value: PersistedTaskfoldProjectDocument): void {
  if (value.version !== 1 || value.document.id !== key) {
    throw new Error("invalid taskfold project document payload");
  }
}

function documentFileName(document: TaskfoldProjectDocument): string {
  return `${document.key}${DOCUMENT_EXTENSION}`;
}

function readDocumentAt(filePath: string): TaskfoldProjectDocument | undefined {
  const content = readFileIfExists(filePath);
  if (content === undefined) {
    return undefined;
  }
  return JSON.parse(content) as TaskfoldProjectDocument;
}

function listDocumentFiles(documentsDir: string): string[] {
  return listFileNamesSafe(documentsDir).filter((fileName) =>
    fileName.endsWith(DOCUMENT_EXTENSION),
  );
}

function findDocumentFilePathById(documentsDir: string, id: string): string | undefined {
  for (const fileName of listDocumentFiles(documentsDir)) {
    const filePath = path.join(documentsDir, fileName);
    if (readDocumentAt(filePath)?.id === id) {
      return filePath;
    }
  }
  return undefined;
}

export function createTaskfoldFileDocumentStore(options: {
  documentsDir: string;
}): TaskfoldKeyedStore<PersistedTaskfoldProjectDocument> {
  const { documentsDir } = options;

  return {
    async register(key, value) {
      assertValidDocumentPayload(key, value);
      const existingPath = findDocumentFilePathById(documentsDir, key);
      const newPath = path.join(documentsDir, documentFileName(value.document));
      writeFileAtomic(newPath, JSON.stringify(value.document, null, 2));
      if (existingPath && existingPath !== newPath) {
        removeFileIfExists(existingPath);
      }
    },

    async lookup(key) {
      const filePath = findDocumentFilePathById(documentsDir, key);
      if (!filePath) {
        return undefined;
      }
      const document = readDocumentAt(filePath);
      return document ? { version: 1, document } : undefined;
    },

    async delete(key) {
      const filePath = findDocumentFilePathById(documentsDir, key);
      return filePath ? removeFileIfExists(filePath) : false;
    },

    async entries() {
      const results: Array<{ key: string; value: PersistedTaskfoldProjectDocument }> = [];
      for (const fileName of listDocumentFiles(documentsDir)) {
        const document = readDocumentAt(path.join(documentsDir, fileName));
        if (document) {
          results.push({ key: document.id, value: { version: 1, document } });
        }
      }
      return results;
    },
  };
}
