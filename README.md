# dsh-ghplugininstall（gh插件安装）

一个 dsh web 插件：在设置页提供「gh插件安装」入口。粘贴 GitHub 项目链接，
一键完成 **下载 zip → 解压扁平化 → pnpm i（自动治愈 approve-builds）→ pnpm run build → `dsh plugin --profile web add` 注册**。
任何一步失败都会在设置页内联显示原因，并通过 toast 弹出具体错误。

> ⚠️ **安装成功后需要重启 `dsh web` 一次**，插件才会出现在设置页并生效。
> 这是 dsh 加载 client 插件的机制决定的（client bundle 在 web 进程启动时装载），不是缺陷。

---

## 功能

- **一键安装**：粘贴链接即可，支持多种 GitHub 链接形态（见下）。
- **进度可视**：排队 → 下载 zip → 解压并扁平化 → 安装依赖 (pnpm i) → 构建 (pnpm run build) → 注册插件，五阶段进度条 + 实时日志尾部（保留 120 行）。
- **失败可诊断**：设置页历史记录可展开失败原因与日志尾部；toast 点击可展开完整失败详情。
- **真实链路已验证**：开发期用真实网络 e2e（`pnpm run e2e:host`，目标仓库 Electricitysheep/dsh-handbook）驱动过完整 host 流水线——默认分支 `/zip/HEAD` 下载 200、zip 落 `~/Downloads`、归档包装目录自动扁平化（点进去就是项目）、并对无 package.json 的仓库在解压阶段给出中文具体原因。
- **approve-builds 自动治愈**：pnpm 阻止/跳过依赖构建脚本时，自动解析包名并写入 `pnpm-workspace.yaml` 的 `allowBuilds:`（pnpm 11）或 `onlyBuiltDependencies:`（pnpm ≤10），无 workspace 时写 package.json 的 `pnpm.onlyBuiltDependencies`，然后自动重跑一次。网络类错误也会自动重试一次。
- **扁平化解压**：GitHub 归档自带的 `<repo>-<ref>/` 包装目录会被去掉，解压后点进去就是项目根目录。
- **单车道执行**：同一时刻只运行一个安装任务（pnpm / `dsh plugin add` 不能并发写 profile），后续任务自动排队。
- **失败提示中文化**：URL 非法、下载 404、内容不是 zip、解压失败、目录冲突、pnpm 失败、dsh 未找到、注册失败等每条失败路径都给出带具体原因的中文提示。

## 支持的链接形态

| 形态 | 示例 |
|---|---|
| 仓库主页 / .git | `https://github.com/owner/repo`、`https://github.com/owner/repo.git` |
| Code → Download ZIP 直链 | `https://github.com/owner/repo/archive/refs/heads/main.zip`、`…/refs/tags/v1.0.0.tar.gz` |
| 分支 / 标签页面 | `https://github.com/owner/repo/tree/main`、`/tree/v1.2.3` |
| Release 标签页 | `https://github.com/owner/repo/releases/tag/v1.0.0` |
| owner/repo 简写 | `owner/repo`、`owner/repo@v1.0.0`、`owner/repo@a1b2c3d` |
| CLI 风格前缀 | `github:owner/repo` |

仅接受 `github.com` / `www.github.com`；下载只会请求 `codeload.github.com` 与 `github.com` 的 zip 地址（owner/repo/ref 均经白名单字符校验与 URL 编码），单文件上限 512 MB，下载超时 120 秒。

## 使用方法

### 0. 前置要求

- dsh ≥ 0.1.1-rc.1（本插件在 0.1.1-rc.2 上开发验证）；
- **pnpm** 已全局安装（`npm i -g pnpm`）——安装与构建阶段依赖它；
- 目标平台：macOS / Linux / Windows（解压分别用 ditto / unzip / PowerShell Expand-Archive）。

### 1. 安装本插件（一次性）

```bash
dsh plugin --profile web add /path/to/dsh-ghPluginInstall
```

### 2. 重启 dsh web（仅一次）

插件 client 半在 web 进程启动时装载。安装/更新本插件后重启一次 dsh web。

### 3. 开始安装

