import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { TaskfoldProjectDocument } from "@taskfold/core/contract/index.js";
import { isTaskfoldDocumentImageRef } from "@taskfold/core/card-image-ref.js";
import {
  readTaskfoldProjectDocumentAsset,
  writeTaskfoldProjectDocumentAsset,
} from "@taskfold/core/project-document-reader.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

function setup(docName = "需求.md") {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-doc-assets-")));
  roots.push(root);
  const docDir = path.join(root, "docs", "sub");
  fs.mkdirSync(docDir, { recursive: true });
  const target = path.join(docDir, docName);
  fs.writeFileSync(target, "# 文档\n");
  fs.writeFileSync(path.join(root, "secret.txt"), "top secret");
  const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-doc-outside-")));
  roots.push(outside);
  fs.writeFileSync(path.join(outside, "leak.png"), PNG);
  const document = {
    id: "doc-1",
    boardId: "b",
    key: "k",
    section: "project",
    type: "path",
    title: "t",
    target,
  } as unknown as TaskfoldProjectDocument;
  // 与 VS Code 的 documentPathAccess 同样的规则：真实路径必须在项目根内。
  const assertPathAllowed = async (filePath: string) => {
    const relative = path.relative(root, filePath);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error("project document path is outside the workspace.");
    }
  };
  return { root, docDir, document, assertPathAllowed, outside };
}

const b64 = PNG.toString("base64");

describe("isTaskfoldDocumentImageRef（语法判断）", () => {
  it.each([
    ["images/a.png", true],
    ["./a.jpg", true],
    ["../shared/diagram.webp", true],
    ["%E9%9C%80%E6%B1%82.assets/img-a-000000.png", true],
    ["https://example.com/a.png", false],
    ["data:image/png;base64,AAAA", false],
    ["/etc/a.png", false],
    ["//evil.example/a.png", false],
    ["a\\b.png", false],
    ["a.png?x=1", false],
    ["a.png#frag", false],
    ["a.svg", false],
    ["noext", false],
    [".png", false],
  ])("%s → %s", (ref, expected) => {
    expect(isTaskfoldDocumentImageRef(ref)).toBe(expected);
  });
});

describe("文档图片：写入与读取", () => {
  it("存到文档旁的 <文档名>.assets/，返回编码后的相对引用，读回字节一致", async () => {
    const { docDir, document, assertPathAllowed } = setup();

    const written = await writeTaskfoldProjectDocumentAsset({
      document,
      fileName: "paste.png",
      mimeType: "image/png",
      contentBase64: b64,
      assertPathAllowed,
    });

    expect(written.ref).toBe(`${encodeURIComponent("需求.assets")}/${written.name}`);
    expect(written.name).toMatch(/^img-[a-z0-9]+-[0-9a-f]{6}\.png$/);
    expect(fs.readFileSync(path.join(docDir, "需求.assets", written.name)).equals(PNG)).toBe(true);
    const read = await readTaskfoldProjectDocumentAsset({ document, ref: written.ref, assertPathAllowed });
    expect(read.mimeType).toBe("image/png");
    expect(Buffer.from(read.contentBase64, "base64").equals(PNG)).toBe(true);
    // 文档文件本身不被改动。
    expect(fs.readFileSync(document.target!, "utf8")).toBe("# 文档\n");
  });

  it("文件名带空格与括号时，引用对 Markdown 链接是安全的（括号被转义）", async () => {
    const { document, assertPathAllowed } = setup("设计 (v2) 方案.md");

    const written = await writeTaskfoldProjectDocumentAsset({ document, mimeType: "image/png", contentBase64: b64, assertPathAllowed });

    expect(written.ref).not.toMatch(/[() ]/);
    const read = await readTaskfoldProjectDocumentAsset({ document, ref: written.ref, assertPathAllowed });
    expect(read.contentBase64).toBe(b64);
  });

  it("可以读文档里手写的相对引用（兄弟目录、./ 开头）", async () => {
    const { root, document, assertPathAllowed } = setup();
    fs.mkdirSync(path.join(root, "docs", "images"));
    fs.writeFileSync(path.join(root, "docs", "images", "arch.png"), PNG);

    const read = await readTaskfoldProjectDocumentAsset({ document, ref: "../images/arch.png", assertPathAllowed });
    expect(read.contentBase64).toBe(b64);
  });

  it.each([
    ["超出项目根的 ../ 路径", (o: ReturnType<typeof setup>) => path.relative(o.docDir, path.join(o.outside, "leak.png"))],
    ["绝对路径", () => "/etc/hosts.png"],
    ["协议地址", () => "https://example.com/a.png"],
    ["svg", () => "a.svg"],
    ["非图片扩展名", () => "../../secret.txt"],
    ["反斜杠", () => "a\\..\\b.png"],
  ])("读取拒绝：%s", async (_name, ref) => {
    const env = setup();
    await expect(
      readTaskfoldProjectDocumentAsset({ document: env.document, ref: ref(env), assertPathAllowed: env.assertPathAllowed }),
    ).rejects.toThrow();
  });

  it("符号链接指向项目外的图片：真实路径过不了权限检查", async () => {
    const env = setup();
    fs.symlinkSync(path.join(env.outside, "leak.png"), path.join(env.docDir, "link.png"));

    await expect(
      readTaskfoldProjectDocumentAsset({ document: env.document, ref: "link.png", assertPathAllowed: env.assertPathAllowed }),
    ).rejects.toThrow(/outside the workspace/);
  });

  it("写入拒绝：assets 目录是符号链接、非图片类型、空内容、非规范 base64", async () => {
    const env = setup();
    fs.symlinkSync(env.outside, path.join(env.docDir, "需求.assets"));
    await expect(
      writeTaskfoldProjectDocumentAsset({ document: env.document, mimeType: "image/png", contentBase64: b64, assertPathAllowed: env.assertPathAllowed }),
    ).rejects.toThrow(/regular directory/);
    expect(fs.readdirSync(env.outside)).toEqual(["leak.png"]);

    const clean = setup();
    for (const input of [
      { mimeType: "image/svg+xml", contentBase64: b64 },
      { mimeType: "image/png", contentBase64: "" },
      { mimeType: "image/png", contentBase64: "not base64!" },
      { fileName: "a.exe", contentBase64: b64 },
    ]) {
      await expect(
        writeTaskfoldProjectDocumentAsset({ document: clean.document, ...input, assertPathAllowed: clean.assertPathAllowed }),
      ).rejects.toThrow();
    }
    expect(fs.existsSync(path.join(clean.docDir, "需求.assets"))).toBe(false);
  });

  it("内联 markdown 文档（没有文件目录）不支持图片", async () => {
    const { assertPathAllowed } = setup();
    const inline = { id: "d", type: "markdown", content: "x" } as unknown as TaskfoldProjectDocument;
    await expect(readTaskfoldProjectDocumentAsset({ document: inline, ref: "a.png", assertPathAllowed })).rejects.toThrow(
      /Markdown file documents/,
    );
    await expect(
      writeTaskfoldProjectDocumentAsset({ document: inline, mimeType: "image/png", contentBase64: b64, assertPathAllowed }),
    ).rejects.toThrow(/Markdown file documents/);
  });
});
