// 看板 WebviewPanel（需求/18 §5：放在编辑器区域，不用 CustomEditor）。
//
// - viewType 固定为 {@link TASKFOLD_BOARD_VIEW_TYPE}，**不要改**：Webview 的 localStorage origin
//   按 viewType + 扩展 id 绑定（TASK-7），改了等于换一个 origin。
// - CSP 固定为 `default-src 'none'; img-src ${cspSource} data:; font-src ${cspSource};
//   style-src ${cspSource}; script-src 'nonce-${nonce}'`（TASK-7 定案）：样式只能来自扩展的
//   media 目录，行内 style 属性一律被拦（前端已改用 CSSOM 指令）。
// - 变更感知：FileSystemWatcher 监听各项目的 `.taskfold/**`（跳过 `.locks/`）和各工作区文件夹的
//   `.taskfold/**`（发现新 init 的项目），只当刷新提示、合并 300ms；另外每 30 秒在面板可见时
//   让前端全量重读一次，兜住 watcher 漏掉的变化（网络盘、外部 git 操作等）。
import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import type { TaskfoldExtensionLocale } from "./l10n.js";
import { toWebviewError, type createTaskfoldVscodeMethods, type TaskfoldVscodeUi } from "./methods.js";
import {
  isTaskfoldWebviewMessage,
  type TaskfoldExtensionMessage,
  type TaskfoldWebviewMessage,
} from "@taskfold/ui/protocol.js";
import type { TaskfoldProjectRegistry } from "./projects.js";
import type { TaskfoldExtensionStrings } from "./l10n.js";

export const TASKFOLD_BOARD_VIEW_TYPE = "taskfold.board";

const CHANGE_DEBOUNCE_MS = 300;
const FULL_REREAD_INTERVAL_MS = 30_000;

export type TaskfoldPanelServices = {
  extensionUri: vscode.Uri;
  registry: TaskfoldProjectRegistry;
  methods: ReturnType<typeof createTaskfoldVscodeMethods>;
  ui: TaskfoldVscodeUi;
  strings: TaskfoldExtensionStrings;
  locale: TaskfoldExtensionLocale;
  language: string;
};

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function renderTaskfoldBoardHtml(params: {
  cspSource: string;
  nonce: string;
  scriptUri: string;
  styleUri: string;
  language: string;
  htmlLang: string;
}): string {
  const csp = [
    "default-src 'none'",
    `img-src ${params.cspSource} data:`,
    `font-src ${params.cspSource}`,
    `style-src ${params.cspSource}`,
    `script-src 'nonce-${params.nonce}'`,
  ].join("; ");
  return `<!DOCTYPE html>
<html lang="${escapeAttribute(params.htmlLang)}">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${escapeAttribute(params.styleUri)}">
<title>Taskfold</title>
</head>
<body data-taskfold-locale="${escapeAttribute(params.language)}">
<script nonce="${params.nonce}" src="${escapeAttribute(params.scriptUri)}"></script>
</body>
</html>`;
}

export class TaskfoldBoardPanel {
  private static current: TaskfoldBoardPanel | undefined;

  static show(services: TaskfoldPanelServices): void {
    if (TaskfoldBoardPanel.current) {
      TaskfoldBoardPanel.current.panel.reveal();
      return;
    }
    const mediaUri = vscode.Uri.joinPath(services.extensionUri, "media");
    const panel = vscode.window.createWebviewPanel(
      TASKFOLD_BOARD_VIEW_TYPE,
      services.strings.panelTitle,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [mediaUri],
        // 编辑草稿、打开着的卡片详情都在 Webview 内存里；切走标签页不能把它们丢掉。
        retainContextWhenHidden: true,
      },
    );
    TaskfoldBoardPanel.current = new TaskfoldBoardPanel(panel, services, mediaUri);
  }

  private readonly disposables: vscode.Disposable[] = [];
  private watchers: vscode.FileSystemWatcher[] = [];
  private watchedDirs = "";
  private changeTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly rereadTimer: ReturnType<typeof setInterval>;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly services: TaskfoldPanelServices,
    mediaUri: vscode.Uri,
  ) {
    const { webview } = panel;
    webview.html = renderTaskfoldBoardHtml({
      cspSource: webview.cspSource,
      nonce: randomBytes(16).toString("base64"),
      scriptUri: webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, "webview.js")).toString(),
      styleUri: webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, "webview.css")).toString(),
      language: services.language,
      htmlLang: services.locale,
    });
    this.disposables.push(
      webview.onDidReceiveMessage((message: unknown) => void this.receive(message)),
      panel.onDidDispose(() => this.dispose()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.scheduleChanges()),
    );
    this.rereadTimer = setInterval(() => {
      if (this.panel.visible) {
        this.post({ type: "changes" });
      }
    }, FULL_REREAD_INTERVAL_MS);
    this.syncWatchers();
  }

  private post(message: TaskfoldExtensionMessage): void {
    void this.panel.webview.postMessage(message);
  }

  private async receive(message: unknown): Promise<void> {
    if (!isTaskfoldWebviewMessage(message)) {
      return;
    }
    await this.handle(message);
  }

  private async handle(message: TaskfoldWebviewMessage): Promise<void> {
    if (message.type === "confirm") {
      const confirmed = await this.services.ui.confirm(message.message).catch(() => false);
      this.post({ type: "confirmResult", id: message.id, confirmed });
      return;
    }
    try {
      const result = await this.services.methods.call(message.method, message.params ?? {});
      this.post({ type: "response", id: message.id, ok: true, result });
    } catch (error) {
      this.post({ type: "response", id: message.id, ok: false, error: toWebviewError(error, this.services.strings) });
    }
    if (message.method === "taskfold.projects.list") {
      // 刚重新扫描过项目：数据根可能变了，跟着换监听。
      this.syncWatchers();
    }
  }

  private scheduleChanges(): void {
    if (this.changeTimer) {
      clearTimeout(this.changeTimer);
    }
    this.changeTimer = setTimeout(() => {
      this.changeTimer = undefined;
      this.post({ type: "changes" });
    }, CHANGE_DEBOUNCE_MS);
  }

  private onFileEvent(uri: vscode.Uri): void {
    // 每次写入都会建删锁文件，不算数据变化。
    if (/[\\/]\.locks([\\/]|$)/.test(uri.fsPath)) {
      return;
    }
    this.scheduleChanges();
  }

  private syncWatchers(): void {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const dataDirs = this.services.registry.dataDirs();
    const signature = JSON.stringify([folders.map((folder) => folder.uri.toString()), dataDirs]);
    if (signature === this.watchedDirs) {
      return;
    }
    this.watchedDirs = signature;
    for (const watcher of this.watchers) {
      watcher.dispose();
    }
    const patterns = [
      ...folders.map((folder) => new vscode.RelativePattern(folder, ".taskfold/**")),
      ...dataDirs.map((dataDir) => new vscode.RelativePattern(vscode.Uri.file(dataDir), "**")),
    ];
    this.watchers = patterns.map((pattern) => {
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      const listener = (uri: vscode.Uri) => this.onFileEvent(uri);
      watcher.onDidCreate(listener);
      watcher.onDidChange(listener);
      watcher.onDidDelete(listener);
      return watcher;
    });
  }

  private dispose(): void {
    TaskfoldBoardPanel.current = undefined;
    clearInterval(this.rereadTimer);
    if (this.changeTimer) {
      clearTimeout(this.changeTimer);
    }
    for (const disposable of [...this.disposables, ...this.watchers]) {
      disposable.dispose();
    }
    this.watchers = [];
  }
}
