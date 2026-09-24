// 扩展进程自己弹的框（冲突三选一、确认框、错误提示）的文案。语言跟随 `vscode.env.language`，
// 与 Webview 同一条归一规则：zh* → 简体中文，其余英文。命令标题走 package.nls*.json。

export type TaskfoldExtensionLocale = "en" | "zh-CN";

export function resolveTaskfoldExtensionLocale(language: string | undefined): TaskfoldExtensionLocale {
  return language?.trim().toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export type TaskfoldExtensionStrings = {
  ok: string;
  reload: string;
  overwrite: string;
  viewDiff: string;
  conflictMessage: (title: string) => string;
  conflictDetail: string;
  diffTitle: (title: string) => string;
  locked: string;
  cardFileMissing: string;
  unsupportedMethod: (method: string) => string;
  panelTitle: string;
};

const STRINGS: Record<TaskfoldExtensionLocale, TaskfoldExtensionStrings> = {
  en: {
    ok: "OK",
    reload: "Reload",
    overwrite: "Overwrite",
    viewDiff: "View Diff",
    conflictMessage: (title) => `"${title}" was changed by someone else since you opened it.`,
    conflictDetail:
      "Reload discards your changes and shows the latest card. Overwrite applies your changes on top of the latest version. View Diff compares the card on disk with your version.",
    diffTitle: (title) => `${title}: on disk ↔ your changes`,
    locked: "Another process is holding this card's lock. Nothing was written; try again.",
    cardFileMissing: "The card's Markdown file was not found.",
    unsupportedMethod: (method) => `${method} is not available in VS Code.`,
    panelTitle: "Taskfold",
  },
  "zh-CN": {
    ok: "确定",
    reload: "重新加载",
    overwrite: "覆盖",
    viewDiff: "查看差异",
    conflictMessage: (title) => `「${title}」在你打开之后被别人改过。`,
    conflictDetail:
      "重新加载：丢掉你的修改，显示最新的卡片。覆盖：把你的修改应用到最新版本上。查看差异：对比磁盘上的卡片和你的版本。",
    diffTitle: (title) => `${title}：磁盘 ↔ 你的修改`,
    locked: "另一个进程正占用这张卡的锁，没有写入，请重试。",
    cardFileMissing: "找不到这张卡片的 Markdown 文件。",
    unsupportedMethod: (method) => `VS Code 里不支持 ${method}。`,
    panelTitle: "Taskfold",
  },
};

export function taskfoldExtensionStrings(locale: TaskfoldExtensionLocale): TaskfoldExtensionStrings {
  return STRINGS[locale];
}
