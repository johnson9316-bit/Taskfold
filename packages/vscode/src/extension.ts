// Taskfold VS Code 扩展入口（需求/18 §5）：命令「Taskfold: 打开看板」在编辑器区域打开
// WebviewPanel，看板前端复用 packages/ui 的 Lit 组件，扩展进程内直接调用 @taskfold/core。
import * as vscode from "vscode";
import { resolveTaskfoldExtensionLocale, taskfoldExtensionStrings } from "./l10n.js";
import { createTaskfoldVscodeMethods } from "./methods.js";
import { TaskfoldBoardPanel } from "./panel.js";
import { TaskfoldProjectRegistry } from "./projects.js";
import { createTaskfoldVscodeUi, TASKFOLD_LOCAL_SCHEME, TaskfoldLocalDocumentProvider } from "./vscode-ui.js";

export function activate(context: vscode.ExtensionContext): void {
  const language = vscode.env.language;
  const locale = resolveTaskfoldExtensionLocale(language);
  const strings = taskfoldExtensionStrings(locale);
  const localDocuments = new TaskfoldLocalDocumentProvider();
  const ui = createTaskfoldVscodeUi(strings, localDocuments);
  const registry = new TaskfoldProjectRegistry(() =>
    (vscode.workspace.workspaceFolders ?? [])
      .filter((folder) => folder.uri.scheme === "file")
      .map((folder) => ({ name: folder.name, path: folder.uri.fsPath })),
  );
  const methods = createTaskfoldVscodeMethods({
    registry,
    ui,
    viewState: context.workspaceState,
    strings,
  });

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider<vscode.TreeItem>("taskfold.launcher", {
      getTreeItem: (item) => item,
      getChildren: () => [],
    }),
    vscode.workspace.registerTextDocumentContentProvider(TASKFOLD_LOCAL_SCHEME, localDocuments),
    vscode.commands.registerCommand("taskfold.openBoard", () =>
      TaskfoldBoardPanel.show({
        extensionUri: context.extensionUri,
        registry,
        methods,
        ui,
        strings,
        locale,
        language,
      }),
    ),
  );
}

export function deactivate(): void {}
