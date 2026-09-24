// CLI 锁冲突测试的持锁子进程（由 test/cli-locking.test.ts 用 child_process 拉起，不是 vitest 用例）。
// 用与 core 相同的 proper-lockfile 参数拿住一把 Taskfold 锁（卡锁或全局锁），就绪后往 stdout
// 写一行 `locked`，一直持有到 stdin 关闭再放锁退出。锁冲突因此来自一个真实的别的进程，不是 mock。
import lockfile from "proper-lockfile";
import { TASKFOLD_LOCK_STALE_MS, TASKFOLD_LOCK_UPDATE_MS } from "@taskfold/core/file-store-locks.js";

async function main(): Promise<void> {
  const [target, lockfilePath] = process.argv.slice(2);
  if (!target || !lockfilePath) {
    throw new Error("usage: cli-lock-holder.ts <target> <lockfilePath>");
  }
  const release = await lockfile.lock(target, {
    lockfilePath,
    realpath: false,
    stale: TASKFOLD_LOCK_STALE_MS,
    update: TASKFOLD_LOCK_UPDATE_MS,
    retries: 0,
  });
  process.stdout.write("locked\n");
  process.stdin.resume();
  process.stdin.on("end", () => {
    release().then(
      () => process.exit(0),
      () => process.exit(0),
    );
  });
}

main().catch((error: unknown) => {
  process.stderr.write(`${(error as Error).stack ?? String(error)}\n`);
  process.exit(1);
});
