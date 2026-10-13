// Taskfold core：卡片图片（粘贴进 notes / 评论的截图）的文件后端。
//
// 目录布局（格式版本 3，见 file-store-format.ts 的 TASKFOLD_CARD_IMAGES_FORMAT_VERSION）：
//   <repo>/.taskfold/attachments/<卡 uuid>/<文件名>.<扩展名>
//
// 文件夹即真相：不写元数据，不动卡片文件、不涨 revision。删卡 = 删整个文件夹，也不受旧附件机制
// （`metadata.attachments`，每卡 20 个、256 KiB）的限制。旧附件的平铺 blob 是 `attachments/` 下的
// 文件、这里是子目录，`listFileNamesSafe` 只列文件，两者互不干扰。
//
// 图片在 Markdown 里的引用是 `![alt](../attachments/<卡 uuid>/<文件名>)`：从 `.taskfold/cards/`
// 看是一条真实的相对路径，VS Code 预览与 AI 读取都不会断。
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { writeFileAtomic } from "./file-store-atomic.js";
import {
  assertTaskfoldCardId,
  assertTaskfoldCardImageName,
  taskfoldCardImageMimeType,
  TASKFOLD_CARD_ID_PATTERN,
  TASKFOLD_CARD_IMAGE_NAME_PATTERN,
} from "./card-image-ref.js";
import {
  assertTaskfoldFormatWritable,
  TASKFOLD_CARD_IMAGES_FORMAT_VERSION,
  upgradeTaskfoldFormatVersion,
} from "./file-store-format.js";
import { withTaskfoldGlobalLock } from "./file-store-locks.js";

export {
  parseTaskfoldCardImageRef,
  taskfoldCardImageExtensionForMime,
  taskfoldCardImageMimeType,
  taskfoldCardImageRef,
  type TaskfoldCardImageRef,
} from "./card-image-ref.js";

export type TaskfoldCardImage = { bytes: Uint8Array; mimeType: string };

export type TaskfoldCardImageStore = {
  /** 写入一张图，返回生成的文件名（不含目录）。首次写入会把项目升到格式版本 3。 */
  put(cardId: string, extension: string, bytes: Uint8Array): Promise<string>;
  get(cardId: string, name: string): Promise<TaskfoldCardImage | undefined>;
  list(cardId: string): Promise<string[]>;
  /** 删掉这张卡的整个图片文件夹；没有文件夹返回 false。 */
  removeCard(cardId: string): Promise<boolean>;
};

/** `<attachmentsDir>/<卡 uuid>`；卡 id 不合法直接抛，避免路径穿越。 */
export function taskfoldCardImageDir(attachmentsDir: string, cardId: string): string {
  assertTaskfoldCardId(cardId);
  return path.join(attachmentsDir, cardId);
}

/** 同步删除一张卡的图片文件夹（卡片删除路径用，缺失不报错）。 */
export function removeTaskfoldCardImageDir(attachmentsDir: string, cardId: string): boolean {
  // 删卡路径：卡文件已经没了，id 不合规（不可能有对应文件夹）就当没有，不能在这里抛。
  if (!TASKFOLD_CARD_ID_PATTERN.test(cardId)) {
    return false;
  }
  const dir = path.join(attachmentsDir, cardId);
  if (!fs.existsSync(dir)) {
    return false;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

/** 把一张卡的图片文件夹复制到另一个数据根（跨项目移卡）；目标已有同名文件不覆盖。 */
export function copyTaskfoldCardImageDir(fromAttachmentsDir: string, toAttachmentsDir: string, cardId: string): void {
  const from = taskfoldCardImageDir(fromAttachmentsDir, cardId);
  if (!fs.existsSync(from)) {
    return;
  }
  const to = taskfoldCardImageDir(toAttachmentsDir, cardId);
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const target = path.join(to, entry.name);
    if (entry.isFile() && !entry.name.startsWith(".") && !fs.existsSync(target)) {
      writeFileAtomic(target, fs.readFileSync(path.join(from, entry.name)));
    }
  }
}

function newImageName(extension: string): string {
  return `img-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}.${extension}`;
}

export function createTaskfoldFileCardImageStore(options: {
  attachmentsDir: string;
  locksDir: string;
  configPath: string;
}): TaskfoldCardImageStore {
  const { attachmentsDir, locksDir, configPath } = options;

  return {
    async put(cardId, extension, bytes) {
      const ext = extension.toLowerCase();
      if (taskfoldCardImageMimeType(ext) === undefined) {
        throw new Error(`taskfold card image: unsupported image type "${extension}"`);
      }
      if (bytes.byteLength === 0) {
        throw new Error("taskfold card image: image is empty");
      }
      const dir = taskfoldCardImageDir(attachmentsDir, cardId);
      assertTaskfoldFormatWritable(configPath);
      // 先升格式、再落盘：旧版 core 删卡不认这个目录，必须在目录出现之前就被挡进只读模式。
      await withTaskfoldGlobalLock(locksDir, (guard) => {
        upgradeTaskfoldFormatVersion(configPath, guard.assertHeld, TASKFOLD_CARD_IMAGES_FORMAT_VERSION);
      });
      const name = newImageName(ext);
      writeFileAtomic(path.join(dir, name), bytes);
      return name;
    },

    async get(cardId, name) {
      assertTaskfoldCardId(cardId);
      assertTaskfoldCardImageName(name);
      let bytes: Buffer;
      try {
        bytes = fs.readFileSync(path.join(attachmentsDir, cardId, name));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          return undefined;
        }
        throw err;
      }
      const mimeType = taskfoldCardImageMimeType(name.slice(name.lastIndexOf(".") + 1))!;
      return { bytes, mimeType };
    },

    async list(cardId) {
      const dir = taskfoldCardImageDir(attachmentsDir, cardId);
      try {
        return fs
          .readdirSync(dir, { withFileTypes: true })
          .filter((entry) => entry.isFile() && !entry.name.startsWith(".") && TASKFOLD_CARD_IMAGE_NAME_PATTERN.test(entry.name))
          .map((entry) => entry.name)
          .sort();
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          return [];
        }
        throw err;
      }
    },

    async removeCard(cardId) {
      assertTaskfoldFormatWritable(configPath);
      return removeTaskfoldCardImageDir(attachmentsDir, cardId);
    },
  };
}
