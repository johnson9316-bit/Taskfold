// `taskfold` 可执行入口：把真实进程的参数、目录、流接到 runCli。
import { runCli } from "./cli.js";

// 读端提前关闭（`taskfold list | head`）时 stdout 会报 EPIPE；不处理的话 Node 抛出未捕获的
// 'error' 事件、打一屏堆栈。读端已经不要了，按当前退出码安静退出。
for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EPIPE") {
      process.exit(process.exitCode ?? 0);
    }
    throw error;
  });
}

process.exitCode = await runCli({
  argv: process.argv.slice(2),
  cwd: process.cwd(),
  env: process.env,
  stdout: process.stdout,
  stderr: process.stderr,
  stdin: process.stdin,
});
