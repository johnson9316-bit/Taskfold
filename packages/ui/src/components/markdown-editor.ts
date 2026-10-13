// <taskfold-markdown-editor>：所见即所得的 Markdown 编辑框（Milkdown 内核见 lib/markdown-editor.ts），
// 粘贴 / 拖入 / 点按钮都能插图片。Light DOM，样式在 styles/taskfold-project.css。
//
// 表单友好：内部有一个同步更新的 `<input type="hidden" name=…>`，所以直接放进 <form> 里用
// `FormData` 就能读到当前 Markdown；表单 reset 时清空；Ctrl/Cmd+Enter 提交所在表单。
// 另外每次变化会冒泡一个 `markdown-change` 事件（`detail` 是 Markdown），给不走 FormData 的草稿用。
import { LitElement, html, nothing } from "lit";
import { t } from "../i18n/index.ts";
import {
  createMarkdownEditor,
  type MarkdownEditorCommand,
  type MarkdownEditorHandle,
} from "../lib/markdown-editor.ts";

const TOOLBAR: Array<{ command: MarkdownEditorCommand; label: string; icon: string }> = [
  { command: "bold", label: "taskfoldProject.formatBold", icon: "B" },
  { command: "italic", label: "taskfoldProject.formatItalic", icon: "I" },
  { command: "code", label: "taskfoldProject.formatCode", icon: "</>" },
  { command: "heading", label: "taskfoldProject.formatHeading", icon: "H" },
  { command: "bulletList", label: "taskfoldProject.formatList", icon: "•" },
  { command: "orderedList", label: "taskfoldProject.formatOrderedList", icon: "1." },
  { command: "quote", label: "taskfoldProject.formatQuote", icon: "❝" },
  { command: "undo", label: "taskfoldProject.formatUndo", icon: "↶" },
  { command: "redo", label: "taskfoldProject.formatRedo", icon: "↷" },
];

export class TaskfoldMarkdownEditor extends LitElement {
  static properties = {
    name: { type: String },
    value: { type: String },
    disabled: { type: Boolean },
    placeholder: { type: String },
    uploadImage: { attribute: false },
    resolveImage: { attribute: false },
    acceptRef: { attribute: false },
    error: { state: true },
  };

  declare name: string;
  declare value: string;
  declare disabled: boolean;
  declare placeholder: string;
  declare uploadImage: ((file: File) => Promise<string>) | undefined;
  declare resolveImage: ((ref: string) => Promise<string | undefined>) | undefined;
  declare acceptRef: ((ref: string) => boolean) | undefined;
  declare error: string;

  private handle: MarkdownEditorHandle | null = null;
  /** 隐藏字段的当前值（非响应式）：重渲染时用它，不能回退到可能已过期的 `value` 属性。 */
  private currentMarkdown: string | null = null;
  private creating = false;
  private destroyed = false;
  /** 最近一次由编辑器自己发出的 Markdown，用来区分「外部改了 value」和「父级把我发的值回传」。 */
  private lastEmitted: string | null = null;
  private readonly onFormReset = () => {
    this.value = "";
    this.lastEmitted = "";
    this.handle?.setMarkdown("");
    this.syncField("");
  };

  constructor() {
    super();
    this.name = "";
    this.value = "";
    this.disabled = false;
    this.placeholder = "";
    this.error = "";
  }

  protected createRenderRoot(): HTMLElement {
    return this;
  }

