import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTaskfoldFileStores } from "@taskfold/core/file-store.js";
import {
  parseTaskfoldCardImageRef,
  taskfoldCardImageRef,
} from "@taskfold/core/file-store-card-images.js";
import {
  TASKFOLD_CARD_IMAGES_FORMAT_VERSION,
  TASKFOLD_FORMAT_VERSION,
  TaskfoldFormatTooNewError,
  upgradeTaskfoldFormatVersion,
} from "@taskfold/core/file-store-format.js";
import { TaskfoldStore } from "../packages/openclaw/src/backend/src/store.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function tempDataDir(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-card-images-"));
  roots.push(root);
  return path.join(root, "repo", ".taskfold");
}

function readFormatVersion(dataDir: string): string {
  return /^format_version:\s*(\S+)/m.exec(fs.readFileSync(path.join(dataDir, "config.yml"), "utf8"))![1]!;
}

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

function newStore(dataDir: string) {
  const stores = createTaskfoldFileStores({ dataDir });
  return { stores, store: TaskfoldStore.fromStores(stores) };
}

describe("卡片图片：磁盘存储", () => {
  it("put/get 往返；文件落在 attachments/<卡 id>/ 下且带真实扩展名", async () => {
    const dataDir = tempDataDir();
    const { stores } = newStore(dataDir);

    const name = await stores.cardImages.put("CARD-1", "png", PNG);

    expect(name).toMatch(/^img-[a-z0-9]+-[0-9a-f]{6}\.png$/);
    expect(fs.existsSync(path.join(dataDir, "attachments", "CARD-1", name))).toBe(true);
    const image = await stores.cardImages.get("CARD-1", name);
    expect(image?.mimeType).toBe("image/png");
    expect(Buffer.from(image!.bytes).equals(PNG)).toBe(true);
    expect(await stores.cardImages.list("CARD-1")).toEqual([name]);
    expect(await stores.cardImages.list("CARD-2")).toEqual([]);
    expect(await stores.cardImages.get("CARD-1", "img-nope-000000.png")).toBeUndefined();
  });

  it("格式版本惰性升级：没写过图片的项目仍是 2，第一张图之后变成 3", async () => {
    const dataDir = tempDataDir();
    const { stores } = newStore(dataDir);
    expect(readFormatVersion(dataDir)).toBe("2");

    await stores.cardImages.put("CARD-1", "png", PNG);

    expect(readFormatVersion(dataDir)).toBe(String(TASKFOLD_CARD_IMAGES_FORMAT_VERSION));
    expect(readFormatVersion(dataDir)).toBe("3");
  });

  it("升级里程碑格式（默认目标 2）不会把已经是 3 的项目降回去", async () => {
    const dataDir = tempDataDir();
    const { stores } = newStore(dataDir);
    await stores.cardImages.put("CARD-1", "png", PNG);

    upgradeTaskfoldFormatVersion(path.join(dataDir, "config.yml"), () => {});

    expect(readFormatVersion(dataDir)).toBe("3");
  });

  it("拒绝路径穿越、非图片类型、空内容", async () => {
    const dataDir = tempDataDir();
    const { stores } = newStore(dataDir);

    await expect(stores.cardImages.put("../evil", "png", PNG)).rejects.toThrow(/invalid card id/);
    await expect(stores.cardImages.put("CARD-1", "svg", PNG)).rejects.toThrow(/unsupported image type/);
    await expect(stores.cardImages.put("CARD-1", "png", new Uint8Array())).rejects.toThrow(/empty/);
    await expect(stores.cardImages.get("CARD-1", "../../config.yml")).rejects.toThrow(/invalid image name/);
    await expect(stores.cardImages.get("..", "a.png")).rejects.toThrow(/invalid card id/);
    // 失败的写入不应触发格式升级。
    expect(readFormatVersion(dataDir)).toBe("2");
  });

  it("格式比本版新时拒绝写入", async () => {
    const dataDir = tempDataDir();
    const { stores } = newStore(dataDir);
    fs.writeFileSync(path.join(dataDir, "config.yml"), `format_version: ${TASKFOLD_FORMAT_VERSION + 1}\n`);

    await expect(stores.cardImages.put("CARD-1", "png", PNG)).rejects.toBeInstanceOf(TaskfoldFormatTooNewError);
  });

  it("引用格式：生成与解析互逆，外链与别的相对路径不识别", () => {
    const ref = taskfoldCardImageRef("CARD-1", "img-a-000000.png");
    expect(ref).toBe("../attachments/CARD-1/img-a-000000.png");
    expect(parseTaskfoldCardImageRef(ref)).toEqual({ cardId: "CARD-1", name: "img-a-000000.png" });
    expect(parseTaskfoldCardImageRef("https://example.com/a.png")).toBeUndefined();
    expect(parseTaskfoldCardImageRef("../attachments/CARD-1/../../config.yml")).toBeUndefined();
    expect(parseTaskfoldCardImageRef("../attachments/CARD-1/x.svg")).toBeUndefined();
    expect(parseTaskfoldCardImageRef("./images/a.png")).toBeUndefined();
  });

  it("旧附件平铺 blob 与卡片图片子目录并存，互不干扰", async () => {
    const dataDir = tempDataDir();
    const { stores } = newStore(dataDir);
    await stores.cardImages.put("CARD-1", "png", PNG);

    // 子目录不是附件 blob：entries 只列文件，不会因目录而抛错。
    await expect(stores.attachments.entries()).resolves.toEqual([]);
  });
});

