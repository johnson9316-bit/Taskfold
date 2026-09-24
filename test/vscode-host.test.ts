// TASK-8：VS Code 这一侧的胶水——Webview 里的 host 实现（postMessage 协议两端）、扩展进程的
// VS Code 界面实现（vscode API 替身，见 test/helpers/vscode-stub.ts）、面板 HTML 的 CSP。
import * as vscode from "vscode";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVsCodeTaskfoldHost } from "../browser/vscode-host.ts";
import { taskfoldExtensionStrings } from "../packages/vscode/src/l10n.ts";
import { renderTaskfoldBoardHtml, TASKFOLD_BOARD_VIEW_TYPE } from "../packages/vscode/src/panel.ts";
import {
  isTaskfoldExtensionMessage,
  isTaskfoldWebviewMessage,
  type TaskfoldExtensionMessage,
  type TaskfoldWebviewMessage,
} from "../packages/vscode/src/protocol.ts";
import { createTaskfoldVscodeUi, TaskfoldLocalDocumentProvider } from "../packages/vscode/src/vscode-ui.ts";

function webviewHarness() {
  const sent: TaskfoldWebviewMessage[] = [];
  let listener: ((event: MessageEvent) => void) | undefined;
  const host = createVsCodeTaskfoldHost(
    { postMessage: (message) => sent.push(message) },
    { locale: "zh-cn" },
    {
      addEventListener: ((type: string, handler: (event: MessageEvent) => void) => {
        expect(type).toBe("message");
        listener = handler;
      }) as Window["addEventListener"],
    },
  );
  const deliver = (message: TaskfoldExtensionMessage | Record<string, unknown>) =>
    listener?.({ data: message } as MessageEvent);
  return { host, sent, deliver };
}

describe("webview host (browser/vscode-host.ts)", () => {
  it("sends requests and settles them from matching responses", async () => {
    const { host, sent, deliver } = webviewHarness();
    const ok = host.request("taskfold.projects.list", { includeArchived: true });
    const failed = host.request("taskfold.cards.update", { id: "x" });
    expect(sent).toEqual([
      { type: "request", id: 1, method: "taskfold.projects.list", params: { includeArchived: true } },
      { type: "request", id: 2, method: "taskfold.cards.update", params: { id: "x" } },
    ]);
    deliver({ type: "response", id: 2, ok: false, error: { code: "LOCKED", message: "try again" } });
    deliver({ type: "response", id: 1, ok: true, result: { projects: [] } });
    await expect(ok).resolves.toEqual({ projects: [] });
    await expect(failed).rejects.toThrow("try again");
  });

  it("turns `changes` into host events, confirms through the extension, and never rejects confirm", async () => {
    const { host, sent, deliver } = webviewHarness();
    const events: unknown[] = [];
    const unsubscribe = host.subscribe((event) => events.push(event));
    deliver({ type: "changes" });
    deliver({ type: "bogus" });
    unsubscribe();
    deliver({ type: "changes" });
    expect(events).toEqual([{ type: "changes" }]);

    const confirmed = host.confirm("Delete?");
    expect(sent.at(-1)).toEqual({ type: "confirm", id: 1, message: "Delete?" });
    deliver({ type: "confirmResult", id: 1, confirmed: false });
    await expect(confirmed).resolves.toBe(false);
  });

  it("is always connected, follows the editor language and declares the VS Code capabilities", () => {
    const { host } = webviewHarness();
    expect(host.connected).toBe(true);
    expect(host.locale.initial()).toBe("zh-cn");
    expect(host.capabilities).toEqual({
      execution: false,
      cardRevisionCheck: true,
      cardEditing: true,
      projectManagement: false,
      documents: false,
      openCardFile: true,
    });
  });
});

describe("protocol guards", () => {
  it("accept only well-formed messages in each direction", () => {
    expect(isTaskfoldWebviewMessage({ type: "request", id: 1, method: "m" })).toBe(true);
    expect(isTaskfoldWebviewMessage({ type: "request", id: 1, method: "m", params: [] })).toBe(false);
    expect(isTaskfoldWebviewMessage({ type: "confirm", id: "1", message: "x" })).toBe(false);
    expect(isTaskfoldExtensionMessage({ type: "response", id: 1, ok: false, error: { code: "X" } })).toBe(false);
    expect(isTaskfoldExtensionMessage({ type: "confirmResult", id: 1, confirmed: true })).toBe(true);
  });
});

