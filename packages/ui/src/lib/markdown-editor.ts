// 所见即所得的 Markdown 编辑器核心（Milkdown / ProseMirror / remark），与 Lit 无关，便于单测。
//
// 存的永远是原样的 Markdown。选 Milkdown 而不是 Tiptap，是因为卡片 notes 多是 AI / CLI 手写的
// Markdown（含 `<id>`、`&`、表格、任务列表、HTML 注释、代码标识符），Tiptap 的序列化会把 `<id>`
// 转成 `&lt;id&gt;`、丢掉任务列表和表格；Milkdown 基于 remark，这些都能原样往返。
//
// 图片在 Markdown 里是 `![alt](../attachments/<卡 uuid>/<文件>)`（见 @taskfold/core 的
// card-image-ref.ts），编辑器里按这个引用向宿主取图、以 data URL 显示；其他来源的图片
// （外链、别的相对路径）一律不加载。
//
// CSP：VS Code Webview 的 `style-src` 不允许 <style> 标签与 style 属性，所以样式都放在
// styles/taskfold-project.css，这里只用 CSSOM / class。
import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  editorViewOptionsCtx,
  remarkStringifyOptionsCtx,
  rootCtx,
} from "@milkdown/kit/core";
import { history, redoCommand, undoCommand } from "@milkdown/kit/plugin/history";
import { upload, uploadConfig } from "@milkdown/kit/plugin/upload";
import {
  commonmark,
  imageSchema,
  insertImageCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { Plugin } from "@milkdown/kit/prose/state";
import { Decoration } from "@milkdown/kit/prose/view";
import { $prose, $view, callCommand, getMarkdown, replaceAll } from "@milkdown/kit/utils";
import {
  parseTaskfoldCardImageRef,
  TASKFOLD_CARD_IMAGE_MIME_BY_EXTENSION,
} from "@taskfold/core/card-image-ref.js";

export type MarkdownEditorOptions = {
  element: HTMLElement;
  /** 初始 Markdown。 */
  value: string;
  /** 用户编辑后的 Markdown（程序化的 `setMarkdown` 不触发）。 */
  onChange: (markdown: string) => void;
  /** 粘贴 / 拖入图片时存盘，返回写进 Markdown 的引用；不给就不接收图片。 */
  uploadImage?: (file: File) => Promise<string>;
  /** 引用 → 可显示的 data URL；取不到返回 `undefined`。 */
  resolveImage?: (ref: string) => Promise<string | undefined>;
  /** 哪些引用值得去 `resolveImage`；默认只认卡片图片引用，外链与别的相对路径一律不加载。 */
  acceptRef?: (ref: string) => boolean;
  /** 上传失败时的提示（编辑器本身不展示错误）。 */
  onError?: (error: unknown) => void;
  /** Mod-Enter（Ctrl/Cmd+Enter）。 */
  onSubmit?: () => void;
  /** 图片上传期间占位的文字。 */
  uploadingLabel?: string;
  editable?: boolean;
};

export type MarkdownEditorCommand =
  | "bold"
  | "italic"
  | "code"
  | "heading"
  | "bulletList"
  | "orderedList"
  | "quote"
  | "undo"
  | "redo";

export type MarkdownEditorHandle = {
  getMarkdown(): string;
  /** 外部改了值（切换卡片、重置表单）；与当前内容相同则不动，避免光标跳动。 */
  setMarkdown(markdown: string): void;
  setEditable(editable: boolean): void;
  focus(): void;
  /** 工具栏命令。 */
  command(command: MarkdownEditorCommand): void;
  /** 工具栏「插入图片」：存盘后在光标处插入。没配 `uploadImage` 时什么都不做。 */
  insertImage(file: File): Promise<void>;
  /** 编辑区的 DOM（`.ProseMirror`），测试与样式用。 */
  readonly contentElement: HTMLElement;
  destroy(): Promise<void>;
};

const IMAGE_MIME_TYPES = new Set(Object.values(TASKFOLD_CARD_IMAGE_MIME_BY_EXTENSION));

function altFromFile(file: File): string {
  const base = file.name.replace(/\.[^.]+$/, "").trim();
  // 截图粘贴进来通常叫 image.png，没有信息量。
  return base && base.toLowerCase() !== "image" ? base : "";
}

/** 图片节点视图：`src` 属性保存引用，显示用的 data URL 只放在 DOM 上，不进文档。 */
function imageView(
  resolveImage: MarkdownEditorOptions["resolveImage"],
  acceptRef: (ref: string) => boolean,
) {
  return $view(imageSchema.node, () => (initial) => {
    const img = document.createElement("img");
    img.className = "taskfold-markdown-image";
    let currentSrc: string | undefined;
    const apply = (attrs: { src?: unknown; alt?: unknown; title?: unknown }) => {
      const src = typeof attrs.src === "string" ? attrs.src : "";
      img.alt = typeof attrs.alt === "string" ? attrs.alt : "";
      if (typeof attrs.title === "string" && attrs.title) {
        img.title = attrs.title;
      } else {
        img.removeAttribute("title");
      }
      if (src === currentSrc) {
        return;
      }
      currentSrc = src;
      img.removeAttribute("src");
      if (!resolveImage || !acceptRef(src)) {
        img.dataset.state = "blocked";
        return;
      }
      img.dataset.state = "loading";
      resolveImage(src)
        .then((url) => {
          if (src !== currentSrc) {
            return;
          }
          if (url) {
            img.src = url;
            img.dataset.state = "ready";
          } else {
            img.dataset.state = "error";
          }
        })
        .catch(() => {
          if (src === currentSrc) {
            img.dataset.state = "error";
          }
        });
    };
    apply(initial.attrs);
    return {
      dom: img,
      update(updated) {
        if (updated.type !== initial.type) {
          return false;
        }
        apply(updated.attrs);
        return true;
      },
    };
  });
}

export async function createMarkdownEditor(options: MarkdownEditorOptions): Promise<MarkdownEditorHandle> {
  const { uploadImage, resolveImage, onError } = options;
  let editable = options.editable ?? true;
  let silent = false;

  // 文档一变就同步回调：listener 插件的 markdownUpdated 带 200ms 防抖，用户敲完立刻点保存时会读到旧值。
  const changeNotifier = $prose(
    (ctx) =>
      new Plugin({
        view: () => ({
          update: (view, previous) => {
            if (!silent && !view.state.doc.eq(previous.doc)) {
              options.onChange(getMarkdown()(ctx));
            }
          },
        }),
      }),
  );

  const submitKey = $prose(
    () =>
      new Plugin({
        props: {
          handleKeyDown: (_view, event) => {
            if (options.onSubmit && event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.isComposing) {
              event.preventDefault();
              options.onSubmit();
              return true;
            }
            return false;
          },
        },
      }),
  );

  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, options.element);
      ctx.set(defaultValueCtx, options.value);
      ctx.update(editorViewOptionsCtx, (previous) => ({
        ...previous,
        editable: () => editable,
        attributes: { class: "taskfold-markdown-editor__content", role: "textbox", "aria-multiline": "true" },
      }));
      // 序列化风格贴近手写 Markdown，少改动用户原有的写法。
      ctx.update(remarkStringifyOptionsCtx, (previous) => ({
        ...previous,
        bullet: "-" as const,
        bulletOther: "*" as const,
        emphasis: "*" as const,
        strong: "*" as const,
        rule: "-" as const,
        fence: "`" as const,
        fences: true,
        listItemIndent: "one" as const,
      }));
      if (uploadImage) {
        ctx.update(uploadConfig.key, (previous) => ({
          ...previous,
          // 从网页「复制图片」时剪贴板同时带 text/html 与图片文件，也按图片处理。
          enableHtmlFileUploader: true,
          uploadWidgetFactory: (pos, spec) => {
            const widget = document.createElement("span");
            widget.className = "taskfold-markdown-upload";
            widget.textContent = options.uploadingLabel ?? "…";
            return Decoration.widget(pos, widget, spec);
          },
          uploader: async (files, schema) => {
            const imageType = schema.nodes.image;
            const nodes = [];
            for (const file of Array.from(files)) {
              if (!imageType || !IMAGE_MIME_TYPES.has(file.type.toLowerCase())) {
                continue;
              }
              try {
                const src = await uploadImage(file);
                nodes.push(imageType.createAndFill({ src, alt: altFromFile(file) })!);
              } catch (error) {
                onError?.(error);
              }
            }
            return nodes;
          },
        }));
      }
    })
    .use(commonmark)
    .use(gfm)
    .use(history)
    .use(changeNotifier)
    .use(imageView(resolveImage, options.acceptRef ?? ((ref) => parseTaskfoldCardImageRef(ref) !== undefined)))
    .use(submitKey);
  if (uploadImage) {
    editor.use(upload);
  }
  await editor.create();

  const view = () => editor.ctx.get(editorViewCtx);
  return {
    getMarkdown: () => editor.action(getMarkdown()),
    setMarkdown(markdown) {
      if (editor.action(getMarkdown()).trimEnd() === markdown.trimEnd()) {
        return;
      }
      silent = true;
      try {
        editor.action(replaceAll(markdown));
      } finally {
        silent = false;
      }
    },
    setEditable(next) {
      editable = next;
      // 重新求值 `editable()`。
      view().setProps({ editable: () => editable });
    },
    focus: () => view().focus(),
    command(name) {
      const run: Record<MarkdownEditorCommand, () => void> = {
        bold: () => editor.action(callCommand(toggleStrongCommand.key)),
        italic: () => editor.action(callCommand(toggleEmphasisCommand.key)),
        code: () => editor.action(callCommand(toggleInlineCodeCommand.key)),
        heading: () => editor.action(callCommand(wrapInHeadingCommand.key, 2)),
        bulletList: () => editor.action(callCommand(wrapInBulletListCommand.key)),
        orderedList: () => editor.action(callCommand(wrapInOrderedListCommand.key)),
        quote: () => editor.action(callCommand(wrapInBlockquoteCommand.key)),
        undo: () => editor.action(callCommand(undoCommand.key)),
        redo: () => editor.action(callCommand(redoCommand.key)),
      };
      run[name]();
      view().focus();
    },
    async insertImage(file) {
      if (!uploadImage) {
        return;
      }
      try {
        const src = await uploadImage(file);
        editor.action(callCommand(insertImageCommand.key, { src, alt: altFromFile(file) }));
        view().focus();
      } catch (error) {
        onError?.(error);
      }
    },
    get contentElement() {
      return view().dom as HTMLElement;
    },
    destroy: async () => {
      await editor.destroy();
    },
  };
}
