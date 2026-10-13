// @vitest-environment jsdom
// 所见即所得编辑器（Milkdown）的 Markdown 往返与图片行为。
//
// 编辑器存的永远是原样 Markdown，所以最重要的回归是：真实卡片的 notes 经过
// 「解析进编辑器 → 序列化回 Markdown」之后，**渲染出来的语义**不能变。字节级完全一致做不到
// （remark 会统一项目符号、给 `~` `.` 等加转义、重排有序列表编号），所以拿 marked 渲染两边的 HTML
// 做对比：只要渲染结果一样，就只是写法被规范化了，内容没有被改坏。
import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createMarkdownEditor, type MarkdownEditorHandle } from "@taskfold/ui/lib/markdown-editor.js";

const handles: MarkdownEditorHandle[] = [];

// jsdom 没有 ClipboardEvent / DragEvent，Milkdown 的上传插件用 `instanceof` 判断事件类型。
beforeAll(() => {
  const target = globalThis as Record<string, unknown>;
  target.ClipboardEvent ??= class ClipboardEvent extends Event {
    clipboardData: unknown;
    constructor(type: string, init?: EventInit & { clipboardData?: unknown }) {
      super(type, init);
      this.clipboardData = init?.clipboardData ?? null;
    }
  };
  target.DragEvent ??= class DragEvent extends Event {};
});

afterEach(async () => {
  for (const handle of handles.splice(0)) {
    await handle.destroy();
  }
  document.body.innerHTML = "";
});

async function open(value: string, extra: Partial<Parameters<typeof createMarkdownEditor>[0]> = {}) {
  const element = document.createElement("div");
  document.body.append(element);
  const onChange = vi.fn();
  const handle = await createMarkdownEditor({ element, value, onChange, ...extra });
  handles.push(handle);
  return { element, handle, onChange };
}

const render = (markdown: string) => (marked.parse(markdown, { async: false, gfm: true }) as string).trim();

const ID = "0d2f6c1e-9a4b-4c3d-8e5f-1a2b3c4d5e6f";
const REF = `../attachments/${ID}/img-lq3x9a-1f2e3d.png`;

describe("Markdown 往返", () => {
  it.each([
    ["段落与行内格式", "普通段落，**加粗**、*斜体*、`代码`，还有 [链接](https://example.com)。"],
    ["标题", "# 一级\n\n## 二级\n\n### 三级"],
    ["无序列表", "- 第一项\n- 第二项\n- 第三项"],
    ["有序列表", "1. 第一\n2. 第二\n3. 第三"],
    ["嵌套列表", "- 外层\n  - 内层 A\n  - 内层 B\n- 外层二"],
    ["引用", "> 引用的一段\n>\n> 第二段"],
    ["围栏代码块", "```ts\nconst a = 1;\n```"],
    ["分隔线", "上面\n\n---\n\n下面"],
    ["图片引用", `前文\n\n![截图](${REF})\n\n后文`],
    ["中文列表加粗（卡片 notes 常见写法）", "- **问题**：测试截了两张图。\n- **状态**：🟡 **搜索栏三项已改，其余待你确认**。"],
    ["尖括号占位符与 & 符号（Tiptap 会转成实体，这里必须原样）", "路径 path/<id>.json 与 a & b < c > d"],
    ["任务列表", "- [ ] 待办\n- [x] 已完成"],
    ["表格", "| a | b |\n| - | - |\n| 1 | 2 |"],
    ["行内代码里的占位符", "写到 `.runtime/cards/<id>.json`"],
    ["删除线", "~~作废~~"],
  ])("%s 原样往返", async (_name, markdown) => {
    const { handle } = await open(markdown);
    expect(handle.getMarkdown().trim()).toBe(markdown);
  });

  it("本仓库真实卡片的 notes 往返后渲染结果不变（保真度回归）", async () => {
    const cardsDir = path.resolve(__dirname, "..", ".taskfold", "cards");
    const notes = fs
      .readdirSync(cardsDir)
      .filter((name) => name.endsWith(".md"))
      .map((name) => fs.readFileSync(path.join(cardsDir, name), "utf8"))
      .map((content) => /"notes": ("(?:[^"\\]|\\.)*")/.exec(content)?.[1])
      .filter((raw): raw is string => raw !== undefined)
      .map((raw) => JSON.parse(raw) as string)
      .filter((text) => text.trim());
    expect(notes.length).toBeGreaterThan(0);

    const changed: string[] = [];
    for (const text of notes) {
      const { handle } = await open(text);
      if (render(handle.getMarkdown()) !== render(text)) {
        changed.push(text.slice(0, 60));
      }
    }
    expect(changed).toEqual([]);
  });
});

