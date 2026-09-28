import { createRequire as __taskfoldCreateRequire } from "node:module"; const require = __taskfoldCreateRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../core/src/file-store-paths.ts
import fs from "node:fs";
import path from "node:path";
function resolveTaskfoldDataDir(workspace) {
  const root = workspace.sourcePath ?? workspace.path;
  if (!root) {
    throw new Error(
      `taskfold file store requires a workspace with "path" or "sourcePath" (kind: ${workspace.kind}).`
    );
  }
  return path.join(root, ".taskfold");
}
function resolveTaskfoldPluginDir(stateDir) {
  return path.join(stateDir, ...PLUGIN_RELATIVE_PATH);
}
function resolveTaskfoldFileStoreLayout(options) {
  const dataDir = path.resolve(options.dataDir);
  const pluginDir = options.pluginDir === void 0 ? void 0 : path.resolve(options.pluginDir);
  return {
    dataDir,
    cardsDir: path.join(dataDir, "cards"),
    archiveCardsDir: path.join(dataDir, "archive", "cards"),
    milestonesDir: path.join(dataDir, "milestones"),
    documentsDir: path.join(dataDir, "documents"),
    attachmentsDir: path.join(dataDir, "attachments"),
    locksDir: path.join(dataDir, ".locks"),
    runtimeCardsDir: path.join(dataDir, ".runtime", "cards"),
    changesLogPath: path.join(dataDir, ".runtime", "changes.log"),
    configPath: path.join(dataDir, "config.yml"),
    ...pluginDir === void 0 ? {} : {
      pluginDir,
      projectsJsonPath: path.join(pluginDir, "projects.json"),
      subscriptionsDir: path.join(pluginDir, "subscriptions"),
      runsDir: path.join(pluginDir, "runs"),
      metricsDir: path.join(pluginDir, "metrics")
    }
  };
}
function chmodIfExists(targetPath, mode) {
  try {
    fs.chmodSync(targetPath, mode);
  } catch (err) {
    if (err.code !== "ENOENT") {
      throw err;
    }
  }
}
function ensureHardenedDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: TASKFOLD_FILE_STORE_DIR_MODE });
  chmodIfExists(dir, TASKFOLD_FILE_STORE_DIR_MODE);
}
function ensureRuntimeGitignored(dataDir) {
  const gitignorePath = path.join(dataDir, ".gitignore");
  let existing;
  try {
    existing = fs.readFileSync(gitignorePath, "utf8");
  } catch (err) {
    if (err.code !== "ENOENT") {
      throw err;
    }
  }
  const presentLines = new Set((existing ?? "").split(/\r?\n/).map((line) => line.trim()));
  const missing = RUNTIME_GITIGNORE_ENTRIES.filter((entry) => !presentLines.has(entry));
  if (missing.length === 0) {
    return;
  }
  const text = missing.map((entry) => `${entry}
`).join("");
  if (existing === void 0) {
    fs.writeFileSync(gitignorePath, text);
    return;
  }
  const separator = existing.length === 0 || existing.endsWith("\n") ? "" : "\n";
  fs.appendFileSync(gitignorePath, `${separator}${text}`);
}
function ensureTaskfoldDataDirectories(layout) {
  ensureHardenedDir(layout.cardsDir);
  ensureHardenedDir(layout.milestonesDir);
  ensureHardenedDir(layout.documentsDir);
  ensureHardenedDir(layout.attachmentsDir);
  ensureHardenedDir(layout.locksDir);
  ensureHardenedDir(layout.runtimeCardsDir);
  ensureRuntimeGitignored(layout.dataDir);
}
function ensureTaskfoldPluginDirectories(layout) {
  if (layout.pluginDir === void 0 || layout.subscriptionsDir === void 0) {
    return;
  }
  ensureHardenedDir(layout.pluginDir);
  ensureHardenedDir(layout.subscriptionsDir);
}
var TASKFOLD_FILE_STORE_DIR_MODE, TASKFOLD_FILE_STORE_FILE_MODE, PLUGIN_RELATIVE_PATH, RUNTIME_GITIGNORE_ENTRIES;
var init_file_store_paths = __esm({
  "../core/src/file-store-paths.ts"() {
    "use strict";
    TASKFOLD_FILE_STORE_DIR_MODE = 448;
    TASKFOLD_FILE_STORE_FILE_MODE = 384;
    PLUGIN_RELATIVE_PATH = ["plugins", "taskfold"];
    RUNTIME_GITIGNORE_ENTRIES = [".locks/", ".runtime/"];
  }
});

// ../core/src/file-store-path-resolver.ts
import { execFileSync } from "node:child_process";
import fs2 from "node:fs";
import path2 from "node:path";
function splitExistingAncestor(target) {
  const rest = [];
  let current = target;
  while (!fs2.existsSync(current)) {
    const parent = path2.dirname(current);
    if (parent === current) {
      break;
    }
    rest.unshift(path2.basename(current));
    current = parent;
  }
  return { existing: fs2.realpathSync(current), rest };
}
function repoDiscoveryEnv() {
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_COMMON_DIR;
  return env;
}
function readGitLocation(cwd) {
  let output;
  try {
    output = execFileSync("git", ["rev-parse", "--show-toplevel", "--git-common-dir"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      env: repoDiscoveryEnv()
    });
  } catch {
    return void 0;
  }
  const [topLevel, commonDir] = output.split(/\r?\n/);
  if (!topLevel || !commonDir) {
    return void 0;
  }
  return {
    topLevel: fs2.realpathSync(topLevel),
    commonDir: fs2.realpathSync(path2.resolve(cwd, commonDir))
  };
}
function resolveTaskfoldMainCheckoutPath(target) {
  const absolute = path2.resolve(target);
  const { existing, rest } = splitExistingAncestor(absolute);
  const location = readGitLocation(existing);
  if (!location || path2.basename(location.commonDir) !== ".git") {
    return absolute;
  }
  const mainRoot = path2.dirname(location.commonDir);
  if (mainRoot === location.topLevel) {
    return absolute;
  }
  const relative = path2.relative(location.topLevel, path2.join(existing, ...rest));
  return path2.join(mainRoot, relative);
}
var init_file_store_path_resolver = __esm({
  "../core/src/file-store-path-resolver.ts"() {
    "use strict";
  }
});

// ../core/src/file-store-atomic.ts
import { randomUUID } from "node:crypto";
import fs3 from "node:fs";
import path3 from "node:path";
function asBlobContent(value) {
  return Buffer.from(value, "base64");
}
function blobToBase64(value) {
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("base64");
  }
  if (typeof value === "string") {
    return Buffer.from(value).toString("base64");
  }
  return "";
}
function writeFileAtomic(filePath, content, mode = TASKFOLD_FILE_STORE_FILE_MODE, beforeRename) {
  const dir = path3.dirname(filePath);
  fs3.mkdirSync(dir, { recursive: true });
  const tmpPath = path3.join(dir, `.${path3.basename(filePath)}.${randomUUID()}.tmp`);
  fs3.writeFileSync(tmpPath, content, { mode });
  try {
    beforeRename?.();
  } catch (error) {
    removeFileIfExists(tmpPath);
    throw error;
  }
  fs3.renameSync(tmpPath, filePath);
  chmodIfExists(filePath, mode);
}
function createFileExclusive(filePath, content, mode = TASKFOLD_FILE_STORE_FILE_MODE) {
  const dir = path3.dirname(filePath);
  fs3.mkdirSync(dir, { recursive: true });
  try {
    fs3.writeFileSync(filePath, content, { mode, flag: "wx" });
    return true;
  } catch (err) {
    if (err.code === "EEXIST") {
      return false;
    }
    throw err;
  }
}
function removeFileIfExists(filePath) {
  try {
    fs3.unlinkSync(filePath);
    return true;
  } catch (err) {
    if (err.code === "ENOENT") {
      return false;
    }
    throw err;
  }
}
function readFileIfExists(filePath) {
  try {
    return fs3.readFileSync(filePath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      return void 0;
    }
    throw err;
  }
}
function readBufferIfExists(filePath) {
  try {
    return fs3.readFileSync(filePath);
  } catch (err) {
    if (err.code === "ENOENT") {
      return void 0;
    }
    throw err;
  }
}
function listFileNamesSafe(dir) {
  try {
    return fs3.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name);
  } catch (err) {
    if (err.code === "ENOENT") {
      return [];
    }
    throw err;
  }
}
function sanitizeFilenameSegment(segment) {
  const cleaned = segment.replaceAll(/[ -/\\:*?"<>|]/g, " ").replaceAll(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned.slice(0, 120) : "untitled";
}
function filenameIdToken(fileNameWithoutExtension) {
  const separatorIndex = fileNameWithoutExtension.indexOf(" - ");
  return separatorIndex === -1 ? fileNameWithoutExtension : fileNameWithoutExtension.slice(0, separatorIndex);
}
function parseCanonicalOrdinalId(raw) {
  const match = /^([A-Za-z]+)-(\d+)$/.exec(raw.trim());
  if (!match) {
    return void 0;
  }
  return { prefix: match[1].toUpperCase(), number: Number.parseInt(match[2], 10) };
}
function sameEntityId(a, b) {
  const canonicalA = parseCanonicalOrdinalId(a);
  const canonicalB = parseCanonicalOrdinalId(b);
  if (canonicalA && canonicalB) {
    return canonicalA.prefix === canonicalB.prefix && canonicalA.number === canonicalB.number;
  }
  return a === b;
}
var init_file_store_atomic = __esm({
  "../core/src/file-store-atomic.ts"() {
    "use strict";
    init_file_store_paths();
  }
});

// ../core/src/file-store-format.ts
import fs4 from "node:fs";
function readFormatVersion(configPath) {
  const content = readFileIfExists(configPath);
  const match = content === void 0 ? null : FORMAT_VERSION_LINE.exec(content);
  if (!match) {
    return void 0;
  }
  const raw = match[1].replace(/\s#.*$/, "").trim();
  const unquoted = raw.replace(/^(["'])(.*)\1$/, "$2");
  return /^\d+$/.test(unquoted) ? Number(unquoted) : raw;
}
function unsupportedFormatVersion(configPath) {
  const version = readFormatVersion(configPath);
  if (version === void 0 || typeof version === "number" && version <= TASKFOLD_FORMAT_VERSION) {
    return void 0;
  }
  return String(version);
}
function isTaskfoldFormatWritable(configPath) {
  return unsupportedFormatVersion(configPath) === void 0;
}
function assertTaskfoldFormatWritable(configPath) {
  const found = unsupportedFormatVersion(configPath);
  if (found !== void 0) {
    throw new TaskfoldFormatTooNewError(configPath, found);
  }
}
function ensureTaskfoldFormatVersion(configPath) {
  const line = `${FORMAT_VERSION_KEY}: ${TASKFOLD_FORMAT_VERSION}
`;
  if (createFileExclusive(configPath, line)) {
    return;
  }
  const existing = readFileIfExists(configPath) ?? "";
  if (FORMAT_VERSION_LINE.test(existing)) {
    return;
  }
  const separator = existing.length === 0 || existing.endsWith("\n") ? "" : "\n";
  fs4.appendFileSync(configPath, `${separator}${line}`);
}
function upgradeTaskfoldFormatVersion(configPath, assertHeld) {
  assertTaskfoldFormatWritable(configPath);
  if (readFormatVersion(configPath) === TASKFOLD_FORMAT_VERSION) return;
  const existing = readFileIfExists(configPath) ?? "";
  const line = `${FORMAT_VERSION_KEY}: ${TASKFOLD_FORMAT_VERSION}`;
  const content = FORMAT_VERSION_LINE.test(existing) ? existing.replace(FORMAT_VERSION_LINE, (match) => line + (match.match(/\s+#.*$/)?.[0] ?? "")) : `${existing}${existing && !existing.endsWith("\n") ? "\n" : ""}${line}
`;
  writeFileAtomic(configPath, content, void 0, assertHeld);
}
var TASKFOLD_FORMAT_VERSION, FORMAT_VERSION_KEY, FORMAT_VERSION_LINE, TaskfoldFormatTooNewError;
var init_file_store_format = __esm({
  "../core/src/file-store-format.ts"() {
    "use strict";
    init_file_store_atomic();
    TASKFOLD_FORMAT_VERSION = 2;
    FORMAT_VERSION_KEY = "format_version";
    FORMAT_VERSION_LINE = /^format_version:(.*)$/m;
    TaskfoldFormatTooNewError = class extends Error {
      code = "EFORMATTOONEW";
      constructor(configPath, found) {
        super(
          `taskfold file store: ${configPath} \u7684 ${FORMAT_VERSION_KEY} \u662F ${found}\uFF0C\u672C\u7248 Taskfold \u53EA\u652F\u6301\u5230 ${TASKFOLD_FORMAT_VERSION}\u3002\u4E3A\u514D\u5199\u574F\u66F4\u65B0\u683C\u5F0F\u7684\u6570\u636E\uFF0C\u5DF2\u8F6C\u4E3A\u53EA\u8BFB\uFF0C\u5199\u5165\u4E00\u5F8B\u62D2\u7EDD\u3002\u8BF7\u628A Taskfold\uFF08CLI\u3001VS Code \u6269\u5C55\u3001OpenClaw \u63D2\u4EF6\uFF09\u5347\u7EA7\u5230\u652F\u6301\u8BE5\u683C\u5F0F\u7684\u7248\u672C\u3002`
        );
        this.name = "TaskfoldFormatTooNewError";
      }
    };
  }
});

// ../../node_modules/graceful-fs/polyfills.js
var require_polyfills = __commonJS({
  "../../node_modules/graceful-fs/polyfills.js"(exports, module) {
    var constants = __require("constants");
    var origCwd = process.cwd;
    var cwd = null;
    var platform = process.env.GRACEFUL_FS_PLATFORM || process.platform;
    process.cwd = function() {
      if (!cwd)
        cwd = origCwd.call(process);
      return cwd;
    };
    try {
      process.cwd();
    } catch (er) {
    }
    if (typeof process.chdir === "function") {
      chdir = process.chdir;
      process.chdir = function(d) {
        cwd = null;
        chdir.call(process, d);
      };
      if (Object.setPrototypeOf) Object.setPrototypeOf(process.chdir, chdir);
    }
    var chdir;
    module.exports = patch;
    function patch(fs14) {
      if (constants.hasOwnProperty("O_SYMLINK") && process.version.match(/^v0\.6\.[0-2]|^v0\.5\./)) {
        patchLchmod(fs14);
      }
      if (!fs14.lutimes) {
        patchLutimes(fs14);
      }
      fs14.chown = chownFix(fs14.chown);
      fs14.fchown = chownFix(fs14.fchown);
      fs14.lchown = chownFix(fs14.lchown);
      fs14.chmod = chmodFix(fs14.chmod);
      fs14.fchmod = chmodFix(fs14.fchmod);
      fs14.lchmod = chmodFix(fs14.lchmod);
      fs14.chownSync = chownFixSync(fs14.chownSync);
      fs14.fchownSync = chownFixSync(fs14.fchownSync);
      fs14.lchownSync = chownFixSync(fs14.lchownSync);
      fs14.chmodSync = chmodFixSync(fs14.chmodSync);
      fs14.fchmodSync = chmodFixSync(fs14.fchmodSync);
      fs14.lchmodSync = chmodFixSync(fs14.lchmodSync);
      fs14.stat = statFix(fs14.stat);
      fs14.fstat = statFix(fs14.fstat);
      fs14.lstat = statFix(fs14.lstat);
      fs14.statSync = statFixSync(fs14.statSync);
      fs14.fstatSync = statFixSync(fs14.fstatSync);
      fs14.lstatSync = statFixSync(fs14.lstatSync);
      if (fs14.chmod && !fs14.lchmod) {
        fs14.lchmod = function(path21, mode, cb) {
          if (cb) process.nextTick(cb);
        };
        fs14.lchmodSync = function() {
        };
      }
      if (fs14.chown && !fs14.lchown) {
        fs14.lchown = function(path21, uid, gid, cb) {
          if (cb) process.nextTick(cb);
        };
        fs14.lchownSync = function() {
        };
      }
      if (platform === "win32") {
        fs14.rename = typeof fs14.rename !== "function" ? fs14.rename : (function(fs$rename) {
          function rename(from, to, cb) {
            var start = Date.now();
            var backoff = 0;
            fs$rename(from, to, function CB(er) {
              if (er && (er.code === "EACCES" || er.code === "EPERM" || er.code === "EBUSY") && Date.now() - start < 6e4) {
                setTimeout(function() {
                  fs14.stat(to, function(stater, st) {
                    if (stater && stater.code === "ENOENT")
                      fs$rename(from, to, CB);
                    else
                      cb(er);
                  });
                }, backoff);
                if (backoff < 100)
                  backoff += 10;
                return;
              }
              if (cb) cb(er);
            });
          }
          if (Object.setPrototypeOf) Object.setPrototypeOf(rename, fs$rename);
          return rename;
        })(fs14.rename);
      }
      fs14.read = typeof fs14.read !== "function" ? fs14.read : (function(fs$read) {
        function read(fd, buffer, offset, length, position, callback_) {
          var callback;
          if (callback_ && typeof callback_ === "function") {
            var eagCounter = 0;
            callback = function(er, _, __) {
              if (er && er.code === "EAGAIN" && eagCounter < 10) {
                eagCounter++;
                return fs$read.call(fs14, fd, buffer, offset, length, position, callback);
              }
              callback_.apply(this, arguments);
            };
          }
          return fs$read.call(fs14, fd, buffer, offset, length, position, callback);
        }
        if (Object.setPrototypeOf) Object.setPrototypeOf(read, fs$read);
        return read;
      })(fs14.read);
      fs14.readSync = typeof fs14.readSync !== "function" ? fs14.readSync : /* @__PURE__ */ (function(fs$readSync) {
        return function(fd, buffer, offset, length, position) {
          var eagCounter = 0;
          while (true) {
            try {
              return fs$readSync.call(fs14, fd, buffer, offset, length, position);
            } catch (er) {
              if (er.code === "EAGAIN" && eagCounter < 10) {
                eagCounter++;
                continue;
              }
              throw er;
            }
          }
        };
      })(fs14.readSync);
      function patchLchmod(fs15) {
        fs15.lchmod = function(path21, mode, callback) {
          fs15.open(
            path21,
            constants.O_WRONLY | constants.O_SYMLINK,
            mode,
            function(err, fd) {
              if (err) {
                if (callback) callback(err);
                return;
              }
              fs15.fchmod(fd, mode, function(err2) {
                fs15.close(fd, function(err22) {
                  if (callback) callback(err2 || err22);
                });
              });
            }
          );
        };
        fs15.lchmodSync = function(path21, mode) {
          var fd = fs15.openSync(path21, constants.O_WRONLY | constants.O_SYMLINK, mode);
          var threw = true;
          var ret;
          try {
            ret = fs15.fchmodSync(fd, mode);
            threw = false;
          } finally {
            if (threw) {
              try {
                fs15.closeSync(fd);
              } catch (er) {
              }
            } else {
              fs15.closeSync(fd);
            }
          }
          return ret;
        };
      }
      function patchLutimes(fs15) {
        if (constants.hasOwnProperty("O_SYMLINK") && fs15.futimes) {
          fs15.lutimes = function(path21, at, mt, cb) {
            fs15.open(path21, constants.O_SYMLINK, function(er, fd) {
              if (er) {
                if (cb) cb(er);
                return;
              }
              fs15.futimes(fd, at, mt, function(er2) {
                fs15.close(fd, function(er22) {
                  if (cb) cb(er2 || er22);
                });
              });
            });
          };
          fs15.lutimesSync = function(path21, at, mt) {
            var fd = fs15.openSync(path21, constants.O_SYMLINK);
            var ret;
            var threw = true;
            try {
              ret = fs15.futimesSync(fd, at, mt);
              threw = false;
            } finally {
              if (threw) {
                try {
                  fs15.closeSync(fd);
                } catch (er) {
                }
              } else {
                fs15.closeSync(fd);
              }
            }
            return ret;
          };
        } else if (fs15.futimes) {
          fs15.lutimes = function(_a, _b, _c, cb) {
            if (cb) process.nextTick(cb);
          };
          fs15.lutimesSync = function() {
          };
        }
      }
      function chmodFix(orig) {
        if (!orig) return orig;
        return function(target, mode, cb) {
          return orig.call(fs14, target, mode, function(er) {
            if (chownErOk(er)) er = null;
            if (cb) cb.apply(this, arguments);
          });
        };
      }
      function chmodFixSync(orig) {
        if (!orig) return orig;
        return function(target, mode) {
          try {
            return orig.call(fs14, target, mode);
          } catch (er) {
            if (!chownErOk(er)) throw er;
          }
        };
      }
      function chownFix(orig) {
        if (!orig) return orig;
        return function(target, uid, gid, cb) {
          return orig.call(fs14, target, uid, gid, function(er) {
            if (chownErOk(er)) er = null;
            if (cb) cb.apply(this, arguments);
          });
        };
      }
      function chownFixSync(orig) {
        if (!orig) return orig;
        return function(target, uid, gid) {
          try {
            return orig.call(fs14, target, uid, gid);
          } catch (er) {
            if (!chownErOk(er)) throw er;
          }
        };
      }
      function statFix(orig) {
        if (!orig) return orig;
        return function(target, options, cb) {
          if (typeof options === "function") {
            cb = options;
            options = null;
          }
          function callback(er, stats) {
            if (stats) {
              if (stats.uid < 0) stats.uid += 4294967296;
              if (stats.gid < 0) stats.gid += 4294967296;
            }
            if (cb) cb.apply(this, arguments);
          }
          return options ? orig.call(fs14, target, options, callback) : orig.call(fs14, target, callback);
        };
      }
      function statFixSync(orig) {
        if (!orig) return orig;
        return function(target, options) {
          var stats = options ? orig.call(fs14, target, options) : orig.call(fs14, target);
          if (stats) {
            if (stats.uid < 0) stats.uid += 4294967296;
            if (stats.gid < 0) stats.gid += 4294967296;
          }
          return stats;
        };
      }
      function chownErOk(er) {
        if (!er)
          return true;
        if (er.code === "ENOSYS")
          return true;
        var nonroot = !process.getuid || process.getuid() !== 0;
        if (nonroot) {
          if (er.code === "EINVAL" || er.code === "EPERM")
            return true;
        }
        return false;
      }
    }
  }
});

// ../../node_modules/graceful-fs/legacy-streams.js
var require_legacy_streams = __commonJS({
  "../../node_modules/graceful-fs/legacy-streams.js"(exports, module) {
    var Stream = __require("stream").Stream;
    module.exports = legacy;
    function legacy(fs14) {
      return {
        ReadStream,
        WriteStream
      };
      function ReadStream(path21, options) {
        if (!(this instanceof ReadStream)) return new ReadStream(path21, options);
        Stream.call(this);
        var self = this;
        this.path = path21;
        this.fd = null;
        this.readable = true;
        this.paused = false;
        this.flags = "r";
        this.mode = 438;
        this.bufferSize = 64 * 1024;
        options = options || {};
        var keys = Object.keys(options);
        for (var index = 0, length = keys.length; index < length; index++) {
          var key = keys[index];
          this[key] = options[key];
        }
        if (this.encoding) this.setEncoding(this.encoding);
        if (this.start !== void 0) {
          if ("number" !== typeof this.start) {
            throw TypeError("start must be a Number");
          }
          if (this.end === void 0) {
            this.end = Infinity;
          } else if ("number" !== typeof this.end) {
            throw TypeError("end must be a Number");
          }
          if (this.start > this.end) {
            throw new Error("start must be <= end");
          }
          this.pos = this.start;
        }
        if (this.fd !== null) {
          process.nextTick(function() {
            self._read();
          });
          return;
        }
        fs14.open(this.path, this.flags, this.mode, function(err, fd) {
          if (err) {
            self.emit("error", err);
            self.readable = false;
            return;
          }
          self.fd = fd;
          self.emit("open", fd);
          self._read();
        });
      }
      function WriteStream(path21, options) {
        if (!(this instanceof WriteStream)) return new WriteStream(path21, options);
        Stream.call(this);
        this.path = path21;
        this.fd = null;
        this.writable = true;
        this.flags = "w";
        this.encoding = "binary";
        this.mode = 438;
        this.bytesWritten = 0;
        options = options || {};
        var keys = Object.keys(options);
        for (var index = 0, length = keys.length; index < length; index++) {
          var key = keys[index];
          this[key] = options[key];
        }
        if (this.start !== void 0) {
          if ("number" !== typeof this.start) {
            throw TypeError("start must be a Number");
          }
          if (this.start < 0) {
            throw new Error("start must be >= zero");
          }
          this.pos = this.start;
        }
        this.busy = false;
        this._queue = [];
        if (this.fd === null) {
          this._open = fs14.open;
          this._queue.push([this._open, this.path, this.flags, this.mode, void 0]);
          this.flush();
        }
      }
    }
  }
});

// ../../node_modules/graceful-fs/clone.js
var require_clone = __commonJS({
  "../../node_modules/graceful-fs/clone.js"(exports, module) {
    "use strict";
    module.exports = clone;
    var getPrototypeOf = Object.getPrototypeOf || function(obj) {
      return obj.__proto__;
    };
    function clone(obj) {
      if (obj === null || typeof obj !== "object")
        return obj;
      if (obj instanceof Object)
        var copy = { __proto__: getPrototypeOf(obj) };
      else
        var copy = /* @__PURE__ */ Object.create(null);
      Object.getOwnPropertyNames(obj).forEach(function(key) {
        Object.defineProperty(copy, key, Object.getOwnPropertyDescriptor(obj, key));
      });
      return copy;
    }
  }
});

// ../../node_modules/graceful-fs/graceful-fs.js
var require_graceful_fs = __commonJS({
  "../../node_modules/graceful-fs/graceful-fs.js"(exports, module) {
    var fs14 = __require("fs");
    var polyfills = require_polyfills();
    var legacy = require_legacy_streams();
    var clone = require_clone();
    var util = __require("util");
    var gracefulQueue;
    var previousSymbol;
    if (typeof Symbol === "function" && typeof Symbol.for === "function") {
      gracefulQueue = Symbol.for("graceful-fs.queue");
      previousSymbol = Symbol.for("graceful-fs.previous");
    } else {
      gracefulQueue = "___graceful-fs.queue";
      previousSymbol = "___graceful-fs.previous";
    }
    function noop() {
    }
    function publishQueue(context, queue2) {
      Object.defineProperty(context, gracefulQueue, {
        get: function() {
          return queue2;
        }
      });
    }
    var debug = noop;
    if (util.debuglog)
      debug = util.debuglog("gfs4");
    else if (/\bgfs4\b/i.test(process.env.NODE_DEBUG || ""))
      debug = function() {
        var m = util.format.apply(util, arguments);
        m = "GFS4: " + m.split(/\n/).join("\nGFS4: ");
        console.error(m);
      };
    if (!fs14[gracefulQueue]) {
      queue = global[gracefulQueue] || [];
      publishQueue(fs14, queue);
      fs14.close = (function(fs$close) {
        function close(fd, cb) {
          return fs$close.call(fs14, fd, function(err) {
            if (!err) {
              resetQueue();
            }
            if (typeof cb === "function")
              cb.apply(this, arguments);
          });
        }
        Object.defineProperty(close, previousSymbol, {
          value: fs$close
        });
        return close;
      })(fs14.close);
      fs14.closeSync = (function(fs$closeSync) {
        function closeSync(fd) {
          fs$closeSync.apply(fs14, arguments);
          resetQueue();
        }
        Object.defineProperty(closeSync, previousSymbol, {
          value: fs$closeSync
        });
        return closeSync;
      })(fs14.closeSync);
      if (/\bgfs4\b/i.test(process.env.NODE_DEBUG || "")) {
        process.on("exit", function() {
          debug(fs14[gracefulQueue]);
          __require("assert").equal(fs14[gracefulQueue].length, 0);
        });
      }
    }
    var queue;
    if (!global[gracefulQueue]) {
      publishQueue(global, fs14[gracefulQueue]);
    }
    module.exports = patch(clone(fs14));
    if (process.env.TEST_GRACEFUL_FS_GLOBAL_PATCH && !fs14.__patched) {
      module.exports = patch(fs14);
      fs14.__patched = true;
    }
    function patch(fs15) {
      polyfills(fs15);
      fs15.gracefulify = patch;
      fs15.createReadStream = createReadStream;
      fs15.createWriteStream = createWriteStream;
      var fs$readFile = fs15.readFile;
      fs15.readFile = readFile;
      function readFile(path21, options, cb) {
        if (typeof options === "function")
          cb = options, options = null;
        return go$readFile(path21, options, cb);
        function go$readFile(path22, options2, cb2, startTime) {
          return fs$readFile(path22, options2, function(err) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$readFile, [path22, options2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$writeFile = fs15.writeFile;
      fs15.writeFile = writeFile;
      function writeFile(path21, data, options, cb) {
        if (typeof options === "function")
          cb = options, options = null;
        return go$writeFile(path21, data, options, cb);
        function go$writeFile(path22, data2, options2, cb2, startTime) {
          return fs$writeFile(path22, data2, options2, function(err) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$writeFile, [path22, data2, options2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$appendFile = fs15.appendFile;
      if (fs$appendFile)
        fs15.appendFile = appendFile;
      function appendFile(path21, data, options, cb) {
        if (typeof options === "function")
          cb = options, options = null;
        return go$appendFile(path21, data, options, cb);
        function go$appendFile(path22, data2, options2, cb2, startTime) {
          return fs$appendFile(path22, data2, options2, function(err) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$appendFile, [path22, data2, options2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$copyFile = fs15.copyFile;
      if (fs$copyFile)
        fs15.copyFile = copyFile;
      function copyFile(src, dest, flags, cb) {
        if (typeof flags === "function") {
          cb = flags;
          flags = 0;
        }
        return go$copyFile(src, dest, flags, cb);
        function go$copyFile(src2, dest2, flags2, cb2, startTime) {
          return fs$copyFile(src2, dest2, flags2, function(err) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$copyFile, [src2, dest2, flags2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$readdir = fs15.readdir;
      fs15.readdir = readdir;
      var noReaddirOptionVersions = /^v[0-5]\./;
      function readdir(path21, options, cb) {
        if (typeof options === "function")
          cb = options, options = null;
        var go$readdir = noReaddirOptionVersions.test(process.version) ? function go$readdir2(path22, options2, cb2, startTime) {
          return fs$readdir(path22, fs$readdirCallback(
            path22,
            options2,
            cb2,
            startTime
          ));
        } : function go$readdir2(path22, options2, cb2, startTime) {
          return fs$readdir(path22, options2, fs$readdirCallback(
            path22,
            options2,
            cb2,
            startTime
          ));
        };
        return go$readdir(path21, options, cb);
        function fs$readdirCallback(path22, options2, cb2, startTime) {
          return function(err, files) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([
                go$readdir,
                [path22, options2, cb2],
                err,
                startTime || Date.now(),
                Date.now()
              ]);
            else {
              if (files && files.sort)
                files.sort();
              if (typeof cb2 === "function")
                cb2.call(this, err, files);
            }
          };
        }
      }
      if (process.version.substr(0, 4) === "v0.8") {
        var legStreams = legacy(fs15);
        ReadStream = legStreams.ReadStream;
        WriteStream = legStreams.WriteStream;
      }
      var fs$ReadStream = fs15.ReadStream;
      if (fs$ReadStream) {
        ReadStream.prototype = Object.create(fs$ReadStream.prototype);
        ReadStream.prototype.open = ReadStream$open;
      }
      var fs$WriteStream = fs15.WriteStream;
      if (fs$WriteStream) {
        WriteStream.prototype = Object.create(fs$WriteStream.prototype);
        WriteStream.prototype.open = WriteStream$open;
      }
      Object.defineProperty(fs15, "ReadStream", {
        get: function() {
          return ReadStream;
        },
        set: function(val) {
          ReadStream = val;
        },
        enumerable: true,
        configurable: true
      });
      Object.defineProperty(fs15, "WriteStream", {
        get: function() {
          return WriteStream;
        },
        set: function(val) {
          WriteStream = val;
        },
        enumerable: true,
        configurable: true
      });
      var FileReadStream = ReadStream;
      Object.defineProperty(fs15, "FileReadStream", {
        get: function() {
          return FileReadStream;
        },
        set: function(val) {
          FileReadStream = val;
        },
        enumerable: true,
        configurable: true
      });
      var FileWriteStream = WriteStream;
      Object.defineProperty(fs15, "FileWriteStream", {
        get: function() {
          return FileWriteStream;
        },
        set: function(val) {
          FileWriteStream = val;
        },
        enumerable: true,
        configurable: true
      });
      function ReadStream(path21, options) {
        if (this instanceof ReadStream)
          return fs$ReadStream.apply(this, arguments), this;
        else
          return ReadStream.apply(Object.create(ReadStream.prototype), arguments);
      }
      function ReadStream$open() {
        var that = this;
        open(that.path, that.flags, that.mode, function(err, fd) {
          if (err) {
            if (that.autoClose)
              that.destroy();
            that.emit("error", err);
          } else {
            that.fd = fd;
            that.emit("open", fd);
            that.read();
          }
        });
      }
      function WriteStream(path21, options) {
        if (this instanceof WriteStream)
          return fs$WriteStream.apply(this, arguments), this;
        else
          return WriteStream.apply(Object.create(WriteStream.prototype), arguments);
      }
      function WriteStream$open() {
        var that = this;
        open(that.path, that.flags, that.mode, function(err, fd) {
          if (err) {
            that.destroy();
            that.emit("error", err);
          } else {
            that.fd = fd;
            that.emit("open", fd);
          }
        });
      }
      function createReadStream(path21, options) {
        return new fs15.ReadStream(path21, options);
      }
      function createWriteStream(path21, options) {
        return new fs15.WriteStream(path21, options);
      }
      var fs$open = fs15.open;
      fs15.open = open;
      function open(path21, flags, mode, cb) {
        if (typeof mode === "function")
          cb = mode, mode = null;
        return go$open(path21, flags, mode, cb);
        function go$open(path22, flags2, mode2, cb2, startTime) {
          return fs$open(path22, flags2, mode2, function(err, fd) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$open, [path22, flags2, mode2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      return fs15;
    }
    function enqueue(elem) {
      debug("ENQUEUE", elem[0].name, elem[1]);
      fs14[gracefulQueue].push(elem);
      retry();
    }
    var retryTimer;
    function resetQueue() {
      var now = Date.now();
      for (var i = 0; i < fs14[gracefulQueue].length; ++i) {
        if (fs14[gracefulQueue][i].length > 2) {
          fs14[gracefulQueue][i][3] = now;
          fs14[gracefulQueue][i][4] = now;
        }
      }
      retry();
    }
    function retry() {
      clearTimeout(retryTimer);
      retryTimer = void 0;
      if (fs14[gracefulQueue].length === 0)
        return;
      var elem = fs14[gracefulQueue].shift();
      var fn = elem[0];
      var args = elem[1];
      var err = elem[2];
      var startTime = elem[3];
      var lastTime = elem[4];
      if (startTime === void 0) {
        debug("RETRY", fn.name, args);
        fn.apply(null, args);
      } else if (Date.now() - startTime >= 6e4) {
        debug("TIMEOUT", fn.name, args);
        var cb = args.pop();
        if (typeof cb === "function")
          cb.call(null, err);
      } else {
        var sinceAttempt = Date.now() - lastTime;
        var sinceStart = Math.max(lastTime - startTime, 1);
        var desiredDelay = Math.min(sinceStart * 1.2, 100);
        if (sinceAttempt >= desiredDelay) {
          debug("RETRY", fn.name, args);
          fn.apply(null, args.concat([startTime]));
        } else {
          fs14[gracefulQueue].push(elem);
        }
      }
      if (retryTimer === void 0) {
        retryTimer = setTimeout(retry, 0);
      }
    }
  }
});

// ../../node_modules/proper-lockfile/node_modules/retry/lib/retry_operation.js
var require_retry_operation = __commonJS({
  "../../node_modules/proper-lockfile/node_modules/retry/lib/retry_operation.js"(exports, module) {
    function RetryOperation(timeouts, options) {
      if (typeof options === "boolean") {
        options = { forever: options };
      }
      this._originalTimeouts = JSON.parse(JSON.stringify(timeouts));
      this._timeouts = timeouts;
      this._options = options || {};
      this._maxRetryTime = options && options.maxRetryTime || Infinity;
      this._fn = null;
      this._errors = [];
      this._attempts = 1;
      this._operationTimeout = null;
      this._operationTimeoutCb = null;
      this._timeout = null;
      this._operationStart = null;
      if (this._options.forever) {
        this._cachedTimeouts = this._timeouts.slice(0);
      }
    }
    module.exports = RetryOperation;
    RetryOperation.prototype.reset = function() {
      this._attempts = 1;
      this._timeouts = this._originalTimeouts;
    };
    RetryOperation.prototype.stop = function() {
      if (this._timeout) {
        clearTimeout(this._timeout);
      }
      this._timeouts = [];
      this._cachedTimeouts = null;
    };
    RetryOperation.prototype.retry = function(err) {
      if (this._timeout) {
        clearTimeout(this._timeout);
      }
      if (!err) {
        return false;
      }
      var currentTime = (/* @__PURE__ */ new Date()).getTime();
      if (err && currentTime - this._operationStart >= this._maxRetryTime) {
        this._errors.unshift(new Error("RetryOperation timeout occurred"));
        return false;
      }
      this._errors.push(err);
      var timeout = this._timeouts.shift();
      if (timeout === void 0) {
        if (this._cachedTimeouts) {
          this._errors.splice(this._errors.length - 1, this._errors.length);
          this._timeouts = this._cachedTimeouts.slice(0);
          timeout = this._timeouts.shift();
        } else {
          return false;
        }
      }
      var self = this;
      var timer = setTimeout(function() {
        self._attempts++;
        if (self._operationTimeoutCb) {
          self._timeout = setTimeout(function() {
            self._operationTimeoutCb(self._attempts);
          }, self._operationTimeout);
          if (self._options.unref) {
            self._timeout.unref();
          }
        }
        self._fn(self._attempts);
      }, timeout);
      if (this._options.unref) {
        timer.unref();
      }
      return true;
    };
    RetryOperation.prototype.attempt = function(fn, timeoutOps) {
      this._fn = fn;
      if (timeoutOps) {
        if (timeoutOps.timeout) {
          this._operationTimeout = timeoutOps.timeout;
        }
        if (timeoutOps.cb) {
          this._operationTimeoutCb = timeoutOps.cb;
        }
      }
      var self = this;
      if (this._operationTimeoutCb) {
        this._timeout = setTimeout(function() {
          self._operationTimeoutCb();
        }, self._operationTimeout);
      }
      this._operationStart = (/* @__PURE__ */ new Date()).getTime();
      this._fn(this._attempts);
    };
    RetryOperation.prototype.try = function(fn) {
      console.log("Using RetryOperation.try() is deprecated");
      this.attempt(fn);
    };
    RetryOperation.prototype.start = function(fn) {
      console.log("Using RetryOperation.start() is deprecated");
      this.attempt(fn);
    };
    RetryOperation.prototype.start = RetryOperation.prototype.try;
    RetryOperation.prototype.errors = function() {
      return this._errors;
    };
    RetryOperation.prototype.attempts = function() {
      return this._attempts;
    };
    RetryOperation.prototype.mainError = function() {
      if (this._errors.length === 0) {
        return null;
      }
      var counts = {};
      var mainError = null;
      var mainErrorCount = 0;
      for (var i = 0; i < this._errors.length; i++) {
        var error = this._errors[i];
        var message = error.message;
        var count = (counts[message] || 0) + 1;
        counts[message] = count;
        if (count >= mainErrorCount) {
          mainError = error;
          mainErrorCount = count;
        }
      }
      return mainError;
    };
  }
});

// ../../node_modules/proper-lockfile/node_modules/retry/lib/retry.js
var require_retry = __commonJS({
  "../../node_modules/proper-lockfile/node_modules/retry/lib/retry.js"(exports) {
    var RetryOperation = require_retry_operation();
    exports.operation = function(options) {
      var timeouts = exports.timeouts(options);
      return new RetryOperation(timeouts, {
        forever: options && options.forever,
        unref: options && options.unref,
        maxRetryTime: options && options.maxRetryTime
      });
    };
    exports.timeouts = function(options) {
      if (options instanceof Array) {
        return [].concat(options);
      }
      var opts = {
        retries: 10,
        factor: 2,
        minTimeout: 1 * 1e3,
        maxTimeout: Infinity,
        randomize: false
      };
      for (var key in options) {
        opts[key] = options[key];
      }
      if (opts.minTimeout > opts.maxTimeout) {
        throw new Error("minTimeout is greater than maxTimeout");
      }
      var timeouts = [];
      for (var i = 0; i < opts.retries; i++) {
        timeouts.push(this.createTimeout(i, opts));
      }
      if (options && options.forever && !timeouts.length) {
        timeouts.push(this.createTimeout(i, opts));
      }
      timeouts.sort(function(a, b) {
        return a - b;
      });
      return timeouts;
    };
    exports.createTimeout = function(attempt, opts) {
      var random = opts.randomize ? Math.random() + 1 : 1;
      var timeout = Math.round(random * opts.minTimeout * Math.pow(opts.factor, attempt));
      timeout = Math.min(timeout, opts.maxTimeout);
      return timeout;
    };
    exports.wrap = function(obj, options, methods) {
      if (options instanceof Array) {
        methods = options;
        options = null;
      }
      if (!methods) {
        methods = [];
        for (var key in obj) {
          if (typeof obj[key] === "function") {
            methods.push(key);
          }
        }
      }
      for (var i = 0; i < methods.length; i++) {
        var method = methods[i];
        var original = obj[method];
        obj[method] = function retryWrapper(original2) {
          var op = exports.operation(options);
          var args = Array.prototype.slice.call(arguments, 1);
          var callback = args.pop();
          args.push(function(err) {
            if (op.retry(err)) {
              return;
            }
            if (err) {
              arguments[0] = op.mainError();
            }
            callback.apply(this, arguments);
          });
          op.attempt(function() {
            original2.apply(obj, args);
          });
        }.bind(obj, original);
        obj[method].options = options;
      }
    };
  }
});

// ../../node_modules/proper-lockfile/node_modules/retry/index.js
var require_retry2 = __commonJS({
  "../../node_modules/proper-lockfile/node_modules/retry/index.js"(exports, module) {
    module.exports = require_retry();
  }
});

// ../../node_modules/proper-lockfile/node_modules/signal-exit/signals.js
var require_signals = __commonJS({
  "../../node_modules/proper-lockfile/node_modules/signal-exit/signals.js"(exports, module) {
    module.exports = [
      "SIGABRT",
      "SIGALRM",
      "SIGHUP",
      "SIGINT",
      "SIGTERM"
    ];
    if (process.platform !== "win32") {
      module.exports.push(
        "SIGVTALRM",
        "SIGXCPU",
        "SIGXFSZ",
        "SIGUSR2",
        "SIGTRAP",
        "SIGSYS",
        "SIGQUIT",
        "SIGIOT"
        // should detect profiler and enable/disable accordingly.
        // see #21
        // 'SIGPROF'
      );
    }
    if (process.platform === "linux") {
      module.exports.push(
        "SIGIO",
        "SIGPOLL",
        "SIGPWR",
        "SIGSTKFLT",
        "SIGUNUSED"
      );
    }
  }
});

// ../../node_modules/proper-lockfile/node_modules/signal-exit/index.js
var require_signal_exit = __commonJS({
  "../../node_modules/proper-lockfile/node_modules/signal-exit/index.js"(exports, module) {
    var process2 = global.process;
    var processOk = function(process3) {
      return process3 && typeof process3 === "object" && typeof process3.removeListener === "function" && typeof process3.emit === "function" && typeof process3.reallyExit === "function" && typeof process3.listeners === "function" && typeof process3.kill === "function" && typeof process3.pid === "number" && typeof process3.on === "function";
    };
    if (!processOk(process2)) {
      module.exports = function() {
        return function() {
        };
      };
    } else {
      assert = __require("assert");
      signals = require_signals();
      isWin = /^win/i.test(process2.platform);
      EE = __require("events");
      if (typeof EE !== "function") {
        EE = EE.EventEmitter;
      }
      if (process2.__signal_exit_emitter__) {
        emitter = process2.__signal_exit_emitter__;
      } else {
        emitter = process2.__signal_exit_emitter__ = new EE();
        emitter.count = 0;
        emitter.emitted = {};
      }
      if (!emitter.infinite) {
        emitter.setMaxListeners(Infinity);
        emitter.infinite = true;
      }
      module.exports = function(cb, opts) {
        if (!processOk(global.process)) {
          return function() {
          };
        }
        assert.equal(typeof cb, "function", "a callback must be provided for exit handler");
        if (loaded === false) {
          load();
        }
        var ev = "exit";
        if (opts && opts.alwaysLast) {
          ev = "afterexit";
        }
        var remove = function() {
          emitter.removeListener(ev, cb);
          if (emitter.listeners("exit").length === 0 && emitter.listeners("afterexit").length === 0) {
            unload();
          }
        };
        emitter.on(ev, cb);
        return remove;
      };
      unload = function unload2() {
        if (!loaded || !processOk(global.process)) {
          return;
        }
        loaded = false;
        signals.forEach(function(sig) {
          try {
            process2.removeListener(sig, sigListeners[sig]);
          } catch (er) {
          }
        });
        process2.emit = originalProcessEmit;
        process2.reallyExit = originalProcessReallyExit;
        emitter.count -= 1;
      };
      module.exports.unload = unload;
      emit = function emit2(event, code, signal) {
        if (emitter.emitted[event]) {
          return;
        }
        emitter.emitted[event] = true;
        emitter.emit(event, code, signal);
      };
      sigListeners = {};
      signals.forEach(function(sig) {
        sigListeners[sig] = function listener() {
          if (!processOk(global.process)) {
            return;
          }
          var listeners = process2.listeners(sig);
          if (listeners.length === emitter.count) {
            unload();
            emit("exit", null, sig);
            emit("afterexit", null, sig);
            if (isWin && sig === "SIGHUP") {
              sig = "SIGINT";
            }
            process2.kill(process2.pid, sig);
          }
        };
      });
      module.exports.signals = function() {
        return signals;
      };
      loaded = false;
      load = function load2() {
        if (loaded || !processOk(global.process)) {
          return;
        }
        loaded = true;
        emitter.count += 1;
        signals = signals.filter(function(sig) {
          try {
            process2.on(sig, sigListeners[sig]);
            return true;
          } catch (er) {
            return false;
          }
        });
        process2.emit = processEmit;
        process2.reallyExit = processReallyExit;
      };
      module.exports.load = load;
      originalProcessReallyExit = process2.reallyExit;
      processReallyExit = function processReallyExit2(code) {
        if (!processOk(global.process)) {
          return;
        }
        process2.exitCode = code || /* istanbul ignore next */
        0;
        emit("exit", process2.exitCode, null);
        emit("afterexit", process2.exitCode, null);
        originalProcessReallyExit.call(process2, process2.exitCode);
      };
      originalProcessEmit = process2.emit;
      processEmit = function processEmit2(ev, arg) {
        if (ev === "exit" && processOk(global.process)) {
          if (arg !== void 0) {
            process2.exitCode = arg;
          }
          var ret = originalProcessEmit.apply(this, arguments);
          emit("exit", process2.exitCode, null);
          emit("afterexit", process2.exitCode, null);
          return ret;
        } else {
          return originalProcessEmit.apply(this, arguments);
        }
      };
    }
    var assert;
    var signals;
    var isWin;
    var EE;
    var emitter;
    var unload;
    var emit;
    var sigListeners;
    var loaded;
    var load;
    var originalProcessReallyExit;
    var processReallyExit;
    var originalProcessEmit;
    var processEmit;
  }
});

// ../../node_modules/proper-lockfile/lib/mtime-precision.js
var require_mtime_precision = __commonJS({
  "../../node_modules/proper-lockfile/lib/mtime-precision.js"(exports, module) {
    "use strict";
    var cacheSymbol = Symbol();
    function probe(file, fs14, callback) {
      const cachedPrecision = fs14[cacheSymbol];
      if (cachedPrecision) {
        return fs14.stat(file, (err, stat2) => {
          if (err) {
            return callback(err);
          }
          callback(null, stat2.mtime, cachedPrecision);
        });
      }
      const mtime = new Date(Math.ceil(Date.now() / 1e3) * 1e3 + 5);
      fs14.utimes(file, mtime, mtime, (err) => {
        if (err) {
          return callback(err);
        }
        fs14.stat(file, (err2, stat2) => {
          if (err2) {
            return callback(err2);
          }
          const precision = stat2.mtime.getTime() % 1e3 === 0 ? "s" : "ms";
          Object.defineProperty(fs14, cacheSymbol, { value: precision });
          callback(null, stat2.mtime, precision);
        });
      });
    }
    function getMtime(precision) {
      let now = Date.now();
      if (precision === "s") {
        now = Math.ceil(now / 1e3) * 1e3;
      }
      return new Date(now);
    }
    module.exports.probe = probe;
    module.exports.getMtime = getMtime;
  }
});

// ../../node_modules/proper-lockfile/lib/lockfile.js
var require_lockfile = __commonJS({
  "../../node_modules/proper-lockfile/lib/lockfile.js"(exports, module) {
    "use strict";
    var path21 = __require("path");
    var fs14 = require_graceful_fs();
    var retry = require_retry2();
    var onExit = require_signal_exit();
    var mtimePrecision = require_mtime_precision();
    var locks = {};
    function getLockFile(file, options) {
      return options.lockfilePath || `${file}.lock`;
    }
    function resolveCanonicalPath(file, options, callback) {
      if (!options.realpath) {
        return callback(null, path21.resolve(file));
      }
      options.fs.realpath(file, callback);
    }
    function acquireLock(file, options, callback) {
      const lockfilePath = getLockFile(file, options);
      options.fs.mkdir(lockfilePath, (err) => {
        if (!err) {
          return mtimePrecision.probe(lockfilePath, options.fs, (err2, mtime, mtimePrecision2) => {
            if (err2) {
              options.fs.rmdir(lockfilePath, () => {
              });
              return callback(err2);
            }
            callback(null, mtime, mtimePrecision2);
          });
        }
        if (err.code !== "EEXIST") {
          return callback(err);
        }
        if (options.stale <= 0) {
          return callback(Object.assign(new Error("Lock file is already being held"), { code: "ELOCKED", file }));
        }
        options.fs.stat(lockfilePath, (err2, stat2) => {
          if (err2) {
            if (err2.code === "ENOENT") {
              return acquireLock(file, { ...options, stale: 0 }, callback);
            }
            return callback(err2);
          }
          if (!isLockStale(stat2, options)) {
            return callback(Object.assign(new Error("Lock file is already being held"), { code: "ELOCKED", file }));
          }
          removeLock(file, options, (err3) => {
            if (err3) {
              return callback(err3);
            }
            acquireLock(file, { ...options, stale: 0 }, callback);
          });
        });
      });
    }
    function isLockStale(stat2, options) {
      return stat2.mtime.getTime() < Date.now() - options.stale;
    }
    function removeLock(file, options, callback) {
      options.fs.rmdir(getLockFile(file, options), (err) => {
        if (err && err.code !== "ENOENT") {
          return callback(err);
        }
        callback();
      });
    }
    function updateLock(file, options) {
      const lock2 = locks[file];
      if (lock2.updateTimeout) {
        return;
      }
      lock2.updateDelay = lock2.updateDelay || options.update;
      lock2.updateTimeout = setTimeout(() => {
        lock2.updateTimeout = null;
        options.fs.stat(lock2.lockfilePath, (err, stat2) => {
          const isOverThreshold = lock2.lastUpdate + options.stale < Date.now();
          if (err) {
            if (err.code === "ENOENT" || isOverThreshold) {
              return setLockAsCompromised(file, lock2, Object.assign(err, { code: "ECOMPROMISED" }));
            }
            lock2.updateDelay = 1e3;
            return updateLock(file, options);
          }
          const isMtimeOurs = lock2.mtime.getTime() === stat2.mtime.getTime();
          if (!isMtimeOurs) {
            return setLockAsCompromised(
              file,
              lock2,
              Object.assign(
                new Error("Unable to update lock within the stale threshold"),
                { code: "ECOMPROMISED" }
              )
            );
          }
          const mtime = mtimePrecision.getMtime(lock2.mtimePrecision);
          options.fs.utimes(lock2.lockfilePath, mtime, mtime, (err2) => {
            const isOverThreshold2 = lock2.lastUpdate + options.stale < Date.now();
            if (lock2.released) {
              return;
            }
            if (err2) {
              if (err2.code === "ENOENT" || isOverThreshold2) {
                return setLockAsCompromised(file, lock2, Object.assign(err2, { code: "ECOMPROMISED" }));
              }
              lock2.updateDelay = 1e3;
              return updateLock(file, options);
            }
            lock2.mtime = mtime;
            lock2.lastUpdate = Date.now();
            lock2.updateDelay = null;
            updateLock(file, options);
          });
        });
      }, lock2.updateDelay);
      if (lock2.updateTimeout.unref) {
        lock2.updateTimeout.unref();
      }
    }
    function setLockAsCompromised(file, lock2, err) {
      lock2.released = true;
      if (lock2.updateTimeout) {
        clearTimeout(lock2.updateTimeout);
      }
      if (locks[file] === lock2) {
        delete locks[file];
      }
      lock2.options.onCompromised(err);
    }
    function lock(file, options, callback) {
      options = {
        stale: 1e4,
        update: null,
        realpath: true,
        retries: 0,
        fs: fs14,
        onCompromised: (err) => {
          throw err;
        },
        ...options
      };
      options.retries = options.retries || 0;
      options.retries = typeof options.retries === "number" ? { retries: options.retries } : options.retries;
      options.stale = Math.max(options.stale || 0, 2e3);
      options.update = options.update == null ? options.stale / 2 : options.update || 0;
      options.update = Math.max(Math.min(options.update, options.stale / 2), 1e3);
      resolveCanonicalPath(file, options, (err, file2) => {
        if (err) {
          return callback(err);
        }
        const operation = retry.operation(options.retries);
        operation.attempt(() => {
          acquireLock(file2, options, (err2, mtime, mtimePrecision2) => {
            if (operation.retry(err2)) {
              return;
            }
            if (err2) {
              return callback(operation.mainError());
            }
            const lock2 = locks[file2] = {
              lockfilePath: getLockFile(file2, options),
              mtime,
              mtimePrecision: mtimePrecision2,
              options,
              lastUpdate: Date.now()
            };
            updateLock(file2, options);
            callback(null, (releasedCallback) => {
              if (lock2.released) {
                return releasedCallback && releasedCallback(Object.assign(new Error("Lock is already released"), { code: "ERELEASED" }));
              }
              unlock(file2, { ...options, realpath: false }, releasedCallback);
            });
          });
        });
      });
    }
    function unlock(file, options, callback) {
      options = {
        fs: fs14,
        realpath: true,
        ...options
      };
      resolveCanonicalPath(file, options, (err, file2) => {
        if (err) {
          return callback(err);
        }
        const lock2 = locks[file2];
        if (!lock2) {
          return callback(Object.assign(new Error("Lock is not acquired/owned by you"), { code: "ENOTACQUIRED" }));
        }
        lock2.updateTimeout && clearTimeout(lock2.updateTimeout);
        lock2.released = true;
        delete locks[file2];
        removeLock(file2, options, callback);
      });
    }
    function check(file, options, callback) {
      options = {
        stale: 1e4,
        realpath: true,
        fs: fs14,
        ...options
      };
      options.stale = Math.max(options.stale || 0, 2e3);
      resolveCanonicalPath(file, options, (err, file2) => {
        if (err) {
          return callback(err);
        }
        options.fs.stat(getLockFile(file2, options), (err2, stat2) => {
          if (err2) {
            return err2.code === "ENOENT" ? callback(null, false) : callback(err2);
          }
          return callback(null, !isLockStale(stat2, options));
        });
      });
    }
    function getLocks() {
      return locks;
    }
    onExit(() => {
      for (const file in locks) {
        const options = locks[file].options;
        try {
          options.fs.rmdirSync(getLockFile(file, options));
        } catch (e) {
        }
      }
    });
    module.exports.lock = lock;
    module.exports.unlock = unlock;
    module.exports.check = check;
    module.exports.getLocks = getLocks;
  }
});

// ../../node_modules/proper-lockfile/lib/adapter.js
var require_adapter = __commonJS({
  "../../node_modules/proper-lockfile/lib/adapter.js"(exports, module) {
    "use strict";
    var fs14 = require_graceful_fs();
    function createSyncFs(fs15) {
      const methods = ["mkdir", "realpath", "stat", "rmdir", "utimes"];
      const newFs = { ...fs15 };
      methods.forEach((method) => {
        newFs[method] = (...args) => {
          const callback = args.pop();
          let ret;
          try {
            ret = fs15[`${method}Sync`](...args);
          } catch (err) {
            return callback(err);
          }
          callback(null, ret);
        };
      });
      return newFs;
    }
    function toPromise(method) {
      return (...args) => new Promise((resolve, reject) => {
        args.push((err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        });
        method(...args);
      });
    }
    function toSync(method) {
      return (...args) => {
        let err;
        let result;
        args.push((_err, _result) => {
          err = _err;
          result = _result;
        });
        method(...args);
        if (err) {
          throw err;
        }
        return result;
      };
    }
    function toSyncOptions(options) {
      options = { ...options };
      options.fs = createSyncFs(options.fs || fs14);
      if (typeof options.retries === "number" && options.retries > 0 || options.retries && typeof options.retries.retries === "number" && options.retries.retries > 0) {
        throw Object.assign(new Error("Cannot use retries with the sync api"), { code: "ESYNC" });
      }
      return options;
    }
    module.exports = {
      toPromise,
      toSync,
      toSyncOptions
    };
  }
});

// ../../node_modules/proper-lockfile/index.js
var require_proper_lockfile = __commonJS({
  "../../node_modules/proper-lockfile/index.js"(exports, module) {
    "use strict";
    var lockfile2 = require_lockfile();
    var { toPromise, toSync, toSyncOptions } = require_adapter();
    async function lock(file, options) {
      const release = await toPromise(lockfile2.lock)(file, options);
      return toPromise(release);
    }
    function lockSync(file, options) {
      const release = toSync(lockfile2.lock)(file, toSyncOptions(options));
      return toSync(release);
    }
    function unlock(file, options) {
      return toPromise(lockfile2.unlock)(file, options);
    }
    function unlockSync(file, options) {
      return toSync(lockfile2.unlock)(file, toSyncOptions(options));
    }
    function check(file, options) {
      return toPromise(lockfile2.check)(file, options);
    }
    function checkSync(file, options) {
      return toSync(lockfile2.check)(file, toSyncOptions(options));
    }
    module.exports = lock;
    module.exports.lock = lock;
    module.exports.unlock = unlock;
    module.exports.lockSync = lockSync;
    module.exports.unlockSync = unlockSync;
    module.exports.check = check;
    module.exports.checkSync = checkSync;
  }
});

// ../core/src/file-store-locks.ts
import fs5 from "node:fs";
import path4 from "node:path";
function isTaskfoldLockConflictError(error) {
  return error instanceof TaskfoldLockTimeoutError || error instanceof TaskfoldLockCompromisedError;
}
function taskfoldGlobalLockPath(locksDir) {
  return path4.join(locksDir, "global.lock");
}
function taskfoldCardLockPath(locksDir, cardKey) {
  return path4.join(locksDir, `card-${encodeURIComponent(cardKey)}.lock`);
}
function lockOptions(held) {
  return {
    lockfilePath: held.lockfilePath,
    realpath: false,
    stale: TASKFOLD_LOCK_STALE_MS,
    update: TASKFOLD_LOCK_UPDATE_MS,
    retries: 0,
    // 默认实现是在定时器里 throw，会直接打崩进程。这里只记下来，由 assertHeld 放弃写入。
    onCompromised: () => {
      held.compromised = true;
    }
  };
}
function isLockedError(error) {
  return error?.code === "ELOCKED";
}
function retryDelayMs() {
  return TASKFOLD_LOCK_RETRY_MIN_MS + Math.floor(Math.random() * (TASKFOLD_LOCK_RETRY_MAX_MS - TASKFOLD_LOCK_RETRY_MIN_MS + 1));
}
function guardFor(held) {
  return {
    assertHeld() {
      if (held.compromised) {
        throw new TaskfoldLockCompromisedError(held.lockfilePath);
      }
      let mtimeMs;
      try {
        mtimeMs = fs5.statSync(held.lockfilePath).mtimeMs;
      } catch {
        throw new TaskfoldLockCompromisedError(held.lockfilePath);
      }
      if (mtimeMs !== held.mtimeMs) {
        throw new TaskfoldLockCompromisedError(held.lockfilePath);
      }
    }
  };
}
function newHeldLock(lockfilePath) {
  fs5.mkdirSync(path4.dirname(lockfilePath), { recursive: true });
  return { lockfilePath, mtimeMs: 0, compromised: false };
}
function runSection(held, section) {
  try {
    return { result: section(guardFor(held)), release: true };
  } catch (error) {
    return { error, release: !(error instanceof TaskfoldLockCompromisedError) };
  }
}
async function withTaskfoldFileLock(target, lockfilePath, section) {
  const held = newHeldLock(lockfilePath);
  const deadline = Date.now() + TASKFOLD_LOCK_WAIT_MS;
  let release;
  for (; ; ) {
    try {
      release = await import_proper_lockfile.default.lock(target, lockOptions(held));
      break;
    } catch (error) {
      if (!isLockedError(error)) {
        throw error;
      }
      const delay = retryDelayMs();
      if (Date.now() + delay > deadline) {
        throw new TaskfoldLockTimeoutError(lockfilePath);
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  held.mtimeMs = fs5.statSync(lockfilePath).mtimeMs;
  const outcome = runSection(held, section);
  if (outcome.release) {
    await release().catch(() => {
    });
  }
  if ("error" in outcome) {
    throw outcome.error;
  }
  return outcome.result;
}
function withTaskfoldFileLockSync(target, lockfilePath, section, waitMs = TASKFOLD_LOCK_WAIT_MS) {
  const held = newHeldLock(lockfilePath);
  const deadline = Date.now() + waitMs;
  let release;
  for (; ; ) {
    try {
      release = import_proper_lockfile.default.lockSync(target, lockOptions(held));
      break;
    } catch (error) {
      if (!isLockedError(error)) {
        throw error;
      }
      const delay = retryDelayMs();
      if (Date.now() + delay > deadline) {
        throw new TaskfoldLockTimeoutError(lockfilePath);
      }
      Atomics.wait(syncSleepCell, 0, 0, delay);
    }
  }
  held.mtimeMs = fs5.statSync(lockfilePath).mtimeMs;
  const outcome = runSection(held, section);
  if (outcome.release) {
    try {
      release();
    } catch {
    }
  }
  if ("error" in outcome) {
    throw outcome.error;
  }
  return outcome.result;
}
async function withTaskfoldGlobalLock(locksDir, section) {
  const lockfilePath = taskfoldGlobalLockPath(locksDir);
  return await withTaskfoldFileLock(lockfilePath.slice(0, -".lock".length), lockfilePath, section);
}
function withTaskfoldGlobalLockSync(locksDir, section) {
  const lockfilePath = taskfoldGlobalLockPath(locksDir);
  return withTaskfoldFileLockSync(lockfilePath.slice(0, -".lock".length), lockfilePath, section);
}
function tryWithTaskfoldGlobalLockSync(locksDir, section) {
  const lockfilePath = taskfoldGlobalLockPath(locksDir);
  return withTaskfoldFileLockSync(lockfilePath.slice(0, -".lock".length), lockfilePath, section, 0);
}
async function withTaskfoldCardLock(locksDir, cardKey, cardFilePath, section) {
  return await withTaskfoldFileLock(cardFilePath, taskfoldCardLockPath(locksDir, cardKey), section);
}
function tryWithTaskfoldCardLockSync(locksDir, cardKey, cardFilePath, section) {
  return withTaskfoldFileLockSync(cardFilePath, taskfoldCardLockPath(locksDir, cardKey), section, 0);
}
var import_proper_lockfile, TASKFOLD_LOCK_STALE_MS, TASKFOLD_LOCK_UPDATE_MS, TASKFOLD_LOCK_WAIT_MS, TASKFOLD_LOCK_RETRY_MIN_MS, TASKFOLD_LOCK_RETRY_MAX_MS, TaskfoldLockTimeoutError, TaskfoldLockCompromisedError, syncSleepCell;
var init_file_store_locks = __esm({
  "../core/src/file-store-locks.ts"() {
    "use strict";
    import_proper_lockfile = __toESM(require_proper_lockfile(), 1);
    TASKFOLD_LOCK_STALE_MS = 1e4;
    TASKFOLD_LOCK_UPDATE_MS = TASKFOLD_LOCK_STALE_MS / 2;
    TASKFOLD_LOCK_WAIT_MS = 2e3;
    TASKFOLD_LOCK_RETRY_MIN_MS = 10;
    TASKFOLD_LOCK_RETRY_MAX_MS = 50;
    TaskfoldLockTimeoutError = class extends Error {
      code = "ELOCKTIMEOUT";
      constructor(lockfilePath) {
        super(`taskfold file store: \u7B49\u9501\u8D85\u65F6\uFF08${TASKFOLD_LOCK_WAIT_MS}ms\uFF09\uFF1A${lockfilePath}`);
        this.name = "TaskfoldLockTimeoutError";
      }
    };
    TaskfoldLockCompromisedError = class extends Error {
      code = "ECOMPROMISED";
      constructor(lockfilePath) {
        super(`taskfold file store: \u9501\u5DF2\u5931\u6548\uFF08\u88AB\u5176\u4ED6\u8FDB\u7A0B\u63A5\u7BA1\uFF09\uFF1A${lockfilePath}`);
        this.name = "TaskfoldLockCompromisedError";
      }
    };
    syncSleepCell = new Int32Array(new SharedArrayBuffer(4));
  }
});

// ../core/src/file-store-change-cursor.ts
import fs6 from "node:fs";
import { randomUUID as randomUUID2 } from "node:crypto";
function parseLines(content) {
  const records = [];
  for (const line of content.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object" && "type" in parsed && (parsed.type === "epoch" || parsed.type === "reserve")) {
        records.push(parsed);
      }
    } catch {
    }
  }
  return records;
}
function readChangeLogRecords(changesLogPath) {
  const content = readFileIfExists(changesLogPath);
  return content ? parseLines(content) : [];
}
function firstEpoch(records) {
  return records.find((record) => record.type === "epoch")?.epoch;
}
function lastCeiling(records) {
  let base = 0;
  for (const record of records) {
    if (record.type === "reserve" && Number.isSafeInteger(record.ceiling) && record.ceiling > 0) {
      base = record.ceiling;
    }
  }
  return base;
}
function epochLine(epoch) {
  return `${JSON.stringify({ type: "epoch", epoch })}
`;
}
function reserveLine(ceiling) {
  return `${JSON.stringify({ type: "reserve", ceiling })}
`;
}
function reserveLocked(changesLogPath, count, guard) {
  const records = readChangeLogRecords(changesLogPath);
  const base = lastCeiling(records);
  const existingEpoch = firstEpoch(records);
  guard.assertHeld();
  if (existingEpoch === void 0 || records.length >= CHANGE_LOG_COMPACT_THRESHOLD) {
    const epoch = existingEpoch ?? randomUUID2();
    writeFileAtomic(
      changesLogPath,
      `${epochLine(epoch)}${reserveLine(base + count)}`,
      TASKFOLD_FILE_STORE_FILE_MODE,
      guard.assertHeld
    );
    return { epoch, base };
  }
  fs6.appendFileSync(changesLogPath, reserveLine(base + count), { mode: TASKFOLD_FILE_STORE_FILE_MODE });
  return { epoch: existingEpoch, base };
}
function ensureFileChangeEpoch(changesLogPath, locksDir, canWrite = true) {
  const existing = firstEpoch(readChangeLogRecords(changesLogPath));
  if (existing !== void 0) {
    return existing;
  }
  if (!canWrite) {
    return randomUUID2();
  }
  return withTaskfoldGlobalLockSync(locksDir, (guard) => {
    const records = readChangeLogRecords(changesLogPath);
    const raced = firstEpoch(records);
    if (raced !== void 0) {
      return raced;
    }
    const epoch = randomUUID2();
    const ceiling = lastCeiling(records);
    guard.assertHeld();
    writeFileAtomic(
      changesLogPath,
      `${epochLine(epoch)}${ceiling > 0 ? reserveLine(ceiling) : ""}`,
      TASKFOLD_FILE_STORE_FILE_MODE,
      guard.assertHeld
    );
    return epoch;
  });
}
function reserveFileChangeRevisions(changesLogPath, count, locksDir) {
  return withTaskfoldGlobalLockSync(locksDir, (guard) => reserveLocked(changesLogPath, count, guard).base);
}
function readFileChangeHead(changesLogPath) {
  const records = readChangeLogRecords(changesLogPath);
  const epoch = firstEpoch(records);
  const revision = lastCeiling(records);
  return epoch !== void 0 && revision > 0 ? { epoch, revision } : void 0;
}
function isAhead(head, seen) {
  return !seen || head.epoch !== seen.epoch || head.revision > seen.revision;
}
function createTaskfoldFileChangeSource(options) {
  const { changesLogPath, locksDir, dataVersion } = options;
  const canWrite = options.canWrite ?? (() => true);
  let seen = readFileChangeHead(changesLogPath);
  let externalDataVersion = dataVersion?.();
  let recordPending = false;
  function recorded({ epoch, base }) {
    recordPending = false;
    seen = { epoch, revision: base + 1 };
    return seen;
  }
  function deferOnLockConflict(error) {
    if (isTaskfoldLockConflictError(error)) {
      recordPending = true;
      return void 0;
    }
    throw error;
  }
  function recordOnce() {
    if (!canWrite()) {
      return void 0;
    }
    try {
      return recorded(tryWithTaskfoldGlobalLockSync(locksDir, (guard) => reserveLocked(changesLogPath, 1, guard)));
    } catch (error) {
      return deferOnLockConflict(error);
    }
  }
  return {
    announce() {
      const head = readFileChangeHead(changesLogPath);
      if (head) {
        seen = head;
        return head;
      }
      return recordOnce();
    },
    async record() {
      if (!canWrite()) {
        return void 0;
      }
      try {
        return recorded(await withTaskfoldGlobalLock(locksDir, (guard) => reserveLocked(changesLogPath, 1, guard)));
      } catch (error) {
        return deferOnLockConflict(error);
      }
    },
    poll() {
      if (dataVersion) {
        const current = dataVersion();
        if (current !== externalDataVersion) {
          externalDataVersion = current;
          recordPending = true;
        }
      }
      if (recordPending) {
        const change = recordOnce();
        if (change) {
          return change;
        }
      }
      const head = readFileChangeHead(changesLogPath);
      if (head && isAhead(head, seen)) {
        seen = head;
        return head;
      }
      return void 0;
    }
  };
}
var CHANGE_LOG_COMPACT_THRESHOLD;
var init_file_store_change_cursor = __esm({
  "../core/src/file-store-change-cursor.ts"() {
    "use strict";
    init_file_store_atomic();
    init_file_store_locks();
    init_file_store_paths();
    CHANGE_LOG_COMPACT_THRESHOLD = 1e3;
  }
});

// ../core/src/sdk-utils.ts
import { timingSafeEqual } from "node:crypto";
function asFiniteNumber(value) {
  return Number.isFinite(value) ? value : void 0;
}
function asDateTimestampMs(value) {
  const number = asFiniteNumber(value);
  if (number === void 0 || number < -MAX_DATE_TIMESTAMP_MS || number > MAX_DATE_TIMESTAMP_MS) {
    return void 0;
  }
  return number;
}
function asPositiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : void 0;
}
function isDateRepresentable(value) {
  return asDateTimestampMs(value) !== void 0;
}
function isFutureDateTimestampMs(value, opts = {}) {
  const timestampMs = asDateTimestampMs(value);
  const nowMs = asDateTimestampMs(opts.nowMs ?? Date.now());
  return timestampMs !== void 0 && nowMs !== void 0 && timestampMs > nowMs;
}
function resolveExpiresAtMsFromDurationMs(value, opts = {}) {
  const durationMs = asPositiveSafeInteger(value);
  if (durationMs === void 0) {
    return void 0;
  }
  const nowMs = asDateTimestampMs(opts.nowMs ?? Date.now());
  const bufferMs = asFiniteNumber(opts.bufferMs ?? 0);
  if (nowMs === void 0 || bufferMs === void 0) {
    return void 0;
  }
  const expiresAt = nowMs + durationMs - bufferMs;
  if (!Number.isSafeInteger(expiresAt) || !isDateRepresentable(expiresAt)) {
    return void 0;
  }
  const minRemainingMs = opts.minRemainingMs;
  if (minRemainingMs === void 0) {
    return expiresAt;
  }
  const minExpiresAt = nowMs + minRemainingMs;
  if (!Number.isSafeInteger(minExpiresAt) || !isDateRepresentable(minExpiresAt)) {
    return expiresAt;
  }
  return Math.max(expiresAt, minExpiresAt);
}
function padSecretBytes(bytes, length) {
  if (bytes.length === length) {
    return bytes;
  }
  const padded = Buffer.alloc(length);
  bytes.copy(padded);
  return padded;
}
function safeEqualSecret(provided, expected) {
  if (typeof provided !== "string" || typeof expected !== "string") {
    return false;
  }
  const providedBytes = Buffer.from(provided, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  const byteLength = Math.max(providedBytes.length, expectedBytes.length);
  if (byteLength === 0) {
    return true;
  }
  return timingSafeEqual(
    padSecretBytes(providedBytes, byteLength),
    padSecretBytes(expectedBytes, byteLength)
  ) && providedBytes.length === expectedBytes.length;
}
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isHighSurrogate(codeUnit) {
  return codeUnit >= 55296 && codeUnit <= 56319;
}
function isLowSurrogate(codeUnit) {
  return codeUnit >= 56320 && codeUnit <= 57343;
}
function sliceUtf16Safe(input, start, end) {
  const len = input.length;
  let from = start < 0 ? Math.max(len + start, 0) : Math.min(start, len);
  let to = end === void 0 ? len : end < 0 ? Math.max(len + end, 0) : Math.min(end, len);
  if (to <= from) {
    return "";
  }
  if (from > 0 && from < len) {
    if (isLowSurrogate(input.charCodeAt(from)) && isHighSurrogate(input.charCodeAt(from - 1))) {
      from += 1;
    }
  }
  if (to > 0 && to < len) {
    if (isHighSurrogate(input.charCodeAt(to - 1)) && isLowSurrogate(input.charCodeAt(to))) {
      to -= 1;
    }
  }
  return input.slice(from, to);
}
function truncateUtf16Safe(input, maxLen) {
  const limit = Math.max(0, Math.floor(maxLen));
  if (input.length <= limit) {
    return input;
  }
  return sliceUtf16Safe(input, 0, limit);
}
function resolveGlobalSingleton(key, create) {
  const globalStore = globalThis;
  if (Object.hasOwn(globalStore, key)) {
    return globalStore[key];
  }
  const value = create();
  globalStore[key] = value;
  return value;
}
var MAX_DATE_TIMESTAMP_MS;
var init_sdk_utils = __esm({
  "../core/src/sdk-utils.ts"() {
    "use strict";
    MAX_DATE_TIMESTAMP_MS = 864e13;
  }
});

// ../core/src/store-constants.ts
function nextTaskfoldCardRevision(current) {
  return Number.isSafeInteger(current) && current > 0 ? current + 1 : TASKFOLD_INITIAL_CARD_REVISION;
}
function isTaskfoldClaimReclaimable(claim, now) {
  return Boolean(claim?.expiresAt && now - claim.expiresAt > CLAIM_RECLAIM_MS);
}
function secondsToDurationMs(seconds) {
  const ms = Math.trunc(seconds) * 1e3;
  return Number.isFinite(ms) ? Math.min(MAX_DATE_TIMESTAMP_MS, Math.max(1, ms)) : MAX_DATE_TIMESTAMP_MS;
}
function addTaskfoldDurationMs(now, durationMs) {
  return resolveExpiresAtMsFromDurationMs(durationMs, { nowMs: now }) ?? MAX_DATE_TIMESTAMP_MS;
}
var POSITION_STEP, MAX_CARDS, MAX_CARD_EVENTS, MAX_CARD_ATTEMPTS, MAX_CARD_COMMENTS, MAX_CARD_LINKS, MAX_CARD_PROOF, MAX_CARD_ARTIFACTS, MAX_CARD_ATTACHMENTS, MAX_ATTACHMENT_ENTRIES, MAX_CARD_WORKER_LOGS, MAX_ATTACHMENT_BYTES, MAX_CARD_DIAGNOSTICS, MAX_CARD_NOTIFICATIONS, MAX_CARD_METADATA_BYTES, DEFAULT_CLAIM_TTL_MS, READY_STRANDED_MS, RUNNING_HEARTBEAT_STALE_MS, BLOCKED_TOO_LONG_MS, CLAIM_RECLAIM_MS, TASKFOLD_INITIAL_CARD_REVISION, TASKFOLD_PROMPT_VERSION;
var init_store_constants = __esm({
  "../core/src/store-constants.ts"() {
    "use strict";
    init_sdk_utils();
    POSITION_STEP = 1e3;
    MAX_CARDS = 2e3;
    MAX_CARD_EVENTS = 50;
    MAX_CARD_ATTEMPTS = 30;
    MAX_CARD_COMMENTS = 50;
    MAX_CARD_LINKS = 50;
    MAX_CARD_PROOF = 40;
    MAX_CARD_ARTIFACTS = 40;
    MAX_CARD_ATTACHMENTS = 20;
    MAX_ATTACHMENT_ENTRIES = MAX_CARDS * (MAX_CARD_ATTACHMENTS + 1);
    MAX_CARD_WORKER_LOGS = 40;
    MAX_ATTACHMENT_BYTES = 256 * 1024;
    MAX_CARD_DIAGNOSTICS = 12;
    MAX_CARD_NOTIFICATIONS = 20;
    MAX_CARD_METADATA_BYTES = 24 * 1024;
    DEFAULT_CLAIM_TTL_MS = 30 * 60 * 1e3;
    READY_STRANDED_MS = 60 * 60 * 1e3;
    RUNNING_HEARTBEAT_STALE_MS = 20 * 60 * 1e3;
    BLOCKED_TOO_LONG_MS = 24 * 60 * 60 * 1e3;
    CLAIM_RECLAIM_MS = 5 * 60 * 1e3;
    TASKFOLD_INITIAL_CARD_REVISION = 1;
    TASKFOLD_PROMPT_VERSION = 2;
  }
});

// ../core/src/file-store-card-runtime.ts
import { createHash } from "node:crypto";
import path5 from "node:path";
function cardRuntimePath(runtimeCardsDir, cardKey) {
  return path5.join(runtimeCardsDir, `${encodeURIComponent(cardKey)}.json`);
}
function hashCardFileContent(content) {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}
function readCardRuntime(filePath) {
  const content = readFileIfExists(filePath);
  if (content === void 0) {
    return void 0;
  }
  try {
    const parsed = JSON.parse(content);
    if (parsed?.version !== 1 || !Number.isSafeInteger(parsed.revision) || typeof parsed.contentHash !== "string" || typeof parsed.fields !== "object" || parsed.fields === null) {
      return void 0;
    }
    return parsed;
  } catch {
    return void 0;
  }
}
function writeCardRuntime(filePath, runtime, beforeRename) {
  writeFileAtomic(filePath, `${JSON.stringify(runtime, null, 2)}
`, void 0, beforeRename);
}
function removeCardRuntime(filePath) {
  removeFileIfExists(filePath);
}
function splitCardRuntime(card) {
  const mdCard = { ...card };
  const fields = {};
  delete mdCard.revision;
  for (const key of TOP_LEVEL_RUNTIME_FIELDS) {
    if (key in mdCard) {
      if (mdCard[key] !== void 0) {
        fields[key] = mdCard[key];
      }
      delete mdCard[key];
    }
  }
  if (card.metadata && "claim" in card.metadata) {
    const { claim, ...metadata } = card.metadata;
    if (claim !== void 0) {
      fields.claim = claim;
    }
    if (Object.keys(metadata).length > 0) {
      mdCard.metadata = metadata;
    } else {
      delete mdCard.metadata;
    }
  }
  return { mdCard, fields };
}
function mergeCardRuntime(parsed, runtime, revision) {
  if (!runtime) {
    return { ...parsed, revision };
  }
  const { mdCard } = splitCardRuntime(parsed);
  const card = { ...mdCard, revision, updatedAt: Math.max(mdCard.updatedAt, runtime.updatedAt ?? 0) };
  const { claim, ...topLevel } = runtime.fields;
  Object.assign(card, topLevel);
  if ("claim" in runtime.fields) {
    card.metadata = { ...card.metadata, claim };
  }
  return card;
}
function resolveCardRuntime(mdContent, parsed, stored) {
  const contentHash = hashCardFileContent(mdContent);
  if (!stored) {
    const legacyRevision = Number.isSafeInteger(parsed.revision) && parsed.revision > 0 ? nextTaskfoldCardRevision(parsed.revision) : TASKFOLD_INITIAL_CARD_REVISION;
    return {
      runtime: { version: 1, revision: legacyRevision, contentHash, fields: splitCardRuntime(parsed).fields },
      changed: true,
      external: true
    };
  }
  if (stored.contentHash !== contentHash) {
    return {
      runtime: { ...stored, revision: nextTaskfoldCardRevision(stored.revision), contentHash },
      changed: true,
      external: true
    };
  }
  return { runtime: stored, changed: false, external: false };
}
var TOP_LEVEL_RUNTIME_FIELDS;
var init_file_store_card_runtime = __esm({
  "../core/src/file-store-card-runtime.ts"() {
    "use strict";
    init_file_store_atomic();
    init_store_constants();
    TOP_LEVEL_RUNTIME_FIELDS = ["sessionKey", "runId", "taskId", "execution", "events"];
  }
});

// ../core/src/contract/index.ts
function isValidTaskfoldBoardId(value) {
  return typeof value === "string" && TASKFOLD_BOARD_ID_PATTERN.test(value);
}
var TASKFOLD_STATUSES, TASKFOLD_PRIORITIES, TASKFOLD_EXECUTION_MODES, TASKFOLD_EXECUTION_STATUSES, TASKFOLD_EVENT_KINDS, TASKFOLD_ATTEMPT_STATUSES, TASKFOLD_LINK_TYPES, TASKFOLD_CARD_KINDS, TASKFOLD_BOARD_GROUP_BY, TASKFOLD_BOARD_SORT_BY, TASKFOLD_BOARD_SORT_DIRECTIONS, TASKFOLD_PROOF_STATUSES, TASKFOLD_TEMPLATE_IDS, TASKFOLD_DIAGNOSTIC_KINDS, TASKFOLD_DIAGNOSTIC_SEVERITIES, TASKFOLD_NOTIFICATION_KINDS, TASKFOLD_MILESTONE_STATES, TASKFOLD_PROJECT_DOCUMENT_SECTIONS, TASKFOLD_PROJECT_DOCUMENT_TYPES, TASKFOLD_DELIVERY_IMPLEMENTATION_STATES, TASKFOLD_DELIVERY_VERIFICATION_STATES, TASKFOLD_DELIVERY_RELEASE_STATES, TASKFOLD_BOARD_ID_PATTERN;
var init_contract = __esm({
  "../core/src/contract/index.ts"() {
    "use strict";
    TASKFOLD_STATUSES = [
      "triage",
      "backlog",
      "todo",
      "scheduled",
      "ready",
      "running",
      "review",
      "blocked",
      "done"
    ];
    TASKFOLD_PRIORITIES = ["low", "normal", "high", "urgent"];
    TASKFOLD_EXECUTION_MODES = ["autonomous", "manual"];
    TASKFOLD_EXECUTION_STATUSES = [
      "idle",
      "running",
      "review",
      "blocked",
      "done"
    ];
    TASKFOLD_EVENT_KINDS = [
      "created",
      "edited",
      "moved",
      "milestone_moved",
      "linked",
      "specified",
      "decomposed",
      "claimed",
      "heartbeat",
      "execution_updated",
      "attempt_started",
      "attempt_updated",
      "comment_added",
      "link_added",
      "proof_added",
      "artifact_added",
      "attachment_added",
      "diagnostic",
      "notification",
      "dispatch",
      "orchestration",
      "protocol_violation",
      "archived",
      "unarchived",
      "stale"
    ];
    TASKFOLD_ATTEMPT_STATUSES = [
      "running",
      "succeeded",
      "failed",
      "blocked",
      "stopped"
    ];
    TASKFOLD_LINK_TYPES = [
      "parent",
      "child",
      "contains",
      "contained_by",
      "blocks",
      "blocked_by",
      "relates_to"
    ];
    TASKFOLD_CARD_KINDS = ["task", "requirement"];
    TASKFOLD_BOARD_GROUP_BY = ["milestone", "requirement", "status"];
    TASKFOLD_BOARD_SORT_BY = ["manual", "priority", "createdAt", "updatedAt"];
    TASKFOLD_BOARD_SORT_DIRECTIONS = ["asc", "desc"];
    TASKFOLD_PROOF_STATUSES = ["passed", "failed", "skipped", "unknown"];
    TASKFOLD_TEMPLATE_IDS = ["bugfix", "docs", "release", "pr_review", "plugin"];
    TASKFOLD_DIAGNOSTIC_KINDS = [
      "stranded_ready",
      "running_without_heartbeat",
      "blocked_too_long",
      "repeated_failures",
      "missing_proof",
      "orphaned_session",
      "archived_but_active"
    ];
    TASKFOLD_DIAGNOSTIC_SEVERITIES = ["warning", "error", "critical"];
    TASKFOLD_NOTIFICATION_KINDS = ["completed", "failed", "stale"];
    TASKFOLD_MILESTONE_STATES = ["active", "completed", "archived"];
    TASKFOLD_PROJECT_DOCUMENT_SECTIONS = [
      "project",
      "codebase",
      "environment",
      "knowledge"
    ];
    TASKFOLD_PROJECT_DOCUMENT_TYPES = [
      "markdown",
      "json",
      "link",
      "path",
      "secret_ref"
    ];
    TASKFOLD_DELIVERY_IMPLEMENTATION_STATES = [
      "not_started",
      "in_progress",
      "code_complete",
      "not_applicable",
      "unknown"
    ];
    TASKFOLD_DELIVERY_VERIFICATION_STATES = [
      "not_started",
      "partial",
      "passed",
      "failed",
      "human_required",
      "not_required",
      "unknown"
    ];
    TASKFOLD_DELIVERY_RELEASE_STATES = [
      "not_started",
      "pending",
      "released",
      "not_required",
      "unknown"
    ];
    TASKFOLD_BOARD_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/;
  }
});

// ../core/src/markdown-card-format.ts
function stringValue(row, key) {
  const value = row[key];
  return typeof value === "string" && value.length > 0 ? value : void 0;
}
function numberValue(row, key) {
  const value = row[key];
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : void 0;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  return void 0;
}
function requiredString(row, key) {
  const value = stringValue(row, key);
  if (!value) {
    throw new Error(`markdown-card-format: \u7F3A\u5C11\u5FC5\u586B\u5B57\u6BB5 "${key}"`);
  }
  return value;
}
function optional(value) {
  return Object.keys(value).length > 0 ? value : void 0;
}
function arrayOfStrings(row, key) {
  const value = row[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item) => typeof item === "string");
}
function unescapeDoubleQuotedYaml(text) {
  return text.replace(/\\(.)/g, (_match, ch) => {
    switch (ch) {
      case "n":
        return "\n";
      case "t":
        return "	";
      case "r":
        return "\r";
      case "0":
        return "\0";
      case "\\":
        return "\\";
      case '"':
        return '"';
      default:
        return ch;
    }
  });
}
function parseYamlScalar(raw) {
  const text = raw.trim();
  if (text.length >= 2 && text[0] === "'" && text[text.length - 1] === "'") {
    return text.slice(1, -1).replace(/''/g, "'");
  }
  if (text.length >= 2 && text[0] === '"' && text[text.length - 1] === '"') {
    return unescapeDoubleQuotedYaml(text.slice(1, -1));
  }
  if (text === "") {
    return "";
  }
  if (YAML_NULL_PATTERN.test(text)) {
    return null;
  }
  if (YAML_BOOL_TRUE_PATTERN.test(text)) {
    return true;
  }
  if (YAML_BOOL_FALSE_PATTERN.test(text)) {
    return false;
  }
  if (YAML_INT_PATTERN.test(text)) {
    return Number(text.replace(/_/g, ""));
  }
  if (YAML_FLOAT_PATTERN.test(text)) {
    return Number(text.replace(/_/g, ""));
  }
  if (YAML_TIMESTAMP_DATE_PATTERN.test(text) || YAML_TIMESTAMP_DATETIME_PATTERN.test(text)) {
    return text;
  }
  return text;
}
function isPlainSafeFirstChar(ch) {
  if (ch === " " || ch === "	") {
    return false;
  }
  return !"-?:,[]{}#&*!|=>'\"%@`".includes(ch);
}
function isPlainSafeChar(ch, prev) {
  if (",[]{}:".includes(ch)) {
    return false;
  }
  if (ch === "#") {
    return prev !== void 0 && prev !== " " && prev !== "	";
  }
  return true;
}
function isPlainYamlScalar(text) {
  if (text.length === 0 || text.includes("\n")) {
    return false;
  }
  const firstChar = text[0] ?? "";
  const lastChar = text[text.length - 1] ?? "";
  if (!isPlainSafeFirstChar(firstChar) || lastChar === " " || lastChar === "	") {
    return false;
  }
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] ?? "";
    const prev = i > 0 ? text[i - 1] : void 0;
    if (!isPlainSafeChar(ch, prev)) {
      return false;
    }
  }
  return true;
}
function isAmbiguousYamlScalar(text) {
  return YAML_NULL_PATTERN.test(text) || YAML_BOOL_TRUE_PATTERN.test(text) || YAML_BOOL_FALSE_PATTERN.test(text) || YAML_INT_PATTERN.test(text) || YAML_FLOAT_PATTERN.test(text) || YAML_TIMESTAMP_DATE_PATTERN.test(text) || YAML_TIMESTAMP_DATETIME_PATTERN.test(text) || YAML_DEPRECATED_BOOLEAN_WORDS.has(text) || YAML_HEX_PATTERN.test(text) || YAML_BINARY_PATTERN.test(text) || YAML_LEADING_ZERO_OCTAL_PATTERN.test(text) || YAML_INF_PATTERN.test(text) || YAML_NAN_PATTERN.test(text) || YAML_SEXAGESIMAL_PATTERN.test(text);
}
function quoteYamlScalar(text) {
  return `'${text.replace(/'/g, "''")}'`;
}
function stringifyYamlScalar(value) {
  if (typeof value === "number") {
    return String(value);
  }
  const normalized2 = value.replace(/\n/g, " ");
  if (!isPlainYamlScalar(normalized2) || isAmbiguousYamlScalar(normalized2)) {
    return quoteYamlScalar(normalized2);
  }
  return normalized2;
}
function stringifyFrontmatterBlock(entries) {
  const lines = [];
  for (const [key, value] of entries) {
    if (value === void 0) {
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(`  - ${stringifyYamlScalar(item)}`);
        }
      }
      continue;
    }
    lines.push(`${key}: ${stringifyYamlScalar(value)}`);
  }
  return lines.join("\n");
}
function parseFrontmatterBlock(text) {
  const lines = text.split("\n");
  const result = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    const match = FRONTMATTER_KEY_LINE_PATTERN.exec(line);
    if (!match) {
      i += 1;
      continue;
    }
    const key = match[1] ?? "";
    const rest = (match[2] ?? "").trim();
    if (rest === "[]") {
      result[key] = [];
      i += 1;
      continue;
    }
    if (rest !== "") {
      result[key] = parseYamlScalar(rest);
      i += 1;
      continue;
    }
    const items = [];
    let j = i + 1;
    while (j < lines.length) {
      const itemMatch = FRONTMATTER_LIST_ITEM_PATTERN.exec(lines[j] ?? "");
      if (!itemMatch) {
        break;
      }
      items.push(parseYamlScalar(itemMatch[1] ?? ""));
      j += 1;
    }
    result[key] = items;
    i = j;
  }
  return result;
}
function splitFrontmatter(markdown) {
  const normalized2 = markdown.replace(/\r\n/g, "\n");
  const lines = normalized2.split("\n");
  if (lines[0] !== "---") {
    throw new Error("markdown-card-format: \u6587\u4EF6\u5FC5\u987B\u4EE5 --- \u5F00\u5934\u7684 frontmatter \u5206\u9694\u7B26\u8D77\u59CB");
  }
  let closeIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === "---") {
      closeIndex = i;
      break;
    }
  }
  if (closeIndex === -1) {
    throw new Error("markdown-card-format: frontmatter \u672A\u6B63\u786E\u4EE5 --- \u95ED\u5408");
  }
  const frontmatter = lines.slice(1, closeIndex).join("\n");
  const body = lines.slice(closeIndex + 1).join("\n").replace(/^\n+/, "");
  return { frontmatter, body };
}
function formatBacklogDateTime(epochMs) {
  const date = new Date(epochMs);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}
function resolvePreciseTimestamp(payloadValue, backlogMinuteValue) {
  if (typeof payloadValue !== "number" || !Number.isFinite(payloadValue)) {
    return backlogMinuteValue;
  }
  return Math.floor(payloadValue / 6e4) * 6e4 === backlogMinuteValue ? payloadValue : backlogMinuteValue;
}
function parseBacklogDateTime(text) {
  const match = BACKLOG_DATETIME_PATTERN.exec(text.trim());
  if (!match) {
    throw new Error(`markdown-card-format: \u65E0\u6CD5\u89E3\u6790\u65E5\u671F "${text}"\uFF0Cbacklog \u5B58\u50A8\u683C\u5F0F\u987B\u4E3A "YYYY-MM-DD HH:mm"`);
  }
  const [, year, month, day, hour, minute] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0, 0);
}
function findSectionFamilyBlock(lines, headingTitle, markerId) {
  const heading = `## ${headingTitle}`.toLowerCase();
  const begin = `<!-- SECTION:${markerId}:BEGIN -->`;
  const end = `<!-- SECTION:${markerId}:END -->`;
  for (let index = 0; index < lines.length; index += 1) {
    if ((lines[index] ?? "").trimEnd().toLowerCase() !== heading) {
      continue;
    }
    let beginIndex = index + 1;
    while (beginIndex < lines.length && (lines[beginIndex] ?? "").trim() === "") {
      beginIndex += 1;
    }
    if ((lines[beginIndex] ?? "").trimEnd() !== begin) {
      continue;
    }
    let depth = 1;
    let endIndex = beginIndex + 1;
    while (endIndex < lines.length) {
      const candidate = (lines[endIndex] ?? "").trimEnd();
      if (candidate === begin) {
        depth += 1;
      } else if (candidate === end) {
        depth -= 1;
        if (depth === 0) {
          break;
        }
      }
      endIndex += 1;
    }
    if (depth !== 0) {
      continue;
    }
    return { headingLineIndex: index, beginLineIndex: beginIndex, endLineIndex: endIndex };
  }
  return void 0;
}
function findFlatMarkerBlock(lines, headingTitle, markerId) {
  const heading = `## ${headingTitle}`.toLowerCase();
  const begin = `<!-- ${markerId}:BEGIN -->`;
  const end = `<!-- ${markerId}:END -->`;
  for (let index = 0; index < lines.length; index += 1) {
    if ((lines[index] ?? "").trimEnd().toLowerCase() !== heading) {
      continue;
    }
    let beginIndex = index + 1;
    while (beginIndex < lines.length && (lines[beginIndex] ?? "").trim() === "") {
      beginIndex += 1;
    }
    if ((lines[beginIndex] ?? "").trimEnd() !== begin) {
      continue;
    }
    let endIndex = beginIndex + 1;
    while (endIndex < lines.length && (lines[endIndex] ?? "").trimEnd() !== end) {
      endIndex += 1;
    }
    if (endIndex >= lines.length) {
      continue;
    }
    return { headingLineIndex: index, beginLineIndex: beginIndex, endLineIndex: endIndex };
  }
  return void 0;
}
function buildSentinelSectionBlock(title, markerId, body) {
  const begin = `<!-- SECTION:${markerId}:BEGIN -->`;
  const end = `<!-- SECTION:${markerId}:END -->`;
  const normalizedBody = body.replace(/[ \t]+$/gm, "").replace(/\s+$/, "");
  const content = normalizedBody ? `${normalizedBody}
` : "";
  return `## ${title}

${begin}
${content}${end}`;
}
function buildFlatMarkerBlockText(title, markerId, body) {
  const begin = `<!-- ${markerId}:BEGIN -->`;
  const end = `<!-- ${markerId}:END -->`;
  const normalizedBody = body.replace(/\s+$/, "");
  if (!normalizedBody) {
    return "";
  }
  return [`## ${title}`, begin, ...normalizedBody.split("\n"), end].join("\n");
}
function escapeTaskfoldBodyText(text) {
  return text.split("\n").map((line) => {
    const trimmed = line.replace(/[ \t]+$/, "");
    if (GENERIC_SENTINEL_LINE_PATTERN.test(trimmed) || KNOWN_HEADING_LINE_PATTERN.test(trimmed)) {
      return ` ${line}`;
    }
    return line;
  }).join("\n");
}
function formatCardFrontmatterId(displayId) {
  return `${displayId.prefix.toUpperCase()}-${displayId.numericId}`;
}
function parseCardFrontmatterId(id) {
  const match = FRONTMATTER_ID_PATTERN.exec(id.trim());
  if (!match) {
    return void 0;
  }
  return { prefix: (match[1] ?? "").toUpperCase(), numericId: Number(match[2]) };
}
function buildTaskfoldSectionJson(card) {
  const payload = {
    uuid: card.id,
    revision: card.revision,
    // 完整精度的排序值，见文件头决策 4。
    position: card.position,
    // 毫秒精度的创建时间（frontmatter 的 created_date 只到分钟），见 resolvePreciseTimestamp。
    createdAt: card.createdAt
  };
  if (card.kind !== void 0) payload.kind = card.kind;
  if (card.notes !== void 0) payload.notes = card.notes;
  if (card.sessionKey !== void 0) payload.sessionKey = card.sessionKey;
  if (card.runId !== void 0) payload.runId = card.runId;
  if (card.taskId !== void 0) payload.taskId = card.taskId;
  if (card.sourceUrl !== void 0) payload.sourceUrl = card.sourceUrl;
  if (card.execution !== void 0) payload.execution = card.execution;
  if (card.delivery !== void 0) payload.delivery = card.delivery;
  if (card.sourceReferences !== void 0) payload.sourceReferences = card.sourceReferences;
  if (card.startedAt !== void 0) payload.startedAt = card.startedAt;
  if (card.completedAt !== void 0) payload.completedAt = card.completedAt;
  if (card.events !== void 0) payload.events = card.events;
  if (card.metadata !== void 0) payload.metadata = card.metadata;
  return JSON.stringify(payload, null, 2);
}
function serializeMarkdownCard(doc) {
  const { card, displayId, backlogOnly } = doc;
  const frontmatterEntries = [
    ["id", formatCardFrontmatterId(displayId)],
    ["title", card.title],
    ["status", card.status],
    ["assignee", card.agentId ? [card.agentId] : []],
    ["reporter", backlogOnly.reporter],
    ["created_date", formatBacklogDateTime(card.createdAt)],
    ["updated_date", formatBacklogDateTime(card.updatedAt)],
    ["due_date", backlogOnly.dueDate],
    ["labels", card.labels ?? []],
    ["milestone", card.milestoneId],
    ["dependencies", backlogOnly.dependencies ?? []],
    [
      "references",
      backlogOnly.references && backlogOnly.references.length > 0 ? backlogOnly.references : void 0
    ],
    [
      "documentation",
      backlogOnly.documentation && backlogOnly.documentation.length > 0 ? backlogOnly.documentation : void 0
    ],
    [
      "modified_files",
      backlogOnly.modifiedFiles && backlogOnly.modifiedFiles.length > 0 ? backlogOnly.modifiedFiles : void 0
    ],
    ["parent_task_id", backlogOnly.parentTaskId],
    ["subtasks", backlogOnly.subtasks && backlogOnly.subtasks.length > 0 ? backlogOnly.subtasks : void 0],
    ["priority", card.priority],
    ["type", backlogOnly.type],
    ["project", backlogOnly.project],
    // ⚠️ `position` 在 contract 里是必填 number，但外部写入者（人手工编辑 .md）可能让它
    // 变成非有限值。写出 `ordinal: NaN` 会产生真 js-yaml 读不回来的非法 YAML
    // （YAML 1.1 的非数只认 `.nan`），属静默且不可逆的文件损坏。非有限值时省略该键——
    // 与 backlog 自己 `task.ordinal !== undefined && { ordinal }` 的白名单规则一致；
    // 完整精度的 position 另存于 TASKFOLD 区块，信息不丢。
    ["ordinal", Number.isFinite(card.position) ? Math.round(card.position) : void 0],
    ["onStatusChange", backlogOnly.onStatusChange]
  ];
  const frontmatterText = stringifyFrontmatterBlock(frontmatterEntries);
  const bodyParts = [];
  bodyParts.push(buildSentinelSectionBlock("Description", "DESCRIPTION", escapeTaskfoldBodyText(doc.descriptionBody)));
  if (doc.acceptanceCriteriaBody !== void 0) {
    const acBlock = buildFlatMarkerBlockText("Acceptance Criteria", "AC", doc.acceptanceCriteriaBody);
    if (acBlock) bodyParts.push(acBlock);
  }
  if (doc.definitionOfDoneBody !== void 0) {
    const dodBlock = buildFlatMarkerBlockText("Definition of Done", "DOD", doc.definitionOfDoneBody);
    if (dodBlock) bodyParts.push(dodBlock);
  }
  if (doc.trailing.trim()) {
    bodyParts.push(doc.trailing.trim());
  }
  bodyParts.push(buildSentinelSectionBlock("Taskfold", "TASKFOLD", buildTaskfoldSectionJson(card)));
  const body = bodyParts.filter((part) => part.length > 0).join("\n\n");
  return `---
${frontmatterText}
---

${body}
`;
}
function parseMarkdownCard(markdown) {
  const { frontmatter, body } = splitFrontmatter(markdown);
  const fm = parseFrontmatterBlock(frontmatter);
  const lines = body.split("\n");
  const displayIdRaw = requiredString(fm, "id");
  const displayId = parseCardFrontmatterId(displayIdRaw);
  if (!displayId) {
    throw new Error(`markdown-card-format: \u65E0\u6CD5\u89E3\u6790 frontmatter id "${displayIdRaw}"`);
  }
  const taskfoldBlock = findSectionFamilyBlock(lines, "Taskfold", "TASKFOLD");
  if (!taskfoldBlock) {
    throw new Error(
      "markdown-card-format: \u7F3A\u5C11 <!-- SECTION:TASKFOLD:BEGIN/END --> \u533A\u5757\u2014\u2014\u8BE5\u6587\u4EF6\u5C1A\u672A\u88AB Taskfold \u5199\u5165\u8FC7\u3002\u628A\u4E00\u5F20\u7EAF backlog \u5361\u7247\u6536\u7F16\u4E3A Taskfold \u5361\u7247\uFF08\u5206\u914D UUID/revision \u5E76\u9996\u6B21\u5199\u5165 TASKFOLD \u533A\u5757\uFF09\u5C5E\u4E8E\u5B58\u50A8\u540E\u7AEF\u5C42\u7684\u804C\u8D23\uFF0C\u4E0D\u5728\u683C\u5F0F\u5C42\u8303\u56F4\u5185\uFF0C\u672C\u51FD\u6570\u5BF9\u6B64\u76F4\u63A5\u629B\u9519\u3002"
    );
  }
  const taskfoldJsonText = lines.slice(taskfoldBlock.beginLineIndex + 1, taskfoldBlock.endLineIndex).join("\n");
  const payload = JSON.parse(taskfoldJsonText);
  const status = requiredString(fm, "status");
  const title = requiredString(fm, "title");
  const priorityRaw = stringValue(fm, "priority");
  const priority = priorityRaw && TASKFOLD_PRIORITIES.includes(priorityRaw) ? priorityRaw : DEFAULT_PRIORITY;
  const assignee = arrayOfStrings(fm, "assignee");
  const agentId = assignee[0];
  const labels = arrayOfStrings(fm, "labels");
  const milestoneId = stringValue(fm, "milestone");
  const createdAt = resolvePreciseTimestamp(
    payload.createdAt,
    parseBacklogDateTime(requiredString(fm, "created_date"))
  );
  const updatedDateRaw = stringValue(fm, "updated_date");
  const updatedAt = updatedDateRaw ? parseBacklogDateTime(updatedDateRaw) : createdAt;
  const positionFromPayload = typeof payload.position === "number" ? payload.position : void 0;
  const ordinal = numberValue(fm, "ordinal");
  const position = positionFromPayload ?? ordinal ?? 0;
  const uuid = typeof payload.uuid === "string" && payload.uuid ? payload.uuid : displayIdRaw;
  const revision = typeof payload.revision === "number" ? payload.revision : 0;
  const card = {
    id: uuid,
    title,
    status,
    priority,
    labels,
    position,
    createdAt,
    updatedAt,
    revision,
    ...agentId ? { agentId } : {},
    ...milestoneId ? { milestoneId } : {},
    ...payload.kind !== void 0 ? { kind: payload.kind } : {},
    ...payload.notes !== void 0 ? { notes: payload.notes } : {},
    ...payload.sessionKey !== void 0 ? { sessionKey: payload.sessionKey } : {},
    ...payload.runId !== void 0 ? { runId: payload.runId } : {},
    ...payload.taskId !== void 0 ? { taskId: payload.taskId } : {},
    ...payload.sourceUrl !== void 0 ? { sourceUrl: payload.sourceUrl } : {},
    ...payload.execution !== void 0 ? { execution: payload.execution } : {},
    ...payload.delivery !== void 0 ? { delivery: payload.delivery } : {},
    ...payload.sourceReferences !== void 0 ? { sourceReferences: payload.sourceReferences } : {},
    ...payload.startedAt !== void 0 ? { startedAt: payload.startedAt } : {},
    ...payload.completedAt !== void 0 ? { completedAt: payload.completedAt } : {},
    ...payload.events !== void 0 ? { events: payload.events } : {},
    ...payload.metadata !== void 0 ? { metadata: payload.metadata } : {}
  };
  const backlogOnlyRaw = {
    ...stringValue(fm, "reporter") ? { reporter: stringValue(fm, "reporter") } : {},
    ...stringValue(fm, "due_date") ? { dueDate: stringValue(fm, "due_date") } : {},
    ...arrayOfStrings(fm, "references").length ? { references: arrayOfStrings(fm, "references") } : {},
    ...arrayOfStrings(fm, "documentation").length ? { documentation: arrayOfStrings(fm, "documentation") } : {},
    ...arrayOfStrings(fm, "modified_files").length ? { modifiedFiles: arrayOfStrings(fm, "modified_files") } : {},
    ...stringValue(fm, "parent_task_id") ? { parentTaskId: stringValue(fm, "parent_task_id") } : {},
    ...arrayOfStrings(fm, "subtasks").length ? { subtasks: arrayOfStrings(fm, "subtasks") } : {},
    ...stringValue(fm, "type") ? { type: stringValue(fm, "type") } : {},
    ...stringValue(fm, "project") ? { project: stringValue(fm, "project") } : {},
    ...stringValue(fm, "onStatusChange") ? { onStatusChange: stringValue(fm, "onStatusChange") } : {},
    ...arrayOfStrings(fm, "dependencies").length ? { dependencies: arrayOfStrings(fm, "dependencies") } : {}
  };
  const backlogOnly = optional(backlogOnlyRaw) ?? {};
  const descriptionBlock = findSectionFamilyBlock(lines, "Description", "DESCRIPTION");
  const descriptionBody = descriptionBlock ? lines.slice(descriptionBlock.beginLineIndex + 1, descriptionBlock.endLineIndex).join("\n") : "";
  const acBlock = findFlatMarkerBlock(lines, "Acceptance Criteria", "AC");
  const acceptanceCriteriaBody = acBlock ? lines.slice(acBlock.beginLineIndex + 1, acBlock.endLineIndex).join("\n") : void 0;
  const dodBlock = findFlatMarkerBlock(lines, "Definition of Done", "DOD");
  const definitionOfDoneBody = dodBlock ? lines.slice(dodBlock.beginLineIndex + 1, dodBlock.endLineIndex).join("\n") : void 0;
  const consumedLineIndexes = /* @__PURE__ */ new Set();
  const markConsumed = (block) => {
    if (!block) return;
    for (let i = block.headingLineIndex; i <= block.endLineIndex; i += 1) {
      consumedLineIndexes.add(i);
    }
  };
  markConsumed(descriptionBlock);
  markConsumed(acBlock);
  markConsumed(dodBlock);
  markConsumed(taskfoldBlock);
  const trailing = lines.filter((_line, index) => !consumedLineIndexes.has(index)).join("\n").trim();
  return {
    card,
    displayId,
    backlogOnly,
    descriptionBody,
    acceptanceCriteriaBody,
    definitionOfDoneBody,
    trailing
  };
}
function extractTaskfoldSectionUuid(markdown) {
  try {
    const { body } = splitFrontmatter(markdown);
    const lines = body.split("\n");
    const block = findSectionFamilyBlock(lines, "Taskfold", "TASKFOLD");
    if (!block) {
      return void 0;
    }
    const jsonText = lines.slice(block.beginLineIndex + 1, block.endLineIndex).join("\n");
    const payload = JSON.parse(jsonText);
    return typeof payload.uuid === "string" && payload.uuid ? payload.uuid : void 0;
  } catch {
    return void 0;
  }
}
var YAML_NULL_PATTERN, YAML_BOOL_TRUE_PATTERN, YAML_BOOL_FALSE_PATTERN, YAML_INT_PATTERN, YAML_FLOAT_PATTERN, YAML_TIMESTAMP_DATE_PATTERN, YAML_TIMESTAMP_DATETIME_PATTERN, YAML_HEX_PATTERN, YAML_BINARY_PATTERN, YAML_LEADING_ZERO_OCTAL_PATTERN, YAML_INF_PATTERN, YAML_NAN_PATTERN, YAML_SEXAGESIMAL_PATTERN, YAML_DEPRECATED_BOOLEAN_WORDS, FRONTMATTER_KEY_LINE_PATTERN, FRONTMATTER_LIST_ITEM_PATTERN, BACKLOG_DATETIME_PATTERN, GENERIC_SENTINEL_LINE_PATTERN, KNOWN_HEADING_LINE_PATTERN, FRONTMATTER_ID_PATTERN, DEFAULT_PRIORITY;
var init_markdown_card_format = __esm({
  "../core/src/markdown-card-format.ts"() {
    "use strict";
    init_contract();
    YAML_NULL_PATTERN = /^(~|null|Null|NULL)$/;
    YAML_BOOL_TRUE_PATTERN = /^(true|True|TRUE)$/;
    YAML_BOOL_FALSE_PATTERN = /^(false|False|FALSE)$/;
    YAML_INT_PATTERN = /^[-+]?(0|[1-9][0-9_]*)$/;
    YAML_FLOAT_PATTERN = /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]+(?:[eE][-+]?[0-9]+)?$|^[-+]?[0-9][0-9_]*[eE][-+]?[0-9]+$/;
    YAML_TIMESTAMP_DATE_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
    YAML_TIMESTAMP_DATETIME_PATTERN = /^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}[Tt ][0-9]{1,2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]*)?([ \t]*(Z|[-+][0-9]{1,2}(?::[0-9]{2})?))?$/;
    YAML_HEX_PATTERN = /^[-+]?0x[0-9a-fA-F_]+$/;
    YAML_BINARY_PATTERN = /^[-+]?0b[01_]+$/;
    YAML_LEADING_ZERO_OCTAL_PATTERN = /^[-+]?0[0-7_]+$/;
    YAML_INF_PATTERN = /^[-+]?\.(inf|Inf|INF)$/;
    YAML_NAN_PATTERN = /^\.(nan|NaN|NAN)$/;
    YAML_SEXAGESIMAL_PATTERN = /^[-+]?[0-9][0-9_]*(:[0-5]?[0-9])+(\.[0-9_]*)?$/;
    YAML_DEPRECATED_BOOLEAN_WORDS = /* @__PURE__ */ new Set([
      "y",
      "Y",
      "yes",
      "Yes",
      "YES",
      "n",
      "N",
      "no",
      "No",
      "NO",
      "on",
      "On",
      "ON",
      "off",
      "Off",
      "OFF"
    ]);
    FRONTMATTER_KEY_LINE_PATTERN = /^([A-Za-z_][A-Za-z0-9_]*):[ \t]?(.*)$/;
    FRONTMATTER_LIST_ITEM_PATTERN = /^ {2}- (.*)$/;
    BACKLOG_DATETIME_PATTERN = /^([0-9]{4})-([0-9]{2})-([0-9]{2}) ([0-9]{2}):([0-9]{2})$/;
    GENERIC_SENTINEL_LINE_PATTERN = /^<!-- (SECTION:[A-Z][A-Z0-9_]*|COMMENTS|COMMENT|AC|DOD):(BEGIN|END) -->[\t ]*$/;
    KNOWN_HEADING_LINE_PATTERN = /^## (Description|Acceptance Criteria|Acceptance Criteria \(Optional\)|Definition of Done|Implementation Plan|Implementation Plan \(Optional\)|Implementation Notes|Implementation Notes \(Optional\)|Notes|Notes & Comments \(Optional\)|Comments|Final Summary)\s*$/i;
    FRONTMATTER_ID_PATTERN = /^([A-Za-z]+)-([0-9]+)$/;
    DEFAULT_PRIORITY = "normal";
  }
});

// ../core/src/file-store-reconcile.ts
import fs7 from "node:fs";
import path6 from "node:path";
function listFilesWithExtension(dir, extension) {
  return listFileNamesSafe(dir).filter((name) => name.endsWith(extension));
}
function statFingerprint(filePath) {
  try {
    const stat2 = fs7.statSync(filePath);
    return `${stat2.mtimeMs}:${stat2.size}`;
  } catch (err) {
    if (err.code === "ENOENT") {
      return void 0;
    }
    throw err;
  }
}
function computeFingerprint(dir, extension) {
  const snapshot = /* @__PURE__ */ new Map();
  for (const fileName of listFilesWithExtension(dir, extension)) {
    const fingerprint = statFingerprint(path6.join(dir, fileName));
    if (fingerprint !== void 0) {
      snapshot.set(fileName, fingerprint);
    }
  }
  return snapshot;
}
function fingerprintsEqual(a, b) {
  if (a.size !== b.size) {
    return false;
  }
  for (const [fileName, value] of a) {
    if (b.get(fileName) !== value) {
      return false;
    }
  }
  return true;
}
function cardIdOfRuntimeFile(fileName) {
  try {
    return decodeURIComponent(fileName.slice(0, -RUNTIME_EXTENSION.length));
  } catch {
    return void 0;
  }
}
function cardIdOf(content, codec) {
  const uuid = extractTaskfoldSectionUuid(content);
  if (uuid !== void 0) {
    return uuid;
  }
  try {
    return codec.parse(content).id;
  } catch {
    return void 0;
  }
}
function createTaskfoldExternalChangeReconciler(options) {
  const { cardsDir, runtimeCardsDir, locksDir, codec } = options;
  const canWrite = options.canWrite ?? (() => true);
  let version = 0;
  let mdSnapshot = /* @__PURE__ */ new Map();
  let runtimeFingerprint = /* @__PURE__ */ new Map();
  let orphanIds = /* @__PURE__ */ new Set();
  let rescanPending = false;
  function restampUnderLock(cardId, filePath) {
    try {
      return tryWithTaskfoldCardLockSync(locksDir, cardId, filePath, (guard) => {
        const content = readFileIfExists(filePath);
        if (content === void 0) {
          return false;
        }
        let parsed;
        try {
          parsed = codec.parse(content);
        } catch {
          return false;
        }
        const runtimePath = cardRuntimePath(runtimeCardsDir, cardId);
        const { runtime, changed } = resolveCardRuntime(content, parsed, readCardRuntime(runtimePath));
        if (changed) {
          writeCardRuntime(runtimePath, runtime, guard.assertHeld);
        }
        return changed;
      });
    } catch (error) {
      if (isTaskfoldLockConflictError(error)) {
        return void 0;
      }
      throw error;
    }
  }
  function scanAndRestamp() {
    let external = false;
    let incomplete = false;
    let writable;
    const nextSnapshot = /* @__PURE__ */ new Map();
    for (const fileName of listFilesWithExtension(cardsDir, CARD_EXTENSION)) {
      const filePath = path6.join(cardsDir, fileName);
      const fingerprint = statFingerprint(filePath);
      const content = readFileIfExists(filePath);
      if (fingerprint === void 0 || content === void 0) {
        continue;
      }
      const cardId = cardIdOf(content, codec);
      nextSnapshot.set(fileName, { fingerprint, cardId });
      if (cardId === void 0) {
        if (mdSnapshot.get(fileName)?.fingerprint !== fingerprint) {
          external = true;
        }
        continue;
      }
      const stored = readCardRuntime(cardRuntimePath(runtimeCardsDir, cardId));
      if (stored && stored.contentHash === hashCardFileContent(content)) {
        continue;
      }
      writable ??= canWrite();
      if (!writable) {
        continue;
      }
      const restamped = restampUnderLock(cardId, filePath);
      if (restamped === void 0) {
        incomplete = true;
      } else if (restamped) {
        external = true;
      }
    }
    const liveIds = new Set([...nextSnapshot.values()].map((entry) => entry.cardId));
    const nextOrphanIds = /* @__PURE__ */ new Set();
    for (const fileName of listFilesWithExtension(runtimeCardsDir, RUNTIME_EXTENSION)) {
      const cardId = cardIdOfRuntimeFile(fileName);
      if (cardId === void 0 || liveIds.has(cardId)) {
        continue;
      }
      nextOrphanIds.add(cardId);
      if (!orphanIds.has(cardId)) {
        external = true;
      }
    }
    orphanIds = nextOrphanIds;
    mdSnapshot = nextSnapshot;
    runtimeFingerprint = computeFingerprint(runtimeCardsDir, RUNTIME_EXTENSION);
    rescanPending = incomplete;
    return external;
  }
  function mdFingerprintUnchanged() {
    const current = computeFingerprint(cardsDir, CARD_EXTENSION);
    if (current.size !== mdSnapshot.size) {
      return false;
    }
    for (const [fileName, value] of current) {
      if (mdSnapshot.get(fileName)?.fingerprint !== value) {
        return false;
      }
    }
    return true;
  }
  scanAndRestamp();
  return {
    dataVersion() {
      if (!rescanPending && mdFingerprintUnchanged() && fingerprintsEqual(computeFingerprint(runtimeCardsDir, RUNTIME_EXTENSION), runtimeFingerprint)) {
        return version;
      }
      if (scanAndRestamp()) {
        version += 1;
      }
      return version;
    }
  };
}
var CARD_EXTENSION, RUNTIME_EXTENSION;
var init_file_store_reconcile = __esm({
  "../core/src/file-store-reconcile.ts"() {
    "use strict";
    init_file_store_atomic();
    init_file_store_card_runtime();
    init_file_store_locks();
    init_markdown_card_format();
    CARD_EXTENSION = ".md";
    RUNTIME_EXTENSION = ".json";
  }
});

// ../core/src/markdown-milestone-format.ts
function buildTaskfoldMilestoneSectionJson(milestone) {
  const payload = {
    uuid: milestone.id,
    boardId: milestone.boardId,
    // 完整精度的排序值，同卡片的「决策 4」：frontmatter 的 ordinal 只是四舍五入的整数
    // 投影，给人看/给未来的排序 UI 用；权威值存在这里。
    position: milestone.position,
    // 毫秒精度的创建时间，同卡片（markdown-card-format.ts 的 resolvePreciseTimestamp）。
    createdAt: milestone.createdAt
  };
  if (milestone.color !== void 0) payload.color = milestone.color;
  if (milestone.completedAt !== void 0) payload.completedAt = milestone.completedAt;
  if (milestone.archivedAt !== void 0) payload.archivedAt = milestone.archivedAt;
  return JSON.stringify(payload, null, 2);
}
function serializeMarkdownMilestone(doc) {
  const { milestone } = doc;
  const frontmatterEntries = [
    ["title", milestone.title],
    // state 不校验值域，照抄卡片格式层「决策 7」对 status 的做法。
    ["state", milestone.state],
    ["created_date", formatBacklogDateTime(milestone.createdAt)],
    ["updated_date", formatBacklogDateTime(milestone.updatedAt)],
    ["ordinal", Math.round(milestone.position)]
  ];
  const frontmatterText = stringifyFrontmatterBlock(frontmatterEntries);
  const bodyParts = [];
  bodyParts.push(
    buildSentinelSectionBlock(
      "Description",
      "DESCRIPTION",
      escapeTaskfoldBodyText(milestone.description ?? "")
    )
  );
  if (doc.trailing.trim()) {
    bodyParts.push(doc.trailing.trim());
  }
  bodyParts.push(buildSentinelSectionBlock("Taskfold", "TASKFOLD", buildTaskfoldMilestoneSectionJson(milestone)));
  const body = bodyParts.filter((part) => part.length > 0).join("\n\n");
  return `---
${frontmatterText}
---

${body}
`;
}
function parseMarkdownMilestone(markdown) {
  const { frontmatter, body } = splitFrontmatter(markdown);
  const fm = parseFrontmatterBlock(frontmatter);
  const lines = body.split("\n");
  const taskfoldBlock = findSectionFamilyBlock(lines, "Taskfold", "TASKFOLD");
  if (!taskfoldBlock) {
    throw new Error(
      "markdown-milestone-format: \u7F3A\u5C11 <!-- SECTION:TASKFOLD:BEGIN/END --> \u533A\u5757\u2014\u2014\u8BE5\u6587\u4EF6\u5C1A\u672A\u88AB Taskfold \u5199\u5165\u8FC7\u3002\u628A\u4E00\u4EFD\u975E Taskfold \u5199\u5165\u7684\u6587\u4EF6\u6536\u7F16\u4E3A\u91CC\u7A0B\u7891\u6587\u4EF6\u4E0D\u5728\u683C\u5F0F\u5C42\u8303\u56F4\u5185\uFF0C\u672C\u51FD\u6570\u5BF9\u6B64\u76F4\u63A5\u629B\u9519\u3002"
    );
  }
  const taskfoldJsonText = lines.slice(taskfoldBlock.beginLineIndex + 1, taskfoldBlock.endLineIndex).join("\n");
  const payload = JSON.parse(taskfoldJsonText);
  const title = requiredString(fm, "title");
  const state = requiredString(fm, "state");
  const createdAt = resolvePreciseTimestamp(
    payload.createdAt,
    parseBacklogDateTime(requiredString(fm, "created_date"))
  );
  const updatedDateRaw = stringValue(fm, "updated_date");
  const updatedAt = updatedDateRaw ? parseBacklogDateTime(updatedDateRaw) : createdAt;
  const positionFromPayload = typeof payload.position === "number" ? payload.position : void 0;
  const ordinal = numberValue(fm, "ordinal");
  const position = positionFromPayload ?? ordinal ?? 0;
  const legacyId = stringValue(fm, "id");
  const uuid = typeof payload.uuid === "string" && payload.uuid ? payload.uuid : legacyId && parseCardFrontmatterId(legacyId) ? legacyId : void 0;
  if (!uuid) {
    throw new Error("markdown-milestone-format: \u7F3A\u5C11 UUID \u6216\u6709\u6548\u7684\u65E7\u683C\u5F0F id");
  }
  const boardId = typeof payload.boardId === "string" && payload.boardId ? payload.boardId : "default";
  const descriptionBlock = findSectionFamilyBlock(lines, "Description", "DESCRIPTION");
  const descriptionBody = descriptionBlock ? lines.slice(descriptionBlock.beginLineIndex + 1, descriptionBlock.endLineIndex).join("\n") : "";
  const milestone = {
    id: uuid,
    boardId,
    title,
    ...descriptionBody !== "" ? { description: descriptionBody } : {},
    position,
    state,
    createdAt,
    updatedAt,
    ...typeof payload.color === "string" ? { color: payload.color } : {},
    ...typeof payload.completedAt === "number" ? { completedAt: payload.completedAt } : {},
    ...typeof payload.archivedAt === "number" ? { archivedAt: payload.archivedAt } : {}
  };
  const consumedLineIndexes = /* @__PURE__ */ new Set();
  const markConsumed = (block) => {
    if (!block) return;
    for (let i = block.headingLineIndex; i <= block.endLineIndex; i += 1) {
      consumedLineIndexes.add(i);
    }
  };
  markConsumed(descriptionBlock);
  markConsumed(taskfoldBlock);
  const trailing = lines.filter((_line, index) => !consumedLineIndexes.has(index)).join("\n").trim();
  return { milestone, trailing };
}
var init_markdown_milestone_format = __esm({
  "../core/src/markdown-milestone-format.ts"() {
    "use strict";
    init_markdown_card_format();
  }
});

// ../core/src/file-store-codec.ts
function fallbackCardDisplayId(card) {
  return parseCardFrontmatterId(card.id) ?? { prefix: "CARD", numericId: 0 };
}
function createMarkdownCardCodec() {
  return {
    serialize(card, previousContent, displayIdHint) {
      const previous = previousContent === void 0 ? void 0 : parseMarkdownCard(previousContent);
      const doc = {
        card,
        displayId: previous?.displayId ?? displayIdHint ?? fallbackCardDisplayId(card),
        backlogOnly: previous?.backlogOnly ?? {},
        descriptionBody: previous?.descriptionBody ?? "",
        acceptanceCriteriaBody: previous?.acceptanceCriteriaBody,
        definitionOfDoneBody: previous?.definitionOfDoneBody,
        trailing: previous?.trailing ?? ""
      };
      return serializeMarkdownCard(doc);
    },
    parse(content) {
      return parseMarkdownCard(content).card;
    }
  };
}
function createMarkdownMilestoneCodec() {
  return {
    serialize(milestone, previousContent) {
      const previous = previousContent === void 0 ? void 0 : parseMarkdownMilestone(previousContent);
      const doc = {
        milestone,
        trailing: previous?.trailing ?? ""
      };
      return serializeMarkdownMilestone(doc);
    },
    parse(content) {
      return parseMarkdownMilestone(content).milestone;
    }
  };
}
var init_file_store_codec = __esm({
  "../core/src/file-store-codec.ts"() {
    "use strict";
    init_markdown_card_format();
    init_markdown_milestone_format();
  }
});

// ../core/src/file-store-card-id.ts
import path7 from "node:path";
function allocateNextOrdinalId(options) {
  const canonicalPrefix = options.prefix.toUpperCase();
  let max = 0;
  for (const dir of options.directories) {
    for (const fileName of listFileNamesSafe(dir)) {
      const stem = fileName.slice(0, fileName.length - path7.extname(fileName).length);
      const parsed = parseCanonicalOrdinalId(filenameIdToken(stem));
      if (parsed && parsed.prefix === canonicalPrefix) {
        max = Math.max(max, parsed.number);
      }
    }
  }
  return `${canonicalPrefix}-${max + 1}`;
}
function allocateNextTaskfoldCardId(cardsDir, archiveCardsDir) {
  return allocateNextOrdinalId({ prefix: "CARD", directories: [cardsDir, archiveCardsDir] });
}
var init_file_store_card_id = __esm({
  "../core/src/file-store-card-id.ts"() {
    "use strict";
    init_file_store_atomic();
  }
});

// ../core/src/file-store-cards.ts
import path8 from "node:path";
function assertValidCardPayload(key, value) {
  if (value.version !== 1 || value.card.id !== key) {
    throw new Error("invalid taskfold card payload");
  }
}
function cardFileName(displayId, title) {
  return `${displayId.toLowerCase()} - ${sanitizeFilenameSegment(title)}${CARD_EXTENSION2}`;
}
function findCardFilePath(cardsDir, id) {
  for (const fileName of listFileNamesSafe(cardsDir)) {
    if (!fileName.endsWith(CARD_EXTENSION2)) {
      continue;
    }
    const filePath = path8.join(cardsDir, fileName);
    const content = readFileIfExists(filePath);
    if (content === void 0) {
      continue;
    }
    const uuid = extractTaskfoldSectionUuid(content);
    if (uuid !== void 0 && sameEntityId(uuid, id)) {
      return filePath;
    }
  }
  return void 0;
}
function allocateNewCardFile(cardsDir, archiveCardsDir, card) {
  const displayIdText = allocateNextTaskfoldCardId(cardsDir, archiveCardsDir);
  const displayId = parseCardFrontmatterId(displayIdText);
  if (!displayId) {
    throw new Error(`taskfold file store: \u5206\u914D\u5668\u8FD4\u56DE\u4E86\u65E0\u6CD5\u89E3\u6790\u7684\u5C55\u793A ID "${displayIdText}"`);
  }
  return { path: path8.join(cardsDir, cardFileName(displayIdText, card.title)), displayId };
}
function readCardStateFromContent(content, codec, runtimeCardsDir, key) {
  const parsed = codec.parse(content);
  const stored = readCardRuntime(cardRuntimePath(runtimeCardsDir, key ?? parsed.id));
  const { runtime, changed } = resolveCardRuntime(content, parsed, stored);
  return {
    content,
    card: mergeCardRuntime(parsed, stored, runtime.revision),
    runtime,
    runtimeChanged: changed
  };
}
function readCardState(filePath, codec, runtimeCardsDir, key) {
  const content = readFileIfExists(filePath);
  return content === void 0 ? void 0 : readCardStateFromContent(content, codec, runtimeCardsDir, key);
}
function writeCard(cardsDir, archiveCardsDir, runtimeCardsDir, value, codec, existingPath, guard, previousContent) {
  const { mdCard, fields } = splitCardRuntime(value.card);
  let written;
  if (existingPath) {
    const baseline = previousContent ?? readFileIfExists(existingPath);
    const unchanged = baseline !== void 0 && codec.serialize({ ...mdCard, updatedAt: codec.parse(baseline).updatedAt }, baseline) === baseline;
    if (unchanged) {
      written = { path: existingPath, content: baseline };
    } else {
      const content = codec.serialize(mdCard, baseline);
      writeFileAtomic(existingPath, content, void 0, guard.assertHeld);
      written = { path: existingPath, content };
    }
  } else {
    const { path: newPath, displayId } = allocateNewCardFile(cardsDir, archiveCardsDir, value.card);
    const content = codec.serialize(mdCard, previousContent, displayId);
    writeFileAtomic(newPath, content, void 0, guard.assertHeld);
    written = { path: newPath, content };
  }
  writeCardRuntime(
    cardRuntimePath(runtimeCardsDir, value.card.id),
    {
      version: 1,
      revision: value.card.revision,
      contentHash: hashCardFileContent(written.content),
      updatedAt: value.card.updatedAt,
      fields
    },
    guard.assertHeld
  );
  return written;
}
function createTaskfoldFileCardStore(options) {
  const { cardsDir, archiveCardsDir, attachmentsDir, codec, locksDir, runtimeCardsDir } = options;
  async function overwriteExistingCard(key, filePath, value) {
    await withTaskfoldCardLock(locksDir, key, filePath, (guard) => {
      const current = readCardState(filePath, codec, runtimeCardsDir, key);
      if (current) {
        value.card.revision = Math.max(value.card.revision, current.runtime.revision + 1);
      }
      writeCard(cardsDir, archiveCardsDir, runtimeCardsDir, value, codec, filePath, guard, current?.content);
    });
  }
  return {
    async register(key, value) {
      assertValidCardPayload(key, value);
      const existingPath = findCardFilePath(cardsDir, key);
      if (existingPath) {
        await overwriteExistingCard(key, existingPath, value);
        return;
      }
      const racedPath = await withTaskfoldGlobalLock(locksDir, (guard) => {
        const raced = findCardFilePath(cardsDir, key);
        if (raced) {
          return raced;
        }
        writeCard(cardsDir, archiveCardsDir, runtimeCardsDir, value, codec, void 0, guard);
        return void 0;
      });
      if (racedPath) {
        await overwriteExistingCard(key, racedPath, value);
      }
    },
    async lookup(key) {
      const filePath = findCardFilePath(cardsDir, key);
      if (!filePath) {
        return void 0;
      }
      const state = readCardState(filePath, codec, runtimeCardsDir, key);
      return state ? { version: 1, card: state.card } : void 0;
    },
    async delete(key) {
      const filePath = findCardFilePath(cardsDir, key);
      if (!filePath) {
        return false;
      }
      const card = await withTaskfoldCardLock(locksDir, key, filePath, (guard) => {
        const current = readCardState(filePath, codec, runtimeCardsDir, key)?.card;
        guard.assertHeld();
        if (!removeFileIfExists(filePath)) {
          return void 0;
        }
        removeCardRuntime(cardRuntimePath(runtimeCardsDir, key));
        return { card: current };
      });
      if (!card) {
        return false;
      }
      for (const attachment of card.card?.metadata?.attachments ?? []) {
        removeFileIfExists(path8.join(attachmentsDir, attachment.id));
      }
      return true;
    },
    async entries() {
      const results = [];
      for (const fileName of listFileNamesSafe(cardsDir)) {
        if (!fileName.endsWith(CARD_EXTENSION2)) {
          continue;
        }
        const filePath = path8.join(cardsDir, fileName);
        const content = readFileIfExists(filePath);
        if (content === void 0) {
          continue;
        }
        let card;
        try {
          card = readCardStateFromContent(content, codec, runtimeCardsDir).card;
        } catch (error) {
          console.warn(
            `taskfold file store: \u8DF3\u8FC7\u65E0\u6CD5\u89E3\u6790\u7684\u5361\u7247\u6587\u4EF6 "${fileName}": ${error.message}`
          );
          continue;
        }
        results.push({ key: card.id, value: { version: 1, card } });
      }
      return results;
    },
    async compareAndSwap(key, expectedRevision, value, onReject) {
      assertValidCardPayload(key, value);
      const filePath = findCardFilePath(cardsDir, key);
      if (!filePath) {
        onReject?.("missing");
        return false;
      }
      try {
        return await withTaskfoldCardLock(locksDir, key, filePath, (guard) => {
          const current = readCardState(filePath, codec, runtimeCardsDir, key);
          if (current === void 0) {
            onReject?.("missing");
            return false;
          }
          if (current.runtimeChanged) {
            writeCardRuntime(cardRuntimePath(runtimeCardsDir, key), current.runtime, guard.assertHeld);
          }
          if (current.runtime.revision !== expectedRevision) {
            onReject?.("revision");
            return false;
          }
          writeCard(cardsDir, archiveCardsDir, runtimeCardsDir, value, codec, filePath, guard, current.content);
          return true;
        });
      } catch (error) {
        if (isTaskfoldLockConflictError(error)) {
          onReject?.(error instanceof TaskfoldLockTimeoutError ? "lock-timeout" : "lock-compromised");
          return false;
        }
        throw error;
      }
    },
    async registerIfAbsent(key, value) {
      assertValidCardPayload(key, value);
      if (findCardFilePath(cardsDir, key)) {
        return false;
      }
      return await withTaskfoldGlobalLock(locksDir, (guard) => {
        if (findCardFilePath(cardsDir, key)) {
          return false;
        }
        const { path: newPath, displayId } = allocateNewCardFile(cardsDir, archiveCardsDir, value.card);
        const { mdCard, fields } = splitCardRuntime(value.card);
        const content = codec.serialize(mdCard, void 0, displayId);
        guard.assertHeld();
        const created = createFileExclusive(newPath, content);
        if (created) {
          writeCardRuntime(
            cardRuntimePath(runtimeCardsDir, key),
            {
              version: 1,
              revision: value.card.revision,
              contentHash: hashCardFileContent(content),
              updatedAt: value.card.updatedAt,
              fields
            },
            guard.assertHeld
          );
        }
        return created;
      });
    }
  };
}
var CARD_EXTENSION2;
var init_file_store_cards = __esm({
  "../core/src/file-store-cards.ts"() {
    "use strict";
    init_file_store_atomic();
    init_file_store_card_id();
    init_file_store_card_runtime();
    init_file_store_locks();
    init_markdown_card_format();
    CARD_EXTENSION2 = ".md";
  }
});

// ../core/src/file-store-project-paths.ts
import path9 from "node:path";
function projectPath(root, value, direction) {
  if (direction === "read") {
    if (!value.startsWith("./")) return value;
    const resolved = path9.resolve(root, value);
    const relative2 = path9.relative(root, resolved);
    if (relative2 === ".." || relative2.startsWith(`..${path9.sep}`)) {
      throw new Error("project-relative path escapes the project root.");
    }
    return resolved;
  }
  if (!path9.isAbsolute(value)) return value;
  const relative = path9.relative(root, value);
  return relative !== ".." && !relative.startsWith(`..${path9.sep}`) ? `./${relative.split(path9.sep).join("/")}` : value;
}
function mapCardProjectPaths(root, card, direction) {
  const references = card.sourceReferences?.map((reference) => ({
    ...reference,
    target: projectPath(root, reference.target, direction)
  }));
  const automation = card.metadata?.automation;
  const workspace = automation?.workspace;
  return {
    ...card,
    ...references ? { sourceReferences: references } : {},
    ...workspace ? {
      metadata: {
        ...card.metadata,
        automation: {
          ...automation,
          workspace: {
            ...workspace,
            ...workspace.path ? { path: projectPath(root, workspace.path, direction) } : {},
            ...workspace.sourcePath ? { sourcePath: projectPath(root, workspace.sourcePath, direction) } : {}
          }
        }
      }
    } : {}
  };
}
function mapDocumentProjectPath(root, document, direction) {
  return document.type === "path" && document.target ? { ...document, target: projectPath(root, document.target, direction) } : document;
}
function withProjectPaths(codec, root) {
  return {
    parse: (content) => mapCardProjectPaths(root, codec.parse(content), "read"),
    serialize: (card, previousContent, displayIdHint) => codec.serialize(mapCardProjectPaths(root, card, "write"), previousContent, displayIdHint)
  };
}
var init_file_store_project_paths = __esm({
  "../core/src/file-store-project-paths.ts"() {
    "use strict";
  }
});

// ../core/src/file-store-cas.ts
function unsupportedTaskfoldCompareAndSwap(_key, _expectedRevision, _value, onReject) {
  onReject?.("unsupported");
  return Promise.resolve(false);
}
var init_file_store_cas = __esm({
  "../core/src/file-store-cas.ts"() {
    "use strict";
  }
});

// ../core/src/file-store-milestones.ts
import fs8 from "node:fs";
import path10 from "node:path";
import { createHash as createHash2 } from "node:crypto";
function milestoneFileStem(title) {
  let stem = "";
  for (const char of sanitizeFilenameSegment(title)) {
    if (Buffer.byteLength(stem + char) > 140) break;
    stem += char;
  }
  stem = stem.replace(/[. ]+$/, "") || "untitled";
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem) ? `_${stem}` : stem;
}
function collisionToken(id) {
  return /^[0-9a-f]{8}-[0-9a-f-]+$/i.test(id) ? id.replaceAll("-", "").toLowerCase() : createHash2("sha256").update(id).digest("hex");
}
function selectMilestoneFileName(milestone, occupied, existingName, previousTitle) {
  const stem = milestoneFileStem(milestone.title);
  const token = collisionToken(milestone.id);
  const candidates = [`${stem}.md`];
  for (let length = 8; length <= token.length; length += 4) {
    candidates.push(`${stem} - ${token.slice(0, length)}.md`);
  }
  if (previousTitle === milestone.title && existingName && candidates.includes(existingName)) {
    return existingName;
  }
  const occupiedFolded = new Set([...occupied].filter((name) => name !== existingName).map((name) => name.toLowerCase()));
  const available = candidates.find((name) => !occupiedFolded.has(name.toLowerCase()));
  if (!available) throw new Error(`\u65E0\u6CD5\u4E3A\u9636\u6BB5\u5206\u914D\u4E0D\u51B2\u7A81\u7684\u6587\u4EF6\u540D\uFF1A${milestone.title}`);
  return available;
}
function findMilestoneFilePath(milestonesDir, id, codec) {
  for (const fileName of listFileNamesSafe(milestonesDir)) {
    if (!fileName.endsWith(MILESTONE_EXTENSION)) continue;
    const filePath = path10.join(milestonesDir, fileName);
    const content = readFileIfExists(filePath);
    if (content === void 0) continue;
    try {
      if (sameEntityId(codec.parse(content).id, id)) return filePath;
    } catch {
    }
  }
  return void 0;
}
function writeTaskfoldMilestoneFile(options) {
  const { milestonesDir, milestone, codec, existingPath, guard } = options;
  const baseline = existingPath ? readFileIfExists(existingPath) : void 0;
  const content = codec.serialize(milestone, baseline);
  const fileName = selectMilestoneFileName(
    milestone,
    new Set(fs8.readdirSync(milestonesDir)),
    existingPath && path10.basename(existingPath),
    baseline === void 0 ? void 0 : codec.parse(baseline).title
  );
  const target = path10.join(milestonesDir, fileName);
  guard.assertHeld();
  if (!existingPath) {
    if (!createFileExclusive(target, content)) throw new Error(`\u9636\u6BB5\u6587\u4EF6\u5DF2\u5B58\u5728\uFF1A${target}`);
    return;
  }
  if (existingPath !== target) {
    if (fs8.existsSync(target)) throw new Error(`\u9636\u6BB5\u6587\u4EF6\u5DF2\u5B58\u5728\uFF1A${target}`);
    fs8.renameSync(existingPath, target);
  }
  writeFileAtomic(target, content, void 0, guard.assertHeld);
}
function createTaskfoldFileMilestoneStore(options) {
  const { milestonesDir, codec, locksDir, configPath } = options;
  return {
    async register(key, value) {
      if (value.version !== 1 || value.milestone.id !== key) throw new Error("invalid taskfold milestone payload");
      await withTaskfoldGlobalLock(locksDir, (guard) => {
        const existingPath = findMilestoneFilePath(milestonesDir, key, codec);
        upgradeTaskfoldFormatVersion(configPath, guard.assertHeld);
        writeTaskfoldMilestoneFile({ milestonesDir, milestone: value.milestone, codec, existingPath, guard });
      });
    },
    async lookup(key) {
      const filePath = findMilestoneFilePath(milestonesDir, key, codec);
      const content = filePath ? readFileIfExists(filePath) : void 0;
      return content === void 0 ? void 0 : { version: 1, milestone: codec.parse(content) };
    },
    async delete(key) {
      return await withTaskfoldGlobalLock(locksDir, (guard) => {
        assertTaskfoldFormatWritable(configPath);
        const filePath = findMilestoneFilePath(milestonesDir, key, codec);
        guard.assertHeld();
        return filePath ? removeFileIfExists(filePath) : false;
      });
    },
    async entries() {
      const results = [];
      for (const fileName of listFileNamesSafe(milestonesDir)) {
        if (!fileName.endsWith(MILESTONE_EXTENSION)) {
          continue;
        }
        const filePath = path10.join(milestonesDir, fileName);
        const content = readFileIfExists(filePath);
        if (content === void 0) {
          continue;
        }
        let milestone;
        try {
          milestone = codec.parse(content);
        } catch (error) {
          console.warn(
            `taskfold file store: \u8DF3\u8FC7\u65E0\u6CD5\u89E3\u6790\u7684\u91CC\u7A0B\u7891\u6587\u4EF6 "${fileName}": ${error.message}`
          );
          continue;
        }
        results.push({ key: milestone.id, value: { version: 1, milestone } });
      }
      return results;
    },
    // 没有条件写的调用方（需求/16 R1 只要求卡片）；显式拒绝，绝不静默穿透成无条件写。
    compareAndSwap: unsupportedTaskfoldCompareAndSwap
  };
}
var MILESTONE_EXTENSION;
var init_file_store_milestones = __esm({
  "../core/src/file-store-milestones.ts"() {
    "use strict";
    init_file_store_cas();
    init_file_store_atomic();
    init_file_store_format();
    init_file_store_locks();
    MILESTONE_EXTENSION = ".md";
  }
});

// ../core/src/file-store-documents.ts
import path11 from "node:path";
function assertValidDocumentPayload(key, value) {
  if (value.version !== 1 || value.document.id !== key) {
    throw new Error("invalid taskfold project document payload");
  }
}
function documentFileName(document) {
  return `${document.key}${DOCUMENT_EXTENSION}`;
}
function readDocumentAt(filePath, projectRoot) {
  const content = readFileIfExists(filePath);
  if (content === void 0) {
    return void 0;
  }
  return mapDocumentProjectPath(projectRoot, JSON.parse(content), "read");
}
function listDocumentFiles(documentsDir) {
  return listFileNamesSafe(documentsDir).filter(
    (fileName) => fileName.endsWith(DOCUMENT_EXTENSION)
  );
}
function findDocumentFilePathById(documentsDir, projectRoot, id) {
  for (const fileName of listDocumentFiles(documentsDir)) {
    const filePath = path11.join(documentsDir, fileName);
    if (readDocumentAt(filePath, projectRoot)?.id === id) {
      return filePath;
    }
  }
  return void 0;
}
function createTaskfoldFileDocumentStore(options) {
  const { documentsDir, projectRoot } = options;
  return {
    async register(key, value) {
      assertValidDocumentPayload(key, value);
      const existingPath = findDocumentFilePathById(documentsDir, projectRoot, key);
      const newPath = path11.join(documentsDir, documentFileName(value.document));
      writeFileAtomic(newPath, JSON.stringify(mapDocumentProjectPath(projectRoot, value.document, "write"), null, 2));
      if (existingPath && existingPath !== newPath) {
        removeFileIfExists(existingPath);
      }
    },
    async lookup(key) {
      const filePath = findDocumentFilePathById(documentsDir, projectRoot, key);
      if (!filePath) {
        return void 0;
      }
      const document = readDocumentAt(filePath, projectRoot);
      return document ? { version: 1, document } : void 0;
    },
    async delete(key) {
      const filePath = findDocumentFilePathById(documentsDir, projectRoot, key);
      return filePath ? removeFileIfExists(filePath) : false;
    },
    async entries() {
      const results = [];
      for (const fileName of listDocumentFiles(documentsDir)) {
        const document = readDocumentAt(path11.join(documentsDir, fileName), projectRoot);
        if (document) {
          results.push({ key: document.id, value: { version: 1, document } });
        }
      }
      return results;
    },
    // 没有条件写的调用方（需求/16 R1 只要求卡片）；显式拒绝，绝不静默穿透成无条件写。
    compareAndSwap: unsupportedTaskfoldCompareAndSwap
  };
}
var DOCUMENT_EXTENSION;
var init_file_store_documents = __esm({
  "../core/src/file-store-documents.ts"() {
    "use strict";
    init_file_store_cas();
    init_file_store_project_paths();
    init_file_store_atomic();
    DOCUMENT_EXTENSION = ".json";
  }
});

// ../core/src/file-store-subscriptions.ts
import path12 from "node:path";
function assertValidSubscriptionPayload(key, value) {
  if (value.version !== 1 || value.subscription.id !== key) {
    throw new Error("invalid taskfold notification subscription payload");
  }
}
function subscriptionFilePath(subscriptionsDir, id) {
  return path12.join(subscriptionsDir, `${id}${SUBSCRIPTION_EXTENSION}`);
}
function createTaskfoldFileSubscriptionStore(options) {
  const { subscriptionsDir } = options;
  return {
    async register(key, value) {
      assertValidSubscriptionPayload(key, value);
      writeFileAtomic(
        subscriptionFilePath(subscriptionsDir, key),
        JSON.stringify(value.subscription, null, 2)
      );
    },
    async lookup(key) {
      const content = readFileIfExists(subscriptionFilePath(subscriptionsDir, key));
      return content === void 0 ? void 0 : { version: 1, subscription: JSON.parse(content) };
    },
    async delete(key) {
      return removeFileIfExists(subscriptionFilePath(subscriptionsDir, key));
    },
    async entries() {
      const results = [];
      for (const fileName of listFileNamesSafe(subscriptionsDir)) {
        if (!fileName.endsWith(SUBSCRIPTION_EXTENSION)) {
          continue;
        }
        const content = readFileIfExists(path12.join(subscriptionsDir, fileName));
        if (content !== void 0) {
          const subscription = JSON.parse(content);
          results.push({ key: subscription.id, value: { version: 1, subscription } });
        }
      }
      return results;
    },
    // 没有条件写的调用方（需求/16 R1 只要求卡片）；显式拒绝，绝不静默穿透成无条件写。
    compareAndSwap: unsupportedTaskfoldCompareAndSwap
  };
}
var SUBSCRIPTION_EXTENSION;
var init_file_store_subscriptions = __esm({
  "../core/src/file-store-subscriptions.ts"() {
    "use strict";
    init_file_store_cas();
    init_file_store_atomic();
    SUBSCRIPTION_EXTENSION = ".json";
  }
});

// ../core/src/file-store-attachments.ts
import path13 from "node:path";
function assertValidAttachmentPayload(key, value) {
  if (value.version !== 1 || value.attachment.id !== key) {
    throw new Error("invalid taskfold attachment payload");
  }
}
function findAttachmentMetadata(cardsDir, cardCodec, attachmentId) {
  for (const fileName of listFileNamesSafe(cardsDir)) {
    if (!fileName.endsWith(".md")) {
      continue;
    }
    const content = readBufferIfExists(path13.join(cardsDir, fileName))?.toString("utf8");
    if (content === void 0) {
      continue;
    }
    let card;
    try {
      card = cardCodec.parse(content);
    } catch {
      continue;
    }
    const match = card.metadata?.attachments?.find((attachment) => attachment.id === attachmentId);
    if (match) {
      return match;
    }
  }
  return void 0;
}
function createTaskfoldFileAttachmentStore(options) {
  const { attachmentsDir, cardsDir, cardCodec } = options;
  function blobPath(id) {
    return path13.join(attachmentsDir, id);
  }
  function lookupJoined(id) {
    const blob = readBufferIfExists(blobPath(id));
    if (!blob) {
      return void 0;
    }
    const attachment = findAttachmentMetadata(cardsDir, cardCodec, id);
    if (!attachment) {
      return void 0;
    }
    return { version: 1, attachment, contentBase64: blobToBase64(blob) };
  }
  return {
    async register(key, value) {
      assertValidAttachmentPayload(key, value);
      writeFileAtomic(blobPath(key), asBlobContent(value.contentBase64));
    },
    async lookup(key) {
      return lookupJoined(key);
    },
    async delete(key) {
      return removeFileIfExists(blobPath(key));
    },
    async entries() {
      const results = [];
      for (const id of listFileNamesSafe(attachmentsDir)) {
        const joined = lookupJoined(id);
        if (joined) {
          results.push({ key: id, value: joined });
        }
      }
      return results;
    },
    // 没有条件写的调用方（需求/16 R1 只要求卡片）；显式拒绝，绝不静默穿透成无条件写。
    compareAndSwap: unsupportedTaskfoldCompareAndSwap
  };
}
var init_file_store_attachments = __esm({
  "../core/src/file-store-attachments.ts"() {
    "use strict";
    init_file_store_cas();
    init_file_store_atomic();
  }
});

// ../core/src/file-store-boards.ts
function assertValidBoardPayload(key, value) {
  if (value.version !== 1 || value.board.id !== key) {
    throw new Error("invalid taskfold board payload");
  }
}
function readRegistry(projectsJsonPath) {
  const content = readFileIfExists(projectsJsonPath);
  if (content === void 0) {
    return {};
  }
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function writeRegistry(projectsJsonPath, registry) {
  writeFileAtomic(projectsJsonPath, JSON.stringify(registry, null, 2));
}
function createTaskfoldFileBoardStore(options) {
  const { projectsJsonPath } = options;
  return {
    async register(key, value) {
      assertValidBoardPayload(key, value);
      const registry = readRegistry(projectsJsonPath);
      registry[key] = value;
      writeRegistry(projectsJsonPath, registry);
    },
    async lookup(key) {
      return readRegistry(projectsJsonPath)[key];
    },
    async delete(key) {
      const registry = readRegistry(projectsJsonPath);
      if (!(key in registry)) {
        return false;
      }
      delete registry[key];
      writeRegistry(projectsJsonPath, registry);
      return true;
    },
    async entries() {
      return Object.entries(readRegistry(projectsJsonPath)).map(([key, value]) => ({
        key,
        value
      }));
    },
    // 没有条件写的调用方（需求/16 R1 只要求卡片）；显式拒绝，绝不静默穿透成无条件写。
    compareAndSwap: unsupportedTaskfoldCompareAndSwap
  };
}
var init_file_store_boards = __esm({
  "../core/src/file-store-boards.ts"() {
    "use strict";
    init_file_store_cas();
    init_file_store_atomic();
  }
});

// ../core/src/file-store.ts
import path14 from "node:path";
function createTaskfoldFileStores(options) {
  const layout = resolveTaskfoldFileStoreLayout({
    dataDir: resolveTaskfoldMainCheckoutPath(options.dataDir),
    ...options.pluginDir === void 0 ? {} : { pluginDir: options.pluginDir }
  });
  const projectRoot = path14.basename(layout.dataDir) === ".taskfold" ? path14.dirname(layout.dataDir) : layout.dataDir;
  const canWrite = () => isTaskfoldFormatWritable(layout.configPath);
  const assertWritable = () => assertTaskfoldFormatWritable(layout.configPath);
  const writableAtOpen = canWrite();
  if (writableAtOpen) {
    ensureTaskfoldDataDirectories(layout);
    ensureTaskfoldFormatVersion(layout.configPath);
  }
  ensureTaskfoldPluginDirectories(layout);
  const cardCodec = withProjectPaths(options.cardCodec ?? createMarkdownCardCodec(), projectRoot);
  const milestoneCodec = options.milestoneCodec ?? createMarkdownMilestoneCodec();
  const externalChangeReconciler = createTaskfoldExternalChangeReconciler({
    cardsDir: layout.cardsDir,
    runtimeCardsDir: layout.runtimeCardsDir,
    locksDir: layout.locksDir,
    codec: cardCodec,
    canWrite
  });
  const cards = rejectWritesUnlessFormatWritable(assertWritable, createTaskfoldFileCardStore({
    cardsDir: layout.cardsDir,
    archiveCardsDir: layout.archiveCardsDir,
    attachmentsDir: layout.attachmentsDir,
    codec: cardCodec,
    locksDir: layout.locksDir,
    runtimeCardsDir: layout.runtimeCardsDir
  }));
  const boards = layout.projectsJsonPath === void 0 ? createProcessLocalStore() : createTaskfoldFileBoardStore({ projectsJsonPath: layout.projectsJsonPath });
  const milestones = rejectWritesUnlessFormatWritable(assertWritable, createTaskfoldFileMilestoneStore({
    milestonesDir: layout.milestonesDir,
    configPath: layout.configPath,
    codec: milestoneCodec,
    locksDir: layout.locksDir
  }));
  const documents = rejectWritesUnlessFormatWritable(
    assertWritable,
    createTaskfoldFileDocumentStore({ documentsDir: layout.documentsDir, projectRoot })
  );
  const subscriptions = layout.subscriptionsDir === void 0 ? createProcessLocalStore() : createTaskfoldFileSubscriptionStore({ subscriptionsDir: layout.subscriptionsDir });
  const attachments = rejectWritesUnlessFormatWritable(assertWritable, createTaskfoldFileAttachmentStore({
    attachmentsDir: layout.attachmentsDir,
    cardsDir: layout.cardsDir,
    cardCodec
  }));
  const changeEpoch = ensureFileChangeEpoch(layout.changesLogPath, layout.locksDir, writableAtOpen);
  const changeSource = createTaskfoldFileChangeSource({
    changesLogPath: layout.changesLogPath,
    locksDir: layout.locksDir,
    dataVersion: externalChangeReconciler.dataVersion,
    canWrite
  });
  return {
    cards,
    boards,
    milestones,
    documents,
    subscriptions,
    attachments,
    dataVersion: externalChangeReconciler.dataVersion,
    changeEpoch,
    reserveChangeRevisions: (count) => {
      assertWritable();
      return reserveFileChangeRevisions(layout.changesLogPath, count, layout.locksDir);
    },
    changeSource,
    // Nothing to release: this backend holds no open file descriptors or watchers
    // between calls (every read/write in this skeleton opens and closes its own fd).
    // Kept for shape parity with createTaskfoldSqliteStores, and as the seam a future
    // fs.watch-based R3/R4 detector would close.
    close: () => {
    }
  };
}
function createProcessLocalStore() {
  const values = /* @__PURE__ */ new Map();
  return {
    register: async (key, value) => {
      values.set(key, structuredClone(value));
    },
    lookup: async (key) => {
      const value = values.get(key);
      return value === void 0 ? void 0 : structuredClone(value);
    },
    delete: async (key) => values.delete(key),
    entries: async () => [...values].map(([key, value]) => ({ key, value: structuredClone(value) })),
    // 没有条件写的调用方；显式拒绝（file-store-cas.ts），绝不静默穿透成无条件写。
    compareAndSwap: unsupportedTaskfoldCompareAndSwap
  };
}
function rejectWritesUnlessFormatWritable(assertWritable, store) {
  return {
    register: async (key, value) => {
      assertWritable();
      await store.register(key, value);
    },
    lookup: async (key) => await store.lookup(key),
    delete: async (key) => {
      assertWritable();
      return await store.delete(key);
    },
    entries: async () => await store.entries(),
    compareAndSwap: async (key, expectedRevision, value, onReject) => {
      assertWritable();
      return await store.compareAndSwap(key, expectedRevision, value, onReject);
    },
    ...store.registerIfAbsent ? {
      registerIfAbsent: async (key, value) => {
        assertWritable();
        return await store.registerIfAbsent(key, value);
      }
    } : {}
  };
}
var init_file_store = __esm({
  "../core/src/file-store.ts"() {
    "use strict";
    init_file_store_paths();
    init_file_store_path_resolver();
    init_file_store_format();
    init_file_store_change_cursor();
    init_file_store_reconcile();
    init_file_store_codec();
    init_file_store_cards();
    init_file_store_project_paths();
    init_file_store_cas();
    init_file_store_milestones();
    init_file_store_documents();
    init_file_store_subscriptions();
    init_file_store_attachments();
    init_file_store_boards();
    init_file_store_paths();
    init_file_store_card_id();
    init_file_store_path_resolver();
    init_file_store_format();
  }
});

// ../core/src/card-redaction.ts
function redactClaimToken(card) {
  const claim = card.metadata?.claim;
  if (!claim) {
    return card;
  }
  return {
    ...card,
    metadata: {
      ...card.metadata,
      claim: {
        ...claim,
        token: "[redacted]"
      }
    }
  };
}
var init_card_redaction = __esm({
  "../core/src/card-redaction.ts"() {
    "use strict";
  }
});

// ../core/src/card-lookup.ts
function resolveTaskfoldCardByIdOrPrefix(cards, id) {
  const exact = cards.find((card2) => card2.id === id);
  if (exact) {
    return { card: exact };
  }
  const matches = cards.filter((card2) => card2.id.startsWith(id));
  if (matches.length === 0) {
    return { error: `Card not found: ${id}` };
  }
  if (matches.length > 1) {
    return { error: `Ambiguous card id prefix: ${id} (${matches.length} matches)` };
  }
  const card = matches[0];
  return card ? { card } : { error: `Card not found: ${id}` };
}
var init_card_lookup = __esm({
  "../core/src/card-lookup.ts"() {
    "use strict";
  }
});

// src/backend/src/change-aggregator.ts
import { randomUUID as randomUUID8 } from "node:crypto";
var TaskfoldAggregatedChangeSource;
var init_change_aggregator = __esm({
  "src/backend/src/change-aggregator.ts"() {
    "use strict";
    TaskfoldAggregatedChangeSource = class {
      /**
       * @param discover 找出新出现的项目目录并打开（组合 store 给出）；返回是否打开了新项目。
       *   poll 是同步契约，这里只把它发起、不等它：新项目在下一次 poll 时算作一次变化。
       */
      constructor(discover, warn) {
        this.discover = discover;
        this.warn = warn;
      }
      epoch = randomUUID8();
      revision = 0;
      projects = /* @__PURE__ */ new Set();
      dirty = /* @__PURE__ */ new Set();
      discovering = false;
      discovered = false;
      addProject(source) {
        this.projects.add(source);
      }
      /** 本进程刚往这个项目写过：下一次 record() 在它的 changes.log 里记一笔。 */
      markDirty(source) {
        this.dirty.add(source);
      }
      announce() {
        this.startDiscovery();
        return this.next();
      }
      async record() {
        const dirty = [...this.dirty];
        this.dirty.clear();
        for (const source of dirty) {
          await source.record();
        }
        return this.next();
      }
      poll() {
        let changed = this.discovered;
        this.discovered = false;
        for (const source of this.projects) {
          changed = source.poll() !== void 0 || changed;
        }
        this.startDiscovery();
        return changed ? this.next() : void 0;
      }
      startDiscovery() {
        if (!this.discover || this.discovering) {
          return;
        }
        this.discovering = true;
        this.discover().then(
          (found) => {
            this.discovering = false;
            this.discovered ||= found;
          },
          (error) => {
            this.discovering = false;
            this.warn?.(`taskfold: project discovery failed: ${String(error)}`);
          }
        );
      }
      next() {
        this.revision += 1;
        return { epoch: this.epoch, revision: this.revision };
      }
    };
  }
});

// src/backend/src/project-routed-stores.ts
import fs10 from "node:fs";
import path17 from "node:path";
function taskfoldPluginProjectDataDir(pluginDir, boardId) {
  return path17.join(pluginDir, "projects", boardId);
}
function taskfoldProjectDataDir(pluginDir, boardId, board) {
  const workspace = board?.defaultWorkspace;
  if (workspace && (workspace.kind === "dir" || workspace.kind === "worktree") && (workspace.sourcePath ?? workspace.path)) {
    return resolveTaskfoldDataDir(workspace);
  }
  return taskfoldPluginProjectDataDir(pluginDir, boardId);
}
function isDirectory(target) {
  try {
    return fs10.statSync(target).isDirectory();
  } catch {
    return false;
  }
}
function listDirectoryNames(dir) {
  try {
    return fs10.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}
function cardBoardId2(value) {
  return value.card.metadata?.automation?.boardId ?? "default";
}
function createTaskfoldProjectRoutedStores(options) {
  const pluginDir = path17.resolve(options.pluginDir);
  const warn = options.warn ?? ((message) => console.warn(message));
  const projectsRootDir = path17.join(pluginDir, "projects");
  const pluginLayout = resolveTaskfoldFileStoreLayout({ dataDir: projectsRootDir, pluginDir });
  const ensurePluginDir = () => ensureTaskfoldPluginDirectories(pluginLayout);
  const rawBoards = createTaskfoldFileBoardStore({ projectsJsonPath: pluginLayout.projectsJsonPath });
  const rawSubscriptions = createTaskfoldFileSubscriptionStore({ subscriptionsDir: pluginLayout.subscriptionsDir });
  const roots = /* @__PURE__ */ new Map();
  const mainCheckoutCache = /* @__PURE__ */ new Map();
  const warned = /* @__PURE__ */ new Set();
  const changeSource = new TaskfoldAggregatedChangeSource(discoverRoots, warn);
  function mainCheckout(dataDir) {
    let resolved = mainCheckoutCache.get(dataDir);
    if (resolved === void 0) {
      resolved = resolveTaskfoldMainCheckoutPath(dataDir);
      mainCheckoutCache.set(dataDir, resolved);
    }
    return resolved;
  }
  async function dataDirForBoardId(boardId) {
    const board = await rawBoards.lookup(boardId);
    return mainCheckout(taskfoldProjectDataDir(pluginDir, boardId, board?.version === 1 ? board.board : void 0));
  }
  async function knownDataDirs() {
    const dirs = new Set(roots.keys());
    for (const { value } of await rawBoards.entries()) {
      if (value?.version === 1 && value.board?.id) {
        dirs.add(mainCheckout(taskfoldProjectDataDir(pluginDir, value.board.id, value.board)));
      }
    }
    for (const name of listDirectoryNames(projectsRootDir)) {
      if (BOARD_DIR_NAME.test(name)) {
        dirs.add(path17.join(projectsRootDir, name));
      }
    }
    return [...dirs];
  }
  function openRoot(dataDir, create) {
    const existing = roots.get(dataDir);
    if (existing) {
      return existing;
    }
    if (!create && !isDirectory(dataDir)) {
      return void 0;
    }
    if (dataDir.startsWith(`${projectsRootDir}${path17.sep}`)) {
      ensurePluginDir();
    }
    const stores = createTaskfoldFileStores({ dataDir });
    const root = {
      dataDir,
      attachmentsDir: resolveTaskfoldFileStoreLayout({ dataDir }).attachmentsDir,
      stores
    };
    roots.set(dataDir, root);
    changeSource.addProject(stores.changeSource);
    return root;
  }
  async function openRoots() {
    for (const dataDir of await knownDataDirs()) {
      openRoot(dataDir, false);
    }
    return [...roots.values()];
  }
  async function discoverRoots() {
    let opened = false;
    for (const dataDir of await knownDataDirs()) {
      if (!roots.has(dataDir) && openRoot(dataDir, false)) {
        opened = true;
      }
    }
    return opened;
  }
  async function targetRoot(boardId) {
    return openRoot(await dataDirForBoardId(boardId), true);
  }
  function markDirty(root) {
    changeSource.markDirty(root.stores.changeSource);
  }
  async function locate(spec, key) {
    const found = [];
    for (const root of await openRoots()) {
      const value = await spec.pick(root.stores).lookup(key);
      if (value !== void 0) {
        found.push({ root, value });
      }
    }
    return found;
  }
  async function choose(spec, key, found) {
    if (found.length === 1) {
      return found[0];
    }
    const scored = await Promise.all(
      found.map(async (candidate, index) => ({
        candidate,
        index,
        revision: spec.revisionOf?.(candidate.value) ?? 0,
        home: await dataDirForBoardId(spec.boardOf(candidate.value)) === candidate.root.dataDir
      }))
    );
    scored.sort((a, b) => b.revision - a.revision || Number(b.home) - Number(a.home) || a.index - b.index);
    const chosen = scored[0].candidate;
    const places = scored.map(({ candidate, revision }) => `${candidate.root.dataDir}${spec.revisionOf ? ` (revision ${revision})` : ""}`).join(", ");
    const signature = `${spec.label}:${key}:${places}`;
    if (!warned.has(signature)) {
      warned.add(signature);
      warn(
        `taskfold: ${spec.label} ${key} exists in ${found.length} project data roots: ${places}; using the copy in ${chosen.root.dataDir}. Remove the other copy once you have checked it.`
      );
    }
    return chosen;
  }
  async function removeOtherCopies(spec, key, found, keep) {
    for (const { root } of found) {
      if (root === keep) {
        continue;
      }
      try {
        if (await spec.pick(root.stores).delete(key)) {
          markDirty(root);
        }
      } catch (error) {
        warn(
          `taskfold: ${spec.label} ${key} was written to ${keep.dataDir}, but its old copy in ${root.dataDir} could not be removed (${String(error)}); both copies exist until it is removed by hand.`
        );
      }
    }
  }
  function copyAttachmentBlobs(card, from, to) {
    for (const attachment of card.metadata?.attachments ?? []) {
      const target = path17.join(to.attachmentsDir, attachment.id);
      const content = readBufferIfExists(path17.join(from.attachmentsDir, attachment.id));
      if (content !== void 0 && !fs10.existsSync(target)) {
        writeFileAtomic(target, content);
      }
    }
  }
  async function writeTarget(spec, current, value) {
    if (current && spec.boardOf(current.value) === spec.boardOf(value)) {
      return current.root;
    }
    return await targetRoot(spec.boardOf(value));
  }
  function routedEntityStore(spec) {
    return {
      async register(key, value) {
        const found = await locate(spec, key);
        const current = found.length > 0 ? await choose(spec, key, found) : void 0;
        const target = await writeTarget(spec, current, value);
        await spec.pick(target.stores).register(key, value);
        markDirty(target);
        await removeOtherCopies(spec, key, found, target);
      },
      async lookup(key) {
        const found = await locate(spec, key);
        return found.length > 0 ? (await choose(spec, key, found)).value : void 0;
      },
      async delete(key) {
        let deleted = false;
        for (const { root } of await locate(spec, key)) {
          if (await spec.pick(root.stores).delete(key)) {
            deleted = true;
            markDirty(root);
          }
        }
        return deleted;
      },
      async entries() {
        const byKey = /* @__PURE__ */ new Map();
        for (const root of await openRoots()) {
          for (const { key, value } of await spec.pick(root.stores).entries()) {
            const list = byKey.get(key) ?? [];
            list.push({ root, value });
            byKey.set(key, list);
          }
        }
        const result = [];
        for (const [key, found] of byKey) {
          result.push({ key, value: (await choose(spec, key, found)).value });
        }
        return result;
      },
      // 里程碑/文档没有条件写的调用方（需求/16 R1 只要求卡片）；显式拒绝，绝不静默穿透。
      compareAndSwap: unsupportedTaskfoldCompareAndSwap
    };
  }
  const cardSpec = {
    label: "card",
    pick: (stores) => stores.cards,
    boardOf: cardBoardId2,
    revisionOf: (value) => value.card.revision
  };
  const routedCards = routedEntityStore(cardSpec);
  const cards = {
    ...routedCards,
    async register(key, value) {
      const found = await locate(cardSpec, key);
      const current = found.length > 0 ? await choose(cardSpec, key, found) : void 0;
      const target = await writeTarget(cardSpec, current, value);
      if (current && target !== current.root) {
        copyAttachmentBlobs(value.card, current.root, target);
      }
      await target.stores.cards.register(key, value);
      markDirty(target);
      await removeOtherCopies(cardSpec, key, found, target);
    },
    async compareAndSwap(key, expectedRevision, value, onReject) {
      const found = await locate(cardSpec, key);
      if (found.length === 0) {
        onReject?.("missing");
        return false;
      }
      const current = await choose(cardSpec, key, found);
      const target = await writeTarget(cardSpec, current, value);
      if (target === current.root) {
        const swapped = await current.root.stores.cards.compareAndSwap(key, expectedRevision, value, onReject);
        if (swapped) {
          markDirty(current.root);
          await removeOtherCopies(cardSpec, key, found, current.root);
        }
        return swapped;
      }
      if (current.value.card.revision !== expectedRevision) {
        onReject?.("revision");
        return false;
      }
      copyAttachmentBlobs(value.card, current.root, target);
      await target.stores.cards.register(key, value);
      markDirty(target);
      await removeOtherCopies(cardSpec, key, found, target);
      return true;
    },
    async registerIfAbsent(key, value) {
      if ((await locate(cardSpec, key)).length > 0) {
        return false;
      }
      const target = await targetRoot(cardBoardId2(value));
      const inserted = await target.stores.cards.registerIfAbsent(key, value);
      if (inserted) {
        markDirty(target);
      }
      return inserted;
    }
  };
  const milestones = routedEntityStore({
    label: "milestone",
    pick: (stores) => stores.milestones,
    boardOf: (value) => value.milestone.boardId
  });
  const documents = routedEntityStore({
    label: "project document",
    pick: (stores) => stores.documents,
    boardOf: (value) => value.document.boardId
  });
  const attachments = {
    async register(key, value) {
      const owners = await locate(cardSpec, value.attachment.cardId);
      if (owners.length === 0) {
        throw new Error(`taskfold: card ${value.attachment.cardId} not found for attachment ${key}`);
      }
      const owner = await choose(cardSpec, value.attachment.cardId, owners);
      await owner.root.stores.attachments.register(key, value);
    },
    async lookup(key) {
      for (const root of await openRoots()) {
        const value = await root.stores.attachments.lookup(key);
        if (value !== void 0) {
          return value;
        }
      }
      return void 0;
    },
    async delete(key) {
      let deleted = false;
      for (const root of await openRoots()) {
        deleted = await root.stores.attachments.delete(key) || deleted;
      }
      return deleted;
    },
    async entries() {
      const seen = /* @__PURE__ */ new Set();
      const result = [];
      for (const root of await openRoots()) {
        for (const entry of await root.stores.attachments.entries()) {
          if (!seen.has(entry.key)) {
            seen.add(entry.key);
            result.push(entry);
          }
        }
      }
      return result;
    },
    // 附件没有条件写的调用方（需求/16 R1 只要求卡片）；显式拒绝，绝不静默穿透。
    compareAndSwap: unsupportedTaskfoldCompareAndSwap
  };
  const boards = {
    ...rawBoards,
    async register(key, value) {
      ensurePluginDir();
      await rawBoards.register(key, value);
    }
  };
  const subscriptions = {
    ...rawSubscriptions,
    async register(key, value) {
      ensurePluginDir();
      await rawSubscriptions.register(key, value);
    }
  };
  return { cards, boards, milestones, documents, subscriptions, attachments, changeSource };
}
var BOARD_DIR_NAME;
var init_project_routed_stores = __esm({
  "src/backend/src/project-routed-stores.ts"() {
    "use strict";
    init_file_store_atomic();
    init_file_store_boards();
    init_file_store_cas();
    init_file_store();
    init_file_store_paths();
    init_file_store_subscriptions();
    init_change_aggregator();
    BOARD_DIR_NAME = /^[a-z0-9][a-z0-9._-]{0,79}$/;
  }
});

// src/backend/src/sqlite-store.ts
import { DatabaseSync } from "node:sqlite";
function parseJson(value) {
  if (typeof value !== "string" || !value) {
    return void 0;
  }
  return JSON.parse(value);
}
function stringValue2(row, key) {
  const value = row[key];
  return typeof value === "string" && value.length > 0 ? value : void 0;
}
function numberValue2(row, key) {
  const value = row[key];
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : void 0;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  return void 0;
}
function requiredString2(row, key) {
  const value = stringValue2(row, key);
  if (!value) {
    throw new Error(`taskfold sqlite row missing ${key}`);
  }
  return value;
}
function requiredNumber(row, key) {
  const value = numberValue2(row, key);
  if (value === void 0) {
    throw new Error(`taskfold sqlite row missing ${key}`);
  }
  return value;
}
function optional2(value) {
  return Object.keys(value).length > 0 ? value : void 0;
}
function blobToBase642(value) {
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("base64");
  }
  if (typeof value === "string") {
    return Buffer.from(value).toString("base64");
  }
  return "";
}
function childRows(db, table, cardId) {
  return db.prepare(`SELECT * FROM ${table} WHERE card_id = ? ORDER BY ordinal ASC`).all(cardId);
}
function readLabels(db, cardId) {
  return childRows(db, "taskfold_card_labels", cardId).flatMap((row) => {
    const label = stringValue2(row, "label");
    return label ? [label] : [];
  });
}
function readEvents(db, cardId) {
  const events = childRows(db, "taskfold_card_events", cardId).map((row) => {
    const event = {
      id: requiredString2(row, "id"),
      kind: requiredString2(row, "kind"),
      at: requiredNumber(row, "at")
    };
    const fromStatus = stringValue2(row, "from_status");
    const toStatus = stringValue2(row, "to_status");
    const fromMilestoneId = stringValue2(row, "from_milestone_id");
    const toMilestoneId = stringValue2(row, "to_milestone_id");
    const sessionKey = stringValue2(row, "session_key");
    const runId = stringValue2(row, "run_id");
    if (fromStatus) {
      event.fromStatus = fromStatus;
    }
    if (toStatus) {
      event.toStatus = toStatus;
    }
    if (fromMilestoneId) {
      event.fromMilestoneId = fromMilestoneId;
    }
    if (toMilestoneId) {
      event.toMilestoneId = toMilestoneId;
    }
    if (sessionKey) {
      event.sessionKey = sessionKey;
    }
    if (runId) {
      event.runId = runId;
    }
    return event;
  });
  return events.length > 0 ? events : void 0;
}
function readExecution(row) {
  const id = stringValue2(row, "execution_id");
  if (!id) {
    return void 0;
  }
  return {
    id,
    kind: "agent-session",
    mode: requiredString2(row, "execution_mode"),
    status: requiredString2(row, "execution_status"),
    ...stringValue2(row, "execution_engine") ? { engine: stringValue2(row, "execution_engine") } : {},
    ...stringValue2(row, "execution_model") ? { model: stringValue2(row, "execution_model") } : {},
    ...stringValue2(row, "execution_session_key") ? { sessionKey: stringValue2(row, "execution_session_key") } : {},
    ...stringValue2(row, "execution_run_id") ? { runId: stringValue2(row, "execution_run_id") } : {},
    startedAt: requiredNumber(row, "execution_started_at"),
    updatedAt: requiredNumber(row, "execution_updated_at")
  };
}
function readMetadata(db, row) {
  const cardId = requiredString2(row, "id");
  const attempts = childRows(db, "taskfold_card_attempts", cardId).map((child) => {
    const entry = {
      id: requiredString2(child, "id"),
      status: requiredString2(child, "status"),
      startedAt: requiredNumber(child, "started_at")
    };
    const endedAt = numberValue2(child, "ended_at");
    const engine = stringValue2(child, "engine");
    const mode = stringValue2(child, "mode");
    const model = stringValue2(child, "model");
    const sessionKey = stringValue2(child, "session_key");
    const runId = stringValue2(child, "run_id");
    const error = stringValue2(child, "error");
    const promptVersion = numberValue2(child, "prompt_version");
    if (promptVersion !== void 0) {
      entry.promptVersion = promptVersion;
    }
    if (endedAt !== void 0) {
      entry.endedAt = endedAt;
    }
    if (engine) {
      entry.engine = engine;
    }
    if (mode) {
      entry.mode = mode;
    }
    if (model) {
      entry.model = model;
    }
    if (sessionKey) {
      entry.sessionKey = sessionKey;
    }
    if (runId) {
      entry.runId = runId;
    }
    if (error) {
      entry.error = error;
    }
    return entry;
  });
  const comments = childRows(db, "taskfold_card_comments", cardId).map((child) => {
    const entry = {
      id: requiredString2(child, "id"),
      body: requiredString2(child, "body"),
      createdAt: requiredNumber(child, "created_at")
    };
    const updatedAt = numberValue2(child, "updated_at");
    if (updatedAt !== void 0) {
      entry.updatedAt = updatedAt;
    }
    return entry;
  });
  const links = childRows(db, "taskfold_card_links", cardId).map((child) => {
    const entry = {
      id: requiredString2(child, "id"),
      type: requiredString2(child, "type"),
      createdAt: requiredNumber(child, "created_at")
    };
    const targetCardId = stringValue2(child, "target_card_id");
    const title = stringValue2(child, "title");
    const url = stringValue2(child, "url");
    if (targetCardId) {
      entry.targetCardId = targetCardId;
    }
    if (title) {
      entry.title = title;
    }
    if (url) {
      entry.url = url;
    }
    return entry;
  });
  const proof = childRows(db, "taskfold_card_proof", cardId).map((child) => {
    const entry = {
      id: requiredString2(child, "id"),
      status: requiredString2(child, "status"),
      createdAt: requiredNumber(child, "created_at")
    };
    const label = stringValue2(child, "label");
    const command = stringValue2(child, "command");
    const url = stringValue2(child, "url");
    const note = stringValue2(child, "note");
    if (label) {
      entry.label = label;
    }
    if (command) {
      entry.command = command;
    }
    if (url) {
      entry.url = url;
    }
    if (note) {
      entry.note = note;
    }
    return entry;
  });
  const artifacts = childRows(db, "taskfold_card_artifacts", cardId).map((child) => {
    const entry = {
      id: requiredString2(child, "id"),
      createdAt: requiredNumber(child, "created_at")
    };
    const label = stringValue2(child, "label");
    const url = stringValue2(child, "url");
    const artifactPath = stringValue2(child, "path");
    const mimeType = stringValue2(child, "mime_type");
    if (label) {
      entry.label = label;
    }
    if (url) {
      entry.url = url;
    }
    if (artifactPath) {
      entry.path = artifactPath;
    }
    if (mimeType) {
      entry.mimeType = mimeType;
    }
    return entry;
  });
  const attachments = childRows(db, "taskfold_card_attachments", cardId).map((child) => {
    const entry = {
      id: requiredString2(child, "id"),
      cardId: requiredString2(child, "card_id"),
      createdAt: requiredNumber(child, "created_at"),
      fileName: requiredString2(child, "file_name"),
      byteSize: requiredNumber(child, "byte_size")
    };
    const mimeType = stringValue2(child, "mime_type");
    const note = stringValue2(child, "note");
    if (mimeType) {
      entry.mimeType = mimeType;
    }
    if (note) {
      entry.note = note;
    }
    return entry;
  });
  const workerLogs = childRows(db, "taskfold_worker_logs", cardId).map((child) => {
    const entry = {
      id: requiredString2(child, "id"),
      createdAt: requiredNumber(child, "created_at"),
      level: requiredString2(child, "level"),
      message: requiredString2(child, "message")
    };
    const sessionKey = stringValue2(child, "session_key");
    const runId = stringValue2(child, "run_id");
    if (sessionKey) {
      entry.sessionKey = sessionKey;
    }
    if (runId) {
      entry.runId = runId;
    }
    return entry;
  });
  const diagnostics = childRows(db, "taskfold_card_diagnostics", cardId).map((child) => ({
    kind: requiredString2(child, "kind"),
    severity: requiredString2(child, "severity"),
    title: requiredString2(child, "title"),
    detail: requiredString2(child, "detail"),
    firstSeenAt: requiredNumber(child, "first_seen_at"),
    lastSeenAt: requiredNumber(child, "last_seen_at"),
    count: requiredNumber(child, "count"),
    actions: parseJson(child.actions_json) ?? []
  }));
  const notifications = childRows(db, "taskfold_card_notifications", cardId).map((child) => {
    const entry = {
      id: requiredString2(child, "id"),
      kind: requiredString2(child, "kind"),
      createdAt: requiredNumber(child, "created_at"),
      message: requiredString2(child, "message")
    };
    const sequence = numberValue2(child, "sequence");
    const sessionKey = stringValue2(child, "session_key");
    const runId = stringValue2(child, "run_id");
    if (sequence !== void 0) {
      entry.sequence = sequence;
    }
    if (sessionKey) {
      entry.sessionKey = sessionKey;
    }
    if (runId) {
      entry.runId = runId;
    }
    return entry;
  });
  const protocol = db.prepare("SELECT * FROM taskfold_worker_protocol WHERE card_id = ?").get(cardId);
  const automation = parseJson(row.automation_json);
  const claim = parseJson(row.claim_json);
  const stale = parseJson(row.stale_json);
  const lifecycleStatusSourceUpdatedAt = numberValue2(row, "lifecycle_status_source_updated_at");
  return optional2({
    ...attempts.length > 0 ? { attempts } : {},
    ...comments.length > 0 ? { comments } : {},
    ...links.length > 0 ? { links } : {},
    ...proof.length > 0 ? { proof } : {},
    ...artifacts.length > 0 ? { artifacts } : {},
    ...attachments.length > 0 ? { attachments } : {},
    ...workerLogs.length > 0 ? { workerLogs } : {},
    ...protocol ? {
      workerProtocol: {
        state: requiredString2(protocol, "state"),
        updatedAt: requiredNumber(protocol, "updated_at"),
        ...stringValue2(protocol, "detail") ? { detail: stringValue2(protocol, "detail") } : {}
      }
    } : {},
    ...automation ? { automation } : {},
    ...claim ? { claim } : {},
    ...diagnostics.length > 0 ? { diagnostics } : {},
    ...notifications.length > 0 ? { notifications } : {},
    ...stringValue2(row, "template_id") ? { templateId: stringValue2(row, "template_id") } : {},
    ...numberValue2(row, "archived_at") !== void 0 ? { archivedAt: numberValue2(row, "archived_at") } : {},
    ...stale ? { stale } : {},
    ...lifecycleStatusSourceUpdatedAt !== void 0 ? { lifecycleStatusSourceUpdatedAt } : {},
    ...numberValue2(row, "failure_count") !== void 0 ? { failureCount: numberValue2(row, "failure_count") } : {}
  });
}
function readDelivery(db, cardId) {
  const row = db.prepare("SELECT * FROM taskfold_card_delivery WHERE card_id = ?").get(cardId);
  if (!row) {
    return void 0;
  }
  const delivery = {
    updatedAt: requiredNumber(row, "updated_at")
  };
  const objective = stringValue2(row, "objective");
  const deliverySummary = stringValue2(row, "delivery_summary");
  const openItems = stringValue2(row, "open_items");
  const implementationState = stringValue2(row, "implementation_state");
  const verificationState = stringValue2(row, "verification_state");
  const releaseState = stringValue2(row, "release_state");
  if (objective) {
    delivery.objective = objective;
  }
  if (deliverySummary) {
    delivery.deliverySummary = deliverySummary;
  }
  if (openItems) {
    delivery.openItems = openItems;
  }
  if (implementationState) {
    delivery.implementationState = implementationState;
  }
  if (verificationState) {
    delivery.verificationState = verificationState;
  }
  if (releaseState) {
    delivery.releaseState = releaseState;
  }
  return delivery;
}
function readSourceReferences(db, cardId) {
  return childRows(db, "taskfold_card_source_references", cardId).map((child) => {
    const reference = {
      id: requiredString2(child, "id"),
      label: requiredString2(child, "label"),
      target: requiredString2(child, "target"),
      position: requiredNumber(child, "position"),
      createdAt: requiredNumber(child, "created_at"),
      updatedAt: requiredNumber(child, "updated_at")
    };
    const note = stringValue2(child, "note");
    if (note) {
      reference.note = note;
    }
    return reference;
  });
}
function readCard(db, row) {
  const card = {
    id: requiredString2(row, "id"),
    title: requiredString2(row, "title"),
    status: requiredString2(row, "status"),
    priority: requiredString2(row, "priority"),
    labels: readLabels(db, requiredString2(row, "id")),
    position: requiredNumber(row, "position"),
    createdAt: requiredNumber(row, "created_at"),
    updatedAt: requiredNumber(row, "updated_at"),
    revision: numberValue2(row, "revision") ?? 0
  };
  const metadata = readMetadata(db, row);
  const delivery = readDelivery(db, card.id);
  const sourceReferences = readSourceReferences(db, card.id);
  return {
    ...card,
    ...stringValue2(row, "card_kind") ? { kind: stringValue2(row, "card_kind") } : {},
    ...stringValue2(row, "notes") ? { notes: stringValue2(row, "notes") } : {},
    ...stringValue2(row, "agent_id") ? { agentId: stringValue2(row, "agent_id") } : {},
    ...stringValue2(row, "session_key") ? { sessionKey: stringValue2(row, "session_key") } : {},
    ...stringValue2(row, "run_id") ? { runId: stringValue2(row, "run_id") } : {},
    ...stringValue2(row, "task_id") ? { taskId: stringValue2(row, "task_id") } : {},
    ...stringValue2(row, "source_url") ? { sourceUrl: stringValue2(row, "source_url") } : {},
    ...stringValue2(row, "milestone_id") ? { milestoneId: stringValue2(row, "milestone_id") } : {},
    ...readExecution(row) ? { execution: readExecution(row) } : {},
    ...delivery ? { delivery } : {},
    ...sourceReferences.length ? { sourceReferences } : {},
    ...numberValue2(row, "started_at") !== void 0 ? { startedAt: numberValue2(row, "started_at") } : {},
    ...numberValue2(row, "completed_at") !== void 0 ? { completedAt: numberValue2(row, "completed_at") } : {},
    ...readEvents(db, card.id) ? { events: readEvents(db, card.id) } : {},
    ...metadata ? { metadata } : {}
  };
}
function readMilestone(row) {
  return {
    id: requiredString2(row, "id"),
    boardId: requiredString2(row, "board_id"),
    title: requiredString2(row, "title"),
    position: requiredNumber(row, "position"),
    state: requiredString2(row, "state"),
    createdAt: requiredNumber(row, "created_at"),
    updatedAt: requiredNumber(row, "updated_at"),
    ...stringValue2(row, "description") ? { description: stringValue2(row, "description") } : {},
    ...stringValue2(row, "color") ? { color: stringValue2(row, "color") } : {},
    ...numberValue2(row, "completed_at") !== void 0 ? { completedAt: numberValue2(row, "completed_at") } : {},
    ...numberValue2(row, "archived_at") !== void 0 ? { archivedAt: numberValue2(row, "archived_at") } : {}
  };
}
function readProjectDocument(row) {
  return {
    id: requiredString2(row, "id"),
    boardId: requiredString2(row, "board_id"),
    key: requiredString2(row, "document_key"),
    section: requiredString2(row, "section"),
    source: stringValue2(row, "source") ?? "project",
    type: requiredString2(row, "type"),
    title: requiredString2(row, "title"),
    position: requiredNumber(row, "position"),
    createdAt: requiredNumber(row, "created_at"),
    updatedAt: requiredNumber(row, "updated_at"),
    ...stringValue2(row, "summary") ? { summary: stringValue2(row, "summary") } : {},
    ...stringValue2(row, "target") ? { target: stringValue2(row, "target") } : {},
    ...stringValue2(row, "content") ? { content: stringValue2(row, "content") } : {},
    ...numberValue2(row, "hidden_at") !== void 0 ? { hiddenAt: numberValue2(row, "hidden_at") } : {},
    ...numberValue2(row, "system") === 1 ? { system: true } : {}
  };
}
function openTaskfoldSqliteStoresReadOnly(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  return {
    db,
    cards: new TaskfoldSqliteCardStore(db),
    boards: new TaskfoldSqliteBoardStore(db),
    milestones: new TaskfoldSqliteMilestoneStore(db),
    documents: new TaskfoldSqliteProjectDocumentStore(db),
    subscriptions: new TaskfoldSqliteSubscriptionStore(db),
    attachments: new TaskfoldSqliteAttachmentStore(db),
    close: () => db.close()
  };
}
var TaskfoldSqliteCardStore, TaskfoldSqliteBoardStore, TaskfoldSqliteMilestoneStore, TaskfoldSqliteProjectDocumentStore, TaskfoldSqliteSubscriptionStore, TaskfoldSqliteAttachmentStore;
var init_sqlite_store = __esm({
  "src/backend/src/sqlite-store.ts"() {
    "use strict";
    TaskfoldSqliteCardStore = class {
      constructor(db) {
        this.db = db;
      }
      async lookup(key) {
        const row = this.db.prepare("SELECT * FROM taskfold_cards WHERE id = ?").get(key);
        return row ? { version: 1, card: readCard(this.db, row) } : void 0;
      }
      async entries() {
        return this.db.prepare("SELECT * FROM taskfold_cards ORDER BY created_at ASC, id ASC").all().map((row) => ({
          key: requiredString2(row, "id"),
          value: { version: 1, card: readCard(this.db, row) }
        }));
      }
    };
    TaskfoldSqliteBoardStore = class {
      constructor(db) {
        this.db = db;
      }
      async lookup(key) {
        const row = this.db.prepare("SELECT * FROM taskfold_boards WHERE id = ?").get(key);
        if (!row) {
          return void 0;
        }
        const defaultWorkspace = parseJson(row.default_workspace_json);
        const orchestration = parseJson(row.orchestration_json);
        const boardView = parseJson(row.board_view_json);
        return {
          version: 1,
          board: {
            id: requiredString2(row, "id"),
            ...stringValue2(row, "name") ? { name: stringValue2(row, "name") } : {},
            ...stringValue2(row, "description") ? { description: stringValue2(row, "description") } : {},
            ...stringValue2(row, "icon") ? { icon: stringValue2(row, "icon") } : {},
            ...stringValue2(row, "color") ? { color: stringValue2(row, "color") } : {},
            ...numberValue2(row, "position") !== void 0 ? { position: numberValue2(row, "position") } : {},
            ...stringValue2(row, "version") ? { version: stringValue2(row, "version") } : {},
            ...stringValue2(row, "current_objective") ? { currentObjective: stringValue2(row, "current_objective") } : {},
            ...stringValue2(row, "core_value") ? { coreValue: stringValue2(row, "core_value") } : {},
            ...stringValue2(row, "source_of_truth") ? { sourceOfTruth: stringValue2(row, "source_of_truth") } : {},
            ...stringValue2(row, "repository_url") ? { repositoryUrl: stringValue2(row, "repository_url") } : {},
            ...stringValue2(row, "planning_path") ? { planningPath: stringValue2(row, "planning_path") } : {},
            ...stringValue2(row, "homepage_url") ? { homepageUrl: stringValue2(row, "homepage_url") } : {},
            ...defaultWorkspace ? { defaultWorkspace } : {},
            ...orchestration ? { orchestration } : {},
            ...boardView ? { boardView } : {},
            createdAt: requiredNumber(row, "created_at"),
            updatedAt: requiredNumber(row, "updated_at"),
            ...numberValue2(row, "archived_at") !== void 0 ? { archivedAt: numberValue2(row, "archived_at") } : {}
          }
        };
      }
      async entries() {
        const rows = this.db.prepare("SELECT id FROM taskfold_boards ORDER BY id ASC").all();
        const entries = [];
        for (const row of rows) {
          const key = requiredString2(row, "id");
          const value = await this.lookup(key);
          if (value) {
            entries.push({ key, value });
          }
        }
        return entries;
      }
    };
    TaskfoldSqliteMilestoneStore = class {
      constructor(db) {
        this.db = db;
      }
      async lookup(key) {
        const row = this.db.prepare("SELECT * FROM taskfold_milestones WHERE id = ?").get(key);
        return row ? { version: 1, milestone: readMilestone(row) } : void 0;
      }
      async entries() {
        return this.db.prepare("SELECT * FROM taskfold_milestones ORDER BY board_id ASC, position ASC, id ASC").all().map((row) => ({
          key: requiredString2(row, "id"),
          value: { version: 1, milestone: readMilestone(row) }
        }));
      }
    };
    TaskfoldSqliteProjectDocumentStore = class {
      constructor(db) {
        this.db = db;
      }
      async lookup(key) {
        const row = this.db.prepare("SELECT * FROM taskfold_project_documents WHERE id = ?").get(key);
        return row ? { version: 1, document: readProjectDocument(row) } : void 0;
      }
      async entries() {
        return this.db.prepare(
          "SELECT * FROM taskfold_project_documents ORDER BY board_id ASC, section ASC, position ASC, id ASC"
        ).all().map((row) => ({
          key: requiredString2(row, "id"),
          value: { version: 1, document: readProjectDocument(row) }
        }));
      }
    };
    TaskfoldSqliteSubscriptionStore = class {
      constructor(db) {
        this.db = db;
      }
      async lookup(key) {
        const row = this.db.prepare("SELECT * FROM taskfold_notification_subscriptions WHERE id = ?").get(key);
        if (!row) {
          return void 0;
        }
        const eventKinds = parseJson(row.event_kinds_json);
        const deliveredEventIds = parseJson(row.delivered_event_ids_json);
        return {
          version: 1,
          subscription: {
            id: requiredString2(row, "id"),
            boardId: requiredString2(row, "board_id"),
            ...stringValue2(row, "card_id") ? { cardId: stringValue2(row, "card_id") } : {},
            ...stringValue2(row, "session_key") ? { sessionKey: stringValue2(row, "session_key") } : {},
            ...stringValue2(row, "run_id") ? { runId: stringValue2(row, "run_id") } : {},
            ...stringValue2(row, "target") ? { target: stringValue2(row, "target") } : {},
            ...eventKinds ? { eventKinds } : {},
            ...numberValue2(row, "last_event_at") !== void 0 ? { lastEventAt: numberValue2(row, "last_event_at") } : {},
            ...stringValue2(row, "last_event_id") ? { lastEventId: stringValue2(row, "last_event_id") } : {},
            ...numberValue2(row, "last_event_sequence") !== void 0 ? { lastEventSequence: numberValue2(row, "last_event_sequence") } : {},
            ...deliveredEventIds ? { deliveredEventIds } : {},
            createdAt: requiredNumber(row, "created_at"),
            updatedAt: requiredNumber(row, "updated_at")
          }
        };
      }
      async entries() {
        const rows = this.db.prepare(
          "SELECT id FROM taskfold_notification_subscriptions ORDER BY created_at ASC, id ASC"
        ).all();
        const entries = [];
        for (const row of rows) {
          const key = requiredString2(row, "id");
          const value = await this.lookup(key);
          if (value) {
            entries.push({ key, value });
          }
        }
        return entries;
      }
    };
    TaskfoldSqliteAttachmentStore = class {
      constructor(db) {
        this.db = db;
      }
      async lookup(key) {
        const row = this.db.prepare(
          `
          SELECT a.*, b.content
          FROM taskfold_card_attachments a
          JOIN taskfold_attachment_blobs b ON b.attachment_id = a.id
          WHERE a.id = ?
        `
        ).get(key);
        if (!row) {
          return void 0;
        }
        return {
          version: 1,
          attachment: {
            id: requiredString2(row, "id"),
            cardId: requiredString2(row, "card_id"),
            createdAt: requiredNumber(row, "created_at"),
            fileName: requiredString2(row, "file_name"),
            byteSize: requiredNumber(row, "byte_size"),
            ...stringValue2(row, "mime_type") ? { mimeType: stringValue2(row, "mime_type") } : {},
            ...stringValue2(row, "note") ? { note: stringValue2(row, "note") } : {}
          },
          contentBase64: blobToBase642(row.content)
        };
      }
      async entries() {
        const rows = this.db.prepare(
          `
          SELECT a.id
          FROM taskfold_card_attachments a
          JOIN taskfold_attachment_blobs b ON b.attachment_id = a.id
          ORDER BY a.created_at ASC, a.id ASC
        `
        ).all();
        const entries = [];
        for (const row of rows) {
          const key = requiredString2(row, "id");
          const value = await this.lookup(key);
          if (value) {
            entries.push({ key, value });
          }
        }
        return entries;
      }
    };
  }
});

// src/backend/src/sqlite-migration.ts
var sqlite_migration_exports = {};
__export(sqlite_migration_exports, {
  TASKFOLD_SQLITE_MIGRATION_MARKER: () => TASKFOLD_SQLITE_MIGRATION_MARKER,
  TaskfoldSqliteMigrationError: () => TaskfoldSqliteMigrationError,
  formatTaskfoldSqliteMigrationReport: () => formatTaskfoldSqliteMigrationReport,
  runTaskfoldSqliteMigration: () => runTaskfoldSqliteMigration
});
import fs13 from "node:fs";
import os from "node:os";
import path20 from "node:path";
import { isDeepStrictEqual as isDeepStrictEqual3 } from "node:util";
function zeroCounts() {
  return Object.fromEntries(COUNT_KEYS.map((key) => [key, 0]));
}
function cardBoardId3(card) {
  return card.metadata?.automation?.boardId ?? "default";
}
function isAbsolutePath(value) {
  return typeof value === "string" && path20.isAbsolute(value);
}
function countCards(cards, counts) {
  for (const card of cards) {
    const metadata = card.metadata;
    counts.cards += 1;
    counts.archivedCards += metadata?.archivedAt ? 1 : 0;
    counts.labels += card.labels.length;
    counts.events += card.events?.length ?? 0;
    counts.delivery += card.delivery ? 1 : 0;
    counts.sourceReferences += card.sourceReferences?.length ?? 0;
    counts.attempts += metadata?.attempts?.length ?? 0;
    counts.comments += metadata?.comments?.length ?? 0;
    counts.links += metadata?.links?.length ?? 0;
    counts.proof += metadata?.proof?.length ?? 0;
    counts.artifacts += metadata?.artifacts?.length ?? 0;
    counts.attachments += metadata?.attachments?.length ?? 0;
    counts.diagnostics += metadata?.diagnostics?.length ?? 0;
    counts.notifications += metadata?.notifications?.length ?? 0;
    counts.workerLogs += metadata?.workerLogs?.length ?? 0;
    counts.workerProtocol += metadata?.workerProtocol ? 1 : 0;
  }
}
function localTimestamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}
function fileSignature(file) {
  try {
    const stat2 = fs13.statSync(file);
    return `${stat2.size}:${stat2.mtimeMs}`;
  } catch {
    return "missing";
  }
}
function copySqliteFiles(sqlitePath, destDir, baseName) {
  fs13.mkdirSync(destDir, { recursive: true, mode: TASKFOLD_FILE_STORE_DIR_MODE });
  const watched = [sqlitePath, `${sqlitePath}-wal`];
  const before = watched.map(fileSignature);
  const copied = [];
  try {
    for (const suffix of SQLITE_SUFFIXES) {
      const source = `${sqlitePath}${suffix}`;
      if (!fs13.existsSync(source)) {
        continue;
      }
      const target = path20.join(destDir, `${baseName}.sqlite${suffix}`);
      fs13.copyFileSync(source, target, fs13.constants.COPYFILE_EXCL);
      copied.push(target);
      fs13.chmodSync(target, TASKFOLD_FILE_STORE_FILE_MODE);
    }
    if (!isDeepStrictEqual3(watched.map(fileSignature), before)) {
      throw new TaskfoldSqliteMigrationError(
        `${sqlitePath} changed while it was being copied; stop whatever is writing it (an older Taskfold Gateway) and retry.`
      );
    }
    return copied;
  } catch (error) {
    for (const file of copied) {
      fs13.rmSync(file, { force: true });
    }
    throw error;
  }
}
function normalized(value) {
  return value === void 0 ? void 0 : JSON.parse(JSON.stringify(value));
}
function floorToMinute(epochMs) {
  return Math.floor(epochMs / 6e4) * 6e4;
}
async function readSource(snapshotPath) {
  const sqlite = openTaskfoldSqliteStoresReadOnly(snapshotPath);
  try {
    const boards = new Map(
      (await sqlite.boards.entries()).filter((entry) => entry.value?.version === 1).map((entry) => [entry.key, entry.value])
    );
    const counts = /* @__PURE__ */ new Map();
    const countsFor = (boardId) => {
      let value = counts.get(boardId);
      if (!value) {
        value = zeroCounts();
        counts.set(boardId, value);
      }
      return value;
    };
    const rows = (sql) => sqlite.db.prepare(sql).all();
    for (const row of rows(
      "SELECT board_id, COUNT(*) AS n, SUM(archived_at IS NOT NULL) AS archived FROM taskfold_cards GROUP BY board_id"
    )) {
      countsFor(row.board_id).cards = Number(row.n);
      countsFor(row.board_id).archivedCards = Number(row.archived ?? 0);
    }
    for (const [table, key] of CARD_CHILD_TABLES) {
      for (const row of rows(
        `SELECT c.board_id AS board_id, COUNT(*) AS n FROM ${table} x JOIN taskfold_cards c ON c.id = x.card_id GROUP BY c.board_id`
      )) {
        countsFor(row.board_id)[key] = Number(row.n);
      }
    }
    for (const row of rows(
      `SELECT c.board_id AS board_id, COUNT(*) AS n FROM taskfold_attachment_blobs b
         JOIN taskfold_card_attachments a ON a.id = b.attachment_id
         JOIN taskfold_cards c ON c.id = a.card_id GROUP BY c.board_id`
    )) {
      countsFor(row.board_id).attachmentBlobs = Number(row.n);
    }
    for (const row of rows("SELECT board_id, COUNT(*) AS n FROM taskfold_milestones GROUP BY board_id")) {
      countsFor(row.board_id).milestones = Number(row.n);
    }
    for (const row of rows("SELECT board_id, COUNT(*) AS n FROM taskfold_project_documents GROUP BY board_id")) {
      countsFor(row.board_id).documents = Number(row.n);
    }
    return {
      boards,
      cards: (await sqlite.cards.entries()).map((entry) => entry.value.card),
      milestones: (await sqlite.milestones.entries()).map((entry) => entry.value.milestone),
      documents: (await sqlite.documents.entries()).map((entry) => entry.value.document),
      attachments: (await sqlite.attachments.entries()).map((entry) => entry.value),
      subscriptions: await sqlite.subscriptions.entries(),
      counts
    };
  } finally {
    sqlite.close();
  }
}
function byCreatedThenId(a, b) {
  return a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
function byPositionThenId(a, b) {
  return a.position - b.position || byCreatedThenId(a, b);
}
async function writeAndVerifyRoot(plan, stagingDir) {
  const target = createTaskfoldFileStores({ dataDir: stagingDir });
  for (const milestone of plan.milestones.toSorted(byPositionThenId)) {
    await target.milestones.register(milestone.id, { version: 1, milestone });
  }
  for (const card of plan.cards.toSorted(byCreatedThenId)) {
    await target.cards.register(card.id, { version: 1, card: structuredClone(card) });
  }
  for (const document of plan.documents.toSorted(byPositionThenId)) {
    await target.documents.register(document.id, { version: 1, document });
  }
  for (const attachment of plan.attachments) {
    await target.attachments.register(attachment.attachment.id, attachment);
  }
  const reread = createTaskfoldFileStores({ dataDir: stagingDir });
  const mismatches = [];
  for (const card of plan.cards) {
    const stored = await reread.cards.lookup(card.id);
    if (!isDeepStrictEqual3(normalized(stored?.card), normalized(card))) {
      mismatches.push(`card ${card.id}`);
    }
  }
  let milestoneUpdatedAtTruncated = 0;
  for (const milestone of plan.milestones) {
    const stored = (await reread.milestones.lookup(milestone.id))?.milestone;
    const expected = { ...milestone, updatedAt: floorToMinute(milestone.updatedAt) };
    if (!isDeepStrictEqual3(normalized(stored), normalized(expected))) {
      mismatches.push(`milestone ${milestone.id}`);
    }
    milestoneUpdatedAtTruncated += expected.updatedAt === milestone.updatedAt ? 0 : 1;
  }
  for (const document of plan.documents) {
    const stored = (await reread.documents.lookup(document.id))?.document;
    if (!isDeepStrictEqual3(normalized(stored), normalized(document))) {
      mismatches.push(`document ${document.id}`);
    }
  }
  const blobBoards = /* @__PURE__ */ new Map();
  for (const attachment of plan.attachments) {
    const stored = await reread.attachments.lookup(attachment.attachment.id);
    if (!isDeepStrictEqual3(normalized(stored), normalized(attachment))) {
      mismatches.push(`attachment ${attachment.attachment.id}`);
      continue;
    }
    const owner = plan.cards.find((card) => card.id === attachment.attachment.cardId);
    const boardId = owner ? cardBoardId3(owner) : "default";
    blobBoards.set(boardId, (blobBoards.get(boardId) ?? 0) + 1);
  }
  if (mismatches.length > 0) {
    throw new TaskfoldSqliteMigrationError(
      `read-back check failed for ${mismatches.length} entities in ${stagingDir}: ${mismatches.slice(0, 10).join(", ")}`
    );
  }
  const storedCards = (await reread.cards.entries()).map((entry) => entry.value.card);
  const storedMilestones = (await reread.milestones.entries()).map((entry) => entry.value.milestone);
  const storedDocuments = (await reread.documents.entries()).map((entry) => entry.value.document);
  const written = /* @__PURE__ */ new Map();
  const displayIds = /* @__PURE__ */ new Map();
  for (const boardId of plan.boardIds) {
    const counts = zeroCounts();
    countCards(storedCards.filter((card) => cardBoardId3(card) === boardId), counts);
    counts.milestones = storedMilestones.filter((milestone) => milestone.boardId === boardId).length;
    counts.documents = storedDocuments.filter((document) => document.boardId === boardId).length;
    counts.attachmentBlobs = blobBoards.get(boardId) ?? 0;
    written.set(boardId, counts);
  }
  const cardsDir = path20.join(stagingDir, "cards");
  const files = fs13.existsSync(cardsDir) ? fs13.readdirSync(cardsDir).filter((name) => name.endsWith(".md")) : [];
  const idOf = (name) => name.split(" - ")[0];
  const numberOf = (name) => Number.parseInt(idOf(name).replace(/^\D+-/, ""), 10);
  for (const boardId of plan.boardIds) {
    const own = new Set(storedCards.filter((card) => cardBoardId3(card) === boardId).map((card) => card.id));
    const mine = files.filter((name) => {
      const content = fs13.readFileSync(path20.join(cardsDir, name), "utf8");
      return [...own].some((id) => content.includes(`"uuid": ${JSON.stringify(id)}`));
    }).toSorted((a, b) => numberOf(a) - numberOf(b));
    if (mine.length > 0) {
      displayIds.set(boardId, { first: idOf(mine[0]), last: idOf(mine.at(-1)) });
    }
  }
  return { written, displayIds, milestoneUpdatedAtTruncated };
}
function stagingPathFor(dataDir, stamp) {
  return path20.join(path20.dirname(dataDir), `.${path20.basename(dataDir).replace(/^\./, "")}.migrating-${stamp}`);
}
async function runTaskfoldSqliteMigration(options) {
  const pluginDir = path20.resolve(options.pluginDir);
  const { mode } = options;
  const stamp = localTimestamp(options.now ?? /* @__PURE__ */ new Date());
  const sqlitePath = path20.join(pluginDir, "taskfold.sqlite");
  const projectsJsonPath = path20.join(pluginDir, "projects.json");
  const markerPath = path20.join(pluginDir, TASKFOLD_SQLITE_MIGRATION_MARKER);
  const projectsRootDir = path20.join(pluginDir, "projects");
  if (!fs13.existsSync(sqlitePath)) {
    throw new TaskfoldSqliteMigrationError(`no SQLite database at ${sqlitePath}; nothing to migrate.`);
  }
  const blockers = [];
  if (fs13.existsSync(markerPath)) {
    blockers.push(`${markerPath} already exists (this state directory was already migrated)`);
  }
  if (fs13.existsSync(projectsJsonPath)) {
    blockers.push(`${projectsJsonPath} already exists`);
  }
  const workDir = fs13.mkdtempSync(path20.join(os.tmpdir(), "taskfold-migrate-sqlite-"));
  const created = [];
  let applied = false;
  try {
    const pristine = copySqliteFiles(sqlitePath, path20.join(workDir, "pristine"), "taskfold");
    const readDir = path20.join(workDir, "read");
    fs13.mkdirSync(readDir);
    for (const file of pristine) {
      fs13.copyFileSync(file, path20.join(readDir, path20.basename(file)));
    }
    const source = await readSource(path20.join(readDir, "taskfold.sqlite"));
    const mainCheckoutCache = /* @__PURE__ */ new Map();
    const dataDirOf = (boardId) => {
      const board = source.boards.get(boardId)?.board;
      const raw = taskfoldProjectDataDir(pluginDir, boardId, board);
      let resolved = mainCheckoutCache.get(raw);
      if (resolved === void 0) {
        resolved = resolveTaskfoldMainCheckoutPath(raw);
        mainCheckoutCache.set(raw, resolved);
      }
      return resolved;
    };
    const boardIds = /* @__PURE__ */ new Set([
      ...source.boards.keys(),
      ...source.cards.map(cardBoardId3),
      ...source.milestones.map((milestone) => milestone.boardId),
      ...source.documents.map((document) => document.boardId)
    ]);
    const position = (boardId) => source.boards.get(boardId)?.board.position ?? Number.MAX_SAFE_INTEGER;
    const orderedBoardIds = [...boardIds].toSorted((a, b) => position(a) - position(b) || a.localeCompare(b));
    const cardBoard = new Map(source.cards.map((card) => [card.id, cardBoardId3(card)]));
    const plans = /* @__PURE__ */ new Map();
    const projects = [];
    for (const boardId of orderedBoardIds) {
      const board = source.boards.get(boardId)?.board;
      const dataDir = dataDirOf(boardId);
      const cards = source.cards.filter((card) => cardBoardId3(card) === boardId);
      const milestones = source.milestones.filter((milestone) => milestone.boardId === boardId);
      const documents = source.documents.filter((document) => document.boardId === boardId);
      const attachments = source.attachments.filter(
        (attachment) => cardBoard.get(attachment.attachment.cardId) === boardId
      );
      const skipped = cards.length + milestones.length + documents.length + attachments.length === 0;
      projects.push({
        boardId,
        ...board?.name ? { name: board.name } : {},
        archived: Boolean(board?.archivedAt),
        dataDir,
        location: dataDir.startsWith(`${projectsRootDir}${path20.sep}`) ? "plugin" : "repository",
        skipped,
        source: source.counts.get(boardId) ?? zeroCounts(),
        absolutePaths: {
          documentTargets: documents.filter((document) => isAbsolutePath(document.target)).length,
          cardWorkspaces: cards.filter((card) => {
            const workspace = card.metadata?.automation?.workspace;
            return isAbsolutePath(workspace?.path) || isAbsolutePath(workspace?.sourcePath);
          }).length,
          sourceReferences: cards.reduce(
            (total, card) => total + (card.sourceReferences ?? []).filter((reference) => isAbsolutePath(reference.target)).length,
            0
          )
        }
      });
      if (skipped) {
        continue;
      }
      const plan = plans.get(dataDir) ?? { dataDir, boardIds: [], cards: [], milestones: [], documents: [], attachments: [] };
      plan.boardIds.push(boardId);
      plan.cards.push(...cards);
      plan.milestones.push(...milestones);
      plan.documents.push(...documents);
      plan.attachments.push(...attachments);
      plans.set(dataDir, plan);
    }
    for (const plan of plans.values()) {
      if (fs13.existsSync(plan.dataDir)) {
        blockers.push(`${plan.dataDir} already exists`);
      }
    }
    const report = {
      mode,
      sqlitePath,
      backupFiles: [],
      projectsJsonPath,
      boards: source.boards.size,
      subscriptions: source.subscriptions.length,
      projects,
      blockers,
      milestoneUpdatedAtTruncated: 0,
      applied: false
    };
    if (mode === "apply" && blockers.length > 0) {
      throw new TaskfoldSqliteMigrationError(`refusing to migrate: ${blockers.join("; ")}`, report);
    }
    if (mode === "apply") {
      const backupDir = path20.join(pluginDir, "backup");
      fs13.mkdirSync(backupDir, { recursive: true, mode: TASKFOLD_FILE_STORE_DIR_MODE });
      for (const file of pristine) {
        const target = path20.join(backupDir, path20.basename(file).replace(/^taskfold\./, `taskfold-premigrate-${stamp}.`));
        fs13.copyFileSync(file, target, fs13.constants.COPYFILE_EXCL);
        fs13.chmodSync(target, TASKFOLD_FILE_STORE_FILE_MODE);
        report.backupFiles.push(target);
      }
    }
    const staged = [];
    const projectsRootExisted = fs13.existsSync(projectsRootDir);
    let index = 0;
    for (const plan of plans.values()) {
      index += 1;
      const stagingDir = mode === "apply" ? stagingPathFor(plan.dataDir, stamp) : path20.join(workDir, "stage", String(index), ".taskfold");
      if (mode === "apply") {
        if (!projectsRootExisted && plan.dataDir.startsWith(`${projectsRootDir}${path20.sep}`) && !created.includes(projectsRootDir)) {
          created.push(projectsRootDir);
        }
        created.push(stagingDir);
      }
      const result = await writeAndVerifyRoot(plan, stagingDir);
      report.milestoneUpdatedAtTruncated += result.milestoneUpdatedAtTruncated;
      for (const project of projects) {
        if (plan.boardIds.includes(project.boardId)) {
          project.written = result.written.get(project.boardId);
          const displayIds = result.displayIds.get(project.boardId);
          if (displayIds) {
            project.cardDisplayIds = displayIds;
          }
        }
      }
      staged.push({ plan, stagingDir });
    }
    for (const project of projects) {
      if (!project.skipped && !isDeepStrictEqual3(project.written, project.source)) {
        throw new TaskfoldSqliteMigrationError(
          `count check failed for project ${project.boardId}: SQLite ${JSON.stringify(project.source)} vs files ${JSON.stringify(project.written)}`,
          report
        );
      }
    }
    if (mode === "apply") {
      for (const { plan, stagingDir } of staged) {
        if (fs13.existsSync(plan.dataDir)) {
          throw new TaskfoldSqliteMigrationError(`${plan.dataDir} appeared during the migration; nothing was committed.`);
        }
        fs13.renameSync(stagingDir, plan.dataDir);
        created[created.indexOf(stagingDir)] = plan.dataDir;
      }
      fs13.mkdirSync(pluginDir, { recursive: true, mode: TASKFOLD_FILE_STORE_DIR_MODE });
      created.push(projectsJsonPath);
      writeFileAtomic(projectsJsonPath, JSON.stringify(Object.fromEntries(source.boards), null, 2));
      if (source.subscriptions.length > 0) {
        const subscriptionsDir = path20.join(pluginDir, "subscriptions");
        if (!fs13.existsSync(subscriptionsDir)) {
          created.push(subscriptionsDir);
        }
        const subscriptions = createTaskfoldFileSubscriptionStore({ subscriptionsDir });
        for (const { key, value } of source.subscriptions) {
          await subscriptions.register(key, value);
        }
      }
      created.push(markerPath);
      writeFileAtomic(
        markerPath,
        JSON.stringify(
          {
            migratedAt: (/* @__PURE__ */ new Date()).toISOString(),
            source: sqlitePath,
            backupFiles: report.backupFiles,
            projects: projects.map(({ boardId, dataDir, skipped, written }) => ({ boardId, dataDir, skipped, written }))
          },
          null,
          2
        )
      );
      applied = true;
      report.applied = true;
    }
    return report;
  } catch (error) {
    if (!applied) {
      for (const target of created.toReversed()) {
        fs13.rmSync(target, { recursive: true, force: true });
      }
    }
    throw error;
  } finally {
    fs13.rmSync(workDir, { recursive: true, force: true });
  }
}
function formatCounts(counts) {
  if (!counts) {
    return "-";
  }
  return COUNT_KEYS.filter((key) => counts[key] > 0).map((key) => `${key} ${counts[key]}`).join(", ") || "empty";
}
function formatTaskfoldSqliteMigrationReport(report) {
  const lines = [
    `Taskfold SQLite \u2192 files migration (${report.mode})`,
    `source: ${report.sqlitePath} (read from a read-only snapshot; never written)`
  ];
  if (report.backupFiles.length > 0) {
    lines.push(`backup: ${report.backupFiles.join(", ")}`);
  }
  lines.push(`registry: ${report.boards} projects \u2192 ${report.projectsJsonPath}; subscriptions ${report.subscriptions}`);
  for (const project of report.projects) {
    const label = `${project.boardId}${project.name ? ` "${project.name}"` : ""}${project.archived ? " (archived)" : ""}`;
    if (project.skipped) {
      lines.push(`- ${label}: no data; ${project.dataDir} is created on the first write`);
      continue;
    }
    const same = isDeepStrictEqual3(project.source, project.written);
    lines.push(`- ${label} \u2192 ${project.dataDir} [${project.location}]`);
    lines.push(`    SQLite: ${formatCounts(project.source)}`);
    lines.push(`    files:  ${same ? "identical" : formatCounts(project.written)}`);
    if (project.cardDisplayIds) {
      lines.push(`    card ids: ${project.cardDisplayIds.first} \u2026 ${project.cardDisplayIds.last}`);
    }
    const { documentTargets, cardWorkspaces, sourceReferences } = project.absolutePaths;
    if (documentTargets + cardWorkspaces + sourceReferences > 0) {
      lines.push(
        `    absolute paths kept as-is: document targets ${documentTargets}, card workspaces ${cardWorkspaces}, source references ${sourceReferences}`
      );
    }
  }
  if (report.milestoneUpdatedAtTruncated > 0) {
    lines.push(`note: ${report.milestoneUpdatedAtTruncated} milestone updatedAt values keep minute precision only`);
  }
  lines.push(report.blockers.length > 0 ? `blockers: ${report.blockers.join("; ")}` : "blockers: none");
  lines.push(
    report.applied ? "result: applied and verified" : report.blockers.length > 0 ? "result: verified in a temporary directory; --apply would be refused" : "result: verified in a temporary directory; nothing written (run with --apply to migrate)"
  );
  return lines.join("\n");
}
var TASKFOLD_SQLITE_MIGRATION_MARKER, TaskfoldSqliteMigrationError, COUNT_KEYS, CARD_CHILD_TABLES, SQLITE_SUFFIXES;
var init_sqlite_migration = __esm({
  "src/backend/src/sqlite-migration.ts"() {
    "use strict";
    init_file_store_atomic();
    init_file_store();
    init_file_store_subscriptions();
    init_file_store_paths();
    init_project_routed_stores();
    init_sqlite_store();
    TASKFOLD_SQLITE_MIGRATION_MARKER = "migrated-from-sqlite.json";
    TaskfoldSqliteMigrationError = class extends Error {
      constructor(message, report) {
        super(message);
        this.report = report;
        this.name = "TaskfoldSqliteMigrationError";
      }
    };
    COUNT_KEYS = [
      "cards",
      "archivedCards",
      "milestones",
      "documents",
      "attachments",
      "attachmentBlobs",
      "labels",
      "events",
      "attempts",
      "comments",
      "links",
      "proof",
      "artifacts",
      "delivery",
      "sourceReferences",
      "diagnostics",
      "notifications",
      "workerLogs",
      "workerProtocol"
    ];
    CARD_CHILD_TABLES = [
      ["taskfold_card_labels", "labels"],
      ["taskfold_card_events", "events"],
      ["taskfold_card_attempts", "attempts"],
      ["taskfold_card_comments", "comments"],
      ["taskfold_card_links", "links"],
      ["taskfold_card_proof", "proof"],
      ["taskfold_card_artifacts", "artifacts"],
      ["taskfold_card_delivery", "delivery"],
      ["taskfold_card_source_references", "sourceReferences"],
      ["taskfold_card_diagnostics", "diagnostics"],
      ["taskfold_card_notifications", "notifications"],
      ["taskfold_worker_logs", "workerLogs"],
      ["taskfold_worker_protocol", "workerProtocol"],
      ["taskfold_card_attachments", "attachments"]
    ];
    SQLITE_SUFFIXES = ["", "-wal", "-shm"];
  }
});

// src/backend/src/cli.ts
var cli_exports = {};
__export(cli_exports, {
  registerTaskfoldCli: () => registerTaskfoldCli
});
import { formatErrorMessage as formatErrorMessage5 } from "openclaw/plugin-sdk/error-runtime";
import { addGatewayClientOptions, callGatewayFromCli } from "openclaw/plugin-sdk/gateway-runtime";
import { getRuntimeConfig } from "openclaw/plugin-sdk/runtime-config-snapshot";
import { isRecord as isRecord2, parseStrictPositiveInteger as parseStrictPositiveInteger2 } from "openclaw/plugin-sdk/string-coerce-runtime";
function invalidCliArgument(message) {
  const error = new Error(message);
  error.name = "InvalidArgumentError";
  error.code = "commander.invalidArgument";
  error.exitCode = 1;
  return error;
}
function parsePositiveIntegerOption(value, flag) {
  const parsed = parseStrictPositiveInteger2(value);
  if (parsed === void 0) {
    throw invalidCliArgument(`${flag} must be a positive integer.`);
  }
  return parsed;
}
function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}
`);
}
function writeLine(value) {
  process.stdout.write(`${value}
`);
}
function splitLabels(value) {
  return value?.split(",").map((entry) => entry.trim()).filter(Boolean);
}
function isTaskfoldStatus2(value) {
  return TASKFOLD_STATUSES.includes(value);
}
function formatCardLine2(card) {
  const boardId = card.metadata?.automation?.boardId ?? "default";
  const milestone = card.milestoneId ? `/${card.milestoneId.slice(0, 8)}` : "/unassigned";
  const agent = card.agentId ? ` ${card.agentId}` : "";
  return `${card.id.slice(0, 8)}  ${card.status.padEnd(8)}  ${card.priority.padEnd(6)}  ${boardId}${milestone}${agent}  ${card.title}`;
}
function redactDispatchResult(result) {
  return {
    ...result,
    promoted: result.promoted.map(redactClaimToken),
    reclaimed: result.reclaimed.map(redactClaimToken),
    blocked: result.blocked.map(redactClaimToken),
    orchestrated: result.orchestrated.map(redactClaimToken)
  };
}
function writeCards(cards, options) {
  if (options.json) {
    writeJson({ cards: cards.map(redactClaimToken) });
    return;
  }
  for (const card of cards) {
    writeLine(formatCardLine2(card));
  }
}
async function callTaskfoldGateway(method, options, params) {
  return await callGatewayFromCli(method, options, params, {
    mode: "cli",
    scopes: options.admin ? ["operator.admin", "operator.write", "operator.read"] : ["operator.write", "operator.read"]
  });
}
function isGatewayUnavailableError(error) {
  const message = formatErrorMessage5(error).toLowerCase();
  if ([
    "econnrefused",
    "econnreset",
    "ehostunreach",
    "enotfound",
    "gateway not connected",
    "gateway unavailable"
  ].some((marker) => message.includes(marker))) {
    return true;
  }
  const unknownMethod = message.match(/unknown method:\s*([a-z0-9._-]+)/)?.[1];
  return unknownMethod === "taskfold.cards.dispatch";
}
function hasExplicitGatewayTarget(options) {
  return Boolean(options.url?.trim() || options.token?.trim());
}
function hasConfiguredRemoteGatewayTarget() {
  if (process.env.OPENCLAW_GATEWAY_URL?.trim()) {
    return true;
  }
  try {
    return getRuntimeConfig().gateway?.mode === "remote";
  } catch {
    return false;
  }
}
function registerTaskfoldCli(params) {
  const taskfold = params.program.command("taskfold").description("Manage Taskfold cards and worker dispatch");
  taskfold.command("migrate-sqlite").description("Migrate data from the old SQLite store (taskfold.sqlite) to Taskfold's file store").option("--dry-run", "Verify the migration in a temporary directory and print counts; write nothing").option("--apply", "Back up taskfold.sqlite, then write every project's data to files").option("--json", "Print JSON", false).action(async (options) => {
    if (Boolean(options.dryRun) === Boolean(options.apply)) {
      throw invalidCliArgument("pass exactly one of --dry-run or --apply.");
    }
    const { formatTaskfoldSqliteMigrationReport: formatTaskfoldSqliteMigrationReport2, runTaskfoldSqliteMigration: runTaskfoldSqliteMigration2, TaskfoldSqliteMigrationError: TaskfoldSqliteMigrationError2 } = await Promise.resolve().then(() => (init_sqlite_migration(), sqlite_migration_exports));
    try {
      const report = await runTaskfoldSqliteMigration2({
        pluginDir: params.pluginDir,
        mode: options.apply ? "apply" : "dry-run"
      });
      if (options.json) {
        writeJson(report);
      } else {
        writeLine(formatTaskfoldSqliteMigrationReport2(report));
      }
    } catch (error) {
      if (error instanceof TaskfoldSqliteMigrationError2 && error.report && !options.json) {
        writeLine(formatTaskfoldSqliteMigrationReport2(error.report));
      }
      throw error;
    }
  });
  taskfold.command("list").description("List Taskfold cards").option("--board <id>", "Board id").option("--status <status>", "Filter by status").option("--include-archived", "Include archived cards (default false)").option("--json", "Print JSON", false).action(
    async (options) => {
      let cards = await params.store.list({ boardId: options.board });
      if (!options.json && options.includeArchived !== true) {
        cards = cards.filter((card) => !card.metadata?.archivedAt);
      }
      if (options.status) {
        cards = cards.filter((card) => card.status === options.status);
      }
      writeCards(cards, options);
    }
  );
  taskfold.command("create").argument("<title...>", "Card title").description("Create a Taskfold card").option("--notes <text>", "Card notes").option("--status <status>", "Initial status", "todo").option("--priority <priority>", "Priority", "normal").option("--agent <id>", "Assigned agent id").option("--board <id>", "Board id").option("--milestone <id>", "Milestone id; omit for Unassigned").option("--labels <items>", "Comma-separated labels").option("--json", "Print JSON", false).action(
    async (title, options) => {
      const card = await params.store.create({
        title: title.join(" "),
        notes: options.notes,
        status: options.status,
        priority: options.priority,
        agentId: options.agent,
        boardId: options.board,
        milestoneId: options.milestone,
        labels: splitLabels(options.labels),
        workspaceAccess: { unrestricted: true }
      });
      if (options.json) {
        writeJson({ card: redactClaimToken(card) });
      } else {
        writeLine(formatCardLine2(card));
      }
    }
  );
  taskfold.command("show").argument("<id>", "Card id or prefix").description("Show one Taskfold card").option("--json", "Print JSON", false).action(async (id, options) => {
    const cards = await params.store.list();
    const { card, error } = resolveTaskfoldCardByIdOrPrefix(cards, id);
    if (!card) {
      throw new Error(error);
    }
    if (options.json) {
      writeJson({ card: redactClaimToken(card) });
    } else {
      writeLine(formatCardLine2(card));
      if (card.notes) {
        writeLine(card.notes);
      }
    }
  });
  const project = taskfold.command("project").description("Manage Taskfold projects");
  project.command("list").option("--archived", "Include archived projects").option("--json", "Print JSON", false).action(async (options) => {
    const result = await params.store.listProjects({ includeArchived: options.archived });
    if (options.json) {
      writeJson(result);
      return;
    }
    for (const entry of result.projects) {
      writeLine(`${entry.id}  ${entry.name ?? entry.id}${entry.archivedAt ? "  archived" : ""}`);
    }
  });
  project.command("create").argument("<id>", "Project id").argument("<name...>", "Project name").option("--milestone <title>", "Optional initial milestone title").option("--workspace <path>", "Existing local project directory").option("--json", "Print JSON", false).action(async (id, name, options) => {
    const projectView = await params.store.createProject({
      id,
      name: name.join(" "),
      ...options.milestone ? { initialMilestoneTitle: options.milestone } : {},
      ...options.workspace ? {
        projectMode: "existing",
        defaultWorkspace: { kind: "dir", path: options.workspace }
      } : {}
    });
    if (options.json) {
      writeJson({ project: projectView });
    } else {
      writeLine(`Created project ${projectView.board.id}`);
    }
  });
  project.command("show").argument("<id>", "Project id").option("--json", "Print JSON", false).action(async (id, options) => {
    const projectView = await params.store.getProject(id);
    if (options.json) {
      writeJson({ project: projectView });
    } else {
      writeLine(`${projectView.board.name ?? projectView.board.id} (${projectView.board.id})`);
      for (const milestone2 of projectView.milestones) {
        writeLine(`- ${milestone2.state.padEnd(9)} ${milestone2.title}`);
      }
    }
  });
  project.command("archive").argument("<id>", "Project id").action(async (id) => {
    const result = await params.store.archiveProject(id);
    writeLine(
      `Archived ${result.board.id}${result.runningCards.length ? `; ${result.runningCards.length} running cards remain` : ""}`
    );
  });
  project.command("restore").argument("<id>", "Project id").action(async (id) => {
    const result = await params.store.archiveProject(id, false);
    writeLine(`Restored ${result.board.id}`);
  });
  const milestone = project.command("milestone").description("Manage project milestones");
  milestone.command("list").argument("<project>", "Project id").option("--json", "Print JSON", false).action(async (boardId, options) => {
    const result = await params.store.listMilestones(boardId);
    if (options.json) {
      writeJson(result);
      return;
    }
    for (const entry of result.milestones) {
      writeLine(`${entry.id.slice(0, 8)}  ${entry.state.padEnd(9)}  ${entry.title}`);
    }
  });
  milestone.command("create").argument("<project>", "Project id").argument("<title...>", "Milestone title").action(async (boardId, title) => {
    const created = await params.store.createMilestone({ boardId, title: title.join(" ") });
    writeLine(`Created milestone ${created.id.slice(0, 8)} ${created.title}`);
  });
  milestone.command("move-card").argument("<id>", "Card id or prefix").requiredOption("--milestone <id>", "Target milestone id; use unassigned to clear").action(async (id, options) => {
    const cards = await params.store.list();
    const { card, error } = resolveTaskfoldCardByIdOrPrefix(cards, id);
    if (!card) {
      throw new Error(error);
    }
    const updated = await params.store.moveMilestone(card.id, {
      milestoneId: options.milestone === "unassigned" ? void 0 : options.milestone
    });
    writeLine(formatCardLine2(updated));
  });
  const docs = project.command("docs").description("Manage project documents");
  docs.command("list").argument("<project>", "Project id").option("--hidden", "Include hidden documents").option("--json", "Print JSON", false).action(async (boardId, options) => {
    const result = await params.store.listProjectDocuments(boardId, {
      includeHidden: options.hidden
    });
    if (options.json) {
      writeJson(result);
      return;
    }
    for (const document of result.documents) {
      writeLine(`${document.section.padEnd(12)} ${document.key.padEnd(20)} ${document.title}`);
    }
  });
  taskfold.command("move").argument("<id>", "Card id or prefix").description("Move a Taskfold card to another status").requiredOption("--status <status>", "Target status").option("--json", "Print JSON", false).action(async (id, options) => {
    if (!isTaskfoldStatus2(options.status)) {
      throw new Error(`--status must be one of: ${TASKFOLD_STATUSES.join(", ")}.`);
    }
    const cards = await params.store.list();
    const { card, error } = resolveTaskfoldCardByIdOrPrefix(cards, id);
    if (!card) {
      throw new Error(error);
    }
    const updated = await params.store.move(card.id, options.status, void 0);
    if (options.json) {
      writeJson({ card: redactClaimToken(updated) });
    } else {
      writeLine(formatCardLine2(updated));
    }
  });
  addGatewayClientOptions(
    taskfold.command("dispatch").description("Promote ready cards and start worker runs through the Gateway").option("--board <id>", "Dispatch a single board").option(
      "--max-starts <count>",
      "Maximum new worker runs to start in this pass (default 3)",
      (value) => parsePositiveIntegerOption(value, "--max-starts")
    ).option("--admin", "Request full-host workspace access", false).option("--json", "Print JSON", false)
  ).action(async (options) => {
    try {
      const method = options.maxStarts === void 0 ? "taskfold.cards.dispatch" : "taskfold.cards.dispatchWithOptions";
      const result = await callTaskfoldGateway(method, options, {
        boardId: options.board,
        ...options.maxStarts !== void 0 ? { maxStarts: options.maxStarts } : {}
      });
      if (options.json) {
        writeJson(result);
      } else {
        const record = isRecord2(result) ? result : {};
        const started = Array.isArray(record.started) ? record.started.length : 0;
        const failures = Array.isArray(record.startFailures) ? record.startFailures.length : 0;
        writeLine(`dispatch complete: started=${started} failures=${failures}`);
      }
    } catch (error) {
      if (!isGatewayUnavailableError(error) || hasExplicitGatewayTarget(options) || hasConfiguredRemoteGatewayTarget()) {
        throw error;
      }
      const result = redactDispatchResult(await params.store.dispatch({ boardId: options.board }));
      if (options.json) {
        writeJson({ ...result, gatewayUnavailable: true });
      } else {
        writeLine(
          `gateway unavailable; data dispatch only: promoted=${result.promoted.length} blocked=${result.blocked.length}`
        );
      }
    }
  });
}
var init_cli = __esm({
  "src/backend/src/cli.ts"() {
    "use strict";
    init_contract();
    init_card_lookup();
    init_card_redaction();
  }
});

// src/backend/index.ts
init_file_store();
import { resolveStateDir } from "openclaw/plugin-sdk/state-paths";

// src/backend/api.ts
import {
  definePluginEntry
} from "openclaw/plugin-sdk/plugin-entry";

// src/backend/src/gateway.ts
init_card_redaction();
import { resolveDefaultAgentId as resolveDefaultAgentId2 } from "openclaw/plugin-sdk/agent-runtime";

// src/backend/src/card-execution.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { formatErrorMessage as formatErrorMessage2 } from "openclaw/plugin-sdk/error-runtime";
import { canonicalPathFromExistingAncestor as canonicalPathFromExistingAncestor4 } from "openclaw/plugin-sdk/security-runtime";

// src/backend/src/dispatcher-workspace.ts
import { canonicalPathFromExistingAncestor as canonicalPathFromExistingAncestor2 } from "openclaw/plugin-sdk/security-runtime";

// ../core/src/store-card-helpers.ts
init_contract();
init_sdk_utils();
init_store_constants();
import { randomUUID as randomUUID4 } from "node:crypto";

// ../core/src/store-normalizers.ts
init_contract();
init_store_constants();
import { randomUUID as randomUUID3 } from "node:crypto";

// ../core/src/workspace-path.ts
function isAbsoluteWorkspacePath(value) {
  return value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value) || /^\\\\[^\\]+\\[^\\]+/.test(value);
}

// ../core/src/store-normalizers.ts
function normalizeOptionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function normalizeBoardId(value, fallback) {
  const raw = normalizeBoundedString(value, fallback, 80, "board id");
  if (!raw) {
    return void 0;
  }
  const boardId = raw.toLowerCase();
  if (!isValidTaskfoldBoardId(boardId)) {
    throw new Error("board id must match [a-z0-9][a-z0-9._-]{0,79}.");
  }
  return boardId;
}
function normalizeBoardIdRequired(value) {
  return normalizeBoardId(value) ?? "default";
}
function normalizeBoardMetadata(input, fallback, now = Date.now()) {
  const id = normalizeBoardId(input.id, fallback?.id) ?? "default";
  const name = normalizeBoundedString(input.name, fallback?.name, 120, "board name");
  const description = normalizeBoundedString(
    input.description,
    fallback?.description,
    1e3,
    "board description"
  );
  const icon = normalizeBoundedString(input.icon, fallback?.icon, 40, "board icon");
  const color = normalizeBoundedString(input.color, fallback?.color, 40, "board color");
  const position = Object.hasOwn(input, "position") ? normalizePosition(input.position, fallback?.position ?? 0) : fallback?.position;
  const version = normalizeBoundedString(input.version, fallback?.version, 120, "project version");
  const currentObjective = normalizeBoundedString(
    input.currentObjective,
    fallback?.currentObjective,
    2e3,
    "current objective"
  );
  const coreValue = normalizeBoundedString(input.coreValue, fallback?.coreValue, 2e3, "core value");
  const sourceOfTruth = Object.hasOwn(input, "sourceOfTruth") ? normalizeExternalUrl(input.sourceOfTruth, fallback?.sourceOfTruth, "source of truth") : fallback?.sourceOfTruth;
  const repositoryUrl = Object.hasOwn(input, "repositoryUrl") ? normalizeExternalUrl(input.repositoryUrl, fallback?.repositoryUrl, "repository URL") : fallback?.repositoryUrl;
  const planningPath = normalizeBoundedString(
    input.planningPath,
    fallback?.planningPath,
    2e3,
    "planning path"
  );
  const homepageUrl = Object.hasOwn(input, "homepageUrl") ? normalizeExternalUrl(input.homepageUrl, fallback?.homepageUrl, "homepage URL") : fallback?.homepageUrl;
  const defaultWorkspace = Object.hasOwn(input, "defaultWorkspace") ? normalizeWorkspace(input.defaultWorkspace, fallback?.defaultWorkspace) : fallback?.defaultWorkspace;
  const orchestration = Object.hasOwn(input, "orchestration") ? normalizeOrchestration(input.orchestration, fallback?.orchestration) : fallback?.orchestration;
  const boardView = Object.hasOwn(input, "boardView") ? normalizeBoardView(input.boardView, fallback?.boardView) : fallback?.boardView;
  const archivedAt = Object.hasOwn(input, "archived") ? input.archived === false ? void 0 : now : fallback?.archivedAt;
  return {
    id,
    ...name ? { name } : {},
    ...description ? { description } : {},
    ...icon ? { icon } : {},
    ...color ? { color } : {},
    ...position !== void 0 ? { position } : {},
    ...version ? { version } : {},
    ...currentObjective ? { currentObjective } : {},
    ...coreValue ? { coreValue } : {},
    ...sourceOfTruth ? { sourceOfTruth } : {},
    ...repositoryUrl ? { repositoryUrl } : {},
    ...planningPath ? { planningPath } : {},
    ...homepageUrl ? { homepageUrl } : {},
    ...defaultWorkspace ? { defaultWorkspace } : {},
    ...orchestration ? { orchestration } : {},
    ...boardView ? { boardView } : {},
    createdAt: fallback?.createdAt ?? now,
    updatedAt: now,
    ...archivedAt ? { archivedAt } : {}
  };
}
function defaultTaskfoldBoardView() {
  return { groupBy: "milestone", sortBy: "manual", sortDirection: "asc" };
}
function normalizeBoardView(value, fallback) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    if (value === void 0) {
      return fallback ?? defaultTaskfoldBoardView();
    }
    throw new Error("board view must be an object.");
  }
  const record = value;
  const groupBy = typeof record.groupBy === "string" && TASKFOLD_BOARD_GROUP_BY.includes(record.groupBy) ? record.groupBy : fallback?.groupBy ?? "milestone";
  const defaultSortBy = groupBy === "milestone" ? "manual" : "priority";
  const sortBy = typeof record.sortBy === "string" && TASKFOLD_BOARD_SORT_BY.includes(record.sortBy) ? record.sortBy : fallback?.groupBy === groupBy ? fallback.sortBy : defaultSortBy;
  if (groupBy !== "milestone" && sortBy === "manual") {
    throw new Error("manual sorting is available only when grouping by milestone.");
  }
  const sortDirection = typeof record.sortDirection === "string" && TASKFOLD_BOARD_SORT_DIRECTIONS.includes(record.sortDirection) ? record.sortDirection : fallback?.sortDirection ?? "asc";
  return { groupBy, sortBy, sortDirection };
}
function normalizeOrchestration(value, fallback) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }
  const record = value;
  const autoDecompose = typeof record.autoDecompose === "boolean" ? record.autoDecompose : fallback?.autoDecompose;
  const autoDecomposePerDispatch = typeof record.autoDecomposePerDispatch === "number" && Number.isFinite(record.autoDecomposePerDispatch) ? Math.max(1, Math.min(20, Math.trunc(record.autoDecomposePerDispatch))) : fallback?.autoDecomposePerDispatch;
  const defaultAssignee = normalizeBoundedString(
    record.defaultAssignee,
    fallback?.defaultAssignee,
    120,
    "default assignee"
  );
  const orchestratorProfile = normalizeBoundedString(
    record.orchestratorProfile,
    fallback?.orchestratorProfile,
    120,
    "orchestrator profile"
  );
  const next = {
    ...autoDecompose !== void 0 ? { autoDecompose } : {},
    ...autoDecomposePerDispatch ? { autoDecomposePerDispatch } : {},
    ...defaultAssignee ? { defaultAssignee } : {},
    ...orchestratorProfile ? { orchestratorProfile } : {}
  };
  return Object.keys(next).length ? next : void 0;
}
function normalizeNotificationKinds(value) {
  if (value == null) {
    return void 0;
  }
  const entries = typeof value === "string" ? value.split(",") : Array.isArray(value) ? value : [];
  const kinds = [];
  for (const entry of entries) {
    const kind = typeof entry === "string" ? entry.trim() : "";
    if (!TASKFOLD_NOTIFICATION_KINDS.includes(kind)) {
      throw new Error(
        `notification kind must be one of: ${TASKFOLD_NOTIFICATION_KINDS.join(", ")}.`
      );
    }
    const notificationKind = kind;
    if (!kinds.includes(notificationKind)) {
      kinds.push(notificationKind);
    }
  }
  return kinds.length ? kinds : void 0;
}
function normalizeNotificationSubscription(input, fallback, now = Date.now()) {
  const boardId = normalizeBoardId(input.boardId, fallback?.boardId) ?? "default";
  const cardId = normalizeBoundedString(input.cardId, fallback?.cardId, 120, "card id");
  const sessionKey = normalizeBoundedString(
    input.sessionKey,
    fallback?.sessionKey,
    240,
    "session key"
  );
  const runId = normalizeBoundedString(input.runId, fallback?.runId, 160, "run id");
  const target = normalizeBoundedString(input.target, fallback?.target, 240, "notification target");
  if (!cardId && !sessionKey && !runId && !target) {
    throw new Error("notification subscription needs cardId, sessionKey, runId, or target.");
  }
  const eventKinds = normalizeNotificationKinds(input.eventKinds);
  const preservedFields = {};
  if (fallback) {
    if (fallback.lastEventAt) {
      preservedFields.lastEventAt = fallback.lastEventAt;
    }
    if (fallback.lastEventId) {
      preservedFields.lastEventId = fallback.lastEventId;
    }
    if (fallback.lastEventSequence) {
      preservedFields.lastEventSequence = fallback.lastEventSequence;
    }
    if (fallback.deliveredEventIds?.length) {
      preservedFields.deliveredEventIds = fallback.deliveredEventIds;
    }
  }
  return {
    id: fallback?.id ?? randomUUID3(),
    boardId,
    ...cardId ? { cardId } : {},
    ...sessionKey ? { sessionKey } : {},
    ...runId ? { runId } : {},
    ...target ? { target } : {},
    ...eventKinds ? { eventKinds } : {},
    ...preservedFields,
    createdAt: fallback?.createdAt ?? now,
    updatedAt: now
  };
}
function normalizeTitle(value) {
  const title = normalizeOptionalString(value);
  if (!title) {
    throw new Error("title is required.");
  }
  if (title.length > 180) {
    throw new Error("title must be 180 characters or fewer.");
  }
  return title;
}
function normalizeNotes(value) {
  const notes = normalizeOptionalString(value);
  if (!notes) {
    return void 0;
  }
  if (notes.length > 4e3) {
    throw new Error("notes must be 4000 characters or fewer.");
  }
  return notes;
}
function normalizeOptionalBoundedString(value, maxLength, fieldName) {
  const normalized2 = normalizeOptionalString(value);
  if (!normalized2) {
    return void 0;
  }
  if (normalized2.length > maxLength) {
    throw new Error(`${fieldName} must be ${maxLength} characters or fewer.`);
  }
  return normalized2;
}
function normalizeDeliveryState(value, allowed, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    return void 0;
  }
  if (!allowed.includes(value)) {
    throw new Error(`${fieldName} must be one of: ${allowed.join(", ")}.`);
  }
  return value;
}
function normalizeDelivery(value, fallback, now = Date.now()) {
  if (value === null) {
    return void 0;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }
  const record = value;
  const readText = (key, maxLength, fieldName) => Object.hasOwn(record, key) ? normalizeOptionalBoundedString(record[key], maxLength, fieldName) : fallback?.[key];
  const implementationState = Object.hasOwn(record, "implementationState") ? normalizeDeliveryState(
    record.implementationState,
    TASKFOLD_DELIVERY_IMPLEMENTATION_STATES,
    "implementation state"
  ) : fallback?.implementationState;
  const verificationState = Object.hasOwn(record, "verificationState") ? normalizeDeliveryState(
    record.verificationState,
    TASKFOLD_DELIVERY_VERIFICATION_STATES,
    "verification state"
  ) : fallback?.verificationState;
  const releaseState = Object.hasOwn(record, "releaseState") ? normalizeDeliveryState(
    record.releaseState,
    TASKFOLD_DELIVERY_RELEASE_STATES,
    "release state"
  ) : fallback?.releaseState;
  const delivery = {
    ...readText("objective", 2e3, "delivery objective") ? { objective: readText("objective", 2e3, "delivery objective") } : {},
    ...readText("deliverySummary", 4e3, "delivery summary") ? { deliverySummary: readText("deliverySummary", 4e3, "delivery summary") } : {},
    ...readText("openItems", 4e3, "delivery open items") ? { openItems: readText("openItems", 4e3, "delivery open items") } : {},
    ...implementationState ? { implementationState } : {},
    ...verificationState ? { verificationState } : {},
    ...releaseState ? { releaseState } : {}
  };
  return Object.keys(delivery).length ? { ...delivery, updatedAt: now } : void 0;
}
function normalizeBoundedString(value, fallback, maxLength, fieldName) {
  const normalized2 = normalizeOptionalString(value);
  if (!normalized2) {
    return fallback;
  }
  if (normalized2.length > maxLength) {
    throw new Error(`${fieldName} must be ${maxLength} characters or fewer.`);
  }
  return normalized2;
}
function normalizeExternalUrl(value, fallback, fieldName) {
  const normalized2 = normalizeBoundedString(value, fallback, 2e3, fieldName);
  if (!normalized2) {
    return void 0;
  }
  let parsed;
  try {
    parsed = new URL(normalized2);
  } catch {
    throw new Error(`${fieldName} must be a valid http or https URL.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${fieldName} must be a valid http or https URL.`);
  }
  return parsed.toString();
}
function normalizeStatus(value, fallback) {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }
  if (TASKFOLD_STATUSES.includes(value)) {
    return value;
  }
  throw new Error(`status must be one of: ${TASKFOLD_STATUSES.join(", ")}.`);
}
function normalizeCardKind(value, fallback = "task") {
  if (value === void 0 || value === null || value === "") {
    return fallback;
  }
  if (typeof value === "string" && TASKFOLD_CARD_KINDS.includes(value)) {
    return value;
  }
  throw new Error(`card kind must be one of: ${TASKFOLD_CARD_KINDS.join(", ")}.`);
}
function normalizePriority(value, fallback) {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }
  if (TASKFOLD_PRIORITIES.includes(value)) {
    return value;
  }
  throw new Error(`priority must be one of: ${TASKFOLD_PRIORITIES.join(", ")}.`);
}
function normalizeLabels(value, fallback = []) {
  if (value == null) {
    return fallback;
  }
  const entries = typeof value === "string" ? value.split(",") : Array.isArray(value) ? value : void 0;
  if (!entries) {
    throw new Error("labels must be an array or comma-separated string.");
  }
  const labels = [];
  for (const entry of entries) {
    const label = normalizeOptionalString(entry);
    if (!label || labels.includes(label)) {
      continue;
    }
    if (label.length > 40) {
      throw new Error("labels must be 40 characters or fewer.");
    }
    labels.push(label);
    if (labels.length >= 12) {
      break;
    }
  }
  return labels;
}
function normalizeStringList(value, fieldName, maxLength = 80) {
  if (value == null) {
    return [];
  }
  const entries = typeof value === "string" ? value.split(",") : Array.isArray(value) ? value : void 0;
  if (!entries) {
    throw new Error(`${fieldName} must be an array or comma-separated string.`);
  }
  const values = [];
  for (const entry of entries) {
    if (Array.isArray(value) && typeof entry !== "string") {
      throw new Error(`${fieldName} entries must be strings.`);
    }
    const normalized2 = normalizeBoundedString(entry, void 0, maxLength, fieldName);
    if (normalized2 && !values.includes(normalized2)) {
      values.push(normalized2);
    }
    if (values.length > 20) {
      throw new Error(`${fieldName} supports at most 20 entries.`);
    }
  }
  return values;
}
function normalizePosition(value, fallback) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.trunc(value));
}
function normalizePositiveInteger(value, fieldName) {
  if (value == null || value === "") {
    return void 0;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a number.`);
  }
  return Math.max(1, Math.trunc(value));
}
function normalizeWorkspace(value, fallback) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }
  const record = value;
  const kind = record.kind === "scratch" || record.kind === "dir" || record.kind === "worktree" ? record.kind : fallback?.kind;
  if (!kind) {
    throw new Error("workspace kind must be scratch, dir, or worktree.");
  }
  const workspacePath = normalizeBoundedString(record.path, fallback?.path, 2e3, "workspace path");
  if (kind === "dir" && (!workspacePath || !isAbsoluteWorkspacePath(workspacePath))) {
    throw new Error("dir workspace path must be absolute.");
  }
  const branch = normalizeBoundedString(record.branch, fallback?.branch, 160, "workspace branch");
  const sourcePath = normalizeBoundedString(
    record.sourcePath,
    fallback?.sourcePath,
    2e3,
    "workspace source path"
  );
  if (sourcePath && !isAbsoluteWorkspacePath(sourcePath)) {
    throw new Error("workspace source path must be absolute.");
  }
  const sourceBranch = normalizeBoundedString(
    record.sourceBranch,
    fallback?.sourceBranch,
    160,
    "workspace source branch"
  );
  return {
    kind,
    ...workspacePath ? { path: workspacePath } : {},
    ...branch ? { branch } : {},
    ...kind === "worktree" && sourcePath ? { sourcePath } : {},
    ...kind === "worktree" && sourceBranch ? { sourceBranch } : {}
  };
}
function normalizeAutomation(value, fallback = {}, options = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return Object.keys(fallback).length ? fallback : void 0;
  }
  const record = value;
  const tenant = normalizeBoundedString(record.tenant, fallback.tenant, 80, "tenant");
  const boardId = Object.hasOwn(record, "boardId") ? normalizeBoardId(record.boardId, fallback.boardId) : fallback.boardId;
  const createdByCardId = normalizeBoundedString(
    record.createdByCardId,
    fallback.createdByCardId,
    120,
    "created by card id"
  );
  const idempotencyKey = normalizeBoundedString(
    record.idempotencyKey,
    fallback.idempotencyKey,
    160,
    "idempotency key"
  );
  const summary = normalizeBoundedString(record.summary, fallback.summary, 2e3, "summary");
  const skills = Object.hasOwn(record, "skills") ? normalizeStringList(record.skills, "skills") : fallback.skills;
  const createdCardIds = Object.hasOwn(record, "createdCardIds") ? normalizeStringList(record.createdCardIds, "created card ids", 120) : fallback.createdCardIds;
  const scheduledAt = Object.hasOwn(record, "scheduledAt") ? normalizeTimestamp(record.scheduledAt, 0) || void 0 : fallback.scheduledAt;
  const maxRuntimeSeconds = Object.hasOwn(record, "maxRuntimeSeconds") ? normalizePositiveInteger(record.maxRuntimeSeconds, "max runtime seconds") : fallback.maxRuntimeSeconds;
  const maxRetries = Object.hasOwn(record, "maxRetries") ? normalizePositiveInteger(record.maxRetries, "max retries") : fallback.maxRetries;
  const dispatchCount = Object.hasOwn(record, "dispatchCount") ? normalizeTimestamp(record.dispatchCount, 0) || void 0 : fallback.dispatchCount;
  const lastDispatchAt = Object.hasOwn(record, "lastDispatchAt") ? normalizeTimestamp(record.lastDispatchAt, 0) || void 0 : fallback.lastDispatchAt;
  const workspace = Object.hasOwn(record, "workspace") ? normalizeWorkspace(record.workspace, fallback.workspace) : fallback.workspace;
  const workspaceAccess = fallback.workspaceAccess;
  const launch = normalizeLaunchState(
    options.allowLaunchState && Object.hasOwn(record, "launch") ? record.launch : fallback.launch
  );
  const next = removeUndefinedAutomationFields({
    ...tenant ? { tenant } : {},
    ...boardId ? { boardId } : {},
    ...createdByCardId ? { createdByCardId } : {},
    ...idempotencyKey ? { idempotencyKey } : {},
    ...skills?.length ? { skills } : {},
    ...workspace ? { workspace } : {},
    ...workspaceAccess ? { workspaceAccess } : {},
    ...maxRuntimeSeconds ? { maxRuntimeSeconds } : {},
    ...maxRetries ? { maxRetries } : {},
    ...scheduledAt ? { scheduledAt } : {},
    ...summary ? { summary } : {},
    ...createdCardIds?.length ? { createdCardIds } : {},
    ...dispatchCount ? { dispatchCount } : {},
    ...lastDispatchAt ? { lastDispatchAt } : {},
    ...launch ? { launch } : {}
  });
  return Object.keys(next).length ? next : void 0;
}
function normalizeLaunchTimestamp(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : void 0;
}
function normalizeLaunchString(value, maxLength) {
  const normalized2 = normalizeOptionalString(value);
  return normalized2 && normalized2.length <= maxLength ? normalized2 : void 0;
}
function normalizeLaunchState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return void 0;
  }
  const record = value;
  const requestedSessionKey = normalizeLaunchString(record.requestedSessionKey, 240);
  const provisionalRunId = normalizeLaunchString(record.provisionalRunId, 160);
  const preparedAt = normalizeLaunchTimestamp(record.preparedAt);
  const preparedBy = normalizeLaunchString(record.preparedBy, 160);
  if (!requestedSessionKey || !provisionalRunId || preparedAt === void 0 || !preparedBy) {
    return void 0;
  }
  const identity = { requestedSessionKey, provisionalRunId, preparedAt, preparedBy };
  if (record.phase === "prepared") {
    return { phase: "prepared", ...identity };
  }
  if (record.phase === "accepted") {
    const acceptedAt = normalizeLaunchTimestamp(record.acceptedAt);
    const acceptedSessionKey = normalizeLaunchString(record.acceptedSessionKey, 240);
    const acceptedRunId = normalizeLaunchString(record.acceptedRunId, 160);
    return acceptedAt === void 0 || !acceptedSessionKey ? void 0 : {
      phase: "accepted",
      ...identity,
      acceptedAt,
      acceptedSessionKey,
      ...acceptedRunId ? { acceptedRunId } : {}
    };
  }
  if (record.phase === "failed") {
    const failedAt = normalizeLaunchTimestamp(record.failedAt);
    const reason = normalizeLaunchString(record.reason, 800);
    return failedAt === void 0 || !reason ? void 0 : { phase: "failed", ...identity, failedAt, reason };
  }
  return void 0;
}
function deriveChildIdempotencyKey(parentKey, index) {
  if (!parentKey) {
    return void 0;
  }
  const key = `${parentKey}:child:${index}`;
  return key.length <= 160 ? key : void 0;
}
function normalizeExecutionMode(value, fallback) {
  if (typeof value === "string" && TASKFOLD_EXECUTION_MODES.includes(value)) {
    return value;
  }
  return fallback;
}
function normalizeExecutionStatus(value, fallback) {
  if (typeof value === "string" && TASKFOLD_EXECUTION_STATUSES.includes(value)) {
    return value;
  }
  return fallback;
}
function normalizeAttemptStatus(value, fallback) {
  if (typeof value === "string" && TASKFOLD_ATTEMPT_STATUSES.includes(value)) {
    return value;
  }
  return fallback;
}
function normalizeLinkType(value, fallback) {
  if (typeof value === "string" && TASKFOLD_LINK_TYPES.includes(value)) {
    return value;
  }
  return fallback;
}
function normalizeProofStatus(value, fallback) {
  if (typeof value === "string" && TASKFOLD_PROOF_STATUSES.includes(value)) {
    return value;
  }
  return fallback;
}
function normalizeTemplateId(value) {
  return typeof value === "string" && TASKFOLD_TEMPLATE_IDS.includes(value) ? value : void 0;
}
function normalizeTimestamp(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : fallback;
}
function normalizeEvent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value;
  const id = normalizeOptionalString(record.id);
  const kind = TASKFOLD_EVENT_KINDS.includes(record.kind) ? record.kind : null;
  const at = normalizeTimestamp(record.at, 0);
  if (!id || !kind || !at) {
    return null;
  }
  const fromStatus = typeof record.fromStatus === "string" && TASKFOLD_STATUSES.includes(record.fromStatus) ? record.fromStatus : void 0;
  const toStatus = typeof record.toStatus === "string" && TASKFOLD_STATUSES.includes(record.toStatus) ? record.toStatus : void 0;
  const fromMilestoneId = normalizeBoundedString(
    record.fromMilestoneId,
    void 0,
    120,
    "event source milestone"
  );
  const toMilestoneId = normalizeBoundedString(
    record.toMilestoneId,
    void 0,
    120,
    "event target milestone"
  );
  const sessionKey = normalizeOptionalString(record.sessionKey);
  const runId = normalizeOptionalString(record.runId);
  return {
    id,
    kind,
    at,
    ...fromStatus ? { fromStatus } : {},
    ...toStatus ? { toStatus } : {},
    ...fromMilestoneId ? { fromMilestoneId } : {},
    ...toMilestoneId ? { toMilestoneId } : {},
    ...sessionKey ? { sessionKey } : {},
    ...runId ? { runId } : {}
  };
}
function normalizeEvents(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(normalizeEvent).filter((event) => event !== null).slice(-MAX_CARD_EVENTS);
}
function normalizeAttempt(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value;
  const id = normalizeOptionalString(record.id);
  const startedAt = normalizeTimestamp(record.startedAt, 0);
  if (!id || !startedAt) {
    return null;
  }
  const endedAt = normalizeTimestamp(record.endedAt, 0);
  const sessionKey = normalizeOptionalString(record.sessionKey);
  const runId = normalizeOptionalString(record.runId);
  const error = normalizeBoundedString(record.error, void 0, 800, "attempt error");
  const engine = normalizeBoundedString(record.engine, void 0, 160, "attempt engine");
  const model = normalizeBoundedString(record.model, void 0, 160, "attempt model");
  const promptVersion = typeof record.promptVersion === "number" && Number.isSafeInteger(record.promptVersion) && record.promptVersion > 0 ? record.promptVersion : void 0;
  return {
    id,
    status: normalizeAttemptStatus(record.status, "running"),
    startedAt,
    ...endedAt ? { endedAt } : {},
    ...engine ? { engine } : {},
    ...typeof record.mode === "string" && TASKFOLD_EXECUTION_MODES.includes(record.mode) ? { mode: record.mode } : {},
    ...model ? { model } : {},
    ...sessionKey ? { sessionKey } : {},
    ...runId ? { runId } : {},
    ...error ? { error } : {},
    ...promptVersion !== void 0 ? { promptVersion } : {}
  };
}
function normalizeComment(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value;
  const id = normalizeOptionalString(record.id);
  const body = normalizeBoundedString(record.body, void 0, 2e3, "comment body");
  const createdAt = normalizeTimestamp(record.createdAt, 0);
  if (!id || !body || !createdAt) {
    return null;
  }
  const updatedAt = normalizeTimestamp(record.updatedAt, 0);
  return { id, body, createdAt, ...updatedAt ? { updatedAt } : {} };
}
function normalizeLink(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value;
  const id = normalizeOptionalString(record.id);
  const createdAt = normalizeTimestamp(record.createdAt, 0);
  if (!id || !createdAt) {
    return null;
  }
  const targetCardId = normalizeBoundedString(record.targetCardId, void 0, 120, "link target");
  const title = normalizeBoundedString(record.title, void 0, 180, "link title");
  const url = normalizeBoundedString(record.url, void 0, 2e3, "link URL");
  if (!targetCardId && !url) {
    return null;
  }
  return {
    id,
    type: normalizeLinkType(record.type, "relates_to"),
    createdAt,
    ...targetCardId ? { targetCardId } : {},
    ...title ? { title } : {},
    ...url ? { url } : {}
  };
}
function isDependencyLink(link) {
  return link.type === "parent" || link.type === "child" || link.type === "contains" || link.type === "contained_by";
}
function normalizeProof(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value;
  const id = normalizeOptionalString(record.id);
  const createdAt = normalizeTimestamp(record.createdAt, 0);
  if (!id || !createdAt) {
    return null;
  }
  const label = normalizeBoundedString(record.label, void 0, 160, "proof label");
  const command = normalizeBoundedString(record.command, void 0, 1e3, "proof command");
  const url = normalizeBoundedString(record.url, void 0, 2e3, "proof URL");
  const note = normalizeBoundedString(record.note, void 0, 2e3, "proof note");
  return {
    id,
    status: normalizeProofStatus(record.status, "unknown"),
    createdAt,
    ...label ? { label } : {},
    ...command ? { command } : {},
    ...url ? { url } : {},
    ...note ? { note } : {}
  };
}
function normalizeArtifact(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value;
  const id = normalizeOptionalString(record.id) ?? randomUUID3();
  const createdAt = normalizeTimestamp(record.createdAt, Date.now());
  const label = normalizeBoundedString(record.label, void 0, 160, "artifact label");
  const url = normalizeBoundedString(record.url, void 0, 2e3, "artifact URL");
  const artifactPath = normalizeBoundedString(record.path, void 0, 2e3, "artifact path");
  const mimeType = normalizeBoundedString(record.mimeType, void 0, 160, "artifact MIME type");
  if (!url && !artifactPath) {
    return null;
  }
  return {
    id,
    createdAt,
    ...label ? { label } : {},
    ...url ? { url } : {},
    ...artifactPath ? { path: artifactPath } : {},
    ...mimeType ? { mimeType } : {}
  };
}
function normalizeAttachment(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value;
  const id = normalizeOptionalString(record.id);
  const cardId = normalizeBoundedString(record.cardId, void 0, 120, "card id");
  const fileName = normalizeBoundedString(record.fileName, void 0, 240, "attachment file name");
  const createdAt = normalizeTimestamp(record.createdAt, 0);
  const byteSize = typeof record.byteSize === "number" && Number.isFinite(record.byteSize) ? Math.max(0, Math.trunc(record.byteSize)) : 0;
  if (!id || !cardId || !fileName || !createdAt || byteSize <= 0) {
    return null;
  }
  const mimeType = normalizeBoundedString(record.mimeType, void 0, 160, "attachment MIME type");
  const note = normalizeBoundedString(record.note, void 0, 400, "attachment note");
  return {
    id,
    cardId,
    createdAt,
    fileName,
    byteSize,
    ...mimeType ? { mimeType } : {},
    ...note ? { note } : {}
  };
}
function normalizeWorkerLog(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value;
  const id = normalizeOptionalString(record.id);
  const message = normalizeBoundedString(record.message, void 0, 800, "worker log message");
  const createdAt = normalizeTimestamp(record.createdAt, 0);
  if (!id || !message || !createdAt) {
    return null;
  }
  const level = record.level === "warning" || record.level === "error" || record.level === "info" ? record.level : "info";
  const sessionKey = normalizeBoundedString(record.sessionKey, void 0, 240, "session key");
  const runId = normalizeBoundedString(record.runId, void 0, 160, "run id");
  return {
    id,
    level,
    message,
    createdAt,
    ...sessionKey ? { sessionKey } : {},
    ...runId ? { runId } : {}
  };
}
function normalizeWorkerProtocol(value, fallback) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }
  const record = value;
  const state = record.state === "idle" || record.state === "running" || record.state === "completed" || record.state === "blocked" || record.state === "violated" ? record.state : fallback?.state;
  if (!state) {
    return void 0;
  }
  const updatedAt = normalizeTimestamp(record.updatedAt, fallback?.updatedAt ?? Date.now());
  const detail = normalizeBoundedString(record.detail, fallback?.detail, 800, "protocol detail");
  return {
    state,
    updatedAt,
    ...detail ? { detail } : {}
  };
}
function normalizeAttachmentInput(cardId, input, now) {
  const fileName = normalizeBoundedString(input.fileName, void 0, 240, "attachment file name");
  if (!fileName) {
    throw new Error("attachment fileName is required.");
  }
  const contentBase64 = typeof input.contentBase64 === "string" && input.contentBase64 ? input.contentBase64 : void 0;
  if (!contentBase64) {
    throw new Error("attachment contentBase64 is required.");
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(contentBase64) || contentBase64.length % 4 !== 0 || contentBase64.length > Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4) {
    throw new Error("attachment contentBase64 must be canonical base64.");
  }
  const decoded = Buffer.from(contentBase64, "base64");
  if (decoded.toString("base64") !== contentBase64) {
    throw new Error("attachment contentBase64 must be canonical base64.");
  }
  const byteSize = decoded.length;
  if (byteSize <= 0 || byteSize > MAX_ATTACHMENT_BYTES) {
    throw new Error(`attachment must be between 1 and ${MAX_ATTACHMENT_BYTES} bytes.`);
  }
  const mimeType = normalizeBoundedString(input.mimeType, void 0, 160, "attachment MIME type");
  const note = normalizeBoundedString(input.note, void 0, 400, "attachment note");
  const attachment = {
    id: randomUUID3(),
    cardId,
    createdAt: now,
    fileName,
    byteSize,
    ...mimeType ? { mimeType } : {},
    ...note ? { note } : {}
  };
  return { attachment, contentBase64 };
}
function normalizeClaim(value, fallback) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }
  const record = value;
  const ownerId = normalizeBoundedString(record.ownerId, fallback?.ownerId, 120, "claim owner");
  const token = normalizeBoundedString(record.token, fallback?.token, 160, "claim token");
  const claimedAt = normalizeTimestamp(record.claimedAt, fallback?.claimedAt ?? Date.now());
  const lastHeartbeatAt = normalizeTimestamp(
    record.lastHeartbeatAt,
    fallback?.lastHeartbeatAt ?? claimedAt
  );
  const expiresAt = normalizeTimestamp(record.expiresAt, fallback?.expiresAt ?? 0);
  if (!ownerId || !token || !claimedAt || !lastHeartbeatAt) {
    return void 0;
  }
  return {
    ownerId,
    token,
    claimedAt,
    lastHeartbeatAt,
    ...expiresAt ? { expiresAt } : {}
  };
}
function normalizeDiagnosticAction(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value;
  const kind = record.kind === "claim" || record.kind === "unblock" || record.kind === "reassign" || record.kind === "add_proof" || record.kind === "open_session" ? record.kind : void 0;
  const label = normalizeBoundedString(record.label, void 0, 120, "diagnostic action label");
  return kind && label ? { kind, label } : null;
}
function normalizeDiagnostic(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value;
  const kind = TASKFOLD_DIAGNOSTIC_KINDS.includes(record.kind) ? record.kind : void 0;
  const severity = TASKFOLD_DIAGNOSTIC_SEVERITIES.includes(
    record.severity
  ) ? record.severity : "warning";
  const title = normalizeBoundedString(record.title, void 0, 160, "diagnostic title");
  const detail = normalizeBoundedString(record.detail, void 0, 800, "diagnostic detail");
  const firstSeenAt = normalizeTimestamp(record.firstSeenAt, Date.now());
  const lastSeenAt = normalizeTimestamp(record.lastSeenAt, firstSeenAt);
  if (!kind || !title || !detail) {
    return null;
  }
  return {
    kind,
    severity,
    title,
    detail,
    firstSeenAt,
    lastSeenAt,
    count: typeof record.count === "number" && Number.isFinite(record.count) ? Math.max(1, Math.trunc(record.count)) : 1,
    actions: Array.isArray(record.actions) ? record.actions.map(normalizeDiagnosticAction).filter((action) => action !== null).slice(0, 4) : []
  };
}
function normalizeNotification(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value;
  const id = normalizeOptionalString(record.id) ?? randomUUID3();
  const kind = TASKFOLD_NOTIFICATION_KINDS.includes(record.kind) ? record.kind : void 0;
  const createdAt = normalizeTimestamp(record.createdAt, Date.now());
  const sequence = normalizeTimestamp(record.sequence, 0) || void 0;
  const message = normalizeBoundedString(record.message, void 0, 240, "notification message");
  if (!kind || !message) {
    return null;
  }
  const sessionKey = normalizeBoundedString(record.sessionKey, void 0, 240, "session key");
  const runId = normalizeBoundedString(record.runId, void 0, 120, "run id");
  return {
    id,
    kind,
    createdAt,
    ...sequence ? { sequence } : {},
    message,
    ...sessionKey ? { sessionKey } : {},
    ...runId ? { runId } : {}
  };
}
function normalizeProofInput(input, now) {
  const label = normalizeBoundedString(input.label, void 0, 160, "proof label");
  const command = normalizeBoundedString(input.command, void 0, 1e3, "proof command");
  const url = normalizeBoundedString(input.url, void 0, 2e3, "proof URL");
  const note = normalizeBoundedString(input.note, void 0, 2e3, "proof note");
  return {
    id: randomUUID3(),
    status: normalizeProofStatus(input.status, "unknown"),
    createdAt: now,
    ...label ? { label } : {},
    ...command ? { command } : {},
    ...url ? { url } : {},
    ...note ? { note } : {}
  };
}
function completionProofConflicts(existing, completion) {
  return ["label", "command", "url", "note"].some(
    (field) => completion[field] !== void 0 && completion[field] !== existing[field]
  );
}
function appendCompletionProof(existing, proof, proofId) {
  const entries = [...existing ?? []];
  if (!proofId) {
    return [...entries, proof].slice(-MAX_CARD_PROOF);
  }
  const index = entries.findIndex((entry) => entry.id === proofId);
  const pending = index >= 0 ? entries[index] : void 0;
  if (!pending) {
    throw new Error(`proof not found: ${proofId}`);
  }
  if (proof.status === "unknown") {
    throw new Error("completion proof status must be passed, failed, or skipped.");
  }
  if (completionProofConflicts(pending, proof)) {
    throw new Error(`completion proof does not match pending proof: ${proofId}`);
  }
  if (pending.status !== "unknown") {
    if (pending.status !== proof.status) {
      throw new Error(`completion proof status does not match existing proof: ${proofId}`);
    }
    return entries.slice(-MAX_CARD_PROOF);
  }
  entries[index] = { ...pending, status: proof.status };
  return entries.slice(-MAX_CARD_PROOF);
}
function normalizeMetadata(value, fallback = {}, options = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return trimMetadataToBudget(fallback, options);
  }
  const record = value;
  const stale = record.stale && typeof record.stale === "object" && !Array.isArray(record.stale) ? record.stale : null;
  const hasArchivedAt = Object.hasOwn(record, "archivedAt");
  const hasStale = Object.hasOwn(record, "stale");
  const hasLifecycleStatusSourceUpdatedAt = Object.hasOwn(record, "lifecycleStatusSourceUpdatedAt");
  const links = Array.isArray(record.links) ? record.links.map(normalizeLink).filter((link) => link !== null) : void 0;
  const normalizedLinks = links === void 0 ? fallback.links : options.allowDependencyLinks === false ? (() => {
    const dependencyLinks = (fallback.links ?? []).filter(isDependencyLink);
    const ordinaryCapacity = Math.max(0, MAX_CARD_LINKS - dependencyLinks.length);
    return [
      ...dependencyLinks.slice(-MAX_CARD_LINKS),
      ...ordinaryCapacity > 0 ? links.filter((link) => !isDependencyLink(link)).slice(-ordinaryCapacity) : []
    ];
  })() : links.slice(-MAX_CARD_LINKS);
  const normalized2 = {
    attempts: Array.isArray(record.attempts) ? record.attempts.map(normalizeAttempt).filter((attempt) => attempt !== null).slice(-MAX_CARD_ATTEMPTS) : fallback.attempts,
    comments: Array.isArray(record.comments) ? record.comments.map(normalizeComment).filter((comment) => comment !== null).slice(-MAX_CARD_COMMENTS) : fallback.comments,
    links: normalizedLinks,
    proof: Array.isArray(record.proof) ? record.proof.map(normalizeProof).filter((proof) => proof !== null).slice(-MAX_CARD_PROOF) : fallback.proof,
    artifacts: Array.isArray(record.artifacts) ? record.artifacts.map(normalizeArtifact).filter((artifact) => artifact !== null).slice(-MAX_CARD_ARTIFACTS) : fallback.artifacts,
    attachments: Array.isArray(record.attachments) ? record.attachments.map(normalizeAttachment).filter((attachment) => attachment !== null).slice(-MAX_CARD_ATTACHMENTS) : fallback.attachments,
    workerLogs: Array.isArray(record.workerLogs) ? record.workerLogs.map(normalizeWorkerLog).filter((log) => log !== null).slice(-MAX_CARD_WORKER_LOGS) : fallback.workerLogs,
    workerProtocol: Object.hasOwn(record, "workerProtocol") ? normalizeWorkerProtocol(record.workerProtocol, fallback.workerProtocol) : fallback.workerProtocol,
    automation: Object.hasOwn(record, "automation") ? normalizeAutomation(record.automation, fallback.automation, {
      allowLaunchState: options.allowAutomationLaunch
    }) : fallback.automation,
    claim: Object.hasOwn(record, "claim") ? record.claim ? normalizeClaim(record.claim, fallback.claim) : void 0 : fallback.claim,
    diagnostics: Array.isArray(record.diagnostics) ? record.diagnostics.map(normalizeDiagnostic).filter(
      (diagnosticLocal) => diagnosticLocal !== null
    ).slice(-MAX_CARD_DIAGNOSTICS) : fallback.diagnostics,
    notifications: Array.isArray(record.notifications) ? record.notifications.map(normalizeNotification).filter((notification) => notification !== null).slice(-MAX_CARD_NOTIFICATIONS) : fallback.notifications,
    templateId: normalizeTemplateId(record.templateId) ?? fallback.templateId,
    archivedAt: hasArchivedAt ? normalizeTimestamp(record.archivedAt, 0) || void 0 : fallback.archivedAt,
    stale: hasStale ? stale ? {
      detectedAt: normalizeTimestamp(stale.detectedAt, Date.now()),
      lastSessionUpdatedAt: normalizeTimestamp(stale.lastSessionUpdatedAt, 0) || void 0,
      reason: normalizeBoundedString(stale.reason, fallback.stale?.reason, 240, "stale reason") ?? "Session has not reported recent activity."
    } : void 0 : fallback.stale,
    lifecycleStatusSourceUpdatedAt: hasLifecycleStatusSourceUpdatedAt ? normalizeTimestamp(record.lifecycleStatusSourceUpdatedAt, 0) : fallback.lifecycleStatusSourceUpdatedAt,
    failureCount: typeof record.failureCount === "number" && Number.isFinite(record.failureCount) ? Math.max(0, Math.trunc(record.failureCount)) : fallback.failureCount
  };
  return trimMetadataToBudget(normalized2, options);
}
function normalizeExecution(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return void 0;
  }
  const record = value;
  const now = Date.now();
  const engine = normalizeBoundedString(record.engine, void 0, 160, "execution engine");
  const model = normalizeBoundedString(record.model, void 0, 160, "execution model");
  const normalizedId = normalizeOptionalString(record.id);
  const sessionKey = normalizeOptionalString(record.sessionKey);
  const runId = normalizeOptionalString(record.runId);
  if (!normalizedId && !engine && !model && !sessionKey && !runId) {
    return void 0;
  }
  const id = normalizedId ?? randomUUID3();
  const startedAt = normalizeTimestamp(record.startedAt, now);
  const updatedAt = normalizeTimestamp(record.updatedAt, startedAt);
  return {
    id,
    kind: "agent-session",
    mode: normalizeExecutionMode(record.mode, "autonomous"),
    status: normalizeExecutionStatus(record.status, "idle"),
    startedAt,
    updatedAt,
    ...engine ? { engine } : {},
    ...model ? { model } : {},
    ...sessionKey ? { sessionKey } : {},
    ...runId ? { runId } : {}
  };
}
function syncExecutionSessionKey(execution, sessionKey) {
  if (!execution) {
    return void 0;
  }
  return removeUndefinedExecutionFields({
    ...execution,
    sessionKey,
    updatedAt: Date.now()
  });
}
function removeUndefinedExecutionFields(execution) {
  const next = { ...execution };
  if (next.engine === void 0) {
    delete next.engine;
  }
  if (next.model === void 0) {
    delete next.model;
  }
  if (next.sessionKey === void 0) {
    delete next.sessionKey;
  }
  if (next.runId === void 0) {
    delete next.runId;
  }
  return next;
}
function removeUndefinedAutomationFields(automation) {
  const next = { ...automation };
  for (const key of [
    "tenant",
    "boardId",
    "createdByCardId",
    "idempotencyKey",
    "skills",
    "workspace",
    "workspaceAccess",
    "maxRuntimeSeconds",
    "maxRetries",
    "scheduledAt",
    "summary",
    "createdCardIds",
    "dispatchCount",
    "lastDispatchAt",
    "launch"
  ]) {
    const value = next[key];
    if (value === void 0 || Array.isArray(value) && value.length === 0 || typeof value === "object" && value !== null && Object.keys(value).length === 0) {
      delete next[key];
    }
  }
  return next;
}
function removeUndefinedMetadataFields(metadata) {
  const next = { ...metadata };
  for (const key of [
    "attempts",
    "comments",
    "links",
    "proof",
    "artifacts",
    "attachments",
    "workerLogs",
    "workerProtocol",
    "automation",
    "claim",
    "diagnostics",
    "notifications",
    "templateId",
    "archivedAt",
    "stale",
    "lifecycleStatusSourceUpdatedAt",
    "failureCount"
  ]) {
    const value = next[key];
    if (value === void 0 || Array.isArray(value) && value.length === 0 || typeof value === "number" && value === 0 && key === "failureCount") {
      delete next[key];
    }
  }
  return next;
}
function clearDiagnostics(metadata, kinds) {
  if (!metadata?.diagnostics) {
    return metadata ?? {};
  }
  return {
    ...metadata,
    diagnostics: metadata.diagnostics.filter((entry) => !kinds.includes(entry.kind))
  };
}
function metadataIsEmpty(metadata) {
  return !metadata || Object.keys(metadata).length === 0;
}
function metadataByteSize(metadata) {
  return Buffer.byteLength(JSON.stringify(metadata), "utf8");
}
function dropFirst(items) {
  if (!items?.length) {
    return void 0;
  }
  const next = items.slice(1);
  return next.length ? next : void 0;
}
function dropFirstProofExcept(items, preserveProofId) {
  if (!items?.length) {
    return void 0;
  }
  const index = preserveProofId ? items.findIndex((proof) => proof.id !== preserveProofId) : 0;
  if (index < 0) {
    return items.slice();
  }
  const next = items.filter((_, itemIndex) => itemIndex !== index);
  return next.length ? next : void 0;
}
function dropFirstNonDependencyLink(items) {
  if (!items?.length) {
    return void 0;
  }
  const index = items.findIndex((link) => !isDependencyLink(link));
  if (index < 0) {
    return items.slice();
  }
  const next = items.filter((_, itemIndex) => itemIndex !== index);
  return next.length ? next : void 0;
}
function appendLinkPreservingDependencies(links, link) {
  const next = [...links, link];
  if (next.length <= MAX_CARD_LINKS) {
    return next;
  }
  const dropIndex = next.findIndex((entry) => !isDependencyLink(entry));
  if (dropIndex < 0 || dropIndex === next.length - 1) {
    throw new Error("card link limit reached.");
  }
  return next.filter((_, index) => index !== dropIndex);
}
function trimMetadataToBudget(metadata, options = {}) {
  let next = removeUndefinedMetadataFields(metadata);
  while (metadataByteSize(next) > MAX_CARD_METADATA_BYTES) {
    const currentSize = metadataByteSize(next);
    if (next.attempts?.length) {
      next = removeUndefinedMetadataFields({ ...next, attempts: dropFirst(next.attempts) });
    } else if (next.diagnostics?.length) {
      next = removeUndefinedMetadataFields({ ...next, diagnostics: dropFirst(next.diagnostics) });
    } else if (next.notifications?.length) {
      next = removeUndefinedMetadataFields({
        ...next,
        notifications: dropFirst(next.notifications)
      });
    } else if (next.proof?.some((proof) => !options.preserveProofId || proof.id !== options.preserveProofId)) {
      next = removeUndefinedMetadataFields({
        ...next,
        proof: dropFirstProofExcept(next.proof, options.preserveProofId)
      });
    } else if (next.artifacts?.length) {
      next = removeUndefinedMetadataFields({ ...next, artifacts: dropFirst(next.artifacts) });
    } else if (next.attachments?.length) {
      next = removeUndefinedMetadataFields({
        ...next,
        attachments: dropFirst(next.attachments)
      });
    } else if (next.workerLogs?.length) {
      next = removeUndefinedMetadataFields({ ...next, workerLogs: dropFirst(next.workerLogs) });
    } else if (next.links?.length) {
      const links = dropFirstNonDependencyLink(next.links);
      if (links?.length === next.links.length) {
        next = removeUndefinedMetadataFields({ ...next, comments: dropFirst(next.comments) });
      } else {
        next = removeUndefinedMetadataFields({ ...next, links });
      }
    } else if (next.comments?.length) {
      next = removeUndefinedMetadataFields({ ...next, comments: dropFirst(next.comments) });
    } else if (options.preserveProofId) {
      throw new Error(`card metadata cannot retain proof: ${options.preserveProofId}`);
    }
    if (metadataByteSize(next) >= currentSize) {
      if (options.preserveProofId) {
        throw new Error(`card metadata cannot retain proof: ${options.preserveProofId}`);
      }
      break;
    }
  }
  return next;
}

// ../core/src/store-card-helpers.ts
function compareCards(left, right) {
  if (left.status !== right.status) {
    return TASKFOLD_STATUSES.indexOf(left.status) - TASKFOLD_STATUSES.indexOf(right.status);
  }
  if (left.position !== right.position) {
    return left.position - right.position;
  }
  if (left.createdAt !== right.createdAt) {
    return left.createdAt - right.createdAt;
  }
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}
function cardSessionKey(card) {
  return card.sessionKey ?? card.execution?.sessionKey;
}
function cardRunId(card) {
  return card.runId ?? card.execution?.runId;
}
function executionAttemptStatus(execution) {
  if (execution.status === "running") {
    return "running";
  }
  if (execution.status === "blocked") {
    return "blocked";
  }
  if (execution.status === "done" || execution.status === "review") {
    return "succeeded";
  }
  return "stopped";
}
function syncExecutionAttemptMetadata(metadata, execution, now) {
  if (!execution) {
    return metadata;
  }
  const attempts = [...metadata.attempts ?? []];
  const key = execution.runId ?? execution.sessionKey ?? execution.id;
  const existingIndex = attempts.findIndex(
    (attempt) => execution.runId && attempt.runId === execution.runId || !execution.runId && attempt.id === key
  );
  const existingAttempt = existingIndex >= 0 ? attempts[existingIndex] : void 0;
  const attemptStatus = execution.status === "blocked" && existingAttempt?.status === "stopped" ? "stopped" : executionAttemptStatus(execution);
  const nextAttempt = {
    id: existingAttempt?.id ?? key,
    status: attemptStatus,
    startedAt: existingAttempt?.startedAt ?? execution.startedAt,
    mode: execution.mode,
    ...execution.engine ? { engine: execution.engine } : {},
    ...execution.model ? { model: execution.model } : {},
    ...execution.sessionKey ? { sessionKey: execution.sessionKey } : {},
    ...execution.runId ? { runId: execution.runId } : {},
    ...attemptStatus !== "running" && { endedAt: execution.updatedAt || now },
    ...attemptStatus !== "succeeded" && existingAttempt?.error ? { error: existingAttempt.error } : {},
    // Stamped once when the attempt appears, then carried forward, so a prompt
    // change mid-run cannot relabel an attempt already under way.
    promptVersion: existingAttempt?.promptVersion ?? TASKFOLD_PROMPT_VERSION
  };
  if (existingIndex >= 0) {
    attempts[existingIndex] = nextAttempt;
  } else {
    attempts.push(nextAttempt);
  }
  const previousFailed = existingAttempt?.status === "blocked" || existingAttempt?.status === "failed";
  const attemptFailed = attemptStatus === "blocked" || attemptStatus === "failed";
  const failureCount = attemptFailed ? previousFailed ? metadata.failureCount : (metadata.failureCount ?? 0) + 1 : attemptStatus === "succeeded" ? 0 : metadata.failureCount;
  return removeUndefinedMetadataFields({
    ...metadata,
    attempts: attempts.slice(-MAX_CARD_ATTEMPTS),
    failureCount
  });
}
function appendEvent(card, event, at = Date.now()) {
  return [
    ...normalizeEvents(card.events),
    {
      id: randomUUID4(),
      at,
      ...event
    }
  ].slice(-MAX_CARD_EVENTS);
}
function latestMetadataIdChanged(existing, next) {
  const latestId = next?.at(-1)?.id;
  return Boolean(latestId && latestId !== existing?.at(-1)?.id);
}
function lifecycleStatusSourceUpdatedAtFromPatch(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return void 0;
  }
  if (!Object.hasOwn(metadata, "lifecycleStatusSourceUpdatedAt")) {
    return void 0;
  }
  const sourceUpdatedAt = normalizeTimestamp(
    metadata.lifecycleStatusSourceUpdatedAt,
    0
  );
  return sourceUpdatedAt;
}
function latestStatusTransitionAt(card) {
  for (let index = (card.events?.length ?? 0) - 1; index >= 0; index -= 1) {
    const event = card.events?.[index];
    if ((event?.kind === "moved" || event?.kind === "created") && (event.kind === "created" && card.status !== "todo" || event.kind === "moved" && event.fromStatus !== event.toStatus) && event.toStatus === card.status && typeof event.at === "number" && Number.isFinite(event.at)) {
      return event.at;
    }
  }
  return void 0;
}
function shouldSkipPersistedLifecycleStatusUpdate(existing, sourceUpdatedAt) {
  const lifecycleStatusSourceUpdatedAt = existing.metadata?.lifecycleStatusSourceUpdatedAt;
  if (lifecycleStatusSourceUpdatedAt !== void 0) {
    return sourceUpdatedAt < lifecycleStatusSourceUpdatedAt;
  }
  const statusTransitionAt = latestStatusTransitionAt(existing);
  return statusTransitionAt !== void 0 && sourceUpdatedAt < statusTransitionAt;
}
function updateEvent(existing, next) {
  if (existing.metadata?.workerProtocol?.state !== next.metadata?.workerProtocol?.state && next.metadata?.workerProtocol?.state === "violated") {
    return { kind: "protocol_violation" };
  }
  if (existing.status !== next.status || existing.position !== next.position) {
    return {
      kind: "moved",
      fromStatus: existing.status,
      toStatus: next.status
    };
  }
  if (cardSessionKey(existing) !== cardSessionKey(next)) {
    return {
      kind: "linked",
      ...cardSessionKey(next) ? { sessionKey: cardSessionKey(next) } : {}
    };
  }
  if (existing.execution?.status !== next.execution?.status || existing.execution?.engine !== next.execution?.engine || cardRunId(existing) !== cardRunId(next)) {
    const existingAttempts = existing.metadata?.attempts ?? [];
    const nextAttempts = next.metadata?.attempts ?? [];
    const latestAttempt = nextAttempts.at(-1);
    if (nextAttempts.length > existingAttempts.length) {
      return {
        kind: "attempt_started",
        ...latestAttempt?.sessionKey ? { sessionKey: latestAttempt.sessionKey } : {},
        ...latestAttempt?.runId ? { runId: latestAttempt.runId } : {}
      };
    }
    const previousAttempt = latestAttempt ? existingAttempts.find((attempt) => attempt.id === latestAttempt.id) : void 0;
    if (latestAttempt && previousAttempt?.status !== latestAttempt.status) {
      return {
        kind: "attempt_updated",
        ...latestAttempt.sessionKey ? { sessionKey: latestAttempt.sessionKey } : {},
        ...latestAttempt.runId ? { runId: latestAttempt.runId } : {}
      };
    }
    return {
      kind: "execution_updated",
      ...cardSessionKey(next) ? { sessionKey: cardSessionKey(next) } : {},
      ...cardRunId(next) ? { runId: cardRunId(next) } : {}
    };
  }
  if (existing.metadata?.claim?.token !== next.metadata?.claim?.token) {
    return { kind: "claimed" };
  }
  if (existing.metadata?.claim?.lastHeartbeatAt !== next.metadata?.claim?.lastHeartbeatAt) {
    return { kind: "heartbeat" };
  }
  if ((existing.metadata?.comments?.length ?? 0) !== (next.metadata?.comments?.length ?? 0) || latestMetadataIdChanged(existing.metadata?.comments, next.metadata?.comments)) {
    return { kind: "comment_added" };
  }
  if ((existing.metadata?.links?.length ?? 0) !== (next.metadata?.links?.length ?? 0) || latestMetadataIdChanged(existing.metadata?.links, next.metadata?.links)) {
    return { kind: "link_added" };
  }
  if ((existing.metadata?.proof?.length ?? 0) !== (next.metadata?.proof?.length ?? 0) || latestMetadataIdChanged(existing.metadata?.proof, next.metadata?.proof)) {
    return { kind: "proof_added" };
  }
  if ((existing.metadata?.artifacts?.length ?? 0) !== (next.metadata?.artifacts?.length ?? 0) || latestMetadataIdChanged(existing.metadata?.artifacts, next.metadata?.artifacts)) {
    return { kind: "artifact_added" };
  }
  if ((existing.metadata?.attachments?.length ?? 0) !== (next.metadata?.attachments?.length ?? 0) || latestMetadataIdChanged(existing.metadata?.attachments, next.metadata?.attachments)) {
    return (next.metadata?.attachments?.length ?? 0) > (existing.metadata?.attachments?.length ?? 0) ? { kind: "attachment_added" } : { kind: "edited" };
  }
  if (existing.metadata?.workerProtocol?.state !== next.metadata?.workerProtocol?.state) {
    return { kind: "orchestration" };
  }
  if ((existing.metadata?.workerLogs?.length ?? 0) !== (next.metadata?.workerLogs?.length ?? 0) || latestMetadataIdChanged(existing.metadata?.workerLogs, next.metadata?.workerLogs)) {
    return { kind: "orchestration" };
  }
  if ((existing.metadata?.diagnostics?.length ?? 0) !== (next.metadata?.diagnostics?.length ?? 0)) {
    return { kind: "diagnostic" };
  }
  if ((existing.metadata?.notifications?.length ?? 0) !== (next.metadata?.notifications?.length ?? 0) || latestMetadataIdChanged(existing.metadata?.notifications, next.metadata?.notifications)) {
    return { kind: "notification" };
  }
  if (existing.metadata?.automation?.dispatchCount !== next.metadata?.automation?.dispatchCount || existing.metadata?.automation?.lastDispatchAt !== next.metadata?.automation?.lastDispatchAt) {
    return { kind: "dispatch" };
  }
  if (!existing.metadata?.archivedAt && next.metadata?.archivedAt) {
    return { kind: "archived" };
  }
  if (existing.metadata?.archivedAt && !next.metadata?.archivedAt) {
    return { kind: "unarchived" };
  }
  if (!existing.metadata?.stale && next.metadata?.stale) {
    return { kind: "stale" };
  }
  return { kind: "edited" };
}
function removeUndefinedCardFields(card) {
  const next = { ...card };
  for (const key of [
    "notes",
    "agentId",
    "sessionKey",
    "runId",
    "taskId",
    "sourceUrl",
    "execution",
    "delivery",
    "sourceReferences",
    "startedAt",
    "completedAt",
    "metadata"
  ]) {
    if (next[key] === void 0) {
      delete next[key];
    }
  }
  if (metadataIsEmpty(next.metadata)) {
    delete next.metadata;
  }
  return next;
}
function assertCanMutateClaimedCard(card, scope) {
  if (!scope) {
    return;
  }
  const claim = card.metadata?.claim;
  if (!claim) {
    return;
  }
  const ownerId = normalizeOptionalString(scope.ownerId);
  const token = normalizeOptionalString(scope.token);
  if (claim.ownerId !== ownerId && !safeEqualSecret(token, claim.token)) {
    throw new Error(`card is claimed by ${claim.ownerId}.`);
  }
}
function retryBudgetExhausted(card) {
  const maxRetries = card.metadata?.automation?.maxRetries;
  return Boolean(maxRetries && (card.metadata?.failureCount ?? 0) > maxRetries);
}
function diagnostic(params, now) {
  return {
    ...params,
    firstSeenAt: now,
    lastSeenAt: now,
    count: 1
  };
}
function mergeDiagnostics(previous, next) {
  const byKind = new Map(previous?.map((entry) => [entry.kind, entry]));
  return next.map((entry) => {
    const prior = byKind.get(entry.kind);
    return prior ? {
      ...entry,
      firstSeenAt: prior.firstSeenAt,
      count: prior.count + 1
    } : entry;
  });
}
function taskfoldLastActivityAt(card) {
  return Math.max(
    card.metadata?.claim?.lastHeartbeatAt ?? 0,
    card.execution?.updatedAt ?? 0,
    card.updatedAt
  );
}
function computeCardDiagnostics(card, now) {
  if (card.metadata?.archivedAt) {
    if (card.status === "done") {
      return [];
    }
    return [
      diagnostic(
        {
          kind: "archived_but_active",
          severity: "warning",
          title: "Archived card is still in an active status",
          detail: `Card status is "${card.status}" but it is archived, so it is excluded from dispatch without any start failure or error. Unarchive it or move it to "done" to stop the silent skip.`,
          actions: []
        },
        now
      )
    ];
  }
  const diagnostics = [];
  const claim = card.metadata?.claim;
  const lastHeartbeatAt = taskfoldLastActivityAt(card);
  if ((card.status === "todo" || card.status === "backlog" || card.status === "ready") && card.agentId && now - card.updatedAt > READY_STRANDED_MS) {
    diagnostics.push(
      diagnostic(
        {
          kind: "stranded_ready",
          severity: "warning",
          title: "Assigned card is waiting",
          detail: "The card has an assigned agent but has not been claimed recently.",
          actions: [{ kind: "claim", label: "Claim card" }]
        },
        now
      )
    );
  }
  if (card.status === "running" && now - lastHeartbeatAt > RUNNING_HEARTBEAT_STALE_MS) {
    diagnostics.push(
      diagnostic(
        {
          kind: "running_without_heartbeat",
          severity: "error",
          title: "Running card has no recent heartbeat",
          detail: "The linked run or claim has not reported recent activity.",
          actions: [
            { kind: "open_session", label: "Open session" },
            { kind: "reassign", label: "Reassign card" }
          ]
        },
        now
      )
    );
  }
  if (card.status === "blocked" && now - card.updatedAt > BLOCKED_TOO_LONG_MS) {
    diagnostics.push(
      diagnostic(
        {
          kind: "blocked_too_long",
          severity: "warning",
          title: "Blocked card needs attention",
          detail: "The card has been blocked for more than a day.",
          actions: [{ kind: "unblock", label: "Move to todo" }]
        },
        now
      )
    );
  }
  if ((card.metadata?.failureCount ?? 0) >= 2) {
    diagnostics.push(
      diagnostic(
        {
          kind: "repeated_failures",
          severity: "error",
          title: "Repeated run failures",
          detail: "Multiple attempts failed or blocked on this card.",
          actions: [{ kind: "reassign", label: "Reassign card" }]
        },
        now
      )
    );
  }
  if (card.status === "done" && !(card.metadata?.proof?.length || card.metadata?.artifacts?.length || card.metadata?.attachments?.length)) {
    diagnostics.push(
      diagnostic(
        {
          kind: "missing_proof",
          severity: "warning",
          title: "Done card has no proof",
          detail: "The card is marked done without proof or an attached artifact.",
          actions: [{ kind: "add_proof", label: "Add proof" }]
        },
        now
      )
    );
  }
  if (card.sessionKey && !card.execution && card.status === "running") {
    diagnostics.push(
      diagnostic(
        {
          kind: "orphaned_session",
          severity: "warning",
          title: "Running card has only a loose session link",
          detail: "The card is running but has no execution record for lifecycle handoff.",
          actions: [{ kind: "open_session", label: "Open session" }]
        },
        now
      )
    );
  }
  return diagnostics;
}
function capText(value, max) {
  if (!value) {
    return void 0;
  }
  return value.length <= max ? value : `${truncateUtf16Safe(value, Math.max(0, max - 1))}\u2026`;
}
function cardBoardId(card) {
  return card.metadata?.automation?.boardId ?? "default";
}
function cardParentIds(card) {
  return (card.metadata?.links ?? []).filter((link) => link.type === "parent" && link.targetCardId).map((link) => link.targetCardId).filter((id, index, ids) => ids.indexOf(id) === index);
}
function cardChildIds(card) {
  return (card.metadata?.links ?? []).filter((link) => link.type === "child" && link.targetCardId).map((link) => link.targetCardId).filter((id, index, ids) => ids.indexOf(id) === index);
}
function cardRequirementId(card) {
  return (card.metadata?.links ?? []).find(
    (link) => link.type === "contained_by" && link.targetCardId
  )?.targetCardId;
}
function cardRequirementChildIds(card) {
  return (card.metadata?.links ?? []).filter((link) => link.type === "contains" && link.targetCardId).map((link) => link.targetCardId).filter((id, index, ids) => ids.indexOf(id) === index);
}
function isRequirementCard(card) {
  return card.kind === "requirement" || cardRequirementChildIds(card).length > 0;
}
function latestRunningAttempt(card) {
  return card.metadata?.attempts?.findLast((attempt) => attempt.status === "running");
}
function isDependencyPromotableStatus(status) {
  return status === "backlog" || status === "triage" || status === "todo" || status === "scheduled" || status === "ready";
}
function isActiveDependencyTarget(card, options = {}) {
  return Boolean(card.metadata?.claim) || card.execution?.status === "running" || Boolean(latestRunningAttempt(card)) || !options.allowStatusOnly && (card.status === "running" || card.status === "review");
}
function closeRunningAttempts(attempts, now, status, reason) {
  if (!attempts?.some((attempt) => attempt.status === "running")) {
    return attempts;
  }
  return attempts.map(
    (attempt) => attempt.status === "running" ? { ...attempt, status, endedAt: now, ...reason ? { error: reason } : {} } : attempt
  );
}
function notificationSequence(event) {
  return typeof event.sequence === "number" && Number.isFinite(event.sequence) ? Math.trunc(event.sequence) : void 0;
}
function compareNotifications(a, b) {
  if (a.createdAt !== b.createdAt) {
    return a.createdAt - b.createdAt;
  }
  const aSequence = notificationSequence(a);
  const bSequence = notificationSequence(b);
  if (aSequence !== void 0 && bSequence !== void 0) {
    return aSequence - bSequence || a.id.localeCompare(b.id);
  }
  if (aSequence !== void 0) {
    return -1;
  }
  if (bSequence !== void 0) {
    return 1;
  }
  return a.id.localeCompare(b.id);
}

// ../core/src/session-link.ts
function sanitizeSessionSegment(value, fallback) {
  const sanitized = (value ?? fallback).trim().replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return (sanitized || fallback).slice(0, 96);
}
function buildSessionKey(card) {
  const boardId = sanitizeSessionSegment(cardBoardId(card), "default");
  const cardId = sanitizeSessionSegment(card.id, "card");
  const suffix = `subagent:taskfold-${boardId}-${cardId}`;
  return card.agentId ? `agent:${sanitizeSessionSegment(card.agentId, "agent")}:${suffix}` : suffix;
}
function taskfoldCardSessionLookupKey(sessionKey) {
  if (!sessionKey) {
    return void 0;
  }
  const match = /^agent:[^:]+:(.+)$/.exec(sessionKey);
  return match ? match[1] : sessionKey;
}
function isProvisionalOrAbsentRunId(runId, cardId) {
  return runId === void 0 || runId.startsWith(`taskfold:${cardId}:`);
}
function taskfoldCardMatchesLifecycleLink(card, target) {
  const runId = cardRunId(card);
  if (target.runId && runId === target.runId) {
    return true;
  }
  if (target.runId && !isProvisionalOrAbsentRunId(runId, card.id)) {
    return false;
  }
  const cardKey = taskfoldCardSessionLookupKey(cardSessionKey(card));
  const targetKey = taskfoldCardSessionLookupKey(target.sessionKey);
  return Boolean(cardKey && targetKey && cardKey === targetKey);
}

// src/backend/src/workspace-access.ts
import {
  listAgentIds,
  resolveAgentConfig,
  resolveAgentWorkspaceDir,
  resolveDefaultAgentId
} from "openclaw/plugin-sdk/agent-runtime";
import {
  canonicalPathFromExistingAncestor,
  isPathInside
} from "openclaw/plugin-sdk/security-runtime";
var TASKFOLD_TOOL_NAMES = [
  "taskfold_list",
  "taskfold_create",
  "taskfold_link",
  "taskfold_read",
  "taskfold_claim",
  "taskfold_heartbeat",
  "taskfold_complete",
  "taskfold_attachment_add",
  "taskfold_attachment_read",
  "taskfold_attachment_delete",
  "taskfold_block",
  "taskfold_boards",
  "taskfold_board_create",
  "taskfold_board_archive",
  "taskfold_board_delete",
  "taskfold_stats",
  "taskfold_runs",
  "taskfold_specify",
  "taskfold_decompose",
  "taskfold_notify_subscribe",
  "taskfold_notify_list",
  "taskfold_notify_events",
  "taskfold_notify_advance",
  "taskfold_notify_unsubscribe",
  "taskfold_promote",
  "taskfold_reassign",
  "taskfold_reclaim",
  "taskfold_dispatch",
  "taskfold_release",
  "taskfold_comment",
  "taskfold_proof",
  "taskfold_worker_log",
  "taskfold_protocol_violation",
  "taskfold_unblock",
  "taskfold_move",
  "taskfold_projects",
  "taskfold_project_create",
  "taskfold_project_read",
  "taskfold_milestone_create",
  "taskfold_move_milestone",
  "taskfold_move_project",
  "taskfold_project_documents",
  "taskfold_project_document_create"
];
var TASKFOLD_REQUIRED_WORKER_TOOLS = [
  "taskfold_heartbeat",
  "taskfold_complete",
  "taskfold_block"
];
function resolveTaskfoldAgentWorkspace(config, agentId) {
  return resolveAgentWorkspaceDir(config, agentId ?? resolveDefaultAgentId(config));
}
function resolveConfiguredTaskfoldWorkspaceAccess(params) {
  if (params.unrestricted) {
    return { unrestricted: true };
  }
  return {
    unrestricted: false,
    writable: true,
    roots: listAgentIds(params.config).map(
      (agentId) => resolveAgentWorkspaceDir(params.config, agentId)
    )
  };
}
async function resolveAgentTaskfoldWorkspaceRuntime(params) {
  const agentId = params.agentId ?? resolveDefaultAgentId(params.config);
  const sandboxRuntime = params.prepareSandboxWorkspaceAuthority ? await params.prepareSandboxWorkspaceAuthority({
    config: params.config,
    agentId,
    confinedToolNames: TASKFOLD_TOOL_NAMES,
    requiredToolNames: TASKFOLD_REQUIRED_WORKER_TOOLS,
    modelProvider: params.modelProvider,
    modelId: params.modelId,
    sessionKey: params.sessionKey,
    workspaceDir: params.workspaceDir
  }) : void 0;
  if (!sandboxRuntime) {
    return {
      sandboxed: false,
      workspaceAccess: { unrestricted: true }
    };
  }
  return {
    sandboxed: sandboxRuntime.sandboxed,
    workspaceAccess: sandboxRuntime.sandboxed ? {
      unrestricted: false,
      roots: [resolveAgentWorkspaceDir(params.config, agentId)],
      writable: sandboxRuntime.workspaceAccess === "rw"
    } : { unrestricted: true },
    ...sandboxRuntime.confinementError ? { confinementError: sandboxRuntime.confinementError } : {}
  };
}
function resolveCommandTaskfoldWorkspaceAccess(params) {
  if (params.gatewayClientScopes) {
    return resolveConfiguredTaskfoldWorkspaceAccess({
      config: params.config,
      unrestricted: params.gatewayClientScopes.includes("operator.admin")
    });
  }
  const agentId = params.agentId ?? resolveDefaultAgentId(params.config);
  const sandboxRuntime = params.sessionKey && params.resolveSandboxWorkspaceAuthority ? params.resolveSandboxWorkspaceAuthority({
    config: params.config,
    agentId,
    sessionKey: params.sessionKey
  }) : void 0;
  if (sandboxRuntime?.sandboxed) {
    return {
      unrestricted: false,
      roots: [resolveAgentWorkspaceDir(params.config, agentId)],
      writable: sandboxRuntime.workspaceAccess === "rw"
    };
  }
  const workspaceOnly = resolveAgentConfig(params.config, agentId)?.tools?.fs?.workspaceOnly ?? params.config.tools?.fs?.workspaceOnly;
  return workspaceOnly === true ? {
    unrestricted: false,
    roots: [resolveAgentWorkspaceDir(params.config, agentId)],
    writable: true
  } : { unrestricted: true };
}
function resolveToolTaskfoldWorkspaceAccess(context, resolveSandboxWorkspaceAuthority) {
  if (!context?.sandboxed && context?.fsPolicy?.workspaceOnly !== true) {
    return { unrestricted: true };
  }
  const config = context.runtimeConfig ?? context.getRuntimeConfig?.() ?? context.config;
  const sandboxRuntime = context.sandboxed && config && context.sessionKey && resolveSandboxWorkspaceAuthority ? resolveSandboxWorkspaceAuthority({
    config,
    agentId: context.agentId,
    sessionKey: context.sessionKey
  }) : void 0;
  return {
    unrestricted: false,
    roots: context.workspaceDir ? [context.workspaceDir] : [],
    writable: sandboxRuntime ? sandboxRuntime.workspaceAccess === "rw" : !context.sandboxed
  };
}
async function canonicalizeTaskfoldWorkspaceAccess(access) {
  if (access.unrestricted) {
    return access;
  }
  const roots = Array.from(
    new Set(
      await Promise.all(
        access.roots.map(async (root) => await canonicalPathFromExistingAncestor(root))
      )
    )
  );
  if (roots.length === 0) {
    throw new Error("restricted workspace access has no allowed roots.");
  }
  return { unrestricted: false, roots, writable: access.writable };
}
function intersectTaskfoldWorkspaceAccess(left, right) {
  if (left.unrestricted) {
    return right;
  }
  if (right.unrestricted) {
    return left;
  }
  const roots = /* @__PURE__ */ new Set();
  for (const leftRoot of left.roots) {
    for (const rightRoot of right.roots) {
      if (leftRoot === rightRoot || isPathInside(leftRoot, rightRoot)) {
        roots.add(rightRoot);
      } else if (isPathInside(rightRoot, leftRoot)) {
        roots.add(leftRoot);
      }
    }
  }
  if (roots.size === 0) {
    throw new Error("workspace access does not overlap the card's persisted authority.");
  }
  return {
    unrestricted: false,
    roots: Array.from(roots),
    writable: left.writable && right.writable
  };
}
async function assertCanonicalTaskfoldPathAccess(candidate, access) {
  if (access.unrestricted) {
    return candidate;
  }
  for (const root of access.roots) {
    const canonicalRoot = await canonicalPathFromExistingAncestor(root);
    if (isPathInside(canonicalRoot, candidate)) {
      return candidate;
    }
  }
  throw new Error("workspace path is outside the caller's allowed workspaces.");
}
async function assertCanonicalTaskfoldRootAccess(candidate, access) {
  if (access.unrestricted) {
    return candidate;
  }
  for (const root of access.roots) {
    const canonicalRoot = await canonicalPathFromExistingAncestor(root);
    if (canonicalRoot === candidate) {
      return candidate;
    }
  }
  throw new Error("workspace path must equal one of the caller's allowed workspace roots.");
}
async function assertPathAllowed(value, access) {
  if (typeof value !== "string" || !value.trim()) {
    return void 0;
  }
  const candidate = await canonicalPathFromExistingAncestor(value.trim());
  return await assertCanonicalTaskfoldPathAccess(candidate, access);
}
async function assertWorkspaceAllowed(value, access, options) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return void 0;
  }
  const workspace = value;
  if (options?.sourceOnly) {
    return await assertPathAllowed(workspace.sourcePath ?? workspace.path, access);
  }
  await assertPathAllowed(workspace.path, access);
  await assertPathAllowed(workspace.sourcePath, access);
  return void 0;
}
function readRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function containsTaskfoldWorkspaceMutation(value) {
  const record = readRecord(value);
  if (!record) {
    return false;
  }
  if (Object.hasOwn(record, "workspace") || Object.hasOwn(record, "defaultWorkspace")) {
    return true;
  }
  return containsTaskfoldWorkspaceMutation(record.patch) || containsTaskfoldWorkspaceMutation(readRecord(record.metadata)?.automation) || Array.isArray(record.children) && record.children.some((child) => containsTaskfoldWorkspaceMutation(child));
}
function withTaskfoldWorkspaceAccess(value, access) {
  return { ...withoutTaskfoldWorkspaceAccess(value), workspaceAccess: access };
}
function withoutTaskfoldWorkspaceAccess(value) {
  const record = readRecord(value) ?? {};
  const { workspaceAccess: _untrustedWorkspaceAccess, ...rest } = record;
  return rest;
}
function withTaskfoldDecomposeWorkspaceAccess(value, access) {
  const record = withoutTaskfoldWorkspaceAccess(value);
  return {
    ...record,
    ...Array.isArray(record.children) ? {
      children: record.children.map((child) => withTaskfoldWorkspaceAccess(child, access))
    } : {}
  };
}
async function assertTaskfoldWorkspaceMutationAccess(value, access) {
  if (access.unrestricted) {
    return;
  }
  const record = readRecord(value);
  if (!record) {
    return;
  }
  await assertWorkspaceAllowed(record.workspace, access);
  await assertWorkspaceAllowed(record.defaultWorkspace, access);
  const patch = readRecord(record.patch);
  if (patch) {
    await assertTaskfoldWorkspaceMutationAccess(patch, access);
  }
  const metadata = readRecord(record.metadata);
  const automation = readRecord(metadata?.automation);
  if (automation) {
    await assertTaskfoldWorkspaceMutationAccess(automation, access);
  }
  if (Array.isArray(record.children)) {
    for (const child of record.children) {
      await assertTaskfoldWorkspaceMutationAccess(child, access);
    }
  }
}
async function assertTaskfoldWorkspaceSourceAccess(workspace, access) {
  return await assertWorkspaceAllowed(workspace, access, { sourceOnly: true });
}
function guardTaskfoldToolsForWorkspaceAccess(tools, context, resolveSandboxWorkspaceAuthority) {
  const workspaceAccess = resolveToolTaskfoldWorkspaceAccess(
    context,
    resolveSandboxWorkspaceAuthority
  );
  return tools.map((tool) => ({
    ...tool,
    execute: async (toolCallId, rawParams, signal, onUpdate) => {
      const canonicalAccess = await canonicalizeTaskfoldWorkspaceAccess(workspaceAccess);
      await assertTaskfoldWorkspaceMutationAccess(rawParams, canonicalAccess);
      const sanitizedParams = withoutTaskfoldWorkspaceAccess(rawParams);
      const constrainedParams = tool.name === "taskfold_create" ? withTaskfoldWorkspaceAccess(sanitizedParams, canonicalAccess) : tool.name === "taskfold_decompose" ? withTaskfoldDecomposeWorkspaceAccess(sanitizedParams, canonicalAccess) : tool.name === "taskfold_specify" && containsTaskfoldWorkspaceMutation(sanitizedParams) ? withTaskfoldWorkspaceAccess(sanitizedParams, canonicalAccess) : sanitizedParams;
      return await tool.execute(toolCallId, constrainedParams, signal, onUpdate);
    }
  }));
}

// src/backend/src/dispatcher-workspace.ts
function managedWorktreeName(cardId) {
  const suffix = cardId.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
  return `wb-${suffix}`.slice(0, 64).replace(/-$/, "");
}
async function cleanupTaskfoldRunWorktree(params) {
  const card = (await params.store.list()).find(
    (entry) => taskfoldCardMatchesLifecycleLink(entry, {
      runId: params.runId,
      sessionKey: params.targetSessionKey
    })
  );
  const workspace = card?.metadata?.automation?.workspace;
  if (!card || workspace?.kind !== "worktree" || !workspace.path) {
    return;
  }
  await params.worktrees.removeIfLossless({
    path: workspace.path,
    // Must match the ownerKind/ownerId used when this worktree was created
    // (card.id), or the host's ownership check silently refuses the removal.
    ownerKind: "workboard",
    ownerId: card.id
  });
}
async function resolveDispatchWorkspaceAccess(params) {
  const currentAccess = await canonicalizeTaskfoldWorkspaceAccess(
    params.currentAccess ?? { unrestricted: true }
  );
  const persistedAccess = params.card.metadata?.automation?.workspaceAccess;
  const workspace = params.card.metadata?.automation?.workspace;
  let targetWorkspace;
  if (!persistedAccess?.unrestricted || !currentAccess.unrestricted) {
    const resolved = params.resolveAgentWorkspace?.(params.card.agentId);
    targetWorkspace = resolved ? await canonicalPathFromExistingAncestor2(resolved) : void 0;
  }
  const cardAccess = persistedAccess ? await canonicalizeTaskfoldWorkspaceAccess(persistedAccess) : currentAccess.unrestricted ? !workspace || workspace.kind === "scratch" ? currentAccess : (() => {
    throw new Error(
      "card workspace authority is unknown; re-save its workspace with current permissions before dispatch."
    );
  })() : currentAccess;
  const workspaceAccess = intersectTaskfoldWorkspaceAccess(cardAccess, currentAccess);
  if (!workspaceAccess.unrestricted && !workspaceAccess.writable) {
    throw new Error(
      "card workspace authority is read-only; manual movement is allowed but worker dispatch requires write access."
    );
  }
  return {
    workspaceAccess,
    ...targetWorkspace ? { targetWorkspace } : {},
    persistWorkspaceAccess: !persistedAccess
  };
}
async function assertRestrictedTaskfoldTarget(params) {
  const resolved = params.resolveAgentWorkspaceRuntime ? await params.resolveAgentWorkspaceRuntime(
    params.agentId,
    params.sessionKey,
    params.root,
    params.modelProvider,
    params.modelId
  ) : {
    sandboxed: false,
    workspaceAccess: { unrestricted: true }
  };
  const targetRuntime = {
    ...resolved,
    workspaceAccess: await canonicalizeTaskfoldWorkspaceAccess(resolved.workspaceAccess)
  };
  if (!targetRuntime.sandboxed) {
    throw new Error("target agent is not sandboxed for this restricted Taskfold card.");
  }
  if (targetRuntime.confinementError) {
    throw new Error(targetRuntime.confinementError);
  }
  if (targetRuntime.workspaceAccess.unrestricted || !targetRuntime.workspaceAccess.writable) {
    throw new Error("target agent does not have writable workspace-only access.");
  }
  await assertCanonicalTaskfoldRootAccess(params.root, targetRuntime.workspaceAccess);
}

// src/backend/src/dispatcher.ts
import path15 from "node:path";
import { formatErrorMessage } from "openclaw/plugin-sdk/error-runtime";
import { isFutureDateTimestampMs as isFutureDateTimestampMs2 } from "openclaw/plugin-sdk/number-runtime";
import { canonicalPathFromExistingAncestor as canonicalPathFromExistingAncestor3 } from "openclaw/plugin-sdk/security-runtime";

// ../core/src/worker-prompt.ts
init_store_constants();
var RECENT_ATTEMPTS = 8;
var FAILED_ATTEMPT_DETAIL = 3;
function cardResultSummary(card) {
  return card.metadata?.automation?.summary ?? card.metadata?.comments?.findLast((comment) => comment.body.trim())?.body ?? card.metadata?.proof?.findLast((proof) => proof.note?.trim())?.note;
}
function isFailedAttempt(attempt) {
  return attempt.status === "failed" || attempt.status === "blocked" || attempt.status === "stopped";
}
function retryGuidance(card) {
  const attempts = card.metadata?.attempts ?? [];
  const failed = attempts.filter(isFailedAttempt);
  if (failed.length === 0) {
    return [];
  }
  const lines = ["", "## This is a retry"];
  lines.push(
    `${failed.length} previous attempt${failed.length === 1 ? "" : "s"} on this card did not succeed. Do not simply repeat the previous approach.`
  );
  const detailed = failed.slice(-FAILED_ATTEMPT_DETAIL);
  for (const attempt of detailed) {
    const reason = capText(attempt.error, 300) ?? "no reason recorded";
    lines.push(`- ${attempt.status}: ${reason}`);
  }
  lines.push(
    "Before you start: state what you believe went wrong last time and what you are doing differently. If the previous failure looks environmental rather than a code defect, say so instead of retrying blindly."
  );
  const maxRetries = card.metadata?.automation?.maxRetries;
  const failureCount = card.metadata?.failureCount ?? 0;
  if (maxRetries && failureCount >= maxRetries) {
    lines.push(
      "This is the final attempt within the card's retry budget. If you cannot finish, call taskfold_block with a precise diagnosis and record what you learned \u2014 a bare failure leaves the next person with nothing."
    );
  }
  return lines;
}
function buildWorkerContext(card, cards = [], now = Date.now()) {
  const lines = [
    `# Taskfold card ${card.id}`,
    `Title: ${card.title}`,
    `Status: ${card.status}`,
    `Priority: ${card.priority}`,
    `Board: ${cardBoardId(card)}`,
    `Agent: ${card.agentId ?? "(default)"}`
  ];
  if (card.notes) {
    lines.push("", "## Notes", capText(card.notes, 4e3) ?? "");
  }
  const attempts = card.metadata?.attempts?.slice(-RECENT_ATTEMPTS) ?? [];
  if (attempts.length) {
    lines.push("", "## Recent attempts");
    for (const attempt of attempts) {
      lines.push(
        `- ${attempt.status} ${attempt.model ?? ""} ${attempt.error ? `error=${capText(attempt.error, 240)}` : ""}`.trim()
      );
    }
  }
  lines.push(...retryGuidance(card));
  const comments = card.metadata?.comments?.slice(-12) ?? [];
  if (comments.length) {
    lines.push("", "## Recent comments");
    for (const comment of comments) {
      lines.push(`- ${capText(comment.body, 400)}`);
    }
  }
  const proof = card.metadata?.proof?.slice(-8) ?? [];
  if (proof.length) {
    lines.push("", "## Proof");
    for (const entry of proof) {
      lines.push(
        `- ${entry.status}: ${capText(entry.label ?? entry.command ?? entry.url ?? entry.note, 400)}`
      );
    }
  }
  const artifacts = card.metadata?.artifacts?.slice(-8) ?? [];
  if (artifacts.length) {
    lines.push("", "## Artifacts");
    for (const artifact of artifacts) {
      lines.push(`- ${capText(artifact.label ?? artifact.url ?? artifact.path, 400)}`);
    }
  }
  const attachments = card.metadata?.attachments?.slice(-8) ?? [];
  if (attachments.length) {
    lines.push("", "## Attachments");
    for (const attachment of attachments) {
      const detail = [
        attachment.fileName,
        `${attachment.byteSize} bytes`,
        attachment.mimeType,
        attachment.note
      ].filter(Boolean).join(" \xB7 ");
      lines.push(`- ${capText(detail, 500)}`);
    }
  }
  if (card.metadata?.workerProtocol) {
    const protocol = card.metadata.workerProtocol;
    lines.push("", "## Worker protocol");
    lines.push(`${protocol.state}: ${capText(protocol.detail, 500) ?? "no detail"}`);
  }
  const workerLogs = card.metadata?.workerLogs?.slice(-8) ?? [];
  if (workerLogs.length) {
    lines.push("", "## Worker logs");
    for (const log of workerLogs) {
      lines.push(`- ${log.level}: ${capText(log.message, 500)}`);
    }
  }
  const links = card.metadata?.links?.slice(-8) ?? [];
  if (links.length) {
    lines.push("", "## Links");
    for (const link of links) {
      lines.push(`- ${link.type}: ${link.title ?? link.url ?? link.targetCardId ?? ""}`);
    }
  }
  const cardsById = new Map(cards.map((entry) => [entry.id, entry]));
  const parentResults = cardParentIds(card).map((parentId) => cardsById.get(parentId)).filter((parent) => parent !== void 0 && parent.status === "done").slice(-6);
  if (parentResults.length) {
    lines.push("", "## Parent results");
    for (const parent of parentResults) {
      lines.push(
        `- ${parent.id} ${parent.title}: ${capText(cardResultSummary(parent), 500) ?? "done"}`
      );
    }
  }
  const recentAgentWork = card.agentId && cards.length ? cards.filter(
    (entry) => entry.id !== card.id && cardBoardId(entry) === cardBoardId(card) && entry.agentId === card.agentId && entry.status === "done"
  ).toSorted((a, b) => b.updatedAt - a.updatedAt).slice(0, 5) : [];
  if (recentAgentWork.length) {
    lines.push("", `## Recent done work by ${card.agentId}`);
    for (const entry of recentAgentWork) {
      lines.push(
        `- ${entry.id} ${entry.title}: ${capText(cardResultSummary(entry), 300) ?? "done"}`
      );
    }
  }
  const automation = card.metadata?.automation;
  if (automation) {
    lines.push("", "## Automation");
    if (automation.tenant) {
      lines.push(`Tenant: ${automation.tenant}`);
    }
    if (automation.boardId) {
      lines.push(`Board: ${automation.boardId}`);
    }
    if (automation.skills?.length) {
      lines.push(`Skills: ${automation.skills.join(", ")}`);
    }
    if (automation.workspace) {
      lines.push(
        `Workspace: ${automation.workspace.kind}${automation.workspace.path ? ` ${automation.workspace.path}` : ""}`
      );
    }
    if (automation.summary) {
      lines.push(`Summary: ${capText(automation.summary, 400)}`);
    }
  }
  const diagnostics = computeCardDiagnostics(card, now);
  if (diagnostics.length) {
    lines.push("", "## Active diagnostics");
    for (const entry of diagnostics) {
      lines.push(`- ${entry.severity}: ${entry.title}`);
    }
  }
  return lines.join("\n");
}
function buildWorkerPrompt(params) {
  return [
    `Work on this OpenClaw Taskfold card: ${params.card.title}`,
    "",
    "## Worker protocol",
    `Card id: ${params.card.id}`,
    `Claim ownerId: ${params.ownerId}`,
    `Claim token: ${params.token}`,
    "",
    "Heartbeat with taskfold_heartbeat using the card id and token while working.",
    "When done, call taskfold_complete with the card id, token, summary, and proof.",
    "If you called taskfold_proof separately, pass its returned proofId to taskfold_complete.",
    "If blocked, call taskfold_block with the card id, token, and reason.",
    "",
    "## Naming",
    "When proposing project or board names, describe their purpose (e.g. 'Customer Support Platform'). Name milestones or phases after concrete goals or deliverables (e.g. 'File Storage Migration' or 'Authentication and Permissions').",
    "Do not default to numbered names or prefixes such as M1, M2, M3, Phase 1, or \u9636\u6BB5\u4E00, even when existing names use that style. Preserve user-specified names and do not rename existing items unless asked.",
    "",
    params.context
  ].join("\n");
}

// src/backend/src/dispatcher.ts
init_store_constants();
var DEFAULT_DISPATCH_MAX_STARTS = 3;
var DEFAULT_DISPATCH_OWNER = "taskfold-dispatcher";
async function createManagedTaskfoldWorktree(params) {
  return await params.worktrees.create({
    repoRoot: params.repoRoot,
    name: params.name,
    ...params.baseRef ? { baseRef: params.baseRef } : {},
    // This host release has a fixed managed-worktree owner enum. Card IDs
    // remain globally unique and Taskfold data stays in its own SQLite namespace.
    ownerKind: "workboard",
    ownerId: params.ownerId
  });
}
function normalizePositiveInteger2(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : fallback;
}
function cardIsArchived(card) {
  return Boolean(card.metadata?.archivedAt);
}
function cardHasActiveClaim(card, now) {
  const claim = card.metadata?.claim;
  return Boolean(claim && isFutureDateTimestampMs2(claim.expiresAt, { nowMs: now }));
}
async function materializeWorkspace(params) {
  const workspace = params.card.metadata?.automation?.workspace;
  if (!workspace || workspace.kind === "scratch") {
    return {};
  }
  const sourcePath = workspace.sourcePath ?? workspace.path;
  const sourceBranch = workspace.sourcePath ? workspace.sourceBranch : workspace.branch;
  if (!sourcePath || !path15.isAbsolute(sourcePath)) {
    throw new Error("worktree workspace path must be an absolute git checkout path");
  }
  const canonicalSourcePath = await assertTaskfoldWorkspaceSourceAccess(
    workspace,
    params.workspaceAccess
  );
  if (!canonicalSourcePath) {
    throw new Error("worktree workspace path is required");
  }
  if (workspace.kind === "dir" || !params.workspaceAccess.unrestricted) {
    await assertCanonicalTaskfoldRootAccess(canonicalSourcePath, params.workspaceAccess);
    return workspace.kind === "worktree" ? { cwd: canonicalSourcePath, workspace: { kind: "dir", path: canonicalSourcePath } } : { cwd: canonicalSourcePath };
  }
  if (!params.materializeWorktree) {
    throw new Error("managed worktree materialization was not explicitly authorized");
  }
  if (!params.worktrees) {
    throw new Error("managed worktree runtime is unavailable");
  }
  const worktree = await createManagedTaskfoldWorktree({
    worktrees: params.worktrees,
    repoRoot: canonicalSourcePath,
    name: managedWorktreeName(params.card.id),
    ...sourceBranch ? { baseRef: sourceBranch } : {},
    ownerId: params.card.id
  });
  let cwd;
  try {
    cwd = await canonicalPathFromExistingAncestor3(worktree.path);
  } catch (error) {
    const removed = await params.worktrees.removeIfLossless({
      path: worktree.path,
      // Must match the ownerKind/ownerId passed to worktrees.create() above,
      // or the host's ownership check silently refuses the removal.
      ownerKind: "workboard",
      ownerId: params.card.id
    }).catch(() => false);
    if (!removed) {
      throw new Error(`${formatErrorMessage(error)}; managed worktree cleanup failed`, {
        cause: error
      });
    }
    throw error;
  }
  return {
    cwd,
    workspace: {
      kind: "worktree",
      path: worktree.path,
      branch: worktree.branch,
      sourcePath,
      ...sourceBranch ? { sourceBranch } : {}
    }
  };
}
function sortReadyCards(a, b) {
  const priorityRank = {
    urgent: 0,
    high: 1,
    normal: 2,
    low: 3
  };
  return priorityRank[a.priority] - priorityRank[b.priority] || a.position - b.position || a.createdAt - b.createdAt;
}
function resolveDispatchOwner(card, now, ownerOverride) {
  return ownerOverride || (cardHasActiveClaim(card, now) ? card.metadata?.claim?.ownerId : void 0) || card.agentId || DEFAULT_DISPATCH_OWNER;
}
function selectStartableCards(cards, limit, candidates, ownerOverride, now) {
  if (limit <= 0) {
    return [];
  }
  const runningByOwner = /* @__PURE__ */ new Map();
  for (const card of cards) {
    const claim = card.metadata?.claim;
    const consumesOwnerSlot = !isTaskfoldClaimReclaimable(claim, now) && (card.status === "running" || card.status !== "done" && cardHasActiveClaim(card, now) || card.execution?.status === "running");
    if (!consumesOwnerSlot || cardIsArchived(card)) {
      continue;
    }
    const owner = claim?.ownerId ?? resolveDispatchOwner(card, now);
    runningByOwner.set(owner, (runningByOwner.get(owner) ?? 0) + 1);
  }
  const selected = [];
  const fallback = [];
  const selectedOwners = /* @__PURE__ */ new Set();
  for (const card of candidates.filter(
    (entry) => entry.status === "ready" && !cardHasActiveClaim(entry, now) && !cardIsArchived(entry)
  ).toSorted(sortReadyCards)) {
    const owner = resolveDispatchOwner(card, now, ownerOverride);
    if ((runningByOwner.get(owner) ?? 0) > 0) {
      continue;
    }
    if (selectedOwners.has(owner)) {
      fallback.push(card);
      continue;
    }
    selectedOwners.add(owner);
    selected.push(card);
  }
  return [...selected, ...fallback];
}
async function dispatchAndStartTaskfoldCards(params) {
  return await runTaskfoldDispatch(params);
}
async function runTaskfoldDispatch(params) {
  const now = params.options?.now ?? Date.now();
  const boardId = params.options?.boardId;
  const dispatch = await params.store.dispatch({ now, boardId });
  const maxStarts = normalizePositiveInteger2(
    params.options?.maxStarts,
    DEFAULT_DISPATCH_MAX_STARTS
  );
  const started = [];
  const startFailures = [];
  const cards = await params.store.list();
  const candidates = [];
  for (const candidate of await params.store.list({ boardId })) {
    if (!await params.store.isProjectArchived(cardBoardId(candidate))) {
      candidates.push(candidate);
    }
  }
  const ownerOverride = params.options?.ownerId?.trim() || void 0;
  const startedOwners = /* @__PURE__ */ new Set();
  const maxAttempts = maxStarts * 2;
  let acceptedStarts = 0;
  let attemptedStarts = 0;
  for (const card of selectStartableCards(cards, maxStarts, candidates, ownerOverride, now)) {
    const ownerId = resolveDispatchOwner(card, now, ownerOverride);
    if (acceptedStarts >= maxStarts || attemptedStarts >= maxAttempts) {
      break;
    }
    if (startedOwners.has(ownerId)) {
      continue;
    }
    const sessionKey = buildSessionKey(card);
    let claimValue = "";
    let materializedWorkspace;
    let implicitWorkspaceCwd;
    let runStarted = false;
    let openedLaunch;
    let workspaceMutationBefore;
    let workspaceMutationAfter;
    const requestedWorkspace = card.metadata?.automation?.workspace;
    let workspaceAccess;
    let targetWorkspace;
    let persistWorkspaceAccess;
    try {
      ({ workspaceAccess, targetWorkspace, persistWorkspaceAccess } = await resolveDispatchWorkspaceAccess({
        card,
        currentAccess: params.options?.workspaceAccess,
        resolveAgentWorkspace: params.options?.resolveAgentWorkspace
      }));
    } catch (error) {
      startFailures.push({
        cardId: card.id,
        title: card.title,
        error: formatErrorMessage(error)
      });
      continue;
    }
    if (!requestedWorkspace || requestedWorkspace.kind === "scratch") {
      if (!workspaceAccess.unrestricted) {
        if (!targetWorkspace) {
          startFailures.push({
            cardId: card.id,
            title: card.title,
            error: "target agent workspace is unavailable for restricted dispatch"
          });
          continue;
        }
        try {
          implicitWorkspaceCwd = targetWorkspace;
          await assertCanonicalTaskfoldRootAccess(implicitWorkspaceCwd, workspaceAccess);
          await assertRestrictedTaskfoldTarget({
            root: implicitWorkspaceCwd,
            agentId: card.agentId,
            sessionKey,
            modelProvider: params.options?.provider,
            modelId: params.options?.model,
            resolveAgentWorkspaceRuntime: params.options?.resolveAgentWorkspaceRuntime
          });
        } catch (error) {
          startFailures.push({
            cardId: card.id,
            title: card.title,
            error: formatErrorMessage(error)
          });
          continue;
        }
      }
    } else {
      try {
        const canonicalSourcePath = await assertTaskfoldWorkspaceSourceAccess(
          requestedWorkspace,
          workspaceAccess
        );
        if (canonicalSourcePath && requestedWorkspace.kind === "dir" && workspaceAccess.unrestricted) {
          await assertCanonicalTaskfoldRootAccess(canonicalSourcePath, workspaceAccess);
        }
        if (canonicalSourcePath && !workspaceAccess.unrestricted) {
          await assertCanonicalTaskfoldRootAccess(canonicalSourcePath, workspaceAccess);
          await assertRestrictedTaskfoldTarget({
            root: canonicalSourcePath,
            agentId: card.agentId,
            sessionKey,
            modelProvider: params.options?.provider,
            modelId: params.options?.model,
            resolveAgentWorkspaceRuntime: params.options?.resolveAgentWorkspaceRuntime
          });
        }
      } catch (error) {
        startFailures.push({
          cardId: card.id,
          title: card.title,
          error: formatErrorMessage(error)
        });
        continue;
      }
    }
    try {
      const claimed = await params.store.claim(
        card.id,
        { ownerId, ttlSeconds: card.metadata?.automation?.maxRuntimeSeconds },
        {
          expectedAuthority: {
            boardId: cardBoardId(card),
            status: card.status,
            agentId: card.agentId,
            workspace: card.metadata?.automation?.workspace,
            workspaceAccess: card.metadata?.automation?.workspaceAccess
          },
          adoptWorkspaceAccess: persistWorkspaceAccess ? workspaceAccess : void 0
        }
      );
      claimValue = claimed.token;
      attemptedStarts += 1;
      const context = await params.store.buildWorkerContext(card.id);
      const materialized = await materializeWorkspace({
        card: claimed.card,
        worktrees: params.worktrees,
        materializeWorktree: params.options?.materializeWorktree === true,
        workspaceAccess
      });
      const runCwd = materialized.cwd ?? implicitWorkspaceCwd;
      if (runCwd && !workspaceAccess.unrestricted) {
        await assertRestrictedTaskfoldTarget({
          root: runCwd,
          // Claim may populate agentId; keep the sessionKey target identity.
          agentId: card.agentId,
          sessionKey,
          modelProvider: params.options?.provider,
          modelId: params.options?.model,
          resolveAgentWorkspaceRuntime: params.options?.resolveAgentWorkspaceRuntime
        });
      }
      materializedWorkspace = materialized.workspace;
      if (materializedWorkspace) {
        workspaceMutationBefore = claimed.card;
        workspaceMutationAfter = await params.store.update(card.id, {
          workspace: materializedWorkspace,
          workspaceAccess
        });
      }
      const opened = await params.store.openExecutionLaunch(card.id, {
        requestedSessionKey: sessionKey,
        scope: { ownerId, token: claimValue }
      });
      openedLaunch = opened.launch;
      const run = await params.subagent.run({
        sessionKey,
        message: buildWorkerPrompt({
          card: claimed.card,
          context,
          ownerId,
          token: claimValue
        }),
        ...params.options?.provider ? { provider: params.options.provider } : {},
        ...params.options?.model ? { model: params.options.model } : {},
        lane: `taskfold:${cardBoardId(card)}:${card.id}`,
        // Keyed on the winning claim token, which is minted once per claim and so
        // identifies exactly this dispatch attempt. A millisecond timestamp could
        // collide between two attempts and changed on unrelated card writes.
        idempotencyKey: `taskfold:${card.id}:${claimValue}`,
        lightContext: true,
        deliver: false,
        ...runCwd ? { cwd: runCwd } : {}
      });
      runStarted = true;
      acceptedStarts += 1;
      startedOwners.add(ownerId);
      const acceptedSessionKey = run.sessionKey ?? sessionKey;
      const accepted = await params.store.acceptExecutionLaunch(card.id, {
        expectedLaunch: openedLaunch,
        // Fresh, not the batch-start `now`: `openExecutionLaunch` stamps
        // `preparedAt` with its own `Date.now()` moments earlier in this same
        // iteration, which the batch-start value can already lag behind.
        acceptedAt: Date.now(),
        sessionKey: acceptedSessionKey,
        runId: run.runId,
        ...run.runtime?.harness ? { engine: run.runtime.harness } : {},
        ...run.runtime?.model ? { model: run.runtime.model } : {}
      });
      if (!accepted) {
        await params.store.addWorkerLog(card.id, {
          level: "warning",
          message: `Dispatcher started subagent run ${run.runId} but the prepared launch no longer matched the card; association was not recorded.`,
          sessionKey: acceptedSessionKey,
          runId: run.runId
        }).catch(() => void 0);
        continue;
      }
      started.push({
        cardId: accepted.id,
        title: accepted.title,
        sessionKey: acceptedSessionKey,
        runId: run.runId
      });
      await params.store.addWorkerLog(
        accepted.id,
        {
          level: "info",
          message: `Dispatcher started subagent run ${run.runId}.`,
          sessionKey: acceptedSessionKey,
          runId: run.runId
        },
        { ownerId, token: claimValue }
      ).catch(() => void 0);
    } catch (error) {
      if (!runStarted && materializedWorkspace?.kind === "worktree" && materializedWorkspace.path && params.worktrees) {
        await params.worktrees.removeIfLossless({
          path: materializedWorkspace.path,
          // Must match the ownerKind/ownerId used when this worktree was
          // created (card.id, not the dispatch claim `ownerId` above), or
          // the host's ownership check silently refuses the removal.
          ownerKind: "workboard",
          ownerId: card.id
        }).catch(() => void 0);
        if (workspaceMutationBefore && workspaceMutationAfter) {
          await params.store.compensateWorkspaceMutation(workspaceMutationBefore, workspaceMutationAfter).catch(() => void 0);
        }
      }
      const message = formatErrorMessage(error);
      startFailures.push({ cardId: card.id, title: card.title, error: message });
      if (runStarted) {
        continue;
      }
      if (openedLaunch) {
        await params.store.failExecutionLaunch(card.id, {
          expectedLaunch: openedLaunch,
          reason: `Dispatcher could not start worker: ${message}`
        }).catch(() => void 0);
      } else if (claimValue) {
        try {
          await params.store.block(
            card.id,
            {
              ownerId,
              token: claimValue,
              reason: `Dispatcher could not start worker: ${message}`
            },
            { ownerId, token: claimValue }
          );
        } catch {
        }
      }
    }
  }
  return {
    ...dispatch,
    started,
    startFailures,
    count: dispatch.count + started.length + startFailures.length
  };
}

// src/backend/src/card-execution.ts
var execFileAsync = promisify(execFile);
var PREVIEW_LIMIT = 6;
var PREVIEW_MAX_CHARS = 600;
var CLAIM_TOKEN_PLACEHOLDER = "[generated after confirmation]";
function readOptionalString(value, maxLength = 4e3) {
  if (typeof value !== "string") {
    return void 0;
  }
  const normalized2 = value.trim();
  return normalized2 && normalized2.length <= maxLength ? normalized2 : void 0;
}
function activeExecution(card) {
  return card.execution?.status === "running" || Boolean(card.metadata?.attempts?.some((attempt) => attempt.status === "running"));
}
async function gitCheckout(path21) {
  try {
    const { stdout } = await execFileAsync("git", ["-C", path21, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      maxBuffer: 16 * 1024
    });
    const root = stdout.trim();
    if (!root) {
      throw new Error("git did not return a repository root");
    }
    const canonicalRoot = await canonicalPathFromExistingAncestor4(root);
    const branchResult = await execFileAsync(
      "git",
      ["-C", canonicalRoot, "symbolic-ref", "--quiet", "--short", "HEAD"],
      { encoding: "utf8", maxBuffer: 16 * 1024 }
    ).catch(() => ({ stdout: "" }));
    const branch = branchResult.stdout.trim();
    return { root: canonicalRoot, ...branch ? { branch } : {} };
  } catch (error) {
    throw new Error(
      `execution requires a local Git checkout: ${formatErrorMessage2(error)}`,
      { cause: error }
    );
  }
}
async function resolveWorkspaceAccess(card, currentAccess) {
  const callerAccess = await canonicalizeTaskfoldWorkspaceAccess(currentAccess);
  const persisted = card.metadata?.automation?.workspaceAccess;
  const workspaceAccess = persisted ? intersectTaskfoldWorkspaceAccess(
    await canonicalizeTaskfoldWorkspaceAccess(persisted),
    callerAccess
  ) : callerAccess;
  if (!workspaceAccess.unrestricted && !workspaceAccess.writable) {
    throw new Error("card workspace access is read-only; execution requires write access.");
  }
  return workspaceAccess;
}
async function resolveExecutionSource(store, card, currentAccess) {
  const workspaceAccess = await resolveWorkspaceAccess(card, currentAccess);
  const cardWorkspace = card.metadata?.automation?.workspace;
  if (cardWorkspace?.kind === "scratch") {
    throw new Error("card workspace is scratch; select a local Git checkout before execution.");
  }
  const { boards } = await store.listBoards();
  const sourceWorkspace = cardWorkspace ?? boards.find((board) => board.id === cardBoardId(card))?.defaultWorkspace;
  if (!sourceWorkspace || sourceWorkspace.kind === "scratch") {
    throw new Error("card has no local Git checkout; set a card or project workspace first.");
  }
  const sourcePath = await assertTaskfoldWorkspaceSourceAccess(sourceWorkspace, workspaceAccess);
  if (!sourcePath) {
    throw new Error("card workspace path is required.");
  }
  const checkout = await gitCheckout(sourcePath);
  const checkedRoot = await assertTaskfoldWorkspaceSourceAccess(
    { kind: "dir", path: checkout.root },
    workspaceAccess
  );
  if (!checkedRoot) {
    throw new Error("Git checkout root is unavailable.");
  }
  return {
    sourceCheckout: checkedRoot,
    ...sourceWorkspace.sourceBranch || checkout.branch ? { baseBranch: sourceWorkspace.sourceBranch ?? checkout.branch } : {},
    sourceWorkspace,
    workspaceAccess
  };
}
async function ensureTargetCanRun(params) {
  if (params.source.workspaceAccess.unrestricted) {
    return;
  }
  await assertRestrictedTaskfoldTarget({
    root: params.source.sourceCheckout,
    agentId: params.card.agentId ?? params.options.defaultAgentId,
    sessionKey: params.sessionKey,
    modelProvider: params.options.runtime.agent.defaults.provider,
    modelId: params.options.runtime.agent.defaults.model,
    resolveAgentWorkspaceRuntime: params.options.resolveAgentWorkspaceRuntime
  });
}
function promptPreview(params) {
  return buildWorkerPrompt({
    card: params.card,
    context: params.context,
    ownerId: params.ownerId,
    token: CLAIM_TOKEN_PLACEHOLDER
  });
}
function redactExecutionText(value, token) {
  let next = value;
  if (token) {
    next = next.replaceAll(token, "[redacted]");
  }
  return next.replace(/Claim token:\s*\S+/giu, "Claim token: [redacted]");
}
function redactExecutionPayload(value, token) {
  if (typeof value === "string") {
    return redactExecutionText(value, token);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactExecutionPayload(entry, token));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        redactExecutionPayload(entry, token)
      ])
    );
  }
  return value;
}
function boundExecutionPreview(value, depth = 0) {
  if (typeof value === "string") {
    return value.length <= PREVIEW_MAX_CHARS ? value : `${value.slice(0, PREVIEW_MAX_CHARS)}...`;
  }
  if (Array.isArray(value)) {
    return value.slice(-PREVIEW_LIMIT).map((entry) => boundExecutionPreview(entry, depth + 1));
  }
  if (value && typeof value === "object") {
    if (depth >= 4) {
      return "[truncated]";
    }
    return Object.fromEntries(
      Object.entries(value).slice(0, 24).map(([key, entry]) => [key, boundExecutionPreview(entry, depth + 1)])
    );
  }
  return value;
}
async function resolveCard(store, id) {
  const cardId = readOptionalString(id, 200);
  if (!cardId) {
    throw new Error("id is required.");
  }
  const card = await store.get(cardId);
  if (!card) {
    throw new Error(`card not found: ${cardId}`);
  }
  return card;
}
async function prepareTaskfoldCardExecution(params) {
  const card = await resolveCard(params.store, params.id);
  if (isRequirementCard(card)) {
    throw new Error("requirement cards cannot start code execution; run a child task instead.");
  }
  if (card.metadata?.archivedAt) {
    throw new Error("card is archived.");
  }
  if (await params.store.isProjectArchived(cardBoardId(card))) {
    throw new Error("project is archived and cannot start new work.");
  }
  const sessionKey = buildSessionKey(card);
  const source = await resolveExecutionSource(params.store, card, params.options.workspaceAccess);
  await ensureTargetCanRun({ card, source, options: params.options, sessionKey });
  const ownerId = card.agentId ?? params.options.defaultAgentId;
  const context = await params.store.buildWorkerContext(card.id);
  return {
    cardId: card.id,
    expectedRevision: card.revision,
    active: activeExecution(card),
    agentId: ownerId,
    defaultProvider: params.options.runtime.agent.defaults.provider,
    defaultModel: params.options.runtime.agent.defaults.model,
    sourceCheckout: source.sourceCheckout,
    ...source.baseBranch ? { baseBranch: source.baseBranch } : {},
    worktreeName: managedWorktreeName(card.id),
    promptPreview: promptPreview({ card, context, ownerId }),
    execution: card.execution ?? null
  };
}
async function startTaskfoldCardExecution(params) {
  const card = await resolveCard(params.store, params.id);
  if (isRequirementCard(card)) {
    throw new Error("requirement cards cannot start code execution; run a child task instead.");
  }
  {
    const latest = await resolveCard(params.store, card.id);
    const sessionKey = buildSessionKey(latest);
    const source = await resolveExecutionSource(
      params.store,
      latest,
      params.options.workspaceAccess
    );
    await ensureTargetCanRun({ card: latest, source, options: params.options, sessionKey });
    const ownerId = latest.agentId ?? params.options.defaultAgentId;
    const expectedRevision = typeof params.expectedRevision === "number" ? params.expectedRevision : latest.revision;
    let claimToken;
    let materializedWorkspace;
    let runStarted = false;
    let openedLaunch;
    let workspaceMutationBefore;
    let workspaceMutationAfter;
    try {
      const claimed = await params.store.claimExecution(latest.id, {
        ownerId,
        expectedRevision,
        ttlSeconds: latest.metadata?.automation?.maxRuntimeSeconds
      });
      claimToken = claimed.token;
      const worktree = await createManagedTaskfoldWorktree({
        worktrees: params.options.runtime.worktrees,
        repoRoot: source.sourceCheckout,
        name: managedWorktreeName(latest.id),
        ...source.baseBranch ? { baseRef: source.baseBranch } : {},
        ownerId: latest.id
      });
      let worktreePath;
      try {
        worktreePath = await canonicalPathFromExistingAncestor4(worktree.path);
      } catch (error) {
        const removed = await params.options.runtime.worktrees.removeIfLossless({
          path: worktree.path,
          // Must match the ownerKind/ownerId passed to worktrees.create()
          // above, or the host's ownership check silently refuses removal.
          ownerKind: "workboard",
          ownerId: latest.id
        }).catch(() => false);
        if (!removed) {
          throw new Error(`${formatErrorMessage2(error)}; managed worktree cleanup failed`, {
            cause: error
          });
        }
        throw error;
      }
      materializedWorkspace = {
        kind: "worktree",
        path: worktreePath,
        branch: worktree.branch,
        sourcePath: source.sourceCheckout,
        ...source.baseBranch ? { sourceBranch: source.baseBranch } : {}
      };
      workspaceMutationBefore = claimed.card;
      workspaceMutationAfter = await params.store.update(latest.id, {
        workspace: materializedWorkspace,
        workspaceAccess: source.workspaceAccess
      });
      await ensureTargetCanRun({
        card: await resolveCard(params.store, latest.id),
        source: { ...source, sourceCheckout: worktreePath },
        options: params.options,
        sessionKey
      });
      const current = await resolveCard(params.store, latest.id);
      const context = await params.store.buildWorkerContext(current.id);
      const opened = await params.store.openExecutionLaunch(current.id, {
        requestedSessionKey: sessionKey,
        scope: { ownerId, token: claimToken }
      });
      openedLaunch = opened.launch;
      const run = await params.options.runtime.subagent.run({
        sessionKey,
        message: buildWorkerPrompt({
          card: current,
          context,
          ownerId,
          token: claimToken
        }),
        lane: `taskfold:${cardBoardId(current)}:${current.id}`,
        // The claim token is minted fresh per winning claim, so it identifies
        // exactly this start attempt. A timestamp could collide inside one
        // millisecond and changed on writes unrelated to starting a run.
        idempotencyKey: `taskfold:execution:${current.id}:${claimed.token}`,
        lightContext: true,
        deliver: false,
        cwd: worktreePath
      });
      runStarted = true;
      const acceptedSessionKey = run.sessionKey ?? sessionKey;
      const accepted = await params.store.acceptExecutionLaunch(current.id, {
        expectedLaunch: openedLaunch,
        acceptedAt: Date.now(),
        sessionKey: acceptedSessionKey,
        runId: run.runId,
        ...run.runtime?.harness ? { engine: run.runtime.harness } : {},
        ...run.runtime?.model ? { model: run.runtime.model } : {}
      });
      const updated = accepted ?? await resolveCard(params.store, current.id);
      await params.store.addWorkerLog(
        updated.id,
        {
          level: accepted ? "info" : "warning",
          message: accepted ? `Card execution started subagent run ${run.runId}.` : `Card execution started subagent run ${run.runId} but the prepared launch no longer matched the card; association was not recorded.`,
          sessionKey: acceptedSessionKey,
          runId: run.runId
        },
        accepted ? { ownerId, token: claimToken } : void 0
      ).catch(() => void 0);
      return {
        card: updated,
        sessionKey: acceptedSessionKey,
        runId: run.runId,
        worktreePath,
        branch: worktree.branch
      };
    } catch (error) {
      if (!runStarted && materializedWorkspace?.path) {
        await params.options.runtime.worktrees.removeIfLossless({
          path: materializedWorkspace.path,
          // Must match the ownerKind/ownerId used when this worktree was
          // created (latest.id), or the host's ownership check silently
          // refuses the removal.
          ownerKind: "workboard",
          ownerId: latest.id
        }).catch(() => false);
        if (workspaceMutationBefore && workspaceMutationAfter) {
          await params.store.compensateWorkspaceMutation(workspaceMutationBefore, workspaceMutationAfter).catch(() => void 0);
        }
      }
      if (!runStarted && openedLaunch) {
        await params.store.failExecutionLaunch(latest.id, {
          expectedLaunch: openedLaunch,
          reason: formatErrorMessage2(error)
        }).catch(() => void 0);
      } else if (claimToken && !runStarted) {
        await params.store.releaseClaim(latest.id, { ownerId, token: claimToken }).catch(() => void 0);
      }
      throw error;
    }
  }
}
async function inspectTaskfoldCardExecution(params) {
  const card = await resolveCard(params.store, params.id);
  const sessionKey = card.execution?.sessionKey ?? card.sessionKey;
  const runId = card.execution?.runId ?? card.runId;
  const active = activeExecution(card);
  if (!active || !sessionKey || !runId) {
    return { card, active: false, execution: card.execution ?? null };
  }
  const token = card.metadata?.claim?.token;
  const preview = await params.runtime.subagent.getSessionMessages({ sessionKey, limit: PREVIEW_LIMIT }).then(({ messages }) => ({ messages })).catch((error) => ({ error: formatErrorMessage2(error) }));
  return {
    card,
    active: true,
    execution: card.execution,
    sessionKey,
    runId,
    preview: boundExecutionPreview(redactExecutionPayload(preview, token))
  };
}
async function steerTaskfoldCardExecution(params) {
  const card = await resolveCard(params.store, params.id);
  if (!activeExecution(card) || card.execution?.status !== "running") {
    throw new Error("card has no active Taskfold execution.");
  }
  const sessionKey = card.execution.sessionKey ?? card.sessionKey;
  if (!sessionKey) {
    throw new Error("active execution has no session.");
  }
  const nextRunId = readOptionalString(params.nextRunId, 200);
  let updated = card;
  if (nextRunId) {
    updated = await params.store.update(card.id, {
      runId: nextRunId,
      execution: { ...card.execution, runId: nextRunId, updatedAt: Date.now() }
    });
  }
  return { card: updated };
}
async function abortTaskfoldCardExecution(params) {
  const card = await resolveCard(params.store, params.id);
  if (!activeExecution(card) || card.execution?.status !== "running") {
    throw new Error("card has no active Taskfold execution.");
  }
  const expectedRunId = readOptionalString(params.expectedRunId, 200);
  const runId = card.execution.runId ?? card.runId;
  if (expectedRunId && runId && expectedRunId !== runId) {
    throw new Error("card execution changed before it could be stopped.");
  }
  const reason = readOptionalString(params.reason, 1e3) ?? "Taskfold execution stopped by operator.";
  const stopped = await params.store.stopExecution(card.id, {
    ...runId ? { expectedRunId: runId } : {},
    reason
  });
  return {
    card: stopped
  };
}
function terminalExecutionOutcome(value) {
  const outcome = readOptionalString(value, 40)?.toLowerCase();
  if (outcome === "ok" || outcome === "error" || outcome === "timeout" || outcome === "killed" || outcome === "reset" || outcome === "deleted") {
    return outcome;
  }
  throw new Error("outcome must be a terminal OpenClaw subagent outcome.");
}
async function reconcileTaskfoldCardExecution(params) {
  const card = await resolveCard(params.store, params.id);
  const expectedRunId = readOptionalString(params.expectedRunId, 200);
  const runId = card.execution?.runId ?? card.runId;
  if (!runId) {
    throw new Error("card execution has no run.");
  }
  if (!expectedRunId || expectedRunId !== runId) {
    throw new Error("card execution changed before it could be reconciled.");
  }
  const outcome = terminalExecutionOutcome(params.outcome);
  const reconciled = await params.store.finishExecutionForRun(runId, {
    outcome,
    endedAt: params.endedAt,
    reason: params.reason
  });
  if (!reconciled) {
    throw new Error("card execution could not be reconciled.");
  }
  return { card: reconciled };
}

// src/backend/src/gateway-helpers.ts
init_contract();
import { formatErrorMessage as formatErrorMessage3 } from "openclaw/plugin-sdk/error-runtime";
import { parseStrictPositiveInteger } from "openclaw/plugin-sdk/string-coerce-runtime";
function respondError(respond, error) {
  respond(false, void 0, {
    code: "taskfold_error",
    message: formatErrorMessage3(error)
  });
}
function respondConflict(respond, currentCard) {
  respond(false, void 0, {
    code: "taskfold_conflict",
    message: "card changed since expected revision; reload it before saving.",
    details: {
      type: "taskfold_card_conflict",
      card: currentCard
    }
  });
}
function readId(params) {
  const value = params.id;
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  throw new Error("id is required.");
}
function readOptionalPositiveInteger(value, fieldName) {
  if (value === void 0) {
    return void 0;
  }
  const parsed = parseStrictPositiveInteger(value);
  if (typeof value !== "number" || parsed === void 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }
  return parsed;
}
function readPatch(params) {
  const patch = params.patch;
  if (patch && typeof patch === "object" && !Array.isArray(patch)) {
    return patch;
  }
  return params;
}
function withoutTaskfoldCasParams(patch) {
  const { expectedRevision: _expectedRevision, ...rest } = patch;
  return rest;
}
function assertNoCursorAdvance(params) {
  if (params.advance === true) {
    throw new Error("notification cursor advancement requires taskfold.notifications.advance.");
  }
}
async function listTaskfoldCards(store, boardId, redactCard) {
  const [cards, { boards }] = await Promise.all([store.list({ boardId }), store.listBoards()]);
  return { cards: cards.map(redactCard), boards, statuses: TASKFOLD_STATUSES };
}
function resolveGatewayTaskfoldWorkspaceAccess(params) {
  if (!params.client) {
    return { unrestricted: true };
  }
  const scopes = Array.isArray(params.client?.connect?.scopes) ? params.client.connect.scopes : [];
  if (scopes.includes("operator.admin")) {
    return { unrestricted: true };
  }
  return resolveConfiguredTaskfoldWorkspaceAccess({
    config: params.context.getRuntimeConfig(),
    unrestricted: false
  });
}
function createTaskfoldDispatchHandler(params) {
  const sandbox = params.api.runtime.sandbox;
  return async ({ params: requestParams, respond, client, context }, options) => {
    try {
      const boardId = requestParams && typeof requestParams === "object" && "boardId" in requestParams ? requestParams.boardId : void 0;
      const rawMaxStarts = requestParams && typeof requestParams === "object" && "maxStarts" in requestParams ? requestParams.maxStarts : void 0;
      if (!options.supportsMaxStarts && rawMaxStarts !== void 0) {
        throw new Error("maxStarts requires taskfold.cards.dispatchWithOptions.");
      }
      const maxStarts = options.supportsMaxStarts ? readOptionalPositiveInteger(rawMaxStarts, "maxStarts") : void 0;
      const workspaceAccess = resolveGatewayTaskfoldWorkspaceAccess({ context, client });
      const result = await dispatchAndStartTaskfoldCards({
        store: params.store,
        subagent: params.api.runtime.subagent,
        worktrees: params.api.runtime.worktrees,
        options: {
          boardId: typeof boardId === "string" ? boardId : void 0,
          ...maxStarts !== void 0 ? { maxStarts } : {},
          materializeWorktree: true,
          resolveAgentWorkspace: (agentId) => resolveTaskfoldAgentWorkspace(context.getRuntimeConfig(), agentId),
          resolveAgentWorkspaceRuntime: (agentId, sessionKey, workspaceDir, modelProvider, modelId) => {
            const config = context.getRuntimeConfig();
            return resolveAgentTaskfoldWorkspaceRuntime({
              config,
              agentId,
              sessionKey,
              workspaceDir,
              modelProvider,
              modelId,
              prepareSandboxWorkspaceAuthority: sandbox?.prepareWorkspaceAuthority
            });
          },
          workspaceAccess
        }
      });
      respond(true, {
        ...result,
        promoted: result.promoted.map(params.redactCard),
        reclaimed: result.reclaimed.map(params.redactCard),
        blocked: result.blocked.map(params.redactCard),
        orchestrated: result.orchestrated.map(params.redactCard)
      });
    } catch (error) {
      respondError(respond, error);
    }
  };
}

// ../core/src/store-core.ts
import { createHash as createHash3, randomUUID as randomUUID6 } from "node:crypto";

// ../core/src/store-automation.ts
function normalizeTrustedWorkspaceAccess(value, fallback) {
  if (value === void 0) {
    return fallback;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("workspace access must be an object.");
  }
  const record = value;
  if (record.unrestricted === true) {
    return { unrestricted: true };
  }
  if (record.unrestricted !== false || !Array.isArray(record.roots)) {
    throw new Error("restricted workspace access requires roots.");
  }
  if (typeof record.writable !== "boolean") {
    throw new Error("restricted workspace access requires a writable flag.");
  }
  const roots = Array.from(
    new Set(
      record.roots.map((entry) => {
        const root = normalizeBoundedString(entry, void 0, 2e3, "workspace access root");
        if (!root || !isAbsoluteWorkspacePath(root)) {
          throw new Error("workspace access roots must be absolute.");
        }
        return root;
      })
    )
  );
  if (roots.length === 0) {
    throw new Error("restricted workspace access requires at least one root.");
  }
  return { unrestricted: false, roots, writable: record.writable };
}
function normalizeCardAutomation(input) {
  const workspaceAccess = normalizeTrustedWorkspaceAccess(input.workspaceAccess);
  return normalizeAutomation(
    {
      tenant: input.tenant,
      boardId: input.boardId,
      createdByCardId: input.createdByCardId,
      idempotencyKey: input.idempotencyKey,
      skills: input.skills,
      workspace: input.workspace,
      maxRuntimeSeconds: input.maxRuntimeSeconds,
      maxRetries: input.maxRetries,
      scheduledAt: input.scheduledAt
    },
    workspaceAccess ? { workspaceAccess } : void 0
  );
}
function normalizeAutomationPatch(patch, current) {
  const workspaceAccess = Object.hasOwn(patch, "workspaceAccess") ? normalizeTrustedWorkspaceAccess(patch.workspaceAccess, current?.workspaceAccess) : current?.workspaceAccess;
  return normalizeAutomation(patch, {
    ...current,
    ...workspaceAccess ? { workspaceAccess } : {}
  });
}

// ../core/src/store-change-tracker.ts
import { randomUUID as randomUUID5 } from "node:crypto";
var CHANGE_REVISION_BLOCK = 1e4;
function createTaskfoldReservedChangeSource(options = {}) {
  const { dataVersion } = options;
  const epoch = options.epoch ?? randomUUID5();
  const reserveRevisions = options.reserveRevisions ?? (() => 0);
  let revision = reserveRevisions(CHANGE_REVISION_BLOCK);
  let revisionCeiling = revision + CHANGE_REVISION_BLOCK;
  let externalDataVersion = dataVersion?.();
  const next = () => {
    if (revision + 1 >= revisionCeiling) {
      const base = Math.max(reserveRevisions(CHANGE_REVISION_BLOCK), revision);
      revision = base;
      revisionCeiling = base + CHANGE_REVISION_BLOCK;
    }
    return { epoch, revision: ++revision };
  };
  return {
    announce: next,
    record: async () => next(),
    poll() {
      if (!dataVersion) {
        return void 0;
      }
      const current = dataVersion();
      if (current === externalDataVersion) {
        return void 0;
      }
      externalDataVersion = current;
      return next();
    }
  };
}
var TaskfoldChangeTracker = class {
  source;
  latestChange;
  mutationRevision = 0;
  listeners = /* @__PURE__ */ new Set();
  constructor(source = createTaskfoldReservedChangeSource()) {
    this.source = source;
  }
  track(store) {
    return {
      register: async (key, value) => {
        await store.register(key, value);
        this.mutationRevision += 1;
      },
      lookup: async (key) => await store.lookup(key),
      delete: async (key) => {
        const deleted = await store.delete(key);
        if (deleted) {
          this.mutationRevision += 1;
        }
        return deleted;
      },
      entries: async () => await store.entries(),
      compareAndSwap: async (key, expectedRevision, value, onReject) => {
        const swapped = await store.compareAndSwap(key, expectedRevision, value, onReject);
        if (swapped) {
          this.mutationRevision += 1;
        }
        return swapped;
      },
      ...store.registerIfAbsent ? {
        registerIfAbsent: async (key, value) => {
          const inserted = await store.registerIfAbsent(key, value);
          if (inserted) {
            this.mutationRevision += 1;
          }
          return inserted;
        }
      } : {}
    };
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  announceEpoch() {
    this.publish(this.source.announce());
  }
  /** 记一次变化并广播（给不经 {@link track} 的调用方用）。 */
  async recordChange() {
    this.publish(await this.source.record());
  }
  current() {
    return this.latestChange;
  }
  reconcileExternalChanges() {
    const change = this.source.poll();
    if (!change) {
      return false;
    }
    this.publish(change);
    return true;
  }
  async runMutation(run) {
    const initialRevision = this.mutationRevision;
    try {
      return await run();
    } finally {
      if (this.mutationRevision !== initialRevision) {
        this.publish(await this.source.record());
      }
    }
  }
  async waitForChange(after, timeoutMs) {
    const isNewer = (change) => !after || change.epoch !== after.epoch || change.revision > after.revision;
    const current = this.current();
    if (current && isNewer(current)) {
      return { change: current, timedOut: false };
    }
    return await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        unsubscribe();
        resolve({ change: this.current(), timedOut: true });
      }, timeoutMs);
      const unsubscribe = this.subscribe((change) => {
        if (!isNewer(change)) {
          return;
        }
        clearTimeout(timeout);
        unsubscribe();
        resolve({ change, timedOut: false });
      });
    });
  }
  publish(change) {
    if (!change) {
      return;
    }
    this.latestChange = change;
    for (const listener of this.listeners) {
      try {
        listener(change);
      } catch {
      }
    }
  }
};

// ../core/src/store-compensation.ts
init_sdk_utils();
import { isDeepStrictEqual } from "node:util";
var ABSENT = Symbol("taskfold-compensation-absent");
function recordValue(record, key) {
  return Object.hasOwn(record, key) && record[key] !== void 0 ? record[key] : ABSENT;
}
function canonicalValue(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalValue);
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== void 0).map(([key, entry]) => [key, canonicalValue(entry)])
  );
}
function sameValue(left, right) {
  return isDeepStrictEqual(canonicalValue(left), canonicalValue(right));
}
function stableId(value) {
  return isRecord(value) && typeof value.id === "string" ? value.id : void 0;
}
function hasOnlyStableIds(values) {
  return values.every((value) => stableId(value) !== void 0);
}
function insertRestoredValues(current, restored, reference) {
  const result = [...current];
  for (const value of restored.toReversed()) {
    const referenceIndex = reference.findIndex((entry) => stableId(entry) === stableId(value));
    const nextId = reference.slice(referenceIndex + 1).map(stableId).find((id) => id !== void 0 && result.some((entry) => stableId(entry) === id));
    const nextIndex = nextId ? result.findIndex((entry) => stableId(entry) === nextId) : -1;
    result.splice(nextIndex >= 0 ? nextIndex : result.length, 0, value);
  }
  return result;
}
function rollbackStableIdArray(before, after, current) {
  const beforeById = new Map(before.map((value) => [stableId(value), value]));
  const afterById = new Map(after.map((value) => [stableId(value), value]));
  const currentIds = new Set(current.map((value) => stableId(value)));
  const merged = current.flatMap((currentValue) => {
    const id = stableId(currentValue);
    const beforeValue = beforeById.get(id);
    const afterValue = afterById.get(id);
    if (beforeValue === void 0 && afterValue !== void 0) {
      return sameValue(currentValue, afterValue) ? [] : [currentValue];
    }
    if (beforeValue !== void 0 && afterValue !== void 0) {
      const value = rollbackValue(beforeValue, afterValue, currentValue);
      return value === ABSENT ? [] : [value];
    }
    return [currentValue];
  });
  const restored = before.filter((value) => {
    const id = stableId(value);
    return !afterById.has(id) && !currentIds.has(id);
  });
  return insertRestoredValues(merged, restored, before);
}
function rollbackRecord(before, after, current) {
  const beforeRecord = isRecord(before) ? before : {};
  const afterRecord = isRecord(after) ? after : {};
  const keys = /* @__PURE__ */ new Set([
    ...Object.keys(beforeRecord),
    ...Object.keys(afterRecord),
    ...Object.keys(current)
  ]);
  const merged = {};
  for (const key of keys) {
    const value = rollbackValue(
      recordValue(beforeRecord, key),
      recordValue(afterRecord, key),
      recordValue(current, key)
    );
    if (value !== ABSENT) {
      merged[key] = value;
    }
  }
  return before === ABSENT && Object.keys(merged).length === 0 ? ABSENT : merged;
}
function rollbackValue(before, after, current) {
  if (sameValue(before, after)) {
    return current;
  }
  if (sameValue(current, after)) {
    return before;
  }
  if (current === ABSENT) {
    return ABSENT;
  }
  if (Array.isArray(current) && (Array.isArray(before) || before === ABSENT) && (Array.isArray(after) || after === ABSENT)) {
    const beforeArray = Array.isArray(before) ? before : [];
    const afterArray = Array.isArray(after) ? after : [];
    return hasOnlyStableIds([...beforeArray, ...afterArray, ...current]) ? rollbackStableIdArray(beforeArray, afterArray, current) : current;
  }
  if (isRecord(current) && (isRecord(before) || before === ABSENT) && (isRecord(after) || after === ABSENT)) {
    return rollbackRecord(before, after, current);
  }
  return current;
}
function invertTaskfoldCardMutation(before, after, current) {
  const merged = rollbackValue(before, after, current);
  if (!isRecord(merged)) {
    throw new Error("taskfold card compensation produced an invalid card");
  }
  return { ...merged, id: current.id, revision: current.revision };
}
function sameTaskfoldCardState(left, right) {
  const { updatedAt: _leftUpdatedAt, revision: _leftRevision, ...leftState } = left;
  const { updatedAt: _rightUpdatedAt, revision: _rightRevision, ...rightState } = right;
  return sameValue(leftState, rightState);
}
function invertTaskfoldWorkspaceMutation(before, after, current) {
  const merged = invertTaskfoldCardMutation(before, after, current);
  const afterAutomation = after.metadata?.automation;
  const currentAutomation = current.metadata?.automation;
  if (sameValue(currentAutomation?.workspace, afterAutomation?.workspace)) {
    return merged;
  }
  const automation = { ...merged.metadata?.automation };
  if (currentAutomation?.workspace) {
    automation.workspace = currentAutomation.workspace;
  } else {
    delete automation.workspace;
  }
  if (currentAutomation?.workspaceAccess) {
    automation.workspaceAccess = currentAutomation.workspaceAccess;
  } else {
    delete automation.workspaceAccess;
  }
  const metadata = { ...merged.metadata };
  if (Object.keys(automation).length > 0) {
    metadata.automation = automation;
  } else {
    delete metadata.automation;
  }
  if (Object.keys(metadata).length > 0) {
    return { ...merged, metadata };
  }
  const withoutMetadata = { ...merged };
  delete withoutMetadata.metadata;
  return withoutMetadata;
}

// ../core/src/store-core.ts
init_store_constants();
var TaskfoldRevisionConflictError = class extends Error {
  constructor(cardId, expectedRevision, reason = "revision") {
    super(`card ${cardId} changed since revision ${expectedRevision}.`);
    this.cardId = cardId;
    this.expectedRevision = expectedRevision;
    this.reason = reason;
    this.name = "TaskfoldRevisionConflictError";
  }
};
var CARD_CAS_MAX_ATTEMPTS = 3;
function stampCardRevisions(store) {
  const stamp = (value) => {
    if (value?.version === 1 && value.card) {
      value.card.revision = nextTaskfoldCardRevision(value.card.revision);
    }
    return value;
  };
  return {
    register: async (key, value) => await store.register(key, stamp(value)),
    lookup: async (key) => await store.lookup(key),
    delete: async (key) => await store.delete(key),
    entries: async () => await store.entries(),
    compareAndSwap: async (key, expectedRevision, value, onReject) => await store.compareAndSwap(key, expectedRevision, stamp(value), onReject),
    ...store.registerIfAbsent ? {
      registerIfAbsent: async (key, value) => await store.registerIfAbsent(key, stamp(value))
    } : {}
  };
}
function sessionCaptureCardId(sessionKey) {
  const digest = createHash3("sha256").update("openclaw.taskfold.session-capture.v1\0").update(sessionKey).digest();
  digest.writeUInt8(digest.readUInt8(6) & 15 | 128, 6);
  digest.writeUInt8(digest.readUInt8(8) & 63 | 128, 8);
  const hex = digest.toString("hex", 0, 16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
var TaskfoldCoreStore = class {
  mutationQueue = Promise.resolve();
  lastNotificationSequence = 0;
  changes;
  store;
  boardStore;
  milestoneStore;
  documentStore;
  subscriptionStore;
  attachmentStore;
  constructor(store, stores = {}) {
    this.changes = new TaskfoldChangeTracker(
      stores.changeSource ?? createTaskfoldReservedChangeSource({
        dataVersion: stores.dataVersion,
        epoch: stores.changeEpoch,
        reserveRevisions: stores.reserveChangeRevisions
      })
    );
    this.store = this.changes.track(stampCardRevisions(store));
    this.boardStore = this.changes.track(
      stores.boards ?? store
    );
    this.milestoneStore = this.changes.track(
      stores.milestones ?? store
    );
    this.documentStore = this.changes.track(
      stores.documents ?? store
    );
    this.subscriptionStore = stores.subscriptions ?? store;
    this.attachmentStore = stores.attachments ?? store;
  }
  announceChangeEpoch() {
    this.changes.announceEpoch();
  }
  reconcileExternalChanges() {
    return this.changes.reconcileExternalChanges();
  }
  currentChange() {
    return this.changes.current();
  }
  /** 每次这个 store 的变更游标前进（本进程写入、或 {@link reconcileExternalChanges} 轮询到别处的变化）都会回调。 */
  subscribeChanges(listener) {
    return this.changes.subscribe(listener);
  }
  async waitForChange(after, timeoutMs) {
    return await this.changes.waitForChange(after, timeoutMs);
  }
  async enqueueMutation(run) {
    const runAndNotify = async () => await this.changes.runMutation(run);
    const result = this.mutationQueue.then(runAndNotify, runAndNotify);
    this.mutationQueue = result.then(
      () => void 0,
      () => void 0
    );
    return await result;
  }
  async updateMetadata(id, mutate, options = {}) {
    return await this.retryOnRevisionConflict(
      async () => await this.enqueueMutation(async () => {
        const existing = await this.get(id);
        if (!existing) {
          throw new Error(`card not found: ${id}`);
        }
        return await this.updateCard(
          id,
          { metadata: mutate(existing) },
          { ...options, expectedRevision: existing.revision }
        );
      })
    );
  }
  async deleteDetachedAttachments(existing, next) {
    const nextIds = new Set(next.metadata?.attachments?.map((attachment) => attachment.id) ?? []);
    for (const attachment of existing.metadata?.attachments ?? []) {
      if (!nextIds.has(attachment.id)) {
        await this.attachmentStore.delete(attachment.id);
      }
    }
  }
  nextNotificationSequence(now) {
    const base = Math.max(0, Math.trunc(now)) * 1e3;
    this.lastNotificationSequence = Math.max(this.lastNotificationSequence + 1, base);
    return this.lastNotificationSequence;
  }
  async list(options = {}) {
    const boardId = normalizeBoardId(options.boardId);
    const entries = await this.store.entries();
    return entries.map((entry) => entry.value).filter(
      (entry) => entry?.version === 1 && Boolean(entry.card?.id)
    ).map((entry) => entry.card).filter((card) => !boardId || cardBoardId(card) === boardId).toSorted(compareCards);
  }
  async listBoards() {
    const boards = /* @__PURE__ */ new Map();
    for (const entry of await this.boardStore.entries()) {
      if (entry.value?.version !== 1 || !entry.value.board?.id) {
        continue;
      }
      const board = entry.value.board;
      boards.set(board.id, {
        id: board.id,
        ...board.name ? { name: board.name } : {},
        ...board.description ? { description: board.description } : {},
        ...board.icon ? { icon: board.icon } : {},
        ...board.color ? { color: board.color } : {},
        ...board.position !== void 0 ? { position: board.position } : {},
        ...board.version ? { version: board.version } : {},
        ...board.currentObjective ? { currentObjective: board.currentObjective } : {},
        ...board.coreValue ? { coreValue: board.coreValue } : {},
        ...board.sourceOfTruth ? { sourceOfTruth: board.sourceOfTruth } : {},
        ...board.repositoryUrl ? { repositoryUrl: board.repositoryUrl } : {},
        ...board.planningPath ? { planningPath: board.planningPath } : {},
        ...board.homepageUrl ? { homepageUrl: board.homepageUrl } : {},
        ...board.defaultWorkspace ? { defaultWorkspace: board.defaultWorkspace } : {},
        ...board.orchestration ? { orchestration: board.orchestration } : {},
        ...board.boardView ? { boardView: board.boardView } : {},
        total: 0,
        active: 0,
        archived: 0,
        byStatus: {},
        updatedAt: board.updatedAt,
        ...board.archivedAt ? { archivedAt: board.archivedAt } : {}
      });
    }
    if (!boards.has("default")) {
      boards.set("default", {
        id: "default",
        total: 0,
        active: 0,
        archived: 0,
        byStatus: {}
      });
    }
    for (const card of await this.list()) {
      const boardId = cardBoardId(card);
      const summary = boards.get(boardId) ?? {
        id: boardId,
        total: 0,
        active: 0,
        archived: 0,
        byStatus: {}
      };
      summary.total += 1;
      if (card.metadata?.archivedAt) {
        summary.archived += 1;
      } else {
        summary.active += 1;
      }
      summary.byStatus[card.status] = (summary.byStatus[card.status] ?? 0) + 1;
      summary.updatedAt = Math.max(summary.updatedAt ?? 0, card.updatedAt);
      boards.set(boardId, summary);
    }
    return {
      boards: [...boards.values()].toSorted(
        (a, b) => a.id === "default" ? -1 : b.id === "default" ? 1 : a.id.localeCompare(b.id)
      )
    };
  }
  async isProjectArchived(boardId) {
    const board = await this.boardStore.lookup(boardId);
    return Boolean(board?.version === 1 && board.board.archivedAt);
  }
  async upsertBoard(input) {
    return await this.enqueueMutation(async () => {
      const id = normalizeBoardIdRequired(input.id);
      const existing = await this.boardStore.lookup(id);
      const board = normalizeBoardMetadata({ ...input, id }, existing?.board);
      await this.boardStore.register(id, { version: 1, board });
      return board;
    });
  }
  async archiveBoard(id, archived = true) {
    return await this.upsertBoard({ id, archived });
  }
  async deleteBoard(id) {
    return await this.enqueueMutation(async () => {
      const boardId = normalizeBoardIdRequired(id);
      if (boardId === "default") {
        throw new Error("default board cannot be deleted.");
      }
      if ((await this.list({ boardId })).length > 0) {
        throw new Error("board still has cards; archive it or move/delete the cards first.");
      }
      for (const entry of await this.subscriptionStore.entries()) {
        if (entry.value?.version === 1 && entry.value.subscription?.boardId === boardId) {
          await this.subscriptionStore.delete(entry.key);
        }
      }
      return { deleted: await this.boardStore.delete(boardId) };
    });
  }
  async stats(input = {}, now = Date.now()) {
    const cards = await this.list(input);
    const boardId = normalizeBoardId(input.boardId) ?? "all";
    const byStatus = {};
    const byAgent = /* @__PURE__ */ Object.create(null);
    let oldestReadyAt;
    let updatedAt;
    let archived = 0;
    for (const card of cards) {
      byStatus[card.status] = (byStatus[card.status] ?? 0) + 1;
      byAgent[card.agentId ?? "(default)"] = (byAgent[card.agentId ?? "(default)"] ?? 0) + 1;
      if (card.metadata?.archivedAt) {
        archived += 1;
      }
      if (card.status === "ready" && !card.metadata?.archivedAt) {
        oldestReadyAt = Math.min(oldestReadyAt ?? card.updatedAt, card.updatedAt);
      }
      updatedAt = Math.max(updatedAt ?? 0, card.updatedAt);
    }
    return {
      id: boardId,
      total: cards.length,
      active: cards.length - archived,
      archived,
      byStatus,
      byAgent,
      ...oldestReadyAt ? { oldestReadyAgeMs: Math.max(0, now - oldestReadyAt) } : {},
      ...updatedAt ? { updatedAt } : {}
    };
  }
  async get(id) {
    const entry = await this.store.lookup(id.trim());
    return entry?.version === 1 ? entry.card : void 0;
  }
  async removeReferencesToCard(cardId) {
    for (const card of await this.list()) {
      const links = card.metadata?.links;
      if (!links?.some((link) => link.targetCardId === cardId)) {
        continue;
      }
      await this.updateCard(card.id, {
        metadata: {
          ...card.metadata,
          links: links.filter((link) => link.targetCardId !== cardId)
        }
      });
    }
  }
  async create(input, scope) {
    return await this.enqueueMutation(async () => {
      let card = await this.createDirect(input, scope);
      const requirementId = normalizeOptionalString(input.requirementId);
      if (!requirementId) {
        return card;
      }
      try {
        card = await this.setCardRequirementDirect(card.id, requirementId, Date.now(), scope);
        return card;
      } catch (error) {
        const current = await this.get(card.id);
        if (current && sameTaskfoldCardState(current, card)) {
          await this.store.delete(card.id);
          await this.removeReferencesToCard(card.id);
        }
        throw error;
      }
    });
  }
  async createDirect(input, scope, options = {}) {
    const now = Date.now();
    const requestedStatus = normalizeStatus(input.status, "todo");
    const kind = normalizeCardKind(input.kind);
    const cards = await this.list();
    const parents = normalizeStringList(input.parents, "parents", 120);
    const automation = normalizeCardAutomation(input);
    const heldBySchedule = Boolean(automation?.scheduledAt && automation.scheduledAt > now) && requestedStatus !== "blocked";
    let status = heldBySchedule ? "scheduled" : requestedStatus;
    let heldByDependencies = false;
    if (parents.length > 0 && (status === "running" || status === "review")) {
      status = "todo";
      heldByDependencies = true;
    }
    if (automation?.idempotencyKey) {
      const existing = cards.find(
        (card2) => card2.metadata?.automation?.idempotencyKey === automation.idempotencyKey && card2.metadata?.automation?.tenant === automation.tenant && cardBoardId(card2) === (automation.boardId ?? "default")
      );
      if (existing) {
        return existing;
      }
    }
    const cardsById = new Map(cards.map((card2) => [card2.id, card2]));
    const parentCards = parents.map((parentId) => {
      const parent = cardsById.get(parentId);
      if (!parent) {
        throw new Error(`card not found: ${parentId}`);
      }
      return parent;
    });
    const childAutomation = normalizeAutomation(
      {
        ...automation,
        createdByCardId: automation?.createdByCardId ?? (parents.length === 1 ? parents[0] : void 0)
      },
      automation
    );
    const normalizedPosition = normalizePosition(input.position, Number.NaN);
    const notes = normalizeNotes(input.notes);
    const agentId = normalizeOptionalString(input.agentId);
    const sessionKey = normalizeOptionalString(input.sessionKey);
    const runId = normalizeOptionalString(input.runId);
    const taskId = normalizeOptionalString(input.taskId);
    const sourceUrl = normalizeOptionalString(input.sourceUrl);
    const normalizedExecution = normalizeExecution(input.execution);
    const delivery = normalizeDelivery(input.delivery, void 0, now);
    const execution = normalizedExecution?.status === "running" && (heldBySchedule || heldByDependencies) ? void 0 : normalizedExecution;
    const startedAt = input.startedAt === void 0 ? status === "running" ? now : void 0 : normalizeTimestamp(input.startedAt, 0) || void 0;
    const completedAt = input.completedAt === void 0 ? status === "done" ? now : void 0 : normalizeTimestamp(input.completedAt, 0) || void 0;
    const metadata = normalizeMetadata(
      input.metadata,
      {
        templateId: normalizeTemplateId(input.templateId),
        ...childAutomation ? { automation: childAutomation } : {}
      },
      { allowDependencyLinks: false }
    );
    const syncedMetadata = trimMetadataToBudget(
      syncExecutionAttemptMetadata(metadata, execution, now)
    );
    const boardId = syncedMetadata.automation?.boardId ?? "default";
    const milestoneId = normalizeOptionalString(input.milestoneId);
    const position = Number.isFinite(normalizedPosition) ? normalizedPosition : Math.max(
      0,
      ...cards.filter(
        (card2) => cardBoardId(card2) === boardId && card2.milestoneId === milestoneId
      ).map((card2) => card2.position)
    ) + POSITION_STEP;
    let card = {
      id: options.cardId ?? randomUUID6(),
      title: normalizeTitle(input.title),
      ...kind === "requirement" ? { kind } : {},
      status,
      priority: normalizePriority(input.priority, "normal"),
      labels: normalizeLabels(input.labels),
      ...milestoneId ? { milestoneId } : {},
      position,
      createdAt: now,
      updatedAt: now,
      // Stamped to the first real revision by the persistence boundary below.
      revision: 0,
      events: [
        {
          id: randomUUID6(),
          kind: "created",
          at: now,
          toStatus: status,
          ...sessionKey ? { sessionKey } : {},
          ...runId ? { runId } : {}
        }
      ],
      ...notes ? { notes } : {},
      ...agentId ? { agentId } : {},
      ...sessionKey ? { sessionKey } : {},
      ...runId ? { runId } : {},
      ...taskId ? { taskId } : {},
      ...sourceUrl ? { sourceUrl } : {},
      ...execution ? { execution } : {},
      ...delivery ? { delivery } : {},
      ...startedAt ? { startedAt } : {},
      ...completedAt ? { completedAt } : {},
      ...!metadataIsEmpty(syncedMetadata) ? { metadata: syncedMetadata } : {}
    };
    if (options.insertIfAbsent && this.store.registerIfAbsent) {
      const inserted = await this.store.registerIfAbsent(card.id, { version: 1, card });
      if (!inserted) {
        const winner = await this.get(card.id);
        if (!winner) {
          throw new Error("captured session card disappeared during creation.");
        }
        return winner;
      }
    } else {
      await this.store.register(card.id, { version: 1, card });
    }
    try {
      if (kind === "requirement" && parentCards.length > 0) {
        throw new Error("requirement cards cannot be child cards.");
      }
      for (const parent of parentCards) {
        if (isRequirementCard(parent)) {
          throw new Error("requirement cards cannot be execution dependencies.");
        }
        card = await this.linkCardsDirect(parent.id, card.id, now, {
          allowStatusOnlyActiveChild: true,
          scope
        });
      }
    } catch (error) {
      const current = await this.get(card.id);
      if (current && sameTaskfoldCardState(current, card)) {
        await this.store.delete(card.id);
        await this.removeReferencesToCard(card.id);
      }
      throw error;
    }
    return card;
  }
  /**
   * Turn an already-running session into a card, once. Idempotent by
   * `sessionKey`: a second call for the same key returns the existing card
   * unchanged, or restores it first if it was archived, instead of creating a
   * duplicate.
   */
  async captureSession(input) {
    return await this.retryOnRevisionConflict(async () => await this.captureSessionOnce(input));
  }
  async captureSessionOnce(input) {
    return await this.enqueueMutation(async () => {
      const sessionKey = normalizeOptionalString(input.sessionKey);
      if (!sessionKey) {
        throw new Error("sessionKey is required.");
      }
      const boardId = normalizeBoardId(input.boardId) ?? "default";
      const matches = (await this.list()).filter((card) => cardSessionKey(card) === sessionKey).toSorted((left, right) => right.updatedAt - left.updatedAt);
      const existing = matches.find((card) => !card.metadata?.archivedAt) ?? matches.find((card) => Boolean(card.metadata?.archivedAt));
      if (existing) {
        if (!existing.metadata?.archivedAt) {
          return existing;
        }
        if (cardSessionKey(existing) !== sessionKey) {
          throw new Error("captured session identity collision.");
        }
        return await this.updateCard(
          existing.id,
          { metadata: { ...existing.metadata, archivedAt: 0 } },
          { expectedRevision: existing.revision }
        );
      }
      const winner = await this.createDirect(
        { ...input, boardId, parents: void 0 },
        void 0,
        { cardId: sessionCaptureCardId(sessionKey), insertIfAbsent: true }
      );
      if (cardSessionKey(winner) !== sessionKey) {
        throw new Error("captured session identity collision.");
      }
      return winner;
    });
  }
  async update(id, patch, options = {}) {
    const run = async () => await this.enqueueMutation(
      async () => await this.updateCard(id, patch, {
        allowMetadataDependencyLinks: false,
        enforceStatusHolds: true,
        ...options.expectedRevision !== void 0 ? { expectedRevision: options.expectedRevision } : {}
      })
    );
    return options.expectedRevision !== void 0 ? await run() : await this.retryOnRevisionConflict(run);
  }
  async updateCard(id, patch, options = {}) {
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`card not found: ${id}`);
    }
    if (options.expectedRevision !== void 0 && existing.revision !== options.expectedRevision) {
      throw new TaskfoldRevisionConflictError(id, options.expectedRevision);
    }
    const lifecycleStatusSourceUpdatedAt = lifecycleStatusSourceUpdatedAtFromPatch(patch.metadata);
    const existingLifecycleStatusSourceUpdatedAt = existing.metadata?.lifecycleStatusSourceUpdatedAt;
    const hasFreshLifecycleStatusSource = lifecycleStatusSourceUpdatedAt !== void 0 && lifecycleStatusSourceUpdatedAt !== existingLifecycleStatusSourceUpdatedAt;
    let effectivePatch = patch;
    if (patch.status !== void 0 && lifecycleStatusSourceUpdatedAt !== void 0 && shouldSkipPersistedLifecycleStatusUpdate(existing, lifecycleStatusSourceUpdatedAt)) {
      effectivePatch = { ...patch, status: void 0 };
      if (patch.metadata && typeof patch.metadata === "object" && !Array.isArray(patch.metadata)) {
        const metadataPatch = patch.metadata;
        const { lifecycleStatusSourceUpdatedAt: _ignored, ...rest } = metadataPatch;
        effectivePatch.metadata = Object.keys(rest).length > 0 ? rest : void 0;
      }
      const hasSemanticPatch = Object.entries(effectivePatch).some(
        ([key, value]) => key !== "status" && key !== "metadata" && value !== void 0
      );
      if (!hasSemanticPatch && effectivePatch.metadata === void 0) {
        return existing;
      }
    }
    const status = normalizeStatus(effectivePatch.status, existing.status);
    const now = Date.now();
    const startedAt = effectivePatch.startedAt === void 0 ? status === "running" ? existing.startedAt ?? now : existing.startedAt : normalizeTimestamp(effectivePatch.startedAt, 0) || void 0;
    const completedAt = effectivePatch.completedAt === void 0 ? status === "done" ? existing.completedAt ?? now : void 0 : normalizeTimestamp(effectivePatch.completedAt, 0) || void 0;
    const sessionKey = effectivePatch.sessionKey === void 0 ? existing.sessionKey : normalizeOptionalString(effectivePatch.sessionKey);
    const execution = effectivePatch.execution === void 0 ? effectivePatch.sessionKey === void 0 ? existing.execution : syncExecutionSessionKey(existing.execution, sessionKey) : normalizeExecution(effectivePatch.execution);
    let metadata = normalizeMetadata(effectivePatch.metadata, existing.metadata, {
      allowDependencyLinks: options.allowMetadataDependencyLinks !== false,
      preserveProofId: options.preserveProofId,
      allowAutomationLaunch: options.allowAutomationLaunch
    });
    if (status !== existing.status && !hasFreshLifecycleStatusSource) {
      metadata = { ...metadata, lifecycleStatusSourceUpdatedAt: void 0 };
    }
    const effectivePatchRecord = effectivePatch;
    const automationPatch = {};
    for (const key of [
      "tenant",
      "boardId",
      "createdByCardId",
      "idempotencyKey",
      "skills",
      "workspace",
      "workspaceAccess",
      "maxRuntimeSeconds",
      "maxRetries",
      "scheduledAt"
    ]) {
      if (Object.hasOwn(effectivePatchRecord, key) && effectivePatchRecord[key] !== void 0) {
        automationPatch[key] = effectivePatchRecord[key];
      }
    }
    if (Object.keys(automationPatch).length > 0) {
      metadata = trimMetadataToBudget(
        {
          ...metadata,
          automation: normalizeAutomationPatch(automationPatch, metadata.automation)
        },
        options
      );
    }
    const next = removeUndefinedCardFields({
      ...existing,
      title: effectivePatch.title === void 0 ? existing.title : normalizeTitle(effectivePatch.title),
      notes: effectivePatch.notes === void 0 ? existing.notes : normalizeNotes(effectivePatch.notes),
      status,
      priority: effectivePatch.priority === void 0 ? existing.priority : normalizePriority(effectivePatch.priority, existing.priority),
      labels: effectivePatch.labels === void 0 ? existing.labels : normalizeLabels(effectivePatch.labels),
      agentId: effectivePatch.agentId === void 0 ? existing.agentId : normalizeOptionalString(effectivePatch.agentId),
      sessionKey,
      runId: effectivePatch.runId === void 0 ? existing.runId : normalizeOptionalString(effectivePatch.runId),
      taskId: effectivePatch.taskId === void 0 ? existing.taskId : normalizeOptionalString(effectivePatch.taskId),
      sourceUrl: effectivePatch.sourceUrl === void 0 ? existing.sourceUrl : normalizeOptionalString(effectivePatch.sourceUrl),
      execution,
      delivery: effectivePatch.delivery === void 0 ? existing.delivery : normalizeDelivery(effectivePatch.delivery, existing.delivery, now),
      metadata: effectivePatch.templateId === void 0 ? metadata : { ...metadata, templateId: normalizeTemplateId(effectivePatch.templateId) },
      position: effectivePatchRecord.position === void 0 ? existing.position : normalizePosition(effectivePatchRecord.position, existing.position),
      updatedAt: now,
      ...startedAt ? { startedAt } : {},
      ...completedAt ? { completedAt } : {}
    });
    next.metadata = trimMetadataToBudget(
      syncExecutionAttemptMetadata(next.metadata ?? {}, execution, now),
      options
    );
    next.events = appendEvent(next, updateEvent(existing, next), now);
    if (options.enforceStatusHolds && effectivePatch.status !== void 0) {
      await this.assertActiveStatusAllowed(existing, next, now);
    }
    if (status !== "done") {
      delete next.completedAt;
    }
    if (effectivePatch.startedAt !== void 0 && !startedAt) {
      delete next.startedAt;
    }
    if (effectivePatch.completedAt !== void 0 && !completedAt) {
      delete next.completedAt;
    }
    if (metadataIsEmpty(next.metadata)) {
      delete next.metadata;
    }
    await this.persistCard(next, options.expectedRevision ?? existing.revision);
    await this.deleteDetachedAttachments(existing, next);
    return next;
  }
  /**
   * Single card write boundary. With `expectedRevision` the backend performs the
   * check and the write atomically (`compareAndSwap` is required on the cards
   * store, 需求/16 R1); without it this is an unconditional write.
   *
   * `protected`, not `private`: {@link compensateCardMutation} below and
   * store-workflow.ts's `decompose` rollback both need to persist an already-
   * merged card verbatim (no re-normalization, no patch semantics), which
   * `update`/`updateCard` do not offer.
   */
  async persistCard(card, expectedRevision) {
    if (expectedRevision === void 0) {
      await this.store.register(card.id, { version: 1, card });
      return;
    }
    let reason;
    const swapped = await this.store.compareAndSwap(
      card.id,
      expectedRevision,
      { version: 1, card },
      (rejected) => {
        reason = rejected;
      }
    );
    if (!swapped) {
      throw new TaskfoldRevisionConflictError(card.id, expectedRevision, reason);
    }
  }
  /**
   * Retries `run` when it loses a compare-and-swap race. Callers must re-read the
   * card inside `run` so each attempt swaps against the revision it actually saw.
   */
  async retryOnRevisionConflict(run) {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await run();
      } catch (error) {
        if (!(error instanceof TaskfoldRevisionConflictError) || attempt >= CARD_CAS_MAX_ATTEMPTS) {
          throw error;
        }
      }
    }
  }
  /**
   * Read-invert-persist compensation loop shared by {@link compensateWorkspaceMutation}
   * and store-workflow.ts's `decompose` rollback (需求/15.8-并发与补偿设计.md §4.4).
   * `before`/`after` bracket the single edit the caller wants to undo; each attempt
   * re-reads the live card, computes `invert(before, after, current)`, and swaps it
   * in with `current.revision` as the CAS guard, preserving whatever a concurrent
   * writer did to the card that `before`/`after` never touched.
   *
   * This does not call {@link enqueueMutation}: it assumes the caller either holds a
   * mutation-queue slot already (decompose, which runs entirely inside one) or takes
   * its own slot around the call (see {@link compensateWorkspaceMutation}). Wrapping
   * it here too would deadlock a caller invoking this from inside its own
   * enqueueMutation-wrapped operation, because enqueueMutation chains onto a queue
   * that will not advance until that outer operation returns. `protected`: store-
   * workflow.ts's `decompose` rollback calls this directly with
   * {@link invertTaskfoldCardMutation} for that reason -- it already runs entirely
   * inside its own enqueueMutation call.
   */
  async compensateCardMutation(id, before, after, invert) {
    for (let attempt = 1; ; attempt += 1) {
      const current = await this.get(id);
      if (!current) {
        return;
      }
      const merged = invert(before, after, current);
      if (sameTaskfoldCardState(current, merged)) {
        return;
      }
      try {
        await this.persistCard(merged, current.revision);
        return;
      } catch (error) {
        if (!(error instanceof TaskfoldRevisionConflictError) || attempt >= CARD_CAS_MAX_ATTEMPTS) {
          throw new Error(`card changed repeatedly during compensation: ${id}`);
        }
      }
    }
  }
  /**
   * Rolls back a workspace materialization that a caller (dispatcher.ts,
   * card-execution.ts) already committed via {@link update} but must now undo
   * because starting the run failed. Unlike the callers' old plain
   * `store.update(id, { workspace: ... })` rollback, this preserves any edit a
   * concurrent UI/agent write made to the card during the materialize-then-fail
   * window instead of silently overwriting it (需求/15.8-并发与补偿设计.md §2.4).
   *
   * Takes its own {@link enqueueMutation} slot: both call sites invoke this from
   * outside any store mutation of their own.
   */
  async compensateWorkspaceMutation(before, after) {
    await this.enqueueMutation(
      async () => await this.compensateCardMutation(before.id, before, after, invertTaskfoldWorkspaceMutation)
    );
  }
  async assertActiveStatusAllowed(existing, next, now) {
    if (next.status !== "ready" && next.status !== "running" && next.status !== "review" && next.status !== "done") {
      return;
    }
    const parents = cardParentIds(next);
    const cards = parents.length > 0 ? new Map((await this.list()).map((card) => [card.id, card])) : void 0;
    if (parents.length > 0 && !parents.every((parentId) => cards?.get(parentId)?.status === "done")) {
      throw new Error("card dependencies are not done.");
    }
    if (next.status === "done") {
      return;
    }
    const scheduledAt = next.metadata?.automation?.scheduledAt;
    if (scheduledAt && scheduledAt > now || existing.status === "scheduled" && !scheduledAt) {
      throw new Error("card is scheduled for later.");
    }
  }
  async delete(id) {
    return await this.enqueueMutation(async () => await this.deleteDirect(id));
  }
  async deleteDirect(id) {
    const cardId = id.trim();
    const deleted = await this.store.delete(cardId);
    if (!deleted) {
      return { deleted: false };
    }
    for (const entry of await this.subscriptionStore.entries()) {
      if (entry.value?.version === 1 && entry.value.subscription?.cardId === cardId) {
        await this.subscriptionStore.delete(entry.key);
      }
    }
    for (const entry of await this.attachmentStore.entries()) {
      if (entry.value?.version === 1 && entry.value.attachment?.cardId === cardId) {
        await this.attachmentStore.delete(entry.key);
      }
    }
    await this.removeReferencesToCard(cardId);
    return { deleted: true };
  }
  async addComment(id, input, scope) {
    const now = Date.now();
    const body = normalizeBoundedString(input.body, void 0, 2e3, "comment body");
    if (!body) {
      throw new Error("comment body is required.");
    }
    const comment = { id: randomUUID6(), body, createdAt: now };
    return await this.updateMetadata(id, (existing) => {
      assertCanMutateClaimedCard(existing, scope);
      return {
        ...existing.metadata,
        comments: [...existing.metadata?.comments ?? [], comment].slice(-MAX_CARD_COMMENTS)
      };
    });
  }
  async addSourceReference(id, input) {
    const now = Date.now();
    const label = normalizeTitle(input.label);
    const target = normalizeBoundedString(input.target, void 0, 2e3, "source reference target");
    const note = normalizeBoundedString(input.note, void 0, 2e3, "source reference note");
    if (!target || target.includes("\0") || target.includes("\n")) {
      throw new Error("source reference target is required and must be a single line.");
    }
    return await this.mutateSourceReferences(id, (references) => [
      ...references,
      {
        id: randomUUID6(),
        label,
        target,
        position: Math.max(0, ...references.map((reference) => reference.position)) + POSITION_STEP,
        createdAt: now,
        updatedAt: now,
        ...note ? { note } : {}
      }
    ]);
  }
  async updateSourceReference(id, input) {
    const sourceReferenceId = normalizeBoundedString(
      input.sourceReferenceId,
      void 0,
      120,
      "source reference id"
    );
    if (!sourceReferenceId) {
      throw new Error("sourceReferenceId is required.");
    }
    return await this.mutateSourceReferences(id, (references) => {
      const existing = references.find((reference) => reference.id === sourceReferenceId);
      if (!existing) {
        throw new Error(`source reference not found: ${sourceReferenceId}`);
      }
      const label = input.label === void 0 ? existing.label : normalizeTitle(input.label);
      const target = input.target === void 0 ? existing.target : normalizeBoundedString(input.target, void 0, 2e3, "source reference target");
      const note = input.note === void 0 ? existing.note : normalizeBoundedString(input.note, void 0, 2e3, "source reference note");
      if (!target || target.includes("\0") || target.includes("\n")) {
        throw new Error("source reference target is required and must be a single line.");
      }
      return references.map((reference) => {
        if (reference.id !== sourceReferenceId) {
          return reference;
        }
        const next = {
          ...reference,
          label,
          target,
          updatedAt: Date.now(),
          ...note ? { note } : {}
        };
        if (!note) {
          delete next.note;
        }
        return next;
      });
    });
  }
  async deleteSourceReference(id, input) {
    const sourceReferenceId = normalizeBoundedString(
      input.sourceReferenceId,
      void 0,
      120,
      "source reference id"
    );
    if (!sourceReferenceId) {
      throw new Error("sourceReferenceId is required.");
    }
    return await this.mutateSourceReferences(id, (references) => {
      if (!references.some((reference) => reference.id === sourceReferenceId)) {
        throw new Error(`source reference not found: ${sourceReferenceId}`);
      }
      return references.filter((reference) => reference.id !== sourceReferenceId);
    });
  }
  async reorderSourceReferences(id, input) {
    if (!Array.isArray(input.sourceReferenceIds) || input.sourceReferenceIds.some((value) => typeof value !== "string")) {
      throw new Error("sourceReferenceIds are required.");
    }
    const sourceReferenceIds = input.sourceReferenceIds;
    return await this.mutateSourceReferences(id, (references) => {
      if (sourceReferenceIds.length !== references.length || new Set(sourceReferenceIds).size !== sourceReferenceIds.length) {
        throw new Error("sourceReferenceIds must contain every source reference exactly once.");
      }
      const byId = new Map(references.map((reference) => [reference.id, reference]));
      const now = Date.now();
      return sourceReferenceIds.map((sourceReferenceId, index) => {
        const reference = byId.get(sourceReferenceId);
        if (!reference) {
          throw new Error(`source reference not found: ${sourceReferenceId}`);
        }
        return {
          ...reference,
          position: (index + 1) * POSITION_STEP,
          updatedAt: now
        };
      });
    });
  }
  async mutateSourceReferences(id, mutate) {
    return await this.retryOnRevisionConflict(async () => await this.enqueueMutation(async () => {
      const existing = await this.get(id);
      if (!existing) {
        throw new Error(`card not found: ${id}`);
      }
      const sourceReferences = mutate(
        [...existing.sourceReferences ?? []].toSorted(
          (left, right) => left.position - right.position || left.createdAt - right.createdAt
        )
      );
      const now = Date.now();
      const next = removeUndefinedCardFields({
        ...existing,
        ...sourceReferences.length ? { sourceReferences } : {},
        updatedAt: now
      });
      if (!sourceReferences.length) {
        delete next.sourceReferences;
      }
      next.events = appendEvent(next, { kind: "edited" }, now);
      await this.persistCard(next, existing.revision);
      return next;
    }));
  }
  async addLink(id, input) {
    const now = Date.now();
    const targetCardId = normalizeBoundedString(input.targetCardId, void 0, 120, "link target");
    const url = normalizeBoundedString(input.url, void 0, 2e3, "link URL");
    const title = normalizeBoundedString(input.title, void 0, 180, "link title");
    if (!targetCardId && !url) {
      throw new Error("link targetCardId or url is required.");
    }
    const type = normalizeLinkType(input.type, "relates_to");
    if (type === "parent" || type === "child") {
      throw new Error("parent and child dependency links must use linkDependency.");
    }
    if (type === "contains" || type === "contained_by") {
      throw new Error("requirement hierarchy links must use setCardRequirement.");
    }
    const link = {
      id: randomUUID6(),
      type,
      createdAt: now,
      ...targetCardId ? { targetCardId } : {},
      ...title ? { title } : {},
      ...url ? { url } : {}
    };
    return await this.updateMetadata(id, (existing) => ({
      ...existing.metadata,
      links: appendLinkPreservingDependencies(existing.metadata?.links ?? [], link)
    }));
  }
  async createGraphRelation(sourceId, targetId, type, scope) {
    if (sourceId === targetId) throw new Error("a card cannot link to itself.");
    const source = await this.get(sourceId);
    const target = await this.get(targetId);
    if (!source || !target) throw new Error("relation card not found.");
    if (cardBoardId(source) !== cardBoardId(target)) throw new Error("relation cards must belong to the same project.");
    if (source.metadata?.archivedAt || target.metadata?.archivedAt || await this.isProjectArchived(cardBoardId(source))) {
      throw new Error("archived cards or projects cannot be linked.");
    }
    assertCanMutateClaimedCard(source, scope);
    assertCanMutateClaimedCard(target, scope);
    if (type === "parent") return await this.linkCards(source.id, target.id, scope);
    if (type !== "blocks" && type !== "relates_to") throw new Error("unsupported graph relation type.");
    if (source.metadata?.links?.some((link) => link.type === type && link.targetCardId === target.id)) return source;
    return await this.addLink(source.id, { type, targetCardId: target.id });
  }
  async deleteGraphRelation(sourceId, targetId, type, scope) {
    return await this.enqueueMutation(async () => {
      const source = await this.get(sourceId);
      const target = await this.get(targetId);
      if (!source || !target) throw new Error("relation card not found.");
      if (cardBoardId(source) !== cardBoardId(target)) throw new Error("relation cards must belong to the same project.");
      if (await this.isProjectArchived(cardBoardId(source))) throw new Error("project is archived.");
      assertCanMutateClaimedCard(source, scope);
      assertCanMutateClaimedCard(target, scope);
      const sourceType = type === "parent" ? "child" : type;
      const sourceLinks = source.metadata?.links ?? [];
      if (!sourceLinks.some((link) => link.type === sourceType && link.targetCardId === target.id)) {
        throw new Error("graph relation not found.");
      }
      const updatedSource = await this.updateCard(source.id, {
        metadata: { ...source.metadata, links: sourceLinks.filter((link) => !(link.type === sourceType && link.targetCardId === target.id)) }
      }, { expectedRevision: source.revision });
      if (type !== "parent") return updatedSource;
      try {
        await this.updateCard(target.id, {
          metadata: { ...target.metadata, links: (target.metadata?.links ?? []).filter((link) => !(link.type === "parent" && link.targetCardId === source.id)) }
        }, { expectedRevision: target.revision });
      } catch (error) {
        await this.compensateCardMutation(source.id, source, updatedSource, invertTaskfoldCardMutation).catch(() => void 0);
        throw error;
      }
      return await this.promoteDependencyReady(target.id);
    });
  }
  async linkCards(parentId, childId, scope) {
    return await this.enqueueMutation(
      async () => await this.linkCardsDirect(parentId, childId, Date.now(), { scope })
    );
  }
  async setCardRequirement(childId, requirementId, scope) {
    return await this.enqueueMutation(
      async () => await this.setCardRequirementDirect(childId, requirementId, Date.now(), scope)
    );
  }
  async setCardRequirementDirect(childId, requirementId, now = Date.now(), scope) {
    const child = await this.get(childId);
    if (!child) {
      throw new Error(`card not found: ${childId}`);
    }
    if (isRequirementCard(child)) {
      throw new Error("requirement cards cannot be assigned to another requirement.");
    }
    const boardId = cardBoardId(child);
    if (await this.isProjectArchived(boardId)) {
      throw new Error("project is archived.");
    }
    assertCanMutateClaimedCard(child, scope);
    const currentRequirementId = cardRequirementId(child);
    const detach = async (parentId) => {
      const parent = await this.get(parentId);
      if (!parent) {
        return;
      }
      assertCanMutateClaimedCard(parent, scope);
      await this.updateCard(parent.id, {
        metadata: {
          ...parent.metadata,
          links: (parent.metadata?.links ?? []).filter(
            (link) => !(link.type === "contains" && link.targetCardId === child.id)
          )
        }
      });
    };
    if (!requirementId) {
      if (!currentRequirementId) {
        return child;
      }
      await detach(currentRequirementId);
      return await this.updateCard(child.id, {
        metadata: {
          ...child.metadata,
          links: (child.metadata?.links ?? []).filter((link) => link.type !== "contained_by")
        }
      });
    }
    const normalizedRequirementId = requirementId.trim();
    if (!normalizedRequirementId) {
      return await this.setCardRequirementDirect(child.id, void 0, now, scope);
    }
    if (normalizedRequirementId === child.id) {
      throw new Error("a card cannot be its own requirement.");
    }
    const requirement = await this.get(normalizedRequirementId);
    if (!requirement) {
      throw new Error(`card not found: ${normalizedRequirementId}`);
    }
    if (!isRequirementCard(requirement)) {
      throw new Error("target card is not a requirement.");
    }
    if (cardBoardId(requirement) !== boardId) {
      throw new Error("requirement must belong to the same project.");
    }
    if (cardRequirementId(requirement)) {
      throw new Error("nested requirements are not supported.");
    }
    assertCanMutateClaimedCard(requirement, scope);
    if (currentRequirementId && currentRequirementId !== requirement.id) {
      await detach(currentRequirementId);
    }
    const requirementLinks = requirement.metadata?.links ?? [];
    const childLinks = child.metadata?.links ?? [];
    const nextRequirementLinks = requirementLinks.some(
      (link) => link.type === "contains" && link.targetCardId === child.id
    ) ? requirementLinks : appendLinkPreservingDependencies(requirementLinks, {
      id: randomUUID6(),
      type: "contains",
      targetCardId: child.id,
      createdAt: now
    });
    const nextChildLinks = [
      ...childLinks.filter((link) => link.type !== "contained_by"),
      {
        id: randomUUID6(),
        type: "contained_by",
        targetCardId: requirement.id,
        createdAt: now
      }
    ];
    await this.updateCard(requirement.id, {
      metadata: { ...requirement.metadata, links: nextRequirementLinks }
    });
    return await this.updateCard(child.id, {
      metadata: { ...child.metadata, links: nextChildLinks }
    });
  }
  async linkCardsDirect(parentId, childId, now = Date.now(), options = {}) {
    if (parentId.trim() === childId.trim()) {
      throw new Error("parent and child cards must differ.");
    }
    const parent = await this.get(parentId);
    const child = await this.get(childId);
    if (!parent) {
      throw new Error(`card not found: ${parentId}`);
    }
    if (!child) {
      throw new Error(`card not found: ${childId}`);
    }
    if (isRequirementCard(parent) || child.kind === "requirement") {
      throw new Error("requirement cards cannot be execution dependencies.");
    }
    assertCanMutateClaimedCard(parent, options.scope);
    assertCanMutateClaimedCard(child, options.scope);
    if (child.status === "done" || child.status === "blocked") {
      const cardsById = new Map((await this.list()).map((card) => [card.id, card]));
      const parentIds = [...cardParentIds(child), parent.id].filter(
        (id, index, ids) => ids.indexOf(id) === index
      );
      if (parentIds.some((id) => cardsById.get(id)?.status !== "done")) {
        throw new Error("terminal child cards cannot gain incomplete parent dependencies.");
      }
    }
    if (isActiveDependencyTarget(child, { allowStatusOnly: options.allowStatusOnlyActiveChild })) {
      throw new Error("active child cards cannot gain parent dependencies.");
    }
    if (await this.dependsOn(parent.id, child.id)) {
      throw new Error("dependency link would create a cycle.");
    }
    const parentLinks = parent.metadata?.links ?? [];
    const childLinks = child.metadata?.links ?? [];
    const nextParentLinks = parentLinks.some(
      (link) => link.type === "child" && link.targetCardId === child.id
    ) ? parentLinks : appendLinkPreservingDependencies(parentLinks, {
      id: randomUUID6(),
      type: "child",
      targetCardId: child.id,
      createdAt: now
    });
    const nextChildLinks = childLinks.some(
      (link) => link.type === "parent" && link.targetCardId === parent.id
    ) ? childLinks : appendLinkPreservingDependencies(childLinks, {
      id: randomUUID6(),
      type: "parent",
      targetCardId: parent.id,
      createdAt: now
    });
    const updatedParent = await this.updateCard(parent.id, {
      metadata: { ...parent.metadata, links: nextParentLinks }
    });
    let nextChild;
    try {
      nextChild = await this.updateCard(child.id, {
        metadata: { ...child.metadata, links: nextChildLinks }
      });
    } catch (error) {
      await this.compensateCardMutation(
        parent.id,
        parent,
        updatedParent,
        invertTaskfoldCardMutation
      ).catch(() => void 0);
      throw error;
    }
    return await this.promoteDependencyReady(nextChild.id);
  }
  async dependencyTargetStatus(card, now) {
    const scheduledAt = card.metadata?.automation?.scheduledAt;
    const parents = cardParentIds(card);
    if (card.status === "scheduled" && !scheduledAt) {
      return "scheduled";
    }
    if (parents.length === 0) {
      if (scheduledAt && scheduledAt > now && isDependencyPromotableStatus(card.status)) {
        return "scheduled";
      }
      return card.status === "scheduled" ? "ready" : card.status;
    }
    const parentCards = await Promise.all(parents.map((parentId) => this.get(parentId)));
    const parentsDone = parentCards.every((parent) => parent?.status === "done");
    if (!parentsDone && scheduledAt && scheduledAt > now && isDependencyPromotableStatus(card.status)) {
      return "scheduled";
    }
    if (!parentsDone && isDependencyPromotableStatus(card.status)) {
      return "todo";
    }
    if (parentsDone && scheduledAt && scheduledAt > now && isDependencyPromotableStatus(card.status)) {
      return "scheduled";
    }
    return parentsDone && isDependencyPromotableStatus(card.status) ? "ready" : card.status;
  }
  async dependsOn(cardId, targetParentId) {
    const cards = new Map((await this.list()).map((entry) => [entry.id, entry]));
    const seen = /* @__PURE__ */ new Set();
    const visit = (id) => {
      if (id === targetParentId) {
        return true;
      }
      if (seen.has(id)) {
        return false;
      }
      seen.add(id);
      const card = cards.get(id);
      return Boolean(card && cardParentIds(card).some(visit));
    };
    return visit(cardId);
  }
  async recordDispatch(card, now) {
    const metadata = trimMetadataToBudget(
      normalizeMetadata(
        {
          ...card.metadata,
          automation: normalizeAutomation(
            {
              ...card.metadata?.automation,
              dispatchCount: (card.metadata?.automation?.dispatchCount ?? 0) + 1,
              lastDispatchAt: now
            },
            card.metadata?.automation
          )
        },
        card.metadata
      )
    );
    const next = removeUndefinedCardFields({
      ...card,
      ...!metadataIsEmpty(metadata) ? { metadata } : { metadata: void 0 },
      events: appendEvent(card, { kind: "dispatch" }, now)
    });
    await this.persistCard(next, card.revision);
    return next;
  }
  async recordOrchestrationCandidate(card, now) {
    const metadata = trimMetadataToBudget({
      ...card.metadata,
      workerLogs: [
        ...card.metadata?.workerLogs ?? [],
        {
          id: randomUUID6(),
          level: "info",
          message: "Auto orchestration marked this triage card for specification or decomposition.",
          createdAt: now
        }
      ].slice(-MAX_CARD_WORKER_LOGS),
      workerProtocol: {
        state: "idle",
        updatedAt: now,
        detail: "Awaiting taskfold_specify or taskfold_decompose."
      }
    });
    const next = removeUndefinedCardFields({
      ...card,
      ...!metadataIsEmpty(metadata) ? { metadata } : { metadata: void 0 },
      events: appendEvent(card, { kind: "orchestration" }, now)
    });
    await this.persistCard(next, card.revision);
    return next;
  }
  async promoteDependencyReady(id, now = Date.now()) {
    const card = await this.get(id);
    if (!card) {
      throw new Error(`card not found: ${id}`);
    }
    if (card.metadata?.archivedAt) {
      return card;
    }
    const target = await this.dependencyTargetStatus(card, now);
    if (target === card.status) {
      return card;
    }
    return await this.updateCard(card.id, { status: target });
  }
};

// src/backend/src/gateway-workspace-methods.ts
var WRITE_SCOPE = "operator.write";
function readOptionalExpectedRevision(requestParams) {
  const value = requestParams.expectedRevision;
  if (value === void 0) {
    return void 0;
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("expectedRevision must be a non-negative safe integer.");
  }
  return value;
}
async function resolveGatewayWorkspaceMutationAccess(request, value) {
  const access = await canonicalizeTaskfoldWorkspaceAccess(
    resolveGatewayTaskfoldWorkspaceAccess({
      context: request.context,
      client: request.client
    })
  );
  await assertTaskfoldWorkspaceMutationAccess(value, access);
  return access;
}
function registerTaskfoldWorkspaceCardMethods(params) {
  const { api, store, redactCard } = params;
  api.registerGatewayMethod(
    "taskfold.cards.create",
    async (request) => {
      const { params: requestParams, respond } = request;
      try {
        const input = withoutTaskfoldWorkspaceAccess(requestParams);
        const project = await store.getProject(input.boardId);
        const inputWithProjectWorkspace = input.workspace === void 0 && project.board.defaultWorkspace ? { ...input, workspace: project.board.defaultWorkspace } : input;
        const access = await resolveGatewayWorkspaceMutationAccess(request, inputWithProjectWorkspace);
        respond(true, {
          card: redactCard(
            await store.create(withTaskfoldWorkspaceAccess(inputWithProjectWorkspace, access))
          )
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE }
  );
  api.registerGatewayMethod(
    "taskfold.cards.captureSession",
    async (request) => {
      const { params: requestParams, respond } = request;
      try {
        const input = withoutTaskfoldWorkspaceAccess(requestParams);
        const project = await store.getProject(input.boardId);
        const inputWithProjectWorkspace = input.workspace === void 0 && project.board.defaultWorkspace ? { ...input, workspace: project.board.defaultWorkspace } : input;
        const access = await resolveGatewayWorkspaceMutationAccess(request, inputWithProjectWorkspace);
        respond(true, {
          card: redactCard(
            await store.captureSession(withTaskfoldWorkspaceAccess(inputWithProjectWorkspace, access))
          )
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE }
  );
  api.registerGatewayMethod(
    "taskfold.cards.update",
    async (request) => {
      const { params: requestParams, respond } = request;
      try {
        const id = readId(requestParams);
        const expectedRevision = readOptionalExpectedRevision(requestParams);
        const patch = withoutTaskfoldCasParams(withoutTaskfoldWorkspaceAccess(readPatch(requestParams)));
        const access = await resolveGatewayWorkspaceMutationAccess(request, patch);
        let updated;
        try {
          updated = await store.update(
            id,
            containsTaskfoldWorkspaceMutation(patch) ? withTaskfoldWorkspaceAccess(patch, access) : patch,
            expectedRevision !== void 0 ? { expectedRevision } : {}
          );
        } catch (error) {
          if (error instanceof TaskfoldRevisionConflictError) {
            const current = await store.get(id);
            if (current) {
              respondConflict(respond, redactCard(current));
              return;
            }
          }
          throw error;
        }
        respond(true, { card: redactCard(updated) });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE }
  );
}
function registerTaskfoldWorkspaceBulkMethod(params) {
  const { api, store, redactCard } = params;
  api.registerGatewayMethod(
    "taskfold.cards.bulk",
    async (request) => {
      const { params: requestParams, respond } = request;
      try {
        const sanitizedParams = withoutTaskfoldWorkspaceAccess(requestParams);
        const patch = withoutTaskfoldWorkspaceAccess(readPatch(requestParams));
        const access = await resolveGatewayWorkspaceMutationAccess(request, patch);
        const result = await store.bulkUpdate({
          ...sanitizedParams,
          patch: containsTaskfoldWorkspaceMutation(patch) ? withTaskfoldWorkspaceAccess(patch, access) : patch
        });
        respond(true, { cards: result.cards.map(redactCard) });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE }
  );
}
function registerTaskfoldWorkspaceBoardMethod(params) {
  const { api, store } = params;
  api.registerGatewayMethod(
    "taskfold.boards.upsert",
    async (request) => {
      const { params: requestParams, respond } = request;
      try {
        await resolveGatewayWorkspaceMutationAccess(request, requestParams);
        respond(true, { board: await store.upsertBoard(requestParams) });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE }
  );
}
function registerTaskfoldWorkspaceWorkflowMethods(params) {
  const { api, store, redactCard } = params;
  api.registerGatewayMethod(
    "taskfold.cards.specify",
    async (request) => {
      const { params: requestParams, respond } = request;
      try {
        const sanitizedParams = withoutTaskfoldWorkspaceAccess(requestParams);
        const access = await resolveGatewayWorkspaceMutationAccess(request, sanitizedParams);
        const input = containsTaskfoldWorkspaceMutation(sanitizedParams) ? withTaskfoldWorkspaceAccess(sanitizedParams, access) : sanitizedParams;
        respond(true, {
          card: redactCard(await store.specify(readId(requestParams), input, null))
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE }
  );
  api.registerGatewayMethod(
    "taskfold.cards.decompose",
    async (request) => {
      const { params: requestParams, respond } = request;
      try {
        const sanitizedParams = withoutTaskfoldWorkspaceAccess(requestParams);
        const access = await resolveGatewayWorkspaceMutationAccess(request, sanitizedParams);
        const result = await store.decompose(
          readId(requestParams),
          withTaskfoldDecomposeWorkspaceAccess(sanitizedParams, access),
          null
        );
        respond(true, {
          parent: redactCard(result.parent),
          children: result.children.map(redactCard)
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE }
  );
}

// ../core/src/project-document-reader.ts
import { createHash as createHash4, randomUUID as randomUUID7 } from "node:crypto";
import fs9 from "node:fs/promises";
import path16 from "node:path";
var MAX_PROJECT_DOCUMENT_BYTES = 1024 * 1024;
var MARKDOWN_EXTENSIONS = /* @__PURE__ */ new Set([".md", ".markdown"]);
function documentRevision(bytes) {
  return createHash4("sha256").update(bytes).digest("hex");
}
function decodeUtf8(bytes) {
  let content;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("project document file is not valid UTF-8 text.");
  }
  if (content.includes("\0")) {
    throw new Error("project document file is not valid UTF-8 text.");
  }
  return content;
}
function encodeDocumentContent(content) {
  if (typeof content !== "string") {
    throw new Error("document content must be a string.");
  }
  const bytes = Buffer.from(content, "utf8");
  if (bytes.byteLength > MAX_PROJECT_DOCUMENT_BYTES) {
    throw new Error("project document content exceeds the 1 MiB limit.");
  }
  if (decodeUtf8(bytes) !== content) {
    throw new Error("document content is not valid UTF-8 text.");
  }
  return bytes;
}
function assertMarkdownPath(document) {
  if (document.type !== "path" || !document.target) {
    throw new Error("only Markdown documents and Markdown file paths can be previewed.");
  }
  const fileName = path16.basename(document.target).toLowerCase();
  if (fileName === ".env" || fileName.startsWith(".env.")) {
    throw new Error("environment files cannot be previewed as project documents.");
  }
  if (!MARKDOWN_EXTENSIONS.has(path16.extname(document.target).toLowerCase())) {
    throw new Error("project document paths must reference a Markdown file.");
  }
  return document.target;
}
async function resolveProjectDocumentFile(params) {
  const target = assertMarkdownPath(params.document);
  let resolvedPath;
  try {
    resolvedPath = await fs9.realpath(target);
  } catch {
    throw new Error("project document file does not exist.");
  }
  await params.assertPathAllowed(resolvedPath);
  let stat2;
  try {
    stat2 = await fs9.stat(resolvedPath);
  } catch {
    throw new Error("project document file cannot be read.");
  }
  if (!stat2.isFile()) {
    throw new Error("project document path must reference a regular file.");
  }
  if (stat2.size > MAX_PROJECT_DOCUMENT_BYTES) {
    throw new Error("project document file exceeds the 1 MiB preview limit.");
  }
  let bytes;
  try {
    bytes = await fs9.readFile(resolvedPath);
  } catch {
    throw new Error("project document file cannot be read.");
  }
  return { content: decodeUtf8(bytes), bytes, path: resolvedPath, stat: stat2 };
}
async function readTaskfoldProjectDocument(params) {
  const { document } = params;
  if (document.type === "markdown") {
    const content = document.content ?? "";
    return {
      document,
      content,
      source: "stored",
      revision: `stored:${document.updatedAt}:${documentRevision(Buffer.from(content, "utf8"))}`
    };
  }
  const file = await resolveProjectDocumentFile(params);
  return {
    document,
    content: file.content,
    source: "path",
    revision: documentRevision(file.bytes),
    path: file.path,
    modifiedAt: Math.trunc(Number(file.stat.mtimeMs))
  };
}
async function writeTaskfoldProjectDocumentPath(params) {
  if (typeof params.expectedRevision !== "string" || !params.expectedRevision) {
    throw new Error("expected document revision is required.");
  }
  const content = encodeDocumentContent(params.content);
  const current = await resolveProjectDocumentFile(params);
  if (documentRevision(current.bytes) !== params.expectedRevision) {
    throw new Error("project document changed on disk; reload it before saving.");
  }
  const directory = path16.dirname(current.path);
  const temporaryPath = path16.join(
    directory,
    `.${path16.basename(current.path)}.taskfold-${randomUUID7()}.tmp`
  );
  const originalMode = Number(current.stat.mode) & 4095;
  try {
    const handle = await fs9.open(temporaryPath, "wx", originalMode);
    try {
      await handle.writeFile(content);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs9.chmod(temporaryPath, originalMode);
    await fs9.rename(temporaryPath, current.path);
  } catch (error) {
    await fs9.rm(temporaryPath, { force: true }).catch(() => void 0);
    throw error;
  }
  return await readTaskfoldProjectDocument({
    document: params.document,
    assertPathAllowed: params.assertPathAllowed
  });
}

// src/backend/src/project-document-reader.ts
function pathAccess(access) {
  return async (filePath) => {
    await assertTaskfoldWorkspaceSourceAccess({ kind: "dir", path: filePath }, access);
  };
}
async function readTaskfoldProjectDocument2(params) {
  return await readTaskfoldProjectDocument({ document: params.document, assertPathAllowed: pathAccess(params.access) });
}
async function writeTaskfoldProjectDocumentPath2(params) {
  if (!params.access.unrestricted && !params.access.writable) {
    throw new Error("project document workspace access is read-only.");
  }
  return await writeTaskfoldProjectDocumentPath({
    document: params.document,
    content: params.content,
    expectedRevision: params.expectedRevision,
    assertPathAllowed: pathAccess(params.access)
  });
}

// src/backend/src/gateway-project-methods.ts
var READ_SCOPE = "operator.read";
var WRITE_SCOPE2 = "operator.write";
async function assertProjectWorkspaceAccess(request, value) {
  const access = await canonicalizeTaskfoldWorkspaceAccess(
    resolveGatewayTaskfoldWorkspaceAccess({
      context: request.context,
      client: request.client
    })
  );
  await assertTaskfoldWorkspaceMutationAccess(value, access);
}
async function resolveProjectWorkspaceReadAccess(request) {
  return await canonicalizeTaskfoldWorkspaceAccess(
    resolveGatewayTaskfoldWorkspaceAccess({
      context: request.context,
      client: request.client
    })
  );
}
async function resolveProjectWorkspaceWriteAccess(request) {
  const access = await resolveProjectWorkspaceReadAccess(request);
  if (!access.unrestricted && !access.writable) {
    throw new Error("project document workspace access is read-only.");
  }
  return access;
}
function registerTaskfoldProjectGatewayMethods(params) {
  const { api, store, redactCard } = params;
  api.registerGatewayMethod(
    "taskfold.projects.list",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, await store.listProjects(requestParams));
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: READ_SCOPE }
  );
  api.registerGatewayMethod(
    "taskfold.projects.get",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, { project: await store.getProject(requestParams.id) });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: READ_SCOPE }
  );
  api.registerGatewayMethod(
    "taskfold.projects.create",
    async (request) => {
      const { params: requestParams, respond } = request;
      try {
        await assertProjectWorkspaceAccess(request, requestParams);
        respond(true, { project: await store.createProject(requestParams) });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE2 }
  );
  api.registerGatewayMethod(
    "taskfold.projects.update",
    async (request) => {
      const { params: requestParams, respond } = request;
      try {
        await assertProjectWorkspaceAccess(request, requestParams);
        respond(true, { project: await store.updateProject(requestParams) });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE2 }
  );
  api.registerGatewayMethod(
    "taskfold.projects.boardView.update",
    async ({ params: requestParams, respond }) => {
      try {
        const id = readId(requestParams);
        respond(true, {
          board: await store.updateProject({ id, boardView: requestParams.boardView })
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE2 }
  );
  api.registerGatewayMethod(
    "taskfold.projects.reorder",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, await store.reorderProjects(requestParams.ids));
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE2 }
  );
  api.registerGatewayMethod(
    "taskfold.projects.archive",
    async ({ params: requestParams, respond }) => {
      try {
        respond(
          true,
          await store.archiveProject(requestParams.id, requestParams.archived === false ? false : true)
        );
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE2 }
  );
  api.registerGatewayMethod(
    "taskfold.projects.restore",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, await store.archiveProject(requestParams.id, false));
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE2 }
  );
  api.registerGatewayMethod(
    "taskfold.projects.milestones.list",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, await store.listMilestones(requestParams.boardId));
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: READ_SCOPE }
  );
  api.registerGatewayMethod(
    "taskfold.projects.milestones.create",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, { milestone: await store.createMilestone(requestParams) });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE2 }
  );
  api.registerGatewayMethod(
    "taskfold.projects.milestones.update",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, { milestone: await store.updateMilestone(readId(requestParams), requestParams) });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE2 }
  );
  api.registerGatewayMethod(
    "taskfold.projects.milestones.reorder",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, await store.reorderMilestones(requestParams));
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE2 }
  );
  api.registerGatewayMethod(
    "taskfold.projects.milestones.complete",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, { milestone: await store.completeMilestone(readId(requestParams)) });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE2 }
  );
  api.registerGatewayMethod(
    "taskfold.projects.milestones.archive",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, { milestone: await store.archiveMilestone(readId(requestParams)) });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE2 }
  );
  api.registerGatewayMethod(
    "taskfold.projects.milestones.restore",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, { milestone: await store.restoreMilestone(readId(requestParams)) });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE2 }
  );
  api.registerGatewayMethod(
    "taskfold.projects.documents.list",
    async (request) => {
      const { params: requestParams, respond } = request;
      try {
        const access = await resolveProjectWorkspaceReadAccess(request);
        const project = await store.getProject(requestParams.boardId);
        if (project.board.defaultWorkspace?.path) {
          await assertTaskfoldWorkspaceSourceAccess(project.board.defaultWorkspace, access);
        }
        respond(
          true,
          await store.listProjectDocuments(requestParams.boardId, {
            includeHidden: requestParams.includeHidden
          })
        );
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: READ_SCOPE }
  );
  api.registerGatewayMethod(
    "taskfold.projects.documents.read",
    async (request) => {
      const { params: requestParams, respond } = request;
      try {
        const access = await resolveProjectWorkspaceReadAccess(request);
        const document = await store.getProjectDocument(readId(requestParams));
        respond(true, {
          preview: await readTaskfoldProjectDocument2({ document, access })
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: READ_SCOPE }
  );
  api.registerGatewayMethod(
    "taskfold.projects.documents.write",
    async (request) => {
      const { params: requestParams, respond } = request;
      try {
        const access = await resolveProjectWorkspaceWriteAccess(request);
        const document = await store.getProjectDocument(readId(requestParams));
        if (document.type === "markdown") {
          const preview = await readTaskfoldProjectDocument2({ document, access });
          if (typeof requestParams.expectedRevision !== "string" || requestParams.expectedRevision !== preview.revision) {
            throw new Error("project document changed; reload it before saving.");
          }
          const updated = await store.updateProjectDocument(document.id, {
            content: requestParams.content
          });
          respond(true, {
            preview: await readTaskfoldProjectDocument2({ document: updated, access })
          });
          return;
        }
        respond(true, {
          preview: await writeTaskfoldProjectDocumentPath2({
            document,
            content: requestParams.content,
            expectedRevision: requestParams.expectedRevision,
            access
          })
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE2 }
  );
  api.registerGatewayMethod(
    "taskfold.projects.documents.create",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, { document: await store.createProjectDocument(requestParams) });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE2 }
  );
  api.registerGatewayMethod(
    "taskfold.projects.documents.update",
    async ({ params: requestParams, respond }) => {
      try {
        respond(
          true,
          { document: await store.updateProjectDocument(readId(requestParams), requestParams) }
        );
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE2 }
  );
  api.registerGatewayMethod(
    "taskfold.projects.documents.reorder",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, await store.reorderProjectDocuments(requestParams));
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE2 }
  );
  api.registerGatewayMethod(
    "taskfold.projects.documents.hide",
    async ({ params: requestParams, respond }) => {
      try {
        respond(
          true,
          { document: await store.hideProjectDocument(readId(requestParams), true) }
        );
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE2 }
  );
  api.registerGatewayMethod(
    "taskfold.projects.documents.restore",
    async ({ params: requestParams, respond }) => {
      try {
        respond(
          true,
          { document: await store.hideProjectDocument(readId(requestParams), false) }
        );
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE2 }
  );
  api.registerGatewayMethod(
    "taskfold.projects.documents.delete",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, await store.deleteProjectDocument(readId(requestParams)));
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE2 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.sources.create",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, {
          card: redactCard(await store.addSourceReference(readId(requestParams), requestParams))
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE2 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.sources.update",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, {
          card: redactCard(await store.updateSourceReference(readId(requestParams), requestParams))
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE2 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.sources.delete",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, {
          card: redactCard(await store.deleteSourceReference(readId(requestParams), requestParams))
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE2 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.sources.reorder",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, {
          card: redactCard(await store.reorderSourceReferences(readId(requestParams), requestParams))
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE2 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.moveMilestone",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, {
          card: redactCard(await store.moveMilestone(readId(requestParams), requestParams))
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE2 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.moveProject",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, {
          card: redactCard(await store.moveProject(readId(requestParams), requestParams))
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE2 }
  );
}

// src/backend/src/gateway.ts
var READ_SCOPE2 = "operator.read";
var WRITE_SCOPE3 = "operator.write";
var CHANGE_WAIT_MAX_MS = 3e4;
var CHANGE_WAIT_DEFAULT_MS = 25e3;
function readChangeCursor(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return void 0;
  }
  const epoch = value.epoch;
  const revision = value.revision;
  if (typeof epoch !== "string" || !epoch || epoch.length > 128 || typeof revision !== "number" || !Number.isSafeInteger(revision) || revision <= 0) {
    throw new Error("after must be a valid taskfold change cursor.");
  }
  return { epoch, revision };
}
function readChangeWaitTimeout(value) {
  if (value === void 0) {
    return CHANGE_WAIT_DEFAULT_MS;
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > CHANGE_WAIT_MAX_MS) {
    throw new Error(`timeoutMs must be an integer from 1 to ${CHANGE_WAIT_MAX_MS}.`);
  }
  return value;
}
function redactDiagnosticsRows(result) {
  return {
    ...result,
    diagnostics: result.diagnostics.map((row) => ({
      ...row,
      card: redactClaimToken(row.card)
    }))
  };
}
function registerTaskfoldGatewayMethods(params) {
  const { api, store } = params;
  const dispatchCards = createTaskfoldDispatchHandler({
    api,
    store,
    redactCard: redactClaimToken
  });
  const sandbox = api.runtime.sandbox;
  const executionOptions = (request) => {
    const config = request.context.getRuntimeConfig();
    return {
      runtime: api.runtime,
      workspaceAccess: resolveGatewayTaskfoldWorkspaceAccess({
        context: request.context,
        client: request.client
      }),
      defaultAgentId: resolveDefaultAgentId2(config),
      resolveAgentWorkspaceRuntime: (agentId, sessionKey, workspaceDir, modelProvider, modelId) => resolveAgentTaskfoldWorkspaceRuntime({
        config,
        agentId,
        sessionKey,
        workspaceDir,
        modelProvider,
        modelId,
        prepareSandboxWorkspaceAuthority: sandbox?.prepareWorkspaceAuthority
      })
    };
  };
  api.registerGatewayMethod(
    "taskfold.cards.list",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, await listTaskfoldCards(store, requestParams.boardId, redactClaimToken));
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: READ_SCOPE2 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.execution.prepare",
    async (request) => {
      try {
        request.respond(
          true,
          await prepareTaskfoldCardExecution({
            store,
            id: request.params.id,
            options: executionOptions(request)
          })
        );
      } catch (error) {
        respondError(request.respond, error);
      }
    },
    { scope: READ_SCOPE2 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.execution.inspect",
    async (request) => {
      try {
        const result = await inspectTaskfoldCardExecution({
          store,
          id: request.params.id,
          runtime: api.runtime
        });
        request.respond(true, { ...result, card: redactClaimToken(result.card) });
      } catch (error) {
        respondError(request.respond, error);
      }
    },
    { scope: READ_SCOPE2 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.execution.start",
    async (request) => {
      try {
        const result = await startTaskfoldCardExecution({
          store,
          id: request.params.id,
          expectedRevision: request.params.expectedRevision,
          options: executionOptions(request)
        });
        request.respond(true, { ...result, card: redactClaimToken(result.card) });
      } catch (error) {
        respondError(request.respond, error);
      }
    },
    { scope: WRITE_SCOPE3 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.execution.steer",
    async (request) => {
      try {
        const result = await steerTaskfoldCardExecution({
          store,
          id: request.params.id,
          nextRunId: request.params.nextRunId
        });
        request.respond(true, { ...result, card: redactClaimToken(result.card) });
      } catch (error) {
        respondError(request.respond, error);
      }
    },
    { scope: WRITE_SCOPE3 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.execution.abort",
    async (request) => {
      try {
        const result = await abortTaskfoldCardExecution({
          store,
          id: request.params.id,
          reason: request.params.reason,
          expectedRunId: request.params.expectedRunId
        });
        request.respond(true, { ...result, card: redactClaimToken(result.card) });
      } catch (error) {
        respondError(request.respond, error);
      }
    },
    { scope: WRITE_SCOPE3 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.execution.reconcile",
    async (request) => {
      try {
        const result = await reconcileTaskfoldCardExecution({
          store,
          id: request.params.id,
          expectedRunId: request.params.expectedRunId,
          outcome: request.params.outcome,
          endedAt: request.params.endedAt,
          reason: request.params.reason
        });
        request.respond(true, { ...result, card: redactClaimToken(result.card) });
      } catch (error) {
        respondError(request.respond, error);
      }
    },
    { scope: WRITE_SCOPE3 }
  );
  api.registerGatewayMethod(
    "taskfold.changes.wait",
    async ({ params: requestParams, respond }) => {
      try {
        respond(
          true,
          // 文件后端下 store 的游标就是跨项目聚合游标（change-aggregator.ts），返回形状不变。
          await store.waitForChange(
            readChangeCursor(requestParams.after),
            readChangeWaitTimeout(requestParams.timeoutMs)
          )
        );
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: READ_SCOPE2 }
  );
  registerTaskfoldWorkspaceCardMethods({ api, store, redactCard: redactClaimToken });
  registerTaskfoldProjectGatewayMethods({ api, store, redactCard: redactClaimToken });
  api.registerGatewayMethod(
    "taskfold.cards.move",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, {
          card: redactClaimToken(
            await store.move(readId(requestParams), requestParams.status, requestParams.position)
          )
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE3 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.delete",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, await store.delete(readId(requestParams)));
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE3 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.comment",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, {
          card: redactClaimToken(await store.addComment(readId(requestParams), requestParams))
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE3 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.link",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, {
          card: redactClaimToken(await store.addLink(readId(requestParams), requestParams))
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE3 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.linkDependency",
    async ({ params: requestParams, respond }) => {
      try {
        const parentId = requestParams.parentId;
        const childId = requestParams.childId;
        if (typeof parentId !== "string" || typeof childId !== "string") {
          throw new Error("parentId and childId are required.");
        }
        respond(true, {
          card: redactClaimToken(await store.linkCards(parentId, childId))
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE3 }
  );
  for (const action of ["create", "delete"]) {
    api.registerGatewayMethod(
      `taskfold.cards.relation.${action}`,
      async ({ params: requestParams, respond }) => {
        try {
          const source = readId(requestParams);
          const target = requestParams.target;
          const type = requestParams.type;
          if (typeof target !== "string" || !target.trim() || type !== "parent" && type !== "blocks" && type !== "relates_to") {
            throw new Error("target and supported relation type are required.");
          }
          const card = action === "create" ? await store.createGraphRelation(source, target, type) : await store.deleteGraphRelation(source, target, type);
          respond(true, { card: redactClaimToken(card) });
        } catch (error) {
          respondError(respond, error);
        }
      },
      { scope: WRITE_SCOPE3 }
    );
  }
  api.registerGatewayMethod(
    "taskfold.cards.requirement.set",
    async ({ params: requestParams, respond }) => {
      try {
        const rawRequirementId = requestParams.requirementId;
        if (rawRequirementId !== void 0 && rawRequirementId !== null && typeof rawRequirementId !== "string") {
          throw new Error("requirementId must be a card id or empty.");
        }
        const requirementId = typeof rawRequirementId === "string" && rawRequirementId.trim() ? rawRequirementId.trim() : void 0;
        respond(true, {
          card: redactClaimToken(await store.setCardRequirement(readId(requestParams), requirementId))
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE3 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.proof",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, {
          card: redactClaimToken(await store.addProof(readId(requestParams), requestParams))
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE3 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.artifact",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, {
          card: redactClaimToken(await store.addArtifact(readId(requestParams), requestParams))
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE3 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.proof.delete",
    async ({ params: requestParams, respond }) => {
      try {
        const proofId = requestParams.proofId;
        if (typeof proofId !== "string" || !proofId.trim()) {
          throw new Error("proofId is required.");
        }
        respond(true, {
          card: redactClaimToken(await store.deleteProof(readId(requestParams), proofId.trim()))
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE3 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.artifact.delete",
    async ({ params: requestParams, respond }) => {
      try {
        const artifactId = requestParams.artifactId;
        if (typeof artifactId !== "string" || !artifactId.trim()) {
          throw new Error("artifactId is required.");
        }
        respond(true, {
          card: redactClaimToken(await store.deleteArtifact(readId(requestParams), artifactId.trim()))
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE3 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.claim",
    async ({ params: requestParams, respond }) => {
      try {
        const claimed = await store.claim(readId(requestParams), requestParams);
        respond(true, { ...claimed, card: redactClaimToken(claimed.card) });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE3 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.heartbeat",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, {
          card: redactClaimToken(await store.heartbeat(readId(requestParams), requestParams))
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE3 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.release",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, {
          card: redactClaimToken(await store.releaseClaim(readId(requestParams), requestParams))
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE3 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.promote",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, {
          card: redactClaimToken(await store.promote(readId(requestParams), requestParams, null))
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE3 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.reassign",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, {
          card: redactClaimToken(await store.reassign(readId(requestParams), requestParams, null))
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE3 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.reclaim",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, {
          card: redactClaimToken(await store.reclaim(readId(requestParams), requestParams, null))
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE3 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.complete",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, {
          card: redactClaimToken(await store.complete(readId(requestParams), requestParams, null))
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE3 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.block",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, {
          card: redactClaimToken(await store.block(readId(requestParams), requestParams, null))
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE3 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.unblock",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, {
          card: redactClaimToken(await store.unblock(readId(requestParams)))
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE3 }
  );
  registerTaskfoldWorkspaceBulkMethod({ api, store, redactCard: redactClaimToken });
  api.registerGatewayMethod(
    "taskfold.cards.diagnostics",
    async ({ respond }) => {
      try {
        respond(true, redactDiagnosticsRows(await store.diagnostics()));
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: READ_SCOPE2 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.diagnostics.refresh",
    async ({ respond }) => {
      try {
        respond(true, redactDiagnosticsRows(await store.refreshDiagnostics()));
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE3 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.dispatch",
    async (context) => await dispatchCards(context, { supportsMaxStarts: false }),
    { scope: WRITE_SCOPE3 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.dispatchWithOptions",
    async (context) => await dispatchCards(context, { supportsMaxStarts: true }),
    { scope: WRITE_SCOPE3 }
  );
  api.registerGatewayMethod(
    "taskfold.boards.list",
    async ({ respond }) => {
      try {
        respond(true, await store.listBoards());
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: READ_SCOPE2 }
  );
  registerTaskfoldWorkspaceBoardMethod({ api, store, redactCard: redactClaimToken });
  api.registerGatewayMethod(
    "taskfold.boards.archive",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, {
          board: await store.archiveBoard(requestParams.id, requestParams.archived)
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE3 }
  );
  api.registerGatewayMethod(
    "taskfold.boards.delete",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, await store.deleteBoard(requestParams.id));
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE3 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.stats",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, await store.stats({ boardId: requestParams.boardId }));
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: READ_SCOPE2 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.runs",
    async ({ params: requestParams, respond }) => {
      try {
        const result = await store.runs(readId(requestParams));
        respond(true, { ...result, card: redactClaimToken(result.card) });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: READ_SCOPE2 }
  );
  registerTaskfoldWorkspaceWorkflowMethods({ api, store, redactCard: redactClaimToken });
  api.registerGatewayMethod(
    "taskfold.notifications.subscribe",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, { subscription: await store.subscribeNotifications(requestParams) });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE3 }
  );
  api.registerGatewayMethod(
    "taskfold.notifications.list",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, await store.listNotificationSubscriptions(requestParams));
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: READ_SCOPE2 }
  );
  api.registerGatewayMethod(
    "taskfold.notifications.delete",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, await store.deleteNotificationSubscription(readId(requestParams)));
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE3 }
  );
  api.registerGatewayMethod(
    "taskfold.notifications.events",
    async ({ params: requestParams, respond }) => {
      try {
        assertNoCursorAdvance(requestParams);
        respond(true, await store.notificationEvents(requestParams));
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: READ_SCOPE2 }
  );
  api.registerGatewayMethod(
    "taskfold.notifications.advance",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, await store.advanceNotificationEvents(requestParams));
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE3 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.attachments.list",
    async ({ params: requestParams, respond }) => {
      try {
        const result = await store.listAttachments(readId(requestParams));
        respond(true, { ...result, card: redactClaimToken(result.card) });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: READ_SCOPE2 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.attachments.get",
    async ({ params: requestParams, respond }) => {
      try {
        const attachment = await store.getAttachment(readId(requestParams));
        if (!attachment) {
          throw new Error(`attachment not found: ${readId(requestParams)}`);
        }
        respond(true, attachment);
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: READ_SCOPE2 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.attachments.add",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, {
          card: redactClaimToken(await store.addAttachment(readId(requestParams), requestParams))
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE3 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.attachments.delete",
    async ({ params: requestParams, respond }) => {
      try {
        const attachmentId = requestParams.attachmentId;
        if (typeof attachmentId !== "string" || !attachmentId.trim()) {
          throw new Error("attachmentId is required.");
        }
        respond(true, {
          card: redactClaimToken(
            await store.deleteAttachment(readId(requestParams), attachmentId.trim())
          )
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE3 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.workerLog",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, {
          card: redactClaimToken(await store.addWorkerLog(readId(requestParams), requestParams))
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE3 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.protocolViolation",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, {
          card: redactClaimToken(
            await store.recordProtocolViolation(readId(requestParams), requestParams)
          )
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE3 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.archive",
    async ({ params: requestParams, respond }) => {
      try {
        respond(true, {
          card: redactClaimToken(
            await store.archive(readId(requestParams), requestParams.archived)
          )
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE3 }
  );
  api.registerGatewayMethod(
    "taskfold.cards.export",
    async ({ respond }) => {
      try {
        const exported = await store.exportCards();
        respond(true, { ...exported, cards: exported.cards.map(redactClaimToken) });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: READ_SCOPE2 }
  );
}

// src/backend/src/change-events.ts
var TASKFOLD_EXTERNAL_CHANGE_CHECK_MS = 1e3;
function createTaskfoldChangeEventService(store) {
  let timer;
  return {
    id: "taskfold-change-events",
    start(ctx) {
      if (timer) {
        return;
      }
      store.announceChangeEpoch();
      timer = setInterval(() => {
        try {
          store.reconcileExternalChanges();
        } catch (error) {
          ctx.logger.warn(`taskfold external change check failed: ${String(error)}`);
        }
      }, TASKFOLD_EXTERNAL_CHANGE_CHECK_MS);
      timer.unref?.();
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = void 0;
      }
    }
  };
}

// src/backend/src/command.ts
init_contract();
init_card_lookup();
var ADMIN_SCOPE = "operator.admin";
var WRITE_SCOPE4 = "operator.write";
function splitArgs(input) {
  return (input ?? "").trim().split(/\s+/).filter(Boolean);
}
function formatCardLine(card) {
  const boardId = card.metadata?.automation?.boardId ?? "default";
  const milestone = card.milestoneId ? `/${card.milestoneId.slice(0, 8)}` : "/unassigned";
  const agent = card.agentId ? ` @${card.agentId}` : "";
  return `${card.id.slice(0, 8)} ${card.status.padEnd(8)} ${card.priority.padEnd(6)} [${boardId}${milestone}]${agent} ${card.title}`;
}
function formatCardDetails(card) {
  const lines = [
    card.title,
    `id: ${card.id}`,
    `status: ${card.status}`,
    `priority: ${card.priority}`,
    `board: ${card.metadata?.automation?.boardId ?? "default"}`,
    `milestone: ${card.milestoneId ?? "unassigned"}`
  ];
  if (card.agentId) {
    lines.push(`agent: ${card.agentId}`);
  }
  if (card.sessionKey) {
    lines.push(`session: ${card.sessionKey}`);
  }
  if (card.runId) {
    lines.push(`run: ${card.runId}`);
  }
  if (card.notes) {
    lines.push("", card.notes);
  }
  return lines.join("\n");
}
function normalizeTitle2(tokens) {
  return tokens.join(" ").trim();
}
function optionValue(tokens, flag) {
  const index = tokens.indexOf(flag);
  return index >= 0 ? tokens[index + 1] : void 0;
}
function withoutOption(tokens, flag) {
  const index = tokens.indexOf(flag);
  return index >= 0 ? [...tokens.slice(0, index), ...tokens.slice(index + 2)] : tokens;
}
function isTaskfoldStatus(value) {
  return TASKFOLD_STATUSES.includes(value);
}
function canMutateTaskfold(params) {
  const scopes = params.gatewayClientScopes;
  if (scopes) {
    return scopes.includes(ADMIN_SCOPE) || scopes.includes(WRITE_SCOPE4);
  }
  return params.senderIsOwner === true;
}
function requireWriteAccess(params) {
  if (canMutateTaskfold(params)) {
    return void 0;
  }
  return {
    text: `This command requires gateway scope: ${WRITE_SCOPE4}.`,
    isError: true
  };
}
async function handleTaskfoldCommand(params) {
  const [action = "list", ...rest] = splitArgs(params.args);
  if (action === "help") {
    return {
      text: [
        "/taskfold list",
        "/taskfold show <card-id>",
        "/taskfold create <title>",
        "/taskfold move <card-id> --status <status>",
        "/taskfold project list",
        "/taskfold project create <id> <name> [--workspace <path>] [--milestone <title>]",
        "/taskfold project milestone move-card <card-id> --milestone <id|unassigned>",
        "/taskfold dispatch"
      ].join("\n")
    };
  }
  if (action === "list") {
    const cards = (await params.store.list()).filter((card) => !card.metadata?.archivedAt);
    const rows = cards.slice(0, 12).map(formatCardLine);
    return { text: rows.length ? rows.join("\n") : "No Taskfold cards." };
  }
  if (action === "show" || action === "read") {
    const id = rest[0];
    if (!id) {
      return { text: "Usage: /taskfold show <card-id>", isError: true };
    }
    const cards = await params.store.list();
    const { card, error } = resolveTaskfoldCardByIdOrPrefix(cards, id);
    return card ? { text: formatCardDetails(card) } : { text: error, isError: true };
  }
  if (action === "create") {
    const accessError = requireWriteAccess(params);
    if (accessError) {
      return accessError;
    }
    const boardId = optionValue(rest, "--board");
    const milestoneId = optionValue(rest, "--milestone");
    const title = normalizeTitle2(withoutOption(withoutOption(rest, "--board"), "--milestone"));
    if (!title) {
      return { text: "Usage: /taskfold create <title>", isError: true };
    }
    const workspaceAccess = await canonicalizeTaskfoldWorkspaceAccess(
      params.workspaceAccess ?? { unrestricted: true }
    );
    const card = await params.store.create({ title, boardId, milestoneId, workspaceAccess });
    return { text: `Created ${card.id.slice(0, 8)} ${card.title}` };
  }
  if (action === "project") {
    const accessError = requireWriteAccess(params);
    if (accessError) {
      return accessError;
    }
    const [projectAction = "list", ...projectArgs] = rest;
    if (projectAction === "list") {
      const projects = await params.store.listProjects();
      return {
        text: projects.projects.length ? projects.projects.map((project) => `${project.id} ${project.name ?? project.id}`).join("\n") : "No Taskfold projects."
      };
    }
    if (projectAction === "create") {
      const id = projectArgs[0];
      const milestoneTitle = optionValue(projectArgs, "--milestone");
      const workspacePath = optionValue(projectArgs, "--workspace");
      const name = normalizeTitle2(
        withoutOption(withoutOption(projectArgs.slice(1), "--milestone"), "--workspace")
      );
      if (!id || !name) {
        return {
          text: "Usage: /taskfold project create <id> <name> [--workspace <path>] [--milestone <title>]",
          isError: true
        };
      }
      const project = await params.store.createProject({
        id,
        name,
        ...milestoneTitle ? { initialMilestoneTitle: milestoneTitle } : {},
        ...workspacePath ? {
          projectMode: "existing",
          defaultWorkspace: { kind: "dir", path: workspacePath }
        } : {}
      });
      return { text: `Created project ${project.board.id}.` };
    }
    if (projectAction === "milestone") {
      const [milestoneAction, ...milestoneArgs] = projectArgs;
      if (milestoneAction === "move-card") {
        const cardId = milestoneArgs[0];
        const milestoneId = optionValue(milestoneArgs, "--milestone");
        if (!cardId || !milestoneId) {
          return {
            text: "Usage: /taskfold project milestone move-card <card-id> --milestone <id|unassigned>",
            isError: true
          };
        }
        const { card, error } = resolveTaskfoldCardByIdOrPrefix(
          await params.store.list(),
          cardId
        );
        if (!card) {
          return { text: error, isError: true };
        }
        return {
          text: formatCardLine(
            await params.store.moveMilestone(card.id, {
              milestoneId: milestoneId === "unassigned" ? void 0 : milestoneId
            })
          )
        };
      }
      return {
        text: "Usage: /taskfold project milestone move-card <card-id> --milestone <id|unassigned>",
        isError: true
      };
    }
    return { text: `Unknown Taskfold project action: ${projectAction}`, isError: true };
  }
  if (action === "move") {
    const accessError = requireWriteAccess(params);
    if (accessError) {
      return accessError;
    }
    const id = rest[0];
    const statusIndex = rest.indexOf("--status");
    const status = statusIndex >= 0 ? rest[statusIndex + 1] : void 0;
    if (!id || !status) {
      return {
        text: "Usage: /taskfold move <card-id> --status <status>",
        isError: true
      };
    }
    if (!isTaskfoldStatus(status)) {
      return {
        text: `status must be one of: ${TASKFOLD_STATUSES.join(", ")}.`,
        isError: true
      };
    }
    const cards = await params.store.list();
    const { card, error } = resolveTaskfoldCardByIdOrPrefix(cards, id);
    if (!card) {
      return { text: error, isError: true };
    }
    return { text: formatCardLine(await params.store.move(card.id, status, void 0)) };
  }
  if (action === "dispatch") {
    const accessError = requireWriteAccess(params);
    if (accessError) {
      return accessError;
    }
    const workspaceAccess = params.workspaceAccess ?? { unrestricted: true };
    const result = await dispatchAndStartTaskfoldCards({
      store: params.store,
      subagent: params.api.runtime.subagent,
      worktrees: params.api.runtime.worktrees,
      options: {
        materializeWorktree: true,
        resolveAgentWorkspace: params.resolveAgentWorkspace,
        resolveAgentWorkspaceRuntime: params.resolveAgentWorkspaceRuntime,
        workspaceAccess
      }
    });
    return {
      text: [
        `dispatch: started=${result.started.length} failures=${result.startFailures.length} promoted=${result.promoted.length} blocked=${result.blocked.length}`,
        ...result.started.map((run) => `started ${run.cardId.slice(0, 8)} run=${run.runId}`),
        ...result.startFailures.map(
          (failure) => `failed ${failure.cardId.slice(0, 8)} ${failure.error}`
        )
      ].join("\n")
    };
  }
  return { text: `Unknown Taskfold action: ${action}`, isError: true };
}
function registerTaskfoldCommand(params) {
  const sandbox = params.api.runtime.sandbox;
  params.api.registerCommand({
    name: "taskfold",
    description: "List, create, inspect, and dispatch Taskfold cards.",
    acceptsArgs: true,
    exposeSenderIsOwner: true,
    handler: async (ctx) => await handleTaskfoldCommand({
      api: params.api,
      store: params.store,
      args: ctx.args,
      senderIsOwner: ctx.senderIsOwner,
      gatewayClientScopes: ctx.gatewayClientScopes,
      resolveAgentWorkspace: (agentId) => resolveTaskfoldAgentWorkspace(ctx.config, agentId),
      resolveAgentWorkspaceRuntime: (agentId, sessionKey, workspaceDir, modelProvider, modelId) => resolveAgentTaskfoldWorkspaceRuntime({
        config: ctx.config,
        agentId,
        sessionKey,
        workspaceDir,
        modelProvider,
        modelId,
        prepareSandboxWorkspaceAuthority: sandbox?.prepareWorkspaceAuthority
      }),
      workspaceAccess: resolveCommandTaskfoldWorkspaceAccess({
        config: ctx.config,
        agentId: ctx.agentId,
        sessionKey: ctx.sessionKey,
        gatewayClientScopes: ctx.gatewayClientScopes,
        resolveSandboxWorkspaceAuthority: sandbox?.resolveWorkspaceAuthority
      })
    })
  });
}

// src/backend/index.ts
init_project_routed_stores();

// src/backend/src/reconciler.ts
import { formatErrorMessage as formatErrorMessage4 } from "openclaw/plugin-sdk/error-runtime";

// src/backend/src/lifecycle.ts
init_store_constants();
var ABANDONED_RUN_GRACE_MS = 10 * 60 * 1e3;
function claimsRunning(card) {
  return card.status === "running" || card.execution?.status === "running" || Boolean(card.metadata?.attempts?.some((attempt) => attempt.status === "running")) || Boolean(card.metadata?.claim);
}
var TERMINAL_EXECUTION_STATUSES = /* @__PURE__ */ new Set(["done", "review", "blocked"]);
function taskfoldRunEvidence(params) {
  const { card, now } = params;
  if (!claimsRunning(card) || !cardSessionKey(card)) {
    return "unlinked";
  }
  if (card.metadata?.automation?.launch?.phase === "prepared") {
    return "launching";
  }
  const executionStatus = card.execution?.status;
  if (executionStatus && TERMINAL_EXECUTION_STATUSES.has(executionStatus)) {
    return "finished";
  }
  const silentFor = now - taskfoldLastActivityAt(card);
  if (silentFor <= RUNNING_HEARTBEAT_STALE_MS) {
    return "live";
  }
  return silentFor <= RUNNING_HEARTBEAT_STALE_MS + ABANDONED_RUN_GRACE_MS ? "stale" : "abandoned";
}
function staleRunState(card, now) {
  if (taskfoldRunEvidence({ card, now }) !== "stale") {
    return void 0;
  }
  return {
    detectedAt: now,
    lastSessionUpdatedAt: taskfoldLastActivityAt(card),
    reason: "Linked run has not reported recent activity."
  };
}
function getTaskfoldLifecycle(params) {
  const { card, now } = params;
  const state = taskfoldRunEvidence({ card, now });
  if (state === "unlinked" || state === "launching") {
    return { state };
  }
  const sourceUpdatedAt = taskfoldLastActivityAt(card);
  switch (state) {
    case "finished":
      return {
        state,
        ...card.execution?.status === "done" || card.execution?.status === "review" ? { targetStatus: "review" } : { targetStatus: "blocked" },
        sourceUpdatedAt
      };
    case "live":
      return { state, targetStatus: "running", sourceUpdatedAt };
    case "stale":
      return { state, targetStatus: "running", sourceUpdatedAt };
    case "abandoned":
      return { state, targetStatus: "blocked", sourceUpdatedAt };
  }
}
function executionStatusForLifecycle(lifecycle) {
  switch (lifecycle.state) {
    case "live":
    case "stale":
      return "running";
    case "abandoned":
      return "blocked";
    // A finished run's execution status is already the outcome; rewriting it would
    // overwrite a real result (`done`) with a coarser one.
    case "finished":
    case "unlinked":
    // A prepared launch's execution status is a placeholder the host has not
    // accepted yet; there is no run outcome to reflect.
    case "launching":
      return void 0;
  }
}
function shouldCloseOrphanedRun(params) {
  return taskfoldRunEvidence(params) === "abandoned";
}
function shouldSyncCardStatus(card, targetStatus) {
  if (!targetStatus || card.status === targetStatus) {
    return false;
  }
  if (targetStatus === "running") {
    return card.status === "backlog" || card.status === "todo" || card.status === "ready";
  }
  if (targetStatus === "blocked" || targetStatus === "review") {
    return card.status === "running" || card.status === "todo" || card.status === "ready";
  }
  return false;
}
function shouldSyncExecutionStatus(card, targetStatus) {
  return Boolean(card.execution && targetStatus && card.execution.status !== targetStatus);
}

// src/backend/src/reconciler.ts
init_store_constants();
var RECONCILE_INTERVAL_MS = 15e3;
var LAUNCH_ACCEPT_GRACE_MS = 10 * 60 * 1e3;
function hasRunningAttempt(card) {
  return Boolean(card.metadata?.attempts?.some((attempt) => attempt.status === "running"));
}
function activeCards(cards) {
  return cards.filter(
    (card) => !card.metadata?.archivedAt && (card.status === "running" || card.execution?.status === "running" || hasRunningAttempt(card) || Boolean(card.metadata?.claim))
  );
}
async function failStaleLaunch(params) {
  const { store, card, now } = params;
  const launch = card.metadata?.automation?.launch;
  if (launch?.phase !== "prepared" || now - launch.preparedAt <= LAUNCH_ACCEPT_GRACE_MS) {
    return false;
  }
  return await store.failExecutionLaunch(card.id, {
    expectedLaunch: launch,
    reason: "Gateway did not accept this launch within the acceptance window."
  });
}
async function applyLifecycle(params) {
  const { store, card, now } = params;
  const lifecycle = getTaskfoldLifecycle({ card, now });
  const executionStatus = executionStatusForLifecycle(lifecycle);
  const patch = {};
  const metadataPatch = {};
  if (lifecycle.sourceUpdatedAt !== void 0 && shouldSyncCardStatus(card, lifecycle.targetStatus)) {
    patch.status = lifecycle.targetStatus;
    metadataPatch.lifecycleStatusSourceUpdatedAt = lifecycle.sourceUpdatedAt;
  }
  if (shouldSyncExecutionStatus(card, executionStatus)) {
    patch.execution = { ...card.execution, status: executionStatus, updatedAt: now };
  }
  const stale = staleRunState(card, now);
  const existingStale = card.metadata?.stale;
  if (stale) {
    const changed = !existingStale || existingStale.lastSessionUpdatedAt !== stale.lastSessionUpdatedAt || existingStale.reason !== stale.reason;
    if (changed) {
      metadataPatch.stale = { ...stale, detectedAt: existingStale?.detectedAt ?? stale.detectedAt };
    }
  } else if (existingStale) {
    metadataPatch.stale = void 0;
  }
  if (Object.keys(metadataPatch).length > 0) {
    patch.metadata = { ...card.metadata, ...metadataPatch };
  }
  if (Object.keys(patch).length === 0) {
    return false;
  }
  await store.update(card.id, patch, { expectedRevision: card.revision });
  return true;
}
async function finishOrphanedRun(params) {
  const { store, card, runtime, now } = params;
  const runId = cardRunId(card);
  if (!runId || !shouldCloseOrphanedRun({ card, now })) {
    return false;
  }
  await store.finishExecutionForRun(runId, {
    outcome: "failed",
    endedAt: now,
    reason: "Run stopped reporting and did not survive to report an outcome."
  });
  await cleanupTaskfoldRunWorktree({ store, worktrees: runtime.worktrees, runId }).catch(
    () => void 0
  );
  return true;
}
async function reconcileTaskfoldCards(params) {
  const now = params.now ?? Date.now();
  const outcome = {
    checked: 0,
    updated: 0,
    finished: 0,
    reclaimed: 0,
    staleLaunches: 0,
    skipped: 0
  };
  for (const card of activeCards(await params.store.list())) {
    outcome.checked += 1;
    try {
      if (await failStaleLaunch({ store: params.store, card, now })) {
        outcome.staleLaunches += 1;
        continue;
      }
      if (await finishOrphanedRun({ ...params, card, now })) {
        outcome.finished += 1;
        continue;
      }
      if (await applyLifecycle({ ...params, card, now })) {
        outcome.updated += 1;
      }
      if (isTaskfoldClaimReclaimable(card.metadata?.claim, now)) {
        const latest = await params.store.get(card.id);
        if (latest && isTaskfoldClaimReclaimable(latest.metadata?.claim, now)) {
          await params.store.update(
            latest.id,
            { metadata: { ...latest.metadata, claim: void 0 } },
            { expectedRevision: latest.revision }
          );
          outcome.reclaimed += 1;
        }
      }
    } catch (error) {
      outcome.skipped += 1;
      if (!(error instanceof TaskfoldRevisionConflictError)) {
        params.onCardError?.(card.id, error);
      }
    }
  }
  return outcome;
}
function createTaskfoldReconcilerService(params) {
  let timer;
  let running = false;
  let lastFailure = "";
  return {
    id: "taskfold-reconciler",
    start(ctx) {
      if (timer) {
        return;
      }
      const pass = async () => {
        if (running) {
          return;
        }
        running = true;
        try {
          const outcome = await reconcileTaskfoldCards({
            ...params,
            onCardError: (cardId, error) => ctx.logger.warn(
              `taskfold could not reconcile card ${cardId}: ${formatErrorMessage4(error)}`
            )
          });
          lastFailure = "";
          if (outcome.updated || outcome.finished || outcome.reclaimed || outcome.staleLaunches) {
            ctx.logger.info(
              `taskfold reconciled ${outcome.checked} active cards: ${outcome.updated} updated, ${outcome.finished} orphaned runs closed, ${outcome.reclaimed} claims reclaimed, ${outcome.staleLaunches} stale launches failed, ${outcome.skipped} skipped.`
            );
          }
        } catch (error) {
          const message = formatErrorMessage4(error);
          if (message !== lastFailure) {
            lastFailure = message;
            ctx.logger.warn(`taskfold reconcile failed: ${message}`);
          }
        } finally {
          running = false;
        }
      };
      void pass();
      timer = setInterval(() => void pass(), RECONCILE_INTERVAL_MS);
      timer.unref?.();
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = void 0;
      }
    }
  };
}

// src/backend/src/sqlite-migration-check.ts
import fs11 from "node:fs";
import path18 from "node:path";
function createTaskfoldSqliteMigrationCheckService(pluginDir) {
  return {
    id: "taskfold-sqlite-migration-check",
    start(ctx) {
      const sqlitePath = path18.join(pluginDir, "taskfold.sqlite");
      const projectsJsonPath = path18.join(pluginDir, "projects.json");
      if (fs11.existsSync(sqlitePath) && !fs11.existsSync(projectsJsonPath)) {
        ctx.logger.warn(
          `taskfold: ${sqlitePath} exists but ${projectsJsonPath} does not: Taskfold now stores data in files and your SQLite data has not been migrated yet. Run "openclaw taskfold migrate-sqlite --dry-run" to preview, then "openclaw taskfold migrate-sqlite --apply".`
        );
      }
    }
  };
}

// ../core/src/store-dispatch.ts
import { randomUUID as randomUUID13 } from "node:crypto";
init_store_constants();

// ../core/src/store-projects.ts
init_contract();
import { randomUUID as randomUUID12 } from "node:crypto";
import { stat } from "node:fs/promises";
init_store_constants();

// ../core/src/store-workflow.ts
init_sdk_utils();
import { randomUUID as randomUUID11 } from "node:crypto";
import { isDeepStrictEqual as isDeepStrictEqual2 } from "node:util";
init_store_constants();

// ../core/src/store-promote.ts
import { randomUUID as randomUUID10 } from "node:crypto";
init_store_constants();

// ../core/src/store-enrichment.ts
import { randomUUID as randomUUID9 } from "node:crypto";
init_store_constants();
var TaskfoldEnrichmentStore = class extends TaskfoldCoreStore {
  async addProof(id, input, scope) {
    const now = Date.now();
    const proof = normalizeProofInput(input, now);
    return await this.updateMetadata(
      id,
      (existing) => {
        assertCanMutateClaimedCard(existing, scope);
        const metadata = clearDiagnostics(existing.metadata, ["missing_proof"]);
        return {
          ...metadata,
          proof: [...metadata.proof ?? [], proof].slice(-MAX_CARD_PROOF)
        };
      },
      { preserveProofId: proof.id }
    );
  }
  async addProofWithArtifact(id, proofInput, artifactInput, scope) {
    const now = Date.now();
    const proof = normalizeProofInput(proofInput, now);
    const artifact = normalizeArtifact({ ...artifactInput, createdAt: now });
    if (!artifact) {
      throw new Error("artifact url or path is required.");
    }
    return await this.updateMetadata(
      id,
      (existing) => {
        assertCanMutateClaimedCard(existing, scope);
        const metadata = clearDiagnostics(existing.metadata, ["missing_proof"]);
        return {
          ...metadata,
          proof: [...metadata.proof ?? [], proof].slice(-MAX_CARD_PROOF),
          artifacts: [...metadata.artifacts ?? [], artifact].slice(-MAX_CARD_ARTIFACTS)
        };
      },
      { preserveProofId: proof.id }
    );
  }
  async addArtifact(id, input, scope) {
    const artifact = normalizeArtifact({ ...input, createdAt: Date.now() });
    if (!artifact) {
      throw new Error("artifact url or path is required.");
    }
    return await this.updateMetadata(id, (existing) => {
      assertCanMutateClaimedCard(existing, scope);
      const metadata = clearDiagnostics(existing.metadata, ["missing_proof"]);
      return {
        ...metadata,
        artifacts: [...metadata.artifacts ?? [], artifact].slice(-MAX_CARD_ARTIFACTS)
      };
    });
  }
  async deleteProof(id, proofId, scope) {
    return await this.updateMetadata(id, (existing) => {
      assertCanMutateClaimedCard(existing, scope);
      const proof = existing.metadata?.proof ?? [];
      if (!proof.some((entry) => entry.id === proofId)) {
        throw new Error(`proof not found: ${proofId}`);
      }
      return {
        ...existing.metadata,
        proof: proof.filter((entry) => entry.id !== proofId)
      };
    });
  }
  async deleteArtifact(id, artifactId, scope) {
    return await this.updateMetadata(id, (existing) => {
      assertCanMutateClaimedCard(existing, scope);
      const artifacts = existing.metadata?.artifacts ?? [];
      if (!artifacts.some((entry) => entry.id === artifactId)) {
        throw new Error(`artifact not found: ${artifactId}`);
      }
      return {
        ...existing.metadata,
        artifacts: artifacts.filter((entry) => entry.id !== artifactId)
      };
    });
  }
  async addAttachment(id, input, scope) {
    return await this.retryOnRevisionConflict(async () => await this.enqueueMutation(async () => {
      const existing = await this.get(id);
      if (!existing) {
        throw new Error(`card not found: ${id}`);
      }
      assertCanMutateClaimedCard(existing, scope);
      const now = Date.now();
      const { attachment, contentBase64 } = normalizeAttachmentInput(id, input, now);
      await this.attachmentStore.register(attachment.id, {
        version: 1,
        attachment,
        contentBase64
      });
      try {
        const updated = await this.updateCard(id, {
          metadata: {
            ...clearDiagnostics(existing.metadata, ["missing_proof"]),
            attachments: [...existing.metadata?.attachments ?? [], attachment].slice(
              -MAX_CARD_ATTACHMENTS
            )
          }
        }, { expectedRevision: existing.revision });
        if (!updated.metadata?.attachments?.some((entry) => entry.id === attachment.id)) {
          await this.attachmentStore.delete(attachment.id);
          throw new Error("attachment metadata was trimmed before it could be indexed.");
        }
        return updated;
      } catch (error) {
        await this.attachmentStore.delete(attachment.id);
        throw error;
      }
    }));
  }
  async listAttachments(id) {
    const card = await this.get(id);
    if (!card) {
      throw new Error(`card not found: ${id}`);
    }
    return { card, attachments: card.metadata?.attachments ?? [] };
  }
  async getAttachment(id) {
    const attachmentId = id.trim();
    const entry = await this.attachmentStore.lookup(attachmentId);
    return entry?.version === 1 ? entry : void 0;
  }
  async deleteAttachment(cardId, attachmentId, scope) {
    return await this.retryOnRevisionConflict(async () => await this.enqueueMutation(async () => {
      const existing = await this.get(cardId);
      if (!existing) {
        throw new Error(`card not found: ${cardId}`);
      }
      assertCanMutateClaimedCard(existing, scope);
      const attachments = existing.metadata?.attachments ?? [];
      if (!attachments.some((attachment) => attachment.id === attachmentId)) {
        throw new Error(`attachment not found: ${attachmentId}`);
      }
      await this.attachmentStore.delete(attachmentId);
      return await this.updateCard(
        cardId,
        {
          metadata: {
            ...existing.metadata,
            attachments: attachments.filter((attachment) => attachment.id !== attachmentId)
          }
        },
        { expectedRevision: existing.revision }
      );
    }));
  }
  async addWorkerLog(id, input, scope) {
    const now = Date.now();
    const message = normalizeBoundedString(input.message, void 0, 800, "worker log message");
    if (!message) {
      throw new Error("worker log message is required.");
    }
    const level = input.level === "warning" || input.level === "error" || input.level === "info" ? input.level : "info";
    const sessionKey = normalizeBoundedString(input.sessionKey, void 0, 240, "session key");
    const runId = normalizeBoundedString(input.runId, void 0, 160, "run id");
    const log = {
      id: randomUUID9(),
      level,
      message,
      createdAt: now,
      ...sessionKey ? { sessionKey } : {},
      ...runId ? { runId } : {}
    };
    return await this.updateMetadata(id, (existing) => {
      assertCanMutateClaimedCard(existing, scope);
      return {
        ...existing.metadata,
        workerLogs: [...existing.metadata?.workerLogs ?? [], log].slice(-MAX_CARD_WORKER_LOGS)
      };
    });
  }
  async recordProtocolViolation(id, input = {}, scope) {
    return await this.retryOnRevisionConflict(async () => await this.enqueueMutation(async () => {
      const card = await this.get(id);
      if (!card) {
        throw new Error(`card not found: ${id}`);
      }
      assertCanMutateClaimedCard(card, scope);
      const now = Date.now();
      const detail = normalizeBoundedString(input.detail, void 0, 800, "protocol violation detail") ?? "Worker stopped without completing or blocking the card.";
      const sessionKey = normalizeBoundedString(input.sessionKey, void 0, 240, "session key");
      const runId = normalizeBoundedString(input.runId, void 0, 160, "run id");
      const log = {
        id: randomUUID9(),
        level: "error",
        message: detail,
        createdAt: now,
        ...sessionKey ? { sessionKey } : {},
        ...runId ? { runId } : {}
      };
      const execution = card.execution?.status === "running" ? { ...card.execution, status: "blocked", updatedAt: now } : card.execution;
      const attempts = closeRunningAttempts(card.metadata?.attempts, now, "blocked", detail);
      const notification = {
        id: randomUUID9(),
        kind: "failed",
        createdAt: now,
        sequence: this.nextNotificationSequence(now),
        message: capText(detail, 240) ?? "Worker protocol violation.",
        ...sessionKey || cardSessionKey(card) ? { sessionKey: sessionKey ?? cardSessionKey(card) } : {},
        ...runId || cardRunId(card) ? { runId: runId ?? cardRunId(card) } : {}
      };
      return await this.updateCard(card.id, {
        status: card.status === "done" ? card.status : "blocked",
        ...execution ? { execution } : {},
        metadata: {
          ...card.metadata,
          workerLogs: [...card.metadata?.workerLogs ?? [], log].slice(-MAX_CARD_WORKER_LOGS),
          workerProtocol: {
            state: "violated",
            updatedAt: now,
            detail
          },
          claim: void 0,
          ...attempts ? { attempts } : {},
          failureCount: (card.metadata?.failureCount ?? 0) + 1,
          notifications: [...card.metadata?.notifications ?? [], notification].slice(
            -MAX_CARD_NOTIFICATIONS
          )
        }
      }, { expectedRevision: card.revision });
    }));
  }
};

// ../core/src/store-promote.ts
var TaskfoldPromoteStore = class extends TaskfoldEnrichmentStore {
  async promoteReady(now = Date.now()) {
    return await this.enqueueMutation(async () => {
      const promoted = [];
      for (const card of await this.list()) {
        const next = await this.promoteDependencyReady(card.id, now);
        if (next.status !== card.status) {
          promoted.push(next);
        }
      }
      return { cards: promoted, count: promoted.length };
    });
  }
  /**
   * 改卡片状态。`options.expectedRevision`（TASK-8，VS Code 看板的拖拽 CAS）：给了就只在卡片
   * 仍是这个 revision 时写入，否则抛 {@link TaskfoldRevisionConflictError}、不重试；不给时
   * 行为与原来逐字相同（以刚读到的 revision 做 CAS，输给并发写入就重读重试）。
   */
  async move(id, status, position, scope, options = {}) {
    const run = async () => await this.enqueueMutation(async () => {
      const existing = await this.get(id);
      if (!existing) {
        throw new Error(`card not found: ${id}`);
      }
      assertCanMutateClaimedCard(existing, scope);
      return await this.updateCard(
        id,
        { status },
        {
          allowMetadataDependencyLinks: false,
          enforceStatusHolds: true,
          expectedRevision: options.expectedRevision ?? existing.revision
        }
      );
    });
    return options.expectedRevision !== void 0 ? await run() : await this.retryOnRevisionConflict(run);
  }
  async promote(id, input = {}, scope) {
    return await this.retryOnRevisionConflict(async () => await this.enqueueMutation(async () => {
      const existing = await this.get(id);
      if (!existing) {
        throw new Error(`card not found: ${id}`);
      }
      assertCanMutateClaimedCard(existing, scope === null ? void 0 : scope);
      const reason = normalizeBoundedString(input.reason, void 0, 1e3, "promote reason");
      const comments = reason ? [
        ...existing.metadata?.comments ?? [],
        { id: randomUUID10(), body: reason, createdAt: Date.now() }
      ].slice(-MAX_CARD_COMMENTS) : existing.metadata?.comments;
      return await this.updateCard(
        id,
        {
          status: "ready",
          metadata: {
            ...clearDiagnostics(existing.metadata, ["stranded_ready", "blocked_too_long"]),
            comments,
            stale: null
          }
        },
        { enforceStatusHolds: input.force !== true, expectedRevision: existing.revision }
      );
    }));
  }
};

// ../core/src/store-workflow.ts
function assertClaimIdentity(claim, input) {
  const token = normalizeOptionalString(input.token);
  const ownerId = normalizeOptionalString(input.ownerId);
  if (token && !safeEqualSecret(token, claim.token)) {
    throw new Error("claim token does not match.");
  }
  if (!token && ownerId && ownerId !== claim.ownerId) {
    throw new Error("claim owner does not match.");
  }
}
function taskfoldInstanceId() {
  return resolveGlobalSingleton(Symbol.for("taskfold.instanceId"), () => randomUUID11());
}
function preparedLaunchMatchesCard(card, expected) {
  const launch = card.metadata?.automation?.launch;
  return launch?.phase === "prepared" && launch.requestedSessionKey === expected.requestedSessionKey && launch.provisionalRunId === expected.provisionalRunId && launch.preparedAt === expected.preparedAt && launch.preparedBy === expected.preparedBy && card.sessionKey === expected.requestedSessionKey && card.runId === expected.provisionalRunId && card.execution?.sessionKey === expected.requestedSessionKey && card.execution?.runId === expected.provisionalRunId;
}
function executionAssociationPatch(card, input) {
  if (cardSessionKey(card) !== input.expectedSessionKey || cardRunId(card) !== input.expectedRunId) {
    return void 0;
  }
  const attempts = [...card.metadata?.attempts ?? []];
  const attemptIndex = attempts.findLastIndex(
    (attempt) => attempt.status === "running" && (input.expectedRunId && attempt.runId === input.expectedRunId || !input.expectedRunId && input.expectedSessionKey && attempt.sessionKey === input.expectedSessionKey)
  );
  if (attemptIndex >= 0) {
    const attempt = attempts[attemptIndex];
    if (attempt) {
      attempts[attemptIndex] = {
        ...attempt,
        id: input.runId ?? attempt.id,
        sessionKey: input.sessionKey,
        ...input.runId ? { runId: input.runId } : {}
      };
    }
  }
  const metadata = attemptIndex >= 0 || input.launch ? {
    ...card.metadata,
    ...attemptIndex >= 0 ? { attempts } : {},
    ...input.launch ? { automation: { ...card.metadata?.automation, launch: input.launch } } : {}
  } : void 0;
  return {
    sessionKey: input.sessionKey,
    ...input.runId ? { runId: input.runId } : {},
    execution: input.execution,
    ...metadata ? { metadata } : {}
  };
}
var TaskfoldWorkflowStore = class extends TaskfoldPromoteStore {
  async claimExecution(id, input) {
    const ownerId = normalizeBoundedString(input.ownerId, void 0, 120, "claim owner");
    if (!ownerId) {
      throw new Error("claim ownerId is required.");
    }
    if (typeof input.expectedRevision !== "number" || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
      throw new Error("expectedRevision is required.");
    }
    const expectedRevision = input.expectedRevision;
    const ttlSeconds = typeof input.ttlSeconds === "number" && Number.isFinite(input.ttlSeconds) ? Math.max(1, Math.trunc(input.ttlSeconds)) : void 0;
    return await this.enqueueMutation(async () => {
      const existing = await this.get(id);
      if (!existing) {
        throw new Error(`card not found: ${id}`);
      }
      if (existing.revision !== expectedRevision) {
        throw new TaskfoldRevisionConflictError(id, expectedRevision);
      }
      if (existing.metadata?.archivedAt) {
        throw new Error("card is archived.");
      }
      if (await this.isProjectArchived(cardBoardId(existing))) {
        throw new Error("project is archived and cannot start new work.");
      }
      if (existing.execution?.status === "running" || existing.metadata?.attempts?.some((attempt) => attempt.status === "running")) {
        throw new Error("card already has an active execution.");
      }
      const now = Date.now();
      const existingClaim = existing.metadata?.claim;
      if (existingClaim && (isFutureDateTimestampMs(existingClaim.expiresAt, { nowMs: now }) || !isTaskfoldClaimReclaimable(existingClaim, now))) {
        throw new Error(`card already claimed by ${existingClaim.ownerId}.`);
      }
      const token = randomUUID11();
      const expiresAt = addTaskfoldDurationMs(
        now,
        ttlSeconds ? secondsToDurationMs(ttlSeconds) : DEFAULT_CLAIM_TTL_MS
      );
      const card = await this.updateCard(
        id,
        {
          metadata: {
            ...clearDiagnostics(existing.metadata, ["stranded_ready"]),
            claim: { ownerId, token, claimedAt: now, lastHeartbeatAt: now, expiresAt }
          }
        },
        // Admission decision: the database, not this process, decides who won.
        { expectedRevision }
      );
      return { card, token };
    });
  }
  /**
   * Opens the `absent -> prepared` edge of the launch state machine (需求
   * /15.7-会话生命周期设计.md §5, edge ①): writes the requested
   * `sessionKey`/`runId`/`execution` before the dispatcher hands the card to
   * `subagent.run()`, so a process death in that window leaves durable
   * evidence instead of a silently orphaned claim. Named `openExecutionLaunch`
   * rather than `prepareExecutionLaunch`, as the extension this codebase was
   * adapted from names the equivalent method (see UPSTREAM.md), because Taskfold
   * already has `prepareTaskfoldCardExecution` (card-execution.ts) for a
   * read-only, non-writing preflight — two differently-behaved `prepare*`
   * names on the same card would mislead readers (需求/15.7 §7 步骤 2).
   *
   * Admission is claim scope (`assertCanMutateClaimedCard`), not revision CAS
   * — matching the other claim-scoped mutators in this file (`stopExecution`,
   * `block`, `reclaim`, ...) rather than the CAS-guarded `claimExecution`/
   * `claim`, because the thing being admitted here is "does the caller still
   * hold the claim", not "did the caller win a race for it".
   */
  async openExecutionLaunch(id, input) {
    const requestedSessionKey = normalizeBoundedString(
      input.requestedSessionKey,
      void 0,
      240,
      "requested session key"
    );
    if (!requestedSessionKey) {
      throw new Error("requestedSessionKey is required.");
    }
    return await this.retryOnRevisionConflict(async () => await this.enqueueMutation(async () => {
      const existing = await this.get(id);
      if (!existing) {
        throw new Error(`card not found: ${id}`);
      }
      assertCanMutateClaimedCard(existing, input.scope === null ? void 0 : input.scope);
      const claimToken = existing.metadata?.claim?.token;
      if (!claimToken) {
        throw new Error("card must be claimed before opening an execution launch.");
      }
      const now = Date.now();
      const provisionalRunId = `taskfold:${existing.id}:${claimToken}`;
      const launch = {
        phase: "prepared",
        requestedSessionKey,
        provisionalRunId,
        preparedAt: now,
        preparedBy: taskfoldInstanceId()
      };
      const execution = {
        id: existing.execution?.id ?? `${existing.id}:agent-session`,
        kind: "agent-session",
        mode: existing.execution?.mode ?? "autonomous",
        status: "running",
        ...existing.execution?.engine ? { engine: existing.execution.engine } : {},
        ...existing.execution?.model ? { model: existing.execution.model } : {},
        sessionKey: requestedSessionKey,
        runId: provisionalRunId,
        startedAt: existing.execution?.startedAt ?? existing.startedAt ?? now,
        updatedAt: now
      };
      const card = await this.updateCard(
        id,
        {
          sessionKey: requestedSessionKey,
          runId: provisionalRunId,
          execution,
          metadata: {
            ...existing.metadata,
            automation: { ...existing.metadata?.automation, launch }
          }
        },
        { allowAutomationLaunch: true, expectedRevision: existing.revision }
      );
      const persisted = card.metadata?.automation?.launch;
      if (persisted?.phase !== "prepared") {
        throw new Error("prepared execution launch was not persisted.");
      }
      return { card, launch: persisted };
    }));
  }
  /**
   * Advances a `prepared` launch to `accepted` (§5 edge ②) once
   * `subagent.run()` resolves. Rejects — returns `undefined`, does not throw —
   * when `input.expectedLaunch` no longer matches the card's current launch
   * identity, which is the expected, race-driven outcome of a concurrent
   * redispatch (or a duplicate/late accept call) having already moved the
   * card on; mirrors this file's existing `finishExecutionForRun` precedent of
   * signalling "no longer applicable" through the return value rather than an
   * exception. Guarded with `retryOnRevisionConflict` because the identity
   * check must be re-run against the latest card on every compare-and-swap
   * retry, not just the first read (same reasoning as `claim`/`claimOnce`).
   */
  async acceptExecutionLaunch(id, input) {
    const acceptedAt = typeof input.acceptedAt === "number" && Number.isFinite(input.acceptedAt) && input.acceptedAt >= 0 ? Math.trunc(input.acceptedAt) : void 0;
    if (acceptedAt === void 0) {
      throw new Error("acceptedAt is required.");
    }
    const sessionKey = normalizeBoundedString(
      input.sessionKey,
      void 0,
      240,
      "accepted session key"
    );
    if (!sessionKey) {
      throw new Error("sessionKey is required.");
    }
    const runId = normalizeBoundedString(input.runId, void 0, 160, "accepted run id");
    const engine = normalizeBoundedString(input.engine, void 0, 160, "accepted engine");
    const model = normalizeBoundedString(input.model, void 0, 160, "accepted model");
    const expectedLaunch = input.expectedLaunch;
    return await this.retryOnRevisionConflict(async () => {
      return await this.enqueueMutation(async () => {
        const existing = await this.get(id);
        if (!existing) {
          throw new Error(`card not found: ${id}`);
        }
        if (!preparedLaunchMatchesCard(existing, expectedLaunch) || acceptedAt < expectedLaunch.preparedAt) {
          return void 0;
        }
        const now = Date.now();
        const nextEngine = engine ?? existing.execution?.engine;
        const nextModel = model ?? existing.execution?.model;
        const execution = {
          id: existing.execution?.id ?? `${existing.id}:agent-session`,
          kind: "agent-session",
          mode: existing.execution?.mode ?? "autonomous",
          status: "running",
          ...nextEngine ? { engine: nextEngine } : {},
          ...nextModel ? { model: nextModel } : {},
          sessionKey,
          ...runId ? { runId } : {},
          startedAt: existing.execution?.startedAt ?? existing.startedAt ?? now,
          updatedAt: now
        };
        const launch = {
          ...expectedLaunch,
          phase: "accepted",
          acceptedAt,
          acceptedSessionKey: sessionKey,
          ...runId ? { acceptedRunId: runId } : {}
        };
        const patch = executionAssociationPatch(existing, {
          expectedSessionKey: expectedLaunch.requestedSessionKey,
          expectedRunId: expectedLaunch.provisionalRunId,
          sessionKey,
          runId,
          execution,
          launch
        });
        if (!patch) {
          return void 0;
        }
        return await this.updateCard(id, patch, {
          allowAutomationLaunch: true,
          expectedRevision: existing.revision
        });
      });
    });
  }
  /**
   * Advances a `prepared` launch to `failed` (§5 edge ③/④) and fully clears
   * the execution association — `sessionKey`/`runId`/`execution` all go to
   * `null`, not merely to a "blocked" status — because a `prepared` run never
   * actually started on the host: leaving a stale sessionKey/runId behind
   * would let a later, unrelated host event appear to match this card. Like
   * {@link acceptExecutionLaunch}, a stale `expectedLaunch` resolves to `false`
   * rather than throwing, for the same concurrent-redispatch reason.
   */
  async failExecutionLaunch(id, input) {
    const reason = normalizeBoundedString(input.reason, void 0, 800, "launch failure reason") ?? "Prepared launch failed.";
    const failedAtInput = typeof input.failedAt === "number" && Number.isFinite(input.failedAt) && input.failedAt >= 0 ? Math.trunc(input.failedAt) : Date.now();
    const expectedLaunch = input.expectedLaunch;
    return await this.retryOnRevisionConflict(async () => {
      return await this.enqueueMutation(async () => {
        const existing = await this.get(id);
        if (!existing) {
          throw new Error(`card not found: ${id}`);
        }
        if (!preparedLaunchMatchesCard(existing, expectedLaunch)) {
          return false;
        }
        const failedAt = Math.max(failedAtInput, expectedLaunch.preparedAt);
        const metadata = existing.metadata ?? {};
        const launch = {
          ...expectedLaunch,
          phase: "failed",
          failedAt,
          reason
        };
        const nextStatus = existing.status === "running" ? "blocked" : existing.status;
        await this.updateCard(
          id,
          {
            status: nextStatus,
            sessionKey: null,
            runId: null,
            execution: null,
            metadata: {
              ...metadata,
              claim: void 0,
              attempts: closeRunningAttempts(metadata.attempts, failedAt, "blocked", reason),
              automation: { ...metadata.automation, launch }
            }
          },
          { allowAutomationLaunch: true, expectedRevision: existing.revision }
        );
        return true;
      });
    });
  }
  async stopExecution(id, input = {}) {
    return await this.retryOnRevisionConflict(async () => await this.enqueueMutation(async () => {
      const existing = await this.get(id);
      if (!existing) {
        throw new Error(`card not found: ${id}`);
      }
      const expectedRunId = normalizeOptionalString(input.expectedRunId);
      const runId = cardRunId(existing);
      if (expectedRunId && expectedRunId !== runId) {
        throw new Error("card execution changed before it could be stopped.");
      }
      if (existing.execution?.status !== "running") {
        throw new Error("card has no active execution.");
      }
      const now = Date.now();
      const reason = normalizeBoundedString(input.reason, void 0, 1e3, "stop reason") ?? "Taskfold execution stopped by operator.";
      return await this.updateCard(
        id,
        {
          execution: { ...existing.execution, status: "blocked", updatedAt: now },
          metadata: {
            ...existing.metadata,
            claim: void 0,
            attempts: closeRunningAttempts(existing.metadata?.attempts, now, "stopped", reason),
            comments: [
              ...existing.metadata?.comments ?? [],
              { id: randomUUID11(), body: reason, createdAt: now }
            ].slice(-MAX_CARD_COMMENTS)
          }
        },
        { expectedRevision: existing.revision }
      );
    }));
  }
  /**
   * Resolves a run's terminal outcome onto whichever card it belongs to
   * (edge ⑪, 需求/15.7-会话生命周期设计.md §5). `runId` alone was sufficient
   * before the launch state machine, when a card's `runId` was always the
   * host's own. Now a card can still hold `openExecutionLaunch`'s provisional
   * placeholder if a Gateway restart landed between `prepared` and
   * `accepted` — a host-issued `runId` the card never recorded would then
   * silently match nothing. `targetSessionKey` (see `session-link.ts`) is the
   * fallback for exactly that case; at least one of the two is required.
   */
  async finishExecutionForRun(runId, input = {}) {
    const normalizedRunId = normalizeOptionalString(runId);
    const targetSessionKey = normalizeOptionalString(input.targetSessionKey);
    if (!normalizedRunId && !targetSessionKey) {
      throw new Error("runId or targetSessionKey is required.");
    }
    return await this.retryOnRevisionConflict(async () => await this.enqueueMutation(async () => {
      const existing = (await this.list()).find(
        (candidate) => taskfoldCardMatchesLifecycleLink(candidate, {
          runId: normalizedRunId,
          sessionKey: targetSessionKey
        })
      );
      if (!existing) {
        return void 0;
      }
      if (existing.execution?.status !== "running") {
        return existing;
      }
      const now = Date.now();
      const endedAt = typeof input.endedAt === "number" && Number.isSafeInteger(input.endedAt) && input.endedAt >= 0 ? Math.min(input.endedAt, now) : now;
      const outcome = normalizeOptionalString(input.outcome)?.toLowerCase();
      const succeeded = outcome === "ok";
      const reason = normalizeBoundedString(input.reason, void 0, 1e3, "execution end reason") ?? (succeeded ? void 0 : `Taskfold execution ended with ${outcome || "an unknown"} outcome.`);
      return await this.updateCard(
        existing.id,
        {
          execution: {
            ...existing.execution,
            status: succeeded ? "done" : "blocked",
            updatedAt: endedAt
          },
          metadata: {
            ...existing.metadata,
            claim: void 0,
            attempts: closeRunningAttempts(
              existing.metadata?.attempts,
              endedAt,
              succeeded ? "succeeded" : "blocked",
              reason
            )
          }
        },
        { expectedRevision: existing.revision }
      );
    }));
  }
  async claim(id, input, options = {}) {
    const ownerId = normalizeBoundedString(input.ownerId, void 0, 120, "claim owner");
    if (!ownerId) {
      throw new Error("claim ownerId is required.");
    }
    const ttlSeconds = typeof input.ttlSeconds === "number" && Number.isFinite(input.ttlSeconds) ? Math.max(1, Math.trunc(input.ttlSeconds)) : void 0;
    const token = normalizeBoundedString(input.token, void 0, 160, "claim token") ?? randomUUID11();
    const progress = { claimed: false };
    return await this.retryOnRevisionConflict(
      async () => await this.claimOnce(id, { ownerId, ttlSeconds, token }, options, progress)
    );
  }
  async claimOnce(id, input, options, progress) {
    const { ownerId, ttlSeconds, token } = input;
    return await this.enqueueMutation(async () => {
      const now = Date.now();
      const expiresAt = addTaskfoldDurationMs(
        now,
        ttlSeconds ? secondsToDurationMs(ttlSeconds) : DEFAULT_CLAIM_TTL_MS
      );
      const guarded = await this.promoteDependencyReady(id, now);
      if (progress.claimed && guarded.metadata?.claim?.token === token) {
        return { card: await this.markClaimedCardRunning(guarded, ownerId), token };
      }
      if (guarded.metadata?.archivedAt) {
        throw new Error("card is archived.");
      }
      if (await this.isProjectArchived(cardBoardId(guarded))) {
        throw new Error("project is archived and cannot start new work.");
      }
      const expectedAuthority = options.expectedAuthority;
      if (expectedAuthority && (guarded.status !== expectedAuthority.status || cardBoardId(guarded) !== expectedAuthority.boardId || guarded.agentId !== expectedAuthority.agentId || !isDeepStrictEqual2(
        guarded.metadata?.automation?.workspace,
        expectedAuthority.workspace
      ) || !isDeepStrictEqual2(
        guarded.metadata?.automation?.workspaceAccess,
        expectedAuthority.workspaceAccess
      ))) {
        throw new Error("card workspace authority changed before claim.");
      }
      const existingClaim = guarded.metadata?.claim;
      const activeClaim = existingClaim && (isFutureDateTimestampMs(existingClaim.expiresAt, { nowMs: now }) || // Direct claims must honor the same running-worker heartbeat grace
      // as dispatcher recovery; otherwise they silently steal live tokens.
      guarded.status === "running" && !isTaskfoldClaimReclaimable(existingClaim, now)) ? existingClaim : void 0;
      if (cardParentIds(guarded).length > 0 && guarded.status !== "ready" && !activeClaim) {
        throw new Error("card dependencies are not done.");
      }
      if (guarded.status === "scheduled") {
        throw new Error("card is scheduled for later.");
      }
      if (retryBudgetExhausted(guarded)) {
        throw new Error("card exhausted its retry budget.");
      }
      if (activeClaim) {
        throw new Error(`card already claimed by ${activeClaim.ownerId}.`);
      }
      const claimable = options.adoptWorkspaceAccess && !guarded.metadata?.automation?.workspaceAccess ? await this.updateCard(id, { workspaceAccess: options.adoptWorkspaceAccess }) : guarded;
      const metadata = clearDiagnostics(claimable.metadata, ["stranded_ready"]);
      const card = await this.updateCard(
        id,
        {
          metadata: {
            ...metadata,
            claim: { ownerId, token, claimedAt: now, lastHeartbeatAt: now, expiresAt }
          }
        },
        // Close the window between deciding the card is unclaimed and writing the
        // claim. Another Gateway process claiming in that gap loses this swap
        // instead of silently overwriting a live worker's token.
        { expectedRevision: claimable.revision }
      );
      progress.claimed = true;
      return { card: await this.markClaimedCardRunning(card, ownerId), token };
    });
  }
  async markClaimedCardRunning(card, ownerId) {
    return await this.updateCard(
      card.id,
      {
        status: card.status === "backlog" || card.status === "todo" || card.status === "ready" ? "running" : card.status,
        agentId: card.agentId ?? ownerId
      },
      { expectedRevision: card.revision }
    );
  }
  async heartbeat(id, input) {
    const note = normalizeBoundedString(input.note, void 0, 400, "heartbeat note");
    const card = await this.updateMetadata(id, (existing) => {
      const claim = existing.metadata?.claim;
      if (!claim) {
        throw new Error("card is not claimed.");
      }
      const now = Math.max(Date.now(), claim.lastHeartbeatAt + 1);
      assertClaimIdentity(claim, input);
      const nextClaim = {
        ...claim,
        lastHeartbeatAt: now,
        expiresAt: claim.expiresAt ? addTaskfoldDurationMs(
          now,
          Math.max(
            1,
            claim.expiresAt > claim.claimedAt ? claim.expiresAt - claim.lastHeartbeatAt : DEFAULT_CLAIM_TTL_MS
          )
        ) : void 0
      };
      const metadata = clearDiagnostics(existing.metadata, ["running_without_heartbeat"]);
      return {
        ...metadata,
        claim: removeUndefinedMetadataFields({ claim: nextClaim }).claim,
        comments: note ? [...metadata.comments ?? [], { id: randomUUID11(), body: note, createdAt: now }].slice(
          -MAX_CARD_COMMENTS
        ) : metadata.comments
      };
    });
    return card;
  }
  async releaseClaim(id, input = {}) {
    return await this.retryOnRevisionConflict(async () => await this.enqueueMutation(async () => {
      const existing = await this.get(id);
      if (!existing) {
        throw new Error(`card not found: ${id}`);
      }
      const status = input.status === void 0 ? existing.status : normalizeStatus(input.status, existing.status);
      const claim = existing.metadata?.claim;
      if (claim) {
        assertClaimIdentity(claim, input);
      }
      return await this.updateCard(
        id,
        {
          status,
          metadata: { ...existing.metadata, claim: void 0 }
        },
        { enforceStatusHolds: input.status !== void 0, expectedRevision: existing.revision }
      );
    }));
  }
  async complete(id, input = {}, scope = input) {
    return await this.retryOnRevisionConflict(
      async () => await this.enqueueMutation(async () => await this.completeDirect(id, input, scope))
    );
  }
  async completeDirect(id, input = {}, scope = input) {
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`card not found: ${id}`);
    }
    assertCanMutateClaimedCard(existing, scope === null ? void 0 : scope);
    const now = Date.now();
    const createdCardIds = normalizeStringList(input.createdCardIds, "created card ids", 120);
    const childIds = cardChildIds(existing);
    for (const createdCardId of createdCardIds) {
      const createdCard = await this.get(createdCardId);
      if (!createdCard) {
        throw new Error(`created card not found: ${createdCardId}`);
      }
      const linkedFromParent = childIds.includes(createdCardId) && cardParentIds(createdCard).includes(existing.id);
      if (!linkedFromParent) {
        throw new Error(`created card is not linked to this card: ${createdCardId}`);
      }
    }
    const summary = normalizeBoundedString(input.summary, void 0, 2e3, "summary");
    const proofInput = input.proof && typeof input.proof === "object" && !Array.isArray(input.proof) ? input.proof : void 0;
    const proofId = normalizeBoundedString(input.proofId, void 0, 120, "proof id");
    if (input.proofId !== void 0 && !proofId) {
      throw new Error("proofId must be a non-empty string.");
    }
    if (proofId && !proofInput) {
      throw new Error("proof is required when proofId is provided.");
    }
    const proof = proofInput ? normalizeProofInput(proofInput, now) : void 0;
    const artifacts = Array.isArray(input.artifacts) ? input.artifacts.map((artifact) => normalizeArtifact({ ...artifact, createdAt: now })).filter((artifact) => artifact !== null).slice(-MAX_CARD_ARTIFACTS) : [];
    const metadata = clearDiagnostics(existing.metadata, ["missing_proof"]);
    const notification = {
      id: randomUUID11(),
      kind: "completed",
      createdAt: now,
      sequence: this.nextNotificationSequence(now),
      message: capText(summary, 240) ?? "Taskfold card completed.",
      ...cardSessionKey(existing) ? { sessionKey: cardSessionKey(existing) } : {},
      ...cardRunId(existing) ? { runId: cardRunId(existing) } : {}
    };
    const execution = existing.execution?.status === "running" ? { ...existing.execution, status: "done", updatedAt: now } : existing.execution;
    return await this.updateCard(
      id,
      {
        status: "done",
        ...execution ? { execution } : {},
        metadata: {
          ...metadata,
          claim: void 0,
          attempts: closeRunningAttempts(metadata.attempts, now, "succeeded"),
          failureCount: 0,
          automation: normalizeAutomation(
            {
              ...metadata.automation,
              summary,
              createdCardIds
            },
            metadata.automation
          ),
          comments: summary ? [
            ...metadata.comments ?? [],
            { id: randomUUID11(), body: summary, createdAt: now }
          ].slice(-MAX_CARD_COMMENTS) : metadata.comments,
          proof: proof ? appendCompletionProof(metadata.proof, proof, proofId) : metadata.proof,
          artifacts: artifacts.length ? [...metadata.artifacts ?? [], ...artifacts].slice(-MAX_CARD_ARTIFACTS) : metadata.artifacts,
          notifications: [...metadata.notifications ?? [], notification].slice(
            -MAX_CARD_NOTIFICATIONS
          )
        }
      },
      {
        enforceStatusHolds: true,
        expectedRevision: existing.revision,
        ...proof ? { preserveProofId: proofId ?? proof.id } : {}
      }
    );
  }
  async block(id, input = {}, scope = input) {
    return await this.retryOnRevisionConflict(async () => await this.enqueueMutation(async () => {
      const existing = await this.get(id);
      if (!existing) {
        throw new Error(`card not found: ${id}`);
      }
      assertCanMutateClaimedCard(existing, scope === null ? void 0 : scope);
      const now = Date.now();
      const reason = normalizeBoundedString(input.reason, void 0, 2e3, "block reason") ?? "Taskfold card blocked.";
      const metadata = existing.metadata ?? {};
      const notification = {
        id: randomUUID11(),
        kind: "failed",
        createdAt: now,
        sequence: this.nextNotificationSequence(now),
        message: capText(reason, 240) ?? "Taskfold card blocked.",
        ...cardSessionKey(existing) ? { sessionKey: cardSessionKey(existing) } : {},
        ...cardRunId(existing) ? { runId: cardRunId(existing) } : {}
      };
      const execution = existing.execution?.status === "running" ? { ...existing.execution, status: "blocked", updatedAt: now } : existing.execution;
      return await this.updateCard(
        id,
        {
          status: "blocked",
          ...execution ? { execution } : {},
          metadata: {
            ...metadata,
            claim: void 0,
            attempts: closeRunningAttempts(metadata.attempts, now, "blocked", reason),
            failureCount: (metadata.failureCount ?? 0) + 1,
            comments: [
              ...metadata.comments ?? [],
              { id: randomUUID11(), body: reason, createdAt: now }
            ].slice(-MAX_CARD_COMMENTS),
            notifications: [...metadata.notifications ?? [], notification].slice(
              -MAX_CARD_NOTIFICATIONS
            )
          }
        },
        { expectedRevision: existing.revision }
      );
    }));
  }
  async unblock(id, scope) {
    return await this.retryOnRevisionConflict(async () => await this.enqueueMutation(async () => {
      const existing = await this.get(id);
      if (!existing) {
        throw new Error(`card not found: ${id}`);
      }
      assertCanMutateClaimedCard(existing, scope);
      const metadata = clearDiagnostics(existing.metadata, ["blocked_too_long"]);
      return await this.updateCard(
        id,
        { status: "todo", metadata: { ...metadata, stale: null } },
        { expectedRevision: existing.revision }
      );
    }));
  }
  async reassign(id, input = {}, scope) {
    return await this.retryOnRevisionConflict(async () => await this.enqueueMutation(async () => {
      const existing = await this.get(id);
      if (!existing) {
        throw new Error(`card not found: ${id}`);
      }
      assertCanMutateClaimedCard(existing, scope === null ? void 0 : scope);
      const agentId = input.agentId === void 0 ? existing.agentId : normalizeOptionalString(input.agentId);
      const status = input.status === void 0 ? existing.status : normalizeStatus(input.status, existing.status);
      const reason = normalizeBoundedString(input.reason, void 0, 1e3, "reassign reason");
      const shouldResetFailures = input.resetFailures !== false;
      const baseMetadata = shouldResetFailures ? clearDiagnostics(existing.metadata, ["blocked_too_long", "repeated_failures"]) : existing.metadata;
      const metadata = {
        ...baseMetadata,
        ...shouldResetFailures ? { failureCount: 0 } : {},
        comments: reason ? [
          ...baseMetadata?.comments ?? [],
          { id: randomUUID11(), body: reason, createdAt: Date.now() }
        ].slice(-MAX_CARD_COMMENTS) : baseMetadata?.comments
      };
      return await this.updateCard(
        id,
        { agentId, status, metadata },
        { enforceStatusHolds: true, expectedRevision: existing.revision }
      );
    }));
  }
  async reclaim(id, input = {}, scope) {
    return await this.enqueueMutation(async () => {
      const existing = await this.get(id);
      if (!existing) {
        throw new Error(`card not found: ${id}`);
      }
      assertCanMutateClaimedCard(existing, scope === null ? void 0 : scope);
      const now = Date.now();
      const reason = normalizeBoundedString(input.reason, void 0, 1e3, "reclaim reason") ?? "Taskfold claim reclaimed.";
      const targetStatus = input.status === void 0 ? existing.status === "running" ? "ready" : existing.status : normalizeStatus(input.status, existing.status);
      const reclaimed = await this.updateCard(
        id,
        {
          status: targetStatus,
          execution: existing.execution?.status === "running" ? null : existing.execution,
          metadata: {
            ...existing.metadata,
            claim: void 0,
            attempts: closeRunningAttempts(existing.metadata?.attempts, now, "stopped", reason),
            comments: [
              ...existing.metadata?.comments ?? [],
              { id: randomUUID11(), body: reason, createdAt: now }
            ].slice(-MAX_CARD_COMMENTS),
            stale: null
          }
        },
        // 可能写两次（这里 + 下面的依赖晋级），不自动重试：冲突照常抛给调用方（TASK-6）。
        { enforceStatusHolds: true, expectedRevision: existing.revision }
      );
      return await this.promoteDependencyReady(reclaimed.id, now);
    });
  }
  async runs(id) {
    const card = await this.get(id);
    if (!card) {
      throw new Error(`card not found: ${id}`);
    }
    return { card, attempts: card.metadata?.attempts ?? [] };
  }
  async specify(id, input = {}, scope) {
    return await this.enqueueMutation(async () => {
      const existing = await this.get(id);
      if (!existing) {
        throw new Error(`card not found: ${id}`);
      }
      assertCanMutateClaimedCard(existing, scope === null ? void 0 : scope);
      if (existing.status !== "triage" && existing.status !== "backlog" && existing.status !== "todo") {
        throw new Error("only triage, backlog, or todo cards can be specified.");
      }
      const requestedStatus = normalizeStatus(input.status, "todo");
      if (requestedStatus !== "todo") {
        throw new Error("specified cards must move to todo.");
      }
      const now = Date.now();
      const summary = normalizeBoundedString(input.summary, void 0, 2e3, "spec summary");
      const metadata = {
        ...existing.metadata,
        comments: summary ? [
          ...existing.metadata?.comments ?? [],
          { id: randomUUID11(), body: summary, createdAt: now }
        ].slice(-MAX_CARD_COMMENTS) : existing.metadata?.comments,
        automation: normalizeAutomation(
          {
            ...existing.metadata?.automation,
            summary: summary ?? existing.metadata?.automation?.summary
          },
          existing.metadata?.automation
        )
      };
      const { summary: _summary, status: _status, ...cardPatch } = input;
      const updated = await this.updateCard(
        id,
        {
          ...cardPatch,
          status: "todo",
          metadata
        },
        { enforceStatusHolds: true, expectedRevision: existing.revision }
      );
      const specified = {
        ...updated,
        events: appendEvent(updated, { kind: "specified" }, now)
      };
      await this.persistCard(specified, updated.revision);
      return specified;
    });
  }
  async decompose(id, input = {}, scope) {
    return await this.enqueueMutation(async () => {
      const parent = await this.get(id);
      if (!parent) {
        throw new Error(`card not found: ${id}`);
      }
      assertCanMutateClaimedCard(parent, scope === null ? void 0 : scope);
      const childrenInput = Array.isArray(input.children) ? input.children : [];
      if (childrenInput.length === 0) {
        throw new Error("children are required.");
      }
      if (childrenInput.length > 20) {
        throw new Error("at most 20 children can be created at once.");
      }
      const parentAutomation = parent.metadata?.automation;
      const existingCardIds = new Set((await this.list()).map((card) => card.id));
      const children = [];
      const reusedChildSnapshots = /* @__PURE__ */ new Map();
      const reusedChildAfter = /* @__PURE__ */ new Map();
      let parentAfter = parent;
      try {
        for (const rawChild of childrenInput) {
          if (!rawChild || typeof rawChild !== "object" || Array.isArray(rawChild)) {
            throw new Error("children must be objects.");
          }
          const child = rawChild;
          const created = await this.createDirect(
            {
              ...child,
              parents: [parent.id],
              boardId: child.boardId ?? parentAutomation?.boardId,
              tenant: child.tenant ?? parentAutomation?.tenant,
              createdByCardId: parent.id,
              idempotencyKey: child.idempotencyKey ?? deriveChildIdempotencyKey(parentAutomation?.idempotencyKey, children.length + 1)
            },
            scope === null ? void 0 : scope
          );
          const reusedUnlinkedChild = existingCardIds.has(created.id) && !cardParentIds(created).includes(parent.id);
          if (reusedUnlinkedChild) {
            reusedChildSnapshots.set(created.id, created);
          }
          const linked = cardParentIds(created).includes(parent.id) ? created : await this.linkCardsDirect(parent.id, created.id, Date.now(), {
            allowStatusOnlyActiveChild: true,
            scope: scope === null ? void 0 : scope
          });
          if (reusedUnlinkedChild) {
            reusedChildAfter.set(created.id, linked);
          }
          children.push(linked);
          parentAfter = await this.get(parent.id) ?? parentAfter;
        }
        const summary = normalizeBoundedString(input.summary, void 0, 2e3, "decompose summary");
        const completeParent = input.completeParent !== false;
        const updatedParent = completeParent ? await this.completeDirect(
          parent.id,
          { summary, createdCardIds: children.map((child) => child.id) },
          scope
        ) : await (async () => {
          const latestParent = await this.get(parent.id) ?? parent;
          return await this.updateCard(
            parent.id,
            {
              status: latestParent.status === "triage" || latestParent.status === "backlog" ? "todo" : latestParent.status,
              metadata: {
                ...latestParent.metadata,
                automation: normalizeAutomation(
                  {
                    ...latestParent.metadata?.automation,
                    summary,
                    createdCardIds: children.map((child) => child.id)
                  },
                  latestParent.metadata?.automation
                )
              }
            },
            { enforceStatusHolds: true }
          );
        })();
        const decomposedParent = {
          ...updatedParent,
          events: appendEvent(updatedParent, { kind: "decomposed" })
        };
        await this.persistCard(decomposedParent, updatedParent.revision);
        return { parent: decomposedParent, children };
      } catch (error) {
        for (const child of children.toReversed()) {
          if (!existingCardIds.has(child.id)) {
            await this.deleteDirect(child.id);
          }
        }
        for (const [childId, childBefore] of reusedChildSnapshots) {
          const childAfter = reusedChildAfter.get(childId) ?? childBefore;
          await this.compensateCardMutation(childId, childBefore, childAfter, invertTaskfoldCardMutation);
        }
        await this.compensateCardMutation(parent.id, parent, parentAfter, invertTaskfoldCardMutation);
        throw error;
      }
    });
  }
};

// ../core/src/store-notifications.ts
var TaskfoldNotificationStore = class extends TaskfoldWorkflowStore {
  async subscribeNotifications(input) {
    return await this.enqueueMutation(async () => {
      const subscription = normalizeNotificationSubscription(input);
      await this.subscriptionStore.register(subscription.id, { version: 1, subscription });
      return subscription;
    });
  }
  async listNotificationSubscriptions(input = {}) {
    const boardId = normalizeBoardId(input.boardId);
    const cardId = normalizeBoundedString(input.cardId, void 0, 120, "card id");
    const subscriptions = (await this.subscriptionStore.entries()).map((entry) => entry.value).filter(
      (entry) => entry?.version === 1 && Boolean(entry.subscription?.id)
    ).map((entry) => entry.subscription).filter((subscription) => !boardId || subscription.boardId === boardId).filter((subscription) => !cardId || subscription.cardId === cardId).toSorted((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    return { subscriptions };
  }
  async deleteNotificationSubscription(id) {
    return await this.enqueueMutation(async () => ({
      deleted: await this.subscriptionStore.delete(id.trim())
    }));
  }
  async collectNotificationEvents(input = {}) {
    const subscriptionId = normalizeBoundedString(
      input.subscriptionId,
      void 0,
      120,
      "subscription id"
    );
    const boardId = normalizeBoardId(input.boardId);
    const cardId = normalizeBoundedString(input.cardId, void 0, 120, "card id");
    const limit = typeof input.limit === "number" && Number.isFinite(input.limit) ? Math.max(1, Math.min(200, Math.trunc(input.limit))) : 50;
    const subscriptionEntry = subscriptionId ? await this.subscriptionStore.lookup(subscriptionId) : void 0;
    if (subscriptionId && !subscriptionEntry?.subscription) {
      throw new Error(`notification subscription not found: ${subscriptionId}`);
    }
    const subscription = subscriptionEntry?.subscription;
    const effectiveCardId = subscription?.cardId ?? cardId;
    const effectiveBoardId = effectiveCardId ? void 0 : subscription?.boardId ?? boardId;
    const effectiveSessionKey = subscription?.sessionKey;
    const effectiveRunId = subscription?.runId;
    const events = [];
    for (const card of await this.list({ boardId: effectiveBoardId })) {
      if (card.metadata?.archivedAt || effectiveCardId && card.id !== effectiveCardId) {
        continue;
      }
      const stale = card.metadata?.stale;
      const notifications = [
        ...card.metadata?.notifications ?? [],
        ...stale ? [
          {
            id: `stale:${card.id}:${stale.detectedAt}`,
            kind: "stale",
            createdAt: stale.detectedAt,
            sequence: stale.detectedAt * 1e3,
            message: stale.reason,
            ...cardSessionKey(card) ? { sessionKey: cardSessionKey(card) } : {},
            ...cardRunId(card) ? { runId: cardRunId(card) } : {}
          }
        ] : []
      ];
      for (const event of notifications) {
        const eventSessionKey = event.sessionKey ?? cardSessionKey(card);
        const eventRunId = event.runId ?? cardRunId(card);
        if (effectiveSessionKey && eventSessionKey !== effectiveSessionKey) {
          continue;
        }
        if (effectiveRunId && eventRunId !== effectiveRunId) {
          continue;
        }
        if (subscription?.eventKinds?.length && !subscription.eventKinds.includes(event.kind)) {
          continue;
        }
        if (subscription?.lastEventAt !== void 0 && compareNotifications(event, {
          id: subscription.lastEventId ?? "",
          kind: event.kind,
          createdAt: subscription.lastEventAt,
          ...subscription.lastEventSequence !== void 0 ? { sequence: subscription.lastEventSequence } : {},
          message: ""
        }) <= 0) {
          continue;
        }
        events.push(event);
      }
    }
    const sorted = events.toSorted(compareNotifications).slice(0, limit);
    return { ...subscription ? { subscription } : {}, events: sorted };
  }
  async notificationEvents(input = {}) {
    return await this.collectNotificationEvents(input);
  }
  async advanceNotificationEvents(input = {}) {
    const subscriptionId = normalizeBoundedString(
      input.subscriptionId,
      void 0,
      120,
      "subscription id"
    );
    if (!subscriptionId) {
      throw new Error("subscriptionId is required to advance notification events.");
    }
    return await this.enqueueMutation(async () => {
      const result = await this.collectNotificationEvents({ ...input, subscriptionId });
      if (!result.subscription || !result.events.length) {
        return result;
      }
      const last = result.events.at(-1);
      const lastSequence = notificationSequence(last);
      const subscription = {
        ...result.subscription,
        lastEventAt: last.createdAt,
        lastEventId: last.id,
        ...lastSequence !== void 0 ? { lastEventSequence: lastSequence } : {},
        updatedAt: Date.now()
      };
      delete subscription.deliveredEventIds;
      if (lastSequence === void 0) {
        delete subscription.lastEventSequence;
      }
      await this.subscriptionStore.register(subscription.id, {
        version: 1,
        subscription
      });
      return { subscription, events: result.events };
    });
  }
};

// ../core/src/project-document-discovery.ts
import { createHash as createHash5 } from "node:crypto";
import fs12 from "node:fs/promises";
import path19 from "node:path";
var MAX_DISCOVERED_DOCUMENTS = 500;
var MARKDOWN_EXTENSIONS2 = /* @__PURE__ */ new Set([".md", ".markdown"]);
var TOP_LEVEL_AI_INSTRUCTION_NAMES = /* @__PURE__ */ new Set(["agents.md", "claude.md"]);
var EXCLUDED_TOP_LEVEL_AI_INSTRUCTION_DIRECTORIES = /* @__PURE__ */ new Set([
  ".git",
  ".next",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "tpm",
  "vendor"
]);
var PLANNING_DOCUMENT_DIRECTORIES = /* @__PURE__ */ new Set(["codebase", "intel", "notes", "research", "seeds"]);
var EXTRA_DOCUMENT_PATHS = [
  ".github/copilot-instructions.md",
  ".claude/skills/deploy-test/SKILL.md",
  ".claude/skills/deploy-prod/SKILL.md"
];
function isPathInside2(root, candidate) {
  const relative = path19.relative(root, candidate);
  return relative === "" || !relative.startsWith(`..${path19.sep}`) && relative !== "..";
}
function normalizedRelativePath(root, target) {
  return path19.relative(root, target).split(path19.sep).join("/");
}
function isMarkdownPath(relativePath) {
  return MARKDOWN_EXTENSIONS2.has(path19.extname(relativePath).toLocaleLowerCase());
}
function sourceForDocument(relativePath) {
  const normalized2 = relativePath.toLocaleLowerCase();
  if (normalized2 === ".github/copilot-instructions.md" || normalized2 === ".claude/skills/deploy-test/skill.md" || normalized2 === ".claude/skills/deploy-prod/skill.md" || /^(?:[^/]+\/)?(?:agents|claude)\.md$/.test(normalized2)) {
    return "ai_system";
  }
  return "project";
}
function sectionForDocument(relativePath) {
  const normalized2 = relativePath.toLocaleLowerCase();
  if (normalized2.startsWith(".planning/codebase/")) {
    return "codebase";
  }
  if (normalized2.startsWith(".planning/intel/") || /(?:^|\/)(?:deploy|deployment|environment|operations|ops|runbook)(?:\/|$)/.test(normalized2)) {
    return "environment";
  }
  if (normalized2.startsWith(".planning/notes/") || normalized2.startsWith(".planning/research/")) {
    return "knowledge";
  }
  return "project";
}
function candidateKey(relativePath, source) {
  if (source === "ai_system") {
    const normalized2 = relativePath.toLocaleLowerCase().replace(/\.(?:md|markdown)$/i, "").replace(/[\\/]+/g, ".").replace(/[^a-z0-9._-]/g, "-").replace(/^\.+/, "");
    return `ai.${normalized2}`;
  }
  return `file.${createHash5("sha256").update(relativePath).digest("hex").slice(0, 24)}`;
}
function candidateTitle(relativePath) {
  return path19.basename(relativePath).replace(/\.(?:md|markdown)$/i, "");
}
async function directoryEntries(directory) {
  try {
    return await fs12.readdir(directory, { encoding: "utf8", withFileTypes: true });
  } catch {
    return [];
  }
}
async function addCandidate(params) {
  if (params.results.length >= MAX_DISCOVERED_DOCUMENTS || !isMarkdownPath(params.relativePath)) {
    return;
  }
  const candidatePath = path19.join(params.root, params.relativePath);
  let target;
  try {
    target = await fs12.realpath(candidatePath);
  } catch {
    return;
  }
  if (!isPathInside2(params.root, target) || params.targets.has(target)) {
    return;
  }
  let stat2;
  try {
    stat2 = await fs12.stat(target);
  } catch {
    return;
  }
  if (!stat2.isFile()) {
    return;
  }
  const relativePath = normalizedRelativePath(params.root, target);
  const source = sourceForDocument(relativePath);
  params.results.push({
    key: candidateKey(relativePath, source),
    relativePath,
    target,
    title: candidateTitle(relativePath),
    summary: source === "ai_system" ? "AI instruction file." : relativePath,
    section: sectionForDocument(relativePath),
    source
  });
  params.targets.add(target);
}
async function addDirectoryMarkdownFiles(params) {
  const directory = path19.join(params.root, params.relativeDirectory);
  const entries = await directoryEntries(directory);
  for (const entry of entries.filter((entry2) => entry2.isFile() && isMarkdownPath(entry2.name)).toSorted((left, right) => left.name.localeCompare(right.name))) {
    await addCandidate({
      ...params,
      relativePath: path19.join(params.relativeDirectory, entry.name)
    });
  }
}
async function addTopLevelModuleAiInstructions(params) {
  const entries = await directoryEntries(params.root);
  for (const entry of entries.filter(
    (entry2) => entry2.isDirectory() && !entry2.isSymbolicLink() && !entry2.name.startsWith(".") && !EXCLUDED_TOP_LEVEL_AI_INSTRUCTION_DIRECTORIES.has(entry2.name)
  ).toSorted((left, right) => left.name.localeCompare(right.name))) {
    const moduleEntries = await directoryEntries(path19.join(params.root, entry.name));
    for (const instruction of moduleEntries.filter(
      (moduleEntry) => moduleEntry.isFile() && TOP_LEVEL_AI_INSTRUCTION_NAMES.has(moduleEntry.name.toLocaleLowerCase())
    ).toSorted((left, right) => left.name.localeCompare(right.name))) {
      await addCandidate({
        ...params,
        relativePath: path19.join(entry.name, instruction.name)
      });
    }
  }
}
async function resolveTaskfoldProjectDocumentWorkspacePath(workspacePath) {
  let root;
  try {
    root = await fs12.realpath(workspacePath);
  } catch {
    throw new Error("project default workspace does not exist.");
  }
  let rootStat;
  try {
    rootStat = await fs12.stat(root);
  } catch {
    throw new Error("project default workspace cannot be read.");
  }
  if (!rootStat.isDirectory()) {
    throw new Error("project default workspace must be a directory.");
  }
  return root;
}
function isTaskfoldProjectDocumentDiscoveryPath(workspaceRoot, target) {
  if (!target || !path19.isAbsolute(target)) {
    return false;
  }
  const root = path19.resolve(workspaceRoot);
  const resolvedTarget = path19.resolve(target);
  if (!isPathInside2(root, resolvedTarget)) {
    return false;
  }
  const relativePath = normalizedRelativePath(root, resolvedTarget);
  if (!isMarkdownPath(relativePath)) {
    return false;
  }
  const segments = relativePath.split("/");
  if (segments.length === 1) {
    return true;
  }
  if (segments.length === 2 && TOP_LEVEL_AI_INSTRUCTION_NAMES.has(segments[1].toLocaleLowerCase()) && !segments[0].startsWith(".") && !EXCLUDED_TOP_LEVEL_AI_INSTRUCTION_DIRECTORIES.has(segments[0])) {
    return true;
  }
  if (segments.length === 2 && segments[0] === ".planning") {
    return true;
  }
  if (segments.length === 3 && segments[0] === ".planning" && PLANNING_DOCUMENT_DIRECTORIES.has(segments[1])) {
    return true;
  }
  return EXTRA_DOCUMENT_PATHS.includes(relativePath);
}
async function discoverTaskfoldProjectDocuments(workspacePath) {
  const root = await resolveTaskfoldProjectDocumentWorkspacePath(workspacePath);
  const results = [];
  const targets = /* @__PURE__ */ new Set();
  const params = { root, results, targets };
  await addDirectoryMarkdownFiles({ ...params, relativeDirectory: "" });
  await addTopLevelModuleAiInstructions(params);
  await addDirectoryMarkdownFiles({ ...params, relativeDirectory: ".planning" });
  for (const directory of PLANNING_DOCUMENT_DIRECTORIES) {
    await addDirectoryMarkdownFiles({
      ...params,
      relativeDirectory: path19.join(".planning", directory)
    });
  }
  for (const relativePath of EXTRA_DOCUMENT_PATHS) {
    await addCandidate({ ...params, relativePath });
  }
  return results;
}

// ../core/src/store-projects.ts
var RESERVED_AUTOMATIC_DOCUMENT_KEY_PREFIXES = ["file.", "ai."];
function normalizeProjectCreateMode(value) {
  if (value === void 0 || value === "new") {
    return "new";
  }
  if (value === "existing") {
    return "existing";
  }
  throw new Error("project mode must be new or existing.");
}
async function assertExistingProjectDirectory(workspace) {
  if (workspace?.kind !== "dir" || !workspace.path) {
    throw new Error("existing project requires an absolute local directory.");
  }
  let details;
  try {
    details = await stat(workspace.path);
  } catch {
    throw new Error(`existing project directory is unavailable: ${workspace.path}`);
  }
  if (!details.isDirectory()) {
    throw new Error(`existing project path is not a directory: ${workspace.path}`);
  }
}
function presentProjectDocument(document) {
  const next = {
    ...document,
    source: document.source ?? "project"
  };
  delete next.system;
  return next;
}
function isDocumentSection(value) {
  return typeof value === "string" && TASKFOLD_PROJECT_DOCUMENT_SECTIONS.includes(value);
}
function isDocumentType(value) {
  return typeof value === "string" && TASKFOLD_PROJECT_DOCUMENT_TYPES.includes(value);
}
function normalizeDocumentKey(value, fallback) {
  const key = normalizeBoundedString(value, fallback, 80, "document key");
  if (!key || !/^[a-z0-9][a-z0-9._-]{0,79}$/.test(key)) {
    throw new Error("document key must match [a-z0-9][a-z0-9._-]{0,79}.");
  }
  return key;
}
function hasReservedAutomaticDocumentKeyPrefix(key) {
  return RESERVED_AUTOMATIC_DOCUMENT_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}
function isAutomaticProjectDocument(document) {
  return document.system === true || hasReservedAutomaticDocumentKeyPrefix(document.key);
}
function normalizeDocumentSection(value, fallback) {
  if (value === void 0) {
    if (fallback) {
      return fallback;
    }
    throw new Error(`document section must be one of: ${TASKFOLD_PROJECT_DOCUMENT_SECTIONS.join(", ")}.`);
  }
  if (!isDocumentSection(value)) {
    throw new Error(`document section must be one of: ${TASKFOLD_PROJECT_DOCUMENT_SECTIONS.join(", ")}.`);
  }
  return value;
}
function normalizeDocumentType(value, fallback) {
  if (value === void 0) {
    if (fallback) {
      return fallback;
    }
    throw new Error(`document type must be one of: ${TASKFOLD_PROJECT_DOCUMENT_TYPES.join(", ")}.`);
  }
  if (!isDocumentType(value)) {
    throw new Error(`document type must be one of: ${TASKFOLD_PROJECT_DOCUMENT_TYPES.join(", ")}.`);
  }
  return value;
}
function normalizeDocumentBody(input, type, fallback) {
  const target = type === "link" ? normalizeExternalUrl(input.target, fallback?.target, "document URL") : type === "path" || type === "secret_ref" ? normalizeBoundedString(input.target, fallback?.target, 2e3, "document target") : void 0;
  const content = type === "markdown" || type === "json" ? normalizeBoundedString(input.content, fallback?.content, 2e4, "document content") : void 0;
  if ((type === "link" || type === "path" || type === "secret_ref") && !target) {
    throw new Error(`${type} documents require a target.`);
  }
  if (type === "path" && (target?.includes("\0") || target?.includes("\n"))) {
    throw new Error("document path contains unsupported characters.");
  }
  if (type === "json" && content) {
    try {
      JSON.parse(content);
    } catch {
      throw new Error("document JSON must be valid.");
    }
  }
  return {
    ...target ? { target } : {},
    ...content ? { content } : {}
  };
}
function boardRunningCards(cards) {
  return cards.filter(
    (card) => card.status === "running" || card.execution?.status === "running" || card.metadata?.attempts?.some((attempt) => attempt.status === "running")
  );
}
var TaskfoldProjectStore = class extends TaskfoldNotificationStore {
  async ensureBoardDirect(boardId, now = Date.now()) {
    const existing = await this.boardStore.lookup(boardId);
    if (existing?.version === 1) {
      return existing.board;
    }
    const board = normalizeBoardMetadata({ id: boardId }, void 0, now);
    await this.boardStore.register(board.id, { version: 1, board });
    return board;
  }
  async removeLegacyGeneratedProjectDocumentsDirect(board) {
    if (!board.defaultWorkspace?.path || board.defaultWorkspace.kind !== "dir" && board.defaultWorkspace.kind !== "worktree") {
      return;
    }
    for (const entry of await this.documentStore.entries()) {
      const document = entry.value?.version === 1 ? entry.value.document : void 0;
      if (document?.boardId === board.id && document.system === true && document.type === "path" && !hasReservedAutomaticDocumentKeyPrefix(document.key)) {
        await this.documentStore.delete(entry.key);
      }
    }
  }
  async discoverProjectDocumentsDirect(board, now = Date.now()) {
    const workspacePath = board.defaultWorkspace?.path;
    if (!workspacePath || board.defaultWorkspace?.kind !== "dir" && board.defaultWorkspace?.kind !== "worktree") {
      return;
    }
    let workspaceRoot;
    let candidates;
    try {
      workspaceRoot = await resolveTaskfoldProjectDocumentWorkspacePath(workspacePath);
      candidates = await discoverTaskfoldProjectDocuments(workspaceRoot);
    } catch {
      return;
    }
    for (const entry of await this.documentStore.entries()) {
      const document = entry.value?.version === 1 ? entry.value.document : void 0;
      if (document?.boardId === board.id && isAutomaticProjectDocument(document) && !isTaskfoldProjectDocumentDiscoveryPath(workspaceRoot, document.target)) {
        await this.documentStore.delete(entry.key);
      }
    }
    const existing = (await this.documentStore.entries()).map((entry) => entry.value).filter(
      (entry) => entry?.version === 1 && entry.document?.boardId === board.id
    ).map((entry) => presentProjectDocument(entry.document));
    const existingKeys = new Set(existing.map((document) => document.key));
    const existingTargets = new Set(
      existing.map((document) => document.target).filter((target) => Boolean(target))
    );
    const nextPositionBySection = /* @__PURE__ */ new Map();
    for (const candidate of candidates) {
      if (existingKeys.has(candidate.key) || existingTargets.has(candidate.target)) {
        continue;
      }
      const position = (nextPositionBySection.get(candidate.section) ?? Math.max(
        0,
        ...existing.filter((document2) => document2.section === candidate.section).map((document2) => document2.position)
      )) + POSITION_STEP;
      nextPositionBySection.set(candidate.section, position);
      const document = {
        id: randomUUID12(),
        boardId: board.id,
        key: candidate.key,
        section: candidate.section,
        source: candidate.source,
        type: "path",
        title: candidate.title,
        summary: candidate.summary,
        target: candidate.target,
        position,
        system: true,
        createdAt: now,
        updatedAt: now
      };
      await this.documentStore.register(document.id, { version: 1, document });
      existingKeys.add(candidate.key);
      existingTargets.add(candidate.target);
    }
  }
  async ensureProjectDirect(boardId, now = Date.now()) {
    return await this.ensureBoardDirect(boardId, now);
  }
  async assertProjectCanReceiveCards(boardId) {
    const board = await this.boardStore.lookup(boardId);
    if (board?.version === 1 && board.board.archivedAt) {
      throw new Error("project is archived and cannot receive cards.");
    }
  }
  async isProjectArchived(boardId) {
    const board = await this.boardStore.lookup(boardId);
    return Boolean(board?.version === 1 && board.board.archivedAt);
  }
  async listProjects(params = {}) {
    const includeArchived = params.includeArchived === true;
    const { boards } = await this.listBoards();
    return {
      projects: boards.filter((board) => includeArchived || !board.archivedAt).toSorted(
        (left, right) => (left.position ?? Number.MAX_SAFE_INTEGER) - (right.position ?? Number.MAX_SAFE_INTEGER) || left.id.localeCompare(right.id)
      )
    };
  }
  async getProject(id) {
    const boardId = normalizeBoardIdRequired(id);
    return await this.enqueueMutation(async () => {
      const board = await this.ensureProjectDirect(boardId);
      const milestones = await this.listMilestonesDirect(boardId);
      const cards = await this.list({ boardId });
      return { board, milestones, cards };
    });
  }
  async createProject(input) {
    return await this.enqueueMutation(async () => {
      const boardId = normalizeBoardIdRequired(input.id);
      if (await this.boardStore.lookup(boardId)) {
        throw new Error(`project already exists: ${boardId}`);
      }
      if ((await this.list({ boardId })).length > 0) {
        throw new Error(`project already exists through existing cards: ${boardId}`);
      }
      const name = normalizeTitle(input.name);
      const projectMode = normalizeProjectCreateMode(input.projectMode);
      const initialMilestoneTitle = normalizeOptionalString(input.initialMilestoneTitle);
      const existingBoards = await this.listBoards();
      const maxPosition = Math.max(
        0,
        ...existingBoards.boards.map((board2) => board2.position ?? 0)
      );
      const board = normalizeBoardMetadata(
        {
          ...input,
          id: boardId,
          name,
          position: input.position ?? maxPosition + POSITION_STEP
        },
        void 0
      );
      if (projectMode === "existing") {
        await assertExistingProjectDirectory(board.defaultWorkspace);
      }
      const milestone = initialMilestoneTitle ? this.createMilestoneRecord(
        boardId,
        {
          title: normalizeTitle(initialMilestoneTitle),
          description: void 0,
          color: void 0,
          position: POSITION_STEP
        },
        Date.now()
      ) : void 0;
      await this.boardStore.register(board.id, { version: 1, board });
      try {
        if (milestone) {
          await this.milestoneStore.register(milestone.id, { version: 1, milestone });
        }
      } catch (error) {
        if (milestone) {
          await this.milestoneStore.delete(milestone.id);
        }
        await this.boardStore.delete(board.id);
        throw error;
      }
      return {
        board,
        milestones: milestone ? [milestone] : [],
        cards: []
      };
    });
  }
  async updateProject(input) {
    return await this.enqueueMutation(async () => {
      const boardId = normalizeBoardIdRequired(input.id);
      const existing = await this.boardStore.lookup(boardId);
      if (!existing && (await this.list({ boardId })).length === 0 && boardId !== "default") {
        throw new Error(`project not found: ${boardId}`);
      }
      if (!existing) {
        await this.ensureProjectDirect(boardId);
      }
      const board = normalizeBoardMetadata({ ...input, id: boardId }, existing?.board);
      await this.boardStore.register(boardId, { version: 1, board });
      return board;
    });
  }
  async reorderProjects(ids) {
    if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => typeof id !== "string")) {
      throw new Error("project ids are required.");
    }
    return await this.enqueueMutation(async () => {
      const seen = /* @__PURE__ */ new Set();
      const boards = [];
      for (const rawId of ids) {
        const boardId = normalizeBoardIdRequired(rawId);
        if (seen.has(boardId)) {
          throw new Error("project ids must not contain duplicates.");
        }
        seen.add(boardId);
        const entry = await this.boardStore.lookup(boardId);
        if (!entry?.board) {
          throw new Error(`project not found: ${boardId}`);
        }
        boards.push(entry.board);
      }
      const now = Date.now();
      const updated = boards.map(
        (board, index) => normalizeBoardMetadata(
          { ...board, id: board.id, position: (index + 1) * POSITION_STEP },
          board,
          now
        )
      );
      for (const board of updated) {
        await this.boardStore.register(board.id, { version: 1, board });
      }
      return { projects: updated };
    });
  }
  async archiveProject(id, archived = true) {
    const boardId = normalizeBoardIdRequired(id);
    return await this.enqueueMutation(async () => {
      const existing = await this.boardStore.lookup(boardId);
      const board = normalizeBoardMetadata(
        { id: boardId, archived },
        existing?.board
      );
      await this.boardStore.register(boardId, { version: 1, board });
      return {
        board,
        runningCards: archived === false ? [] : boardRunningCards(await this.list({ boardId }))
      };
    });
  }
  async listMilestones(boardId) {
    return { milestones: await this.listMilestonesDirect(normalizeBoardIdRequired(boardId)) };
  }
  async listMilestonesDirect(boardId) {
    return (await this.milestoneStore.entries()).map((entry) => entry.value).filter(
      (entry) => entry?.version === 1 && entry.milestone?.boardId === boardId
    ).map((entry) => entry.milestone).toSorted((left, right) => left.position - right.position || left.createdAt - right.createdAt);
  }
  createMilestoneRecord(boardId, input, now) {
    const title = normalizeTitle(input.title);
    const description = normalizeBoundedString(input.description, void 0, 2e3, "milestone description");
    const color = normalizeBoundedString(input.color, void 0, 40, "milestone color");
    return {
      id: randomUUID12(),
      boardId,
      title,
      position: normalizePosition(input.position, POSITION_STEP),
      state: "active",
      createdAt: now,
      updatedAt: now,
      ...description ? { description } : {},
      ...color ? { color } : {}
    };
  }
  async createMilestone(input) {
    return await this.enqueueMutation(async () => {
      const boardId = normalizeBoardIdRequired(input.boardId);
      await this.assertProjectCanReceiveCards(boardId);
      await this.ensureProjectDirect(boardId);
      const existing = await this.listMilestonesDirect(boardId);
      const position = input.position === void 0 ? Math.max(0, ...existing.map((milestone2) => milestone2.position)) + POSITION_STEP : input.position;
      const milestone = this.createMilestoneRecord(boardId, { ...input, position }, Date.now());
      await this.milestoneStore.register(milestone.id, { version: 1, milestone });
      return milestone;
    });
  }
  async updateMilestone(id, input) {
    return await this.enqueueMutation(async () => {
      const existing = await this.milestoneStore.lookup(id.trim());
      if (!existing?.milestone) {
        throw new Error(`milestone not found: ${id}`);
      }
      const milestone = existing.milestone;
      const title = input.title === void 0 ? milestone.title : normalizeTitle(input.title);
      const description = input.description === void 0 ? milestone.description : normalizeBoundedString(input.description, void 0, 2e3, "milestone description");
      const color = input.color === void 0 ? milestone.color : normalizeBoundedString(input.color, void 0, 40, "milestone color");
      const next = {
        ...milestone,
        title,
        updatedAt: Date.now(),
        ...description ? { description } : {},
        ...color ? { color } : {}
      };
      if (!description) {
        delete next.description;
      }
      if (!color) {
        delete next.color;
      }
      await this.milestoneStore.register(next.id, { version: 1, milestone: next });
      return next;
    });
  }
  async reorderMilestones(input) {
    const boardId = normalizeBoardIdRequired(input.boardId);
    if (!Array.isArray(input.milestoneIds) || input.milestoneIds.length === 0 || input.milestoneIds.some((id) => typeof id !== "string")) {
      throw new Error("milestone ids are required.");
    }
    return await this.enqueueMutation(async () => {
      const existing = await this.listMilestonesDirect(boardId);
      const ids = input.milestoneIds;
      if (new Set(ids).size !== ids.length || ids.length !== existing.length) {
        throw new Error("milestone ids must contain every project milestone exactly once.");
      }
      const byId = new Map(existing.map((milestone) => [milestone.id, milestone]));
      const now = Date.now();
      const milestones = ids.map((id, index) => {
        const milestone = byId.get(id);
        if (!milestone) {
          throw new Error(`milestone does not belong to project: ${id}`);
        }
        return { ...milestone, position: (index + 1) * POSITION_STEP, updatedAt: now };
      });
      for (const milestone of milestones) {
        await this.milestoneStore.register(milestone.id, { version: 1, milestone });
      }
      return { milestones };
    });
  }
  async completeMilestone(id) {
    return await this.enqueueMutation(async () => {
      const entry = await this.milestoneStore.lookup(id.trim());
      if (!entry?.milestone) {
        throw new Error(`milestone not found: ${id}`);
      }
      const milestone = entry.milestone;
      if (milestone.state !== "active") {
        throw new Error("only active milestones can be completed.");
      }
      const unfinished = (await this.list({ boardId: milestone.boardId })).filter(
        (card) => card.milestoneId === milestone.id && !card.metadata?.archivedAt && card.status !== "done"
      );
      if (unfinished.length > 0) {
        throw new Error(
          `milestone has unfinished cards: ${unfinished.map((card) => `${card.id}:${card.title}`).join(", ")}`
        );
      }
      const now = Date.now();
      const next = {
        ...milestone,
        state: "completed",
        completedAt: now,
        updatedAt: now
      };
      await this.milestoneStore.register(next.id, { version: 1, milestone: next });
      return next;
    });
  }
  async archiveMilestone(id) {
    return await this.setMilestoneState(id, "archived");
  }
  async restoreMilestone(id) {
    return await this.setMilestoneState(id, "active");
  }
  async setMilestoneState(id, state) {
    return await this.enqueueMutation(async () => {
      if (!TASKFOLD_MILESTONE_STATES.includes(state)) {
        throw new Error("invalid milestone state.");
      }
      const entry = await this.milestoneStore.lookup(id.trim());
      if (!entry?.milestone) {
        throw new Error(`milestone not found: ${id}`);
      }
      const now = Date.now();
      const next = {
        ...entry.milestone,
        state,
        updatedAt: now,
        ...state === "archived" ? { archivedAt: now } : {}
      };
      if (state === "active") {
        delete next.archivedAt;
        delete next.completedAt;
      }
      await this.milestoneStore.register(next.id, { version: 1, milestone: next });
      return next;
    });
  }
  /**
   * 把卡片移到另一个里程碑（或未分配）并定位。`options.expectedRevision`（TASK-8，VS Code 看板的
   * 拖拽 CAS）：给了就只在卡片仍是这个 revision 时写入，否则抛 {@link TaskfoldRevisionConflictError}、
   * 不重试；不给时行为与原来逐字相同。特意不从 `input` 里读：网关把整个请求参数当 `input` 传进来，
   * 放在 `input` 里会让网关不改代码就开始接受它。
   */
  async moveMilestone(id, input, options = {}) {
    const run = async () => await this.enqueueMutation(async () => {
      const card = await this.get(id);
      if (!card) {
        throw new Error(`card not found: ${id}`);
      }
      if (options.expectedRevision !== void 0 && card.revision !== options.expectedRevision) {
        throw new TaskfoldRevisionConflictError(id, options.expectedRevision);
      }
      const boardId = cardBoardId(card);
      await this.assertProjectCanReceiveCards(boardId);
      const milestoneId = normalizeOptionalString(input.milestoneId);
      if (milestoneId) {
        const milestone = await this.milestoneStore.lookup(milestoneId);
        if (!milestone?.milestone || milestone.milestone.boardId !== boardId || milestone.milestone.state !== "active") {
          throw new Error("target milestone must be an active milestone in the current project.");
        }
      }
      const position = input.position === void 0 ? Math.max(
        0,
        ...(await this.list({ boardId })).filter((candidate) => candidate.id !== card.id && candidate.milestoneId === milestoneId).map((candidate) => candidate.position)
      ) + POSITION_STEP : normalizePosition(input.position, card.position);
      const next = removeUndefinedCardFields({
        ...card,
        ...milestoneId ? { milestoneId } : {},
        position,
        updatedAt: Date.now()
      });
      if (!milestoneId) {
        delete next.milestoneId;
      }
      if (card.milestoneId !== milestoneId) {
        next.events = appendEvent(next, {
          kind: "milestone_moved",
          ...card.milestoneId ? { fromMilestoneId: card.milestoneId } : {},
          ...milestoneId ? { toMilestoneId: milestoneId } : {}
        });
      }
      await this.persistCard(next, card.revision);
      return next;
    });
    return options.expectedRevision !== void 0 ? await run() : await this.retryOnRevisionConflict(run);
  }
  async moveProject(id, input) {
    return await this.enqueueMutation(async () => {
      const card = await this.get(id);
      if (!card) {
        throw new Error(`card not found: ${id}`);
      }
      const currentBoardId = cardBoardId(card);
      const boardId = normalizeBoardIdRequired(input.boardId);
      if (boardId !== currentBoardId && (isRequirementCard(card) || cardRequirementId(card) || cardRequirementChildIds(card).length > 0)) {
        throw new Error("cards with requirement hierarchy cannot move between projects.");
      }
      const targetBoard = await this.boardStore.lookup(boardId);
      if (!targetBoard && (await this.list({ boardId })).length === 0 && boardId !== "default") {
        throw new Error(`target project not found: ${boardId}`);
      }
      await this.assertProjectCanReceiveCards(boardId);
      await this.ensureProjectDirect(boardId);
      const milestoneId = normalizeOptionalString(input.milestoneId);
      if (boardId !== currentBoardId && !milestoneId) {
        throw new Error("target milestone is required when moving a card to another project.");
      }
      if (milestoneId) {
        const milestone = await this.milestoneStore.lookup(milestoneId);
        if (!milestone?.milestone || milestone.milestone.boardId !== boardId || milestone.milestone.state !== "active") {
          throw new Error("target milestone must be an active milestone in the target project.");
        }
      }
      const position = input.position === void 0 ? Math.max(
        0,
        ...(await this.list({ boardId })).filter((candidate) => candidate.id !== card.id && candidate.milestoneId === milestoneId).map((candidate) => candidate.position)
      ) + POSITION_STEP : normalizePosition(input.position, card.position);
      const next = removeUndefinedCardFields({
        ...card,
        ...milestoneId ? { milestoneId } : {},
        position,
        updatedAt: Date.now(),
        metadata: {
          ...card.metadata,
          automation: {
            ...card.metadata?.automation,
            boardId
          }
        }
      });
      if (!milestoneId) {
        delete next.milestoneId;
      }
      next.events = appendEvent(next, {
        kind: "milestone_moved",
        ...card.milestoneId ? { fromMilestoneId: card.milestoneId } : {},
        ...milestoneId ? { toMilestoneId: milestoneId } : {}
      });
      await this.persistCard(next, card.revision);
      return next;
    });
  }
  async listProjectDocuments(boardId, options = {}) {
    const normalizedBoardId = normalizeBoardIdRequired(boardId);
    return await this.enqueueMutation(async () => {
      const board = await this.ensureProjectDirect(normalizedBoardId);
      await this.removeLegacyGeneratedProjectDocumentsDirect(board);
      await this.discoverProjectDocumentsDirect(board);
      const documents = (await this.documentStore.entries()).map((entry) => entry.value).filter(
        (entry) => entry?.version === 1 && entry.document?.boardId === normalizedBoardId
      ).map((entry) => presentProjectDocument(entry.document)).filter((document) => options.includeHidden === true || !document.hiddenAt).toSorted(
        (left, right) => left.section.localeCompare(right.section) || left.position - right.position || left.createdAt - right.createdAt
      );
      return { documents };
    });
  }
  async getProjectDocument(id) {
    const entry = await this.documentStore.lookup(id.trim());
    if (!entry?.document) {
      throw new Error(`project document not found: ${id}`);
    }
    return presentProjectDocument(entry.document);
  }
  async createProjectDocument(input) {
    return await this.enqueueMutation(async () => {
      const boardId = normalizeBoardIdRequired(input.boardId);
      await this.assertProjectCanReceiveCards(boardId);
      await this.ensureProjectDirect(boardId);
      const key = normalizeDocumentKey(input.key);
      if (hasReservedAutomaticDocumentKeyPrefix(key)) {
        throw new Error("document key prefixes file. and ai. are reserved for automatic documents.");
      }
      const section = normalizeDocumentSection(input.section);
      const type = normalizeDocumentType(input.type);
      const title = normalizeTitle(input.title);
      const summary = normalizeBoundedString(input.summary, void 0, 1e3, "document summary");
      const body = normalizeDocumentBody(input, type);
      const entries = await this.documentStore.entries();
      if (entries.some(
        (entry) => entry.value?.version === 1 && entry.value.document.boardId === boardId && entry.value.document.key === key
      )) {
        throw new Error(`project document key already exists: ${key}`);
      }
      const sameSection = entries.map((entry) => entry.value).filter(
        (entry) => entry?.version === 1 && entry.document.boardId === boardId && entry.document.section === section
      );
      const now = Date.now();
      const document = {
        id: randomUUID12(),
        boardId,
        key,
        section,
        source: "project",
        type,
        title,
        position: input.position === void 0 ? Math.max(0, ...sameSection.map((entry) => entry.document.position)) + POSITION_STEP : normalizePosition(input.position, POSITION_STEP),
        createdAt: now,
        updatedAt: now,
        ...summary ? { summary } : {},
        ...body
      };
      await this.documentStore.register(document.id, { version: 1, document });
      return document;
    });
  }
  async updateProjectDocument(id, input) {
    return await this.enqueueMutation(async () => {
      const entry = await this.documentStore.lookup(id.trim());
      if (!entry?.document) {
        throw new Error(`project document not found: ${id}`);
      }
      const existing = entry.document;
      await this.assertProjectCanReceiveCards(existing.boardId);
      const type = normalizeDocumentType(input.type, existing.type);
      const title = input.title === void 0 ? existing.title : normalizeTitle(input.title);
      const summary = input.summary === void 0 ? existing.summary : normalizeBoundedString(input.summary, void 0, 1e3, "document summary");
      const body = normalizeDocumentBody(input, type, existing);
      const next = {
        ...existing,
        type,
        title,
        updatedAt: Date.now(),
        ...summary ? { summary } : {},
        ...body
      };
      if (!summary) {
        delete next.summary;
      }
      if (!body.target) {
        delete next.target;
      }
      if (!body.content) {
        delete next.content;
      }
      await this.documentStore.register(next.id, { version: 1, document: next });
      return next;
    });
  }
  async hideProjectDocument(id, hidden = true) {
    return await this.enqueueMutation(async () => {
      const entry = await this.documentStore.lookup(id.trim());
      if (!entry?.document) {
        throw new Error(`project document not found: ${id}`);
      }
      const next = {
        ...entry.document,
        updatedAt: Date.now(),
        ...hidden === false ? {} : { hiddenAt: Date.now() }
      };
      if (hidden === false) {
        delete next.hiddenAt;
      }
      await this.documentStore.register(next.id, { version: 1, document: next });
      return next;
    });
  }
  async deleteProjectDocument(id) {
    return await this.enqueueMutation(async () => {
      const entry = await this.documentStore.lookup(id.trim());
      if (!entry?.document) {
        return { deleted: false };
      }
      return { deleted: await this.documentStore.delete(entry.document.id) };
    });
  }
  async reorderProjectDocuments(input) {
    const boardId = normalizeBoardIdRequired(input.boardId);
    if (!Array.isArray(input.documentIds) || input.documentIds.length === 0 || input.documentIds.some((id) => typeof id !== "string")) {
      throw new Error("document ids are required.");
    }
    return await this.enqueueMutation(async () => {
      const ids = input.documentIds;
      if (new Set(ids).size !== ids.length) {
        throw new Error("document ids must not contain duplicates.");
      }
      const entries = await Promise.all(ids.map((id) => this.documentStore.lookup(id)));
      const documents = entries.map((entry, index) => {
        if (!entry?.document || entry.document.boardId !== boardId) {
          throw new Error(`project document does not belong to project: ${ids[index]}`);
        }
        return entry.document;
      });
      const section = documents[0]?.section;
      if (!section || documents.some((document) => document.section !== section)) {
        throw new Error("project documents can only be reordered within one section.");
      }
      const now = Date.now();
      const reordered = documents.map((document, index) => ({
        ...document,
        position: (index + 1) * POSITION_STEP,
        updatedAt: now
      }));
      for (const document of reordered) {
        await this.documentStore.register(document.id, { version: 1, document });
      }
      return { documents: reordered };
    });
  }
  async update(id, patch, options = {}) {
    const raw = patch;
    if (Object.hasOwn(raw, "boardId") || Object.hasOwn(raw, "milestoneId") || Object.hasOwn(raw, "position")) {
      throw new Error("use the dedicated project or milestone move operation for card placement.");
    }
    return await super.update(id, patch, options);
  }
  async deleteBoard(id) {
    const boardId = normalizeBoardIdRequired(id);
    if ((await this.listMilestonesDirect(boardId)).length > 0 || (await this.documentStore.entries()).some(
      (entry) => entry.value?.version === 1 && entry.value.document.boardId === boardId
    )) {
      throw new Error("initialized projects cannot be permanently deleted.");
    }
    return await super.deleteBoard(boardId);
  }
  async createDirect(input, scope, options) {
    const parentId = normalizeOptionalString(input.createdByCardId) ?? (Array.isArray(input.parents) ? input.parents.find(
      (value) => typeof value === "string" && value.trim() !== ""
    ) : void 0);
    const parent = parentId ? await this.get(parentId) : void 0;
    const inheritedBoardId = parent ? cardBoardId(parent) : void 0;
    const boardId = normalizeBoardId(input.boardId, inheritedBoardId) ?? "default";
    const milestoneId = normalizeOptionalString(input.milestoneId) ?? parent?.milestoneId;
    await this.assertProjectCanReceiveCards(boardId);
    const board = await this.ensureBoardDirect(boardId);
    if (milestoneId) {
      const milestone = await this.milestoneStore.lookup(milestoneId);
      if (!milestone?.milestone || milestone.milestone.boardId !== boardId || milestone.milestone.state !== "active") {
        throw new Error("milestone must be an active milestone in the target project.");
      }
    }
    return await super.createDirect(
      {
        ...input,
        boardId,
        ...milestoneId ? { milestoneId } : {},
        ...!input.workspace && board.defaultWorkspace ? { workspace: board.defaultWorkspace } : {}
      },
      scope,
      options
    );
  }
};

// ../core/src/store-dispatch.ts
var TaskfoldDispatchStore = class extends TaskfoldProjectStore {
  async shouldAutoOrchestrate(card) {
    if (card.status !== "triage" || card.metadata?.archivedAt || card.metadata?.workerProtocol?.state === "idle") {
      return false;
    }
    const board = await this.boardStore.lookup(cardBoardId(card));
    return board?.version === 1 && board.board.orchestration?.autoDecompose === true;
  }
  async dispatch(input = Date.now()) {
    const now = typeof input === "number" ? input : normalizeTimestamp(input.now, Date.now());
    const boardId = typeof input === "number" ? void 0 : normalizeBoardId(input.boardId);
    return await this.enqueueMutation(async () => {
      const promoted = [];
      const reclaimed = [];
      const blocked = [];
      const orchestrated = [];
      const orchestratedByBoard = /* @__PURE__ */ new Map();
      for (const card of await this.list({ boardId })) {
        try {
          if (await this.isProjectArchived(cardBoardId(card))) {
            continue;
          }
          if (card.metadata?.archivedAt) {
            continue;
          }
          let latest = await this.promoteDependencyReady(card.id, now);
          const wasPromoted = latest.status !== card.status;
          const claim = latest.metadata?.claim;
          const latestAttempt = latestRunningAttempt(latest);
          const maxRuntimeSeconds = latest.metadata?.automation?.maxRuntimeSeconds;
          const runtimeStartedAt = latestAttempt?.startedAt ?? claim?.claimedAt ?? latest.startedAt;
          const timedOut = Boolean(maxRuntimeSeconds && runtimeStartedAt) && now - runtimeStartedAt > secondsToDurationMs(maxRuntimeSeconds);
          const claimExpired = isTaskfoldClaimReclaimable(claim, now);
          const retriesExhausted = retryBudgetExhausted(latest);
          if (latest.status === "running" && (timedOut || claimExpired)) {
            const reason = timedOut ? "Run exceeded the card max runtime." : "Claim expired without a recent heartbeat.";
            const execution = latest.execution?.status === "running" ? { ...latest.execution, status: "blocked", updatedAt: now } : latest.execution;
            latest = await this.updateCard(latest.id, {
              status: "blocked",
              ...execution ? { execution } : {},
              metadata: {
                ...latest.metadata,
                claim: void 0,
                attempts: closeRunningAttempts(latest.metadata?.attempts, now, "blocked", reason),
                failureCount: (latest.metadata?.failureCount ?? 0) + 1,
                notifications: [
                  ...latest.metadata?.notifications ?? [],
                  {
                    id: randomUUID13(),
                    kind: "failed",
                    createdAt: now,
                    sequence: this.nextNotificationSequence(now),
                    message: reason
                  }
                ].slice(-MAX_CARD_NOTIFICATIONS)
              }
            }, { expectedRevision: latest.revision });
            blocked.push(latest);
          } else if (claimExpired) {
            latest = await this.updateCard(latest.id, {
              metadata: { ...latest.metadata, claim: void 0 }
            }, { expectedRevision: latest.revision });
            reclaimed.push(latest);
          }
          if (!latest.metadata?.claim && retriesExhausted && isDependencyPromotableStatus(latest.status)) {
            latest = await this.updateCard(latest.id, {
              status: "blocked",
              metadata: {
                ...latest.metadata,
                notifications: [
                  ...latest.metadata?.notifications ?? [],
                  {
                    id: randomUUID13(),
                    kind: "failed",
                    createdAt: now,
                    sequence: this.nextNotificationSequence(now),
                    message: "Card exhausted its retry budget."
                  }
                ].slice(-MAX_CARD_NOTIFICATIONS)
              }
            }, { expectedRevision: latest.revision });
            blocked.push(latest);
          }
          if (latest.status === "ready" && !latest.metadata?.archivedAt) {
            latest = await this.recordDispatch(latest, now);
          }
          if (await this.shouldAutoOrchestrate(latest)) {
            const latestBoardId = cardBoardId(latest);
            const board = await this.boardStore.lookup(latestBoardId);
            const cap = board?.board.orchestration?.autoDecomposePerDispatch ?? 3;
            const boardCount = orchestratedByBoard.get(latestBoardId) ?? 0;
            if (boardCount < cap) {
              latest = await this.recordOrchestrationCandidate(latest, now);
              orchestrated.push(latest);
              orchestratedByBoard.set(latestBoardId, boardCount + 1);
            }
          }
          if (wasPromoted && latest.status !== "blocked") {
            promoted.push(latest);
          }
        } catch (error) {
          if (error instanceof TaskfoldRevisionConflictError) {
            continue;
          }
          throw error;
        }
      }
      return {
        promoted,
        reclaimed,
        blocked,
        orchestrated,
        count: promoted.length + reclaimed.length + blocked.length + orchestrated.length
      };
    });
  }
  async bulkUpdate(input) {
    const ids = Array.isArray(input.ids) ? input.ids.filter((id) => typeof id === "string" && id.trim() !== "") : [];
    if (ids.length === 0) {
      throw new Error("ids are required.");
    }
    const patch = input.patch && typeof input.patch === "object" && !Array.isArray(input.patch) ? input.patch : {};
    const cards = [];
    for (const id of ids) {
      const updated = input.archived === void 0 ? await this.update(id, patch) : await this.archive(id, input.archived);
      cards.push(updated);
    }
    return { cards };
  }
  async archive(id, archived) {
    const shouldArchive = archived !== false;
    return await this.updateMetadata(id, (existing) => ({
      ...existing.metadata,
      archivedAt: shouldArchive ? Date.now() : 0
    }));
  }
  async exportCards() {
    const cards = await this.list();
    const attachments = cards.flatMap((card) => card.metadata?.attachments ?? []);
    return { cards, attachments, exportedAt: Date.now() };
  }
  async diagnostics(now = Date.now()) {
    const cards = await this.list();
    const rows = cards.flatMap((card) => {
      const diagnostics = computeCardDiagnostics(card, now);
      return diagnostics.length ? [{ card, diagnostics }] : [];
    });
    return {
      diagnostics: rows,
      count: rows.reduce((total, row) => total + row.diagnostics.length, 0)
    };
  }
  async refreshDiagnostics(now = Date.now()) {
    return await this.enqueueMutation(async () => {
      const cards = await this.list();
      const rows = [];
      for (const card of cards) {
        const latest = await this.get(card.id);
        if (!latest || latest.metadata?.archivedAt) {
          continue;
        }
        const diagnostics = mergeDiagnostics(
          latest.metadata?.diagnostics,
          computeCardDiagnostics(latest, now)
        );
        if (diagnostics.length === 0 && !latest.metadata?.diagnostics?.length) {
          continue;
        }
        const metadata = trimMetadataToBudget({ ...latest.metadata, diagnostics });
        const next = removeUndefinedCardFields({
          ...latest,
          metadata: metadataIsEmpty(metadata) ? void 0 : metadata
        });
        await this.persistCard(next, latest.revision);
        if (diagnostics.length > 0) {
          rows.push({ card: next, diagnostics });
        }
      }
      return {
        diagnostics: rows,
        count: rows.reduce((total, row) => total + row.diagnostics.length, 0)
      };
    });
  }
  async buildWorkerContext(id) {
    const card = await this.get(id);
    if (!card) {
      throw new Error(`card not found: ${id}`);
    }
    return buildWorkerContext(card, await this.list());
  }
};

// src/backend/src/store.ts
var TaskfoldStore = class _TaskfoldStore extends TaskfoldDispatchStore {
  /**
   * Single wiring point from any backend factory's KV stores to a card store --
   * `createTaskfoldFileStores`（生产唯一后端）与测试用的内存 store 都按
   * {@link TaskfoldBackendStores} 结构匹配，彼此不依赖。
   */
  static fromStores(stores) {
    return new _TaskfoldStore(stores.cards, {
      boards: stores.boards,
      milestones: stores.milestones,
      documents: stores.documents,
      subscriptions: stores.subscriptions,
      attachments: stores.attachments,
      dataVersion: stores.dataVersion,
      changeEpoch: stores.changeEpoch,
      reserveChangeRevisions: stores.reserveChangeRevisions,
      changeSource: stores.changeSource
    });
  }
};

// src/backend/src/tools.ts
import { jsonResult, readStringParam } from "openclaw/plugin-sdk/core";
import { safeEqualSecret as safeEqualSecret2 } from "openclaw/plugin-sdk/security-runtime";

// ../../node_modules/typebox/build/system/memory/memory.mjs
var memory_exports = {};
__export(memory_exports, {
  Assign: () => Assign,
  Clone: () => Clone,
  Create: () => Create,
  Discard: () => Discard,
  Metrics: () => Metrics,
  Update: () => Update
});

// ../../node_modules/typebox/build/system/memory/metrics.mjs
var Metrics = {
  assign: 0,
  create: 0,
  clone: 0,
  discard: 0,
  update: 0
};

// ../../node_modules/typebox/build/system/memory/assign.mjs
function Assign(left, right) {
  Metrics.assign += 1;
  return { ...left, ...right };
}

// ../../node_modules/typebox/build/guard/guard.mjs
var guard_exports = {};
__export(guard_exports, {
  Entries: () => Entries,
  EntriesRegExp: () => EntriesRegExp,
  Every: () => Every,
  EveryAll: () => EveryAll,
  GraphemeCount: () => GraphemeCount2,
  HasPropertyKey: () => HasPropertyKey,
  IsArray: () => IsArray,
  IsBigInt: () => IsBigInt,
  IsBoolean: () => IsBoolean,
  IsClassInstance: () => IsClassInstance,
  IsConstructor: () => IsConstructor,
  IsDeepEqual: () => IsDeepEqual,
  IsEqual: () => IsEqual,
  IsFunction: () => IsFunction,
  IsGreaterEqualThan: () => IsGreaterEqualThan,
  IsGreaterThan: () => IsGreaterThan,
  IsInteger: () => IsInteger,
  IsLessEqualThan: () => IsLessEqualThan,
  IsLessThan: () => IsLessThan,
  IsMaxLength: () => IsMaxLength2,
  IsMinLength: () => IsMinLength2,
  IsMultipleOf: () => IsMultipleOf,
  IsNull: () => IsNull,
  IsNumber: () => IsNumber,
  IsObject: () => IsObject,
  IsObjectNotArray: () => IsObjectNotArray,
  IsString: () => IsString,
  IsSymbol: () => IsSymbol,
  IsUndefined: () => IsUndefined,
  IsUnsafePropertyKey: () => IsUnsafePropertyKey,
  IsValueLike: () => IsValueLike,
  Keys: () => Keys,
  ShiftLeft: () => ShiftLeft,
  Symbols: () => Symbols,
  Values: () => Values
});

// ../../node_modules/typebox/build/guard/string.mjs
function IsBetween(value, min, max) {
  return value >= min && value <= max;
}
function IsZeroWidthJoiner(value) {
  return value === 8205;
}
function IsHighSurrogate(value) {
  return IsBetween(value, 55296, 56319);
}
function IsRegionalIndicator(value) {
  return IsBetween(value, 127462, 127487);
}
function IsVariationSelector(value) {
  return IsBetween(value, 65024, 65039);
}
function IsCombiningMark(value) {
  return IsBetween(value, 768, 879) || IsBetween(value, 6832, 6911) || IsBetween(value, 7616, 7679) || IsBetween(value, 65056, 65071);
}
function CodePointLength(value) {
  return value > 65535 ? 2 : 1;
}
function ConsumeModifiers(value, index) {
  while (index < value.length) {
    const point = value.codePointAt(index);
    if (IsCombiningMark(point) || IsVariationSelector(point)) {
      index += CodePointLength(point);
    } else {
      break;
    }
  }
  return index;
}
function NextGraphemeClusterIndex(value, clusterStart) {
  const startCP = value.codePointAt(clusterStart);
  let clusterEnd = clusterStart + CodePointLength(startCP);
  clusterEnd = ConsumeModifiers(value, clusterEnd);
  while (clusterEnd < value.length - 1 && value[clusterEnd] === "\u200D") {
    const nextCP = value.codePointAt(clusterEnd + 1);
    clusterEnd += 1 + CodePointLength(nextCP);
    clusterEnd = ConsumeModifiers(value, clusterEnd);
  }
  if (IsRegionalIndicator(startCP) && clusterEnd < value.length && IsRegionalIndicator(value.codePointAt(clusterEnd))) {
    clusterEnd += CodePointLength(value.codePointAt(clusterEnd));
  }
  return clusterEnd;
}
function IsGraphemeCodePoint(value) {
  return IsHighSurrogate(value) || IsCombiningMark(value) || IsVariationSelector(value) || IsZeroWidthJoiner(value);
}
function GraphemeCount(value) {
  let count = 0;
  let index = 0;
  while (index < value.length) {
    index = NextGraphemeClusterIndex(value, index);
    count++;
  }
  return count;
}
function IsMinLength(value, minLength) {
  if (minLength === 0)
    return true;
  let count = 0;
  let index = 0;
  while (index < value.length) {
    index = NextGraphemeClusterIndex(value, index);
    count++;
    if (count >= minLength)
      return true;
  }
  return false;
}
function IsMaxLength(value, maxLength) {
  let count = 0;
  let index = 0;
  while (index < value.length) {
    index = NextGraphemeClusterIndex(value, index);
    count++;
    if (count > maxLength)
      return false;
  }
  return true;
}
function IsMinLengthFast(value, minLength) {
  if (minLength === 0)
    return true;
  let index = 0;
  while (index < value.length) {
    if (IsGraphemeCodePoint(value.charCodeAt(index))) {
      return IsMinLength(value, minLength);
    }
    index++;
    if (index >= minLength)
      return true;
  }
  return false;
}
function IsMaxLengthFast(value, maxLength) {
  let index = 0;
  while (index < value.length) {
    if (IsGraphemeCodePoint(value.charCodeAt(index))) {
      return IsMaxLength(value, maxLength);
    }
    index++;
    if (index > maxLength)
      return false;
  }
  return true;
}

// ../../node_modules/typebox/build/guard/guard.mjs
function IsArray(value) {
  return Array.isArray(value);
}
function IsBigInt(value) {
  return IsEqual(typeof value, "bigint");
}
function IsBoolean(value) {
  return IsEqual(typeof value, "boolean");
}
function IsConstructor(value) {
  if (IsUndefined(value) || !IsFunction(value))
    return false;
  const result = Function.prototype.toString.call(value);
  if (/^class\s/.test(result))
    return true;
  if (/\[native code\]/.test(result))
    return true;
  return false;
}
function IsFunction(value) {
  return IsEqual(typeof value, "function");
}
function IsInteger(value) {
  return Number.isInteger(value);
}
function IsNull(value) {
  return IsEqual(value, null);
}
function IsNumber(value) {
  return Number.isFinite(value);
}
function IsObjectNotArray(value) {
  return IsObject(value) && !IsArray(value);
}
function IsObject(value) {
  return IsEqual(typeof value, "object") && !IsNull(value);
}
function IsString(value) {
  return IsEqual(typeof value, "string");
}
function IsSymbol(value) {
  return IsEqual(typeof value, "symbol");
}
function IsUndefined(value) {
  return IsEqual(value, void 0);
}
function IsEqual(left, right) {
  return left === right;
}
function IsGreaterThan(left, right) {
  return left > right;
}
function IsLessThan(left, right) {
  return left < right;
}
function IsLessEqualThan(left, right) {
  return left <= right;
}
function IsGreaterEqualThan(left, right) {
  return left >= right;
}
function IsMultipleOf(dividend, divisor) {
  if (IsBigInt(dividend) || IsBigInt(divisor)) {
    return BigInt(dividend) % BigInt(divisor) === 0n;
  }
  const tolerance = 1e-10;
  if (!IsNumber(dividend))
    return true;
  if (IsInteger(dividend) && 1 / divisor % 1 === 0)
    return true;
  const mod = dividend % divisor;
  return Math.min(Math.abs(mod), Math.abs(mod - divisor), Math.abs(mod + divisor)) < tolerance;
}
function IsClassInstance(value) {
  if (!IsObject(value))
    return false;
  const proto = globalThis.Object.getPrototypeOf(value);
  if (IsNull(proto))
    return false;
  return IsEqual(typeof proto.constructor, "function") && !(IsEqual(proto.constructor, globalThis.Object) || IsEqual(proto.constructor.name, "Object"));
}
function IsValueLike(value) {
  return IsBigInt(value) || IsBoolean(value) || IsNull(value) || IsNumber(value) || IsString(value) || IsUndefined(value);
}
function GraphemeCount2(value) {
  return GraphemeCount(value);
}
function IsMaxLength2(value, length) {
  return IsMaxLengthFast(value, length);
}
function IsMinLength2(value, length) {
  return IsMinLengthFast(value, length);
}
function Every(value, offset, callback) {
  for (let index = offset; index < value.length; index++) {
    if (!callback(value[index], index))
      return false;
  }
  return true;
}
function EveryAll(value, offset, callback) {
  let result = true;
  for (let index = offset; index < value.length; index++) {
    if (!callback(value[index], index))
      result = false;
  }
  return result;
}
function ShiftLeft(array, true_, false_) {
  return IsEqual(array.length, 0) ? false_() : true_(array[0], array.slice(1));
}
function IsUnsafePropertyKey(key) {
  return IsEqual(key, "__proto__") || IsEqual(key, "constructor") || IsEqual(key, "prototype");
}
function HasPropertyKey(value, key) {
  return IsUnsafePropertyKey(key) ? Object.prototype.hasOwnProperty.call(value, key) : key in value;
}
function EntriesRegExp(value) {
  return Keys(value).map((key) => [new RegExp(`^${key}$`), value[key]]);
}
function Entries(value) {
  return Object.entries(value);
}
function Keys(value) {
  return Object.getOwnPropertyNames(value);
}
function Symbols(value) {
  return Object.getOwnPropertySymbols(value);
}
function Values(value) {
  return Object.values(value);
}
function DeepEqualObject(left, right) {
  if (!IsObject(right))
    return false;
  const keys = Keys(left);
  return IsEqual(keys.length, Keys(right).length) && keys.every((key) => IsDeepEqual(left[key], right[key]));
}
function DeepEqualArray(left, right) {
  return IsArray(right) && IsEqual(left.length, right.length) && left.every((_, index) => IsDeepEqual(left[index], right[index]));
}
function IsDeepEqual(left, right) {
  return IsArray(left) ? DeepEqualArray(left, right) : IsObject(left) ? DeepEqualObject(left, right) : IsEqual(left, right);
}

// ../../node_modules/typebox/build/guard/globals.mjs
var globals_exports = {};
__export(globals_exports, {
  IsBigInt64Array: () => IsBigInt64Array,
  IsBigUint64Array: () => IsBigUint64Array,
  IsBoolean: () => IsBoolean2,
  IsDate: () => IsDate,
  IsFloat32Array: () => IsFloat32Array,
  IsFloat64Array: () => IsFloat64Array,
  IsInt16Array: () => IsInt16Array,
  IsInt32Array: () => IsInt32Array,
  IsInt8Array: () => IsInt8Array,
  IsMap: () => IsMap,
  IsNumber: () => IsNumber2,
  IsRegExp: () => IsRegExp,
  IsSet: () => IsSet,
  IsString: () => IsString2,
  IsTypeArray: () => IsTypeArray,
  IsUint16Array: () => IsUint16Array,
  IsUint32Array: () => IsUint32Array,
  IsUint8Array: () => IsUint8Array,
  IsUint8ClampedArray: () => IsUint8ClampedArray
});
function IsBoolean2(value) {
  return value instanceof Boolean;
}
function IsNumber2(value) {
  return value instanceof Number;
}
function IsString2(value) {
  return value instanceof String;
}
function IsTypeArray(value) {
  return globalThis.ArrayBuffer.isView(value);
}
function IsInt8Array(value) {
  return value instanceof globalThis.Int8Array;
}
function IsUint8Array(value) {
  return value instanceof globalThis.Uint8Array;
}
function IsUint8ClampedArray(value) {
  return value instanceof globalThis.Uint8ClampedArray;
}
function IsInt16Array(value) {
  return value instanceof globalThis.Int16Array;
}
function IsUint16Array(value) {
  return value instanceof globalThis.Uint16Array;
}
function IsInt32Array(value) {
  return value instanceof globalThis.Int32Array;
}
function IsUint32Array(value) {
  return value instanceof globalThis.Uint32Array;
}
function IsFloat32Array(value) {
  return value instanceof globalThis.Float32Array;
}
function IsFloat64Array(value) {
  return value instanceof globalThis.Float64Array;
}
function IsBigInt64Array(value) {
  return value instanceof globalThis.BigInt64Array;
}
function IsBigUint64Array(value) {
  return value instanceof globalThis.BigUint64Array;
}
function IsRegExp(value) {
  return value instanceof globalThis.RegExp;
}
function IsDate(value) {
  return value instanceof globalThis.Date;
}
function IsSet(value) {
  return value instanceof globalThis.Set;
}
function IsMap(value) {
  return value instanceof globalThis.Map;
}

// ../../node_modules/typebox/build/system/memory/clone.mjs
function FromClassInstance(value) {
  return value;
}
function IsTypeObject(value) {
  return guard_exports.HasPropertyKey(value, "~kind") || guard_exports.HasPropertyKey(value, "~unsafe");
}
function FromTypeObject(value) {
  const result = {};
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Object.keys(descriptors)) {
    if (guard_exports.IsUnsafePropertyKey(key))
      continue;
    const descriptor = descriptors[key];
    if (guard_exports.HasPropertyKey(descriptor, "value")) {
      Object.defineProperty(result, key, { ...descriptor, value: FromValue(descriptor.value) });
    }
  }
  return result;
}
function FromPlainObject(value) {
  const result = {};
  for (const key of guard_exports.Keys(value)) {
    if (guard_exports.IsUnsafePropertyKey(key))
      continue;
    result[key] = FromValue(value[key]);
  }
  for (const key of guard_exports.Symbols(value)) {
    result[key] = FromValue(value[key]);
  }
  return result;
}
function FromObject(value) {
  return guard_exports.IsClassInstance(value) ? FromClassInstance(value) : IsTypeObject(value) ? FromTypeObject(value) : FromPlainObject(value);
}
function FromArray(value) {
  return value.map((element) => FromValue(element));
}
function FromTypedArray(value) {
  return value.slice();
}
function FromRegExp(value) {
  return new RegExp(value.source, value.flags);
}
function FromMap(value) {
  return new Map(FromValue([...value.entries()]));
}
function FromSet(value) {
  return new Set(FromValue([...value.values()]));
}
function FromValue(value) {
  return globals_exports.IsTypeArray(value) ? FromTypedArray(value) : globals_exports.IsRegExp(value) ? FromRegExp(value) : globals_exports.IsMap(value) ? FromMap(value) : globals_exports.IsSet(value) ? FromSet(value) : guard_exports.IsArray(value) ? FromArray(value) : guard_exports.IsObject(value) ? FromObject(value) : value;
}
function Clone(value) {
  Metrics.clone += 1;
  return FromValue(value);
}

// ../../node_modules/typebox/build/system/settings/settings.mjs
var settings_exports = {};
__export(settings_exports, {
  Get: () => Get,
  Reset: () => Reset,
  Set: () => Set2
});
var settings = {
  immutableTypes: false,
  maxErrors: 8,
  useAcceleration: true,
  exactOptionalPropertyTypes: false,
  enumerableKind: false,
  correctiveParse: false,
  unionPrioritySort: true
};
function Reset() {
  settings.immutableTypes = false;
  settings.maxErrors = 8;
  settings.useAcceleration = true;
  settings.exactOptionalPropertyTypes = false;
  settings.enumerableKind = false;
  settings.correctiveParse = false;
  settings.unionPrioritySort = true;
}
function Set2(options) {
  for (const key of guard_exports.Keys(options)) {
    const value = options[key];
    if (value !== void 0) {
      Object.defineProperty(settings, key, { value });
    }
  }
}
function Get() {
  return settings;
}

// ../../node_modules/typebox/build/system/memory/create.mjs
function MergeHidden(left, right) {
  for (const key of Object.keys(right)) {
    Object.defineProperty(left, key, {
      configurable: true,
      writable: true,
      enumerable: false,
      value: right[key]
    });
  }
  return left;
}
function Merge(left, right) {
  return { ...left, ...right };
}
function Create(hidden, enumerable, options = {}) {
  Metrics.create += 1;
  const settings2 = settings_exports.Get();
  const withOptions = Merge(enumerable, options);
  const withHidden = settings2.enumerableKind ? Merge(withOptions, hidden) : MergeHidden(withOptions, hidden);
  return settings2.immutableTypes ? Object.freeze(withHidden) : withHidden;
}

// ../../node_modules/typebox/build/system/memory/discard.mjs
function Discard(value, propertyKeys) {
  Metrics.discard += 1;
  const result = {};
  const descriptors = Object.getOwnPropertyDescriptors(Clone(value));
  const keysToDiscard = new Set(propertyKeys);
  for (const key of Object.keys(descriptors)) {
    if (keysToDiscard.has(key))
      continue;
    Object.defineProperty(result, key, descriptors[key]);
  }
  return result;
}

// ../../node_modules/typebox/build/system/memory/update.mjs
function Update(current, hidden, enumerable) {
  Metrics.update += 1;
  const settings2 = settings_exports.Get();
  const result = Clone(current);
  for (const key of Object.keys(hidden)) {
    Object.defineProperty(result, key, {
      configurable: true,
      writable: true,
      enumerable: settings2.enumerableKind,
      value: hidden[key]
    });
  }
  for (const key of Object.keys(enumerable)) {
    Object.defineProperty(result, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: enumerable[key]
    });
  }
  return result;
}

// ../../node_modules/typebox/build/type/types/schema.mjs
function IsKind(value, kind) {
  return guard_exports.IsObject(value) && guard_exports.HasPropertyKey(value, "~kind") && guard_exports.IsEqual(value["~kind"], kind);
}
function IsSchema(value) {
  return guard_exports.IsObject(value);
}

// ../../node_modules/typebox/build/type/types/deferred.mjs
function Deferred(action, parameters, options) {
  return memory_exports.Create({ "~kind": "Deferred" }, { type: "deferred", action, parameters, options }, {});
}
function IsDeferred(value) {
  return IsKind(value, "Deferred");
}

// ../../node_modules/typebox/build/type/engine/readonly/instantiate_add.mjs
function AddReadonlyOperation(type) {
  return memory_exports.Update(type, { "~readonly": true }, {});
}
function AddReadonlyAction(type, options) {
  const result = memory_exports.Update(AddReadonlyOperation(type), {}, options);
  return result;
}
function AddReadonlyInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return AddReadonlyAction(instantiatedType, options);
}

// ../../node_modules/typebox/build/type/engine/optional/instantiate_add.mjs
function AddOptionalOperation(type) {
  return memory_exports.Update(type, { "~optional": true }, {});
}
function AddOptionalAction(type, options) {
  const result = memory_exports.Update(AddOptionalOperation(type), {}, options);
  return result;
}
function AddOptionalInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return AddOptionalAction(instantiatedType, options);
}

// ../../node_modules/typebox/build/type/types/array.mjs
function _Array_(items, options) {
  return memory_exports.Create({ "~kind": "Array" }, { type: "array", items }, options);
}
function IsArray2(value) {
  return IsKind(value, "Array");
}
function ArrayOptions(type) {
  return memory_exports.Discard(type, ["~kind", "type", "items"]);
}

// ../../node_modules/typebox/build/type/types/constructor.mjs
function Constructor(parameters, instanceType, options = {}) {
  return memory_exports.Create({ "~kind": "Constructor" }, { type: "constructor", parameters, instanceType }, options);
}
function IsConstructor2(value) {
  return IsKind(value, "Constructor");
}
function ConstructorOptions(type) {
  return memory_exports.Discard(type, ["~kind", "type", "parameters", "instanceType"]);
}

// ../../node_modules/typebox/build/type/types/function.mjs
function _Function_(parameters, returnType, options = {}) {
  return memory_exports.Create({ ["~kind"]: "Function" }, { type: "function", parameters, returnType }, options);
}
function IsFunction2(value) {
  return IsKind(value, "Function");
}
function FunctionOptions(type) {
  return memory_exports.Discard(type, ["~kind", "type", "parameters", "returnType"]);
}

// ../../node_modules/typebox/build/type/types/ref.mjs
function Ref(ref, options) {
  return memory_exports.Create({ ["~kind"]: "Ref" }, { $ref: ref }, options);
}
function IsRef(value) {
  return IsKind(value, "Ref");
}

// ../../node_modules/typebox/build/type/types/generic.mjs
function Generic(parameters, expression) {
  return memory_exports.Create({ "~kind": "Generic" }, { type: "generic", parameters, expression });
}
function IsGeneric(value) {
  return IsKind(value, "Generic");
}

// ../../node_modules/typebox/build/type/types/any.mjs
function Any(options) {
  return memory_exports.Create({ ["~kind"]: "Any" }, {}, options);
}
function IsAny(value) {
  return IsKind(value, "Any");
}

// ../../node_modules/typebox/build/type/types/never.mjs
var NeverPattern = "(?!)";
function Never(options) {
  return memory_exports.Create({ "~kind": "Never" }, { not: {} }, options);
}
function IsNever(value) {
  return IsKind(value, "Never");
}

// ../../node_modules/typebox/build/type/action/_add_optional.mjs
function AddOptionalDeferred(type, options = {}) {
  return Deferred("AddOptional", [type], options);
}
function AddOptional(type, options = {}) {
  return AddOptionalAction(type, options);
}

// ../../node_modules/typebox/build/type/types/_optional.mjs
function Optional(type) {
  return AddOptional(type);
}
function IsOptional(value) {
  return IsSchema(value) && guard_exports.HasPropertyKey(value, "~optional");
}

// ../../node_modules/typebox/build/type/types/properties.mjs
function RequiredArray(properties) {
  return guard_exports.Keys(properties).filter((key) => !IsOptional(properties[key]));
}
function PropertyKeys(properties) {
  return guard_exports.Keys(properties);
}
function PropertyValues(properties) {
  return guard_exports.Values(properties);
}

// ../../node_modules/typebox/build/type/types/object.mjs
function _Object_(properties, options = {}) {
  const requiredKeys = RequiredArray(properties);
  const required = requiredKeys.length > 0 ? { required: requiredKeys } : {};
  return memory_exports.Create({ "~kind": "Object" }, { type: "object", ...required, properties }, options);
}
function IsObject2(value) {
  return IsKind(value, "Object");
}
function ObjectOptions(type) {
  return memory_exports.Discard(type, ["~kind", "type", "properties", "required"]);
}

// ../../node_modules/typebox/build/type/types/unknown.mjs
function Unknown(options) {
  return memory_exports.Create({ ["~kind"]: "Unknown" }, {}, options);
}
function IsUnknown(value) {
  return IsKind(value, "Unknown");
}

// ../../node_modules/typebox/build/type/types/cyclic.mjs
function Cyclic($defs, $ref, options) {
  const defs = guard_exports.Keys($defs).reduce((result, key) => {
    return { ...result, [key]: memory_exports.Update($defs[key], {}, { $id: key }) };
  }, {});
  return memory_exports.Create({ ["~kind"]: "Cyclic" }, { $defs: defs, $ref }, options);
}
function IsCyclic(value) {
  return IsKind(value, "Cyclic");
}

// ../../node_modules/typebox/build/type/types/unsafe.mjs
function Unsafe(schema) {
  return memory_exports.Update(schema, { ["~unsafe"]: null }, {});
}
function IsUnsafe(value) {
  return guard_exports.IsObjectNotArray(value) && guard_exports.HasPropertyKey(value, "~unsafe") && guard_exports.IsNull(value["~unsafe"]);
}

// ../../node_modules/typebox/build/system/arguments/arguments.mjs
var arguments_exports = {};
__export(arguments_exports, {
  Match: () => Match
});
function Match(args, match) {
  return match[args.length]?.(...args) ?? (() => {
    throw Error("Invalid Arguments");
  })();
}

// ../../node_modules/typebox/build/type/types/infer.mjs
function Infer(...args) {
  const [name, extends_] = arguments_exports.Match(args, {
    2: (name2, extends_2) => [name2, extends_2, extends_2],
    1: (name2) => [name2, Unknown(), Unknown()]
  });
  return memory_exports.Create({ ["~kind"]: "Infer" }, { type: "infer", name, extends: extends_ }, {});
}
function IsInfer(value) {
  return IsKind(value, "Infer");
}

// ../../node_modules/typebox/build/type/types/dependent.mjs
function Dependent(if_, then_, else_, options = {}) {
  return memory_exports.Create({ "~kind": "Dependent" }, { if: if_, then: then_, else: else_ }, options);
}
function IsDependent(value) {
  return IsKind(value, "Dependent");
}
function DependentOptions(type) {
  return memory_exports.Discard(type, ["~kind", "if", "then", "else"]);
}

// ../../node_modules/typebox/build/type/engine/enum/typescript_enum_to_enum_values.mjs
function IsTypeScriptEnumLike(value) {
  return guard_exports.IsObjectNotArray(value);
}
function TypeScriptEnumToEnumValues(type) {
  const keys = guard_exports.Keys(type).filter((key) => isNaN(key));
  return keys.reduce((result, key) => [...result, type[key]], []);
}

// ../../node_modules/typebox/build/type/types/enum.mjs
function IsEnumValue(value) {
  return guard_exports.IsString(value) || guard_exports.IsNumber(value);
}
function Enum(value, options) {
  const values = IsTypeScriptEnumLike(value) ? TypeScriptEnumToEnumValues(value) : value;
  return memory_exports.Create({ "~kind": "Enum" }, { enum: values }, options);
}
function IsEnum(value) {
  return IsKind(value, "Enum");
}

// ../../node_modules/typebox/build/type/types/intersect.mjs
function Intersect(types, options = {}) {
  return memory_exports.Create({ "~kind": "Intersect" }, { allOf: types }, options);
}
function IsIntersect(value) {
  return IsKind(value, "Intersect");
}
function IntersectOptions(type) {
  return memory_exports.Discard(type, ["~kind", "allOf"]);
}

// ../../node_modules/typebox/build/system/unreachable/unreachable.mjs
function Unreachable() {
  throw new Error("Unreachable");
}

// ../../node_modules/typebox/build/system/hashing/hash.mjs
var ByteMarker;
(function(ByteMarker2) {
  ByteMarker2[ByteMarker2["Array"] = 0] = "Array";
  ByteMarker2[ByteMarker2["BigInt"] = 1] = "BigInt";
  ByteMarker2[ByteMarker2["Boolean"] = 2] = "Boolean";
  ByteMarker2[ByteMarker2["Date"] = 3] = "Date";
  ByteMarker2[ByteMarker2["Constructor"] = 4] = "Constructor";
  ByteMarker2[ByteMarker2["Function"] = 5] = "Function";
  ByteMarker2[ByteMarker2["Null"] = 6] = "Null";
  ByteMarker2[ByteMarker2["Number"] = 7] = "Number";
  ByteMarker2[ByteMarker2["Object"] = 8] = "Object";
  ByteMarker2[ByteMarker2["RegExp"] = 9] = "RegExp";
  ByteMarker2[ByteMarker2["String"] = 10] = "String";
  ByteMarker2[ByteMarker2["Symbol"] = 11] = "Symbol";
  ByteMarker2[ByteMarker2["TypeArray"] = 12] = "TypeArray";
  ByteMarker2[ByteMarker2["Undefined"] = 13] = "Undefined";
})(ByteMarker || (ByteMarker = {}));
var Accumulator = BigInt("14695981039346656037");
var [Prime, Size] = [BigInt("1099511628211"), BigInt(
  "18446744073709551616"
  /* 2 ^ 64 */
)];
var Bytes = Array.from({ length: 256 }).map((_, i) => BigInt(i));
var F64 = new Float64Array(1);
var F64In = new DataView(F64.buffer);
var F64Out = new Uint8Array(F64.buffer);
var encoder = new TextEncoder();

// ../../node_modules/typebox/build/type/types/_codec.mjs
var EncodeBuilder = class {
  constructor(type, decode) {
    this.type = type;
    this.decode = decode;
  }
  Encode(callback) {
    const type = this.type;
    const decode = IsCodec(type) ? (value) => this.decode(type["~codec"].decode(value)) : this.decode;
    const encode = IsCodec(type) ? (value) => type["~codec"].encode(callback(value)) : callback;
    const codec = { decode, encode };
    return memory_exports.Update(this.type, { "~codec": codec }, {});
  }
};
var DecodeBuilder = class {
  constructor(type) {
    this.type = type;
  }
  Decode(callback) {
    return new EncodeBuilder(this.type, callback);
  }
};
function Codec(type) {
  return new DecodeBuilder(type);
}
function Decode(type, callback) {
  return Codec(type).Decode(callback).Encode(() => {
    throw Error("Encode not implemented");
  });
}
function Encode(type, callback) {
  return Codec(type).Decode(() => {
    throw Error("Decode not implemented");
  }).Encode(callback);
}
function IsCodec(value) {
  return IsSchema(value) && guard_exports.HasPropertyKey(value, "~codec") && guard_exports.IsObject(value["~codec"]) && guard_exports.HasPropertyKey(value["~codec"], "encode") && guard_exports.HasPropertyKey(value["~codec"], "decode");
}

// ../../node_modules/typebox/build/type/types/_immutable.mjs
function Immutable(type) {
  return AddImmutable(type);
}
function IsImmutable(value) {
  return IsSchema(value) && guard_exports.HasPropertyKey(value, "~immutable");
}

// ../../node_modules/typebox/build/type/action/_add_readonly.mjs
function AddReadonlyDeferred(type, options = {}) {
  return Deferred("AddReadonly", [type], options);
}
function AddReadonly(type, options = {}) {
  return AddReadonlyAction(type, options);
}

// ../../node_modules/typebox/build/type/types/_readonly.mjs
function Readonly(type) {
  return AddReadonly(type);
}
function IsReadonly(value) {
  return IsSchema(value) && guard_exports.HasPropertyKey(value, "~readonly");
}

// ../../node_modules/typebox/build/type/types/_refine.mjs
function RefineAdd(type, refinement) {
  const refinements = IsRefine(type) ? [...type["~refine"], refinement] : [refinement];
  return memory_exports.Update(type, { "~refine": refinements }, {});
}
function Refine(...args) {
  const [type, check, error] = arguments_exports.Match(args, {
    3: (type2, check2, error2) => [type2, check2, error2],
    2: (type2, check2) => [type2, check2, () => "Refine Error"]
  });
  return RefineAdd(type, { check, error });
}
function IsRefinement(value) {
  return guard_exports.IsObjectNotArray(value) && guard_exports.HasPropertyKey(value, "check") && guard_exports.HasPropertyKey(value, "error") && guard_exports.IsFunction(value.check) && guard_exports.IsFunction(value.error);
}
function IsRefine(value) {
  return IsSchema(value) && guard_exports.HasPropertyKey(value, "~refine") && guard_exports.IsArray(value["~refine"]) && guard_exports.Every(value["~refine"], 0, (value2) => IsRefinement(value2));
}

// ../../node_modules/typebox/build/type/types/bigint.mjs
var BigIntPattern = "-?(?:0|[1-9][0-9]*)n";
function BigInt2(options) {
  return memory_exports.Create({ "~kind": "BigInt" }, { type: "bigint" }, options);
}
function IsBigInt2(value) {
  return IsKind(value, "BigInt");
}

// ../../node_modules/typebox/build/type/types/boolean.mjs
function Boolean2(options) {
  return memory_exports.Create({ "~kind": "Boolean" }, { type: "boolean" }, options);
}
function IsBoolean3(value) {
  return IsKind(value, "Boolean");
}

// ../../node_modules/typebox/build/type/types/identifier.mjs
function Identifier(name) {
  return memory_exports.Create({ "~kind": "Identifier" }, { name });
}
function IsIdentifier(value) {
  return IsKind(value, "Identifier");
}

// ../../node_modules/typebox/build/type/types/integer.mjs
var IntegerPattern = "-?(?:0|[1-9][0-9]*)";
function Integer(options) {
  return memory_exports.Create({ "~kind": "Integer" }, { type: "integer" }, options);
}
function IsInteger2(value) {
  return IsKind(value, "Integer");
}

// ../../node_modules/typebox/build/type/types/literal.mjs
var InvalidLiteralValue = class extends Error {
  constructor(value) {
    super(`Invalid Literal value`);
    Object.defineProperty(this, "cause", {
      value: { value },
      writable: false,
      configurable: false,
      enumerable: false
    });
  }
};
function LiteralTypeName(value) {
  return guard_exports.IsBigInt(value) ? "bigint" : guard_exports.IsBoolean(value) ? "boolean" : guard_exports.IsNumber(value) ? "number" : guard_exports.IsString(value) ? "string" : (() => {
    throw new InvalidLiteralValue(value);
  })();
}
function Literal(value, options) {
  return memory_exports.Create({ "~kind": "Literal" }, { type: LiteralTypeName(value), const: value }, options);
}
function IsLiteralValue(value) {
  return guard_exports.IsBigInt(value) || guard_exports.IsBoolean(value) || guard_exports.IsNumber(value) || guard_exports.IsString(value);
}
function IsLiteralNumber(value) {
  return IsLiteral(value) && guard_exports.IsNumber(value.const);
}
function IsLiteralString(value) {
  return IsLiteral(value) && guard_exports.IsString(value.const);
}
function IsLiteral(value) {
  return IsKind(value, "Literal");
}

// ../../node_modules/typebox/build/type/types/null.mjs
function Null(options) {
  return memory_exports.Create({ "~kind": "Null" }, { type: "null" }, options);
}
function IsNull2(value) {
  return IsKind(value, "Null");
}

// ../../node_modules/typebox/build/type/types/number.mjs
var NumberPattern = "-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?";
function Number2(options) {
  return memory_exports.Create({ "~kind": "Number" }, { type: "number" }, options);
}
function IsNumber3(value) {
  return IsKind(value, "Number");
}

// ../../node_modules/typebox/build/type/types/symbol.mjs
function Symbol2(options) {
  return memory_exports.Create({ "~kind": "Symbol" }, { type: "symbol" }, options);
}
function IsSymbol2(value) {
  return IsKind(value, "Symbol");
}

// ../../node_modules/typebox/build/type/types/parameter.mjs
function Parameter(...args) {
  const [name, extends_, equals] = arguments_exports.Match(args, {
    3: (name2, extends_2, equals2) => [name2, extends_2, equals2],
    2: (name2, extends_2) => [name2, extends_2, extends_2],
    1: (name2) => [name2, Unknown(), Unknown()]
  });
  return memory_exports.Create({ "~kind": "Parameter" }, { name, extends: extends_, equals }, {});
}
function IsParameter(value) {
  return IsKind(value, "Parameter");
}

// ../../node_modules/typebox/build/type/types/string.mjs
var StringPattern = ".*";
function String2(options) {
  return memory_exports.Create({ "~kind": "String" }, { type: "string" }, options);
}
function IsString3(value) {
  return IsKind(value, "String");
}

// ../../node_modules/typebox/build/type/types/union.mjs
function Union(anyOf, options = {}) {
  return memory_exports.Create({ "~kind": "Union" }, { anyOf }, options);
}
function IsUnion(value) {
  return IsKind(value, "Union");
}
function UnionOptions(type) {
  return memory_exports.Discard(type, ["~kind", "anyOf"]);
}

// ../../node_modules/typebox/build/type/engine/patterns/pattern.mjs
function ParsePatternIntoTypes(pattern) {
  const parsed = Pattern(pattern);
  const result = guard_exports.IsEqual(parsed.length, 2) ? parsed[0] : [];
  return result;
}

// ../../node_modules/typebox/build/type/engine/template_literal/is_finite.mjs
function FromLiteral(_value) {
  return true;
}
function FromTypesReduce(types) {
  return guard_exports.ShiftLeft(types, (left, right) => FromType(left) ? FromTypesReduce(right) : false, () => true);
}
function FromTypes(types) {
  const result = guard_exports.IsEqual(types.length, 0) ? false : FromTypesReduce(types);
  return result;
}
function FromType(type) {
  return IsUnion(type) ? FromTypes(type.anyOf) : IsLiteral(type) ? FromLiteral(type.const) : false;
}
function IsTemplateLiteralFinite(types) {
  const result = FromTypes(types);
  return result;
}

// ../../node_modules/typebox/build/type/engine/template_literal/create.mjs
function TemplateLiteralCreate(pattern) {
  return memory_exports.Create({ ["~kind"]: "TemplateLiteral" }, { type: "string", pattern }, {});
}

// ../../node_modules/typebox/build/type/engine/template_literal/decode.mjs
function FromLiteralPush(variants, value, result = []) {
  return guard_exports.ShiftLeft(variants, (left, right) => FromLiteralPush(right, value, [...result, `${left}${value}`]), () => result);
}
function FromLiteral2(variants, value) {
  return guard_exports.IsEqual(variants.length, 0) ? [`${value}`] : FromLiteralPush(variants, value);
}
function FromUnion(variants, types, result = []) {
  return guard_exports.ShiftLeft(types, (left, right) => FromUnion(variants, right, [...result, ...FromType2(variants, left)]), () => result);
}
function FromType2(variants, type) {
  const result = IsUnion(type) ? FromUnion(variants, type.anyOf) : IsLiteral(type) ? FromLiteral2(variants, type.const) : Unreachable();
  return result;
}
function DecodeFromSpan(variants, types) {
  return guard_exports.ShiftLeft(types, (left, right) => DecodeFromSpan(FromType2(variants, left), right), () => variants);
}
function VariantsToLiterals(variants) {
  return variants.map((variant) => Literal(variant));
}
function DecodeTypesAsUnion(types) {
  const variants = DecodeFromSpan([], types);
  const literals = VariantsToLiterals(variants);
  const result = Union(literals);
  return result;
}
function DecodeTypes(types) {
  return guard_exports.IsEqual(types.length, 0) ? Unreachable() : (
    // Literal('') :
    guard_exports.IsEqual(types.length, 1) && IsLiteral(types[0]) ? types[0] : DecodeTypesAsUnion(types)
  );
}
function TemplateLiteralDecodeUnsafe(pattern) {
  const types = ParsePatternIntoTypes(pattern);
  const result = guard_exports.IsEqual(types.length, 0) ? String2() : IsTemplateLiteralFinite(types) ? DecodeTypes(types) : TemplateLiteralCreate(pattern);
  return result;
}
function TemplateLiteralDecode(pattern) {
  const decoded = TemplateLiteralDecodeUnsafe(pattern);
  const result = IsTemplateLiteral(decoded) ? String2() : decoded;
  return result;
}

// ../../node_modules/typebox/build/type/engine/record/record_create.mjs
function CreateRecord(key, value) {
  const type = "object";
  const patternProperties = { [key]: value };
  return memory_exports.Create({ ["~kind"]: "Record" }, { type, patternProperties });
}

// ../../node_modules/typebox/build/type/engine/record/from_key_any.mjs
function FromAnyKey(value) {
  return CreateRecord(StringKey, value);
}

// ../../node_modules/typebox/build/type/engine/record/from_key_boolean.mjs
function FromBooleanKey(value) {
  return _Object_({ true: value, false: value });
}

// ../../node_modules/typebox/build/type/types/tuple.mjs
function Tuple(types, options = {}) {
  const [items, minItems, additionalItems] = [types, types.length, false];
  return memory_exports.Create({ ["~kind"]: "Tuple" }, { type: "array", additionalItems, items, minItems }, options);
}
function IsTuple(value) {
  return IsKind(value, "Tuple");
}
function TupleOptions(type) {
  return memory_exports.Discard(type, ["~kind", "type", "items", "minItems", "additionalItems"]);
}

// ../../node_modules/typebox/build/type/engine/readonly/instantiate_remove.mjs
function RemoveReadonlyOperation(type) {
  return memory_exports.Discard(type, ["~readonly"]);
}
function RemoveReadonlyAction(type, options) {
  const result = memory_exports.Update(RemoveReadonlyOperation(type), {}, options);
  return result;
}
function RemoveReadonlyInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return RemoveReadonlyAction(instantiatedType, options);
}

// ../../node_modules/typebox/build/type/action/_remove_readonly.mjs
function RemoveReadonlyDeferred(type, options = {}) {
  return Deferred("RemoveReadonly", [type], options);
}
function RemoveReadonly(type, options = {}) {
  return RemoveReadonlyAction(type, options);
}

// ../../node_modules/typebox/build/type/engine/optional/instantiate_remove.mjs
function RemoveOptionalOperation(type) {
  return memory_exports.Discard(type, ["~optional"]);
}
function RemoveOptionalAction(type, options) {
  const result = memory_exports.Update(RemoveOptionalOperation(type), {}, options);
  return result;
}
function RemoveOptionalInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return RemoveOptionalAction(instantiatedType, options);
}

// ../../node_modules/typebox/build/type/action/_remove_optional.mjs
function RemoveOptionalDeferred(type, options = {}) {
  return Deferred("RemoveOptional", [type], options);
}
function RemoveOptional(type, options = {}) {
  return RemoveOptionalAction(type, options);
}

// ../../node_modules/typebox/build/type/engine/tuple/to_object.mjs
function TupleElementsToProperties(types) {
  const result = types.reduceRight((result2, right, index) => {
    return { [index]: right, ...result2 };
  }, {});
  return result;
}
function TupleToObject(type) {
  const properties = TupleElementsToProperties(type.items);
  const result = _Object_(properties);
  return result;
}

// ../../node_modules/typebox/build/type/engine/evaluate/composite.mjs
function IsReadonlyProperty(left, right) {
  return IsReadonly(left) ? IsReadonly(right) ? true : false : false;
}
function IsOptionalProperty(left, right) {
  return IsOptional(left) ? IsOptional(right) ? true : false : false;
}
function CompositeProperty(left, right) {
  const isReadonly = IsReadonlyProperty(left, right);
  const isOptional = IsOptionalProperty(left, right);
  const evaluated = EvaluateIntersect([left, right]);
  const property = RemoveReadonly(RemoveOptional(evaluated));
  return isReadonly && isOptional ? AddReadonly(AddOptional(property)) : isReadonly && !isOptional ? AddReadonly(property) : !isReadonly && isOptional ? AddOptional(property) : property;
}
function CompositePropertyKey(left, right, key) {
  return key in left ? key in right ? CompositeProperty(left[key], right[key]) : left[key] : key in right ? right[key] : Never();
}
function CompositeProperties(left, right) {
  const keys = /* @__PURE__ */ new Set([...guard_exports.Keys(right), ...guard_exports.Keys(left)]);
  return [...keys].reduce((result, key) => {
    return { ...result, [key]: CompositePropertyKey(left, right, key) };
  }, {});
}
function GetProperties(type) {
  const result = IsObject2(type) ? type.properties : IsTuple(type) ? TupleElementsToProperties(type.items) : Unreachable();
  return result;
}
function Composite(left, right) {
  const leftProperties = GetProperties(left);
  const rightProperties = GetProperties(right);
  const properties = CompositeProperties(leftProperties, rightProperties);
  return _Object_(properties);
}

// ../../node_modules/typebox/build/type/engine/evaluate/narrow.mjs
function Narrow(left, right) {
  const result = Compare(left, right);
  return guard_exports.IsEqual(result, ResultLeftInside) ? left : guard_exports.IsEqual(result, ResultRightInside) ? right : guard_exports.IsEqual(result, ResultEqual) ? right : Never();
}

// ../../node_modules/typebox/build/type/engine/evaluate/distribute.mjs
function IsObjectLike(type) {
  return IsObject2(type) || IsTuple(type);
}
function IsUnionOperand(left, right) {
  const isUnionLeft = IsUnion(left);
  const isUnionRight = IsUnion(right);
  const result = isUnionLeft || isUnionRight;
  return result;
}
function DistributeOperation(left, right) {
  const evaluatedLeft = EvaluateType(left);
  const evaluatedRight = EvaluateType(right);
  const isUnionOperand = IsUnionOperand(evaluatedLeft, evaluatedRight);
  const isObjectLeft = IsObjectLike(evaluatedLeft);
  const IsObjectRight = IsObjectLike(evaluatedRight);
  const result = isUnionOperand ? EvaluateIntersect([evaluatedLeft, evaluatedRight]) : isObjectLeft && IsObjectRight ? Composite(evaluatedLeft, evaluatedRight) : isObjectLeft && !IsObjectRight ? evaluatedLeft : !isObjectLeft && IsObjectRight ? evaluatedRight : Narrow(evaluatedLeft, evaluatedRight);
  return result;
}
function DistributeType(type, types, result = []) {
  return guard_exports.ShiftLeft(types, (left, right) => DistributeType(type, right, [...result, DistributeOperation(type, left)]), () => guard_exports.IsEqual(result.length, 0) ? [type] : result);
}
function DistributeUnion(types, distribution, result = []) {
  return guard_exports.ShiftLeft(types, (left, right) => DistributeUnion(right, distribution, [...result, ...Distribute([left], distribution)]), () => result);
}
function Distribute(types, result = []) {
  return guard_exports.ShiftLeft(types, (left, right) => IsUnion(left) ? Distribute(right, DistributeUnion(left.anyOf, result)) : Distribute(right, DistributeType(left, result)), () => result);
}

// ../../node_modules/typebox/build/type/engine/exclude/operation.mjs
function ExcludeType(left, right) {
  const check = Extends({}, left, right);
  const result = result_exports.IsExtendsTrueLike(check) ? [] : [left];
  return result;
}
function ExcludeUnion(types, right) {
  return types.reduce((result, head) => {
    return [...result, ...ExcludeType(head, right)];
  }, []);
}
function ExcludeOperation(left, right) {
  const evaluated = EvaluateType(left);
  const canonical = IsUnion(evaluated) ? evaluated.anyOf : [evaluated];
  const remaining = ExcludeUnion(canonical, right);
  const result = EvaluateUnion(remaining);
  return result;
}

// ../../node_modules/typebox/build/type/engine/evaluate/evaluate.mjs
function EvaluateDependent(if_, then_, else_) {
  const intersect = Intersect([if_, then_]);
  const excluded = ExcludeOperation(else_, if_);
  const result = EvaluateUnion([intersect, excluded]);
  return result;
}
function EvaluateEnum(values) {
  const result = values.map((value) => Literal(value));
  return EvaluateUnion(result);
}
function EvaluateIntersect(types) {
  const distribution = Distribute(types);
  const broadend = Broaden(distribution);
  const result = EvaluateUnionFast(broadend);
  return result;
}
function EvaluateTemplateLiteral(pattern) {
  const evaluated = TemplateLiteralDecode(pattern);
  const result = EvaluateType(evaluated);
  return result;
}
function EvaluateUnion(types) {
  const broadend = Broaden(types);
  const result = EvaluateUnionFast(broadend);
  return result;
}
function EvaluateType(type) {
  return IsDependent(type) ? EvaluateDependent(type.if, type.then, type.else) : IsEnum(type) ? EvaluateEnum(type.enum) : IsIntersect(type) ? EvaluateIntersect(type.allOf) : IsTemplateLiteral(type) ? EvaluateTemplateLiteral(type.pattern) : IsUnion(type) ? EvaluateUnion(type.anyOf) : type;
}
function EvaluateUnionFast(types) {
  const result = guard_exports.IsEqual(types.length, 1) ? types[0] : guard_exports.IsEqual(types.length, 0) ? Never() : Union(types);
  return result;
}

// ../../node_modules/typebox/build/type/engine/record/from_key_enum.mjs
function FromEnumKey(values, value) {
  const unionKey = EvaluateEnum(values);
  const result = FromKey(unionKey, value);
  return result;
}

// ../../node_modules/typebox/build/type/engine/record/from_key_integer.mjs
function FromIntegerKey(_key, value) {
  const result = CreateRecord(IntegerKey, value);
  return result;
}

// ../../node_modules/typebox/build/type/engine/record/from_key_intersect.mjs
function FromIntersectKey(types, value) {
  const evaluatedKey = EvaluateIntersect(types);
  const result = FromKey(evaluatedKey, value);
  return result;
}

// ../../node_modules/typebox/build/type/engine/record/from_key_literal.mjs
function FromLiteralKey(key, value) {
  return guard_exports.IsString(key) || guard_exports.IsNumber(key) ? _Object_({ [key]: value }) : guard_exports.IsEqual(key, false) ? _Object_({ false: value }) : guard_exports.IsEqual(key, true) ? _Object_({ true: value }) : _Object_({});
}

// ../../node_modules/typebox/build/type/engine/record/from_key_number.mjs
function FromNumberKey(_key, value) {
  const result = CreateRecord(NumberKey, value);
  return result;
}

// ../../node_modules/typebox/build/type/engine/record/from_key_string.mjs
function FromStringKey(key, value) {
  return guard_exports.HasPropertyKey(key, "pattern") && (guard_exports.IsString(key.pattern) || key.pattern instanceof RegExp) ? CreateRecord(key.pattern.toString(), value) : CreateRecord(StringKey, value);
}

// ../../node_modules/typebox/build/type/engine/record/from_key_template_literal.mjs
function FromTemplateKey(pattern, value) {
  const types = ParsePatternIntoTypes(pattern);
  const finite = IsTemplateLiteralFinite(types);
  const result = finite ? FromKey(EvaluateTemplateLiteral(pattern), value) : CreateRecord(pattern, value);
  return result;
}

// ../../node_modules/typebox/build/type/engine/evaluate/flatten.mjs
function FlattenType(type) {
  const result = IsUnion(type) ? Flatten(type.anyOf) : [type];
  return result;
}
function Flatten(types) {
  return types.reduce((result, type) => {
    return [...result, ...FlattenType(type)];
  }, []);
}

// ../../node_modules/typebox/build/type/engine/record/from_key_union.mjs
function StringOrNumberCheck(types) {
  return types.some((type) => IsString3(type) || IsNumber3(type) || IsInteger2(type));
}
function TryBuildRecord(types, value) {
  return guard_exports.IsEqual(StringOrNumberCheck(types), true) ? CreateRecord(StringKey, value) : void 0;
}
function CreateProperties(types, value) {
  return types.reduce((result, left) => {
    return IsLiteral(left) && (guard_exports.IsString(left.const) || guard_exports.IsNumber(left.const)) ? { ...result, [left.const]: value } : result;
  }, {});
}
function CreateObject(types, value) {
  const properties = CreateProperties(types, value);
  const result = _Object_(properties);
  return result;
}
function FromUnionKey(types, value) {
  const flattened = Flatten(types);
  const record = TryBuildRecord(flattened, value);
  return IsSchema(record) ? record : CreateObject(flattened, value);
}

// ../../node_modules/typebox/build/type/engine/record/from_key.mjs
function FromKey(key, value) {
  const result = IsAny(key) ? FromAnyKey(value) : IsBoolean3(key) ? FromBooleanKey(value) : IsEnum(key) ? FromEnumKey(key.enum, value) : IsInteger2(key) ? FromIntegerKey(key, value) : IsIntersect(key) ? FromIntersectKey(key.allOf, value) : IsLiteral(key) ? FromLiteralKey(key.const, value) : IsNumber3(key) ? FromNumberKey(key, value) : IsUnion(key) ? FromUnionKey(key.anyOf, value) : IsString3(key) ? FromStringKey(key, value) : IsTemplateLiteral(key) ? FromTemplateKey(key.pattern, value) : _Object_({});
  return result;
}

// ../../node_modules/typebox/build/type/engine/record/instantiate.mjs
function RecordAction(key, value, options) {
  const result = CanInstantiate([key]) ? memory_exports.Update(FromKey(key, value), {}, options) : RecordDeferred(key, value, options);
  return result;
}
function RecordInstantiate(context, state, key, value, options) {
  const instantiatedKey = InstantiateType(context, state, key);
  const instantiatedValue = InstantiateType(context, state, value);
  return RecordAction(instantiatedKey, instantiatedValue, options);
}

// ../../node_modules/typebox/build/type/types/record.mjs
var IntegerKey = `^${IntegerPattern}$`;
var NumberKey = `^${NumberPattern}$`;
var StringKey = `^${StringPattern}$`;
function RecordDeferred(key, value, options = {}) {
  return Deferred("Record", [key, value], options);
}
function Record(key, value, options = {}) {
  return RecordAction(key, value, options);
}
function RecordFromPattern(pattern, value) {
  return CreateRecord(pattern, value);
}
function RecordPatternToType(pattern) {
  const result = guard_exports.IsEqual(pattern, StringKey) ? String2() : guard_exports.IsEqual(pattern, IntegerKey) ? Integer() : guard_exports.IsEqual(pattern, NumberKey) ? Number2() : TemplateLiteralDecodeUnsafe(pattern);
  return result;
}
function RecordPattern(type) {
  return guard_exports.Keys(type.patternProperties)[0];
}
function RecordKey(type) {
  const pattern = RecordPattern(type);
  const result = RecordPatternToType(pattern);
  return result;
}
function RecordValue(type) {
  return type.patternProperties[RecordPattern(type)];
}
function IsRecord(value) {
  return IsKind(value, "Record");
}

// ../../node_modules/typebox/build/type/types/rest.mjs
function Rest(type) {
  return memory_exports.Create({ "~kind": "Rest" }, { type: "rest", items: type }, {});
}
function IsRest(value) {
  return IsKind(value, "Rest");
}

// ../../node_modules/typebox/build/type/types/this.mjs
function This(options) {
  return memory_exports.Create({ ["~kind"]: "This" }, { $ref: "#" }, options);
}
function IsThis(value) {
  return IsKind(value, "This");
}

// ../../node_modules/typebox/build/type/types/undefined.mjs
function Undefined(options) {
  return memory_exports.Create({ "~kind": "Undefined" }, { type: "undefined" }, options);
}
function IsUndefined2(value) {
  return IsKind(value, "Undefined");
}

// ../../node_modules/typebox/build/type/types/void.mjs
function Void(options) {
  return memory_exports.Create({ "~kind": "Void" }, { type: "void" }, options);
}
function IsVoid(value) {
  return IsKind(value, "Void");
}

// ../../node_modules/typebox/build/type/script/mapping.mjs
function IntrinsicOrCall(ref, parameters) {
  return guard_exports.IsEqual(ref, "Array") ? _Array_(parameters[0]) : guard_exports.IsEqual(ref, "Capitalize") ? CapitalizeDeferred(parameters[0]) : guard_exports.IsEqual(ref, "ConstructorParameters") ? ConstructorParametersDeferred(parameters[0]) : guard_exports.IsEqual(ref, "Evaluate") ? EvaluateDeferred(parameters[0]) : guard_exports.IsEqual(ref, "Exclude") ? ExcludeDeferred(parameters[0], parameters[1]) : guard_exports.IsEqual(ref, "Extract") ? ExtractDeferred(parameters[0], parameters[1]) : guard_exports.IsEqual(ref, "Index") ? IndexDeferred(parameters[0], parameters[1]) : guard_exports.IsEqual(ref, "InstanceType") ? InstanceTypeDeferred(parameters[0]) : guard_exports.IsEqual(ref, "Lowercase") ? LowercaseDeferred(parameters[0]) : guard_exports.IsEqual(ref, "NonNullable") ? NonNullableDeferred(parameters[0]) : guard_exports.IsEqual(ref, "Omit") ? OmitDeferred(parameters[0], parameters[1]) : guard_exports.IsEqual(ref, "Parameters") ? ParametersDeferred(parameters[0]) : guard_exports.IsEqual(ref, "Partial") ? PartialDeferred(parameters[0]) : guard_exports.IsEqual(ref, "Pick") ? PickDeferred(parameters[0], parameters[1]) : guard_exports.IsEqual(ref, "Readonly") ? ReadonlyObjectDeferred(parameters[0]) : guard_exports.IsEqual(ref, "KeyOf") ? KeyOfDeferred(parameters[0]) : guard_exports.IsEqual(ref, "Record") ? RecordDeferred(parameters[0], parameters[1]) : guard_exports.IsEqual(ref, "Required") ? RequiredDeferred(parameters[0]) : guard_exports.IsEqual(ref, "ReturnType") ? ReturnTypeDeferred(parameters[0]) : guard_exports.IsEqual(ref, "Uncapitalize") ? UncapitalizeDeferred(parameters[0]) : guard_exports.IsEqual(ref, "Uppercase") ? UppercaseDeferred(parameters[0]) : CallConstruct(Ref(ref), parameters);
}
function Unreachable2() {
  throw Error("Unreachable");
}
var DelimitedDecode = (input, result = []) => {
  return input.reduce((result2, left) => {
    return guard_exports.IsArray(left) && guard_exports.IsEqual(left.length, 2) ? [...result2, left[0]] : [...result2, left];
  }, []);
};
var Delimited = (input) => {
  const [left, right] = input;
  return DelimitedDecode([...left, ...right]);
};
function GenericParameterExtendsEqualsMapping(input) {
  return Parameter(input[0], input[2], input[4]);
}
function GenericParameterExtendsMapping(input) {
  return Parameter(input[0], input[2], input[2]);
}
function GenericParameterEqualsMapping(input) {
  return Parameter(input[0], Unknown(), input[2]);
}
function GenericParameterIdentifierMapping(input) {
  return Parameter(input, Unknown(), Unknown());
}
function GenericParameterMapping(input) {
  return input;
}
function GenericParameterListMapping(input) {
  return Delimited(input);
}
function GenericParametersMapping(input) {
  return input[1];
}
function GenericCallArgumentListMapping(input) {
  return Delimited(input);
}
function GenericCallArgumentsMapping(input) {
  return input[1];
}
function GenericCallMapping(input) {
  return IntrinsicOrCall(input[0], input[1]);
}
function OptionalSemiColonMapping(input) {
  return null;
}
function KeywordStringMapping(input) {
  return String2();
}
function KeywordNumberMapping(input) {
  return Number2();
}
function KeywordBooleanMapping(input) {
  return Boolean2();
}
function KeywordUndefinedMapping(input) {
  return Undefined();
}
function KeywordNullMapping(input) {
  return Null();
}
function KeywordIntegerMapping(input) {
  return Integer();
}
function KeywordBigIntMapping(input) {
  return BigInt2();
}
function KeywordUnknownMapping(input) {
  return Unknown();
}
function KeywordAnyMapping(input) {
  return Any();
}
function KeywordObjectMapping(input) {
  return _Object_({});
}
function KeywordNeverMapping(input) {
  return Never();
}
function KeywordSymbolMapping(input) {
  return Symbol2();
}
function KeywordVoidMapping(input) {
  return Void();
}
function KeywordThisMapping(input) {
  return This();
}
function LiteralBigIntMapping(input) {
  return Literal(BigInt(input));
}
function LiteralBooleanMapping(input) {
  return Literal(guard_exports.IsEqual(input, "true"));
}
function LiteralNumberMapping(input) {
  return Literal(parseFloat(input));
}
function LiteralStringMapping(input) {
  return Literal(input);
}
function TemplateInterpolateMapping(input) {
  return input[1];
}
function TemplateSpanMapping(input) {
  return Literal(input);
}
function TemplateBodyMapping(input) {
  return guard_exports.IsEqual(input.length, 3) ? [input[0], input[1], ...input[2]] : [input[0]];
}
function TemplateLiteralTypesMapping(input) {
  return input[1];
}
function TemplateLiteralMapping(input) {
  return TemplateLiteralDeferred(input);
}
function DependentMapping(input) {
  return guard_exports.IsEqual(input.length, 6) ? Dependent(input[1], input[3], input[5]) : Dependent(input[1], input[3], Unknown());
}
function KeyOfMapping(input) {
  return input.length > 0;
}
function IndexArrayMapping(input) {
  return input.reduce((result, current) => {
    return guard_exports.IsEqual(current.length, 3) ? [...result, [current[1]]] : [...result, []];
  }, []);
}
function ExtendsMapping(input) {
  return guard_exports.IsEqual(input.length, 6) ? [input[1], input[3], input[5]] : [];
}
function BaseMapping(input) {
  return guard_exports.IsArray(input) && guard_exports.IsEqual(input.length, 3) ? input[1] : input;
}
function WithMapping(input) {
  return guard_exports.IsEqual(input.length, 2) ? input[1] : [];
}
function FactorIndexArray(Type2, indexArray) {
  return indexArray.reduce((result, left) => {
    const _left = left;
    return guard_exports.IsEqual(_left.length, 1) ? IndexDeferred(result, _left[0]) : guard_exports.IsEqual(_left.length, 0) ? _Array_(result) : Unreachable2();
  }, Type2);
}
function FactorExtends(type, extend) {
  return guard_exports.IsEqual(extend.length, 3) ? ConditionalDeferred(type, extend[0], extend[1], extend[2]) : type;
}
function FactorWith(type, withClause) {
  return guard_exports.IsArray(withClause) && guard_exports.IsEqual(withClause.length, 0) ? type : WithDeferred(type, withClause);
}
function FactorMapping(input) {
  const [keyOf, type, indexArray, extend, withClause] = input;
  return FactorWith(keyOf ? FactorExtends(KeyOfDeferred(FactorIndexArray(type, indexArray)), extend) : FactorExtends(FactorIndexArray(type, indexArray), extend), withClause);
}
function ExprBinaryMapping(left, rest) {
  return guard_exports.IsEqual(rest.length, 3) ? (() => {
    const [operator, right, next] = rest;
    const Schema = ExprBinaryMapping(right, next);
    if (guard_exports.IsEqual(operator, "&")) {
      return IsIntersect(Schema) ? Intersect([left, ...Schema.allOf]) : Intersect([left, Schema]);
    }
    if (guard_exports.IsEqual(operator, "|")) {
      return IsUnion(Schema) ? Union([left, ...Schema.anyOf]) : Union([left, Schema]);
    }
    Unreachable2();
  })() : left;
}
function ExprTermTailMapping(input) {
  return input;
}
function ExprTermMapping(input) {
  const [left, rest] = input;
  return ExprBinaryMapping(left, rest);
}
function ExprTailMapping(input) {
  return input;
}
function ExprMapping(input) {
  const [left, rest] = input;
  return ExprBinaryMapping(left, rest);
}
function ExprReadonlyMapping(input) {
  return AddImmutableDeferred(input[1]);
}
function ExprPipeMapping(input) {
  return input[1];
}
function GenericTypeMapping(input) {
  return Generic(input[0], input[2]);
}
function InferTypeMapping(input) {
  return guard_exports.IsEqual(input.length, 4) ? Infer(input[1], input[3]) : guard_exports.IsEqual(input.length, 2) ? Infer(input[1], Unknown()) : Unreachable2();
}
function TypeMapping(input) {
  return input;
}
function PropertyKeyNumberMapping(input) {
  return `${input}`;
}
function PropertyKeyIdentMapping(input) {
  return input;
}
function PropertyKeyQuotedMapping(input) {
  return input;
}
function PropertyKeyIndexMapping(input) {
  return IsInteger2(input[3]) ? IntegerKey : IsNumber3(input[3]) ? NumberKey : IsSymbol2(input[3]) ? StringKey : IsString3(input[3]) ? StringKey : Unreachable2();
}
function PropertyKeyMapping(input) {
  return input;
}
function ReadonlyMapping(input) {
  return input.length > 0;
}
function OptionalMapping(input) {
  return input.length > 0;
}
function PropertyMapping(input) {
  const [isReadonly, key, isOptional, _colon, type] = input;
  return {
    [key]: isReadonly && isOptional ? AddReadonlyDeferred(AddOptionalDeferred(type)) : isReadonly && !isOptional ? AddReadonlyDeferred(type) : !isReadonly && isOptional ? AddOptionalDeferred(type) : type
  };
}
function PropertyDelimiterMapping(input) {
  return input;
}
function PropertyListMapping(input) {
  return Delimited(input);
}
function PropertiesReduce(propertyList) {
  return propertyList.reduce((result, left) => {
    const isPatternProperties = guard_exports.HasPropertyKey(left, IntegerKey) || guard_exports.HasPropertyKey(left, NumberKey) || guard_exports.HasPropertyKey(left, StringKey);
    return isPatternProperties ? [result[0], memory_exports.Assign(result[1], left)] : [memory_exports.Assign(result[0], left), result[1]];
  }, [{}, {}]);
}
function PropertiesMapping(input) {
  return PropertiesReduce(input[1]);
}
function _Object_Mapping(input) {
  const [properties, patternProperties] = input;
  const options = guard_exports.IsEqual(guard_exports.Keys(patternProperties).length, 0) ? {} : { patternProperties };
  return _Object_(properties, options);
}
function ElementNamedMapping(input) {
  return guard_exports.IsEqual(input.length, 5) ? AddReadonlyDeferred(AddOptionalDeferred(input[4])) : guard_exports.IsEqual(input.length, 3) ? input[2] : guard_exports.IsEqual(input.length, 4) ? guard_exports.IsEqual(input[2], "readonly") ? AddReadonlyDeferred(input[3]) : AddOptionalDeferred(input[3]) : Unreachable2();
}
function ElementReadonlyOptionalMapping(input) {
  return AddReadonlyDeferred(AddOptionalDeferred(input[1]));
}
function ElementReadonlyMapping(input) {
  return AddReadonlyDeferred(input[1]);
}
function ElementOptionalMapping(input) {
  return AddOptionalDeferred(input[0]);
}
function ElementBaseMapping(input) {
  return input;
}
function ElementMapping(input) {
  return guard_exports.IsEqual(input.length, 2) ? Rest(input[1]) : guard_exports.IsEqual(input.length, 1) ? input[0] : Unreachable2();
}
function ElementListMapping(input) {
  return Delimited(input);
}
function _Tuple_Mapping(input) {
  return Tuple(input[1]);
}
function ParameterReadonlyOptionalMapping(input) {
  return AddReadonlyDeferred(AddOptionalDeferred(input[4]));
}
function ParameterReadonlyMapping(input) {
  return AddReadonlyDeferred(input[3]);
}
function ParameterOptionalMapping(input) {
  return AddOptionalDeferred(input[3]);
}
function ParameterTypeMapping(input) {
  return input[2];
}
function ParameterBaseMapping(input) {
  return input;
}
function ParameterMapping(input) {
  return guard_exports.IsEqual(input.length, 2) ? Rest(input[1]) : guard_exports.IsEqual(input.length, 1) ? input[0] : Unreachable2();
}
function ParameterListMapping(input) {
  return Delimited(input);
}
function _Function_Mapping(input) {
  return _Function_(input[1], input[4]);
}
function _Constructor_Mapping(input) {
  return Constructor(input[2], input[5]);
}
function ApplyReadonly(state, type) {
  return guard_exports.IsEqual(state, "remove") ? RemoveReadonlyDeferred(type) : guard_exports.IsEqual(state, "add") ? AddReadonlyDeferred(type) : type;
}
function MappedReadonlyMapping(input) {
  return guard_exports.IsEqual(input.length, 2) && guard_exports.IsEqual(input[0], "-") ? "remove" : guard_exports.IsEqual(input.length, 2) && guard_exports.IsEqual(input[0], "+") ? "add" : guard_exports.IsEqual(input.length, 1) ? "add" : "none";
}
function ApplyOptional(state, type) {
  return guard_exports.IsEqual(state, "remove") ? RemoveOptionalDeferred(type) : guard_exports.IsEqual(state, "add") ? AddOptionalDeferred(type) : type;
}
function MappedOptionalMapping(input) {
  return guard_exports.IsEqual(input.length, 2) && guard_exports.IsEqual(input[0], "-") ? "remove" : guard_exports.IsEqual(input.length, 2) && guard_exports.IsEqual(input[0], "+") ? "add" : guard_exports.IsEqual(input.length, 1) ? "add" : "none";
}
function MappedAsMapping(input) {
  return guard_exports.IsEqual(input.length, 2) ? [input[1]] : [];
}
function _Mapped_Mapping(input) {
  return guard_exports.IsArray(input[6]) && guard_exports.IsEqual(input[6].length, 1) ? MappedDeferred(Identifier(input[3]), input[5], input[6][0], ApplyReadonly(input[1], ApplyOptional(input[8], input[10]))) : MappedDeferred(Identifier(input[3]), input[5], Ref(input[3]), ApplyReadonly(input[1], ApplyOptional(input[8], input[10])));
}
function ReferenceMapping(input) {
  return Ref(input);
}
function WithBigIntMapping(input) {
  return BigInt(input);
}
function WithNumberMapping(input) {
  return parseFloat(input);
}
function WithBooleanMapping(input) {
  return guard_exports.IsEqual(input, "true");
}
function WithStringMapping(input) {
  return input;
}
function WithNullMapping(input) {
  return null;
}
function WithUndefinedMapping(input) {
  return void 0;
}
function WithPropertyMapping(input) {
  return { [input[0]]: input[2] };
}
function WithPropertyListMapping(input) {
  return Delimited(input);
}
function WithObjectMappingReduce(propertyList) {
  return propertyList.reduce((result, left) => {
    return memory_exports.Assign(result, left);
  }, {});
}
function WithObjectMapping(input) {
  return WithObjectMappingReduce(input[1]);
}
function WithElementListMapping(input) {
  return Delimited(input);
}
function WithArrayMapping(input) {
  return input[1];
}
function WithValueMapping(input) {
  return input;
}
function PatternBigIntMapping(input) {
  return BigInt2();
}
function PatternStringMapping(input) {
  return String2();
}
function PatternNumberMapping(input) {
  return Number2();
}
function PatternIntegerMapping(input) {
  return Integer();
}
function PatternNeverMapping(input) {
  return Never();
}
function PatternTextMapping(input) {
  return Literal(input);
}
function PatternBaseMapping(input) {
  return input;
}
function PatternGroupMapping(input) {
  return Union(input[1]);
}
function PatternUnionMapping(input) {
  return input.length === 3 ? [...input[0], ...input[2]] : input.length === 1 ? [...input[0]] : [];
}
function PatternTermMapping(input) {
  return [input[0], ...input[1]];
}
function PatternBodyMapping(input) {
  return input;
}
function PatternMapping(input) {
  return input[1];
}
function InterfaceDeclarationHeritageListMapping(input) {
  return Delimited(input);
}
function InterfaceDeclarationHeritageMapping(input) {
  return guard_exports.IsEqual(input.length, 2) ? input[1] : [];
}
function InterfaceDeclarationGenericMapping(input) {
  const parameters = input[2];
  const heritage = input[3];
  const [properties, patternProperties] = input[4];
  const options = guard_exports.IsEqual(guard_exports.Keys(patternProperties).length, 0) ? {} : { patternProperties };
  return { [input[1]]: Generic(parameters, InterfaceDeferred(heritage, properties, options)) };
}
function InterfaceDeclarationMapping(input) {
  const heritage = input[2];
  const [properties, patternProperties] = input[3];
  const options = guard_exports.IsEqual(guard_exports.Keys(patternProperties).length, 0) ? {} : { patternProperties };
  return { [input[1]]: InterfaceDeferred(heritage, properties, options) };
}
function TypeAliasDeclarationGenericMapping(input) {
  return { [input[1]]: Generic(input[2], input[4]) };
}
function TypeAliasDeclarationMapping(input) {
  return { [input[1]]: input[3] };
}
function ExportKeywordMapping(input) {
  return null;
}
function ModuleDeclarationDelimiterMapping(input) {
  return input;
}
function ModuleDeclarationListMapping(input) {
  return PropertiesReduce(Delimited(input));
}
function ModuleDeclarationMapping(input) {
  return input[1];
}
function ModuleMapping(input) {
  const moduleDeclaration = input[0];
  const moduleDeclarationList = input[1];
  return ModuleDeferred(memory_exports.Assign(moduleDeclaration, moduleDeclarationList[0]));
}
function ScriptMapping(input) {
  return input;
}

// ../../node_modules/typebox/build/type/script/token/internal/match.mjs
function IsMatch(value) {
  return IsEqual(value.length, 2);
}
function Match2(input, ok, fail) {
  return IsMatch(input) ? ok(input[0], input[1]) : fail();
}

// ../../node_modules/typebox/build/type/script/token/internal/take.mjs
function TakeVariant(variant, input) {
  return IsEqual(input.indexOf(variant), 0) ? [variant, input.slice(variant.length)] : [];
}
function Take(variants, input) {
  for (let i = 0; i < variants.length; i++) {
    const result = TakeVariant(variants[i], input);
    if (IsMatch(result))
      return result;
  }
  return [];
}

// ../../node_modules/typebox/build/type/script/token/internal/char.mjs
function Range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, i) => String.fromCharCode(start + i));
}
var Alpha = [
  ...Range(97, 122),
  // Lowercase
  ...Range(65, 90)
  // Uppercase
];
var Zero = "0";
var NonZero = Range(49, 57);
var Digit = [Zero, ...NonZero];
var WhiteSpace = " ";
var NewLine = "\n";
var UnderScore = "_";
var Dot = ".";
var DollarSign = "$";
var Hyphen = "-";

// ../../node_modules/typebox/build/type/script/token/internal/trim.mjs
var LineComment = "//";
var OpenComment = "/*";
var CloseComment = "*/";
function DiscardMultilineComment(input) {
  const index = input.indexOf(CloseComment);
  const result = IsEqual(index, -1) ? "" : input.slice(index + 2);
  return result;
}
function DiscardLineComment(input) {
  const index = input.indexOf(NewLine);
  const result = IsEqual(index, -1) ? "" : input.slice(index);
  return result;
}
function TrimStartUntilNewline(input) {
  return input.replace(/^[ \t\r\f\v]+/, "");
}
function TrimWhitespace(input) {
  const trimmed = TrimStartUntilNewline(input);
  return trimmed.startsWith(OpenComment) ? TrimWhitespace(DiscardMultilineComment(trimmed.slice(2))) : trimmed.startsWith(LineComment) ? TrimWhitespace(DiscardLineComment(trimmed.slice(2))) : trimmed;
}
function Trim(input) {
  const trimmed = input.trimStart();
  return trimmed.startsWith(OpenComment) ? Trim(DiscardMultilineComment(trimmed.slice(2))) : trimmed.startsWith(LineComment) ? Trim(DiscardLineComment(trimmed.slice(2))) : trimmed;
}

// ../../node_modules/typebox/build/type/script/token/internal/optional.mjs
function Optional2(value, input) {
  return Match2(Take([value], input), (Optional4, Rest2) => [Optional4, Rest2], () => ["", input]);
}

// ../../node_modules/typebox/build/type/script/token/internal/many.mjs
function IsDiscard(discard, input) {
  return discard.includes(input);
}
function Many(allowed, discard, input, result = "") {
  return Match2(Take(allowed, input), (Char, Rest2) => IsDiscard(discard, Char) ? Many(allowed, discard, Rest2, result) : Many(allowed, discard, Rest2, `${result}${Char}`), () => [result, input]);
}

// ../../node_modules/typebox/build/type/script/token/unsigned_integer.mjs
function TakeNonZero(input) {
  return Take(NonZero, input);
}
var AllowedDigits = [...Digit, UnderScore];
function TakeDigits(input) {
  return Many(AllowedDigits, [UnderScore], input);
}
function TakeUnsignedInteger(input) {
  return Match2(Take([Zero], input), (Zero2, ZeroRest) => [Zero2, ZeroRest], () => Match2(
    TakeNonZero(input),
    (NonZero2, NonZeroRest) => Match2(TakeDigits(NonZeroRest), (Digits, DigitsRest) => [`${NonZero2}${Digits}`, DigitsRest], () => []),
    // fail: did not match Digits
    () => []
  ));
}
function UnsignedInteger(input) {
  return TakeUnsignedInteger(Trim(input));
}

// ../../node_modules/typebox/build/type/script/token/integer.mjs
function TakeSign(input) {
  return Optional2(Hyphen, input);
}
function TakeSignedInteger(input) {
  return Match2(
    TakeSign(input),
    (Sign, SignRest) => Match2(UnsignedInteger(SignRest), (UnsignedInteger2, UnsignedIntegerRest) => [`${Sign}${UnsignedInteger2}`, UnsignedIntegerRest], () => []),
    // fail: did not match unsigned integer
    () => []
  );
}
function Integer2(input) {
  return TakeSignedInteger(Trim(input));
}

// ../../node_modules/typebox/build/type/script/token/bigint.mjs
function TakeBigInt(input) {
  return Match2(
    Integer2(input),
    (Integer3, IntegerRest) => Match2(Take(["n"], IntegerRest), (_N, NRest) => [`${Integer3}`, NRest], () => []),
    // fail: did not match 'n'
    () => []
  );
}
function BigInt3(input) {
  return TakeBigInt(input);
}

// ../../node_modules/typebox/build/type/script/token/const.mjs
function TakeConst(const_, input) {
  return Take([const_], input);
}
function Const(const_, input) {
  return IsEqual(const_, "") ? ["", input] : const_.startsWith(NewLine) ? TakeConst(const_, TrimWhitespace(input)) : const_.startsWith(WhiteSpace) ? TakeConst(const_, input) : TakeConst(const_, Trim(input));
}

// ../../node_modules/typebox/build/type/script/token/ident.mjs
var Initial = [...Alpha, UnderScore, DollarSign];
function TakeInitial(input) {
  return Take(Initial, input);
}
var Remaining = [...Initial, ...Digit];
function TakeRemaining(input, result = "") {
  return Match2(Take(Remaining, input), (Remaining2, RemainingRest) => TakeRemaining(RemainingRest, `${result}${Remaining2}`), () => [result, input]);
}
function TakeIdent(input) {
  return Match2(
    TakeInitial(input),
    (Initial2, InitialRest) => Match2(TakeRemaining(InitialRest), (Remaining2, RemainingRest) => [`${Initial2}${Remaining2}`, RemainingRest], () => []),
    // fail: did not match Remaining
    () => []
  );
}
function Ident(input) {
  return TakeIdent(Trim(input));
}

// ../../node_modules/typebox/build/type/script/token/unsigned_number.mjs
var AllowedDigits2 = [...Digit, UnderScore];
function IsLeadingDot(input) {
  return IsMatch(Take([Dot], input));
}
function TakeFractional(input) {
  return Match2(Many(AllowedDigits2, [UnderScore], input), (Digits, DigitsRest) => IsEqual(Digits, "") ? [] : [Digits, DigitsRest], () => []);
}
function LeadingDot(input) {
  return Match2(
    Take([Dot], input),
    (Dot2, DotRest) => Match2(TakeFractional(DotRest), (Fractional, FractionalRest) => [`0${Dot2}${Fractional}`, FractionalRest], () => []),
    // fail: did not match Fractional
    () => []
  );
}
function LeadingInteger(input) {
  return Match2(
    UnsignedInteger(input),
    (Integer3, IntegerRest) => Match2(
      Take([Dot], IntegerRest),
      (Dot2, DotRest) => Match2(TakeFractional(DotRest), (Fractional, FractionalRest) => [`${Integer3}${Dot2}${Fractional}`, FractionalRest], () => [`${Integer3}`, DotRest]),
      // fail: did not match Fractional, use Integer
      () => [`${Integer3}`, IntegerRest]
    ),
    // fail: did not match Dot, use Integer
    () => []
  );
}
function TakeUnsignedNumber(input) {
  return IsLeadingDot(input) ? LeadingDot(input) : LeadingInteger(input);
}
function UnsignedNumber(input) {
  return TakeUnsignedNumber(Trim(input));
}

// ../../node_modules/typebox/build/type/script/token/number.mjs
function TakeSign2(input) {
  return Optional2(Hyphen, input);
}
function TakeSignedNumber(input) {
  return Match2(
    TakeSign2(input),
    (Sign, SignRest) => Match2(UnsignedNumber(SignRest), (UnsignedInteger2, UnsignedIntegerRest) => [`${Sign}${UnsignedInteger2}`, UnsignedIntegerRest], () => []),
    // fail: did not match unsigned integer
    () => []
  );
}
function Number3(input) {
  return TakeSignedNumber(Trim(input));
}

// ../../node_modules/typebox/build/type/script/token/until.mjs
function TakeOne(input) {
  const result = IsEqual(input, "") ? [] : [input.slice(0, 1), input.slice(1)];
  return result;
}
function IsInputMatchSentinal(end, input) {
  return ShiftLeft(end, (left, right) => input.startsWith(left) ? true : IsInputMatchSentinal(right, input), () => false);
}
function Until(end, input, result = "") {
  return Match2(
    TakeOne(input),
    (One, Rest2) => IsInputMatchSentinal(end, input) ? [result, input] : Until(end, Rest2, `${result}${One}`),
    () => []
  );
}

// ../../node_modules/typebox/build/type/script/token/span.mjs
function MultiLine(start, end, input) {
  return Match2(
    Take([start], input),
    (_, Rest2) => Match2(
      Until([end], Rest2),
      (Until2, UntilRest) => Match2(Take([end], UntilRest), (_2, Rest3) => [`${Until2}`, Rest3], () => []),
      // fail: did not match End
      () => []
    ),
    // fail: did not match Until
    () => []
  );
}
function SingleLine(start, end, input) {
  return Match2(
    Take([start], input),
    (_, Rest2) => Match2(
      Until([NewLine, end], Rest2),
      (Until2, UntilRest) => Match2(Take([end], UntilRest), (_2, EndRest) => [`${Until2}`, EndRest], () => []),
      // fail: did not match End
      () => []
    ),
    // fail: did not match Until
    () => []
  );
}
function Span(start, end, multiLine, input) {
  return multiLine ? MultiLine(start, end, Trim(input)) : SingleLine(start, end, Trim(input));
}

// ../../node_modules/typebox/build/type/script/token/string.mjs
function TakeInitial2(quotes, input) {
  return Take(quotes, input);
}
function TakeSpan(quote, input) {
  return Span(quote, quote, false, input);
}
function TakeString(quotes, input) {
  return Match2(TakeInitial2(quotes, input), (Initial2, InitialRest) => TakeSpan(Initial2, `${Initial2}${InitialRest}`), () => []);
}
function String3(quotes, input) {
  return TakeString(quotes, Trim(input));
}

// ../../node_modules/typebox/build/type/script/token/until_1.mjs
function Until_1(end, input) {
  return Match2(Until(end, input), (Until2, UntilRest) => IsEqual(Until2, "") ? [] : [Until2, UntilRest], () => []);
}

// ../../node_modules/typebox/build/type/script/parser.mjs
var If = (result, left, right = () => []) => result.length === 2 ? left(result) : right();
var GenericParameterExtendsEquals = (input) => If(If(Ident(input), ([_0, input2]) => If(Const("extends", input2), ([_1, input3]) => If(Type(input3), ([_2, input4]) => If(Const("=", input4), ([_3, input5]) => If(Type(input5), ([_4, input6]) => [[_0, _1, _2, _3, _4], input6]))))), ([_0, input2]) => [GenericParameterExtendsEqualsMapping(_0), input2]);
var GenericParameterExtends = (input) => If(If(Ident(input), ([_0, input2]) => If(Const("extends", input2), ([_1, input3]) => If(Type(input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [GenericParameterExtendsMapping(_0), input2]);
var GenericParameterEquals = (input) => If(If(Ident(input), ([_0, input2]) => If(Const("=", input2), ([_1, input3]) => If(Type(input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [GenericParameterEqualsMapping(_0), input2]);
var GenericParameterIdentifier = (input) => If(Ident(input), ([_0, input2]) => [GenericParameterIdentifierMapping(_0), input2]);
var GenericParameter = (input) => If(If(GenericParameterExtendsEquals(input), ([_0, input2]) => [_0, input2], () => If(GenericParameterExtends(input), ([_0, input2]) => [_0, input2], () => If(GenericParameterEquals(input), ([_0, input2]) => [_0, input2], () => If(GenericParameterIdentifier(input), ([_0, input2]) => [_0, input2], () => [])))), ([_0, input2]) => [GenericParameterMapping(_0), input2]);
var GenericParameterList_0 = (input, result = []) => If(If(GenericParameter(input), ([_0, input2]) => If(Const(",", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => GenericParameterList_0(input2, [...result, _0]), () => [result, input]);
var GenericParameterList = (input) => If(If(GenericParameterList_0(input), ([_0, input2]) => If(If(If(GenericParameter(input2), ([_02, input3]) => [[_02], input3]), ([_02, input3]) => [_02, input3], () => If([[], input2], ([_02, input3]) => [_02, input3], () => [])), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [GenericParameterListMapping(_0), input2]);
var GenericParameters = (input) => If(If(Const("<", input), ([_0, input2]) => If(GenericParameterList(input2), ([_1, input3]) => If(Const(">", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [GenericParametersMapping(_0), input2]);
var GenericCallArgumentList_0 = (input, result = []) => If(If(Type(input), ([_0, input2]) => If(Const(",", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => GenericCallArgumentList_0(input2, [...result, _0]), () => [result, input]);
var GenericCallArgumentList = (input) => If(If(GenericCallArgumentList_0(input), ([_0, input2]) => If(If(If(Type(input2), ([_02, input3]) => [[_02], input3]), ([_02, input3]) => [_02, input3], () => If([[], input2], ([_02, input3]) => [_02, input3], () => [])), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [GenericCallArgumentListMapping(_0), input2]);
var GenericCallArguments = (input) => If(If(Const("<", input), ([_0, input2]) => If(GenericCallArgumentList(input2), ([_1, input3]) => If(Const(">", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [GenericCallArgumentsMapping(_0), input2]);
var GenericCall = (input) => If(If(Ident(input), ([_0, input2]) => If(GenericCallArguments(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [GenericCallMapping(_0), input2]);
var OptionalSemiColon = (input) => If(If(If(Const(";", input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [OptionalSemiColonMapping(_0), input2]);
var KeywordString = (input) => If(Const("string", input), ([_0, input2]) => [KeywordStringMapping(_0), input2]);
var KeywordNumber = (input) => If(Const("number", input), ([_0, input2]) => [KeywordNumberMapping(_0), input2]);
var KeywordBoolean = (input) => If(Const("boolean", input), ([_0, input2]) => [KeywordBooleanMapping(_0), input2]);
var KeywordUndefined = (input) => If(Const("undefined", input), ([_0, input2]) => [KeywordUndefinedMapping(_0), input2]);
var KeywordNull = (input) => If(Const("null", input), ([_0, input2]) => [KeywordNullMapping(_0), input2]);
var KeywordInteger = (input) => If(Const("integer", input), ([_0, input2]) => [KeywordIntegerMapping(_0), input2]);
var KeywordBigInt = (input) => If(Const("bigint", input), ([_0, input2]) => [KeywordBigIntMapping(_0), input2]);
var KeywordUnknown = (input) => If(Const("unknown", input), ([_0, input2]) => [KeywordUnknownMapping(_0), input2]);
var KeywordAny = (input) => If(Const("any", input), ([_0, input2]) => [KeywordAnyMapping(_0), input2]);
var KeywordObject = (input) => If(Const("object", input), ([_0, input2]) => [KeywordObjectMapping(_0), input2]);
var KeywordNever = (input) => If(Const("never", input), ([_0, input2]) => [KeywordNeverMapping(_0), input2]);
var KeywordSymbol = (input) => If(Const("symbol", input), ([_0, input2]) => [KeywordSymbolMapping(_0), input2]);
var KeywordVoid = (input) => If(Const("void", input), ([_0, input2]) => [KeywordVoidMapping(_0), input2]);
var KeywordThis = (input) => If(Const("this", input), ([_0, input2]) => [KeywordThisMapping(_0), input2]);
var TemplateInterpolate = (input) => If(If(Const("${", input), ([_0, input2]) => If(Type(input2), ([_1, input3]) => If(Const("}", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [TemplateInterpolateMapping(_0), input2]);
var TemplateSpan = (input) => If(Until(["${", "`"], input), ([_0, input2]) => [TemplateSpanMapping(_0), input2]);
var TemplateBody = (input) => If(If(If(TemplateSpan(input), ([_0, input2]) => If(TemplateInterpolate(input2), ([_1, input3]) => If(TemplateBody(input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [_0, input2], () => If(If(TemplateSpan(input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If(If(TemplateSpan(input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => []))), ([_0, input2]) => [TemplateBodyMapping(_0), input2]);
var TemplateLiteralTypes = (input) => If(If(Const("`", input), ([_0, input2]) => If(TemplateBody(input2), ([_1, input3]) => If(Const("`", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [TemplateLiteralTypesMapping(_0), input2]);
var TemplateLiteral = (input) => If(TemplateLiteralTypes(input), ([_0, input2]) => [TemplateLiteralMapping(_0), input2]);
var Dependent2 = (input) => If(If(If(Const("if", input), ([_0, input2]) => If(Type(input2), ([_1, input3]) => If(Const("then", input3), ([_2, input4]) => If(Type(input4), ([_3, input5]) => If(Const("else", input5), ([_4, input6]) => If(Type(input6), ([_5, input7]) => [[_0, _1, _2, _3, _4, _5], input7])))))), ([_0, input2]) => [_0, input2], () => If(If(Const("if", input), ([_0, input2]) => If(Type(input2), ([_1, input3]) => If(Const("then", input3), ([_2, input4]) => If(Type(input4), ([_3, input5]) => [[_0, _1, _2, _3], input5])))), ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [DependentMapping(_0), input2]);
var LiteralBigInt = (input) => If(BigInt3(input), ([_0, input2]) => [LiteralBigIntMapping(_0), input2]);
var LiteralBoolean = (input) => If(If(Const("true", input), ([_0, input2]) => [_0, input2], () => If(Const("false", input), ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [LiteralBooleanMapping(_0), input2]);
var LiteralNumber = (input) => If(Number3(input), ([_0, input2]) => [LiteralNumberMapping(_0), input2]);
var LiteralString = (input) => If(String3(["'", '"'], input), ([_0, input2]) => [LiteralStringMapping(_0), input2]);
var KeyOf = (input) => If(If(If(Const("keyof", input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [KeyOfMapping(_0), input2]);
var IndexArray_0 = (input, result = []) => If(If(If(Const("[", input), ([_0, input2]) => If(Type(input2), ([_1, input3]) => If(Const("]", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [_0, input2], () => If(If(Const("[", input), ([_0, input2]) => If(Const("]", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => IndexArray_0(input2, [...result, _0]), () => [result, input]);
var IndexArray = (input) => If(IndexArray_0(input), ([_0, input2]) => [IndexArrayMapping(_0), input2]);
var Extends2 = (input) => If(If(If(Const("extends", input), ([_0, input2]) => If(Type(input2), ([_1, input3]) => If(Const("?", input3), ([_2, input4]) => If(Type(input4), ([_3, input5]) => If(Const(":", input5), ([_4, input6]) => If(Type(input6), ([_5, input7]) => [[_0, _1, _2, _3, _4, _5], input7])))))), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [ExtendsMapping(_0), input2]);
var Base = (input) => If(If(If(Const("(", input), ([_0, input2]) => If(Type(input2), ([_1, input3]) => If(Const(")", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [_0, input2], () => If(KeywordString(input), ([_0, input2]) => [_0, input2], () => If(KeywordNumber(input), ([_0, input2]) => [_0, input2], () => If(KeywordBoolean(input), ([_0, input2]) => [_0, input2], () => If(KeywordUndefined(input), ([_0, input2]) => [_0, input2], () => If(KeywordNull(input), ([_0, input2]) => [_0, input2], () => If(KeywordInteger(input), ([_0, input2]) => [_0, input2], () => If(KeywordBigInt(input), ([_0, input2]) => [_0, input2], () => If(KeywordUnknown(input), ([_0, input2]) => [_0, input2], () => If(KeywordAny(input), ([_0, input2]) => [_0, input2], () => If(KeywordObject(input), ([_0, input2]) => [_0, input2], () => If(KeywordNever(input), ([_0, input2]) => [_0, input2], () => If(KeywordSymbol(input), ([_0, input2]) => [_0, input2], () => If(KeywordVoid(input), ([_0, input2]) => [_0, input2], () => If(KeywordThis(input), ([_0, input2]) => [_0, input2], () => If(LiteralBigInt(input), ([_0, input2]) => [_0, input2], () => If(LiteralBoolean(input), ([_0, input2]) => [_0, input2], () => If(LiteralNumber(input), ([_0, input2]) => [_0, input2], () => If(LiteralString(input), ([_0, input2]) => [_0, input2], () => If(TemplateLiteral(input), ([_0, input2]) => [_0, input2], () => If(Dependent2(input), ([_0, input2]) => [_0, input2], () => If(_Object_2(input), ([_0, input2]) => [_0, input2], () => If(_Tuple_(input), ([_0, input2]) => [_0, input2], () => If(_Constructor_(input), ([_0, input2]) => [_0, input2], () => If(_Function_2(input), ([_0, input2]) => [_0, input2], () => If(_Mapped_(input), ([_0, input2]) => [_0, input2], () => If(GenericCall(input), ([_0, input2]) => [_0, input2], () => If(Reference(input), ([_0, input2]) => [_0, input2], () => [])))))))))))))))))))))))))))), ([_0, input2]) => [BaseMapping(_0), input2]);
var With = (input) => If(If(If(Const("with", input), ([_0, input2]) => If(WithObject(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [WithMapping(_0), input2]);
var Factor = (input) => If(If(KeyOf(input), ([_0, input2]) => If(Base(input2), ([_1, input3]) => If(IndexArray(input3), ([_2, input4]) => If(Extends2(input4), ([_3, input5]) => If(With(input5), ([_4, input6]) => [[_0, _1, _2, _3, _4], input6]))))), ([_0, input2]) => [FactorMapping(_0), input2]);
var ExprTermTail = (input) => If(If(If(Const("&", input), ([_0, input2]) => If(Factor(input2), ([_1, input3]) => If(ExprTermTail(input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [ExprTermTailMapping(_0), input2]);
var ExprTerm = (input) => If(If(Factor(input), ([_0, input2]) => If(ExprTermTail(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [ExprTermMapping(_0), input2]);
var ExprTail = (input) => If(If(If(Const("|", input), ([_0, input2]) => If(ExprTerm(input2), ([_1, input3]) => If(ExprTail(input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [ExprTailMapping(_0), input2]);
var Expr = (input) => If(If(ExprTerm(input), ([_0, input2]) => If(ExprTail(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [ExprMapping(_0), input2]);
var ExprReadonly = (input) => If(If(Const("readonly", input), ([_0, input2]) => If(Expr(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [ExprReadonlyMapping(_0), input2]);
var ExprPipe = (input) => If(If(Const("|", input), ([_0, input2]) => If(Expr(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [ExprPipeMapping(_0), input2]);
var GenericType = (input) => If(If(GenericParameters(input), ([_0, input2]) => If(Const("=", input2), ([_1, input3]) => If(Type(input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [GenericTypeMapping(_0), input2]);
var InferType = (input) => If(If(If(Const("infer", input), ([_0, input2]) => If(Ident(input2), ([_1, input3]) => If(Const("extends", input3), ([_2, input4]) => If(Expr(input4), ([_3, input5]) => [[_0, _1, _2, _3], input5])))), ([_0, input2]) => [_0, input2], () => If(If(Const("infer", input), ([_0, input2]) => If(Ident(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [InferTypeMapping(_0), input2]);
var Type = (input) => If(If(InferType(input), ([_0, input2]) => [_0, input2], () => If(ExprPipe(input), ([_0, input2]) => [_0, input2], () => If(ExprReadonly(input), ([_0, input2]) => [_0, input2], () => If(Expr(input), ([_0, input2]) => [_0, input2], () => [])))), ([_0, input2]) => [TypeMapping(_0), input2]);
var PropertyKeyNumber = (input) => If(Number3(input), ([_0, input2]) => [PropertyKeyNumberMapping(_0), input2]);
var PropertyKeyIdent = (input) => If(Ident(input), ([_0, input2]) => [PropertyKeyIdentMapping(_0), input2]);
var PropertyKeyQuoted = (input) => If(String3(["'", '"'], input), ([_0, input2]) => [PropertyKeyQuotedMapping(_0), input2]);
var PropertyKeyIndex = (input) => If(If(Const("[", input), ([_0, input2]) => If(Ident(input2), ([_1, input3]) => If(Const(":", input3), ([_2, input4]) => If(If(KeywordInteger(input4), ([_02, input5]) => [_02, input5], () => If(KeywordNumber(input4), ([_02, input5]) => [_02, input5], () => If(KeywordString(input4), ([_02, input5]) => [_02, input5], () => If(KeywordSymbol(input4), ([_02, input5]) => [_02, input5], () => [])))), ([_3, input5]) => If(Const("]", input5), ([_4, input6]) => [[_0, _1, _2, _3, _4], input6]))))), ([_0, input2]) => [PropertyKeyIndexMapping(_0), input2]);
var PropertyKey = (input) => If(If(PropertyKeyNumber(input), ([_0, input2]) => [_0, input2], () => If(PropertyKeyIdent(input), ([_0, input2]) => [_0, input2], () => If(PropertyKeyQuoted(input), ([_0, input2]) => [_0, input2], () => If(PropertyKeyIndex(input), ([_0, input2]) => [_0, input2], () => [])))), ([_0, input2]) => [PropertyKeyMapping(_0), input2]);
var Readonly2 = (input) => If(If(If(Const("readonly", input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [ReadonlyMapping(_0), input2]);
var Optional3 = (input) => If(If(If(Const("?", input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [OptionalMapping(_0), input2]);
var Property = (input) => If(If(Readonly2(input), ([_0, input2]) => If(PropertyKey(input2), ([_1, input3]) => If(Optional3(input3), ([_2, input4]) => If(Const(":", input4), ([_3, input5]) => If(Type(input5), ([_4, input6]) => [[_0, _1, _2, _3, _4], input6]))))), ([_0, input2]) => [PropertyMapping(_0), input2]);
var PropertyDelimiter = (input) => If(If(If(Const(",", input), ([_0, input2]) => If(Const("\n", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => If(If(Const(";", input), ([_0, input2]) => If(Const("\n", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => If(If(Const(",", input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If(If(Const(";", input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If(If(Const("\n", input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => []))))), ([_0, input2]) => [PropertyDelimiterMapping(_0), input2]);
var PropertyList_0 = (input, result = []) => If(If(Property(input), ([_0, input2]) => If(PropertyDelimiter(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => PropertyList_0(input2, [...result, _0]), () => [result, input]);
var PropertyList = (input) => If(If(PropertyList_0(input), ([_0, input2]) => If(If(If(Property(input2), ([_02, input3]) => [[_02], input3]), ([_02, input3]) => [_02, input3], () => If([[], input2], ([_02, input3]) => [_02, input3], () => [])), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [PropertyListMapping(_0), input2]);
var Properties = (input) => If(If(Const("{", input), ([_0, input2]) => If(PropertyList(input2), ([_1, input3]) => If(Const("}", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [PropertiesMapping(_0), input2]);
var _Object_2 = (input) => If(Properties(input), ([_0, input2]) => [_Object_Mapping(_0), input2]);
var ElementNamed = (input) => If(If(If(Ident(input), ([_0, input2]) => If(Const("?", input2), ([_1, input3]) => If(Const(":", input3), ([_2, input4]) => If(Const("readonly", input4), ([_3, input5]) => If(Type(input5), ([_4, input6]) => [[_0, _1, _2, _3, _4], input6]))))), ([_0, input2]) => [_0, input2], () => If(If(Ident(input), ([_0, input2]) => If(Const(":", input2), ([_1, input3]) => If(Const("readonly", input3), ([_2, input4]) => If(Type(input4), ([_3, input5]) => [[_0, _1, _2, _3], input5])))), ([_0, input2]) => [_0, input2], () => If(If(Ident(input), ([_0, input2]) => If(Const("?", input2), ([_1, input3]) => If(Const(":", input3), ([_2, input4]) => If(Type(input4), ([_3, input5]) => [[_0, _1, _2, _3], input5])))), ([_0, input2]) => [_0, input2], () => If(If(Ident(input), ([_0, input2]) => If(Const(":", input2), ([_1, input3]) => If(Type(input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [_0, input2], () => [])))), ([_0, input2]) => [ElementNamedMapping(_0), input2]);
var ElementReadonlyOptional = (input) => If(If(Const("readonly", input), ([_0, input2]) => If(Type(input2), ([_1, input3]) => If(Const("?", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [ElementReadonlyOptionalMapping(_0), input2]);
var ElementReadonly = (input) => If(If(Const("readonly", input), ([_0, input2]) => If(Type(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [ElementReadonlyMapping(_0), input2]);
var ElementOptional = (input) => If(If(Type(input), ([_0, input2]) => If(Const("?", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [ElementOptionalMapping(_0), input2]);
var ElementBase = (input) => If(If(ElementNamed(input), ([_0, input2]) => [_0, input2], () => If(ElementReadonlyOptional(input), ([_0, input2]) => [_0, input2], () => If(ElementReadonly(input), ([_0, input2]) => [_0, input2], () => If(ElementOptional(input), ([_0, input2]) => [_0, input2], () => If(Type(input), ([_0, input2]) => [_0, input2], () => []))))), ([_0, input2]) => [ElementBaseMapping(_0), input2]);
var Element = (input) => If(If(If(Const("...", input), ([_0, input2]) => If(ElementBase(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => If(If(ElementBase(input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [ElementMapping(_0), input2]);
var ElementList_0 = (input, result = []) => If(If(Element(input), ([_0, input2]) => If(Const(",", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => ElementList_0(input2, [...result, _0]), () => [result, input]);
var ElementList = (input) => If(If(ElementList_0(input), ([_0, input2]) => If(If(If(Element(input2), ([_02, input3]) => [[_02], input3]), ([_02, input3]) => [_02, input3], () => If([[], input2], ([_02, input3]) => [_02, input3], () => [])), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [ElementListMapping(_0), input2]);
var _Tuple_ = (input) => If(If(Const("[", input), ([_0, input2]) => If(ElementList(input2), ([_1, input3]) => If(Const("]", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [_Tuple_Mapping(_0), input2]);
var ParameterReadonlyOptional = (input) => If(If(Ident(input), ([_0, input2]) => If(Const("?", input2), ([_1, input3]) => If(Const(":", input3), ([_2, input4]) => If(Const("readonly", input4), ([_3, input5]) => If(Type(input5), ([_4, input6]) => [[_0, _1, _2, _3, _4], input6]))))), ([_0, input2]) => [ParameterReadonlyOptionalMapping(_0), input2]);
var ParameterReadonly = (input) => If(If(Ident(input), ([_0, input2]) => If(Const(":", input2), ([_1, input3]) => If(Const("readonly", input3), ([_2, input4]) => If(Type(input4), ([_3, input5]) => [[_0, _1, _2, _3], input5])))), ([_0, input2]) => [ParameterReadonlyMapping(_0), input2]);
var ParameterOptional = (input) => If(If(Ident(input), ([_0, input2]) => If(Const("?", input2), ([_1, input3]) => If(Const(":", input3), ([_2, input4]) => If(Type(input4), ([_3, input5]) => [[_0, _1, _2, _3], input5])))), ([_0, input2]) => [ParameterOptionalMapping(_0), input2]);
var ParameterType = (input) => If(If(Ident(input), ([_0, input2]) => If(Const(":", input2), ([_1, input3]) => If(Type(input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [ParameterTypeMapping(_0), input2]);
var ParameterBase = (input) => If(If(ParameterReadonlyOptional(input), ([_0, input2]) => [_0, input2], () => If(ParameterReadonly(input), ([_0, input2]) => [_0, input2], () => If(ParameterOptional(input), ([_0, input2]) => [_0, input2], () => If(ParameterType(input), ([_0, input2]) => [_0, input2], () => [])))), ([_0, input2]) => [ParameterBaseMapping(_0), input2]);
var Parameter2 = (input) => If(If(If(Const("...", input), ([_0, input2]) => If(ParameterBase(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => If(If(ParameterBase(input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [ParameterMapping(_0), input2]);
var ParameterList_0 = (input, result = []) => If(If(Parameter2(input), ([_0, input2]) => If(Const(",", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => ParameterList_0(input2, [...result, _0]), () => [result, input]);
var ParameterList = (input) => If(If(ParameterList_0(input), ([_0, input2]) => If(If(If(Parameter2(input2), ([_02, input3]) => [[_02], input3]), ([_02, input3]) => [_02, input3], () => If([[], input2], ([_02, input3]) => [_02, input3], () => [])), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [ParameterListMapping(_0), input2]);
var _Function_2 = (input) => If(If(Const("(", input), ([_0, input2]) => If(ParameterList(input2), ([_1, input3]) => If(Const(")", input3), ([_2, input4]) => If(Const("=>", input4), ([_3, input5]) => If(Type(input5), ([_4, input6]) => [[_0, _1, _2, _3, _4], input6]))))), ([_0, input2]) => [_Function_Mapping(_0), input2]);
var _Constructor_ = (input) => If(If(Const("new", input), ([_0, input2]) => If(Const("(", input2), ([_1, input3]) => If(ParameterList(input3), ([_2, input4]) => If(Const(")", input4), ([_3, input5]) => If(Const("=>", input5), ([_4, input6]) => If(Type(input6), ([_5, input7]) => [[_0, _1, _2, _3, _4, _5], input7])))))), ([_0, input2]) => [_Constructor_Mapping(_0), input2]);
var MappedReadonly = (input) => If(If(If(Const("+", input), ([_0, input2]) => If(Const("readonly", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => If(If(Const("-", input), ([_0, input2]) => If(Const("readonly", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => If(If(Const("readonly", input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])))), ([_0, input2]) => [MappedReadonlyMapping(_0), input2]);
var MappedOptional = (input) => If(If(If(Const("+", input), ([_0, input2]) => If(Const("?", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => If(If(Const("-", input), ([_0, input2]) => If(Const("?", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => If(If(Const("?", input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])))), ([_0, input2]) => [MappedOptionalMapping(_0), input2]);
var MappedAs = (input) => If(If(If(Const("as", input), ([_0, input2]) => If(Type(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [MappedAsMapping(_0), input2]);
var _Mapped_ = (input) => If(If(Const("{", input), ([_0, input2]) => If(MappedReadonly(input2), ([_1, input3]) => If(Const("[", input3), ([_2, input4]) => If(Ident(input4), ([_3, input5]) => If(Const("in", input5), ([_4, input6]) => If(Type(input6), ([_5, input7]) => If(MappedAs(input7), ([_6, input8]) => If(Const("]", input8), ([_7, input9]) => If(MappedOptional(input9), ([_8, input10]) => If(Const(":", input10), ([_9, input11]) => If(Type(input11), ([_10, input12]) => If(OptionalSemiColon(input12), ([_11, input13]) => If(Const("}", input13), ([_12, input14]) => [[_0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12], input14]))))))))))))), ([_0, input2]) => [_Mapped_Mapping(_0), input2]);
var Reference = (input) => If(Ident(input), ([_0, input2]) => [ReferenceMapping(_0), input2]);
var WithBigInt = (input) => If(BigInt3(input), ([_0, input2]) => [WithBigIntMapping(_0), input2]);
var WithNumber = (input) => If(Number3(input), ([_0, input2]) => [WithNumberMapping(_0), input2]);
var WithBoolean = (input) => If(If(Const("true", input), ([_0, input2]) => [_0, input2], () => If(Const("false", input), ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [WithBooleanMapping(_0), input2]);
var WithString = (input) => If(String3(['"', "'"], input), ([_0, input2]) => [WithStringMapping(_0), input2]);
var WithNull = (input) => If(Const("null", input), ([_0, input2]) => [WithNullMapping(_0), input2]);
var WithUndefined = (input) => If(Const("undefined", input), ([_0, input2]) => [WithUndefinedMapping(_0), input2]);
var WithProperty = (input) => If(If(PropertyKey(input), ([_0, input2]) => If(Const(":", input2), ([_1, input3]) => If(WithValue(input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [WithPropertyMapping(_0), input2]);
var WithPropertyList_0 = (input, result = []) => If(If(WithProperty(input), ([_0, input2]) => If(PropertyDelimiter(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => WithPropertyList_0(input2, [...result, _0]), () => [result, input]);
var WithPropertyList = (input) => If(If(WithPropertyList_0(input), ([_0, input2]) => If(If(If(WithProperty(input2), ([_02, input3]) => [[_02], input3]), ([_02, input3]) => [_02, input3], () => If([[], input2], ([_02, input3]) => [_02, input3], () => [])), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [WithPropertyListMapping(_0), input2]);
var WithObject = (input) => If(If(Const("{", input), ([_0, input2]) => If(WithPropertyList(input2), ([_1, input3]) => If(Const("}", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [WithObjectMapping(_0), input2]);
var WithElementList_0 = (input, result = []) => If(If(WithValue(input), ([_0, input2]) => If(Const(",", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => WithElementList_0(input2, [...result, _0]), () => [result, input]);
var WithElementList = (input) => If(If(WithElementList_0(input), ([_0, input2]) => If(If(If(WithValue(input2), ([_02, input3]) => [[_02], input3]), ([_02, input3]) => [_02, input3], () => If([[], input2], ([_02, input3]) => [_02, input3], () => [])), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [WithElementListMapping(_0), input2]);
var WithArray = (input) => If(If(Const("[", input), ([_0, input2]) => If(WithElementList(input2), ([_1, input3]) => If(Const("]", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [WithArrayMapping(_0), input2]);
var WithValue = (input) => If(If(WithBigInt(input), ([_0, input2]) => [_0, input2], () => If(WithNumber(input), ([_0, input2]) => [_0, input2], () => If(WithBoolean(input), ([_0, input2]) => [_0, input2], () => If(WithString(input), ([_0, input2]) => [_0, input2], () => If(WithNull(input), ([_0, input2]) => [_0, input2], () => If(WithUndefined(input), ([_0, input2]) => [_0, input2], () => If(WithObject(input), ([_0, input2]) => [_0, input2], () => If(WithArray(input), ([_0, input2]) => [_0, input2], () => [])))))))), ([_0, input2]) => [WithValueMapping(_0), input2]);
var PatternBigInt = (input) => If(Const("-?(?:0|[1-9][0-9]*)n", input), ([_0, input2]) => [PatternBigIntMapping(_0), input2]);
var PatternString = (input) => If(Const(".*", input), ([_0, input2]) => [PatternStringMapping(_0), input2]);
var PatternNumber = (input) => If(Const("-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?", input), ([_0, input2]) => [PatternNumberMapping(_0), input2]);
var PatternInteger = (input) => If(Const("-?(?:0|[1-9][0-9]*)", input), ([_0, input2]) => [PatternIntegerMapping(_0), input2]);
var PatternNever = (input) => If(Const("(?!)", input), ([_0, input2]) => [PatternNeverMapping(_0), input2]);
var PatternText = (input) => If(Until_1(["-?(?:0|[1-9][0-9]*)n", ".*", "-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?", "-?(?:0|[1-9][0-9]*)", "(?!)", "(", ")", "$", "|"], input), ([_0, input2]) => [PatternTextMapping(_0), input2]);
var PatternBase = (input) => If(If(PatternBigInt(input), ([_0, input2]) => [_0, input2], () => If(PatternString(input), ([_0, input2]) => [_0, input2], () => If(PatternNumber(input), ([_0, input2]) => [_0, input2], () => If(PatternInteger(input), ([_0, input2]) => [_0, input2], () => If(PatternNever(input), ([_0, input2]) => [_0, input2], () => If(PatternGroup(input), ([_0, input2]) => [_0, input2], () => If(PatternText(input), ([_0, input2]) => [_0, input2], () => []))))))), ([_0, input2]) => [PatternBaseMapping(_0), input2]);
var PatternGroup = (input) => If(If(Const("(", input), ([_0, input2]) => If(PatternBody(input2), ([_1, input3]) => If(Const(")", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [PatternGroupMapping(_0), input2]);
var PatternUnion = (input) => If(If(If(PatternTerm(input), ([_0, input2]) => If(Const("|", input2), ([_1, input3]) => If(PatternUnion(input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [_0, input2], () => If(If(PatternTerm(input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => []))), ([_0, input2]) => [PatternUnionMapping(_0), input2]);
var PatternTerm = (input) => If(If(PatternBase(input), ([_0, input2]) => If(PatternBody(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [PatternTermMapping(_0), input2]);
var PatternBody = (input) => If(If(PatternUnion(input), ([_0, input2]) => [_0, input2], () => If(PatternTerm(input), ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [PatternBodyMapping(_0), input2]);
var Pattern = (input) => If(If(Const("^", input), ([_0, input2]) => If(PatternBody(input2), ([_1, input3]) => If(Const("$", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [PatternMapping(_0), input2]);
var InterfaceDeclarationHeritageList_0 = (input, result = []) => If(If(Type(input), ([_0, input2]) => If(Const(",", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => InterfaceDeclarationHeritageList_0(input2, [...result, _0]), () => [result, input]);
var InterfaceDeclarationHeritageList = (input) => If(If(InterfaceDeclarationHeritageList_0(input), ([_0, input2]) => If(If(If(Type(input2), ([_02, input3]) => [[_02], input3]), ([_02, input3]) => [_02, input3], () => If([[], input2], ([_02, input3]) => [_02, input3], () => [])), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [InterfaceDeclarationHeritageListMapping(_0), input2]);
var InterfaceDeclarationHeritage = (input) => If(If(If(Const("extends", input), ([_0, input2]) => If(InterfaceDeclarationHeritageList(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [InterfaceDeclarationHeritageMapping(_0), input2]);
var InterfaceDeclarationGeneric = (input) => If(If(Const("interface", input), ([_0, input2]) => If(Ident(input2), ([_1, input3]) => If(GenericParameters(input3), ([_2, input4]) => If(InterfaceDeclarationHeritage(input4), ([_3, input5]) => If(Properties(input5), ([_4, input6]) => [[_0, _1, _2, _3, _4], input6]))))), ([_0, input2]) => [InterfaceDeclarationGenericMapping(_0), input2]);
var InterfaceDeclaration = (input) => If(If(Const("interface", input), ([_0, input2]) => If(Ident(input2), ([_1, input3]) => If(InterfaceDeclarationHeritage(input3), ([_2, input4]) => If(Properties(input4), ([_3, input5]) => [[_0, _1, _2, _3], input5])))), ([_0, input2]) => [InterfaceDeclarationMapping(_0), input2]);
var TypeAliasDeclarationGeneric = (input) => If(If(Const("type", input), ([_0, input2]) => If(Ident(input2), ([_1, input3]) => If(GenericParameters(input3), ([_2, input4]) => If(Const("=", input4), ([_3, input5]) => If(Type(input5), ([_4, input6]) => [[_0, _1, _2, _3, _4], input6]))))), ([_0, input2]) => [TypeAliasDeclarationGenericMapping(_0), input2]);
var TypeAliasDeclaration = (input) => If(If(Const("type", input), ([_0, input2]) => If(Ident(input2), ([_1, input3]) => If(Const("=", input3), ([_2, input4]) => If(Type(input4), ([_3, input5]) => [[_0, _1, _2, _3], input5])))), ([_0, input2]) => [TypeAliasDeclarationMapping(_0), input2]);
var ExportKeyword = (input) => If(If(If(Const("export", input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [ExportKeywordMapping(_0), input2]);
var ModuleDeclarationDelimiter = (input) => If(If(If(Const(";", input), ([_0, input2]) => If(Const("\n", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => If(If(Const(";", input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If(If(Const("\n", input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => []))), ([_0, input2]) => [ModuleDeclarationDelimiterMapping(_0), input2]);
var ModuleDeclarationList_0 = (input, result = []) => If(If(ModuleDeclaration(input), ([_0, input2]) => If(ModuleDeclarationDelimiter(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => ModuleDeclarationList_0(input2, [...result, _0]), () => [result, input]);
var ModuleDeclarationList = (input) => If(If(ModuleDeclarationList_0(input), ([_0, input2]) => If(If(If(ModuleDeclaration(input2), ([_02, input3]) => [[_02], input3]), ([_02, input3]) => [_02, input3], () => If([[], input2], ([_02, input3]) => [_02, input3], () => [])), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [ModuleDeclarationListMapping(_0), input2]);
var ModuleDeclaration = (input) => If(If(ExportKeyword(input), ([_0, input2]) => If(If(InterfaceDeclarationGeneric(input2), ([_02, input3]) => [_02, input3], () => If(InterfaceDeclaration(input2), ([_02, input3]) => [_02, input3], () => If(TypeAliasDeclarationGeneric(input2), ([_02, input3]) => [_02, input3], () => If(TypeAliasDeclaration(input2), ([_02, input3]) => [_02, input3], () => [])))), ([_1, input3]) => If(OptionalSemiColon(input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [ModuleDeclarationMapping(_0), input2]);
var Module = (input) => If(If(ModuleDeclaration(input), ([_0, input2]) => If(ModuleDeclarationList(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [ModuleMapping(_0), input2]);
var Script = (input) => If(If(Module(input), ([_0, input2]) => [_0, input2], () => If(GenericType(input), ([_0, input2]) => [_0, input2], () => If(Type(input), ([_0, input2]) => [_0, input2], () => []))), ([_0, input2]) => [ScriptMapping(_0), input2]);

// ../../node_modules/typebox/build/type/engine/patterns/template.mjs
function ParseTemplateIntoTypes(template) {
  const parsed = TemplateLiteralTypes(`\`${template}\``);
  const result = guard_exports.IsEqual(parsed.length, 2) ? parsed[0] : Unreachable();
  return result;
}

// ../../node_modules/typebox/build/type/engine/template_literal/encode.mjs
function JoinString(input) {
  return input.join("|");
}
function UnwrapTemplateLiteralPattern(pattern) {
  return pattern.slice(1, pattern.length - 1);
}
function EncodeLiteral(value, right, pattern) {
  return EncodeTypes(right, `${pattern}${value}`);
}
function EncodeBigInt(right, pattern) {
  return EncodeTypes(right, `${pattern}${BigIntPattern}`);
}
function EncodeInteger(right, pattern) {
  return EncodeTypes(right, `${pattern}${IntegerPattern}`);
}
function EncodeNumber(right, pattern) {
  return EncodeTypes(right, `${pattern}${NumberPattern}`);
}
function EncodeBoolean(right, pattern) {
  return EncodeType(Union([Literal("false"), Literal("true")]), right, pattern);
}
function EncodeString(right, pattern) {
  return EncodeTypes(right, `${pattern}${StringPattern}`);
}
function EncodeTemplateLiteral(templatePattern, right, pattern) {
  return EncodeTypes(right, `${pattern}${UnwrapTemplateLiteralPattern(templatePattern)}`);
}
function EncodeTemplateLiteralDeferred(types, right, pattern) {
  const templateLiteral = TemplateLiteralAction(types, {});
  const result = EncodeType(templateLiteral, right, pattern);
  return result;
}
function EncodeEnum(values, right, pattern) {
  const evaluated = EvaluateEnum(values);
  return EncodeType(evaluated, right, pattern);
}
function EncodeUnion(types, right, pattern, result = []) {
  return guard_exports.ShiftLeft(types, (head, tail) => EncodeUnion(tail, right, pattern, [...result, EncodeType(head, [], "")]), () => EncodeTypes(right, `${pattern}(${JoinString(result)})`));
}
function EncodeType(type, right, pattern) {
  return IsEnum(type) ? EncodeEnum(type.enum, right, pattern) : IsInteger2(type) ? EncodeInteger(right, pattern) : IsLiteral(type) ? EncodeLiteral(type.const, right, pattern) : IsBigInt2(type) ? EncodeBigInt(right, pattern) : IsBoolean3(type) ? EncodeBoolean(right, pattern) : IsNumber3(type) ? EncodeNumber(right, pattern) : IsString3(type) ? EncodeString(right, pattern) : IsTemplateLiteral(type) ? EncodeTemplateLiteral(type.pattern, right, pattern) : IsTemplateLiteralDeferred(type) ? EncodeTemplateLiteralDeferred(type.parameters[0], right, pattern) : IsUnion(type) ? EncodeUnion(type.anyOf, right, pattern) : NeverPattern;
}
function EncodeTypes(types, pattern) {
  return guard_exports.ShiftLeft(types, (left, right) => EncodeType(left, right, pattern), () => pattern);
}
function EncodePattern(types) {
  const encoded = EncodeTypes(types, "");
  const result = `^${encoded}$`;
  return result;
}
function TemplateLiteralEncode(types) {
  const pattern = EncodePattern(types);
  const result = TemplateLiteralCreate(pattern);
  return result;
}

// ../../node_modules/typebox/build/type/engine/template_literal/instantiate.mjs
function TemplateLiteralAction(types, options) {
  const result = CanInstantiate(types) ? memory_exports.Update(TemplateLiteralEncode(types), {}, options) : TemplateLiteralDeferred(types, options);
  return result;
}
function TemplateLiteralInstantiate(context, state, types, options) {
  const instantiatedTypes = InstantiateTypes(context, state, types);
  return TemplateLiteralAction(instantiatedTypes, options);
}

// ../../node_modules/typebox/build/type/types/template_literal.mjs
function TemplateLiteralDeferred(types, options = {}) {
  return Deferred("TemplateLiteral", [types], options);
}
function IsTemplateLiteralDeferred(value) {
  return IsSchema(value) && guard_exports.HasPropertyKey(value, "action") && guard_exports.IsEqual(value.action, "TemplateLiteral");
}
function TemplateLiteralFromTypes(types) {
  return TemplateLiteralAction(types, {});
}
function TemplateLiteralFromString(template) {
  const types = ParseTemplateIntoTypes(template);
  return TemplateLiteralFromTypes(types);
}
function TemplateLiteral2(input, options = {}) {
  const type = guard_exports.IsString(input) ? TemplateLiteralFromString(input) : TemplateLiteralFromTypes(input);
  return memory_exports.Update(type, {}, options);
}
function IsTemplateLiteral(value) {
  return IsKind(value, "TemplateLiteral");
}

// ../../node_modules/typebox/build/type/extends/result.mjs
var result_exports = {};
__export(result_exports, {
  ExtendsFalse: () => ExtendsFalse,
  ExtendsTrue: () => ExtendsTrue,
  ExtendsUnion: () => ExtendsUnion,
  IsExtendsFalse: () => IsExtendsFalse,
  IsExtendsTrue: () => IsExtendsTrue,
  IsExtendsTrueLike: () => IsExtendsTrueLike,
  IsExtendsUnion: () => IsExtendsUnion,
  Match: () => Match3
});
function ExtendsUnion(inferred) {
  return memory_exports.Create({ ["~kind"]: "ExtendsUnion" }, { inferred });
}
function IsExtendsUnion(value) {
  return guard_exports.IsObject(value) && guard_exports.HasPropertyKey(value, "~kind") && guard_exports.HasPropertyKey(value, "inferred") && guard_exports.IsEqual(value["~kind"], "ExtendsUnion") && guard_exports.IsObject(value.inferred);
}
function ExtendsTrue(inferred) {
  return memory_exports.Create({ ["~kind"]: "ExtendsTrue" }, { inferred });
}
function IsExtendsTrue(value) {
  return guard_exports.IsObject(value) && guard_exports.HasPropertyKey(value, "~kind") && guard_exports.HasPropertyKey(value, "inferred") && guard_exports.IsEqual(value["~kind"], "ExtendsTrue") && guard_exports.IsObject(value.inferred);
}
function ExtendsFalse() {
  return memory_exports.Create({ ["~kind"]: "ExtendsFalse" }, {});
}
function IsExtendsFalse(value) {
  return guard_exports.IsObject(value) && guard_exports.HasPropertyKey(value, "~kind") && guard_exports.IsEqual(value["~kind"], "ExtendsFalse");
}
function IsExtendsTrueLike(value) {
  return IsExtendsUnion(value) || IsExtendsTrue(value);
}
function Match3(result, true_, false_) {
  return IsExtendsTrueLike(result) ? true_(result.inferred) : false_();
}

// ../../node_modules/typebox/build/type/extends/extends_right.mjs
function ExtendsRightInfer(inferred, name, left, right) {
  return Match3(ExtendsLeft(inferred, left, right), (checkInferred) => ExtendsTrue(memory_exports.Assign(memory_exports.Assign(inferred, checkInferred), { [name]: left })), () => ExtendsFalse());
}
function ExtendsRightAny(inferred, _left) {
  return ExtendsTrue(inferred);
}
function ExtendsRightDependent(inferred, left, if_, then_, else_) {
  return Match3(ExtendsLeft(inferred, left, if_), (inferred2) => Match3(ExtendsLeft(inferred2, left, then_), (inferred3) => ExtendsTrue(inferred3), () => ExtendsFalse()), () => Match3(ExtendsLeft(inferred, left, else_), (inferred2) => ExtendsTrue(inferred2), () => ExtendsFalse()));
}
function ExtendsRightEnum(inferred, left, right) {
  const evaluated = EvaluateEnum(right);
  return ExtendsLeft(inferred, left, evaluated);
}
function ExtendsRightIntersect(inferred, left, right) {
  return guard_exports.ShiftLeft(right, (head, tail) => Match3(ExtendsLeft(inferred, left, head), (inferred2) => ExtendsRightIntersect(inferred2, left, tail), () => ExtendsFalse()), () => ExtendsTrue(inferred));
}
function ExtendsRightTemplateLiteral(inferred, left, right) {
  const evaluated = EvaluateTemplateLiteral(right);
  return ExtendsLeft(inferred, left, evaluated);
}
function ExtendsRightUnion(inferred, left, right) {
  return guard_exports.ShiftLeft(right, (head, tail) => Match3(ExtendsLeft(inferred, left, head), (inferred2) => ExtendsTrue(inferred2), () => ExtendsRightUnion(inferred, left, tail)), () => ExtendsFalse());
}
function ExtendsRight(inferred, left, right) {
  return IsAny(right) ? ExtendsRightAny(inferred, left) : IsDependent(right) ? ExtendsRightDependent(inferred, left, right.if, right.then, right.else) : IsEnum(right) ? ExtendsRightEnum(inferred, left, right.enum) : IsInfer(right) ? ExtendsRightInfer(inferred, right.name, left, right.extends) : IsIntersect(right) ? ExtendsRightIntersect(inferred, left, right.allOf) : IsTemplateLiteral(right) ? ExtendsRightTemplateLiteral(inferred, left, right.pattern) : IsUnion(right) ? ExtendsRightUnion(inferred, left, right.anyOf) : IsUnknown(right) ? ExtendsTrue(inferred) : ExtendsFalse();
}

// ../../node_modules/typebox/build/type/extends/any.mjs
function ExtendsAny(inferred, left, right) {
  return IsInfer(right) ? ExtendsRight(inferred, left, right) : IsAny(right) ? ExtendsTrue(inferred) : IsUnknown(right) ? ExtendsTrue(inferred) : ExtendsUnion(inferred);
}

// ../../node_modules/typebox/build/type/extends/array.mjs
function ExtendsImmutable(left, right) {
  const isImmutableLeft = IsImmutable(left);
  const isImmutableRight = IsImmutable(right);
  return isImmutableLeft && isImmutableRight ? true : !isImmutableLeft && isImmutableRight ? true : isImmutableLeft && !isImmutableRight ? false : true;
}
function ExtendsArray(inferred, arrayLeft, left, right) {
  return IsArray2(right) ? ExtendsImmutable(arrayLeft, right) ? ExtendsLeft(inferred, left, right.items) : ExtendsFalse() : ExtendsRight(inferred, arrayLeft, right);
}

// ../../node_modules/typebox/build/type/extends/bigint.mjs
function ExtendsBigInt(inferred, left, right) {
  return IsBigInt2(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
}

// ../../node_modules/typebox/build/type/extends/boolean.mjs
function ExtendsBoolean(inferred, left, right) {
  return IsBoolean3(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
}

// ../../node_modules/typebox/build/type/extends/parameters.mjs
function ParameterCompare(inferred, left, leftRest, right, rightRest) {
  const checkLeft = IsInfer(right) ? left : right;
  const checkRight = IsInfer(right) ? right : left;
  const isLeftOptional = IsOptional(left);
  const isRightOptional = IsOptional(right);
  return !isLeftOptional && isRightOptional ? ExtendsFalse() : Match3(ExtendsLeft(inferred, checkLeft, checkRight), (inferred2) => ExtendsParameters(inferred2, leftRest, rightRest), () => ExtendsFalse());
}
function ParameterRight(inferred, left, leftRest, rightRest) {
  return guard_exports.ShiftLeft(rightRest, (head, tail) => ParameterCompare(inferred, left, leftRest, head, tail), () => IsOptional(left) ? ExtendsTrue(inferred) : ExtendsFalse());
}
function ParametersLeft(inferred, left, rightRest) {
  return guard_exports.ShiftLeft(left, (head, tail) => ParameterRight(inferred, head, tail, rightRest), () => ExtendsTrue(inferred));
}
function ExtendsParameters(inferred, left, right) {
  return ParametersLeft(inferred, left, right);
}

// ../../node_modules/typebox/build/type/extends/return_type.mjs
function ExtendsReturnType(inferred, left, right) {
  return IsVoid(right) ? ExtendsTrue(inferred) : ExtendsLeft(inferred, left, right);
}

// ../../node_modules/typebox/build/type/extends/constructor.mjs
function ExtendsConstructor(inferred, parameters, returnType, right) {
  return IsAny(right) ? ExtendsTrue(inferred) : IsUnknown(right) ? ExtendsTrue(inferred) : IsConstructor2(right) ? Match3(ExtendsParameters(inferred, parameters, right["parameters"]), (inferred2) => ExtendsReturnType(inferred2, returnType, right["instanceType"]), () => ExtendsFalse()) : ExtendsFalse();
}

// ../../node_modules/typebox/build/type/extends/dependent.mjs
function ExtendsDependent(inferred, if_, then_, else_, right) {
  return Match3(ExtendsLeft(inferred, if_, right), () => ExtendsLeft(inferred, then_, right), () => ExtendsLeft(inferred, else_, right));
}

// ../../node_modules/typebox/build/type/extends/enum.mjs
function ExtendsEnum(inferred, left, right) {
  const evaluated = EvaluateEnum(left);
  return ExtendsLeft(inferred, evaluated, right);
}

// ../../node_modules/typebox/build/type/extends/function.mjs
function ExtendsFunction(inferred, parameters, returnType, right) {
  return IsAny(right) ? ExtendsTrue(inferred) : IsUnknown(right) ? ExtendsTrue(inferred) : IsFunction2(right) ? Match3(ExtendsParameters(inferred, parameters, right["parameters"]), (inferred2) => ExtendsReturnType(inferred2, returnType, right["returnType"]), () => ExtendsFalse()) : ExtendsFalse();
}

// ../../node_modules/typebox/build/type/extends/integer.mjs
function ExtendsInteger(inferred, left, right) {
  return IsInteger2(right) ? ExtendsTrue(inferred) : IsNumber3(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
}

// ../../node_modules/typebox/build/type/extends/intersect.mjs
function ExtendsIntersect(inferred, left, right) {
  const evaluated = EvaluateIntersect(left);
  return ExtendsLeft(inferred, evaluated, right);
}

// ../../node_modules/typebox/build/type/extends/literal.mjs
function ExtendsLiteralValue(inferred, left, right) {
  return left === right ? ExtendsTrue(inferred) : ExtendsFalse();
}
function ExtendsLiteralBigInt(inferred, left, right) {
  return IsLiteral(right) ? ExtendsLiteralValue(inferred, left, right.const) : IsBigInt2(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, Literal(left), right);
}
function ExtendsLiteralBoolean(inferred, left, right) {
  return IsLiteral(right) ? ExtendsLiteralValue(inferred, left, right.const) : IsBoolean3(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, Literal(left), right);
}
function ExtendsLiteralNumber(inferred, left, right) {
  return IsLiteral(right) ? ExtendsLiteralValue(inferred, left, right.const) : IsNumber3(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, Literal(left), right);
}
function ExtendsLiteralString(inferred, left, right) {
  return IsLiteral(right) ? ExtendsLiteralValue(inferred, left, right.const) : IsString3(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, Literal(left), right);
}
function ExtendsLiteral(inferred, left, right) {
  return guard_exports.IsBigInt(left.const) ? ExtendsLiteralBigInt(inferred, left.const, right) : guard_exports.IsBoolean(left.const) ? ExtendsLiteralBoolean(inferred, left.const, right) : guard_exports.IsNumber(left.const) ? ExtendsLiteralNumber(inferred, left.const, right) : guard_exports.IsString(left.const) ? ExtendsLiteralString(inferred, left.const, right) : Unreachable();
}

// ../../node_modules/typebox/build/type/extends/never.mjs
function ExtendsNever(inferred, left, right) {
  return IsInfer(right) ? ExtendsRight(inferred, left, right) : ExtendsTrue(inferred);
}

// ../../node_modules/typebox/build/type/extends/null.mjs
function ExtendsNull(inferred, left, right) {
  return IsNull2(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
}

// ../../node_modules/typebox/build/type/extends/number.mjs
function ExtendsNumber(inferred, left, right) {
  return IsNumber3(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
}

// ../../node_modules/typebox/build/type/extends/object.mjs
function ExtendsPropertyOptional(inferred, left, right) {
  return IsOptional(left) ? IsOptional(right) ? ExtendsTrue(inferred) : ExtendsFalse() : ExtendsTrue(inferred);
}
function ExtendsProperty(inferred, left, right) {
  return (
    // Right TInfer<TNever> is TExtendsFalse
    IsInfer(right) && IsNever(right.extends) ? ExtendsFalse() : Match3(ExtendsLeft(inferred, left, right), (inferred2) => ExtendsPropertyOptional(inferred2, left, right), () => ExtendsFalse())
  );
}
function ExtractInferredProperties(keys, properties) {
  return keys.reduce((result, key) => {
    return key in properties ? IsExtendsTrueLike(properties[key]) ? { ...result, ...properties[key].inferred } : Unreachable() : Unreachable();
  }, {});
}
function ExtendsPropertiesComparer(inferred, left, right) {
  const properties = {};
  for (const rightKey of guard_exports.Keys(right)) {
    properties[rightKey] = rightKey in left ? ExtendsProperty({}, left[rightKey], right[rightKey]) : IsOptional(right[rightKey]) ? IsInfer(right[rightKey]) ? ExtendsTrue(memory_exports.Assign(inferred, { [right[rightKey].name]: right[rightKey].extends })) : ExtendsTrue(inferred) : ExtendsFalse();
  }
  const checked = guard_exports.Values(properties).every((result) => IsExtendsTrueLike(result));
  const extracted = checked ? ExtractInferredProperties(guard_exports.Keys(properties), properties) : {};
  return checked ? ExtendsTrue(extracted) : ExtendsFalse();
}
function ExtendsProperties(inferred, left, right) {
  const compared = ExtendsPropertiesComparer(inferred, left, right);
  return IsExtendsTrueLike(compared) ? ExtendsTrue(memory_exports.Assign(inferred, compared.inferred)) : ExtendsFalse();
}
function ExtendsObjectToObject(inferred, left, right) {
  return ExtendsProperties(inferred, left, right);
}
function RecordMergeInferred(left, right) {
  return guard_exports.Keys(right).reduce((result, key) => {
    return {
      ...result,
      [key]: guard_exports.HasPropertyKey(left, key) ? IsUnion(result[key]) ? Union([...result[key].anyOf, right[key]]) : Union([left[key], right[key]]) : right[key]
    };
  }, left);
}
function ExtendsRecordComparer(properties, keys, type, result) {
  return guard_exports.ShiftLeft(keys, (left, right) => Match3(ExtendsLeft({}, properties[left], type), (inferred) => ExtendsRecordComparer(properties, right, type, RecordMergeInferred(result, inferred)), () => ExtendsFalse()), () => ExtendsTrue(result));
}
function ExtendsObjectToRecord(inferred, properties, _pattern, value) {
  const keys = guard_exports.Keys(properties);
  const result = ExtendsRecordComparer(properties, keys, value, inferred);
  return result;
}
function ExtendsObject(inferred, left, right) {
  return IsRecord(right) ? ExtendsObjectToRecord(inferred, left, RecordPattern(right), RecordValue(right)) : IsObject2(right) ? ExtendsObjectToObject(inferred, left, right.properties) : ExtendsRight(inferred, _Object_(left), right);
}

// ../../node_modules/typebox/build/type/extends/record.mjs
function FromObject2(inferred, properties) {
  return guard_exports.IsEqual(guard_exports.Keys(properties).length, 0) ? ExtendsTrue(inferred) : ExtendsFalse();
}
function FromRecord(inferred, _leftKey, leftValue, _rightKey, rightValue) {
  return ExtendsLeft(inferred, leftValue, rightValue);
}
function ExtendsRecord(inferred, leftPattern, leftValue, right) {
  return IsRecord(right) ? FromRecord(inferred, RecordPatternToType(leftPattern), leftValue, RecordPatternToType(RecordPattern(right)), RecordValue(right)) : IsObject2(right) ? FromObject2(inferred, right.properties) : IsAny(right) ? ExtendsTrue(inferred) : IsUnknown(right) ? ExtendsTrue(inferred) : ExtendsFalse();
}

// ../../node_modules/typebox/build/type/extends/string.mjs
function ExtendsString(inferred, left, right) {
  return IsString3(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
}

// ../../node_modules/typebox/build/type/extends/symbol.mjs
function ExtendsSymbol(inferred, left, right) {
  return IsSymbol2(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
}

// ../../node_modules/typebox/build/type/extends/template_literal.mjs
function ExtendsTemplateLiteral(inferred, left, right) {
  const evaluated = EvaluateTemplateLiteral(left);
  return ExtendsLeft(inferred, evaluated, right);
}

// ../../node_modules/typebox/build/type/extends/inference.mjs
function Inferrable(name, type) {
  return memory_exports.Create({ "~kind": "Inferrable" }, { name, type }, {});
}
function IsInferable(value) {
  return guard_exports.IsObject(value) && guard_exports.HasPropertyKey(value, "~kind") && guard_exports.HasPropertyKey(value, "name") && guard_exports.HasPropertyKey(value, "type") && guard_exports.IsEqual(value["~kind"], "Inferrable") && guard_exports.IsString(value.name) && guard_exports.IsObject(value.type);
}
function TryRestInferable(type) {
  return IsRest(type) ? IsInfer(type.items) ? IsArray2(type.items.extends) ? Inferrable(type.items.name, type.items.extends.items) : IsUnknown(type.items.extends) ? Inferrable(type.items.name, type.items.extends) : void 0 : Unreachable() : void 0;
}
function TryInferable(type) {
  return IsInfer(type) ? Inferrable(type.name, type.extends) : void 0;
}
function TryInferResults(rest, right, result = []) {
  return guard_exports.ShiftLeft(rest, (head, tail) => Match3(ExtendsLeft({}, head, right), () => TryInferResults(tail, right, [...result, head]), () => void 0), () => result);
}
function InferTupleResult(inferred, name, left, right) {
  const results = TryInferResults(left, right);
  return guard_exports.IsArray(results) ? ExtendsTrue(memory_exports.Assign(inferred, { [name]: Tuple(results) })) : ExtendsFalse();
}
function InferUnionResult(inferred, name, left, right) {
  const results = TryInferResults(left, right);
  return guard_exports.IsArray(results) ? ExtendsTrue(memory_exports.Assign(inferred, { [name]: Union(results) })) : ExtendsFalse();
}

// ../../node_modules/typebox/build/type/extends/tuple.mjs
function Reverse(types) {
  return [...types].reverse();
}
function ApplyReverse(types, reversed) {
  return reversed ? Reverse(types) : types;
}
function Reversed(types) {
  const first = types.length > 0 ? types[0] : void 0;
  const inferrable = IsSchema(first) ? TryRestInferable(first) : void 0;
  return IsSchema(inferrable);
}
function ElementsCompare(inferred, reversed, left, leftRest, right, rightRest) {
  return Match3(ExtendsLeft(inferred, left, right), (checkInferred) => Elements(checkInferred, reversed, leftRest, rightRest), () => ExtendsFalse());
}
function ElementsLeft(inferred, reversed, leftRest, right, rightRest) {
  const inferable = TryRestInferable(right);
  return (
    // Rest Inferrable Right Means we delegate to TInferTupleResult to Generate a Result
    IsInferable(inferable) ? InferTupleResult(inferred, inferable["name"], ApplyReverse(leftRest, reversed), inferable["type"]) : guard_exports.ShiftLeft(leftRest, (head, tail) => ElementsCompare(inferred, reversed, head, tail, right, rightRest), () => ExtendsFalse())
  );
}
function ElementsRight(inferred, reversed, leftRest, rightRest) {
  return guard_exports.ShiftLeft(rightRest, (head, tail) => ElementsLeft(inferred, reversed, leftRest, head, tail), () => guard_exports.IsEqual(leftRest.length, 0) ? ExtendsTrue(inferred) : ExtendsFalse());
}
function Elements(inferred, reversed, leftRest, rightRest) {
  return ElementsRight(inferred, reversed, leftRest, rightRest);
}
function ExtendsTupleToTuple(inferred, left, right) {
  const instantiatedRight = InstantiateElements(inferred, State([], []), right);
  const reversed = Reversed(instantiatedRight);
  return Elements(inferred, reversed, ApplyReverse(left, reversed), ApplyReverse(instantiatedRight, reversed));
}
function ExtendsTupleToArray(inferred, left, right) {
  const inferrable = TryInferable(right);
  return IsInferable(inferrable) ? InferUnionResult(inferred, inferrable["name"], left, inferrable["type"]) : guard_exports.ShiftLeft(left, (head, tail) => Match3(ExtendsLeft(inferred, head, right), (inferred2) => ExtendsTupleToArray(inferred2, tail, right), () => ExtendsFalse()), () => ExtendsTrue(inferred));
}
function ExtendsTuple(inferred, left, right) {
  const instantiatedLeft = InstantiateElements(inferred, State([], []), left);
  return IsTuple(right) ? ExtendsTupleToTuple(inferred, instantiatedLeft, right.items) : IsArray2(right) ? ExtendsTupleToArray(inferred, instantiatedLeft, right.items) : ExtendsRight(inferred, Tuple(instantiatedLeft), right);
}

// ../../node_modules/typebox/build/type/extends/undefined.mjs
function ExtendsUndefined(inferred, left, right) {
  return IsVoid(right) ? ExtendsTrue(inferred) : IsUndefined2(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
}

// ../../node_modules/typebox/build/type/extends/union.mjs
function ExtendsUnionSome(inferred, type, unionTypes) {
  return guard_exports.ShiftLeft(unionTypes, (head, tail) => Match3(ExtendsLeft(inferred, type, head), (inferred2) => ExtendsTrue(inferred2), () => ExtendsUnionSome(inferred, type, tail)), () => ExtendsFalse());
}
function ExtendsUnionLeft(inferred, left, right) {
  return guard_exports.ShiftLeft(left, (head, tail) => Match3(ExtendsUnionSome(inferred, head, right), (inferred2) => ExtendsUnionLeft(inferred2, tail, right), () => ExtendsFalse()), () => ExtendsTrue(inferred));
}
function ExtendsUnion2(inferred, left, right) {
  const inferrable = TryInferable(right);
  return IsInferable(inferrable) ? InferUnionResult(inferred, inferrable.name, left, inferrable.type) : IsUnion(right) ? ExtendsUnionLeft(inferred, left, right.anyOf) : ExtendsUnionLeft(inferred, left, [right]);
}

// ../../node_modules/typebox/build/type/extends/unknown.mjs
function ExtendsUnknown(inferred, left, right) {
  return IsInfer(right) ? ExtendsRight(inferred, left, right) : IsAny(right) ? ExtendsTrue(inferred) : IsUnknown(right) ? ExtendsTrue(inferred) : ExtendsFalse();
}

// ../../node_modules/typebox/build/type/extends/void.mjs
function ExtendsVoid(inferred, left, right) {
  return IsVoid(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
}

// ../../node_modules/typebox/build/type/extends/extends_left.mjs
function ExtendsLeft(inferred, left, right) {
  return IsAny(left) ? ExtendsAny(inferred, left, right) : IsArray2(left) ? ExtendsArray(inferred, left, left.items, right) : IsBigInt2(left) ? ExtendsBigInt(inferred, left, right) : IsBoolean3(left) ? ExtendsBoolean(inferred, left, right) : IsConstructor2(left) ? ExtendsConstructor(inferred, left.parameters, left.instanceType, right) : IsDependent(left) ? ExtendsDependent(inferred, left.if, left.then, left.else, right) : IsEnum(left) ? ExtendsEnum(inferred, left.enum, right) : IsFunction2(left) ? ExtendsFunction(inferred, left.parameters, left.returnType, right) : IsInteger2(left) ? ExtendsInteger(inferred, left, right) : IsIntersect(left) ? ExtendsIntersect(inferred, left.allOf, right) : IsLiteral(left) ? ExtendsLiteral(inferred, left, right) : IsNever(left) ? ExtendsNever(inferred, left, right) : IsNull2(left) ? ExtendsNull(inferred, left, right) : IsNumber3(left) ? ExtendsNumber(inferred, left, right) : IsObject2(left) ? ExtendsObject(inferred, left.properties, right) : IsRecord(left) ? ExtendsRecord(inferred, RecordPattern(left), RecordValue(left), right) : IsString3(left) ? ExtendsString(inferred, left, right) : IsSymbol2(left) ? ExtendsSymbol(inferred, left, right) : IsTemplateLiteral(left) ? ExtendsTemplateLiteral(inferred, left.pattern, right) : IsTuple(left) ? ExtendsTuple(inferred, left.items, right) : IsUndefined2(left) ? ExtendsUndefined(inferred, left, right) : IsUnion(left) ? ExtendsUnion2(inferred, left.anyOf, right) : IsUnknown(left) ? ExtendsUnknown(inferred, left, right) : IsVoid(left) ? ExtendsVoid(inferred, left, right) : ExtendsFalse();
}

// ../../node_modules/typebox/build/type/engine/interface/instantiate.mjs
function InterfaceOperation(heritage, properties) {
  const result = EvaluateIntersect([...heritage, _Object_(properties)]);
  return result;
}
function InterfaceAction(heritage, properties, options) {
  const result = CanInstantiate(heritage) ? memory_exports.Update(InterfaceOperation(heritage, properties), {}, options) : InterfaceDeferred(heritage, properties, options);
  return result;
}
function InterfaceInstantiate(context, state, heritage, properties, options) {
  const instantiatedHeritage = InstantiateTypes(context, state, heritage);
  const instantiatedProperties = InstantiateProperties(context, state, properties);
  return InterfaceAction(instantiatedHeritage, instantiatedProperties, options);
}

// ../../node_modules/typebox/build/type/action/interface.mjs
function InterfaceDeferred(heritage, properties, options = {}) {
  return Deferred("Interface", [heritage, properties], options);
}
function IsInterfaceDeferred(value) {
  return IsSchema(value) && guard_exports.HasPropertyKey(value, "action") && guard_exports.IsEqual(value.action, "Interface");
}
function Interface(heritage, properties, options = {}) {
  return InterfaceAction(heritage, properties, options);
}

// ../../node_modules/typebox/build/type/engine/cyclic/check.mjs
function FromRef(stack, context, ref) {
  return stack.includes(ref) ? true : FromType3([...stack, ref], context, context[ref]);
}
function FromProperties(stack, context, properties) {
  const types = PropertyValues(properties);
  return FromTypes2(stack, context, types);
}
function FromTypes2(stack, context, types) {
  return guard_exports.ShiftLeft(types, (left, right) => FromType3(stack, context, left) ? true : FromTypes2(stack, context, right), () => false);
}
function FromType3(stack, context, type) {
  return IsRef(type) ? FromRef(stack, context, type.$ref) : IsArray2(type) ? FromType3(stack, context, type.items) : IsConstructor2(type) ? FromTypes2(stack, context, [...type.parameters, type.instanceType]) : IsFunction2(type) ? FromTypes2(stack, context, [...type.parameters, type.returnType]) : IsInterfaceDeferred(type) ? FromProperties(stack, context, type.parameters[1]) : IsIntersect(type) ? FromTypes2(stack, context, type.allOf) : IsObject2(type) ? FromProperties(stack, context, type.properties) : IsUnion(type) ? FromTypes2(stack, context, type.anyOf) : IsTuple(type) ? FromTypes2(stack, context, type.items) : IsRecord(type) ? FromType3(stack, context, RecordValue(type)) : false;
}
function CyclicCheck(stack, context, type) {
  const result = FromType3(stack, context, type);
  return result;
}

// ../../node_modules/typebox/build/type/engine/cyclic/candidates.mjs
function ResolveCandidateKeys(context, keys) {
  return keys.reduce((result, left) => {
    return CyclicCheck([left], context, context[left]) ? [...result, left] : result;
  }, []);
}
function CyclicCandidates(context) {
  const keys = PropertyKeys(context);
  const result = ResolveCandidateKeys(context, keys);
  return result;
}

// ../../node_modules/typebox/build/type/engine/cyclic/dependencies.mjs
function FromRef2(context, ref, result) {
  return result.includes(ref) ? result : ref in context ? FromType4(context, context[ref], [...result, ref]) : Unreachable();
}
function FromProperties2(context, properties, result) {
  const types = PropertyValues(properties);
  return FromTypes3(context, types, result);
}
function FromTypes3(context, types, result) {
  return types.reduce((result2, left) => {
    return FromType4(context, left, result2);
  }, result);
}
function FromType4(context, type, result) {
  return IsRef(type) ? FromRef2(context, type.$ref, result) : IsArray2(type) ? FromType4(context, type.items, result) : IsConstructor2(type) ? FromTypes3(context, [...type.parameters, type.instanceType], result) : IsFunction2(type) ? FromTypes3(context, [...type.parameters, type.returnType], result) : IsInterfaceDeferred(type) ? FromProperties2(context, type.parameters[1], result) : IsIntersect(type) ? FromTypes3(context, type.allOf, result) : IsObject2(type) ? FromProperties2(context, type.properties, result) : IsUnion(type) ? FromTypes3(context, type.anyOf, result) : IsTuple(type) ? FromTypes3(context, type.items, result) : IsRecord(type) ? FromType4(context, RecordValue(type), result) : result;
}
function CyclicDependencies(context, key, type) {
  const result = FromType4(context, type, [key]);
  return result;
}

// ../../node_modules/typebox/build/type/engine/cyclic/extends.mjs
function FromRef3(_ref) {
  return Any();
}
function FromProperties3(properties) {
  return guard_exports.Keys(properties).reduce((result, key) => {
    return { ...result, [key]: FromType5(properties[key]) };
  }, {});
}
function FromTypes4(types) {
  return types.reduce((result, left) => {
    return [...result, FromType5(left)];
  }, []);
}
function FromType5(type) {
  return IsRef(type) ? FromRef3(type.$ref) : IsArray2(type) ? _Array_(FromType5(type.items), ArrayOptions(type)) : IsConstructor2(type) ? Constructor(FromTypes4(type.parameters), FromType5(type.instanceType)) : IsFunction2(type) ? _Function_(FromTypes4(type.parameters), FromType5(type.returnType)) : IsIntersect(type) ? Intersect(FromTypes4(type.allOf)) : IsObject2(type) ? _Object_(FromProperties3(type.properties)) : IsRecord(type) ? Record(RecordKey(type), FromType5(RecordValue(type))) : IsUnion(type) ? Union(FromTypes4(type.anyOf)) : IsTuple(type) ? Tuple(FromTypes4(type.items)) : type;
}
function CyclicAnyFromParameters(defs, ref) {
  return ref in defs ? FromType5(defs[ref]) : Unknown();
}
function CyclicExtends(type) {
  return CyclicAnyFromParameters(type.$defs, type.$ref);
}

// ../../node_modules/typebox/build/type/engine/cyclic/instantiate.mjs
function CyclicInterface(context, heritage, properties) {
  const instantiatedHeritage = InstantiateTypes(context, State([], []), heritage);
  const instantiatedProperties = InstantiateProperties({}, State([], []), properties);
  const evaluatedInterface = EvaluateIntersect([...instantiatedHeritage, _Object_(instantiatedProperties)]);
  return evaluatedInterface;
}
function CyclicDefinitions(context, dependencies) {
  const keys = guard_exports.Keys(context).filter((key) => dependencies.includes(key));
  return keys.reduce((result, key) => {
    const type = context[key];
    const instantiatedType = IsInterfaceDeferred(type) ? CyclicInterface(context, type.parameters[0], type.parameters[1]) : type;
    return { ...result, [key]: instantiatedType };
  }, {});
}
function InstantiateCyclic(context, ref, type) {
  const dependencies = CyclicDependencies(context, ref, type);
  const definitions = CyclicDefinitions(context, dependencies);
  const result = Cyclic(definitions, ref);
  return result;
}

// ../../node_modules/typebox/build/type/engine/cyclic/target.mjs
function Resolve(defs, ref) {
  return ref in defs ? IsRef(defs[ref]) ? Resolve(defs, defs[ref].$ref) : defs[ref] : Never();
}
function CyclicTarget(defs, ref) {
  const result = Resolve(defs, ref);
  return result;
}

// ../../node_modules/typebox/build/type/extends/extends.mjs
function Canonical(type) {
  return IsCyclic(type) ? CyclicExtends(type) : IsUnsafe(type) ? Unknown() : type;
}
function Extends(inferred, left, right) {
  const canonicalLeft = Canonical(left);
  const canonicalRight = Canonical(right);
  return ExtendsLeft(inferred, canonicalLeft, canonicalRight);
}

// ../../node_modules/typebox/build/type/engine/evaluate/compare.mjs
var ResultEqual = "equal";
var ResultDisjoint = "disjoint";
var ResultLeftInside = "left-inside";
var ResultRightInside = "right-inside";
function Compare(left, right) {
  const extendsCheck = [
    IsUnknown(left) ? result_exports.ExtendsFalse() : Extends({}, left, right),
    IsUnknown(left) ? result_exports.ExtendsTrue({}) : Extends({}, right, left)
  ];
  return result_exports.IsExtendsTrueLike(extendsCheck[0]) && result_exports.IsExtendsTrueLike(extendsCheck[1]) ? ResultEqual : result_exports.IsExtendsTrueLike(extendsCheck[0]) && result_exports.IsExtendsFalse(extendsCheck[1]) ? ResultLeftInside : result_exports.IsExtendsFalse(extendsCheck[0]) && result_exports.IsExtendsTrueLike(extendsCheck[1]) ? ResultRightInside : ResultDisjoint;
}

// ../../node_modules/typebox/build/type/engine/evaluate/broaden.mjs
function BroadFilter(type, types) {
  return types.filter((left) => {
    return Compare(type, left) === ResultRightInside ? false : true;
  });
}
function IsBroadestType(type, types) {
  const result = types.some((left) => {
    const result2 = Compare(type, left);
    return guard_exports.IsEqual(result2, ResultLeftInside) || guard_exports.IsEqual(result2, ResultEqual);
  });
  return guard_exports.IsEqual(result, false);
}
function BroadenType(type, types) {
  const evaluated = EvaluateType(type);
  return IsAny(evaluated) ? [evaluated] : IsBroadestType(evaluated, types) ? [...BroadFilter(evaluated, types), evaluated] : types;
}
function BroadenTypes(types) {
  return types.reduce((result, left) => {
    return IsObject2(left) ? [...result, left] : (
      // push
      IsNever(left) ? result : (
        // ignore
        BroadenType(left, result)
      )
    );
  }, []);
}
function Broaden(types) {
  const broadened = BroadenTypes(types);
  const flattened = Flatten(broadened);
  return flattened;
}

// ../../node_modules/typebox/build/type/engine/evaluate/instantiate.mjs
function EvaluateAction(type, options) {
  const result = memory_exports.Update(EvaluateType(type), {}, options);
  return result;
}
function EvaluateInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return EvaluateAction(instantiatedType, options);
}

// ../../node_modules/typebox/build/type/engine/call/distribute_arguments.mjs
function CollectDistributionNames(expression, result = []) {
  return (
    // Conditional
    IsDeferred(expression) && guard_exports.IsEqual(expression.action, "Conditional") ? IsRef(expression.parameters[0]) ? CollectDistributionNames(expression.parameters[2], CollectDistributionNames(expression.parameters[3], [...result, expression.parameters[0]["$ref"]])) : CollectDistributionNames(expression.parameters[2], CollectDistributionNames(expression.parameters[3], result)) : IsDeferred(expression) && guard_exports.IsEqual(expression.action, "Mapped") ? IsDeferred(expression.parameters[1]) && guard_exports.IsEqual(expression.parameters[1].action, "KeyOf") && IsRef(expression.parameters[1].parameters[0]) ? [...result, expression.parameters[1].parameters[0]["$ref"]] : result : result
  );
}
function BuildDistributionArray(parameters, names) {
  return parameters.reduce((result, left) => [...result, names.includes(left.name)], []);
}
function ZipDistributionArray(arguments_, distributionArray, result = []) {
  return guard_exports.ShiftLeft(arguments_, (argumentLeft, argumentRight) => guard_exports.ShiftLeft(distributionArray, (booleanLeft, booleanRight) => ZipDistributionArray(argumentRight, booleanRight, [...result, [booleanLeft, argumentLeft]]), () => result), () => result);
}
function Expand(type) {
  return IsUnion(type) ? [...type.anyOf] : [type];
}
function Append(current, type) {
  return current.reduce((result, left) => [...result, [...left, type]], []);
}
function Cross(current, variants) {
  return variants.reduce((result, left) => {
    return [...result, ...Append(current, left)];
  }, []);
}
function Distribute2(zipped) {
  return zipped.reduce((result, left) => {
    return guard_exports.IsEqual(left[0], true) ? Cross(result, Expand(left[1])) : Cross(result, [left[1]]);
  }, [[]]);
}
function DistributeArguments(parameters, arguments_, expression) {
  const distributionNames = CollectDistributionNames(expression);
  const distributionArray = BuildDistributionArray(parameters, distributionNames);
  const zippedArguments = ZipDistributionArray(arguments_, distributionArray);
  return IsDeferred(expression) && guard_exports.IsEqual(expression.action, "Conditional") ? Distribute2(zippedArguments) : IsDeferred(expression) && guard_exports.IsEqual(expression.action, "Mapped") ? Distribute2(zippedArguments) : [arguments_];
}

// ../../node_modules/typebox/build/type/engine/call/resolve_target.mjs
function FromNotResolvable() {
  return ["(not-resolvable)", Never()];
}
function FromNotGeneric() {
  return ["(not-generic)", Never()];
}
function FromGeneric(name, parameters, expression) {
  return [name, Generic(parameters, expression)];
}
function FromRef4(context, ref, arguments_) {
  return ref in context ? FromType6(context, ref, context[ref], arguments_) : FromNotResolvable();
}
function FromType6(context, name, target, arguments_) {
  return IsGeneric(target) ? FromGeneric(name, target.parameters, target.expression) : IsRef(target) ? FromRef4(context, target.$ref, arguments_) : FromNotGeneric();
}
function ResolveTarget(context, target, arguments_) {
  return FromType6(context, "(anonymous)", target, arguments_);
}

// ../../node_modules/typebox/build/type/engine/call/resolve_arguments.mjs
function AssertArgumentExtends(name, type, extends_) {
  if (IsInfer(type) || IsCall(type) || result_exports.IsExtendsTrueLike(Extends({}, type, extends_)))
    return;
  const cause = { parameter: name, expect: extends_, actual: type };
  throw new Error(`Argument for parameter ${name} does not satisfy constraint`, { cause });
}
function BindArgument(context, state, name, extends_, type) {
  const instantiatedArgument = InstantiateType(context, state, type);
  AssertArgumentExtends(name, instantiatedArgument, extends_);
  return memory_exports.Assign(context, { [name]: instantiatedArgument });
}
function BindArguments(context, state, parameterLeft, parameterRight, arguments_) {
  const instantiatedExtends = InstantiateType(context, state, parameterLeft.extends);
  const instantiatedEquals = InstantiateType(context, state, parameterLeft.equals);
  return guard_exports.ShiftLeft(arguments_, (left, right) => BindParameters(BindArgument(context, state, parameterLeft["name"], instantiatedExtends, left), state, parameterRight, right), () => BindParameters(BindArgument(context, state, parameterLeft["name"], instantiatedExtends, instantiatedEquals), state, parameterRight, []));
}
function BindParameters(context, state, parameters, arguments_) {
  return guard_exports.ShiftLeft(parameters, (left, right) => BindArguments(context, state, left, right, arguments_), () => context);
}
function ResolveArgumentsContext(context, state, parameters, arguments_) {
  return BindParameters(context, state, parameters, arguments_);
}

// ../../node_modules/typebox/build/type/engine/call/instantiate.mjs
function Peek(state) {
  const result = guard_exports.IsGreaterThan(state.callstack.length, 0) ? state.callstack[state.callstack.length - 1] : "";
  return result;
}
function IsTailCall(state, name) {
  const result = guard_exports.IsEqual(Peek(state), name);
  return result;
}
function CallDispatch(context, state, target, parameters, expression, arguments_) {
  const argumentsContext = ResolveArgumentsContext(context, state, parameters, arguments_);
  const returnType = InstantiateType(argumentsContext, State([...state["callstack"], target["$ref"]], state["visited"]), expression);
  return InstantiateType(argumentsContext, State([], []), returnType);
}
function CallDistributed(context, state, target, parameters, expression, distributedArguments) {
  return distributedArguments.reduce((result, arguments_) => [...result, CallDispatch(context, state, target, parameters, expression, arguments_)], []);
}
function CallImmediate(context, state, target, parameters, expression, arguments_) {
  const distributedArguments = DistributeArguments(parameters, arguments_, expression);
  const returnTypes = CallDistributed(context, state, target, parameters, expression, distributedArguments);
  const result = guard_exports.IsEqual(returnTypes.length, 1) ? returnTypes[0] : EvaluateUnion(returnTypes);
  return result;
}
function CallInstantiate(context, state, target, arguments_) {
  const instantiatedArguments = InstantiateTypes(context, state, arguments_);
  const resolved = ResolveTarget(context, target, arguments_);
  const name = resolved[0];
  const type = resolved[1];
  const result = IsGeneric(type) ? IsTailCall(state, name) ? CallConstruct(Ref(name), instantiatedArguments) : CallImmediate(context, state, Ref(name), type.parameters, type.expression, instantiatedArguments) : CallConstruct(target, instantiatedArguments);
  return result;
}

// ../../node_modules/typebox/build/type/types/call.mjs
function CallConstruct(target, arguments_) {
  return memory_exports.Create({ ["~kind"]: "Call" }, { type: "call", target, arguments: arguments_ }, {});
}
function Call(target, arguments_) {
  return CallInstantiate({}, State([], []), target, arguments_);
}
function IsCall(value) {
  return IsKind(value, "Call");
}

// ../../node_modules/typebox/build/type/engine/immutable/instantiate_remove.mjs
function RemoveImmutableOperation(type) {
  return memory_exports.Discard(type, ["~immutable"]);
}
function RemoveImmutableAction(type, options) {
  const result = memory_exports.Update(RemoveImmutableOperation(type), {}, options);
  return result;
}
function RemoveImmutableInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return RemoveImmutableAction(instantiatedType, options);
}

// ../../node_modules/typebox/build/type/engine/intrinsics/mapping.mjs
function ApplyMapping(mapping, value) {
  return mapping(value);
}

// ../../node_modules/typebox/build/type/engine/intrinsics/from_literal.mjs
function FromLiteral3(mapping, value) {
  return guard_exports.IsString(value) ? Literal(ApplyMapping(mapping, value)) : Literal(value);
}

// ../../node_modules/typebox/build/type/engine/intrinsics/from_template_literal.mjs
function FromTemplateLiteral(mapping, pattern) {
  const evaluated = EvaluateTemplateLiteral(pattern);
  const result = FromType7(mapping, evaluated);
  return result;
}

// ../../node_modules/typebox/build/type/engine/intrinsics/from_union.mjs
function FromUnion2(mapping, types) {
  const result = types.map((type) => FromType7(mapping, type));
  return Union(result);
}

// ../../node_modules/typebox/build/type/engine/intrinsics/from_type.mjs
function FromType7(mapping, type) {
  return IsLiteral(type) ? FromLiteral3(mapping, type.const) : IsTemplateLiteral(type) ? FromTemplateLiteral(mapping, type.pattern) : IsUnion(type) ? FromUnion2(mapping, type.anyOf) : type;
}

// ../../node_modules/typebox/build/type/action/capitalize.mjs
function CapitalizeDeferred(type, options = {}) {
  return Deferred("Capitalize", [type], options);
}
function Capitalize(type, options = {}) {
  return CapitalizeAction(type, options);
}

// ../../node_modules/typebox/build/type/action/lowercase.mjs
function LowercaseDeferred(type, options = {}) {
  return Deferred("Lowercase", [type], options);
}
function Lowercase(type, options = {}) {
  return LowercaseAction(type, options);
}

// ../../node_modules/typebox/build/type/action/uncapitalize.mjs
function UncapitalizeDeferred(type, options = {}) {
  return Deferred("Uncapitalize", [type], options);
}
function Uncapitalize(type, options = {}) {
  return UncapitalizeAction(type, options);
}

// ../../node_modules/typebox/build/type/action/uppercase.mjs
function UppercaseDeferred(type, options = {}) {
  return Deferred("Uppercase", [type], options);
}
function Uppercase(type, options = {}) {
  return UppercaseAction(type, options);
}

// ../../node_modules/typebox/build/type/engine/intrinsics/instantiate.mjs
var CapitalizeMapping = (input) => input[0].toUpperCase() + input.slice(1);
var LowercaseMapping = (input) => input.toLowerCase();
var UncapitalizeMapping = (input) => input[0].toLowerCase() + input.slice(1);
var UppercaseMapping = (input) => input.toUpperCase();
function CapitalizeAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(FromType7(CapitalizeMapping, type), {}, options) : CapitalizeDeferred(type, options);
  return result;
}
function LowercaseAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(FromType7(LowercaseMapping, type), {}, options) : LowercaseDeferred(type, options);
  return result;
}
function UncapitalizeAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(FromType7(UncapitalizeMapping, type), {}, options) : UncapitalizeDeferred(type, options);
  return result;
}
function UppercaseAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(FromType7(UppercaseMapping, type), {}, options) : UppercaseDeferred(type, options);
  return result;
}
function CapitalizeInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return CapitalizeAction(instantiatedType, options);
}
function LowercaseInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return LowercaseAction(instantiatedType, options);
}
function UncapitalizeInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return UncapitalizeAction(instantiatedType, options);
}
function UppercaseInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return UppercaseAction(instantiatedType, options);
}

// ../../node_modules/typebox/build/type/action/conditional.mjs
function ConditionalDeferred(left, right, true_, false_, options = {}) {
  return Deferred("Conditional", [left, right, true_, false_], options);
}
function Conditional(left, right, true_, false_, options = {}) {
  return ConditionalAction({}, State([], []), left, right, true_, false_, options);
}

// ../../node_modules/typebox/build/type/engine/conditional/instantiate.mjs
function ConditionalOperation(context, state, left, right, true_, false_) {
  const extendsResult = Extends(context, left, right);
  return result_exports.IsExtendsUnion(extendsResult) ? Union([InstantiateType(extendsResult.inferred, state, true_), InstantiateType(context, state, false_)]) : result_exports.IsExtendsTrue(extendsResult) ? InstantiateType(extendsResult.inferred, state, true_) : InstantiateType(context, state, false_);
}
function ConditionalAction(context, state, left, right, true_, false_, options) {
  const result = CanInstantiate([left, right]) ? memory_exports.Update(ConditionalOperation(context, state, left, right, true_, false_), {}, options) : ConditionalDeferred(left, right, true_, false_, options);
  return result;
}
function ConditionalInstantiate(context, state, left, right, true_, false_, options) {
  const instantiatedLeft = InstantiateType(context, state, left);
  const instantiatedRight = InstantiateType(context, state, right);
  return ConditionalAction(context, state, instantiatedLeft, instantiatedRight, true_, false_, options);
}

// ../../node_modules/typebox/build/type/action/constructor_parameters.mjs
function ConstructorParametersDeferred(type, options = {}) {
  return Deferred("ConstructorParameters", [type], options);
}
function ConstructorParameters(type, options = {}) {
  return ConstructorParametersAction(type, options);
}

// ../../node_modules/typebox/build/type/engine/constructor_parameters/instantiate.mjs
function ConstructorParametersOperation(type) {
  const parameters = IsConstructor2(type) ? type["parameters"] : [];
  const instantiatedParameters = InstantiateElements({}, State([], []), parameters);
  const result = Tuple(instantiatedParameters);
  return result;
}
function ConstructorParametersAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(ConstructorParametersOperation(type), {}, options) : ConstructorParametersDeferred(type, options);
  return result;
}
function ConstructorParametersInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return ConstructorParametersAction(instantiatedType, options);
}

// ../../node_modules/typebox/build/type/action/exclude.mjs
function ExcludeDeferred(left, right, options = {}) {
  return Deferred("Exclude", [left, right], options);
}
function Exclude(left, right, options = {}) {
  return ExcludeAction(left, right, options);
}

// ../../node_modules/typebox/build/type/engine/exclude/instantiate.mjs
function ExcludeAction(left, right, options) {
  const result = CanInstantiate([left, right]) ? memory_exports.Update(ExcludeOperation(left, right), {}, options) : ExcludeDeferred(left, right, options);
  return result;
}
function ExcludeInstantiate(context, state, left, right, options) {
  const instantiatedLeft = InstantiateType(context, state, left);
  const instantiatedRight = InstantiateType(context, state, right);
  return ExcludeAction(instantiatedLeft, instantiatedRight, options);
}

// ../../node_modules/typebox/build/type/action/extract.mjs
function ExtractDeferred(left, right, options = {}) {
  return Deferred("Extract", [left, right], options);
}
function Extract(left, right, options = {}) {
  return ExtractAction(left, right, options);
}

// ../../node_modules/typebox/build/type/engine/extract/operation.mjs
function ExtractType(left, right) {
  const check = Extends({}, left, right);
  const result = result_exports.IsExtendsTrueLike(check) ? [left] : [];
  return result;
}
function ExtractUnion(types, right) {
  return types.reduce((result, head) => {
    return [...result, ...ExtractType(head, right)];
  }, []);
}
function ExtractOperation(left, right) {
  const evaluated = EvaluateType(left);
  const canonical = IsUnion(evaluated) ? evaluated.anyOf : [evaluated];
  const remaining = ExtractUnion(canonical, right);
  const result = EvaluateUnion(remaining);
  return result;
}

// ../../node_modules/typebox/build/type/engine/extract/instantiate.mjs
function ExtractAction(left, right, options) {
  const result = CanInstantiate([left, right]) ? memory_exports.Update(ExtractOperation(left, right), {}, options) : ExtractDeferred(left, right, options);
  return result;
}
function ExtractInstantiate(context, state, left, right, options) {
  const instantiatedLeft = InstantiateType(context, state, left);
  const instantiatedRight = InstantiateType(context, state, right);
  return ExtractAction(instantiatedLeft, instantiatedRight, options);
}

// ../../node_modules/typebox/build/type/engine/helpers/keys_to_indexer.mjs
function KeysToLiterals(keys) {
  return keys.reduce((result, left) => {
    return IsLiteralValue(left) ? [...result, Literal(left)] : result;
  }, []);
}
function KeysToIndexer(keys) {
  const literals = KeysToLiterals(keys);
  const result = Union(literals);
  return result;
}

// ../../node_modules/typebox/build/type/action/indexed.mjs
function IndexDeferred(type, indexer, options = {}) {
  return Deferred("Index", [type, indexer], options);
}
function Index(type, indexer_or_keys, options = {}) {
  const indexer = guard_exports.IsArray(indexer_or_keys) ? KeysToIndexer(indexer_or_keys) : indexer_or_keys;
  return IndexAction(type, indexer, options);
}

// ../../node_modules/typebox/build/type/engine/object/from_cyclic.mjs
function FromCyclic(defs, ref) {
  const target = CyclicTarget(defs, ref);
  const result = FromType8(target);
  return result;
}

// ../../node_modules/typebox/build/type/engine/object/from_dependent.mjs
function FromDependent(if_, then_, else_) {
  const evaluated = EvaluateDependent(if_, then_, else_);
  const result = FromType8(evaluated);
  return result;
}

// ../../node_modules/typebox/build/type/engine/object/from_intersect.mjs
function CollapseIntersectProperties(left, right) {
  const leftKeys = guard_exports.Keys(left).filter((key) => !guard_exports.HasPropertyKey(right, key));
  const rightKeys = guard_exports.Keys(right).filter((key) => !guard_exports.HasPropertyKey(left, key));
  const sharedKeys = guard_exports.Keys(left).filter((key) => guard_exports.HasPropertyKey(right, key));
  const leftProperties = leftKeys.reduce((result, key) => ({ ...result, [key]: left[key] }), {});
  const rightProperties = rightKeys.reduce((result, key) => ({ ...result, [key]: right[key] }), {});
  const sharedProperties = sharedKeys.reduce((result, key) => ({ ...result, [key]: EvaluateIntersect([left[key], right[key]]) }), {});
  const unique = memory_exports.Assign(leftProperties, rightProperties);
  const shared = memory_exports.Assign(unique, sharedProperties);
  return shared;
}
function FromIntersect(types) {
  return types.reduce((result, left) => {
    return CollapseIntersectProperties(result, FromType8(left));
  }, {});
}

// ../../node_modules/typebox/build/type/engine/object/from_object.mjs
function FromObject3(properties) {
  return properties;
}

// ../../node_modules/typebox/build/type/engine/object/from_tuple.mjs
function FromTuple(types) {
  const object = TupleToObject(Tuple(types));
  const result = FromType8(object);
  return result;
}

// ../../node_modules/typebox/build/type/engine/object/from_union.mjs
function CollapseUnionProperties(left, right) {
  const sharedKeys = guard_exports.Keys(left).filter((key) => key in right);
  const result = sharedKeys.reduce((result2, key) => {
    return { ...result2, [key]: EvaluateUnion([left[key], right[key]]) };
  }, {});
  return result;
}
function ReduceVariants(types, result) {
  return guard_exports.ShiftLeft(types, (left, right) => ReduceVariants(right, CollapseUnionProperties(result, FromType8(left))), () => result);
}
function FromUnion3(types) {
  return guard_exports.ShiftLeft(types, (left, right) => ReduceVariants(right, FromType8(left)), () => Unreachable());
}

// ../../node_modules/typebox/build/type/engine/object/from_type.mjs
function FromType8(type) {
  return IsCyclic(type) ? FromCyclic(type.$defs, type.$ref) : IsDependent(type) ? FromDependent(type.if, type.then, type.else) : IsIntersect(type) ? FromIntersect(type.allOf) : IsUnion(type) ? FromUnion3(type.anyOf) : IsTuple(type) ? FromTuple(type.items) : IsObject2(type) ? FromObject3(type.properties) : {};
}

// ../../node_modules/typebox/build/type/engine/object/collapse.mjs
function CollapseToObject(type) {
  const properties = FromType8(type);
  const result = _Object_(properties);
  return result;
}

// ../../node_modules/typebox/build/type/engine/helpers/keys.mjs
var integerKeyPattern = new RegExp("^(?:0|[1-9][0-9]*)$");
function ConvertToIntegerKey(value) {
  const normal = `${value}`;
  return integerKeyPattern.test(normal) ? parseInt(normal) : value;
}

// ../../node_modules/typebox/build/type/engine/indexed/from_array.mjs
function NormalizeLiteral(value) {
  return Literal(ConvertToIntegerKey(value));
}
function NormalizeIndexerTypes(types) {
  return types.map((type) => NormalizeIndexer(type));
}
function NormalizeIndexer(type) {
  return IsIntersect(type) ? Intersect(NormalizeIndexerTypes(type.allOf)) : IsUnion(type) ? Union(NormalizeIndexerTypes(type.anyOf)) : IsLiteral(type) ? NormalizeLiteral(type.const) : type;
}
function FromArray2(type, indexer) {
  const normalizedIndexer = NormalizeIndexer(indexer);
  const check = Extends({}, normalizedIndexer, Number2());
  const result = (
    // indexer
    result_exports.IsExtendsTrueLike(check) ? type : IsLiteral(indexer) && guard_exports.IsEqual(indexer.const, "length") ? Number2() : Never()
  );
  return result;
}

// ../../node_modules/typebox/build/type/engine/indexable/from_cyclic.mjs
function FromCyclic2(defs, ref) {
  const target = CyclicTarget(defs, ref);
  const result = FromType9(target);
  return result;
}

// ../../node_modules/typebox/build/type/engine/indexable/from_dependent.mjs
function FromDependent2(if_, then_, else_) {
  const evaluated = EvaluateDependent(if_, then_, else_);
  const result = FromType9(evaluated);
  return result;
}

// ../../node_modules/typebox/build/type/engine/indexable/from_enum.mjs
function FromEnum(values) {
  const evaluated = EvaluateEnum(values);
  const result = FromType9(evaluated);
  return result;
}

// ../../node_modules/typebox/build/type/engine/indexable/from_intersect.mjs
function FromIntersect2(types) {
  const evaluated = EvaluateIntersect(types);
  const result = FromType9(evaluated);
  return result;
}

// ../../node_modules/typebox/build/type/engine/indexable/from_literal.mjs
function FromLiteral4(value) {
  const result = [`${value}`];
  return result;
}

// ../../node_modules/typebox/build/type/engine/indexable/from_template_literal.mjs
function FromTemplateLiteral2(pattern) {
  const evaluated = EvaluateTemplateLiteral(pattern);
  const result = FromType9(evaluated);
  return result;
}

// ../../node_modules/typebox/build/type/engine/indexable/from_union.mjs
function FromUnion4(types) {
  return types.reduce((result, left) => {
    return [...result, ...FromType9(left)];
  }, []);
}

// ../../node_modules/typebox/build/type/engine/indexable/from_type.mjs
function FromType9(type) {
  return IsCyclic(type) ? FromCyclic2(type.$defs, type.$ref) : IsDependent(type) ? FromDependent2(type.if, type.then, type.else) : IsEnum(type) ? FromEnum(type.enum) : IsIntersect(type) ? FromIntersect2(type.allOf) : IsLiteral(type) ? FromLiteral4(type.const) : IsTemplateLiteral(type) ? FromTemplateLiteral2(type.pattern) : IsUnion(type) ? FromUnion4(type.anyOf) : [];
}

// ../../node_modules/typebox/build/type/engine/indexable/to_indexable_keys.mjs
function ToIndexableKeys(type) {
  const result = FromType9(type);
  return result;
}

// ../../node_modules/typebox/build/type/engine/this/expand_this.mjs
function FromTypes5(properties, types) {
  return types.map((type) => FromType10(properties, type));
}
function FromType10(properties, type) {
  return IsArray2(type) ? _Array_(FromType10(properties, type.items)) : IsConstructor2(type) ? Constructor(FromTypes5(properties, type.parameters), FromType10(properties, type.instanceType)) : IsFunction2(type) ? _Function_(FromTypes5(properties, type.parameters), FromType10(properties, type.returnType)) : IsTuple(type) ? Tuple(FromTypes5(properties, type.items)) : IsUnion(type) ? Union(FromTypes5(properties, type.anyOf)) : IsIntersect(type) ? Intersect(FromTypes5(properties, type.allOf)) : IsThis(type) ? _Object_(properties) : type;
}
function ExpandThis(properties, type) {
  const result = FromType10(properties, type);
  return result;
}

// ../../node_modules/typebox/build/type/engine/indexed/from_object.mjs
function IndexProperty(properties, key) {
  const selectedType = key in properties ? properties[key] : Never();
  const result = ExpandThis(properties, selectedType);
  return result;
}
function IndexProperties(properties, keys) {
  return keys.reduce((result, left) => {
    return [...result, IndexProperty(properties, left)];
  }, []);
}
function FromIndexer(properties, indexer) {
  const keys = ToIndexableKeys(indexer);
  const variants = IndexProperties(properties, keys);
  const result = EvaluateUnion(variants);
  return result;
}
var NumericKeyPattern = new RegExp(IntegerKey);
function NumericKeys(keys) {
  const result = keys.filter((key) => NumericKeyPattern.test(key));
  return result;
}
function FromIndexerNumber(properties) {
  const keys = PropertyKeys(properties);
  const numericKeys = NumericKeys(keys);
  const variants = IndexProperties(properties, numericKeys);
  const result = EvaluateUnion(variants);
  return result;
}
function FromObject4(properties, indexer) {
  const result = IsNumber3(indexer) ? FromIndexerNumber(properties) : FromIndexer(properties, indexer);
  return result;
}

// ../../node_modules/typebox/build/type/engine/indexed/array_indexer.mjs
function ConvertLiteral(value) {
  return Literal(ConvertToIntegerKey(value));
}
function ArrayIndexerTypes(types) {
  return types.map((type) => FormatArrayIndexer(type));
}
function FormatArrayIndexer(type) {
  return IsIntersect(type) ? Intersect(ArrayIndexerTypes(type.allOf)) : IsUnion(type) ? Union(ArrayIndexerTypes(type.anyOf)) : IsLiteral(type) ? ConvertLiteral(type.const) : type;
}

// ../../node_modules/typebox/build/type/engine/indexed/from_tuple.mjs
function IndexElementsWithIndexer(types, indexer) {
  return types.reduceRight((result, right, index) => {
    const check = Extends({}, Literal(index), indexer);
    return result_exports.IsExtendsTrueLike(check) ? [right, ...result] : result;
  }, []);
}
function FromTupleWithIndexer(types, indexer) {
  const formattedArrayIndexer = FormatArrayIndexer(indexer);
  const elements = IndexElementsWithIndexer(types, formattedArrayIndexer);
  return EvaluateUnionFast(elements);
}
function FromTupleWithoutIndexer(types) {
  return EvaluateUnionFast(types);
}
function FromTuple2(types, indexer) {
  return (
    // length (intrinsic)
    IsLiteral(indexer) && guard_exports.IsEqual(indexer.const, "length") ? Literal(types.length) : IsNumber3(indexer) || IsInteger2(indexer) ? FromTupleWithoutIndexer(types) : FromTupleWithIndexer(types, indexer)
  );
}

// ../../node_modules/typebox/build/type/engine/indexed/from_type.mjs
function FromType11(type, indexer) {
  return IsArray2(type) ? FromArray2(type.items, indexer) : IsObject2(type) ? FromObject4(type.properties, indexer) : IsTuple(type) ? FromTuple2(type.items, indexer) : Never();
}

// ../../node_modules/typebox/build/type/engine/indexed/instantiate.mjs
function NormalizeType(type) {
  const result = IsCyclic(type) || IsDependent(type) || IsIntersect(type) || IsUnion(type) ? CollapseToObject(type) : type;
  return result;
}
function IndexAction(type, indexer, options) {
  const result = CanInstantiate([type, indexer]) ? memory_exports.Update(FromType11(NormalizeType(type), indexer), {}, options) : IndexDeferred(type, indexer, options);
  return result;
}
function IndexInstantiate(context, state, type, indexer, options) {
  const instantiatedType = InstantiateType(context, state, type);
  const instantiatedIndexer = InstantiateType(context, state, indexer);
  return IndexAction(instantiatedType, instantiatedIndexer, options);
}

// ../../node_modules/typebox/build/type/action/instance_type.mjs
function InstanceTypeDeferred(type, options = {}) {
  return Deferred("InstanceType", [type], options);
}
function InstanceType(type, options = {}) {
  return InstanceTypeAction(type, options);
}

// ../../node_modules/typebox/build/type/engine/instance_type/instantiate.mjs
function InstanceTypeOperation(type) {
  return IsConstructor2(type) ? type["instanceType"] : Never();
}
function InstanceTypeAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(InstanceTypeOperation(type), {}, options) : InstanceTypeDeferred(type, options);
  return result;
}
function InstanceTypeInstantiate(context, state, type, options = {}) {
  const instantiatedType = InstantiateType(context, state, type);
  return InstanceTypeAction(instantiatedType, options);
}

// ../../node_modules/typebox/build/type/action/keyof.mjs
function KeyOfDeferred(type, options = {}) {
  return Deferred("KeyOf", [type], options);
}
function KeyOf2(type, options = {}) {
  return KeyOfAction(type, options);
}

// ../../node_modules/typebox/build/type/engine/keyof/from_any.mjs
function FromAny() {
  return Union([Number2(), String2(), Symbol2()]);
}

// ../../node_modules/typebox/build/type/engine/keyof/from_array.mjs
function FromArray3(_type) {
  return Number2();
}

// ../../node_modules/typebox/build/type/engine/keyof/from_object.mjs
function FromPropertyKeys(keys) {
  const result = keys.reduce((result2, left) => {
    return IsLiteralValue(left) ? [...result2, Literal(ConvertToIntegerKey(left))] : Unreachable();
  }, []);
  return result;
}
function FromObject5(properties) {
  const propertyKeys = guard_exports.Keys(properties);
  const variants = FromPropertyKeys(propertyKeys);
  const result = EvaluateUnionFast(variants);
  return result;
}

// ../../node_modules/typebox/build/type/engine/keyof/from_record.mjs
function FromRecord2(type) {
  return RecordKey(type);
}

// ../../node_modules/typebox/build/type/engine/keyof/from_tuple.mjs
function FromTuple3(types) {
  const result = types.map((_, index) => Literal(index));
  return EvaluateUnionFast(result);
}

// ../../node_modules/typebox/build/type/engine/keyof/from_type.mjs
function FromType12(type) {
  return IsAny(type) ? FromAny() : IsArray2(type) ? FromArray3(type.items) : IsObject2(type) ? FromObject5(type.properties) : IsRecord(type) ? FromRecord2(type) : IsTuple(type) ? FromTuple3(type.items) : Never();
}

// ../../node_modules/typebox/build/type/engine/keyof/instantiate.mjs
function NormalizeType2(type) {
  const result = IsCyclic(type) || IsDependent(type) || IsIntersect(type) || IsUnion(type) ? CollapseToObject(type) : type;
  return result;
}
function KeyOfAction(type, options) {
  return CanInstantiate([type]) ? memory_exports.Update(FromType12(NormalizeType2(type)), {}, options) : KeyOfDeferred(type, options);
}
function KeyOfInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return KeyOfAction(instantiatedType, options);
}

// ../../node_modules/typebox/build/type/action/mapped.mjs
function MappedDeferred(identifier, type, as, property, options = {}) {
  return Deferred("Mapped", [identifier, type, as, property], options);
}
function Mapped(identifier, type, as, property, options = {}) {
  return MappedAction({}, State([], []), identifier, type, as, property, options);
}

// ../../node_modules/typebox/build/type/engine/mapped/mapped_variants.mjs
function FromTemplateLiteral3(pattern) {
  const evaluated = EvaluateTemplateLiteral(pattern);
  const result = FromType13(evaluated);
  return result;
}
function FromUnion5(types) {
  return types.reduce((result, left) => {
    return [...result, ...FromType13(left)];
  }, []);
}
function FromEnum2(values) {
  const evaluated = EvaluateEnum(values);
  const result = FromType13(evaluated);
  return result;
}
function FromLiteral5(value) {
  const result = guard_exports.IsNumber(value) ? [Literal(`${value}`)] : [Literal(value)];
  return result;
}
function FromType13(type) {
  const result = IsEnum(type) ? FromEnum2(type.enum) : IsLiteral(type) ? FromLiteral5(type.const) : IsTemplateLiteral(type) ? FromTemplateLiteral3(type.pattern) : IsUnion(type) ? FromUnion5(type.anyOf) : [type];
  return result;
}
function MappedVariants(type) {
  const result = FromType13(type);
  return result;
}

// ../../node_modules/typebox/build/type/engine/mapped/mapped_operation.mjs
function CanonicalAs(instantiatedAs) {
  const result = IsTemplateLiteral(instantiatedAs) ? EvaluateTemplateLiteral(instantiatedAs.pattern) : instantiatedAs;
  return result;
}
function MappedVariant(context, state, identifier, variant, as, property) {
  const variantContext = memory_exports.Assign(context, { [identifier["name"]]: variant });
  const instantiatedAs = InstantiateType(variantContext, state, as);
  const canonicalAs = CanonicalAs(instantiatedAs);
  const instantiatedProperty = InstantiateType(variantContext, state, property);
  return IsLiteralNumber(canonicalAs) || IsLiteralString(canonicalAs) ? { [canonicalAs.const]: instantiatedProperty } : {};
}
function MappedProperties(context, state, identifier, variants, as, property) {
  return variants.reduce((result, left) => {
    return [...result, MappedVariant(context, state, identifier, left, as, property)];
  }, []);
}
function MappedObjects(properties) {
  return properties.reduce((result, left) => {
    return [...result, _Object_(left)];
  }, []);
}
function MappedOperation(context, state, identifier, type, as, property) {
  const variants = MappedVariants(type);
  const mappedProperties = MappedProperties(context, state, identifier, variants, as, property);
  const mappedObjects = MappedObjects(mappedProperties);
  const result = EvaluateIntersect(mappedObjects);
  return result;
}

// ../../node_modules/typebox/build/type/engine/mapped/instantiate.mjs
function MappedAction(context, state, identifier, type, as, property, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(MappedOperation(context, state, identifier, type, as, property), {}, options) : MappedDeferred(identifier, type, as, property, options);
  return result;
}
function MappedInstantiate(context, state, identifier, type, as, property, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return MappedAction(context, state, identifier, instantiatedType, as, property, options);
}

// ../../node_modules/typebox/build/type/engine/module/instantiate.mjs
function InstantiateCyclics(context, declarations, cyclicKeys) {
  const declarationContext = memory_exports.Assign(context, declarations);
  const declarationKeys = guard_exports.Keys(declarations).filter((key) => cyclicKeys.includes(key));
  return declarationKeys.reduce((result, key) => {
    return { ...result, [key]: InstantiateCyclic(declarationContext, key, declarations[key]) };
  }, {});
}
function InstantiateNonCyclics(context, declarations, cyclicKeys) {
  const declarationContext = memory_exports.Assign(context, declarations);
  const declarationKeys = guard_exports.Keys(declarations).filter((key) => !cyclicKeys.includes(key));
  return declarationKeys.reduce((result, key) => {
    return { ...result, [key]: InstantiateType(declarationContext, State([], []), declarations[key]) };
  }, {});
}
function InstantiateModule(context, declarations, options) {
  const cyclicCandidates = CyclicCandidates(declarations);
  const instantiatedCyclics = InstantiateCyclics(context, declarations, cyclicCandidates);
  const instantiatedNonCyclics = InstantiateNonCyclics(context, declarations, cyclicCandidates);
  const instantiatedModule = { ...instantiatedCyclics, ...instantiatedNonCyclics };
  return memory_exports.Update(instantiatedModule, {}, options);
}
function ModuleInstantiate(context, _state, declarations, options) {
  const instantiatedModule = InstantiateModule(context, declarations, options);
  return instantiatedModule;
}

// ../../node_modules/typebox/build/type/action/non_nullable.mjs
function NonNullableDeferred(type, options = {}) {
  return Deferred("NonNullable", [type], options);
}
function NonNullable(type, options = {}) {
  return NonNullableAction(type, options);
}

// ../../node_modules/typebox/build/type/engine/non_nullable/instantiate.mjs
function NonNullableOperation(type) {
  const excluded = Union([Null(), Undefined()]);
  return ExcludeAction(type, excluded, {});
}
function NonNullableAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(NonNullableOperation(type), {}, options) : NonNullableDeferred(type, options);
  return result;
}
function NonNullableInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return NonNullableAction(instantiatedType, options);
}

// ../../node_modules/typebox/build/type/action/omit.mjs
function OmitDeferred(type, indexer, options = {}) {
  return Deferred("Omit", [type, indexer], options);
}
function Omit(type, indexer_or_keys, options = {}) {
  const indexer = guard_exports.IsArray(indexer_or_keys) ? KeysToIndexer(indexer_or_keys) : indexer_or_keys;
  return OmitAction(type, indexer, options);
}

// ../../node_modules/typebox/build/type/engine/indexable/to_indexable.mjs
function ToIndexable(type) {
  const collapsed = CollapseToObject(type);
  const result = IsObject2(collapsed) ? collapsed.properties : Unreachable();
  return result;
}

// ../../node_modules/typebox/build/type/engine/omit/from_type.mjs
function FromKeys(properties, keys) {
  const result = guard_exports.Keys(properties).reduce((result2, key) => {
    return keys.includes(key) ? result2 : { ...result2, [key]: properties[key] };
  }, {});
  return result;
}
function FromType14(type, indexer) {
  const indexable = ToIndexable(type);
  const indexableKeys = ToIndexableKeys(indexer);
  const omitted = FromKeys(indexable, indexableKeys);
  const result = _Object_(omitted);
  return result;
}

// ../../node_modules/typebox/build/type/engine/omit/instantiate.mjs
function OmitAction(type, indexer, options) {
  const result = CanInstantiate([type, indexer]) ? memory_exports.Update(FromType14(type, indexer), {}, options) : OmitDeferred(type, indexer, options);
  return result;
}
function OmitInstantiate(context, state, type, indexer, options) {
  const instantiatedType = InstantiateType(context, state, type);
  const instantiatedIndexer = InstantiateType(context, state, indexer);
  return OmitAction(instantiatedType, instantiatedIndexer, options);
}

// ../../node_modules/typebox/build/type/action/parameters.mjs
function ParametersDeferred(type, options = {}) {
  return Deferred("Parameters", [type], options);
}
function Parameters(type, options = {}) {
  return ParametersAction(type, options);
}

// ../../node_modules/typebox/build/type/engine/parameters/instantiate.mjs
function ParametersOperation(type) {
  const parameters = IsFunction2(type) ? type["parameters"] : [];
  const instantiatedParameters = InstantiateElements({}, State([], []), parameters);
  const result = Tuple(instantiatedParameters);
  return result;
}
function ParametersAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(ParametersOperation(type), {}, options) : ParametersDeferred(type, options);
  return result;
}
function ParametersInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return ParametersAction(instantiatedType, options);
}

// ../../node_modules/typebox/build/type/action/partial.mjs
function PartialDeferred(type, options = {}) {
  return Deferred("Partial", [type], options);
}
function Partial(type, options = {}) {
  return PartialAction(type, options);
}

// ../../node_modules/typebox/build/type/engine/partial/from_cyclic.mjs
function FromCyclic3(defs, ref) {
  const target = CyclicTarget(defs, ref);
  const partial = FromType15(target);
  const result = Cyclic(memory_exports.Assign(defs, { [ref]: partial }), ref);
  return result;
}

// ../../node_modules/typebox/build/type/engine/partial/from_dependent.mjs
function FromDependent3(if_, then_, else_) {
  const evaluated = EvaluateDependent(if_, then_, else_);
  const result = FromType15(evaluated);
  return result;
}

// ../../node_modules/typebox/build/type/engine/partial/from_intersect.mjs
function FromIntersect3(types) {
  const evaluated = EvaluateIntersect(types);
  const result = FromType15(evaluated);
  return result;
}

// ../../node_modules/typebox/build/type/engine/partial/from_union.mjs
function FromUnion6(types) {
  const result = types.map((type) => FromType15(type));
  return Union(result);
}

// ../../node_modules/typebox/build/type/engine/partial/from_object.mjs
function FromObject6(properties) {
  const mapped = guard_exports.Keys(properties).reduce((result2, left) => {
    return { ...result2, [left]: AddOptional(properties[left]) };
  }, {});
  const result = _Object_(mapped);
  return result;
}

// ../../node_modules/typebox/build/type/engine/partial/from_type.mjs
function FromType15(type) {
  return IsCyclic(type) ? FromCyclic3(type.$defs, type.$ref) : IsDependent(type) ? FromDependent3(type.if, type.then, type.else) : IsIntersect(type) ? FromIntersect3(type.allOf) : IsUnion(type) ? FromUnion6(type.anyOf) : IsObject2(type) ? FromObject6(type.properties) : _Object_({});
}

// ../../node_modules/typebox/build/type/engine/partial/instantiate.mjs
function PartialAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(FromType15(type), {}, options) : PartialDeferred(type, options);
  return result;
}
function PartialInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return PartialAction(instantiatedType, options);
}

// ../../node_modules/typebox/build/type/action/pick.mjs
function PickDeferred(type, indexer, options = {}) {
  return Deferred("Pick", [type, indexer], options);
}
function Pick(type, indexer_or_keys, options = {}) {
  const indexer = guard_exports.IsArray(indexer_or_keys) ? KeysToIndexer(indexer_or_keys) : indexer_or_keys;
  return PickAction(type, indexer, options);
}

// ../../node_modules/typebox/build/type/engine/pick/from_type.mjs
function FromKeys2(properties, keys) {
  const result = guard_exports.Keys(properties).reduce((result2, key) => {
    return keys.includes(key) ? memory_exports.Assign(result2, { [key]: properties[key] }) : result2;
  }, {});
  return result;
}
function FromType16(type, indexer) {
  const indexable = ToIndexable(type);
  const keys = ToIndexableKeys(indexer);
  const applied = FromKeys2(indexable, keys);
  const result = _Object_(applied);
  return result;
}

// ../../node_modules/typebox/build/type/engine/pick/instantiate.mjs
function PickAction(type, indexer, options) {
  const result = CanInstantiate([type, indexer]) ? memory_exports.Update(FromType16(type, indexer), {}, options) : PickDeferred(type, indexer, options);
  return result;
}
function PickInstantiate(context, state, type, indexer, options) {
  const instantiatedType = InstantiateType(context, state, type);
  const instantiatedIndexer = InstantiateType(context, state, indexer);
  return PickAction(instantiatedType, instantiatedIndexer, options);
}

// ../../node_modules/typebox/build/type/action/readonly_object.mjs
function ReadonlyObjectDeferred(type, options = {}) {
  return Deferred("ReadonlyObject", [type], options);
}
function ReadonlyObject(type, options = {}) {
  return ReadonlyObjectAction(type, options);
}
var ReadonlyType = ReadonlyObject;

// ../../node_modules/typebox/build/type/engine/readonly_object/from_array.mjs
function FromArray4(type) {
  const result = AddImmutable(_Array_(type));
  return result;
}

// ../../node_modules/typebox/build/type/engine/readonly_object/from_cyclic.mjs
function FromCyclic4(defs, ref) {
  const target = CyclicTarget(defs, ref);
  const partial = FromType17(target);
  const result = Cyclic(memory_exports.Assign(defs, { [ref]: partial }), ref);
  return result;
}

// ../../node_modules/typebox/build/type/engine/readonly_object/from_dependent.mjs
function FromDependent4(if_, then_, else_) {
  const evaluated = EvaluateDependent(if_, then_, else_);
  const result = FromType17(evaluated);
  return result;
}

// ../../node_modules/typebox/build/type/engine/readonly_object/from_intersect.mjs
function FromIntersect4(types) {
  const evaluated = EvaluateIntersect(types);
  const result = FromType17(evaluated);
  return result;
}

// ../../node_modules/typebox/build/type/engine/readonly_object/from_object.mjs
function FromObject7(properties) {
  const mapped = guard_exports.Keys(properties).reduce((result2, left) => {
    return { ...result2, [left]: AddReadonly(properties[left]) };
  }, {});
  const result = _Object_(mapped);
  return result;
}

// ../../node_modules/typebox/build/type/engine/readonly_object/from_tuple.mjs
function FromTuple4(types) {
  const result = AddImmutable(Tuple(types));
  return result;
}

// ../../node_modules/typebox/build/type/engine/readonly_object/from_union.mjs
function FromUnion7(types) {
  const result = types.map((type) => FromType17(type));
  return Union(result);
}

// ../../node_modules/typebox/build/type/engine/readonly_object/from_type.mjs
function FromType17(type) {
  return IsArray2(type) ? FromArray4(type.items) : IsCyclic(type) ? FromCyclic4(type.$defs, type.$ref) : IsDependent(type) ? FromDependent4(type.if, type.then, type.else) : IsIntersect(type) ? FromIntersect4(type.allOf) : IsObject2(type) ? FromObject7(type.properties) : IsTuple(type) ? FromTuple4(type.items) : IsUnion(type) ? FromUnion7(type.anyOf) : type;
}

// ../../node_modules/typebox/build/type/engine/readonly_object/instantiate.mjs
function ReadonlyObjectAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(FromType17(type), {}, options) : ReadonlyObjectDeferred(type);
  return result;
}
function ReadonlyObjectInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return ReadonlyObjectAction(instantiatedType, options);
}

// ../../node_modules/typebox/build/type/engine/ref/instantiate.mjs
function RefInstantiate(context, state, type, ref) {
  return state.visited.includes(ref) ? type : ref in context ? InstantiateType(context, State(state["callstack"], [...state["visited"], ref]), context[ref]) : type;
}

// ../../node_modules/typebox/build/type/engine/required/from_cyclic.mjs
function FromCyclic5(defs, ref) {
  const target = CyclicTarget(defs, ref);
  const partial = FromType18(target);
  const result = Cyclic(memory_exports.Assign(defs, { [ref]: partial }), ref);
  return result;
}

// ../../node_modules/typebox/build/type/engine/required/from_dependent.mjs
function FromDependent5(if_, then_, else_) {
  const evaluated = EvaluateDependent(if_, then_, else_);
  const result = FromType18(evaluated);
  return result;
}

// ../../node_modules/typebox/build/type/engine/required/from_intersect.mjs
function FromIntersect5(types) {
  const evaluated = EvaluateIntersect(types);
  const result = FromType18(evaluated);
  return result;
}

// ../../node_modules/typebox/build/type/engine/required/from_union.mjs
function FromUnion8(types) {
  const result = types.map((type) => FromType18(type));
  return Union(result);
}

// ../../node_modules/typebox/build/type/engine/required/from_object.mjs
function FromObject8(properties) {
  const mapped = guard_exports.Keys(properties).reduce((result2, left) => {
    return { ...result2, [left]: RemoveOptional(properties[left]) };
  }, {});
  const result = _Object_(mapped);
  return result;
}

// ../../node_modules/typebox/build/type/engine/required/from_type.mjs
function FromType18(type) {
  return IsCyclic(type) ? FromCyclic5(type.$defs, type.$ref) : IsDependent(type) ? FromDependent5(type.if, type.then, type.else) : IsIntersect(type) ? FromIntersect5(type.allOf) : IsUnion(type) ? FromUnion8(type.anyOf) : IsObject2(type) ? FromObject8(type.properties) : _Object_({});
}

// ../../node_modules/typebox/build/type/action/required.mjs
function RequiredDeferred(type, options = {}) {
  return Deferred("Required", [type], options);
}
function Required(type, options = {}) {
  return RequiredAction(type, options);
}

// ../../node_modules/typebox/build/type/engine/required/instantiate.mjs
function RequiredAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(FromType18(type), {}, options) : RequiredDeferred(type, options);
  return result;
}
function RequiredInstantiate(context, state, type, options) {
  const instaniatedType = InstantiateType(context, state, type);
  return RequiredAction(instaniatedType, options);
}

// ../../node_modules/typebox/build/type/action/return_type.mjs
function ReturnTypeDeferred(type, options = {}) {
  return Deferred("ReturnType", [type], options);
}
function ReturnType(type, options = {}) {
  return ReturnTypeAction(type, options);
}

// ../../node_modules/typebox/build/type/engine/return_type/instantiate.mjs
function ReturnTypeOperation(type) {
  return IsFunction2(type) ? type["returnType"] : Never();
}
function ReturnTypeAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(ReturnTypeOperation(type), {}, options) : ReturnTypeDeferred(type, options);
  return result;
}
function ReturnTypeInstantiate(context, state, type, options = {}) {
  const instantiatedType = InstantiateType(context, state, type);
  return ReturnTypeAction(instantiatedType, options);
}

// ../../node_modules/typebox/build/type/action/with.mjs
function WithDeferred(type, options) {
  return Deferred("With", [type, options], {});
}
function With2(type, options) {
  return WithAction(type, options);
}

// ../../node_modules/typebox/build/type/engine/with/instantiate.mjs
function WithAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(type, {}, options) : WithDeferred(type, options);
  return result;
}
function WithInstantiate(context, state, type, options) {
  const instaniatedType = InstantiateType(context, state, type);
  return WithAction(instaniatedType, options);
}

// ../../node_modules/typebox/build/type/engine/rest/spread.mjs
function SpreadElement(type) {
  const result = IsRest(type) ? IsTuple(type.items) ? RestSpread(type.items.items) : IsInfer(type.items) ? [type] : IsRef(type.items) ? [type] : [Never()] : [type];
  return result;
}
function RestSpread(types) {
  const result = types.reduce((result2, left) => {
    return [...result2, ...SpreadElement(left)];
  }, []);
  return result;
}

// ../../node_modules/typebox/build/type/engine/instantiate.mjs
function State(callstack, visited) {
  return { callstack, visited };
}
function CanInstantiate(types) {
  return guard_exports.ShiftLeft(types, (left, right) => IsRef(left) ? false : CanInstantiate(right), () => true);
}
function InstantiateProperties(context, state, properties) {
  return guard_exports.Keys(properties).reduce((result, key) => {
    return { ...result, [key]: InstantiateType(context, state, properties[key]) };
  }, {});
}
function InstantiateElements(context, state, types) {
  const elements = InstantiateTypes(context, state, types);
  const result = RestSpread(elements);
  return result;
}
function InstantiateTypes(context, state, types) {
  return types.map((type) => InstantiateType(context, state, type));
}
function WithModifiers(type, instantiatedType) {
  const withOptional = IsOptional(type) ? AddOptionalAction(instantiatedType, {}) : instantiatedType;
  const withReadonly = IsReadonly(type) ? AddReadonlyAction(withOptional, {}) : withOptional;
  const withImmutable = IsImmutable(type) ? AddImmutableAction(withReadonly, {}) : withReadonly;
  return withImmutable;
}
function InstantiateDeferred(context, state, action, parameters, options) {
  return (
    // Modifiers
    guard_exports.IsEqual(action, "AddImmutable") ? AddImmutableInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "RemoveImmutable") ? RemoveImmutableInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "AddReadonly") ? AddReadonlyInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "RemoveReadonly") ? RemoveReadonlyInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "AddOptional") ? AddOptionalInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "RemoveOptional") ? RemoveOptionalInstantiate(context, state, parameters[0], options) : (
      // Actions
      guard_exports.IsEqual(action, "Capitalize") ? CapitalizeInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Conditional") ? ConditionalInstantiate(context, state, parameters[0], parameters[1], parameters[2], parameters[3], options) : guard_exports.IsEqual(action, "ConstructorParameters") ? ConstructorParametersInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Evaluate") ? EvaluateInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Exclude") ? ExcludeInstantiate(context, state, parameters[0], parameters[1], options) : guard_exports.IsEqual(action, "Extract") ? ExtractInstantiate(context, state, parameters[0], parameters[1], options) : guard_exports.IsEqual(action, "Index") ? IndexInstantiate(context, state, parameters[0], parameters[1], options) : guard_exports.IsEqual(action, "InstanceType") ? InstanceTypeInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Interface") ? InterfaceInstantiate(context, state, parameters[0], parameters[1], options) : guard_exports.IsEqual(action, "KeyOf") ? KeyOfInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Lowercase") ? LowercaseInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Mapped") ? MappedInstantiate(context, state, parameters[0], parameters[1], parameters[2], parameters[3], options) : guard_exports.IsEqual(action, "Module") ? ModuleInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "NonNullable") ? NonNullableInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Pick") ? PickInstantiate(context, state, parameters[0], parameters[1], options) : guard_exports.IsEqual(action, "Parameters") ? ParametersInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Partial") ? PartialInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Omit") ? OmitInstantiate(context, state, parameters[0], parameters[1], options) : guard_exports.IsEqual(action, "ReadonlyObject") ? ReadonlyObjectInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Record") ? RecordInstantiate(context, state, parameters[0], parameters[1], options) : guard_exports.IsEqual(action, "Required") ? RequiredInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "ReturnType") ? ReturnTypeInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "TemplateLiteral") ? TemplateLiteralInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Uncapitalize") ? UncapitalizeInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Uppercase") ? UppercaseInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "With") ? WithInstantiate(context, state, parameters[0], parameters[1]) : Deferred(action, parameters, options)
    )
  );
}
function InstantiateImmediate(context, state, type) {
  const instantiatedType = IsRef(type) ? RefInstantiate(context, state, type, type.$ref) : IsArray2(type) ? _Array_(InstantiateType(context, state, type.items), ArrayOptions(type)) : IsCall(type) ? CallInstantiate(context, state, type.target, type.arguments) : IsConstructor2(type) ? Constructor(InstantiateTypes(context, state, type.parameters), InstantiateType(context, state, type.instanceType), ConstructorOptions(type)) : IsFunction2(type) ? _Function_(InstantiateTypes(context, state, type.parameters), InstantiateType(context, state, type.returnType), FunctionOptions(type)) : IsDependent(type) ? Dependent(InstantiateType(context, state, type.if), InstantiateType(context, state, type.then), InstantiateType(context, state, type.else), DependentOptions(type)) : IsIntersect(type) ? Intersect(InstantiateTypes(context, state, type.allOf), IntersectOptions(type)) : IsObject2(type) ? _Object_(InstantiateProperties(context, state, type.properties), ObjectOptions(type)) : IsRecord(type) ? RecordFromPattern(RecordPattern(type), InstantiateType(context, state, RecordValue(type))) : IsRest(type) ? Rest(InstantiateType(context, state, type.items)) : IsTuple(type) ? Tuple(InstantiateElements(context, state, type.items), TupleOptions(type)) : IsUnion(type) ? Union(InstantiateTypes(context, state, type.anyOf), UnionOptions(type)) : type;
  const withModifiers = WithModifiers(type, instantiatedType);
  return withModifiers;
}
function InstantiateType(context, state, type) {
  const result = IsDeferred(type) ? InstantiateDeferred(context, state, type.action, type.parameters, type.options) : InstantiateImmediate(context, state, type);
  return result;
}
function Instantiate(context, type) {
  return InstantiateType(context, State([], []), type);
}

// ../../node_modules/typebox/build/type/engine/immutable/instantiate_add.mjs
function AddImmutableOperation(type) {
  return memory_exports.Update(type, { "~immutable": true }, {});
}
function AddImmutableAction(type, options) {
  const result = memory_exports.Update(AddImmutableOperation(type), {}, options);
  return result;
}
function AddImmutableInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return AddImmutableAction(instantiatedType, options);
}

// ../../node_modules/typebox/build/type/action/_add_immutable.mjs
function AddImmutableDeferred(type, options = {}) {
  return Deferred("AddImmutable", [type], options);
}
function AddImmutable(type, options = {}) {
  return AddImmutableAction(type, options);
}

// ../../node_modules/typebox/build/type/action/evaluate.mjs
function EvaluateDeferred(type, options = {}) {
  return Deferred("Evaluate", [type], options);
}
function Evaluate(type, options = {}) {
  return EvaluateAction(type, options);
}

// ../../node_modules/typebox/build/type/action/module.mjs
function ModuleDeferred(declarations, options = {}) {
  return Deferred("Module", [declarations], options);
}
function Module2(declarations, options = {}) {
  return ModuleInstantiate({}, State([], []), declarations, options);
}

// ../../node_modules/typebox/build/type/script/script.mjs
function Script2(...args) {
  const [context, input, options] = arguments_exports.Match(args, {
    2: (script, options2) => guard_exports.IsString(script) ? [{}, script, options2] : [script, options2, {}],
    3: (context2, script, options2) => [context2, script, options2],
    1: (script) => [{}, script, {}]
  });
  const result = Script(input);
  const parsed = guard_exports.IsArray(result) && guard_exports.IsEqual(result.length, 2) ? InstantiateType(context, State([], []), result[0]) : Never();
  return memory_exports.Update(parsed, {}, options);
}

// ../../node_modules/typebox/build/typebox.mjs
var typebox_exports = {};
__export(typebox_exports, {
  Any: () => Any,
  Array: () => _Array_,
  BigInt: () => BigInt2,
  Boolean: () => Boolean2,
  Call: () => Call,
  Capitalize: () => Capitalize,
  Codec: () => Codec,
  Conditional: () => Conditional,
  Constructor: () => Constructor,
  ConstructorParameters: () => ConstructorParameters,
  Cyclic: () => Cyclic,
  Decode: () => Decode,
  DecodeBuilder: () => DecodeBuilder,
  Dependent: () => Dependent,
  Encode: () => Encode,
  EncodeBuilder: () => EncodeBuilder,
  Enum: () => Enum,
  Evaluate: () => Evaluate,
  Exclude: () => Exclude,
  Extends: () => Extends,
  ExtendsResult: () => result_exports,
  Extract: () => Extract,
  Function: () => _Function_,
  Generic: () => Generic,
  Identifier: () => Identifier,
  Immutable: () => Immutable,
  Index: () => Index,
  Infer: () => Infer,
  InstanceType: () => InstanceType,
  Instantiate: () => Instantiate,
  Integer: () => Integer,
  Interface: () => Interface,
  Intersect: () => Intersect,
  IsAny: () => IsAny,
  IsArray: () => IsArray2,
  IsBigInt: () => IsBigInt2,
  IsBoolean: () => IsBoolean3,
  IsCall: () => IsCall,
  IsCodec: () => IsCodec,
  IsConstructor: () => IsConstructor2,
  IsCyclic: () => IsCyclic,
  IsDependent: () => IsDependent,
  IsEnum: () => IsEnum,
  IsEnumValue: () => IsEnumValue,
  IsFunction: () => IsFunction2,
  IsGeneric: () => IsGeneric,
  IsIdentifier: () => IsIdentifier,
  IsImmutable: () => IsImmutable,
  IsInfer: () => IsInfer,
  IsInteger: () => IsInteger2,
  IsIntersect: () => IsIntersect,
  IsKind: () => IsKind,
  IsLiteral: () => IsLiteral,
  IsNever: () => IsNever,
  IsNull: () => IsNull2,
  IsNumber: () => IsNumber3,
  IsObject: () => IsObject2,
  IsOptional: () => IsOptional,
  IsParameter: () => IsParameter,
  IsReadonly: () => IsReadonly,
  IsRecord: () => IsRecord,
  IsRef: () => IsRef,
  IsRefine: () => IsRefine,
  IsRest: () => IsRest,
  IsSchema: () => IsSchema,
  IsString: () => IsString3,
  IsSymbol: () => IsSymbol2,
  IsTemplateLiteral: () => IsTemplateLiteral,
  IsThis: () => IsThis,
  IsTuple: () => IsTuple,
  IsUndefined: () => IsUndefined2,
  IsUnion: () => IsUnion,
  IsUnknown: () => IsUnknown,
  IsUnsafe: () => IsUnsafe,
  IsVoid: () => IsVoid,
  KeyOf: () => KeyOf2,
  Literal: () => Literal,
  Lowercase: () => Lowercase,
  Mapped: () => Mapped,
  Module: () => Module2,
  Never: () => Never,
  NonNullable: () => NonNullable,
  Null: () => Null,
  Number: () => Number2,
  Object: () => _Object_,
  Omit: () => Omit,
  Optional: () => Optional,
  Parameter: () => Parameter,
  Parameters: () => Parameters,
  Partial: () => Partial,
  Pick: () => Pick,
  Readonly: () => Readonly,
  ReadonlyObject: () => ReadonlyObject,
  ReadonlyType: () => ReadonlyType,
  Record: () => Record,
  RecordKey: () => RecordKey,
  RecordPattern: () => RecordPattern,
  RecordValue: () => RecordValue,
  Ref: () => Ref,
  Refine: () => Refine,
  Required: () => Required,
  Rest: () => Rest,
  ReturnType: () => ReturnType,
  Script: () => Script2,
  String: () => String2,
  Symbol: () => Symbol2,
  TemplateLiteral: () => TemplateLiteral2,
  This: () => This,
  Tuple: () => Tuple,
  Uncapitalize: () => Uncapitalize,
  Undefined: () => Undefined,
  Union: () => Union,
  Unknown: () => Unknown,
  Unsafe: () => Unsafe,
  Uppercase: () => Uppercase,
  Void: () => Void,
  With: () => With2
});

// src/backend/src/tools.ts
init_card_redaction();

// src/backend/src/tools-card-mutations.ts
init_contract();
var ClaimTokenFieldName = "token";
function cardIdField() {
  return typebox_exports.String({ description: "Taskfold card id." });
}
function claimTokenField(description = "Claim token returned by taskfold_claim.") {
  return typebox_exports.Optional(typebox_exports.String({ description }));
}
function createTaskfoldMoveTool(params) {
  return {
    name: "taskfold_move",
    label: "Taskfold Move",
    description: "Move a Taskfold card to another status. Claimed cards require matching claim scope.",
    parameters: typebox_exports.Object(
      {
        id: cardIdField(),
        status: typebox_exports.Union(
          TASKFOLD_STATUSES.map((status) => typebox_exports.Literal(status)),
          { description: "Target Taskfold status." }
        ),
        [ClaimTokenFieldName]: claimTokenField("Claim token for claimed cards.")
      },
      { additionalProperties: false }
    ),
    execute: async (_toolCallId, rawParams) => {
      const { record, id, scope } = await params.readScopedCardToolParams(rawParams);
      return params.redactedCardResult(
        await params.store.move(id, record.status, void 0, scope)
      );
    }
  };
}

// src/backend/src/tools.ts
function contextOwner(ctx) {
  const record = ctx ?? {};
  return typeof record.agentId === "string" && record.agentId || typeof record.sessionKey === "string" && record.sessionKey || typeof record.sessionId === "string" && record.sessionId || "agent";
}
function canMutateCard(card, ownerId, token) {
  const claim = card.metadata?.claim;
  return !claim || claim.ownerId === ownerId || safeEqualSecret2(token, claim.token);
}
function readParentIds(value) {
  if (value == null) {
    return [];
  }
  const entries = typeof value === "string" ? value.split(",") : Array.isArray(value) ? value : void 0;
  if (!entries) {
    throw new Error("parents must be an array or comma-separated string.");
  }
  const parents = [];
  for (const entry of entries) {
    if (typeof entry !== "string") {
      throw new Error("parents must contain only strings.");
    }
    const parent = entry.trim();
    if (!parent || parents.includes(parent)) {
      continue;
    }
    if (parent.length > 120) {
      throw new Error("parents must be 120 characters or fewer.");
    }
    parents.push(parent);
    if (parents.length >= 20) {
      break;
    }
  }
  return parents;
}
async function requireScopedCard(store, cardId, ownerId, token) {
  const card = await store.get(cardId);
  if (!card) {
    throw new Error(`card not found: ${cardId}`);
  }
  if (!canMutateCard(card, ownerId, token)) {
    throw new Error(`card is claimed by ${card.metadata?.claim?.ownerId ?? "another agent"}.`);
  }
  return card;
}
async function requireClaimedCard(store, cardId, ownerId, token) {
  const card = await requireScopedCard(store, cardId, ownerId, token);
  if (!card.metadata?.claim) {
    throw new Error("card must be claimed before lifecycle completion.");
  }
  return card;
}
function summarizeCard(card) {
  return {
    id: card.id,
    title: card.title,
    status: card.status,
    priority: card.priority,
    agentId: card.agentId,
    tenant: card.metadata?.automation?.tenant,
    boardId: card.metadata?.automation?.boardId ?? "default",
    milestoneId: card.milestoneId,
    parents: card.metadata?.links?.filter((link) => link.type === "parent" && link.targetCardId).map((link) => link.targetCardId),
    children: card.metadata?.links?.filter((link) => link.type === "child" && link.targetCardId).map((link) => link.targetCardId),
    claim: card.metadata?.claim ? {
      ownerId: card.metadata.claim.ownerId,
      claimedAt: card.metadata.claim.claimedAt,
      lastHeartbeatAt: card.metadata.claim.lastHeartbeatAt,
      expiresAt: card.metadata.claim.expiresAt
    } : void 0,
    diagnostics: card.metadata?.diagnostics,
    archivedAt: card.metadata?.archivedAt,
    updatedAt: card.updatedAt
  };
}
var ScopedClaimTokenField = claimTokenField("Claim token for claimed cards.");
var OptionalNextStatusField = typebox_exports.Optional(
  typebox_exports.String({ description: "Optional next status." })
);
var OptionalOperatorNoteField = typebox_exports.Optional(
  typebox_exports.String({ description: "Optional operator note." })
);
function readCardToolParams(rawParams, ownerId) {
  const record = rawParams;
  const id = readStringParam(record, "id", { required: true });
  const token = record.token;
  return {
    record,
    id,
    token,
    scope: { ownerId, token }
  };
}
function redactedCardResult(card) {
  return jsonResult({ card: redactClaimToken(card) });
}
function redactedRawCardResult(card) {
  return jsonResult(redactClaimToken(card));
}
function redactedProofResult(card) {
  const proofId = card.metadata?.proof?.at(-1)?.id;
  if (!proofId) {
    throw new Error("proof was not retained in card metadata.");
  }
  return jsonResult({
    card: redactClaimToken(card),
    proofId
  });
}
var CardIdSchema = typebox_exports.Object(
  {
    id: cardIdField(),
    token: claimTokenField()
  },
  { additionalProperties: false }
);
function createTaskfoldTools(params) {
  const { store } = params;
  const ownerId = contextOwner(params.context);
  const readScopedCardToolParams = async (rawParams) => {
    const input = readCardToolParams(rawParams, ownerId);
    await requireScopedCard(store, input.id, ownerId, input.token);
    return input;
  };
  const readClaimedCardToolParams = async (rawParams) => {
    const input = readCardToolParams(rawParams, ownerId);
    await requireClaimedCard(store, input.id, ownerId, input.token);
    return input;
  };
  const runCardMutation = async (rawParams, readParams, mutate) => {
    const { record, id, scope } = await readParams(rawParams);
    return redactedCardResult(await mutate(id, record, scope));
  };
  const runScopedCardMutation = (rawParams, mutate) => runCardMutation(rawParams, readScopedCardToolParams, mutate);
  const runClaimedCardMutation = (rawParams, mutate) => runCardMutation(rawParams, readClaimedCardToolParams, mutate);
  return [
    {
      name: "taskfold_list",
      label: "Taskfold List",
      description: "List Taskfold cards with compact claim and diagnostic state. Use before choosing or routing board work.",
      parameters: typebox_exports.Object(
        {
          status: typebox_exports.Optional(typebox_exports.String({ description: "Optional card status filter." })),
          agentId: typebox_exports.Optional(typebox_exports.String({ description: "Optional agent id filter." })),
          tenant: typebox_exports.Optional(typebox_exports.String({ description: "Optional tenant filter." })),
          boardId: typebox_exports.Optional(typebox_exports.String({ description: "Optional board id filter." })),
          limit: typebox_exports.Optional(
            typebox_exports.Number({ description: "Maximum cards to return. Default 50." })
          ),
          refreshDiagnostics: typebox_exports.Optional(
            typebox_exports.Boolean({ description: "Refresh stored diagnostics before listing." })
          ),
          includeArchived: typebox_exports.Optional(
            typebox_exports.Boolean({ description: "Include archived cards. Default false." })
          )
        },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => {
        const record = rawParams;
        if (record.refreshDiagnostics === true) {
          await store.refreshDiagnostics();
        }
        const status = typeof record.status === "string" ? record.status : void 0;
        const agentId = typeof record.agentId === "string" ? record.agentId : void 0;
        const tenant = typeof record.tenant === "string" ? record.tenant : void 0;
        const boardId = typeof record.boardId === "string" ? record.boardId : void 0;
        const limit = typeof record.limit === "number" && Number.isFinite(record.limit) ? Math.max(1, Math.min(200, Math.trunc(record.limit))) : 50;
        const cards = (await store.list({ boardId })).filter((card) => record.includeArchived === true || !card.metadata?.archivedAt).filter((card) => !status || card.status === status).filter((card) => !agentId || card.agentId === agentId).filter((card) => !tenant || card.metadata?.automation?.tenant === tenant).slice(0, limit).map(summarizeCard);
        return jsonResult({ cards });
      }
    },
    {
      name: "taskfold_create",
      label: "Taskfold Create",
      description: "Create a Taskfold card, optionally with parent dependencies, tenant, skills, workspace, and idempotency key.",
      parameters: typebox_exports.Object(
        {
          title: typebox_exports.String({ description: "Card title." }),
          notes: typebox_exports.Optional(typebox_exports.String({ description: "Card notes or acceptance criteria." })),
          status: typebox_exports.Optional(typebox_exports.String({ description: "Initial status." })),
          priority: typebox_exports.Optional(typebox_exports.String({ description: "low, normal, high, or urgent." })),
          labels: typebox_exports.Optional(typebox_exports.Array(typebox_exports.String(), { description: "Card labels." })),
          agentId: typebox_exports.Optional(typebox_exports.String({ description: "Assigned agent id." })),
          parents: typebox_exports.Optional(typebox_exports.Array(typebox_exports.String(), { description: "Parent card ids." })),
          token: typebox_exports.Optional(
            typebox_exports.String({ description: "Claim token for claimed parent cards." })
          ),
          tenant: typebox_exports.Optional(typebox_exports.String({ description: "Soft tenant namespace." })),
          boardId: typebox_exports.Optional(typebox_exports.String({ description: "Soft board namespace." })),
          milestoneId: typebox_exports.Optional(
            typebox_exports.String({ description: "Active milestone id; omit for the Unassigned column." })
          ),
          createdByCardId: typebox_exports.Optional(
            typebox_exports.String({ description: "Parent card that created this card." })
          ),
          idempotencyKey: typebox_exports.Optional(typebox_exports.String({ description: "Idempotent create key." })),
          skills: typebox_exports.Optional(typebox_exports.Array(typebox_exports.String(), { description: "Suggested skills." })),
          workspace: typebox_exports.Optional(
            typebox_exports.Object(
              {
                kind: typebox_exports.String({ description: "scratch, dir, or worktree." }),
                path: typebox_exports.Optional(typebox_exports.String({ description: "Absolute dir/worktree path." })),
                branch: typebox_exports.Optional(typebox_exports.String({ description: "Suggested branch." }))
              },
              { additionalProperties: false }
            )
          ),
          maxRuntimeSeconds: typebox_exports.Optional(typebox_exports.Number({ description: "Run timeout seconds." })),
          maxRetries: typebox_exports.Optional(typebox_exports.Number({ description: "Retry budget." })),
          scheduledAt: typebox_exports.Optional(typebox_exports.Number({ description: "Unix epoch milliseconds." }))
        },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => {
        const record = rawParams;
        readParentIds(record.parents);
        return jsonResult({
          card: redactClaimToken(
            await store.create(record, { ownerId, token: record.token })
          )
        });
      }
    },
    {
      name: "taskfold_link",
      label: "Taskfold Link",
      description: "Link a parent card to a child card so the child becomes ready only after parents are done.",
      parameters: typebox_exports.Object(
        {
          parentId: typebox_exports.String({ description: "Parent card id." }),
          childId: typebox_exports.String({ description: "Child card id." }),
          token: typebox_exports.Optional(
            typebox_exports.String({ description: "Claim token for claimed parent or child cards." })
          )
        },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => {
        const record = rawParams;
        const parentId = readStringParam(record, "parentId", { required: true });
        const childId = readStringParam(record, "childId", { required: true });
        const token = record.token;
        return jsonResult({
          card: redactClaimToken(await store.linkCards(parentId, childId, { ownerId, token }))
        });
      }
    },
    {
      name: "taskfold_read",
      label: "Taskfold Read",
      description: "Read one Taskfold card and return bounded worker context with notes, attempts, comments, proof, links, and diagnostics.",
      parameters: CardIdSchema,
      execute: async (_toolCallId, rawParams) => {
        const record = rawParams;
        const id = readStringParam(record, "id", { required: true });
        const card = await store.get(id);
        if (!card) {
          throw new Error(`card not found: ${id}`);
        }
        return jsonResult({
          card: redactClaimToken(card),
          workerContext: await store.buildWorkerContext(id)
        });
      }
    },
    {
      name: "taskfold_claim",
      label: "Taskfold Claim",
      description: "Claim a Taskfold card for this agent and move backlog/todo cards into running. Returns a claim token for heartbeats and release.",
      parameters: typebox_exports.Object(
        {
          id: cardIdField(),
          ttlSeconds: typebox_exports.Optional(typebox_exports.Number({ description: "Claim TTL in seconds." }))
        },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => {
        const record = rawParams;
        const id = readStringParam(record, "id", { required: true });
        const claimed = await store.claim(id, {
          ownerId,
          ttlSeconds: record.ttlSeconds
        });
        return jsonResult({ ...claimed, card: redactClaimToken(claimed.card) });
      }
    },
    {
      name: "taskfold_heartbeat",
      label: "Taskfold Heartbeat",
      description: "Refresh this agent's Taskfold claim heartbeat. Use during long-running card work so diagnostics do not mark it stale.",
      parameters: typebox_exports.Object(
        {
          id: cardIdField(),
          token: claimTokenField(),
          note: typebox_exports.Optional(typebox_exports.String({ description: "Optional compact progress note." }))
        },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => {
        const { record, id, scope } = await readScopedCardToolParams(rawParams);
        return redactedRawCardResult(
          await store.heartbeat(id, {
            ...scope,
            note: record.note
          })
        );
      }
    },
    {
      name: "taskfold_release",
      label: "Taskfold Release",
      description: "Release this agent's Taskfold claim after finishing, pausing, or handing off card work.",
      parameters: typebox_exports.Object(
        {
          id: cardIdField(),
          token: claimTokenField(),
          status: typebox_exports.Optional(
            typebox_exports.String({ description: "Optional next card status after release." })
          )
        },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => {
        const { record, id, scope } = await readScopedCardToolParams(rawParams);
        return redactedRawCardResult(
          await store.releaseClaim(id, {
            ...scope,
            status: record.status
          })
        );
      }
    },
    {
      name: "taskfold_comment",
      label: "Taskfold Comment",
      description: "Append a compact comment to a Taskfold card.",
      parameters: typebox_exports.Object(
        {
          id: cardIdField(),
          body: typebox_exports.String({ description: "Comment body." }),
          token: ScopedClaimTokenField
        },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => {
        const { record, id, scope } = await readScopedCardToolParams(rawParams);
        return redactedRawCardResult(await store.addComment(id, { body: record.body }, scope));
      }
    },
    {
      name: "taskfold_proof",
      label: "Taskfold Proof",
      description: "Attach proof or artifact metadata to a Taskfold card after running tests, checks, or producing screenshots/logs. Returns proofId; pass it to taskfold_complete when that call reports the terminal status for this proof.",
      parameters: typebox_exports.Object(
        {
          id: cardIdField(),
          status: typebox_exports.Optional(
            typebox_exports.String({ description: "passed, failed, skipped, or unknown." })
          ),
          label: typebox_exports.Optional(typebox_exports.String({ description: "Proof label." })),
          command: typebox_exports.Optional(typebox_exports.String({ description: "Command or exact step run." })),
          url: typebox_exports.Optional(typebox_exports.String({ description: "Proof or artifact URL." })),
          note: typebox_exports.Optional(typebox_exports.String({ description: "Short proof note." })),
          artifactPath: typebox_exports.Optional(
            typebox_exports.String({ description: "Optional local artifact path." })
          ),
          token: ScopedClaimTokenField
        },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => {
        const { record, id, scope } = await readScopedCardToolParams(rawParams);
        const hasArtifact = typeof record.artifactPath === "string" && record.artifactPath.trim() !== "" || typeof record.url === "string" && record.url.trim() !== "";
        const card = hasArtifact ? await store.addProofWithArtifact(
          id,
          record,
          {
            label: record.label,
            path: record.artifactPath,
            url: record.url
          },
          scope
        ) : await store.addProof(id, record, scope);
        return redactedProofResult(card);
      }
    },
    {
      name: "taskfold_complete",
      label: "Taskfold Complete",
      description: "Complete a claimed Taskfold card with a structured summary, proof, artifacts, and created-card manifest.",
      parameters: typebox_exports.Object(
        {
          id: cardIdField(),
          token: claimTokenField(),
          summary: typebox_exports.Optional(typebox_exports.String({ description: "Completion summary." })),
          proofId: typebox_exports.Optional(
            typebox_exports.String({
              description: "Proof id returned by taskfold_proof when resolving that pending proof."
            })
          ),
          proof: typebox_exports.Optional(
            typebox_exports.Object(
              {
                status: typebox_exports.Optional(
                  typebox_exports.String({ description: "passed, failed, skipped, or unknown." })
                ),
                label: typebox_exports.Optional(typebox_exports.String({ description: "Proof label." })),
                command: typebox_exports.Optional(typebox_exports.String({ description: "Command or step run." })),
                url: typebox_exports.Optional(typebox_exports.String({ description: "Proof URL." })),
                note: typebox_exports.Optional(typebox_exports.String({ description: "Proof note." }))
              },
              { additionalProperties: false }
            )
          ),
          artifacts: typebox_exports.Optional(
            typebox_exports.Array(
              typebox_exports.Object(
                {
                  label: typebox_exports.Optional(typebox_exports.String()),
                  url: typebox_exports.Optional(typebox_exports.String()),
                  path: typebox_exports.Optional(typebox_exports.String()),
                  mimeType: typebox_exports.Optional(typebox_exports.String())
                },
                { additionalProperties: false }
              )
            )
          ),
          createdCardIds: typebox_exports.Optional(
            typebox_exports.Array(typebox_exports.String(), { description: "Cards created during this run." })
          )
        },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => {
        return runClaimedCardMutation(
          rawParams,
          (id, record, scope) => store.complete(id, record, scope)
        );
      }
    },
    {
      name: "taskfold_attachment_add",
      label: "Taskfold Attachment Add",
      description: "Store a small Taskfold attachment in plugin SQLite KV and link it to the card.",
      parameters: typebox_exports.Object(
        {
          id: cardIdField(),
          fileName: typebox_exports.String({ description: "Attachment file name." }),
          contentBase64: typebox_exports.String({ description: "Base64 attachment content." }),
          mimeType: typebox_exports.Optional(typebox_exports.String({ description: "Attachment MIME type." })),
          note: typebox_exports.Optional(typebox_exports.String({ description: "Optional attachment note." })),
          token: ScopedClaimTokenField
        },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => {
        const { record, id, scope } = await readScopedCardToolParams(rawParams);
        return redactedCardResult(await store.addAttachment(id, record, scope));
      }
    },
    {
      name: "taskfold_attachment_read",
      label: "Taskfold Attachment Read",
      description: "Read one Taskfold attachment from plugin SQLite KV.",
      parameters: typebox_exports.Object(
        {
          id: typebox_exports.String({ description: "Attachment id." })
        },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => {
        const id = readStringParam(rawParams, "id", {
          required: true
        });
        const attachment = await store.getAttachment(id);
        if (!attachment) {
          throw new Error(`attachment not found: ${id}`);
        }
        return jsonResult(attachment);
      }
    },
    {
      name: "taskfold_attachment_delete",
      label: "Taskfold Attachment Delete",
      description: "Delete one Taskfold attachment from plugin SQLite KV and the card index.",
      parameters: typebox_exports.Object(
        {
          id: cardIdField(),
          attachmentId: typebox_exports.String({ description: "Attachment id." }),
          token: ScopedClaimTokenField
        },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => {
        const { record, id, scope } = await readScopedCardToolParams(rawParams);
        const attachmentId = readStringParam(record, "attachmentId", { required: true });
        return redactedCardResult(await store.deleteAttachment(id, attachmentId, scope));
      }
    },
    {
      name: "taskfold_block",
      label: "Taskfold Block",
      description: "Block a claimed Taskfold card with a durable reason and release the claim.",
      parameters: typebox_exports.Object(
        {
          id: cardIdField(),
          token: claimTokenField(),
          reason: typebox_exports.Optional(typebox_exports.String({ description: "Blocker summary." }))
        },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => {
        return runClaimedCardMutation(
          rawParams,
          (id, record, scope) => store.block(id, record, scope)
        );
      }
    },
    {
      name: "taskfold_unblock",
      label: "Taskfold Unblock",
      description: "Move a blocked Taskfold card back to todo after adding enough context.",
      parameters: CardIdSchema,
      execute: async (_toolCallId, rawParams) => {
        const { id, scope } = await readScopedCardToolParams(rawParams);
        return redactedRawCardResult(await store.unblock(id, scope));
      }
    },
    createTaskfoldMoveTool({ store, readScopedCardToolParams, redactedCardResult }),
    {
      name: "taskfold_projects",
      label: "Taskfold Projects",
      description: "List Taskfold projects and their card summaries.",
      parameters: typebox_exports.Object(
        {
          includeArchived: typebox_exports.Optional(typebox_exports.Boolean())
        },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => jsonResult(await store.listProjects(rawParams))
    },
    {
      name: "taskfold_project_create",
      label: "Taskfold Project Create",
      description: "Create a blank Taskfold project, or initialize one for an existing local project directory.",
      parameters: typebox_exports.Object(
        {
          id: typebox_exports.String({ description: "Stable project id." }),
          name: typebox_exports.String({
            description: "Project name describing its purpose, e.g. 'Customer Support Platform'. Avoid numbered names or prefixes such as M1 or Phase 1 unless explicitly requested by the user. Preserve user-specified names."
          }),
          projectMode: typebox_exports.Optional(
            typebox_exports.Union([typebox_exports.Literal("new"), typebox_exports.Literal("existing")])
          ),
          initialMilestoneTitle: typebox_exports.Optional(
            typebox_exports.String({
              description: "Optional initial milestone title describing a concrete goal or deliverable, e.g. 'File Storage Migration'. Avoid numbered names or prefixes such as M1 or Phase 1 unless explicitly requested by the user. Preserve user-specified names."
            })
          ),
          description: typebox_exports.Optional(typebox_exports.String()),
          color: typebox_exports.Optional(typebox_exports.String()),
          repositoryUrl: typebox_exports.Optional(typebox_exports.String()),
          planningPath: typebox_exports.Optional(typebox_exports.String()),
          defaultWorkspace: typebox_exports.Optional(
            typebox_exports.Object(
              {
                kind: typebox_exports.Literal("dir"),
                path: typebox_exports.String({ description: "Absolute existing local project directory." })
              },
              { additionalProperties: false }
            )
          )
        },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => jsonResult({ project: await store.createProject(rawParams) })
    },
    {
      name: "taskfold_project_read",
      label: "Taskfold Project Read",
      description: "Read one Taskfold project's settings, milestones, and cards.",
      parameters: typebox_exports.Object({ id: typebox_exports.String() }, { additionalProperties: false }),
      execute: async (_toolCallId, rawParams) => jsonResult({
        project: await store.getProject(readStringParam(rawParams, "id", {
          required: true
        }))
      })
    },
    {
      name: "taskfold_milestone_create",
      label: "Taskfold Milestone Create",
      description: "Create an active milestone column in a Taskfold project.",
      parameters: typebox_exports.Object(
        {
          boardId: typebox_exports.String(),
          title: typebox_exports.String({
            description: "Milestone title describing a concrete goal or deliverable, e.g. 'Authentication and Permissions'. Avoid numbered names or prefixes such as M1 or Phase 1 unless explicitly requested by the user. Preserve user-specified names."
          }),
          description: typebox_exports.Optional(typebox_exports.String()),
          color: typebox_exports.Optional(typebox_exports.String())
        },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => jsonResult({ milestone: await store.createMilestone(rawParams) })
    },
    {
      name: "taskfold_move_milestone",
      label: "Taskfold Move Milestone",
      description: "Move a card between milestone columns without changing its execution status.",
      parameters: typebox_exports.Object(
        {
          id: cardIdField(),
          milestoneId: typebox_exports.Optional(
            typebox_exports.String({ description: "Target milestone id; omit to move into Unassigned." })
          ),
          position: typebox_exports.Optional(typebox_exports.Number()),
          token: ScopedClaimTokenField
        },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => {
        const { record, id } = await readScopedCardToolParams(rawParams);
        return redactedCardResult(await store.moveMilestone(id, record));
      }
    },
    {
      name: "taskfold_move_project",
      label: "Taskfold Move Project",
      description: "Move a card to another active project while retaining its execution history.",
      parameters: typebox_exports.Object(
        {
          id: cardIdField(),
          boardId: typebox_exports.String({ description: "Target project id." }),
          milestoneId: typebox_exports.Optional(typebox_exports.String()),
          position: typebox_exports.Optional(typebox_exports.Number()),
          token: ScopedClaimTokenField
        },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => {
        const { record, id } = await readScopedCardToolParams(rawParams);
        return redactedCardResult(await store.moveProject(id, record));
      }
    },
    {
      name: "taskfold_project_documents",
      label: "Taskfold Project Documents",
      description: "List a project's long-lived context documents.",
      parameters: typebox_exports.Object(
        {
          boardId: typebox_exports.String(),
          includeHidden: typebox_exports.Optional(typebox_exports.Boolean())
        },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => {
        const record = rawParams;
        return jsonResult(
          await store.listProjectDocuments(record.boardId, {
            includeHidden: record.includeHidden
          })
        );
      }
    },
    {
      name: "taskfold_project_document_create",
      label: "Taskfold Project Document Create",
      description: "Add a typed project document without reading files or secrets.",
      parameters: typebox_exports.Object(
        {
          boardId: typebox_exports.String(),
          key: typebox_exports.String(),
          section: typebox_exports.String({ description: "project, codebase, environment, or knowledge." }),
          type: typebox_exports.String({ description: "markdown, json, link, path, or secret_ref." }),
          title: typebox_exports.String(),
          summary: typebox_exports.Optional(typebox_exports.String()),
          target: typebox_exports.Optional(typebox_exports.String()),
          content: typebox_exports.Optional(typebox_exports.String())
        },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => jsonResult({
        document: await store.createProjectDocument(rawParams)
      })
    },
    {
      name: "taskfold_boards",
      label: "Taskfold Boards",
      description: "List Taskfold board namespaces with active, archived, and status counts.",
      parameters: typebox_exports.Object({}, { additionalProperties: false }),
      execute: async () => jsonResult(await store.listBoards())
    },
    {
      name: "taskfold_board_create",
      label: "Taskfold Board Create",
      description: "Create or update a Taskfold board namespace with persisted SQLite metadata.",
      parameters: typebox_exports.Object(
        {
          id: typebox_exports.String({ description: "Board id." }),
          name: typebox_exports.Optional(
            typebox_exports.String({
              description: "Board display name describing its project or business purpose, e.g. 'Customer Support Platform'. Avoid numbered names or prefixes such as M1 or Phase 1 unless explicitly requested by the user. Preserve user-specified names."
            })
          ),
          description: typebox_exports.Optional(typebox_exports.String({ description: "Board description." })),
          icon: typebox_exports.Optional(typebox_exports.String({ description: "Short icon or label." })),
          color: typebox_exports.Optional(typebox_exports.String({ description: "Display color token." })),
          defaultWorkspace: typebox_exports.Optional(
            typebox_exports.Object(
              {
                kind: typebox_exports.String({ description: "scratch, dir, or worktree." }),
                path: typebox_exports.Optional(typebox_exports.String({ description: "Absolute dir/worktree path." })),
                branch: typebox_exports.Optional(typebox_exports.String({ description: "Suggested branch." }))
              },
              { additionalProperties: false }
            )
          ),
          orchestration: typebox_exports.Optional(
            typebox_exports.Object(
              {
                autoDecompose: typebox_exports.Optional(
                  typebox_exports.Boolean({ description: "Mark ready triage cards for decomposition." })
                ),
                autoDecomposePerDispatch: typebox_exports.Optional(
                  typebox_exports.Number({ description: "Maximum orchestration candidates per dispatch." })
                ),
                defaultAssignee: typebox_exports.Optional(typebox_exports.String({ description: "Default assignee." })),
                orchestratorProfile: typebox_exports.Optional(
                  typebox_exports.String({ description: "Orchestrator profile id." })
                )
              },
              { additionalProperties: false }
            )
          )
        },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => jsonResult({ board: await store.upsertBoard(rawParams) })
    },
    {
      name: "taskfold_board_archive",
      label: "Taskfold Board Archive",
      description: "Archive or restore persisted Taskfold board metadata.",
      parameters: typebox_exports.Object(
        {
          id: typebox_exports.String({ description: "Board id." }),
          archived: typebox_exports.Optional(typebox_exports.Boolean({ description: "Archive when true." }))
        },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => {
        const record = rawParams;
        return jsonResult({ board: await store.archiveBoard(record.id, record.archived) });
      }
    },
    {
      name: "taskfold_board_delete",
      label: "Taskfold Board Delete",
      description: "Delete an empty non-default Taskfold board metadata record.",
      parameters: typebox_exports.Object(
        { id: typebox_exports.String({ description: "Board id." }) },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => jsonResult(await store.deleteBoard(rawParams.id))
    },
    {
      name: "taskfold_stats",
      label: "Taskfold Stats",
      description: "Summarize Taskfold counts by status and assignee for one board or all boards.",
      parameters: typebox_exports.Object(
        {
          boardId: typebox_exports.Optional(typebox_exports.String({ description: "Optional board id filter." }))
        },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => {
        const record = rawParams;
        return jsonResult(await store.stats({ boardId: record.boardId }));
      }
    },
    {
      name: "taskfold_runs",
      label: "Taskfold Runs",
      description: "List persisted Taskfold run attempts for one card.",
      parameters: CardIdSchema,
      execute: async (_toolCallId, rawParams) => {
        const id = readStringParam(rawParams, "id", { required: true });
        const result = await store.runs(id);
        return jsonResult({ ...result, card: redactClaimToken(result.card) });
      }
    },
    {
      name: "taskfold_specify",
      label: "Taskfold Specify",
      description: "Turn a rough triage/backlog Taskfold card into a specified todo card after reasoning through the requirements.",
      parameters: typebox_exports.Object(
        {
          id: typebox_exports.String({ description: "Taskfold card id." }),
          title: typebox_exports.Optional(typebox_exports.String({ description: "Clarified title." })),
          notes: typebox_exports.Optional(
            typebox_exports.String({ description: "Clarified notes or acceptance criteria." })
          ),
          agentId: typebox_exports.Optional(typebox_exports.String({ description: "Assigned agent id." })),
          priority: typebox_exports.Optional(typebox_exports.String({ description: "low, normal, high, or urgent." })),
          labels: typebox_exports.Optional(typebox_exports.Array(typebox_exports.String(), { description: "Card labels." })),
          boardId: typebox_exports.Optional(typebox_exports.String({ description: "Board id." })),
          tenant: typebox_exports.Optional(typebox_exports.String({ description: "Tenant or routing namespace." })),
          skills: typebox_exports.Optional(typebox_exports.Array(typebox_exports.String(), { description: "Suggested skills." })),
          workspace: typebox_exports.Optional(
            typebox_exports.Object(
              {
                kind: typebox_exports.String({ description: "scratch, dir, or worktree." }),
                path: typebox_exports.Optional(typebox_exports.String({ description: "Absolute dir/worktree path." })),
                branch: typebox_exports.Optional(typebox_exports.String({ description: "Suggested branch." }))
              },
              { additionalProperties: false }
            )
          ),
          maxRuntimeSeconds: typebox_exports.Optional(typebox_exports.Number({ description: "Runtime budget." })),
          maxRetries: typebox_exports.Optional(typebox_exports.Number({ description: "Retry budget." })),
          summary: typebox_exports.Optional(typebox_exports.String({ description: "Specification summary comment." })),
          token: typebox_exports.Optional(typebox_exports.String({ description: "Claim token for claimed cards." }))
        },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => {
        const record = rawParams;
        const id = readStringParam(record, "id", { required: true });
        await requireScopedCard(store, id, ownerId, record.token);
        return jsonResult({
          card: redactClaimToken(await store.specify(id, record, { ownerId, token: record.token }))
        });
      }
    },
    {
      name: "taskfold_decompose",
      label: "Taskfold Decompose",
      description: "Fan out a Taskfold card into linked child cards and optionally complete the parent orchestration card.",
      parameters: typebox_exports.Object(
        {
          id: typebox_exports.String({ description: "Parent Taskfold card id." }),
          token: typebox_exports.Optional(typebox_exports.String({ description: "Claim token for claimed cards." })),
          summary: typebox_exports.Optional(typebox_exports.String({ description: "Decomposition summary." })),
          completeParent: typebox_exports.Optional(
            typebox_exports.Boolean({
              description: "Complete the parent after child creation. Default true."
            })
          ),
          children: typebox_exports.Array(
            typebox_exports.Object(
              {
                title: typebox_exports.String({ description: "Child title." }),
                notes: typebox_exports.Optional(typebox_exports.String({ description: "Child notes." })),
                agentId: typebox_exports.Optional(typebox_exports.String({ description: "Assigned agent id." })),
                priority: typebox_exports.Optional(
                  typebox_exports.String({ description: "low, normal, high, or urgent." })
                ),
                labels: typebox_exports.Optional(typebox_exports.Array(typebox_exports.String())),
                boardId: typebox_exports.Optional(typebox_exports.String()),
                tenant: typebox_exports.Optional(typebox_exports.String()),
                skills: typebox_exports.Optional(typebox_exports.Array(typebox_exports.String())),
                workspace: typebox_exports.Optional(
                  typebox_exports.Object(
                    {
                      kind: typebox_exports.String({ description: "scratch, dir, or worktree." }),
                      path: typebox_exports.Optional(
                        typebox_exports.String({ description: "Absolute dir/worktree path." })
                      ),
                      branch: typebox_exports.Optional(typebox_exports.String({ description: "Suggested branch." }))
                    },
                    { additionalProperties: false }
                  )
                ),
                maxRuntimeSeconds: typebox_exports.Optional(typebox_exports.Number()),
                maxRetries: typebox_exports.Optional(typebox_exports.Number()),
                idempotencyKey: typebox_exports.Optional(typebox_exports.String())
              },
              { additionalProperties: false }
            )
          )
        },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => {
        const record = rawParams;
        const id = readStringParam(record, "id", { required: true });
        await requireScopedCard(store, id, ownerId, record.token);
        const result = await store.decompose(id, record, { ownerId, token: record.token });
        return jsonResult({
          parent: redactClaimToken(result.parent),
          children: result.children.map(redactClaimToken)
        });
      }
    },
    {
      name: "taskfold_notify_subscribe",
      label: "Taskfold Notify Subscribe",
      description: "Persist a Taskfold notification subscription in the plugin SQLite store.",
      parameters: typebox_exports.Object(
        {
          boardId: typebox_exports.Optional(typebox_exports.String({ description: "Board id. Default default." })),
          cardId: typebox_exports.Optional(typebox_exports.String({ description: "Card id." })),
          sessionKey: typebox_exports.Optional(typebox_exports.String({ description: "Session key." })),
          runId: typebox_exports.Optional(typebox_exports.String({ description: "Run id." })),
          target: typebox_exports.Optional(typebox_exports.String({ description: "Human-readable target." })),
          eventKinds: typebox_exports.Optional(
            typebox_exports.Array(typebox_exports.String(), { description: "completed, failed, stale." })
          )
        },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => jsonResult({
        subscription: await store.subscribeNotifications(rawParams)
      })
    },
    {
      name: "taskfold_notify_list",
      label: "Taskfold Notify List",
      description: "List persisted Taskfold notification subscriptions.",
      parameters: typebox_exports.Object(
        {
          boardId: typebox_exports.Optional(typebox_exports.String({ description: "Board id." })),
          cardId: typebox_exports.Optional(typebox_exports.String({ description: "Card id." }))
        },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => jsonResult(await store.listNotificationSubscriptions(rawParams))
    },
    {
      name: "taskfold_notify_events",
      label: "Taskfold Notify Events",
      description: "Read replay-safe Taskfold notification events without advancing cursors.",
      parameters: typebox_exports.Object(
        {
          subscriptionId: typebox_exports.Optional(typebox_exports.String({ description: "Subscription id." })),
          boardId: typebox_exports.Optional(typebox_exports.String({ description: "Board id." })),
          cardId: typebox_exports.Optional(typebox_exports.String({ description: "Card id." })),
          limit: typebox_exports.Optional(typebox_exports.Number({ description: "Maximum events. Default 50." }))
        },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => jsonResult(await store.notificationEvents(rawParams))
    },
    {
      name: "taskfold_notify_advance",
      label: "Taskfold Notify Advance",
      description: "Read Taskfold notification events and advance the subscription cursor.",
      parameters: typebox_exports.Object(
        {
          subscriptionId: typebox_exports.String({ description: "Subscription id." }),
          limit: typebox_exports.Optional(typebox_exports.Number({ description: "Maximum events. Default 50." }))
        },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => jsonResult(await store.advanceNotificationEvents(rawParams))
    },
    {
      name: "taskfold_notify_unsubscribe",
      label: "Taskfold Notify Unsubscribe",
      description: "Delete a persisted Taskfold notification subscription.",
      parameters: typebox_exports.Object(
        { id: typebox_exports.String({ description: "Subscription id." }) },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => {
        const id = readStringParam(rawParams, "id", { required: true });
        return jsonResult(await store.deleteNotificationSubscription(id));
      }
    },
    {
      name: "taskfold_promote",
      label: "Taskfold Promote",
      description: "Promote a dependency-ready card into ready, optionally forcing past holds for operator recovery.",
      parameters: typebox_exports.Object(
        {
          id: cardIdField(),
          token: ScopedClaimTokenField,
          force: typebox_exports.Optional(
            typebox_exports.Boolean({ description: "Bypass dependency or schedule holds." })
          ),
          reason: OptionalOperatorNoteField
        },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => {
        return runScopedCardMutation(
          rawParams,
          (id, record, scope) => store.promote(id, record, scope)
        );
      }
    },
    {
      name: "taskfold_reassign",
      label: "Taskfold Reassign",
      description: "Change a card assignee and optionally reset failure state during recovery.",
      parameters: typebox_exports.Object(
        {
          id: cardIdField(),
          token: ScopedClaimTokenField,
          agentId: typebox_exports.Optional(typebox_exports.String({ description: "New assignee id." })),
          status: OptionalNextStatusField,
          resetFailures: typebox_exports.Optional(typebox_exports.Boolean({ description: "Reset failure count." })),
          reason: OptionalOperatorNoteField
        },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => {
        return runScopedCardMutation(
          rawParams,
          (id, record, scope) => store.reassign(id, record, scope)
        );
      }
    },
    {
      name: "taskfold_reclaim",
      label: "Taskfold Reclaim",
      description: "Release a stale claim and stop running attempts so another agent can pick it up.",
      parameters: typebox_exports.Object(
        {
          id: cardIdField(),
          token: ScopedClaimTokenField,
          status: OptionalNextStatusField,
          reason: OptionalOperatorNoteField
        },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => {
        return runScopedCardMutation(
          rawParams,
          (id, record, scope) => store.reclaim(id, record, scope)
        );
      }
    },
    {
      name: "taskfold_dispatch",
      label: "Taskfold Dispatch",
      description: "Advance persisted board state without launching workers: promote unblocked cards, reclaim expired claims, and block timed-out runs.",
      parameters: typebox_exports.Object(
        {
          boardId: typebox_exports.Optional(typebox_exports.String({ description: "Optional board id filter." }))
        },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => {
        const record = rawParams && typeof rawParams === "object" && !Array.isArray(rawParams) ? rawParams : {};
        const result = await store.dispatch({ boardId: record.boardId });
        return jsonResult({
          ...result,
          promoted: result.promoted.map(redactClaimToken),
          reclaimed: result.reclaimed.map(redactClaimToken),
          blocked: result.blocked.map(redactClaimToken),
          orchestrated: result.orchestrated.map(redactClaimToken)
        });
      }
    },
    {
      name: "taskfold_worker_log",
      label: "Taskfold Worker Log",
      description: "Append a persisted worker log entry to a Taskfold card.",
      parameters: typebox_exports.Object(
        {
          id: cardIdField(),
          level: typebox_exports.Optional(typebox_exports.String({ description: "info, warning, or error." })),
          message: typebox_exports.String({ description: "Worker log message." }),
          sessionKey: typebox_exports.Optional(typebox_exports.String({ description: "Linked session key." })),
          runId: typebox_exports.Optional(typebox_exports.String({ description: "Linked run id." })),
          token: ScopedClaimTokenField
        },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => {
        const { record, id, scope } = await readScopedCardToolParams(rawParams);
        return redactedCardResult(await store.addWorkerLog(id, record, scope));
      }
    },
    {
      name: "taskfold_protocol_violation",
      label: "Taskfold Protocol Violation",
      description: "Block a card and record a worker protocol violation when work stops without complete/block.",
      parameters: typebox_exports.Object(
        {
          id: cardIdField(),
          detail: typebox_exports.Optional(typebox_exports.String({ description: "Violation detail." })),
          sessionKey: typebox_exports.Optional(typebox_exports.String({ description: "Linked session key." })),
          runId: typebox_exports.Optional(typebox_exports.String({ description: "Linked run id." })),
          token: ScopedClaimTokenField
        },
        { additionalProperties: false }
      ),
      execute: async (_toolCallId, rawParams) => {
        const { record, id, scope } = await readClaimedCardToolParams(rawParams);
        return redactedCardResult(await store.recordProtocolViolation(id, record, scope));
      }
    }
  ];
}

// src/backend/index.ts
var TASKFOLD_CLI_OPTIONS = {
  descriptors: [
    {
      name: "taskfold",
      description: "Manage Taskfold cards and worker dispatch",
      hasSubcommands: true
    }
  ]
};
var index_default = definePluginEntry({
  id: "taskfold",
  name: "Taskfold",
  description: "Taskfold for agent-owned issues and sessions.",
  register(api) {
    if (api.registrationMode === "cli-metadata") {
      api.registerCli(() => {
      }, TASKFOLD_CLI_OPTIONS);
      return;
    }
    const pluginDir = resolveTaskfoldPluginDir(resolveStateDir(process.env));
    const store = TaskfoldStore.fromStores(
      createTaskfoldProjectRoutedStores({ pluginDir, warn: (message) => api.logger.warn(message) })
    );
    api.session.controls.registerControlUiDescriptor({
      surface: "tab",
      id: "taskfold",
      label: "Taskfold",
      description: "Gateway-local board for agent-owned work.",
      icon: "kanban",
      group: "control",
      requiredScopes: ["operator.write"]
    });
    registerTaskfoldGatewayMethods({ api, store });
    registerTaskfoldCommand({ api, store });
    api.registerService(createTaskfoldChangeEventService(store));
    api.registerService(createTaskfoldSqliteMigrationCheckService(pluginDir));
    api.registerService(createTaskfoldReconcilerService({ store, runtime: api.runtime }));
    api.on("subagent_ended", async (event) => {
      await store.finishExecutionForRun(event.runId, {
        outcome: event.outcome,
        endedAt: event.endedAt,
        reason: event.error ?? event.reason,
        targetSessionKey: event.targetSessionKey
      });
      await cleanupTaskfoldRunWorktree({
        store,
        worktrees: api.runtime.worktrees,
        runId: event.runId,
        targetSessionKey: event.targetSessionKey
      });
    });
    api.registerCli(
      async ({ program }) => {
        const { registerTaskfoldCli: registerTaskfoldCli2 } = await Promise.resolve().then(() => (init_cli(), cli_exports));
        registerTaskfoldCli2({ program, store, pluginDir });
      },
      TASKFOLD_CLI_OPTIONS
    );
    api.registerTool(
      (context) => guardTaskfoldToolsForWorkspaceAccess(
        createTaskfoldTools({ api, context, store }),
        context,
        void 0
      ),
      {
        names: [...TASKFOLD_TOOL_NAMES],
        optional: true
      }
    );
  }
});
export {
  index_default as default
};
