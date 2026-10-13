import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  TaskfoldProjectDocument,
  TaskfoldProjectDocumentRead,
} from "./contract/index.js";
import {
  isTaskfoldDocumentImageRef,
  taskfoldCardImageExtensionForMime,
  taskfoldCardImageMimeType,
} from "./card-image-ref.js";

const MAX_PROJECT_DOCUMENT_BYTES = 1024 * 1024;
const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);

type ResolvedProjectDocumentFile = {
  content: string;
  bytes: Buffer;
  path: string;
  stat: Awaited<ReturnType<typeof fs.stat>>;
};

function documentRevision(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function decodeUtf8(bytes: Uint8Array): string {
  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("project document file is not valid UTF-8 text.");
  }
  if (content.includes("\0")) {
    throw new Error("project document file is not valid UTF-8 text.");
  }
  return content;
}

function encodeDocumentContent(content: unknown): Buffer {
  if (typeof content !== "string") {
    throw new Error("document content must be a string.");
  }
  const bytes = Buffer.from(content, "utf8");
  if (bytes.byteLength > MAX_PROJECT_DOCUMENT_BYTES) {
    throw new Error("project document content exceeds the 1 MiB limit.");
  }
  if (decodeUtf8(bytes) !== content) {
    throw new Error("document content is not valid UTF-8 text.");
  }
  return bytes;
}

function assertMarkdownPath(document: TaskfoldProjectDocument): string {
  if (document.type !== "path" || !document.target) {
    throw new Error("only Markdown documents and Markdown file paths can be previewed.");
  }
  const fileName = path.basename(document.target).toLowerCase();
  if (fileName === ".env" || fileName.startsWith(".env.")) {
    throw new Error("environment files cannot be previewed as project documents.");
  }
  if (!MARKDOWN_EXTENSIONS.has(path.extname(document.target).toLowerCase())) {
    throw new Error("project document paths must reference a Markdown file.");
  }
  return document.target;
}

async function resolveProjectDocumentFile(params: {
  document: TaskfoldProjectDocument;
  assertPathAllowed: (filePath: string) => Promise<void>;
}): Promise<ResolvedProjectDocumentFile> {
  const target = assertMarkdownPath(params.document);
  let resolvedPath: string;
  try {
    resolvedPath = await fs.realpath(target);
  } catch {
    throw new Error("project document file does not exist.");
  }
  await params.assertPathAllowed(resolvedPath);
  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(resolvedPath);
  } catch {
    throw new Error("project document file cannot be read.");
  }
  if (!stat.isFile()) {
    throw new Error("project document path must reference a regular file.");
  }
  if (stat.size > MAX_PROJECT_DOCUMENT_BYTES) {
    throw new Error("project document file exceeds the 1 MiB preview limit.");
  }
  let bytes: Buffer;
  try {
    bytes = await fs.readFile(resolvedPath);
  } catch {
    throw new Error("project document file cannot be read.");
  }
  return { content: decodeUtf8(bytes), bytes, path: resolvedPath, stat };
}

export async function readTaskfoldProjectDocument(params: {
  document: TaskfoldProjectDocument;
  assertPathAllowed: (filePath: string) => Promise<void>;
}): Promise<TaskfoldProjectDocumentRead> {
  const { document } = params;
  if (document.type === "markdown") {
    const content = document.content ?? "";
    return {
      document,
      content,
      source: "stored",
      revision: `stored:${document.updatedAt}:${documentRevision(Buffer.from(content, "utf8"))}`,
    };
  }
  const file = await resolveProjectDocumentFile(params);
  return {
    document,
    content: file.content,
    source: "path",
    revision: documentRevision(file.bytes),
    path: file.path,
    modifiedAt: Math.trunc(Number(file.stat.mtimeMs)),
  };
}

