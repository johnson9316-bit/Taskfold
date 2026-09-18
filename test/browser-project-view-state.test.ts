// 迁移前对应 `test/project-ui-state.test.ts`。原文件里同时测了状态工厂/纯数组算法/链接
// 构造（纯逻辑）与 `renderTaskfoldProjects` 的渲染文本（Lit 组件渲染细节）；这里只保留前者——
// 后者按本次任务的判断标准（Lit 渲染留给浏览器实机验证）不再迁移，见
// `test/project-language-ui.test.ts`（同一批被删除、且完全是渲染文本用例，因此整份放弃）。
//
// `project-view.ts` 顶部有一条 `import "../../components/modal-dialog.ts"` 副作用导入，
// 该文件在模块顶层执行 `class extends HTMLElement` 和 `customElements.define(...)`。
// 这两行本身与本文件要测的纯函数无关，但没有它们模块就无法在纯 Node 环境下被 import。
// 用两个最小 stub（而不是引入 jsdom）满足这条副作用导入，是被删除的旧测试本就采用的做法。
import { beforeAll, describe, expect, it } from "vitest";

let createTaskfoldProjectUiState: typeof import("../browser/pages/projects/project-view.ts")["createTaskfoldProjectUiState"];
let reorderVisibleItemIds: typeof import("../browser/pages/projects/project-view.ts")["reorderVisibleItemIds"];
let taskfoldNativeChatHref: typeof import("../browser/pages/projects/project-view.ts")["taskfoldNativeChatHref"];

beforeAll(async () => {
  class HTMLElementShim {}
  Object.assign(globalThis, {
    HTMLElement: HTMLElementShim,
    customElements: {
      define() {},
      get() {
        return undefined;
      },
    },
  });
  ({ createTaskfoldProjectUiState, reorderVisibleItemIds, taskfoldNativeChatHref } = await import(
    "../browser/pages/projects/project-view.ts"
  ));
});

describe("createTaskfoldProjectUiState", () => {
  it("starts at the project overview with no selection, modal or drag in progress", () => {
    expect(createTaskfoldProjectUiState()).toMatchObject({
      screen: "overview",
      selectedProjectId: null,
      project: null,
      modal: null,
      draggedCardId: null,
      graphMode: "mindmap",
      graphZoom: 1,
      languageSwitching: false,
      languageError: null,
      showArchivedProjects: false,
      showHiddenDocuments: false,
      documentEditing: false,
      documentDraft: null,
      documentSourceFilter: "all",
      executionPreparation: null,
      executionInspection: null,
    });
  });
});

describe("reorderVisibleItemIds", () => {
  it("reorders only visible entries while preserving hidden entries in the full request", () => {
    const allItems = [{ id: "first" }, { id: "hidden" }, { id: "last" }];
    const visibleItems = [allItems[0]!, allItems[2]!];

    expect(reorderVisibleItemIds(allItems, visibleItems, "last", -1)).toEqual([
      "last",
      "hidden",
      "first",
    ]);
    expect(reorderVisibleItemIds(allItems, visibleItems, "first", -1)).toBeUndefined();
  });
});

describe("taskfoldNativeChatHref", () => {
  it("builds a native Chat link below the current Control UI base path", () => {
    expect(taskfoldNativeChatHref("agent:main:subagent:taskfold-alpha-card", "/plugin")).toBe(
      "/chat?session=agent%3Amain%3Asubagent%3Ataskfold-alpha-card",
    );
    expect(taskfoldNativeChatHref("session with spaces", "/control/plugin")).toBe(
      "/control/chat?session=session%20with%20spaces",
    );
  });
});