1. 打开 web 设置弹窗 → 左侧导航 **「gh插件安装」**；
2. 粘贴 GitHub 链接（或 `owner/repo`），点击 **开始安装**（或直接回车）；
3. 观察五阶段进度与日志尾部；失败时 toast 会弹出具体原因，点击 toast 或在历史记录里展开可看完整错误与日志；
4. 安装成功后，toast 与历史记录都会提示 **「重启 dsh web 后生效」**——这是要让**新装的目标插件**出现在 web 里所需的最后一步。

### 4. 高级选项

- **目标 profile**：留空默认 `web`；只允许小写字母、数字、连字符。会执行 `dsh plugin --profile <名> add link:<项目目录>`。
- 设置页所属命名空间 `gh-plugin-install` 还提供（经 Remote 的 `getSettings/updateSettings` 管理）：
  - `workRoot`：下载与工作目录，留空 = 系统默认下载目录（macOS/Linux `~/Downloads`，Windows `%UserProfile%\Downloads`；尊重 `XDG_DOWNLOAD_DIR`）；
  - `pnpmInstallArgs` / `pnpmBuildArgs`：传给 `pnpm install` / `pnpm run build` 的额外参数（按空白切分）；
  - `keepZip`：成功后是否保留下载的 zip（默认不保留，成功即删）。

## 常见失败与自助排查

| 现象 | 原因与处理 |
|---|---|
| 「无法启动 pnpm…请确认 pnpm 已全局安装」 | 未安装 pnpm：`npm i -g pnpm` 后重试。 |
| 「下载失败（已尝试 2 个下载地址）…」 | 网络不通或仓库/分支/标签不存在。检查网络，确认链接在浏览器里能打开；404 页面会被 PK 魔数校验拦下并提示「下载的内容不是有效的 zip 压缩包」。 |
| 「仅支持 github.com 项目链接，收到：…」 | 粘贴了非 GitHub 链接。不支持 GitLab 等其它平台，也不支持 `git clone`（本插件只走 zip 下载）。 |
| 「解压后的目录 … 里没有 package.json」 | 链接指向的不是插件项目根目录（例如 monorepo 的子目录页面会整仓下载）。换仓库根链接。 |
| 「无法把项目放到 …」 | 目标目录被占用或重命名失败（同名目录已自动加时间戳后缀，连续冲突才会走到这里）。检查下载目录里是否有同名项目正在使用。 |
| 「pnpm 要求交互式确认依赖构建脚本，且无法自动识别涉及的包名」 | pnpm 的交互式 approve-builds 无法自动应答。手动在项目里执行 `pnpm approve-builds` 或在 `pnpm-workspace.yaml` 写 `allowBuilds` 后重试。 |
| 「写入构建白名单（…）并重试后仍失败」 | 依赖本身编译失败。查看日志尾部的具体报错（此处会显示底层 pnpm 输出原文）。 |
| 「dsh plugin add 失败（退出码 N）」 | 查看日志尾部 dsh 的报错；常见是 profile 名不存在或目标目录不是合法插件。 |
| 「未找到 dsh CLI」 | dsh 不在常规安装位置。确认 `dsh --version` 可用（插件优先以 `node <全局>/@deepseek-ai/dsh/lib/bin.js` 方式定位，其次查 PATH）。 |
| Linux 上解压失败提示 spawn unzip ENOENT | 未安装 `unzip`（`apt install unzip` / `dnf install unzip`）。 |
| Windows 中文/带空格路径 | 已用 `-LiteralPath` 与 `node bin.js` 直调规避已知 shell 问题；如仍失败，把 `workRoot` 设为纯英文短路径。 |

> 提示：中文提示里附带的「具体原因」可能包含底层工具（unzip/pnpm/dsh）的原始输出，通常是英文——这是有意设计，便于检索原始报错。

## 安全说明