describe("卡片图片：随卡片生命周期", () => {
  it("删卡时整个图片文件夹一起删，别的卡的不受影响", async () => {
    const dataDir = tempDataDir();
    const { stores, store } = newStore(dataDir);
    const first = await store.create({ title: "有图的卡", boardId: "default" });
    const second = await store.create({ title: "另一张卡", boardId: "default" });
    const a = await stores.cardImages.put(first.id, "png", PNG);
    await stores.cardImages.put(second.id, "png", PNG);

    await store.delete(first.id);

    expect(fs.existsSync(path.join(dataDir, "attachments", first.id))).toBe(false);
    expect(a).toBeTruthy();
    expect(fs.existsSync(path.join(dataDir, "attachments", second.id))).toBe(true);
  });

  it("归档不动图片（归档只是打标记）", async () => {
    const dataDir = tempDataDir();
    const { stores, store } = newStore(dataDir);
    const card = await store.create({ title: "归档的卡", boardId: "default" });
    const name = await stores.cardImages.put(card.id, "png", PNG);

    await store.archive(card.id, true);

    expect(await stores.cardImages.list(card.id)).toEqual([name]);
  });
});

describe("卡片图片：store API（addCardImage / getCardImage）", () => {
  it("添加后返回可写进 Markdown 的引用，读回字节一致，且不涨卡片 revision", async () => {
    const dataDir = tempDataDir();
    const { store } = newStore(dataDir);
    const card = await store.create({ title: "贴图", boardId: "default" });

    const result = await store.addCardImage(card.id, {
      fileName: "截图.PNG",
      contentBase64: PNG.toString("base64"),
    });

    expect(result.cardId).toBe(card.id);
    expect(result.mimeType).toBe("image/png");
    expect(result.byteSize).toBe(PNG.byteLength);
    expect(result.ref).toBe(`../attachments/${card.id}/${result.name}`);
    expect(parseTaskfoldCardImageRef(result.ref)).toEqual({ cardId: card.id, name: result.name });
    const content = await store.getCardImage(card.id, result.name);
    expect(content?.mimeType).toBe("image/png");
    expect(Buffer.from(content!.contentBase64, "base64").equals(PNG)).toBe(true);
    expect((await store.get(card.id))?.revision).toBe(card.revision);
  });

  it("mimeType 优先于文件名；大于旧附件 256 KiB 的图片可以存", async () => {
    const dataDir = tempDataDir();
    const { store } = newStore(dataDir);
    const card = await store.create({ title: "大图", boardId: "default" });
    const big = Buffer.alloc(600 * 1024, 7);

    const result = await store.addCardImage(card.id, {
      fileName: "pasted",
      mimeType: "image/jpeg",
      contentBase64: big.toString("base64"),
    });

    expect(result.name.endsWith(".jpg")).toBe(true);
    expect(result.byteSize).toBe(big.byteLength);
  });

  it("拒绝：未知卡、非图片类型、非规范 base64", async () => {
    const dataDir = tempDataDir();
    const { store } = newStore(dataDir);
    const card = await store.create({ title: "校验", boardId: "default" });
    const ok = PNG.toString("base64");

    await expect(store.addCardImage("no-such-card", { fileName: "a.png", contentBase64: ok })).rejects.toThrow(
      /card not found/,
    );
    await expect(store.addCardImage(card.id, { fileName: "a.svg", contentBase64: ok })).rejects.toThrow(
      /must be png, jpeg/,
    );
    await expect(store.addCardImage(card.id, { fileName: "a.png", contentBase64: "not base64!" })).rejects.toThrow(
      /canonical base64/,
    );
    await expect(store.addCardImage(card.id, { fileName: "a.png" })).rejects.toThrow(/required/);
  });
});