describe("VS Code UI (packages/vscode/src/vscode-ui.ts)", () => {
  const showWarningMessage = vi.mocked(vscode.window.showWarningMessage) as unknown as ReturnType<typeof vi.fn>;
  const executeCommand = vi.mocked(vscode.commands.executeCommand) as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    showWarningMessage.mockReset();
    executeCommand.mockReset();
  });

  it("confirm is a modal warning with the localized OK button", async () => {
    const strings = taskfoldExtensionStrings("zh-CN");
    const ui = createTaskfoldVscodeUi(strings, new TaskfoldLocalDocumentProvider());
    showWarningMessage.mockResolvedValueOnce("确定").mockResolvedValueOnce(undefined);
    await expect(ui.confirm("归档？")).resolves.toBe(true);
    await expect(ui.confirm("归档？")).resolves.toBe(false);
    expect(showWarningMessage).toHaveBeenCalledWith("归档？", { modal: true }, "确定");
  });

  it("the conflict dialog is modal with Reload / Overwrite / View Diff, Esc means no choice", async () => {
    const strings = taskfoldExtensionStrings("en");
    const ui = createTaskfoldVscodeUi(strings, new TaskfoldLocalDocumentProvider());
    for (const [label, choice] of [
      ["Reload", "reload"],
      ["Overwrite", "overwrite"],
      ["View Diff", "diff"],
      [undefined, undefined],
    ] as const) {
      showWarningMessage.mockResolvedValueOnce(label);
      await expect(ui.chooseConflictResolution("Card")).resolves.toBe(choice);
    }
    expect(showWarningMessage).toHaveBeenLastCalledWith(
      strings.conflictMessage("Card"),
      { modal: true, detail: strings.conflictDetail },
      "Reload",
      "Overwrite",
      "View Diff",
    );
  });

  it("View Diff runs vscode.diff between the file on disk and a read-only local document", async () => {
    const provider = new TaskfoldLocalDocumentProvider();
    const ui = createTaskfoldVscodeUi(taskfoldExtensionStrings("en"), provider);
    await ui.showCardDiff({ diskPath: "/repo/.taskfold/cards/card-1 - x.md", localContent: "local", cardTitle: "x" });
    const [command, left, right, title] = executeCommand.mock.calls[0]!;
    expect(command).toBe("vscode.diff");
    expect(String(left)).toBe("file:///repo/.taskfold/cards/card-1 - x.md");
    expect((right as vscode.Uri).scheme).toBe("taskfold-local");
    expect(provider.provideTextDocumentContent(right as vscode.Uri)).toBe("local");
    expect(title).toBe("x: on disk ↔ your changes");
  });
});

describe("board panel HTML", () => {
  it("uses the fixed CSP, a nonce on the only script, and external stylesheets only", () => {
    const html = renderTaskfoldBoardHtml({
      cspSource: "https://file+.vscode-resource.vscode-cdn.net",
      nonce: "abc123",
      scriptUri: "https://x/media/webview.js",
      styleUri: "https://x/media/webview.css",
      language: "zh-cn",
      htmlLang: "zh-CN",
    });
    expect(html).toContain(
      `content="default-src 'none'; img-src https://file+.vscode-resource.vscode-cdn.net data:; font-src https://file+.vscode-resource.vscode-cdn.net; style-src https://file+.vscode-resource.vscode-cdn.net; script-src 'nonce-abc123'"`,
    );
    expect(html).toContain('<script nonce="abc123" src="https://x/media/webview.js"></script>');
    expect(html).not.toMatch(/<style|style="/);
    expect(html).toContain('data-taskfold-locale="zh-cn"');
    expect(TASKFOLD_BOARD_VIEW_TYPE).toBe("taskfold.board");
  });
});