- **URL 白名单**：只接受 `github.com` / `www.github.com` 的 http(s) 链接；下载 URL 由解析结果构造，owner/repo/ref 经过字符白名单与 `encodeURIComponent`，不存在把用户输入拼进任意 URL 的情况（SSRF 面关闭）。
- **进程边界**：macOS/Linux 上所有子进程均为 argv 数组直调、无 shell；`dsh plugin add` 恒为 `node <bin.js> …` 无 shell。Windows 的 `.cmd` shim 走 `shell:true` 时参数只含字面量；`workRoot`、`pnpmInstallArgs`、`pnpmBuildArgs` 是**本机用户自己在设置里填写的自由文本**，Windows 下会参与命令行拼接——请不要在其中放置 shell 元字符（单用户本地部署下这是自担配置，非远程攻击面）。
- **资源上限**：下载 512 MB 硬上限 + 120s 超时；解压 180s；pnpm 阶段 15 min；注册 300s；任务历史 ≤50 条、每任务日志尾部 ≤120 行。
- **单车道**：安装任务串行执行，不会并发写 profile。

## 工作原理

```
宿主半（Node, lib/index.js, ESM）                 客户端半（浏览器, lib/client.js, CJS）
┌──────────────────────────────┐   Typert Remote   ┌──────────────────────────────┐
│ GhInstallRuntime (@Remote×6) │ ◄── ghInstall ──► │ 设置页「gh插件安装」区块        │
│ 单车道 pump：下载→解压→pnpm i  │   strict zod      │ shell.overlay toast 栈        │
│ →build→dsh plugin add        │   1.2s 轮询 list() │ 历史记录 / 内联错误            │
│ settings 命名空间（live）      │                   │ locale zh/en                  │
└──────────────────────────────┘                   └──────────────────────────────┘
```

- 远程通道：`ctx.remote.$mount` + `ctx.typert.register`，六方法（start/list/cancel/dismiss/getSettings/updateSettings）共用 `src/contract.ts` 的严格 zod 编解码，host manifest 与 client descriptor 同源。
- 设置页入口：`settings.section` 槽位（list 槽，root scope，id `gh-plugin-install`，order 60）；失败弹层：`shell.overlay` 槽位（8s 自动消失、可手动关闭、点击展开详情）。

## 开发

```bash
pnpm i                # 安装依赖（devDependencies 以 link: 指向全局 dsh 包）
pnpm run check        # typecheck → vitest（81 断言）→ build（lib/）
pnpm run smoke:host   # host 半冒烟：mock ctx 起真 runtime，33 项断言
pnpm run e2e:host     # 真实网络 e2e：驱动完整 host 流水线（脚本先重建捆绑，永不测旧代码）
node --input-type=module -e "import('<abs>/lib/index.js')"   # 产物可加载性
```

> e2e 预期行为：目标仓库 Electricitysheep/dsh-handbook 无 package.json，流水线应在
> extracting 阶段以中文原因失败并输出 `E2E PASS`——脚本以此验证下载 → 解压 →
> 扁平化 → 失败提示的完整真实链路（会使用真实 `~/Downloads` 并留下产物，可删）。

- `build.mjs`：esbuild 产出 host ESM（external `@deepseek-ai/*`、cordis）+ client CJS（ModuleLoader 握手，id `dsh-ghplugininstall`）+ tsc 声明到 `lib/types`。
- 已知类型环境偏差：workspace 的 `dsh-client-ui-slots` 是 stub（`InjectFace<T> = T`），client 在 `InstallSection.tsx` 内以 `MappedInjectFace` 复现运行时的 `hooks.x → useX` 映射；`shell.overlay` 槽型在 `client/index.ts` 自声明（`dsh-client-ui-layout` 未 link）。
- 开发上下文与已验证事实：见 `NOTES.md`。

## 已知限制

1. 安装/更新任何插件（包括本插件自己）后，都需要重启 dsh web 才会在 web 端生效。
2. 不支持 `git clone` 与私有仓库（未配置凭据的 zip 下载会 401/404）。
3. `/archive/<ref>.zip` 短式遗留链接（不带 `/refs/heads/`）暂不识别，会提示「无法识别的 GitHub 链接路径」；请使用 Code → Download ZIP 的完整直链或仓库主页链接。
4. 失败原因中的底层工具输出（pnpm/unzip/dsh）保持原文，可能为英文。
5. e2e 已实证「下载 → 解压扁平化 → 失败提示」真实链路；「pnpm i → build → 注册」半段待插件加载进 dsh web 后由设置页实跑确认（需重启）。
