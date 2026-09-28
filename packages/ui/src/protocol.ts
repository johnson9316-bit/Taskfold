// Webview ⇄ 扩展进程的 postMessage 协议（需求/18 §5「判别联合类型，双向都有类型定义」）。
//
// 两端共用本文件：扩展进程（packages/vscode/src/panel.ts）和 Webview 里的 host 实现
// （packages/ui/src/vscode-host.ts）。这里不依赖 `vscode`、Node 或 DOM，两边都能打包。
// 结构守卫只校验判别字段与必需字段的类型，收到不认识的消息一律丢弃。

/** Webview → 扩展进程。 */
export type TaskfoldWebviewMessage =
  /** 调用一个 method（见 packages/vscode/src/methods.ts 的清单），扩展进程必回一条同 id 的 `response`。 */
  | { type: "request"; id: number; method: string; params?: Record<string, unknown> }
  /** `TaskfoldHost.confirm()`：扩展进程弹 VS Code 模态框，必回一条同 id 的 `confirmResult`。 */
  | { type: "confirm"; id: number; message: string };

/** `response` 失败时的错误。`code` 与 CLI 错误码同一套（CONFLICT、LOCKED、NOT_FOUND……）。 */
export type TaskfoldWebviewError = { code: string; message: string };

/** 扩展进程 → Webview。 */
export type TaskfoldExtensionMessage =
  | { type: "response"; id: number; ok: true; result: unknown }
  | { type: "response"; id: number; ok: false; error: TaskfoldWebviewError }
  | { type: "confirmResult"; id: number; confirmed: boolean }
  /** `.taskfold/` 可能变了（文件监听或定期全量重读），Webview 重新拉取即可。 */
  | { type: "changes" };

/** 扩展进程渲染页面时写进 `<body data-taskfold-locale>` 的启动参数。 */
export type TaskfoldWebviewBootstrap = {
  /** `vscode.env.language`，前端归一成 en / zh-CN。 */
  locale: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

export function isTaskfoldWebviewMessage(value: unknown): value is TaskfoldWebviewMessage {
  if (!isRecord(value) || !isId(value.id)) {
    return false;
  }
  if (value.type === "request") {
    return typeof value.method === "string" && (value.params === undefined || isRecord(value.params));
  }
  return value.type === "confirm" && typeof value.message === "string";
}

export function isTaskfoldExtensionMessage(value: unknown): value is TaskfoldExtensionMessage {
  if (!isRecord(value)) {
    return false;
  }
  switch (value.type) {
    case "changes":
      return true;
    case "confirmResult":
      return isId(value.id) && typeof value.confirmed === "boolean";
    case "response":
      return (
        isId(value.id) &&
        (value.ok === true ||
          (value.ok === false &&
            isRecord(value.error) &&
            typeof value.error.code === "string" &&
            typeof value.error.message === "string"))
      );
    default:
      return false;
  }
}
