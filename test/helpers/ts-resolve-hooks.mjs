// 多进程测试的子进程用：Node 24 能直接剥离类型运行 .ts，但 core 源码里的相对导入写的是
// `./x.js`（TS NodeNext 约定），磁盘上只有 `./x.ts`。这里在 `.js` 解析失败时退回同名 `.ts`。
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (specifier.endsWith(".js") && (specifier.startsWith(".") || specifier.startsWith("/"))) {
        return next(`${specifier.slice(0, -3)}.ts`, context);
      }
      throw error;
    }
  },
});
