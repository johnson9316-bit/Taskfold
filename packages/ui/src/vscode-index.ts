// Taskfold 看板的 VS Code Webview 入口（需求/18 §5）。由 packages/vscode/scripts/build.mjs
// 打包到 packages/vscode/media/webview.{js,css}，扩展进程在 WebviewPanel 里加载。
import { bindTaskfoldHost } from "./host.ts";
import { createVsCodeTaskfoldHost, type TaskfoldVsCodeWebviewApi } from "./vscode-host.ts";
// 副作用导入：注册 <taskfold-app>（见 project-host.ts 末尾）。
import "./project-host.ts";
// 放在最后：主题映射要排在 host.css / taskfold-project.css 之后。
import "./vscode-theme.css";

declare function acquireVsCodeApi(): TaskfoldVsCodeWebviewApi;

bindTaskfoldHost(
  createVsCodeTaskfoldHost(acquireVsCodeApi(), {
    locale: document.body.dataset.taskfoldLocale ?? "en",
  }),
);
document.body.append(document.createElement("taskfold-app"));