  protected render() {
    return html`
      <div class="taskfold-markdown-editor__toolbar" role="toolbar" aria-label=${t("taskfoldProject.richTextToolbar")}>
        ${TOOLBAR.map(
          (item) => html`<button
            class="taskfold-project__editor-button"
            type="button"
            title=${t(item.label)}
            aria-label=${t(item.label)}
            ?disabled=${this.disabled}
            @mousedown=${(event: MouseEvent) => event.preventDefault()}
            @click=${() => this.handle?.command(item.command)}
          >${item.icon}</button>`,
        )}
        ${this.uploadImage
          ? html`<button
                class="taskfold-project__editor-button"
                type="button"
                title=${t("taskfoldProject.insertImage")}
                aria-label=${t("taskfoldProject.insertImage")}
                ?disabled=${this.disabled}
                @mousedown=${(event: MouseEvent) => event.preventDefault()}
                @click=${() => this.querySelector<HTMLInputElement>("input[type=file]")?.click()}
              >🖼</button>
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp"
                multiple
                hidden
                @change=${this.onPickFiles}
              />`
          : nothing}
      </div>
      <div
        class="taskfold-markdown-editor__surface"
        data-placeholder=${this.placeholder || t("taskfoldProject.editorPlaceholder")}
      ></div>
      ${this.error ? html`<div class="tf-callout tf-danger" role="alert">${this.error}</div>` : nothing}
      <input type="hidden" name=${this.name} .value=${this.currentMarkdown ?? this.value} />
    `;
  }

  /** 当前 Markdown（读的是编辑器本身，不依赖事件有没有到）。 */
  get markdown(): string {
    return this.handle ? this.handle.getMarkdown() : this.value;
  }

  protected firstUpdated(): void {
    void this.mount();
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has("disabled")) {
      this.handle?.setEditable(!this.disabled);
    }
    if (changed.has("value") && this.handle && this.value !== this.lastEmitted) {
      this.handle.setMarkdown(this.value);
      this.lastEmitted = this.value;
    }
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.destroyed = false;
    this.closest("form")?.addEventListener("reset", this.onFormReset);
  }

  disconnectedCallback(): void {
    this.closest("form")?.removeEventListener("reset", this.onFormReset);
    this.destroyed = true;
    const handle = this.handle;
    this.handle = null;
    this.creating = false;
    if (handle) {
      void handle.destroy();
    }
    super.disconnectedCallback();
  }

  private syncField(markdown: string): void {
    this.currentMarkdown = markdown;
    const field = this.querySelector<HTMLInputElement>("input[type=hidden]");
    if (field) {
      field.value = markdown;
    }
    this.querySelector(".taskfold-markdown-editor__surface")?.toggleAttribute("data-empty", markdown.trim() === "");
  }

  private showError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.error = t("taskfoldProject.imageUploadFailed", { message });
  }

  private readonly onPickFiles = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = "";
    void (async () => {
      for (const file of files) {
        await this.handle?.insertImage(file);
      }
    })();
  };

  private async mount(): Promise<void> {
    const surface = this.querySelector<HTMLElement>(".taskfold-markdown-editor__surface");
    if (!surface || this.handle || this.creating) {
      return;
    }
    this.creating = true;
    const upload = this.uploadImage;
    const handle = await createMarkdownEditor({
      element: surface,
      value: this.value,
      editable: !this.disabled,
      uploadingLabel: t("taskfoldProject.imageUploading"),
      onChange: (markdown) => {
        this.lastEmitted = markdown;
        this.error = "";
        this.syncField(markdown);
        this.dispatchEvent(new CustomEvent("markdown-change", { detail: markdown, bubbles: true, composed: true }));
      },
      onError: (error) => this.showError(error),
      onSubmit: () => this.closest("form")?.requestSubmit(),
      ...(upload ? { uploadImage: (file: File) => this.uploadImage!(file) } : {}),
      resolveImage: (ref) => (this.resolveImage ? this.resolveImage(ref) : Promise.resolve(undefined)),
      ...(this.acceptRef ? { acceptRef: (ref: string) => this.acceptRef!(ref) } : {}),
    });
    this.creating = false;
    if (this.destroyed || !this.isConnected) {
      await handle.destroy();
      return;
    }
    this.handle = handle;
    this.lastEmitted = this.value;
    this.syncField(this.value);
  }

  focusEditor(): void {
    this.handle?.focus();
  }
}

if (!customElements.get("taskfold-markdown-editor")) {
  customElements.define("taskfold-markdown-editor", TaskfoldMarkdownEditor);
}
