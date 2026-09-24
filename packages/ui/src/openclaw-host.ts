// `TaskfoldHost` 的 OpenClaw 实现：包装宿主交给 `activate()` 的 `ControlUiHost`。
//
// 原先散在 `project-host.ts` / `i18n/lib/translate.ts` 里的 OpenClaw 专属行为都收在
// 这里，逻辑原样搬过来，界面行为不变：
// - `taskfold.changes.wait` 长轮询：只在有订阅者且已连接时运行，拿到新变更就发
//   `{ type: "changes" }`；
// - `ControlUiHost.subscribe()` 的每次回调都转成 `{ type: "connection" }`；
// - 语言偏好读写 localStorage（含 Flowboard 旧键的一次性迁移）；
// - 确认框用 `window.confirm`；
// - 能力开关：执行、项目管理、资料库打开；卡片 CAS、编辑模式、打开原文件关闭。
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import type { TaskfoldHost, TaskfoldHostEvent } from "./host.ts";
import { resolveInitialTaskfoldLocale, type TaskfoldLocalePreference } from "./i18n/index.ts";
import { getSafeLocalStorage } from "./local-storage.ts";

type ChangeCursor = {
  epoch: string;
  revision: number;
};

type ChangeWaitResult = {
  change?: ChangeCursor;
  timedOut?: boolean;
};

const TASKFOLD_LOCALE_STORAGE_KEY = "taskfold.i18n.locale";
const LEGACY_FLOWBOARD_LOCALE_STORAGE_KEY = "flowboard.i18n.locale";

function validChange(value: unknown): value is ChangeCursor {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as ChangeCursor).epoch === "string" &&
      Number.isSafeInteger((value as ChangeCursor).revision),
  );
}

function readStoredLocale(): string | null {
  const storage = getSafeLocalStorage();
  if (!storage) {
    return null;
  }
  try {
    const taskfoldLocale = storage.getItem(TASKFOLD_LOCALE_STORAGE_KEY);
    if (taskfoldLocale) {
      return taskfoldLocale;
    }
    const legacyLocale = storage.getItem(LEGACY_FLOWBOARD_LOCALE_STORAGE_KEY);
    if (legacyLocale) {
      storage.setItem(TASKFOLD_LOCALE_STORAGE_KEY, legacyLocale);
    }
    return legacyLocale;
  } catch {
    return null;
  }
}

/**
 * 语言偏好：localStorage 里保存的 Taskfold 语言 > 宿主语言 > 浏览器语言；
 * 生效后写回 localStorage，作为 Taskfold 独立于宿主的偏好。
 */
export function createOpenClawLocalePreference(readHostLocale: () => unknown): TaskfoldLocalePreference {
  return {
    initial() {
      const language =
        typeof globalThis.navigator?.language === "string" ? globalThis.navigator.language : null;
      return resolveInitialTaskfoldLocale({
        storedLocale: readStoredLocale(),
        hostLocale: readHostLocale(),
        browserLocale: language,
      });
    },
    persist(locale) {
      const storage = getSafeLocalStorage();
      if (!storage) {
        return;
      }
      try {
        storage.setItem(TASKFOLD_LOCALE_STORAGE_KEY, locale);
      } catch {
        // Ignore storage write failures in private/blocked contexts.
      }
    },
  };
}

export function createOpenClawTaskfoldHost(host: ControlUiHost): TaskfoldHost {
  const listeners = new Set<(event: TaskfoldHostEvent) => void>();
  let unsubscribeHost: (() => void) | undefined;
  // 长轮询看到的连接状态，只在 `syncConnection()` 里更新，与原先组件里的
  // `connectedToGateway` 同一语义。
  let connected = false;
  let changeLoopGeneration = 0;
  let changeCursor: ChangeCursor | undefined;

  const emit = (event: TaskfoldHostEvent) => {
    for (const listener of [...listeners]) {
      listener(event);
    }
  };

  const waitForChanges = async (generation: number) => {
    while (generation === changeLoopGeneration && connected) {
      try {
        const result = await host.request<ChangeWaitResult>("taskfold.changes.wait", {
          ...(changeCursor ? { after: changeCursor } : {}),
          timeoutMs: 25_000,
        });
        if (generation !== changeLoopGeneration || !connected) {
          return;
        }
        if (validChange(result.change)) {
          const wasUninitialized = changeCursor === undefined;
          changeCursor = result.change;
          if (!wasUninitialized && !result.timedOut) {
            emit({ type: "changes" });
          }
        }
      } catch {
        if (generation !== changeLoopGeneration || !connected) {
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1_000));
      }
    }
  };

  const syncConnection = (notify: boolean) => {
    const wasConnected = connected;
    connected = host.connection.connected;
    if (!connected && wasConnected) {
      changeLoopGeneration += 1;
    }
    // 先通知订阅者（它在连上时立刻 refresh），再起长轮询，保持原先的请求顺序。
    if (notify) {
      emit({ type: "connection" });
    }
    if (connected && !wasConnected) {
      const generation = ++changeLoopGeneration;
      void waitForChanges(generation);
    }
  };

  return {
    request: (method, params) => host.request(method, params),
    subscribe(listener) {
      listeners.add(listener);
      if (!unsubscribeHost) {
        // `host.subscribe()` 是宿主通用的「有东西变了、你可能要重绘」信号，注册时
        // 不会立即回调，所以这里自己同步一次初始连接状态（已连接就起长轮询）；按接口
        // 约定这次不通知，订阅者自己读一次 `connected`。
        unsubscribeHost = host.subscribe(() => syncConnection(true));
        syncConnection(false);
      }
      return () => {
        if (!listeners.delete(listener) || listeners.size > 0) {
          return;
        }
        // 最后一个订阅者离开：停掉长轮询，游标随之作废，下次挂载从头开始。
        unsubscribeHost?.();
        unsubscribeHost = undefined;
        connected = false;
        changeLoopGeneration += 1;
        changeCursor = undefined;
      };
    },
    get connected() {
      return host.connection.connected;
    },
    locale: createOpenClawLocalePreference(() => host.locale),
    confirm: async (message) => window.confirm(message),
    capabilities: {
      execution: true,
      // 网关的 move / moveMilestone 不接收 expectedRevision；前端 CAS 与编辑模式等 OpenClaw
      // 后端改到文件存储后再一起打开（TASK-8）。
      cardRevisionCheck: false,
      cardEditing: false,
      projectManagement: true,
      documents: true,
      openCardFile: false,
    },
  };
}
