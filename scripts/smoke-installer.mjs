var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __knownSymbol = (name, symbol) => (symbol = Symbol[name]) ? symbol : Symbol.for("Symbol." + name);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __decoratorStart = (base) => [, , , __create(base?.[__knownSymbol("metadata")] ?? null)];
var __decoratorStrings = ["class", "method", "getter", "setter", "accessor", "field", "value", "get", "set"];
var __expectFn = (fn) => fn !== void 0 && typeof fn !== "function" ? __typeError("Function expected") : fn;
var __decoratorContext = (kind, name, done, metadata, fns) => ({ kind: __decoratorStrings[kind], name, metadata, addInitializer: (fn) => done._ ? __typeError("Already initialized") : fns.push(__expectFn(fn || null)) });
var __decoratorMetadata = (array, target) => __defNormalProp(target, __knownSymbol("metadata"), array[3]);
var __runInitializers = (array, flags, self, value) => {
  for (var i = 0, fns = array[flags >> 1], n = fns && fns.length; i < n; i++) flags & 1 ? fns[i].call(self) : value = fns[i].call(self, value);
  return value;
};
var __decorateElement = (array, flags, name, decorators, target, extra) => {
  var fn, it, done, ctx, access, k = flags & 7, s = !!(flags & 8), p = !!(flags & 16);
  var j = k > 3 ? array.length + 1 : k ? s ? 1 : 2 : 0, key = __decoratorStrings[k + 5];
  var initializers = k > 3 && (array[j - 1] = []), extraInitializers = array[j] || (array[j] = []);
  var desc = k && (!p && !s && (target = target.prototype), k < 5 && (k > 3 || !p) && __getOwnPropDesc(k < 4 ? target : { get [name]() {
    return __privateGet(this, extra);
  }, set [name](x) {
    return __privateSet(this, extra, x);
  } }, name));
  k ? p && k < 4 && __name(extra, (k > 2 ? "set " : k > 1 ? "get " : "") + name) : __name(target, name);
  for (var i = decorators.length - 1; i >= 0; i--) {
    ctx = __decoratorContext(k, name, done = {}, array[3], extraInitializers);
    if (k) {
      ctx.static = s, ctx.private = p, access = ctx.access = { has: p ? (x) => __privateIn(target, x) : (x) => name in x };
      if (k ^ 3) access.get = p ? (x) => (k ^ 1 ? __privateGet : __privateMethod)(x, target, k ^ 4 ? extra : desc.get) : (x) => x[name];
      if (k > 2) access.set = p ? (x, y) => __privateSet(x, target, y, k ^ 4 ? extra : desc.set) : (x, y) => x[name] = y;
    }
    it = (0, decorators[i])(k ? k < 4 ? p ? extra : desc[key] : k > 4 ? void 0 : { get: desc.get, set: desc.set } : target, ctx), done._ = 1;
    if (k ^ 4 || it === void 0) __expectFn(it) && (k > 4 ? initializers.unshift(it) : k ? p ? extra = it : desc[key] = it : target = it);
    else if (typeof it !== "object" || it === null) __typeError("Object expected");
    else __expectFn(fn = it.get) && (desc.get = fn), __expectFn(fn = it.set) && (desc.set = fn), __expectFn(fn = it.init) && initializers.unshift(fn);
  }
  return k || __decoratorMetadata(array, target), desc && __defProp(target, name, desc), p ? k ^ 4 ? extra : desc : target;
};
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateIn = (member, obj) => Object(obj) !== obj ? __typeError('Cannot use the "in" operator on this value') : member.has(obj);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);

// src/installer.ts
import { existsSync as existsSync2 } from "node:fs";
import { mkdir as mkdir2, open, readFile, rm as rm2, writeFile } from "node:fs/promises";
import { isAbsolute, join as join3 } from "node:path";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";

// src/github-url.ts
var UrlParseError = class extends Error {
  constructor(messageKey, detail) {
    super(detail ?? messageKey);
    this.messageKey = messageKey;
    this.detail = detail;
    this.name = "UrlParseError";
  }
};
var OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
var REPO_RE = /^[A-Za-z0-9._-]+$/;
var SHA_RE = /^[0-9a-f]{7,40}$/i;
function assertOwnerRepo(owner, repo) {
  if (!OWNER_RE.test(owner)) throw new UrlParseError("badOwner", owner);
  if (!REPO_RE.test(repo)) throw new UrlParseError("badRepo", repo);
}
function parseGitHubTarget(input) {
  const raw = input.trim();
  if (raw === "") throw new UrlParseError("emptyInput");
  const shorthand = raw.startsWith("github:") ? raw.slice("github:".length) : raw;
  const url = tryParseUrl(shorthand);
  if (url !== void 0) {
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new UrlParseError("badProtocol", url.protocol);
    }
    const host = url.hostname.toLowerCase();
    if (host !== "github.com" && host !== "www.github.com") {
      throw new UrlParseError("badHost", host);
    }
    const segments = url.pathname.split("/").filter((segment) => segment !== "");
    if (segments.length < 2) throw new UrlParseError("badPath", url.pathname);
    const [owner2, repoRaw] = segments;
    const repo2 = repoRaw.replace(/\.git$/u, "");
    assertOwnerRepo(owner2, repo2);
    if (segments.length === 2) return { kind: "default", owner: owner2, repo: repo2 };
    if (segments[2] === "archive") {
      if (segments.length < 5) throw new UrlParseError("badPath", url.pathname);
      if (segments[3] !== "refs") throw new UrlParseError("badPath", url.pathname);
      const kind = segments[4] === "tags" ? "tag" : "branch";
      let ref2 = decodeURIComponent(segments.slice(5).join("/"));
      ref2 = ref2.replace(/\.(?:zip|tar\.gz|tgz|tarball)$/iu, "");
      if (ref2 === "") throw new UrlParseError("badPath", url.pathname);
      return { kind, owner: owner2, repo: repo2, ref: ref2 };
    }
    if (segments[2] === "tree" || segments[2] === "blob") {
      const ref2 = decodeURIComponent(segments[3] ?? "");
      if (ref2 === "") throw new UrlParseError("badPath", url.pathname);
      return { kind: SHA_RE.test(ref2) ? "commit" : "branch", owner: owner2, repo: repo2, ref: ref2 };
    }
    if (segments[2] === "releases") {
      if (segments[3] === "tag" && segments.length >= 4) {
        const ref2 = decodeURIComponent(segments[4] ?? "");
        if (ref2 !== "") return { kind: "tag", owner: owner2, repo: repo2, ref: ref2 };
      }
      return { kind: "default", owner: owner2, repo: repo2 };
    }
    return { kind: "default", owner: owner2, repo: repo2 };
  }
  const at = shorthand.lastIndexOf("@");
  const base = at > 0 ? shorthand.slice(0, at) : shorthand;
  const ref = at > 0 ? shorthand.slice(at + 1) : void 0;
  const parts = base.split("/").filter((segment) => segment !== "");
  if (parts.length !== 2) throw new UrlParseError("badShorthand", shorthand);
  const [owner, repo] = parts;
  const cleanRepo = repo.replace(/\.git$/u, "");
  assertOwnerRepo(owner, cleanRepo);
  if (ref === void 0 || ref === "") return { kind: "default", owner, repo: cleanRepo };
  return { kind: SHA_RE.test(ref) ? "commit" : "branch", owner, repo: cleanRepo, ref };
}
function tryParseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return void 0;
  }
}
function codeloadZipUrl(target) {
  const ref = "ref" in target ? target.ref : void 0;
  if (ref === void 0) {
    return `https://codeload.github.com/${target.owner}/${target.repo}/zip/HEAD`;
  }
  const shape = target.kind === "tag" ? "tags" : "heads";
  return `https://codeload.github.com/${target.owner}/${target.repo}/zip/refs/${shape}/${encodeURIComponent(ref)}`;
}
function archiveZipUrl(target) {
  if (!("ref" in target)) {
    return `https://github.com/${target.owner}/${target.repo}/archive/HEAD.zip`;
  }
  const shape = target.kind === "tag" ? "tags" : "heads";
  return `https://github.com/${target.owner}/${target.repo}/archive/refs/${shape}/${encodeURIComponent(target.ref)}.zip`;
}
function targetLabel(target) {
  const base = `${target.owner}/${target.repo}`;
  return "ref" in target ? `${base}@${target.ref}` : base;
}

