// 卡片图片的前端客户端：经宿主的 `taskfold.cards.images.*` 上传、按引用取图（带缓存），
// 以及「新建卡片时还没有卡 id」的暂存与落盘、复制卡片时的图片拷贝。
//
// 与宿主无关：只依赖一个 `request(method, params)`，OpenClaw 网关与 VS Code 扩展都实现了
// 同名的两个方法（`add` / `get`），图片以 base64 经 RPC 往返，显示用 data URL
// （两个宿主的 CSP 都放行 `data:` 图片；VS Code 不放行 `blob:`）。
import { isTaskfoldDocumentImageRef, parseTaskfoldCardImageRef } from "@taskfold/core/card-image-ref.js";

export type CardImageRequest = (method: string, params: Record<string, unknown>) => Promise<unknown>;

type AddResult = { ref: string };
type GetResult = { mimeType: string; contentBase64: string };

const PENDING_SCHEME = "pending:";
const PENDING_IMAGE = /!\[([^\]]*)\]\(pending:(\d+)\)/g;
/** Markdown 里指向某张卡图片文件夹的引用（含它的括号）。 */
const CARD_IMAGE_REF = /\]\((\.\.\/attachments\/[^)\s]+)\)/g;

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("cannot read the image file")));
    reader.readAsDataURL(file);
  });
}

async function readAsBase64(file: Blob): Promise<string> {
  const dataUrl = await readAsDataUrl(file);
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

export function isPendingImageRef(ref: string): boolean {
  return ref.startsWith(PENDING_SCHEME);
}

export type CardImageClient = {
  /** 存一张图到某张卡，返回写进 Markdown 的引用。 */
  upload(cardId: string, file: File): Promise<string>;
  /** 引用 → data URL；不是本机制的引用（外链、别的路径）或取不到返回 `undefined`。 */
  resolve(ref: string): Promise<string | undefined>;
  /** 新建卡片时还没有卡 id：先暂存在内存里，返回 `pending:<n>` 占位引用。 */
  stage(file: File): string;
  /** 暂存的图片在编辑器里的预览（`pending:<n>` → data URL）。 */
  resolvePending(ref: string): Promise<string | undefined>;
  /** 卡创建好之后，把 Markdown 里的暂存图片上传到这张卡并换成真实引用。 */
  flushPending(cardId: string, markdown: string): Promise<string>;
  /** 去掉 Markdown 里的暂存图片（先建卡、再上传失败时，不让占位引用落盘）。 */
  stripPending(markdown: string): string;
  /** 复制卡片：把 Markdown 里属于 `fromCardId` 的图片拷到 `toCardId`，返回改写后的 Markdown。 */
  copyImages(fromCardId: string, toCardId: string, markdown: string): Promise<string>;
  hasPending(markdown: string): boolean;
  clearPending(): void;
};

export function createCardImageClient(request: CardImageRequest): CardImageClient {
  const resolved = new Map<string, Promise<string | undefined>>();
  const staged = new Map<number, File>();
  let nextPending = 1;

  const upload: CardImageClient["upload"] = async (cardId, file) => {
    const result = (await request("taskfold.cards.images.add", {
      id: cardId,
      fileName: file.name,
      mimeType: file.type,
      contentBase64: await readAsBase64(file),
    })) as AddResult;
    return result.ref;
  };

  const fetchImage = async (ref: string): Promise<string | undefined> => {
    const parsed = parseTaskfoldCardImageRef(ref);
    if (!parsed) {
      return undefined;
    }
    const image = (await request("taskfold.cards.images.get", {
      id: parsed.cardId,
      name: parsed.name,
    })) as GetResult;
    return `data:${image.mimeType};base64,${image.contentBase64}`;
  };

  return {
    upload,
    resolve(ref) {
      let cached = resolved.get(ref);
      if (!cached) {
        cached = fetchImage(ref).catch((error) => {
          // 失败不缓存：宿主刚重连、或图片稍后才同步到时可以重试。
          resolved.delete(ref);
          throw error;
        });
        resolved.set(ref, cached);
      }
      return cached;
    },
    stage(file) {
      const id = nextPending++;
      staged.set(id, file);
      return `${PENDING_SCHEME}${id}`;
    },
    async resolvePending(ref) {
      const file = staged.get(Number(ref.slice(PENDING_SCHEME.length)));
      return file ? await readAsDataUrl(file) : undefined;
    },
    async flushPending(cardId, markdown) {
      const uploads = new Map<string, string>();
      for (const match of markdown.matchAll(PENDING_IMAGE)) {
        const id = Number(match[2]);
        const file = staged.get(id);
        if (file && !uploads.has(match[0])) {
          uploads.set(match[0], `![${match[1]}](${await upload(cardId, file)})`);
        }
      }
      return markdown.replace(PENDING_IMAGE, (whole) => uploads.get(whole) ?? "");
    },
    stripPending: (markdown) => markdown.replace(PENDING_IMAGE, ""),
    async copyImages(fromCardId, toCardId, markdown) {
      const copies = new Map<string, string>();
      for (const match of markdown.matchAll(CARD_IMAGE_REF)) {
        const ref = match[1]!;
        const parsed = parseTaskfoldCardImageRef(ref);
        if (!parsed || parsed.cardId !== fromCardId || copies.has(ref)) {
          continue;
        }
        const image = (await request("taskfold.cards.images.get", {
          id: parsed.cardId,
          name: parsed.name,
        })) as GetResult;
        const added = (await request("taskfold.cards.images.add", {
          id: toCardId,
          fileName: parsed.name,
          mimeType: image.mimeType,
          contentBase64: image.contentBase64,
        })) as AddResult;
        copies.set(ref, added.ref);
      }
      return markdown.replace(CARD_IMAGE_REF, (whole, ref: string) => {
        const copy = copies.get(ref);
        return copy ? `](${copy})` : whole;
      });
    },
    hasPending: (markdown) => new RegExp(PENDING_IMAGE.source).test(markdown),
    clearPending() {
      staged.clear();
    },
  };
}

export type DocumentImageClient = {
  /** 存一张图到文档旁的 `<文档名>.assets/`，返回写进 Markdown 的相对引用。 */
  upload(documentId: string, file: File): Promise<string>;
  /** 文档里的引用 → data URL；不是合法的相对图片引用或取不到返回 `undefined`。 */
  resolve(documentId: string, ref: string): Promise<string | undefined>;
};

export function createDocumentImageClient(request: CardImageRequest): DocumentImageClient {
  const resolved = new Map<string, Promise<string | undefined>>();
  return {
    async upload(documentId, file) {
      const result = (await request("taskfold.projects.documents.assets.add", {
        id: documentId,
        fileName: file.name,
        mimeType: file.type,
        contentBase64: await readAsBase64(file),
      })) as AddResult;
      return result.ref;
    },
    resolve(documentId, ref) {
      if (!isTaskfoldDocumentImageRef(ref)) {
        return Promise.resolve(undefined);
      }
      const key = `${documentId}\u0000${ref}`;
      let cached = resolved.get(key);
      if (!cached) {
        cached = (async () => {
          const image = (await request("taskfold.projects.documents.assets.get", { id: documentId, ref })) as GetResult;
          return `data:${image.mimeType};base64,${image.contentBase64}`;
        })().catch((error) => {
          resolved.delete(key);
          throw error;
        });
        resolved.set(key, cached);
      }
      return cached;
    },
  };
}
