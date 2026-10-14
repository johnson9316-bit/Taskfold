import type { TaskfoldProjectDocument, TaskfoldWorkspaceAccess } from "@taskfold/core/contract/index.js";
import {
  readTaskfoldProjectDocument as readCoreProjectDocument,
  readTaskfoldProjectDocumentAsset as readCoreProjectDocumentAsset,
  writeTaskfoldProjectDocumentAsset as writeCoreProjectDocumentAsset,
  writeTaskfoldProjectDocumentPath as writeCoreProjectDocumentPath,
} from "@taskfold/core/project-document-reader.js";
import { assertTaskfoldWorkspaceSourceAccess } from "./workspace-access.js";

function pathAccess(access: TaskfoldWorkspaceAccess) {
  return async (filePath: string) => {
    await assertTaskfoldWorkspaceSourceAccess({ kind: "dir", path: filePath }, access);
  };
}

export async function readTaskfoldProjectDocument(params: {
  document: TaskfoldProjectDocument;
  access: TaskfoldWorkspaceAccess;
}) {
  return await readCoreProjectDocument({ document: params.document, assertPathAllowed: pathAccess(params.access) });
}

export async function writeTaskfoldProjectDocumentPath(params: {
  document: TaskfoldProjectDocument;
  content: unknown;
  expectedRevision: unknown;
  access: TaskfoldWorkspaceAccess;
}) {
  if (!params.access.unrestricted && !params.access.writable) {
    throw new Error("project document workspace access is read-only.");
  }
  return await writeCoreProjectDocumentPath({
    document: params.document,
    content: params.content,
    expectedRevision: params.expectedRevision,
    assertPathAllowed: pathAccess(params.access),
  });
}

export async function readTaskfoldProjectDocumentAsset(params: {
  document: TaskfoldProjectDocument;
  ref: unknown;
  access: TaskfoldWorkspaceAccess;
}) {
  return await readCoreProjectDocumentAsset({
    document: params.document,
    ref: params.ref,
    assertPathAllowed: pathAccess(params.access),
  });
}

export async function writeTaskfoldProjectDocumentAsset(params: {
  document: TaskfoldProjectDocument;
  fileName: unknown;
  mimeType: unknown;
  contentBase64: unknown;
  access: TaskfoldWorkspaceAccess;
}) {
  if (!params.access.unrestricted && !params.access.writable) {
    throw new Error("project document workspace access is read-only.");
  }
  return await writeCoreProjectDocumentAsset({
    document: params.document,
    fileName: params.fileName,
    mimeType: params.mimeType,
    contentBase64: params.contentBase64,
    assertPathAllowed: pathAccess(params.access),
  });
}
