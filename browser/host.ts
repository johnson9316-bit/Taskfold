// Taskfold 看板前端的宿主接口（`需求/18-多宿主架构.md` §5）。
//
// `browser/` 里的看板代码（`project-host.ts`、i18n）只经由这里的 `TaskfoldHost`
// 与宿主打交道，不直接碰 OpenClaw 的 `ControlUiHost`、`window.confirm` 或
// localStorage。第一个实现是 `openclaw-host.ts`（OpenClaw 原生 Control UI 注入），
// VS Code Webview 是第二个。本文件不得依赖任何宿主专属模块。
import type { TaskfoldLocalePreference } from "./i18n/index.ts";

/** 宿主推给前端的通知。 */
export type TaskfoldHostEvent =
  /** 宿主状态可能变了（前端目前只关心 `connected`），重新读取即可；允许重复、无变化地触发。 */
  | { type: "connection" }
  /** 看板数据有外部变更，前端应重新拉取。 */
  | { type: "changes" };

/** 宿主能力开关。关掉的能力，前端既不渲染对应界面，也不发对应请求。 */
export type TaskfoldHostCapabilities = {
  /**
   * 执行（派活）：卡片详情的执行区块、启动执行弹窗、`taskfold.cards.execution.*`，
   * 以及宿主自己的 `sessions.steer`、`chat.abort`。
   */
  readonly execution: boolean;
  /**
   * 卡片 CAS：`taskfold.cards.update` / `move` / `moveMilestone` 带上前端读到的 `expectedRevision`，
   * 宿主据此做比对，冲突时由宿主自己处理（VS Code 弹 Reload / Overwrite / View Diff），结果见
   * {@link TaskfoldCardWriteResult}。OpenClaw 网关的 move / moveMilestone 不接收这个参数，关闭。
   */
  readonly cardRevisionCheck: boolean;
  /** 卡片详情里的编辑模式（标题、优先级、正文）。依赖卡片 CAS，没有 CAS 的宿主关闭。 */
  readonly cardEditing: boolean;
  /**
   * 项目级管理：新建 / 归档 / 恢复 / 排序项目、「包含已归档」、项目设置页、跨项目移卡。
   * VS Code 的项目就是工作区里的文件夹，这些都没有意义，关闭。
   */
  readonly projectManagement: boolean;
  /** 资料库页（`taskfold.projects.documents.*`）。 */
  readonly documents: boolean;
  /** 卡片详情里「在编辑器中打开」原 md 文件（`taskfold.cards.openFile`）。 */
  readonly openCardFile: boolean;
};

/**
 * 打开了 `cardRevisionCheck` 的宿主，对 `taskfold.cards.update` / `move` / `moveMilestone` 的返回。
 * 没有 `conflict`：一次写成。`conflict` 是用户在冲突框里的选择：
 * - `overwritten`：已在最新 revision 上重新应用了本地修改；
 * - `reloaded`：放弃本地修改，前端应丢掉草稿、重新读取；
 * - `cancelled`：什么都没写，本地草稿保留，可以再提交。
 */
export type TaskfoldCardWriteResult = {
  conflict?: "overwritten" | "reloaded" | "cancelled";
};

export interface TaskfoldHost {
  /** 按 method 名调用后端，失败时 reject（`Error.message` 直接展示给用户）。 */
  request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
  /** 订阅宿主通知；返回退订函数。注册时不会立即回调，初始状态由调用方自己读一次。 */
  subscribe(listener: (event: TaskfoldHostEvent) => void): () => void;
  /** 当前能否发请求；为 false 时前端禁用写操作并提示等待连接。 */
  readonly connected: boolean;
  /** 界面语言的初始值与回写。 */
  readonly locale: TaskfoldLocalePreference;
  /** 危险操作前的确认。用户取消或关闭对话框一律 resolve(false)，不 reject。 */
  confirm(message: string): Promise<boolean>;
  readonly capabilities: TaskfoldHostCapabilities;
}

let activeHost: TaskfoldHost | undefined;
let activeSignal: AbortSignal | undefined;

/**
 * 绑定当前宿主实现，返回解绑函数。`signal` 是宿主的生命周期信号（OpenClaw 在
 * 卸载插件时 abort），abort 之后 `taskfoldHost()` 立即抛错。
 */
export function bindTaskfoldHost(host: TaskfoldHost, signal?: AbortSignal): () => void {
  activeHost = host;
  activeSignal = signal;
  return () => {
    if (activeHost === host) {
      activeHost = undefined;
      activeSignal = undefined;
    }
  };
}

/**
 * 当前绑定的宿主。插件已停用（解绑或 `signal` 已 abort）时抛错，让残留的异步回调
 * 大声失败，而不是去碰一个过期的宿主。
 */
export function taskfoldHost(): TaskfoldHost {
  if (!activeHost || activeSignal?.aborted) {
    throw new Error("Taskfold is no longer active. Reload the plugin to continue.");
  }
  return activeHost;
}