describe("图片", () => {
  it("引用经 resolveImage 取图后显示为 data URL，文档里保存的仍是引用", async () => {
    const resolveImage = vi.fn(async () => "data:image/png;base64,AAAA");
    const { element, handle } = await open(`![截图](${REF})`, { resolveImage });

    await vi.waitFor(() => expect(element.querySelector("img.taskfold-markdown-image")?.getAttribute("src")).toBe("data:image/png;base64,AAAA"));
    expect(resolveImage).toHaveBeenCalledWith(REF);
    expect(element.querySelector<HTMLImageElement>("img.taskfold-markdown-image")?.dataset.state).toBe("ready");
    expect(handle.getMarkdown().trim()).toBe(`![截图](${REF})`);
  });

  it("外链与非本机制的相对路径不加载（不请求、不设 src）", async () => {
    const resolveImage = vi.fn(async () => "data:image/png;base64,AAAA");
    const { element } = await open(
      "![a](https://evil.example/x.png) ![b](./images/b.png) ![c](../attachments/x/../../config.yml)",
      { resolveImage },
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    const images = [...element.querySelectorAll<HTMLImageElement>("img.taskfold-markdown-image")];
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) {
      expect(image.hasAttribute("src")).toBe(false);
      expect(image.dataset.state).toBe("blocked");
    }
    expect(resolveImage).not.toHaveBeenCalled();
  });

  it("取图失败时标为 error，不抛出", async () => {
    const resolveImage = vi.fn(async () => {
      throw new Error("boom");
    });
    const { element } = await open(`![x](${REF})`, { resolveImage });

    await vi.waitFor(() => expect(element.querySelector<HTMLImageElement>("img.taskfold-markdown-image")?.dataset.state).toBe("error"));
  });

  async function pasteFiles(element: HTMLElement, files: File[]) {
    const target = element.querySelector<HTMLElement>(".ProseMirror")!;
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { files, getData: () => "", types: ["Files"] },
    });
    target.dispatchEvent(event);
  }

  it("粘贴图片：上传后在光标处插入引用，并触发 onChange", async () => {
    const uploadImage = vi.fn(async () => REF);
    const { element, handle, onChange } = await open("hello", { uploadImage, resolveImage: async () => undefined });
    const file = new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" });

    await pasteFiles(element, [file]);

    await vi.waitFor(() => expect(uploadImage).toHaveBeenCalledWith(file));
    await vi.waitFor(() => expect(handle.getMarkdown()).toContain(`![shot](${REF})`));
    expect(onChange).toHaveBeenCalled();
  });

  it("上传失败时走 onError，文档不变", async () => {
    const error = new Error("上传失败");
    const onError = vi.fn();
    const { element, handle } = await open("hello", { uploadImage: async () => Promise.reject(error), onError });

    await pasteFiles(element, [new File([new Uint8Array([1])], "x.png", { type: "image/png" })]);

    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(error));
    expect(handle.getMarkdown().trim()).toBe("hello");
  });

  it("只收图片类型：非图片文件被忽略，不上传", async () => {
    const uploadImage = vi.fn(async () => REF);
    const { element } = await open("hello", { uploadImage });

    await pasteFiles(element, [new File(["x"], "notes.txt", { type: "text/plain" })]);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(uploadImage).not.toHaveBeenCalled();
  });
});

describe("setMarkdown", () => {
  it("内容相同不动文档，不同则整体替换且不触发 onChange", async () => {
    const { handle, onChange } = await open("第一版");
    handle.setMarkdown("第一版");
    expect(onChange).not.toHaveBeenCalled();
    handle.setMarkdown("第二版");
    expect(handle.getMarkdown().trim()).toBe("第二版");
    expect(onChange).not.toHaveBeenCalled();
  });
});
