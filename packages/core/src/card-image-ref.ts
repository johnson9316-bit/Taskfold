// Taskfold core：卡片图片在 Markdown 里的引用格式。纯字符串函数，不依赖 Node，
// 后端（file-store-card-images.ts）与浏览器端（packages/ui）共用同一份规则。
//
// 引用：`../attachments/<卡 uuid>/<文件名>.<扩展名>`——从 `.taskfold/cards/` 看是真实的相对路径。

/** 允许的图片扩展名 → MIME。不收 svg：它能带脚本。 */
export const TASKFOLD_CARD_IMAGE_MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
};

const MIME_TO_EXTENSION: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/bmp": "bmp",
};

const SEGMENT = "[A-Za-z0-9][A-Za-z0-9_-]{0,63}";
export const TASKFOLD_CARD_ID_PATTERN = new RegExp(`^${SEGMENT}$`);
export const TASKFOLD_CARD_IMAGE_NAME_PATTERN = new RegExp(`^${SEGMENT}\\.([A-Za-z0-9]{2,5})$`);
const IMAGE_REF_PATTERN = new RegExp(`^\\.\\./attachments/(${SEGMENT})/(${SEGMENT}\\.[A-Za-z0-9]{2,5})$`);

export type TaskfoldCardImageRef = { cardId: string; name: string };

/** 图片扩展名对应的 MIME；不在白名单为 `undefined`。 */
export function taskfoldCardImageMimeType(extension: string): string | undefined {
  return TASKFOLD_CARD_IMAGE_MIME_BY_EXTENSION[extension.toLowerCase()];
}

/** MIME → 落盘扩展名；不在白名单为 `undefined`。 */
export function taskfoldCardImageExtensionForMime(mimeType: string): string | undefined {
  return MIME_TO_EXTENSION[mimeType.trim().toLowerCase()];
}

function isAllowedImageName(name: string): boolean {
  return (
    TASKFOLD_CARD_IMAGE_NAME_PATTERN.test(name) &&
    taskfoldCardImageMimeType(name.slice(name.lastIndexOf(".") + 1)) !== undefined
  );
}

export function assertTaskfoldCardId(cardId: string): void {
  if (!TASKFOLD_CARD_ID_PATTERN.test(cardId)) {
    throw new Error(`taskfold card image: invalid card id "${cardId}"`);
  }
}

export function assertTaskfoldCardImageName(name: string): void {
  if (!isAllowedImageName(name)) {
    throw new Error(`taskfold card image: invalid image name "${name}"`);
  }
}

export function taskfoldCardImageRef(cardId: string, name: string): string {
  assertTaskfoldCardId(cardId);
  assertTaskfoldCardImageName(name);
  return `../attachments/${cardId}/${name}`;
}

/** 解析 Markdown 里的图片引用；不是本机制的引用（外链、别的相对路径、svg）为 `undefined`。 */
export function parseTaskfoldCardImageRef(ref: string): TaskfoldCardImageRef | undefined {
  const match = IMAGE_REF_PATTERN.exec(ref);
  if (!match || !isAllowedImageName(match[2]!)) {
    return undefined;
  }
  return { cardId: match[1]!, name: match[2]! };
}

/**
 * 资料库文档（仓库里的 `.md` 文件）里的图片引用：相对文档所在目录的相对路径，扩展名在白名单内。
 * 只做语法判断（不是绝对路径、没有协议、没有 `?` `#` 与反斜杠）；是否真的落在项目内、允不允许读，
 * 由宿主在 `taskfold.projects.documents.assets.get` 里按路径权限再校验。
 */
export function isTaskfoldDocumentImageRef(ref: string): boolean {
  if (!ref || ref.length > 1024 || /[\\?#\0]/.test(ref) || ref.startsWith("/") || ref.startsWith("//")) {
    return false;
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(ref)) {
    return false;
  }
  const dot = ref.lastIndexOf(".");
  return dot > 0 && taskfoldCardImageMimeType(ref.slice(dot + 1)) !== undefined;
}
