import DOMPurify from "dompurify";
import { marked } from "marked";
import TurndownService from "turndown";
import { noChange } from "lit";
import { Directive, directive, type ElementPart, type PartInfo, PartType } from "lit/directive.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { parseTaskfoldCardImageRef } from "@taskfold/core/card-image-ref.js";

function sanitizedMarkdownHtml(content: string): string {
  const rendered = marked.parse(content, {
    async: false,
    breaks: false,
    gfm: true,
  }) as string;
  return DOMPurify.sanitize(rendered, {
    FORBID_TAGS: ["button", "form", "iframe", "img", "input", "script", "style"],
    USE_PROFILES: { html: true },
  });
}

export function taskfoldMarkdownToEditorHtml(content: string): string {
  return sanitizedMarkdownHtml(content);
}

export function taskfoldEditorHtmlToMarkdown(content: string): string {
  const turndown = new TurndownService({
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    headingStyle: "atx",
  });
  return turndown
    .turndown(
      DOMPurify.sanitize(content, {
        FORBID_TAGS: ["button", "form", "iframe", "img", "input", "script", "style"],
        USE_PROFILES: { html: true },
      }),
    )
    .trimEnd();
}

/**
 * 只读渲染用的净化器：放行 `<img>`，但只认卡片图片引用（`../attachments/<卡 uuid>/<文件>`）。
 * 引用挪到 `data-tf-ref`、不留 `src`——浏览器不会去请求任何地址；真正的图由
 * {@link hydrateMarkdownImages} 经宿主取回后补成 data URL。外链、别的相对路径、
 * `srcset` 等一律丢弃，整张图删掉。
 * 单独一个 DOMPurify 实例，钩子不会影响编辑器 HTML 那条路径（它仍然禁 img）。
 */
let renderPurify: ReturnType<typeof DOMPurify> | undefined;
function renderingPurify() {
  if (!renderPurify) {
    renderPurify = DOMPurify(window);
    renderPurify.addHook("afterSanitizeAttributes", (node) => {
      if (node.nodeName !== "IMG") {
        return;
      }
      const image = node as HTMLImageElement;
      const src = image.getAttribute("src") ?? "";
      const alt = image.getAttribute("alt");
      const title = image.getAttribute("title");
      for (const name of image.getAttributeNames()) {
        image.removeAttribute(name);
      }
      if (!parseTaskfoldCardImageRef(src)) {
        image.remove();
        return;
      }
      image.setAttribute("data-tf-ref", src);
      image.setAttribute("alt", alt ?? "");
      if (title) {
        image.setAttribute("title", title);
      }
    });
  }
  return renderPurify;
}

function renderedMarkdownHtml(content: string): string {
  const rendered = marked.parse(content, { async: false, breaks: false, gfm: true }) as string;
  return renderingPurify().sanitize(rendered, {
    FORBID_TAGS: ["button", "form", "iframe", "input", "script", "style"],
    FORBID_ATTR: ["srcset"],
    USE_PROFILES: { html: true },
  });
}

export function renderTaskfoldMarkdown(content: string) {
  return unsafeHTML(renderedMarkdownHtml(content));
}

/** 看板卡片小标签里的备注预览：它直接输出原文，图片引用会变成一长串路径，去掉只留 alt。 */
export function plainTextFromMarkdown(content: string): string {
  return content.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\n{3,}/g, "\n\n");
}

type ImageResolver = (ref: string) => Promise<string | undefined>;

/**
 * 元素指令：放在渲染了 {@link renderTaskfoldMarkdown} 的容器上，渲染提交之后给里面
 * 还没有 `src` 的 `img[data-tf-ref]` 异步补上图。取不到的标 `data-state="error"`。
 */
class HydrateMarkdownImages extends Directive {
  constructor(partInfo: PartInfo) {
    super(partInfo);
    if (partInfo.type !== PartType.ELEMENT) {
      throw new Error("hydrateMarkdownImages must be used on an element.");
    }
  }

  render(_resolve: ImageResolver | undefined) {
    return noChange;
  }

  update(part: ElementPart, [resolve]: [ImageResolver | undefined]) {
    const root = part.element;
    // 等这一轮渲染提交完（unsafeHTML 的内容在同一次提交里写入）再扫。
    queueMicrotask(() => {
      for (const image of root.querySelectorAll<HTMLImageElement>("img[data-tf-ref]:not([src])")) {
        const ref = image.getAttribute("data-tf-ref") ?? "";
        if (!resolve) {
          image.dataset.state = "error";
          continue;
        }
        image.dataset.state = "loading";
        resolve(ref)
          .then((url) => {
            if (url && image.isConnected) {
              image.src = url;
              image.dataset.state = "ready";
            } else {
              image.dataset.state = "error";
            }
          })
          .catch(() => {
            image.dataset.state = "error";
          });
      }
    });
    return noChange;
  }
}

export const hydrateMarkdownImages = directive(HydrateMarkdownImages);
