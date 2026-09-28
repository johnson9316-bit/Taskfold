// `TaskfoldHost` 的 VS Code Webview 实现（需求/18 §5）。
//
// 所有请求经 postMessage 交给扩展进程（packages/vscode/src/panel.ts），由它在进程内调用
// core；协议定义在同目录的 protocol.ts，两端共用。
// - 始终「已连接」：没有 Gateway，扩展进程就是后端。
// - `changes`：扩展进程的文件监听与定期全量重读推过来，只当刷新提示。
// - 语言跟随 `vscode.env.language`（启动参数），不持久化——下次打开仍跟随编辑器。
// - 确认框交给扩展进程弹 VS Code 模态框：Webview 里的 `window.confirm` 0ms 返回 false、
//   不弹框（TASK-7 实测）。
// - 能力开关：卡片 CAS、编辑模式、打开原文件打开；执行、项目管理、资料库关闭。
import type { TaskfoldHost, TaskfoldHostCapabilities, TaskfoldHostEvent } from "./host.ts";
import {
  isTaskfoldExtensionMessage,
  type TaskfoldWebviewBootstrap,
  type TaskfoldWebviewMessage,
} from "./protocol.ts";

/** `acquireVsCodeApi()` 的返回值里本实现用到的部分。 */
export type TaskfoldVsCodeWebviewApi = {
  postMessage(message: TaskfoldWebviewMessage): void;
};

export const TASKFOLD_VSCODE_CAPABILITIES: TaskfoldHostCapabilities = {
  execution: false,
  cardRevisionCheck: true,
  cardEditing: true,
  projectManagement: false,
  documents: true,
  openCardFile: true,
};

export function createVsCodeTaskfoldHost(
  api: TaskfoldVsCodeWebviewApi,
  bootstrap: TaskfoldWebviewBootstrap,
  messages: Pick<Window, "addEventListener"> = window,
): TaskfoldHost {
  let nextId = 1;
  const pendingRequests = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  const pendingConfirms = new Map<number, (confirmed: boolean) => void>();
  const listeners = new Set<(event: TaskfoldHostEvent) => void>();

  messages.addEventListener("message", (event: MessageEvent) => {
    const message: unknown = event.data;
    if (!isTaskfoldExtensionMessage(message)) {
      return;
    }
    if (message.type === "changes") {
      for (const listener of [...listeners]) {
        listener({ type: "changes" });
      }
      return;
    }
    if (message.type === "confirmResult") {
      pendingConfirms.get(message.id)?.(message.confirmed);
      pendingConfirms.delete(message.id);
      return;
    }
    const pending = pendingRequests.get(message.id);
    if (!pending) {
      return;
    }
    pendingRequests.delete(message.id);
    if (message.ok) {
      pending.resolve(message.result);
    } else {
      pending.reject(new Error(message.error.message));
    }
  });

  return {
    request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
      const id = nextId++;
      return new Promise<T>((resolve, reject) => {
        pendingRequests.set(id, { resolve: resolve as (value: unknown) => void, reject });
        api.postMessage({ type: "request", id, method, ...(params ? { params } : {}) });
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    connected: true,
    locale: {
      initial: () => bootstrap.locale,
      persist() {},
    },
    confirm(message) {
      const id = nextId++;
      return new Promise<boolean>((resolve) => {
        pendingConfirms.set(id, resolve);
        api.postMessage({ type: "confirm", id, message });
      });
    },
    capabilities: TASKFOLD_VSCODE_CAPABILITIES,
  };
}
