// {@link TaskfoldVscodeUi} 的 VS Code 实现：模态框用 `showWarningMessage(..., { modal: true }, ...)`，
// diff 用内置命令 `vscode.diff`（右边是一个只读的虚拟文档），打开原文件用 `showTextDocument`。
import * as vscode from "vscode";
import type { TaskfoldExtensionStrings } from "./l10n.js";
import type { TaskfoldConflictChoice, TaskfoldVscodeUi } from "./methods.js";

/** diff 右边「本地版本」的虚拟文档 scheme。 */
export const TASKFOLD_LOCAL_SCHEME = "taskfold-local";

/** 提供 {@link TASKFOLD_LOCAL_SCHEME} 文档的内容；每次 diff 用一个新 URI，不会读到旧内容。 */
export class TaskfoldLocalDocumentProvider implements vscode.TextDocumentContentProvider {
  private readonly contents = new Map<string, string>();
  private sequence = 0;

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? "";
  }

  register(filePath: string, content: string): vscode.Uri {
    this.sequence += 1;
    const uri = vscode.Uri.from({
      scheme: TASKFOLD_LOCAL_SCHEME,
      path: filePath,
      query: `v=${this.sequence}`,
    });
    this.contents.set(uri.toString(), content);
    return uri;
  }
}

export function createTaskfoldVscodeUi(
  strings: TaskfoldExtensionStrings,
  localDocuments: TaskfoldLocalDocumentProvider,
): TaskfoldVscodeUi {
  return {
    async confirm(message) {
      const choice = await vscode.window.showWarningMessage(message, { modal: true }, strings.ok);
      return choice === strings.ok;
    },
    async chooseConflictResolution(cardTitle): Promise<TaskfoldConflictChoice | undefined> {
      const choice = await vscode.window.showWarningMessage(
        strings.conflictMessage(cardTitle),
        { modal: true, detail: strings.conflictDetail },
        strings.reload,
        strings.overwrite,
        strings.viewDiff,
      );
      switch (choice) {
        case strings.reload:
          return "reload";
        case strings.overwrite:
          return "overwrite";
        case strings.viewDiff:
          return "diff";
        default:
          return undefined;
      }
    },
    async showCardDiff({ diskPath, localContent, cardTitle }) {
      await vscode.commands.executeCommand(
        "vscode.diff",
        vscode.Uri.file(diskPath),
        localDocuments.register(diskPath, localContent),
        strings.diffTitle(cardTitle),
        { preview: true },
      );
    },
    async openFile(filePath) {
      await vscode.window.showTextDocument(vscode.Uri.file(filePath), { preview: false });
    },
  };
}