// src/platform.ts
import { homedir } from "node:os";
function downloadsDir({ platform, env }) {
  const home = env.HOME ?? env.USERPROFILE ?? homedir();
  switch (platform) {
    case "win32": {
      const known = env.UserProfile !== void 0 ? `${env.UserProfile}\\Downloads` : `${home}\\Downloads`;
      return known;
    }
    case "darwin": {
      return env.XDG_DOWNLOAD_DIR !== void 0 ? expandHomeVar(env.XDG_DOWNLOAD_DIR, home) : `${home}/Downloads`;
    }
    default: {
      return env.XDG_DOWNLOAD_DIR !== void 0 ? expandHomeVar(env.XDG_DOWNLOAD_DIR, home) : `${home}/Downloads`;
    }
  }
}
function expandHomeVar(value, home) {
  return value.replace(/^\$HOME/u, home);
}
function unzipCommand(platform, zipPath, outDir) {
  switch (platform) {
    case "win32":
      return {
        command: "powershell.exe",
        args: [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `Expand-Archive -LiteralPath "${zipPath}" -DestinationPath "${outDir}" -Force`
        ]
      };
    case "darwin":
      return { command: "ditto", args: ["-x", "-k", zipPath, outDir] };
    default:
      return { command: "unzip", args: ["-o", "-q", zipPath, "-d", outDir] };
  }
}

