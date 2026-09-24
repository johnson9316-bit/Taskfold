// 输出层（需求/18 §4）：
// - `--json`：stdout 一个 `{schemaVersion, kind, ...}` 对象；
// - 否则人读文本：stdout 是 TTY 时带颜色，不是 TTY（管道、重定向、AI 的 shell）时自动纯文本，
//   不带任何 ANSI 控制符；`NO_COLOR` 或 `TERM=dumb` 同样关掉颜色；
// - 失败：stderr 一行 `{schemaVersion, kind: "error", error: {code, message, details?}}`，与
//   `--json` 无关，始终是 JSON——调用方不必先猜输出模式才能读错误码。
import type { TaskfoldCliError } from "./errors.js";
import { TASKFOLD_CLI_SCHEMA_VERSION } from "./version.js";

export type CliWritable = { write(chunk: string): unknown; isTTY?: boolean };

export function shouldUseColor(stream: CliWritable, env: NodeJS.ProcessEnv): boolean {
  return stream.isTTY === true && env.NO_COLOR === undefined && env.TERM !== "dumb";
}

const STATUS_COLORS: Record<string, number> = {
  triage: 90,
  backlog: 90,
  todo: 34,
  scheduled: 35,
  ready: 36,
  running: 33,
  review: 35,
  blocked: 31,
  done: 32,
};

export class CliOutput {
  private readonly color: boolean;

  constructor(
    private readonly stdout: CliWritable,
    private readonly stderr: CliWritable,
    env: NodeJS.ProcessEnv,
  ) {
    this.color = shouldUseColor(stdout, env);
  }

  json(kind: string, payload: Record<string, unknown>): void {
    this.stdout.write(`${JSON.stringify({ schemaVersion: TASKFOLD_CLI_SCHEMA_VERSION, kind, ...payload }, null, 2)}\n`);
  }

  line(text = ""): void {
    this.stdout.write(`${text}\n`);
  }

  error(error: TaskfoldCliError): void {
    const body = {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    };
    this.stderr.write(`${JSON.stringify({ schemaVersion: TASKFOLD_CLI_SCHEMA_VERSION, kind: "error", error: body })}\n`);
  }

  private paint(code: number, text: string): string {
    return this.color ? `\u001b[${code}m${text}\u001b[0m` : text;
  }

  dim(text: string): string {
    return this.paint(2, text);
  }

  bold(text: string): string {
    return this.paint(1, text);
  }

  status(status: string, width = 0): string {
    return this.paint(STATUS_COLORS[status] ?? 0, status.padEnd(width));
  }
}