export async function writeTaskfoldProjectDocumentPath(params: {
  document: TaskfoldProjectDocument;
  content: unknown;
  expectedRevision: unknown;
  assertPathAllowed: (filePath: string) => Promise<void>;
}): Promise<TaskfoldProjectDocumentRead> {
  if (typeof params.expectedRevision !== "string" || !params.expectedRevision) {
    throw new Error("expected document revision is required.");
  }
  const content = encodeDocumentContent(params.content);
  const current = await resolveProjectDocumentFile(params);
  if (documentRevision(current.bytes) !== params.expectedRevision) {
    throw new Error("project document changed on disk; reload it before saving.");
  }

  const directory = path.dirname(current.path);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(current.path)}.taskfold-${randomUUID()}.tmp`,
  );
  const originalMode = Number(current.stat.mode) & 0o7777;
  try {
    const handle = await fs.open(temporaryPath, "wx", originalMode);
    try {
      await handle.writeFile(content);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.chmod(temporaryPath, originalMode);
    await fs.rename(temporaryPath, current.path);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
  return await readTaskfoldProjectDocument({
    document: params.document,
    assertPathAllowed: params.assertPathAllowed,
  });
}

/** 文档里一张图的上限。传输层（网关一帧 25 MiB、base64 膨胀）才是真正的顶，这里只防读入过大的文件。 */
const MAX_DOCUMENT_IMAGE_BYTES = 16 * 1024 * 1024;

function documentAssetsDirName(documentFile: string): string {
  const base = path.basename(documentFile, path.extname(documentFile));
  return `${base}.assets`;
}

/** `(`、`)` 等在 Markdown 链接里有特殊含义，`encodeURIComponent` 不会转，手动补上。 */
function encodeRefSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * 读文档里引用的一张图（相对文档所在目录）。ref 必须是相对路径、白名单图片扩展名；
 * 解析（含符号链接）后的真实路径必须通过宿主的路径权限，所以 `../` 逃不出允许的范围。
 */
export async function readTaskfoldProjectDocumentAsset(params: {
  document: TaskfoldProjectDocument;
  ref: unknown;
  assertPathAllowed: (filePath: string) => Promise<void>;
}): Promise<{ mimeType: string; contentBase64: string }> {
  if (params.document.type !== "path") {
    throw new Error("images are only available for Markdown file documents.");
  }
  if (typeof params.ref !== "string" || !isTaskfoldDocumentImageRef(params.ref)) {
    throw new Error("invalid document image reference.");
  }
  let relative: string;
  try {
    relative = decodeURIComponent(params.ref);
  } catch {
    throw new Error("invalid document image reference.");
  }
  if (relative.includes("\0") || !isTaskfoldDocumentImageRef(relative)) {
    throw new Error("invalid document image reference.");
  }
  const document = await resolveProjectDocumentFile(params);
  const target = path.resolve(path.dirname(document.path), relative);
  let resolvedPath: string;
  try {
    resolvedPath = await fs.realpath(target);
  } catch {
    throw new Error("document image does not exist.");
  }
  await params.assertPathAllowed(resolvedPath);
  const mimeType = taskfoldCardImageMimeType(path.extname(resolvedPath).slice(1));
  if (!mimeType) {
    throw new Error("invalid document image reference.");
  }
  const stat = await fs.stat(resolvedPath);
  if (!stat.isFile()) {
    throw new Error("document image must be a regular file.");
  }
  if (stat.size > MAX_DOCUMENT_IMAGE_BYTES) {
    throw new Error("document image exceeds the size limit.");
  }
  return { mimeType, contentBase64: (await fs.readFile(resolvedPath)).toString("base64") };
}

/**
 * 给文档存一张图，放在文档旁的 `<文档名>.assets/` 里，返回写进 Markdown 的相对引用。
 * 文档文件本身不动（由编辑器随后把引用写进正文并保存）。
 */
export async function writeTaskfoldProjectDocumentAsset(params: {
  document: TaskfoldProjectDocument;
  fileName?: unknown;
  mimeType?: unknown;
  contentBase64?: unknown;
  assertPathAllowed: (filePath: string) => Promise<void>;
}): Promise<{ ref: string; name: string; mimeType: string; byteSize: number }> {
  if (params.document.type !== "path") {
    throw new Error("images are only available for Markdown file documents.");
  }
  const content = typeof params.contentBase64 === "string" ? params.contentBase64 : "";
  if (!content || !/^[A-Za-z0-9+/]*={0,2}$/.test(content) || content.length % 4 !== 0) {
    throw new Error("document image contentBase64 must be canonical base64.");
  }
  const bytes = Buffer.from(content, "base64");
  if (bytes.length === 0 || bytes.toString("base64") !== content) {
    throw new Error("document image contentBase64 must be canonical base64.");
  }
  const fileName = typeof params.fileName === "string" ? params.fileName.trim() : "";
  const fileExtension = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase() : "";
  const extension =
    (typeof params.mimeType === "string" ? taskfoldCardImageExtensionForMime(params.mimeType) : undefined) ??
    (taskfoldCardImageMimeType(fileExtension) ? fileExtension : undefined);
  if (!extension) {
    throw new Error("document image must be png, jpeg, gif, webp, avif or bmp.");
  }
  // 文档文件本身已通过路径权限；图片放在它旁边的子目录里，不会跳出同一个目录。
  const document = await resolveProjectDocumentFile(params);
  const directory = path.dirname(document.path);
  const assetsDirName = documentAssetsDirName(document.path);
  const assetsDir = path.join(directory, assetsDirName);
  const existing = await fs.lstat(assetsDir).catch(() => undefined);
  if (existing && (existing.isSymbolicLink() || !existing.isDirectory())) {
    throw new Error(`${assetsDirName} must be a regular directory.`);
  }
  await fs.mkdir(assetsDir, { recursive: true });
  const name = `img-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}.${extension}`;
  await fs.writeFile(path.join(assetsDir, name), bytes, { flag: "wx", mode: 0o644 });
  return {
    ref: `${encodeRefSegment(assetsDirName)}/${name}`,
    name,
    mimeType: taskfoldCardImageMimeType(extension)!,
    byteSize: bytes.byteLength,
  };
}