// src/pnpm-heal.ts
function extractBlockedPackages(stderr) {
  const names = /* @__PURE__ */ new Set();
  const ignored = /Ignored build scripts?:\s*(.+?)\.\s*(?:Run\b|$)/mu.exec(stderr);
  if (ignored?.[1] !== void 0) {
    for (const piece of ignored[1].split(/[,，]/u)) {
      const name = piece.trim().replace(/^['"]|['"]$/gu, "");
      if (name !== "" && name !== "Run") names.add(name);
    }
  }
  for (const match of stderr.matchAll(/(?:^|\n)\s*[-–]\s*([@a-z0-9][@a-z0-9._/-]*)\s*(?:\(.+?\))?\s*(?:removed|flagged)/giu)) {
    const name = match[1]?.trim();
    if (name !== void 0 && name.startsWith("@") || name !== void 0 && name.includes(".")) names.add(name);
  }
  for (const match of stderr.matchAll(/(?:prepare|preinstall|install|postinstall) script of (?:['"])([^'"]+)(?:['"])/giu)) {
    const name = match[1]?.trim();
    if (name !== void 0) names.add(name);
  }
  return [...names];
}
function readWorkspaceAllowList(yaml) {
  const lines = yaml.split(/\r?\n/u);
  const out = [];
  let inBlock = false;
  for (const line of lines) {
    const inline = /^onlyBuiltDependencies\s*:\s*\[(.*)\]\s*$/u.exec(line);
    if (inline !== null) {
      out.push(...inline[1].split(",").map((piece) => piece.trim().replace(/^['"]|['"]$/gu, "")).filter((name) => name !== ""));
      inBlock = false;
      continue;
    }
    const header = /^onlyBuiltDependencies\s*:\s*(?:\[\s*)?$/u.exec(line);
    if (header !== null) {
      inBlock = true;
      continue;
    }
    if (inBlock) {
      if (/^\s+#/u.test(line)) continue;
      const item = /^\s*-\s*(.+?)\s*$/u.exec(line);
      if (item !== null) {
        out.push(item[1].trim().replace(/^['"]|['"]$/gu, ""));
        continue;
      }
      if (line.trim() === "") continue;
      inBlock = false;
    }
  }
  return out;
}
function mergeWorkspaceAllowList(yaml, names) {
  if (names.length === 0) return yaml;
  const existing = new Set(readWorkspaceAllowList(yaml));
  const additions = names.filter((name) => !existing.has(name));
  if (additions.length === 0) return yaml;
  const lines = yaml.split(/\r?\n/u);
  const headerIndex = lines.findIndex((line) => /^onlyBuiltDependencies\s*:/u.test(line));
  if (headerIndex >= 0) {
    const header = lines[headerIndex];
    const inline = /^onlyBuiltDependencies\s*:\s*\[(.*)\]\s*$/u.exec(header);
    if (inline !== null) {
      const items = inline[1].split(",").map((piece) => piece.trim().replace(/^['"]|['"]$/gu, "")).filter((name) => name !== "");
      const merged = [...items, ...additions];
      lines[headerIndex] = `onlyBuiltDependencies: [${merged.map((name) => `'${name}'`).join(", ")}]`;
      return lines.join("\n");
    }
    let lastEntry = headerIndex;
    let scan = headerIndex + 1;
    while (scan < lines.length) {
      const line = lines[scan];
      if (/^\s+-\s/u.test(line)) {
        lastEntry = scan;
        scan += 1;
        continue;
      }
      if (line.trim() === "" || /^\s+#/u.test(line)) {
        scan += 1;
        continue;
      }
      break;
    }
    const rendered = additions.map((name) => `  - '${name}'`);
    lines.splice(lastEntry + 1, 0, ...rendered);
    if (lastEntry === headerIndex && scan < lines.length && lines[scan]?.trim() !== "") {
      lines.splice(lastEntry + 1 + rendered.length, 0, "");
    }
    return lines.join("\n");
  }
  const block = [`onlyBuiltDependencies:`, ...additions.map((name) => `  - '${name}'`), ""];
  if (yaml.trim() === "") return `${block.join("\n")}
`;
  const packagesIndex = lines.findIndex((line) => /^packages\s*:/u.test(line));
  if (packagesIndex >= 0) {
    let insertAt = packagesIndex + 1;
    while (insertAt < lines.length && (lines[insertAt].trim() === "" || /^\s+-\s/u.test(lines[insertAt]) || /^\s*#/u.test(lines[insertAt]))) insertAt += 1;
    lines.splice(insertAt, 0, ...block);
    return lines.join("\n");
  }
  return `${[...block, ...lines].join("\n")}`;
}
function readWorkspaceAllowBuilds(yaml) {
  const lines = yaml.split(/\r?\n/u);
  const out = [];
  let inBlock = false;
  for (const line of lines) {
    if (/^allowBuilds\s*:\s*$/u.test(line)) {
      inBlock = true;
      continue;
    }
    if (!inBlock) continue;
    if (line.trim() === "" || /^\s+#/u.test(line)) continue;
    const entry = /^\s+([@A-Za-z0-9][\w@./-]*)\s*:/u.exec(line);
    if (entry !== null) {
      out.push(entry[1]);
      continue;
    }
    inBlock = false;
  }
  return out;
}
function mergeWorkspaceAllowBuilds(yaml, names) {
  if (names.length === 0) return yaml;
  const existing = new Set(readWorkspaceAllowBuilds(yaml));
  const additions = names.filter((name) => !existing.has(name));
  if (additions.length === 0) return yaml;
  const lines = yaml.split(/\r?\n/u);
  const rendered = additions.map((name) => `  ${name}: true`);
  const headerIndex = lines.findIndex((line) => /^allowBuilds\s*:\s*$/u.test(line));
  if (headerIndex >= 0) {
    let scan = headerIndex + 1;
    let lastEntry = headerIndex;
    while (scan < lines.length) {
      const line = lines[scan];
      if (/^\s+[\w@./-]+\s*:/u.test(line)) {
        lastEntry = scan;
        scan += 1;
        continue;
      }
      if (line.trim() === "" || /^\s+#/u.test(line)) {
        scan += 1;
        continue;
      }
      break;
    }
    lines.splice(lastEntry + 1, 0, ...rendered);
    return lines.join("\n");
  }
  const block = ["allowBuilds:", ...rendered, ""];
  if (yaml.trim() === "") return `${block.join("\n")}
`;
  return [...lines, ...block].join("\n");
}
function decideHeal(stderr) {
  if (/approve-builds|Ignored build scripts|removed.*build scripts|onlyBuiltDependencies/u.test(stderr)) {
    return extractBlockedPackages(stderr).length > 0 ? { kind: "approve-builds" } : { kind: "approve-builds-interactive" };
  }
  if (/ETIMEDOUT|ECONNRESET|network timeout|socket hang up|fetch failed|EAI_AGAIN/u.test(stderr)) return { kind: "retry" };
  return { kind: "give-up" };
}
function installDirName(owner, repo) {
  return repo.replace(/[^\w.-]/gu, "_");
}
function collidingDirName(base, now) {
  const pad = (value) => String(value).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${base}-${stamp}`;
}

// src/process-run.ts
import { spawn } from "node:child_process";
var MAX_CAPTURE = 64 * 1024;
var TailBuffer = class {
  constructor(max = MAX_CAPTURE) {
    this.max = max;
  }
  value = "";
  push(text) {
    this.value += text;
    if (this.value.length > this.max) this.value = this.value.slice(-this.max);
  }
  toString() {
    return this.value;
  }
  tail(lines) {
    const parts = this.value.split(/\r?\n/u);
    return parts.slice(-lines).join("\n");
  }
};
function splitLines(chunk, rest, onLine) {
  rest.value += chunk;
  for (; ; ) {
    const index = rest.value.indexOf("\n");
    if (index < 0) break;
    const line = rest.value.slice(0, index).replace(/\r$/u, "");
    rest.value = rest.value.slice(index + 1);
    if (line !== "") onLine(line);
  }
}
function runProcess(command, args, options) {
  const isWindowsScript = /\.cmd$/iu.test(command) || /\.bat$/iu.test(command);
  const shell = process.platform === "win32" && isWindowsScript;
  return new Promise((resolve) => {
    let child;
    try {
      const spawnArgs = shell ? [args.join(" ")] : [...args];
      child = spawn(command, [...spawnArgs], {
        cwd: options.cwd,
        env: options.env === void 0 ? process.env : { ...process.env, ...options.env },
        stdio: ["ignore", "pipe", "pipe"],
        shell,
        windowsHide: true
      });
    } catch (error) {
      resolve({ code: null, signal: null, stdout: "", stderr: "", timedOut: false, spawnError: describeError(error) });
      return;
    }
    const stdout = new TailBuffer();
    const stderr = new TailBuffer();
    let timedOut = false;
    const restOut = { value: "" };
    const restErr = { value: "" };
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout.push(chunk);
      splitLines(chunk, restOut, (line) => options.onLine?.(line, "stdout"));
    });
    child.stderr?.on("data", (chunk) => {
      stderr.push(chunk);
      splitLines(chunk, restErr, (line) => options.onLine?.(line, "stderr"));
    });
    const timer = options.timeoutMs === void 0 ? void 0 : setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs);
    const finish = (code, signal) => {
      if (timer !== void 0) clearTimeout(timer);
      if (restOut.value !== "") options.onLine?.(restOut.value, "stdout");
      if (restErr.value !== "") options.onLine?.(restErr.value, "stderr");
      resolve({
        code,
        signal,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        timedOut
      });
    };
    child.on("error", (error) => {
      finish(null, null);
      stderr.push(`
[spawn error] ${describeError(error)}`);
    });
    child.on("close", finish);
  });
}
function describeError(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

// src/bin-resolve.ts
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
function pathCandidates(name, platform) {
  const pathValue = process.env.PATH ?? "";
  const exts = platform === "win32" ? [".cmd", ".exe", ".bat", ""] : [""];
  const out = [];
  for (const dir of pathValue.split(delimiter)) {
    if (dir === "") continue;
    for (const ext of exts) out.push(join(dir, `${name}${ext}`));
  }
  return out;
}
function findOnPath(name, platform = process.platform) {
  for (const candidate of pathCandidates(name, platform)) {
    if (candidate === "") continue;
    try {
      if (existsSync(candidate)) return candidate;
    } catch {
    }
  }
  return void 0;
}
function resolvePnpm(platform = process.platform) {
  const hit = findOnPath("pnpm", platform);
  if (hit === void 0) return { command: "pnpm", argsPrefix: [] };
  return { command: hit, argsPrefix: [] };
}
function dshCliCandidates(platform = process.platform) {
  const out = [];
  const isWin = platform === "win32";
  if (platform === "darwin" || platform === "linux") {
    out.push("/usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js");
  }
  for (const base of [process.env.NVM_DIR, process.env.FNM_DIR, process.env.VOLTA_HOME]) {
    if (base === void 0) continue;
    out.push(join(base, "versions/node"));
  }
  const nodePrefix = process.execPath;
  const nodeDir = nodePrefix.slice(0, Math.max(nodePrefix.lastIndexOf("/"), nodePrefix.lastIndexOf("\\")));
  out.push(join(nodeDir, isWin ? "node_modules/@deepseek-ai/dsh/lib/bin.js" : "../lib/node_modules/@deepseek-ai/dsh/lib/bin.js"));
  out.push(join(nodeDir, isWin ? "node_modules/@deepseek-ai/dsh/lib/bin.js" : "lib/node_modules/@deepseek-ai/dsh/lib/bin.js"));
  if (process.env.PREFIX !== void 0) {
    out.push(join(process.env.PREFIX, isWin ? "node_modules/@deepseek-ai/dsh/lib/bin.js" : "lib/node_modules/@deepseek-ai/dsh/lib/bin.js"));
  }
  return out;
}
function resolveDsh(platform = process.platform) {
  for (const candidate of dshCliCandidates(platform)) {
    try {
      if (existsSync(candidate)) return { command: process.execPath, argsPrefix: [candidate] };
    } catch {
    }
  }
  const pathHit = findOnPath("dsh", platform);
  if (pathHit !== void 0) return { command: pathHit, argsPrefix: [] };
  return void 0;
}
async function probePnpm(pnpm, cwd) {
  const result = await runProcess(pnpm.command, [...pnpm.argsPrefix, "--version"], { cwd, timeoutMs: 2e4 });
  const version = result.stdout.trim().split(/\r?\n/u).pop();
  return result.code === 0 && version !== "" ? version : void 0;
}

// src/archive.ts
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { join as join2 } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
async function downloadTo(url, destPath, maxBytes = 512 * 1024 * 1024) {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(12e4) });
  if (!response.ok) {
    throw new Error(`\u4E0B\u8F7D\u5931\u8D25 HTTP ${response.status} ${response.statusText} (${url})`);
  }
  const length = Number(response.headers.get("content-length") ?? "0");
  if (length > maxBytes) {
    throw new Error(`\u4E0B\u8F7D\u6587\u4EF6\u8FC7\u5927\uFF1A${length} \u5B57\u8282\uFF08\u4E0A\u9650 ${maxBytes}\uFF09`);
  }
  const body = response.body;
  if (body === null) throw new Error("\u4E0B\u8F7D\u5931\u8D25\uFF1A\u54CD\u5E94\u6CA1\u6709\u5185\u5BB9");
  await mkdir(join2(destPath, ".."), { recursive: true });
  let total = 0;
  const counter = new TransformStream({
    transform(chunk, controller) {
      total += chunk.byteLength;
      if (total > maxBytes) {
        controller.error(new Error(`\u4E0B\u8F7D\u8D85\u8FC7\u5927\u5C0F\u4E0A\u9650 ${maxBytes} \u5B57\u8282`));
        return;
      }
      controller.enqueue(chunk);
    }
  });
  await pipeline(
    Readable.fromWeb(body.pipeThrough(counter)),
    createWriteStream(destPath)
  );
}
async function planFlatten(stagingDir) {
  const entries = (await readdir(stagingDir)).filter((name) => name !== ".DS_Store");
  if (entries.length === 0) {
    throw new Error("\u89E3\u538B\u5931\u8D25\uFF1A\u538B\u7F29\u5305\u5185\u5BB9\u4E3A\u7A7A");
  }
  if (entries.length > 1) {
    return { note: `\u538B\u7F29\u5305\u9876\u5C42\u6709 ${entries.length} \u4E2A\u6761\u76EE\uFF0C\u6309\u6241\u5E73\u5F52\u6863\u5904\u7406\uFF08\u4E0D\u5D4C\u5957\uFF09` };
  }
  const single = entries[0];
  const { stat } = await import("node:fs/promises");
  const info = await stat(join2(stagingDir, single));
  if (!info.isDirectory()) {
    return { note: `\u538B\u7F29\u5305\u9876\u5C42\u662F\u5355\u4E2A\u6587\u4EF6 ${single}\uFF0C\u6309\u6241\u5E73\u5F52\u6863\u5904\u7406` };
  }
  const children = await readdir(join2(stagingDir, single));
  if (children.length === 0) {
    throw new Error("\u538B\u7F29\u5305\u5185\u7684\u9879\u76EE\u6587\u4EF6\u5939\u662F\u7A7A\u7684");
  }
  return {
    rootToMove: join2(stagingDir, single),
    note: `\u68C0\u6D4B\u5230 GitHub \u5F52\u6863\u5305\u88C5\u76EE\u5F55 ${single}/\uFF0C\u5DF2\u6241\u5E73\u5316\uFF08\u70B9\u8FDB\u53BB\u5C31\u662F\u9879\u76EE\uFF09`
  };
}
async function extractZip(platform, zipPath, stagingDir, onLine) {
  await mkdir(stagingDir, { recursive: true });
  const cmd = unzipCommand(platform, zipPath, stagingDir);
  const result = await runProcess(cmd.command, cmd.args, {
    cwd: stagingDir,
    timeoutMs: 18e4,
    onLine: (line) => onLine?.(line)
  });
  if (result.code !== 0) {
    const detail = result.stderr.trim() !== "" ? result.stderr.trim() : `exit code ${String(result.code)}`;
    throw new Error(`\u89E3\u538B\u5931\u8D25\uFF1A${detail}`);
  }
}
async function materialize(plan, stagingDir, finalDir) {
  if (plan.rootToMove === void 0) {
    await rename(stagingDir, finalDir);
    return;
  }
  await rename(plan.rootToMove, finalDir);
  await rm(stagingDir, { recursive: true, force: true });
}
async function detectPluginDir(dir) {
  try {
    const entries = await readdir(dir);
    if (!entries.includes("package.json")) return void 0;
    const { readFile: readFile2 } = await import("node:fs/promises");
    const raw = await readFile2(join2(dir, "package.json"), "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return void 0;
    const name = parsed.name;
    return typeof name === "string" && name !== "" ? name : void 0;
  } catch {
    return void 0;
  }
}

// src/installer.ts
var LOG_TAIL_LINES = 120;
var MAX_JOBS = 50;
var PNPM_TIMEOUT_MS = 15 * 60 * 1e3;
var REGISTER_TIMEOUT_MS = 300 * 1e3;
var LIST_TAIL = 20;
var jobCounter = 0;
function currentPlatformId() {
  const p = process.platform;
  return p === "win32" || p === "darwin" || p === "linux" ? p : "other";
}
function zipFileName(target) {
  const rawRef = "ref" in target ? target.ref : "HEAD";
  const ref = rawRef.replace(/[^\w.-]/gu, "-") || "HEAD";
  return `${installDirName(target.owner, target.repo)}-${ref}.zip`;
}
function mergePackageAllowList(packageJson, names) {
  let parsed;
  try {
    parsed = JSON.parse(packageJson);
  } catch {
    return packageJson;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return packageJson;
  const pnpm = parsed.pnpm ?? {};
  const existingList = Array.isArray(pnpm.onlyBuiltDependencies) ? pnpm.onlyBuiltDependencies.filter((entry) => typeof entry === "string") : [];
  const merged = [.../* @__PURE__ */ new Set([...existingList, ...names])];
  const next = { ...parsed, pnpm: { ...pnpm, onlyBuiltDependencies: merged } };
  return `${JSON.stringify(next, null, 2)}
`;
}
function splitSimpleArgs(value) {
  return value.split(/\s+/u).filter((piece) => piece !== "");
}
function tailOf(text, lines = 40) {
  const parts = text.trim().split(/\r?\n/u);
  return parts.slice(-lines).join("\n").trim();
}
function describeUrlError(error) {
  const key = error?.messageKey;
  if (typeof key === "string") {
    const rawDetail = error.detail;
    const detail = typeof rawDetail === "string" ? rawDetail : "";
    switch (key) {
      case "emptyInput":
        return "\u8BF7\u8F93\u5165 GitHub \u9879\u76EE\u94FE\u63A5\u6216 owner/repo \u7B80\u5199";
      case "badProtocol":
        return `\u4EC5\u652F\u6301 http(s) \u94FE\u63A5\uFF0C\u6536\u5230\u534F\u8BAE\uFF1A${detail}`;
      case "badHost":
        return `\u4EC5\u652F\u6301 github.com \u9879\u76EE\u94FE\u63A5\uFF0C\u6536\u5230\uFF1A${detail}`;
      case "badPath":
        return `\u65E0\u6CD5\u8BC6\u522B\u7684 GitHub \u94FE\u63A5\u8DEF\u5F84\uFF1A${detail}`;
      case "badOwner":
        return `\u65E0\u6548\u7684 GitHub \u7528\u6237\u540D\uFF1A${detail}`;
      case "badRepo":
        return `\u65E0\u6548\u7684 GitHub \u4ED3\u5E93\u540D\uFF1A${detail}`;
      case "badShorthand":
        return `\u65E0\u6CD5\u8BC6\u522B\u7684 GitHub \u7B80\u5199\uFF1A${detail}\uFF08\u793A\u4F8B\uFF1Aowner/repo \u6216 owner/repo@v1.0.0\uFF09`;
      default:
        return describeError(error);
    }
  }
  return describeError(error);
}
async function assertZipMagic(zipPath) {
  const handle = await open(zipPath, "r");
  try {
    const buffer = Buffer.alloc(2);
    await handle.read(buffer, 0, 2, 0);
    if (!(buffer[0] === 80 && buffer[1] === 75)) {
      throw new Error("\u4E0B\u8F7D\u7684\u5185\u5BB9\u4E0D\u662F\u6709\u6548\u7684 zip \u538B\u7F29\u5305\uFF08\u53EF\u80FD\u662F GitHub \u7684 404 \u9875\u9762\u6216\u7F51\u7EDC\u9519\u8BEF\u9875\uFF09");
    }
  } finally {
    await handle.close();
  }
}
async function resolveWorkRoot(configured, env) {
  const raw = configured.trim();
  if (raw !== "" && !isAbsolute(raw)) {
    throw new Error(`\u8BBE\u7F6E\u7684\u5DE5\u4F5C\u76EE\u5F55\u4E0D\u662F\u7EDD\u5BF9\u8DEF\u5F84\uFF1A${raw}\uFF08\u53EF\u5728\u8BBE\u7F6E\u4E2D\u7559\u7A7A\u4EE5\u4F7F\u7528\u7CFB\u7EDF\u9ED8\u8BA4\u4E0B\u8F7D\u76EE\u5F55\uFF09`);
  }
  const dir = raw !== "" ? raw : downloadsDir(env);
  await mkdir2(dir, { recursive: true });
  return dir;
}
function chooseInstallDir(workRoot, target) {
  const base = installDirName(target.owner, target.repo);
  if (!existsSync2(join3(workRoot, base))) return join3(workRoot, base);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = collidingDirName(base, new Date(Date.now() + attempt * 1e3));
    if (!existsSync2(join3(workRoot, candidate))) return join3(workRoot, candidate);
  }
  return join3(workRoot, collidingDirName(base, /* @__PURE__ */ new Date()));
}
async function writeBuildAllowList(projectDir, names, pnpmMajor) {
  const workspacePath = join3(projectDir, "pnpm-workspace.yaml");
  if (existsSync2(workspacePath)) {
    const original2 = await readFile(workspacePath, "utf8");
    let merged2;
    let where;
    if (/^allowBuilds\s*:/mu.test(original2)) {
      merged2 = mergeWorkspaceAllowBuilds(original2, names);
      where = "pnpm-workspace.yaml\uFF08allowBuilds\uFF0Cpnpm 11 \u8BED\u6CD5\uFF09";
    } else if (/^onlyBuiltDependencies\s*:/mu.test(original2)) {
      merged2 = mergeWorkspaceAllowList(original2, names);
      where = "pnpm-workspace.yaml\uFF08onlyBuiltDependencies\uFF0Cpnpm \u226410 \u8BED\u6CD5\uFF09";
    } else if (pnpmMajor >= 11) {
      merged2 = mergeWorkspaceAllowBuilds(original2, names);
      where = "pnpm-workspace.yaml\uFF08allowBuilds\uFF0Cpnpm 11 \u8BED\u6CD5\uFF09";
    } else {
      merged2 = mergeWorkspaceAllowList(original2, names);
      where = "pnpm-workspace.yaml\uFF08onlyBuiltDependencies\uFF0Cpnpm \u226410 \u8BED\u6CD5\uFF09";
    }
    if (merged2 !== original2) await writeFile(workspacePath, merged2, "utf8");
    return where;
  }
  const packageJsonPath = join3(projectDir, "package.json");
  let original;
  try {
    original = await readFile(packageJsonPath, "utf8");
  } catch (error) {
    throw new Error(`\u81EA\u52A8\u5904\u7406\u6784\u5EFA\u811A\u672C\u5931\u8D25\uFF1A\u9879\u76EE\u91CC\u6CA1\u6709 pnpm-workspace.yaml\uFF0C\u4E5F\u8BFB\u4E0D\u5230 package.json\uFF08${describeError(error)}\uFF09`);
  }
  const merged = mergePackageAllowList(original, names);
  if (merged === original) {
    throw new Error("\u81EA\u52A8\u5904\u7406\u6784\u5EFA\u811A\u672C\u5931\u8D25\uFF1Apackage.json \u4E0D\u662F\u6709\u6548\u7684 JSON\uFF0C\u65E0\u6CD5\u5199\u5165 pnpm.onlyBuiltDependencies");
  }
  await writeFile(packageJsonPath, merged, "utf8");
  return "package.json\uFF08pnpm.onlyBuiltDependencies\uFF09";
}
var _updateSettings_dec, _getSettings_dec, _dismiss_dec, _cancel_dec, _list_dec, _start_dec, _a, _init;
var GhInstallRuntime = class extends (_a = TypertRemoteService, _start_dec = [Remote], _list_dec = [Remote], _cancel_dec = [Remote], _dismiss_dec = [Remote], _getSettings_dec = [Remote], _updateSettings_dec = [Remote], _a) {
  constructor(ctx, readSettings, writeSettings) {
    super(ctx, "ghInstall");
    this.readSettings = readSettings;
    this.writeSettings = writeSettings;
    __runInitializers(_init, 5, this);
    __publicField(this, "jobs", /* @__PURE__ */ new Map());
    __publicField(this, "runningId");
    __publicField(this, "pumping", false);
  }
  async start(request) {
    const url = request.url.trim();
    const requestedProfile = request.profile?.trim() ?? "";
    const now = Date.now();
    for (const existing of this.jobs.values()) {
      if (existing.url === url && (existing.phase === "queued" || this.runningId === existing.id)) {
        this.log(existing, existing.phase, "\u68C0\u6D4B\u5230\u76F8\u540C\u94FE\u63A5\u7684\u4EFB\u52A1\u6B63\u5728\u8FDB\u884C\u4E2D\uFF0C\u672C\u6B21\u8BF7\u6C42\u5408\u5E76\u5230\u73B0\u6709\u4EFB\u52A1");
        return this.wireJob(existing);
      }
    }
    const job = {
      id: `ghpi-${Date.now()}-${jobCounter += 1}`,
      url,
      label: url,
      phase: "queued",
      createdAt: now,
      updatedAt: now,
      logs: [],
      requestedProfile
    };
    try {
      parseGitHubTarget(url);
    } catch (error) {
      const message = describeUrlError(error);
      job.phase = "failed";
      job.result = { ok: false, error: message, failedPhase: "queued" };
      this.log(job, "queued", `\u5931\u8D25\uFF1A${message}`, "stderr");
      this.jobs.set(job.id, job);
      this.pruneHistory();
      return this.wireJob(job);
    }
    if (requestedProfile !== "" && !/^[a-z0-9-]+$/u.test(requestedProfile)) {
      const message = `profile \u540D\u79F0\u4E0D\u5408\u6CD5\uFF1A${requestedProfile}\uFF08\u53EA\u5141\u8BB8\u5C0F\u5199\u5B57\u6BCD\u3001\u6570\u5B57\u548C\u8FDE\u5B57\u7B26\uFF09`;
      job.phase = "failed";
      job.result = { ok: false, error: message, failedPhase: "queued" };
      this.log(job, "queued", `\u5931\u8D25\uFF1A${message}`, "stderr");
      this.jobs.set(job.id, job);
      this.pruneHistory();
      return this.wireJob(job);
    }
    this.jobs.set(job.id, job);
    this.pruneHistory();
    if (this.pumping) this.log(job, "queued", "\u5DF2\u6709\u5B89\u88C5\u4EFB\u52A1\u5728\u6267\u884C\uFF0C\u5F53\u524D\u4EFB\u52A1\u6392\u961F\u7B49\u5F85\uFF08\u5355\u8F66\u9053\uFF09");
    void this.pump();
    return this.wireJob(job);
  }
  async list() {
    return this.snapshot();
  }
  async cancel(input) {
    const job = this.jobs.get(input.id);
    if (job !== void 0 && job.phase === "queued") {
      job.phase = "failed";
      job.updatedAt = Date.now();
      job.result = { ok: false, error: "\u4EFB\u52A1\u5DF2\u53D6\u6D88\uFF08\u5C1A\u672A\u5F00\u59CB\u6267\u884C\uFF09", failedPhase: "queued" };
      this.log(job, "queued", "\u4EFB\u52A1\u5DF2\u88AB\u7528\u6237\u53D6\u6D88");
    }
    return this.snapshot();
  }
  async dismiss(input) {
    const job = this.jobs.get(input.id);
    if (job !== void 0 && (job.phase === "done" || job.phase === "failed") && this.runningId !== job.id) {
      this.jobs.delete(input.id);
    }
    return this.snapshot();
  }
  getSettings() {
    return this.readSettings();
  }
  async updateSettings(update) {
    validateSettingsUpdate(update);
    await this.writeSettings(update);
    return this.readSettings();
  }
  /* ---------------- internals ---------------- */
  snapshot() {
    const jobs = [...this.jobs.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, LIST_TAIL).map((job) => this.wireJob(job));
    return { jobs, runningId: this.runningId };
  }
  wireJob(job) {
    return {
      id: job.id,
      url: job.url,
      label: job.label,
      phase: job.phase,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      logs: [...job.logs],
      result: job.result
    };
  }
  pruneHistory() {
    if (this.jobs.size <= MAX_JOBS) return;
    const terminal = [...this.jobs.values()].filter((job) => job.phase === "done" || job.phase === "failed").sort((a, b) => a.createdAt - b.createdAt);
    const excess = this.jobs.size - MAX_JOBS;
    for (const job of terminal.slice(0, excess)) this.jobs.delete(job.id);
  }
  log(job, phase, text, stream = "info") {
    const line = text.trim();
    if (line === "") return;
    job.logs.push({ at: Date.now(), phase, text: line, stream });
    if (job.logs.length > LOG_TAIL_LINES) job.logs.splice(0, job.logs.length - LOG_TAIL_LINES);
    job.updatedAt = Date.now();
  }
  setPhase(job, phase, note) {
    job.phase = phase;
    job.updatedAt = Date.now();
    if (note !== void 0) this.log(job, phase, note);
  }
  /** The single-lane worker: runs queued jobs strictly one at a time. */
  async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      for (; ; ) {
        const next = [...this.jobs.values()].find((job) => job.phase === "queued");
        if (next === void 0) break;
        this.runningId = next.id;
        await this.runJob(next);
        this.runningId = void 0;
      }
    } finally {
      this.pumping = false;
    }
    if ([...this.jobs.values()].some((job) => job.phase === "queued")) await this.pump();
  }
  async runJob(job) {
    const settings = this.readSettings();
    const env = { platform: currentPlatformId(), env: process.env };
    let failedPhase = "queued";
    let stagingDir;
    let zipPath;
    let finalDir;
    try {
      failedPhase = "downloading";
      this.setPhase(job, "downloading", "\u89E3\u6790 GitHub \u5730\u5740\u2026");
      const target = parseGitHubTarget(job.url);
      job.label = targetLabel(target);
      this.log(job, "downloading", `\u76EE\u6807\u9879\u76EE\uFF1A${job.label}`);
      const workRoot = await resolveWorkRoot(settings.workRoot, env);
      this.log(job, "downloading", `\u4E0B\u8F7D/\u5DE5\u4F5C\u76EE\u5F55\uFF1A${workRoot}`);
      zipPath = join3(workRoot, zipFileName(target));
      const candidates = [codeloadZipUrl(target), archiveZipUrl(target)];
      let downloaded = false;
      let lastError;
      for (const url of candidates) {
        try {
          this.log(job, "downloading", `\u4E0B\u8F7D ${url}`);
          await downloadTo(url, zipPath);
          await assertZipMagic(zipPath);
          downloaded = true;
          break;
        } catch (error) {
          lastError = error;
          this.log(job, "downloading", `\u4E0B\u8F7D\u5730\u5740\u4E0D\u53EF\u7528\uFF1A${describeError(error)}`, "stderr");
        }
      }
      if (!downloaded) {
        throw new Error(`\u4E0B\u8F7D\u5931\u8D25\uFF08\u5DF2\u5C1D\u8BD5 ${candidates.length} \u4E2A\u4E0B\u8F7D\u5730\u5740\uFF09\uFF1A${describeError(lastError)}\u3002\u8BF7\u68C0\u67E5\u7F51\u7EDC\u8FDE\u63A5\uFF0C\u6216\u786E\u8BA4\u4ED3\u5E93 / \u5206\u652F / \u6807\u7B7E\u786E\u5B9E\u5B58\u5728\u3002`);
      }
      this.log(job, "downloading", `zip \u5DF2\u4FDD\u5B58\u5230 ${zipPath}`);
      failedPhase = "extracting";
      this.setPhase(job, "extracting");
      stagingDir = join3(workRoot, `.gh-tmp-${job.id}`);
      await rm2(stagingDir, { recursive: true, force: true });
      await extractZip(env.platform, zipPath, stagingDir, (line) => this.log(job, "extracting", line, "stdout"));
      const plan = await planFlatten(stagingDir);
      this.log(job, "extracting", plan.note);
      finalDir = chooseInstallDir(workRoot, target);
      try {
        await materialize(plan, stagingDir, finalDir);
      } catch (error) {
        throw new Error(`\u65E0\u6CD5\u628A\u9879\u76EE\u653E\u5230 ${finalDir}\uFF1A${describeError(error)}`);
      }
      stagingDir = void 0;
      this.log(job, "extracting", `\u9879\u76EE\u76EE\u5F55\uFF1A${finalDir}`);
      const pkgName = await detectPluginDir(finalDir);
      if (pkgName === void 0) {
        this.log(job, "extracting", "\u63D0\u793A\uFF1Apackage.json \u7F3A\u5C11 name \u5B57\u6BB5\u6216\u4E0D\u53EF\u8BFB\uFF0C\u5C06\u7EE7\u7EED\u5C1D\u8BD5\u5B89\u88C5", "stderr");
      } else {
        this.log(job, "extracting", `\u63D2\u4EF6\u5305\u540D\uFF1A${pkgName}`);
      }
      if (!existsSync2(join3(finalDir, "package.json"))) {
        throw new Error(`\u89E3\u538B\u540E\u7684\u76EE\u5F55 ${finalDir} \u91CC\u6CA1\u6709 package.json\uFF0C\u65E0\u6CD5\u5B89\u88C5\uFF08\u8BF7\u786E\u8BA4\u94FE\u63A5\u6307\u5411\u63D2\u4EF6\u9879\u76EE\u6839\u76EE\u5F55\uFF09`);
      }
      failedPhase = "installing";
      this.setPhase(job, "installing");
      const pnpm = resolvePnpm(env.platform);
      const pnpmVersion = await probePnpm(pnpm, finalDir);
      const pnpmMajor = pnpmVersion === void 0 ? 11 : Number.parseInt(pnpmVersion.split(".")[0] ?? "", 10) || 11;
      this.log(job, "installing", pnpmVersion === void 0 ? "\u672A\u63A2\u6D4B\u5230 pnpm \u7248\u672C\uFF0C\u4ECD\u5C06\u5C1D\u8BD5 pnpm install" : `\u4F7F\u7528 pnpm ${pnpmVersion}`);
      const installArgs = ["install", ...splitSimpleArgs(settings.pnpmInstallArgs)];
      const projectHasWorkspace = existsSync2(join3(finalDir, "pnpm-workspace.yaml"));
      if (!projectHasWorkspace) installArgs.push("--ignore-workspace");
      await this.runPnpmPhase(job, "installing", pnpm, installArgs, finalDir, pnpmMajor);
      failedPhase = "building";
      const buildScript = await readBuildScript(finalDir);
      if (buildScript === void 0) {
        this.setPhase(job, "building", "package.json \u6CA1\u6709 build \u811A\u672C\uFF0C\u8DF3\u8FC7\u6784\u5EFA");
      } else {
        this.setPhase(job, "building", `pnpm run build\uFF08\u811A\u672C\uFF1A${buildScript}\uFF09`);
        const buildArgs = ["run", "build", ...splitSimpleArgs(settings.pnpmBuildArgs)];
        await this.runPnpmPhase(job, "building", pnpm, buildArgs, finalDir, pnpmMajor);
      }
      failedPhase = "registering";
      this.setPhase(job, "registering");
      const profile = job.requestedProfile !== "" ? job.requestedProfile : settings.profile.trim() !== "" ? settings.profile.trim() : "web";
      if (!/^[a-z0-9-]+$/u.test(profile)) {
        throw new Error(`profile \u540D\u79F0\u4E0D\u5408\u6CD5\uFF1A${profile}\uFF08\u53EA\u5141\u8BB8\u5C0F\u5199\u5B57\u6BCD\u3001\u6570\u5B57\u548C\u8FDE\u5B57\u7B26\uFF09`);
      }
      const dsh = resolveDsh(env.platform);
      if (dsh === void 0) {
        throw new Error("\u672A\u627E\u5230 dsh CLI\uFF1A\u65E0\u6CD5\u6267\u884C dsh plugin add\u3002\u8BF7\u786E\u8BA4 dsh \u5DF2\u5168\u5C40\u5B89\u88C5\u3002");
      }
      this.log(job, "registering", `\u6CE8\u518C\u63D2\u4EF6\uFF1Adsh plugin --profile ${profile} add link:${finalDir}`);
      const registered = await runProcess(dsh.command, [...dsh.argsPrefix, "plugin", "--profile", profile, "add", `link:${finalDir}`], {
        cwd: finalDir,
        timeoutMs: REGISTER_TIMEOUT_MS,
        onLine: (line, stream) => this.log(job, "registering", line, stream)
      });
      if (registered.code !== 0) {
        const detail = registered.stderr.trim() !== "" ? registered.stderr : registered.stdout;
        throw new Error(`dsh plugin add \u5931\u8D25\uFF08\u9000\u51FA\u7801 ${String(registered.code)}\uFF09\uFF1A
${tailOf(detail, 10)}`);
      }
      this.log(job, "registering", `\u63D2\u4EF6\u5DF2\u5199\u5165 profile\u300C${profile}\u300D\uFF0C\u91CD\u542F dsh web \u540E\u751F\u6548`);
      this.setPhase(job, "done", `\u5B89\u88C5\u5B8C\u6210\uFF1A${finalDir}\uFF08profile\uFF1A${profile}\uFF09\u3002\u91CD\u542F dsh web \u540E\u63D2\u4EF6\u751F\u6548\u3002`);
      job.result = { ok: true, pluginDir: finalDir, profile };
      if (!settings.keepZip && zipPath !== void 0) {
        await rm2(zipPath, { force: true });
        this.log(job, "done", `\u5DF2\u6309\u8BBE\u7F6E\u5220\u9664\u4E0B\u8F7D\u7684 zip\uFF08\u4FDD\u7559\u53EF\u5728\u8BBE\u7F6E\u4E2D\u5F00\u542F\uFF09`);
      }
    } catch (error) {
      const message = describeError(error);
      this.log(job, failedPhase, `\u5931\u8D25\uFF1A${message}`, "stderr");
      job.phase = "failed";
      job.updatedAt = Date.now();
      job.result = { ok: false, error: message, failedPhase };
    } finally {
      if (stagingDir !== void 0) await rm2(stagingDir, { recursive: true, force: true });
      this.pruneHistory();
    }
  }
  /**
   * One pnpm phase with the approve-builds / network healing ladder (NOTES
   * §2.7): on an approve-builds signal the blocked packages are parsed and
   * written into the allow list, then the phase runs again — once. Network
   * errors retry once. Everything else surfaces the output tail.
   */
  async runPnpmPhase(job, phase, pnpm, baseArgs, cwd, pnpmMajor) {
    const label = phase === "installing" ? "pnpm install" : "pnpm run build";
    const attempt = () => runProcess(pnpm.command, [...pnpm.argsPrefix, ...baseArgs], {
      cwd,
      timeoutMs: PNPM_TIMEOUT_MS,
      onLine: (line, stream) => this.log(job, phase, line, stream)
    });
    const first = await attempt();
    const failed = (detail) => new Error(`${label} \u5931\u8D25\uFF1A${detail}`);
    if (first.spawnError !== void 0) {
      throw failed(`\u65E0\u6CD5\u542F\u52A8 pnpm\uFF08${first.spawnError}\uFF09\u3002\u8BF7\u786E\u8BA4 pnpm \u5DF2\u5168\u5C40\u5B89\u88C5\uFF08npm i -g pnpm\uFF09\u3002`);
    }
    if (first.code === 0) {
      const skipped = extractBlockedPackages(`${first.stderr}
${first.stdout}`);
      if (skipped.length > 0) {
        const where = await writeBuildAllowList(cwd, skipped, pnpmMajor);
        this.log(job, phase, `pnpm \u8DF3\u8FC7\u4E86\u4F9D\u8D56\u6784\u5EFA\u811A\u672C\uFF08${skipped.join("\u3001")}\uFF09\uFF0C\u5DF2\u5199\u5165 ${where} \u5E76\u91CD\u65B0\u6267\u884C`);
        const retried = await attempt();
        if (retried.code !== 0) {
          throw failed(`\u5199\u5165\u6784\u5EFA\u767D\u540D\u5355\uFF08${where}\uFF09\u5E76\u91CD\u8BD5\u540E\u4ECD\u5931\u8D25\uFF08\u9000\u51FA\u7801 ${String(retried.code)}\uFF09\uFF1A
${tailOf(`${retried.stderr}
${retried.stdout}`)}`);
        }
        this.log(job, phase, `${label} \u5B8C\u6210\uFF08\u6784\u5EFA\u811A\u672C\u5DF2\u6CBB\u6108\uFF09`);
      }
      return;
    }
    const output = `${first.stderr}
${first.stdout}`;
    const action = decideHeal(output);
    if (action.kind === "approve-builds-interactive") {
      throw failed(`pnpm \u8981\u6C42\u4EA4\u4E92\u5F0F\u786E\u8BA4\u4F9D\u8D56\u6784\u5EFA\u811A\u672C\uFF0C\u4E14\u65E0\u6CD5\u81EA\u52A8\u8BC6\u522B\u6D89\u53CA\u7684\u5305\u540D\u3002\u539F\u59CB\u8F93\u51FA\uFF1A
${tailOf(output)}`);
    }
    if (action.kind === "approve-builds") {
      const blocked = extractBlockedPackages(output);
      if (blocked.length > 0) {
        this.log(job, phase, `pnpm \u963B\u6B62\u4E86\u4EE5\u4E0B\u4F9D\u8D56\u7684\u6784\u5EFA\u811A\u672C\uFF1A${blocked.join("\u3001")}\uFF1B\u6B63\u5728\u5199\u5165\u6784\u5EFA\u767D\u540D\u5355\u5E76\u91CD\u8BD5`);
        const where = await writeBuildAllowList(cwd, blocked, pnpmMajor);
        this.log(job, phase, `\u5DF2\u5199\u5165 ${where}\uFF0C\u91CD\u65B0\u6267\u884C ${label}`);
        const retried = await attempt();
        if (retried.code !== 0) {
          throw failed(`\u5199\u5165\u6784\u5EFA\u767D\u540D\u5355\uFF08${where}\uFF09\u5E76\u91CD\u8BD5\u540E\u4ECD\u5931\u8D25\uFF08\u9000\u51FA\u7801 ${String(retried.code)}\uFF09\uFF1A
${tailOf(`${retried.stderr}
${retried.stdout}`)}`);
        }
        this.log(job, phase, `${label} \u5B8C\u6210\uFF08\u6784\u5EFA\u811A\u672C\u5DF2\u6CBB\u6108\uFF09`);
        return;
      }
    }
    if (action.kind === "retry") {
      this.log(job, phase, "\u68C0\u6D4B\u5230\u7F51\u7EDC\u9519\u8BEF\uFF0C\u81EA\u52A8\u91CD\u8BD5\u4E00\u6B21");
      const retried = await attempt();
      if (retried.code !== 0) {
        throw failed(`\u7F51\u7EDC\u91CD\u8BD5\u540E\u4ECD\u5931\u8D25\uFF08\u9000\u51FA\u7801 ${String(retried.code)}\uFF09\uFF1A
${tailOf(`${retried.stderr}
${retried.stdout}`)}`);
      }
      this.log(job, phase, `${label} \u5B8C\u6210\uFF08\u7F51\u7EDC\u91CD\u8BD5\u6210\u529F\uFF09`);
      return;
    }
    throw failed(`\u9000\u51FA\u7801 ${String(first.code)}\uFF1A
${tailOf(output)}`);
  }
};
_init = __decoratorStart(_a);
__decorateElement(_init, 1, "start", _start_dec, GhInstallRuntime);
__decorateElement(_init, 1, "list", _list_dec, GhInstallRuntime);
__decorateElement(_init, 1, "cancel", _cancel_dec, GhInstallRuntime);
__decorateElement(_init, 1, "dismiss", _dismiss_dec, GhInstallRuntime);
__decorateElement(_init, 1, "getSettings", _getSettings_dec, GhInstallRuntime);
__decorateElement(_init, 1, "updateSettings", _updateSettings_dec, GhInstallRuntime);
__decoratorMetadata(_init, GhInstallRuntime);
async function readBuildScript(dir) {
  try {
    const raw = await readFile(join3(dir, "package.json"), "utf8");
    const parsed = JSON.parse(raw);
    return typeof parsed.scripts?.build === "string" && parsed.scripts.build !== "" ? parsed.scripts.build : void 0;
  } catch {
    return void 0;
  }
}
function validateSettingsUpdate(update) {
  if (update.field === "profile") {
    if (!/^[a-z0-9-]*$/u.test(update.value)) {
      throw new Error(`profile \u540D\u79F0\u53EA\u80FD\u5305\u542B\u5C0F\u5199\u5B57\u6BCD\u3001\u6570\u5B57\u548C\u8FDE\u5B57\u7B26\uFF0C\u6536\u5230\uFF1A${update.value}`);
    }
    return;
  }
  if (update.field === "workRoot") {
    const value = update.value.trim();
    if (value !== "" && !isAbsolute(value)) {
      throw new Error(`\u5DE5\u4F5C\u76EE\u5F55\u5FC5\u987B\u662F\u7EDD\u5BF9\u8DEF\u5F84\uFF08\u7559\u7A7A\u5219\u4F7F\u7528\u7CFB\u7EDF\u9ED8\u8BA4\u4E0B\u8F7D\u76EE\u5F55\uFF09\uFF0C\u6536\u5230\uFF1A${update.value}`);
    }
  }
}
export {
  GhInstallRuntime,
  currentPlatformId,
  describeUrlError,
  mergePackageAllowList,
  mergeWorkspaceAllowBuilds,
  readWorkspaceAllowBuilds,
  splitSimpleArgs,
  tailOf,
  zipFileName
};
