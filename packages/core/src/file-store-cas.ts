// Taskfold core module: 没有条件写调用方的实体 store 共用的「显式拒绝」CAS。
//
// persistence-types.ts 把 compareAndSwap 定为所有 KeyedStore 的必选方法（TASK-10 第二段：
// SQLite 运行时后端下线后恢复需求/16 R1 的无条件必选）。卡片以外（boards/milestones/
// documents/subscriptions/attachments）没有任何调用方会做条件写，这些 store 用本函数拒绝——
// 返回 false 并以 `onReject("unsupported")` 说明原因，而不是省略方法或静默穿透成一次无条件写。
import type { TaskfoldCompareAndSwapFailure } from "./persistence-types.js";

export function unsupportedTaskfoldCompareAndSwap<T>(
  _key: string,
  _expectedRevision: number,
  _value: T,
  onReject?: (reason: TaskfoldCompareAndSwapFailure) => void,
): Promise<boolean> {
  onReject?.("unsupported");
  return Promise.resolve(false);
}
