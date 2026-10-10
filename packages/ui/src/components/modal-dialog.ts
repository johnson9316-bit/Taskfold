const FOCUSABLE_SELECTOR = [
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "button",
  "a[href]",
  "summary",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function isFocusable(element: HTMLElement): boolean {
  if (element.matches(":disabled") || element.hasAttribute("hidden")) {
    return false;
  }
  if (element.getClientRects().length === 0 || getComputedStyle(element).visibility === "hidden") {
    return false;
  }
  // 同名单选组里浏览器的 Tab 只停在选中项上，未选中项不算 Tab 停靠点。
  if (element instanceof HTMLInputElement && element.type === "radio" && element.name && !element.checked) {
    const scope = element.form ?? element.getRootNode();
    const siblings = (scope as ParentNode).querySelectorAll<HTMLInputElement>("input[type='radio']");
    return !Array.from(siblings).some(
      (radio) => radio !== element && radio.name === element.name && radio.checked,
    );
  }
  return true;
}

class OpenClawModalDialog extends HTMLElement {
  private trigger: HTMLElement | null = null;

  connectedCallback() {
    const active = document.activeElement;
    this.trigger = active instanceof HTMLElement && active !== document.body ? active : null;
    this.setAttribute("role", "dialog");
    this.setAttribute("aria-modal", "true");
    // 让点击弹窗内非可聚焦区域时焦点留在弹窗里，Esc 与 Tab 陷阱才不会因焦点掉到 body 而失效。
    if (!this.hasAttribute("tabindex")) {
      this.setAttribute("tabindex", "-1");
    }
    this.addEventListener("keydown", this.handleKeydown);
    document.addEventListener("keydown", this.handleDocumentKeydown);
    // Lit 在插入 DOM 之前就已提交完子模板，微任务再等当前这轮渲染彻底结束后聚焦。
    queueMicrotask(() => {
      if (this.isConnected && !this.contains(document.activeElement)) {
        this.focusInitial();
      }
    });
  }

  disconnectedCallback() {
    this.removeEventListener("keydown", this.handleKeydown);
    document.removeEventListener("keydown", this.handleDocumentKeydown);
    const trigger = this.trigger;
    this.trigger = null;
    if (trigger?.isConnected && isFocusable(trigger)) {
      trigger.focus();
    }
  }

  private focusables(): HTMLElement[] {
    return Array.from(this.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isFocusable);
  }

  private focusInitial() {
    const candidates = this.focusables();
    const target =
      candidates.find((element) => element.hasAttribute("autofocus")) ?? candidates[0] ?? this;
    if (target === this) {
      // 自身的聚焦环会铺满整个遮罩，没有意义。
      this.style.outline = "none";
    }
    target.focus();
  }

  private cancel() {
    this.dispatchEvent(new CustomEvent("modal-cancel", { bubbles: true, cancelable: true }));
  }

  private readonly handleKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      this.cancel();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const candidates = this.focusables();
    if (candidates.length === 0) {
      event.preventDefault();
      this.focus();
      return;
    }
    const first = candidates[0];
    const last = candidates[candidates.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === this)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || active === this)) {
      event.preventDefault();
      first.focus();
    }
  };

  /** 兜底：焦点已落到弹窗外（如聚焦元素被重渲染移除）时 Esc 仍能关闭；弹窗内的按键由元素自身监听处理，避免重复触发。 */
  private readonly handleDocumentKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && !(event.target instanceof Node && this.contains(event.target))) {
      this.cancel();
    }
  };
}

if (!customElements.get("openclaw-modal-dialog")) {
  customElements.define("openclaw-modal-dialog", OpenClawModalDialog);
}
