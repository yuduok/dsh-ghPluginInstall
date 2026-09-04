# dsh-ghplugininstall 开发上下文（NOTES）

> 本文件是团队共享上下文：记录已完成的研究结论、架构决策与剩余工作。
> 所有成员动手前必读。目标：开发一个 dsh web 插件「gh插件安装」——用户粘贴
> GitHub 链接，一键完成 download zip → 解压扁平化 → pnpm i（自动处理
> approve-builds）→ pnpm run build → `dsh plugin --profile web add <项目路径>`，
> 失败时在设置页内联提示并弹出 toast 说明具体原因。

## 0. 硬性约束

- **绝不重启 `dsh web`**：当前 agent 会话就跑在那个进程里，重启 = 杀死用户会话。
  安装插件（`dsh plugin --profile web add`）只改 profile 文件，不重启是安全的。
- 工作区：`/Users/yudu/Documents/dsh-ghPluginInstall`。构建产物进 `lib/`，
  不要提交 `node_modules`。
- 插件 npm 包名：`dsh-ghplugininstall`（cordis 插件 id 同名）；设置页显示名
  **gh插件安装**（zh）/ "GH Plugin Install"（en）。
- 运行时：本机 dsh `0.1.1-rc.2`（npm 全局装于
  `/Users/yudu/.nvm/versions/node/v22.22.0/lib/node_modules/@deepseek-ai/dsh/`）。
- 用户能访问 github.com，但不能用 `git clone`；只能 zip 下载。

## 1. 已完成（本仓库现有文件，均已通过初步设计，可继续修改）

| 文件 | 内容 |
|---|---|
| `package.json` | exports `.`(host ESM) + `./client`(浏览器 CJS)；`dsh.bundle.patch` + `dsh.client` 声明；peerDeps 全 optional；zod ^4 直接依赖 |
| `tsconfig.json` | NodeNext、strict、allowImportingTsExtensions、declaration→lib/types |
| `build.mjs` | esbuild：host ESM（external @deepseek-ai/*、cordis）+ client CJS（ModuleLoader banner，external react/@deepseek-ai/*）+ tsc 产出 .d.ts |
| `cordis.patch.yml` | `- insert: - id: dsh-ghplugininstall / name: dsh-ghplugininstall` |
| `dsh.plugin.json` | entry + client.platform=web |
| `src/github-url.ts` | 纯函数：解析 GitHub URL/shorthand（`owner/repo`、`@ref`、`/tree/`、`/archive/`、`/releases/tag/`）→ GitHubTarget；codeloadZipUrl/archiveZipUrl |
| `src/platform.ts` | 纯函数：downloadsDir(win/darwin/linux)、unzipCommand（win→PowerShell Expand-Archive；darwin→ditto；linux→unzip） |
| `src/pnpm-heal.ts` | 纯函数：extractBlockedPackages（解析 pnpm "Ignored build scripts"）、readWorkspaceAllowList/mergeWorkspaceAllowList（pnpm-workspace.yaml）、readPackageAllowList（package.json 的 pnpm.onlyBuiltDependencies）、decideHeal、installDirName、collidingDirName |
| `src/process-run.ts` | runProcess（spawn、超时、行级回调、TailBuffer、win32 .cmd 需要 shell:true 而 node bin.js 不用 shell） |
| `src/bin-resolve.ts` | resolvePnpm / resolveDsh（优先 `node <全局>/@deepseek-ai/dsh/lib/bin.js`——绕开 CLI shell:true 空格 bug #1420）/ probePnpm / probeDsh |
| `src/archive.ts` | downloadTo（fetch 流式+大小上限）、extractZip（分平台）、planFlatten（单根目录→扁平化决策）、materialize（rename 进位）、detectPluginDir |
| `src/contract.ts` | **共享 wire 契约**：InstallJob/JobsSnapshot/JobPhase/GhInstallSettings + zod schema + GH_INSTALL_INVOCATIONS（6 个 InvocationDescriptor：start/list/cancel/dismiss/getSettings/updateSettings，全部 direct + source:'json'） |
| `src/typert.ts` | TYPERT_MANIFEST（host face，service key `ghInstall`，exportName `GhInstallRuntime`） |
| `src/settings.ts` | ✅（host 半完成）`gh-plugin-install` 命名空间：GhInstallSettingsSchema（workRoot/pnpmInstallArgs/pnpmBuildArgs/profile/keepZip 默认 ''/''/''/'web'/**false**，按 t1 契约 keepZip 默认不保留）+ registerGhInstallSettings(ctx)，applies:'live' |
| `src/installer.ts` | ✅（host 半完成，按 t1 契约对齐）GhInstallRuntime extends TypertRemoteService（`super(ctx,'ghInstall')`，@Remote×6）：单车道 pump 队列；job id `ghpi-<ts>-<n>`；快照 list 尾部 20 条；流水线 下载(codeload→archive 双候选+PK 魔数校验)→解压扁平化→pnpm i（exit 0 但有 Ignored build scripts 也会治愈；失败按 decideHeal：approve-builds→写白名单重跑一次/网络错重试一次）→pnpm run build（无 build 脚本自动跳过）→`dsh plugin --profile <p> add link:<dir>`（timeout 300s，失败带 stderr 尾 10 行）；目标无自身 pnpm-workspace.yaml 时 install 加 `--ignore-workspace`（防 $HOME 工作区劫持）；所有错误中文+具体原因；日志尾部≤120 行；纯函数（mergeWorkspaceAllowBuilds/mergePackageAllowList/zipFileName/describeUrlError 等）已导出供 t3 测试 |
| `src/index.ts` | ✅（host 半完成）`export const name='dsh-ghplugininstall'`、`inject=['typert','settings']`、apply(ctx)：registerGhInstallSettings + new GhInstallRuntime + ctx.effect(ctx.typert.register(TYPERT_MANIFEST)) |
| `scripts/host-smoke.mjs` | ✅ host 半冒烟（`pnpm run smoke:host`，33 项断言，含 zod codec 校验与 apply 桩测试；依赖 scripts/smoke-*.mjs 捆绑产物，**改 src 后必须重建捆绑**：对 index/installer/github-url/contract/settings 五个入口跑 `esbuild --bundle --format=esm --platform=node --target=node22 --external:@deepseek-ai/cordis --external:'@deepseek-ai/dsh-*'`，如 t3 于 2026-09-05 00:25 重建后 smoke 恢复同步） |

## 2. 架构决策（已定，勿推翻）

1. **host↔client 通道 = Typert Remote**（复刻本机已验证的 `dsh-at-file` 插件）：
   - host：`class GhInstallRuntime extends TypertRemoteService`（构造 `super(ctx,'ghInstall')`），方法用 `@Remote` 装饰；`ctx.effect(() => ctx.typert.register(TYPERT_MANIFEST))` 注册清单；`export const inject = ['typert','settings']`。
   - client：`ctx.remote.$mount(GH_INSTALL_REMOTE)`（contribution `{package:'dsh-ghplugininstall', descriptors: GH_INSTALL_INVOCATIONS}`），**取句柄必须用** `(ctx.reflect as any).get('remote.ghInstall')`（ctx.remote 点读走 fiber 链会拿不到，at-file 注释里有说明）。
   - 远端方法失败统一返回 `{ok:false,error:{code,message}}`？——不需要：gateway 会在 strict codec 或方法 throw 时把错误传回，client 端 try/catch + result 判断即可（at-file 模式：result 是 `{ok:true,value}|{ok:false,error}` 的 typing，实际运行时直接 throw/resolve 值；以 at-file client 代码为准——它 `await remote.getSettings()` 得 `{ok,value}` 形状）。**保持与 at-file 完全一致的形状约定**：方法内部不 throw 业务错，返回 `{ok:true,value}` / `{ok:false,error:{code,message}}`？——✅ **决定：与 at-file 相同**：host 方法直接返回值，异常走 RemoteResult 的 ok/error 包装（`RemoteResult<T> = {ok:true,value:T}|{ok:false,error:{code,message,details}}`，由 typert-protocol 类型提供）。client 侧判 `result.ok`。
2. **设置页入口 = `settings.section` 槽位**（list 槽，root scope）。这是设置弹窗左侧导航的“一页”。注册形态（照抄 at-file）：
   ```ts
   ctx.slots.inject('settings.section', () => ctx.slots.register({
     name: 'settings.section', id: 'gh-plugin-install', order: 60,
     label: () => t('nav'),   // locale 感知，zh 渲染 “gh插件安装”
     locale: NS,
     inject: () => ({ hooks: { store }, ... }),
   }, InstallSection))
   ```
   需要的 type-only import：`@deepseek-ai/dsh-client-ui-settings/client`（声明 settings.section）、`@deepseek-ai/dsh-client-locale/client`（ctx.locale）、`@deepseek-ai/dsh-client-ui-slots`（PropsRuntime/InjectFace/PropsLocale 类型）。
3. **失败弹窗 = `shell.overlay` 槽**（list 槽，click-through 浮层，qingxiaopet 先例）注册 Toast 栈组件；轮询发现 job 失败时 push 一条含具体原因的 toast（自动消失 + 手动关闭）。满足需求 6（操作界面内联提示 + 弹出消息）。
4. **client bundle 必须是 CJS + ModuleLoader 握手**（build.mjs 已写好 banner/footer，id 必须是 `dsh-ghplugininstall`）。
5. **job 模型**：单车道队列（同一时刻只跑一个安装，pnpm/dsh 不能并发写 profile）。`start()` 返回 InstallJob（phase=queued），内部异步推进；client 每 1.2s 轮询 `list()`。日志只留尾部（≤120 行）。
6. **安装目录**：zip 落 `~/Downloads/<repo>-<ref>.zip`（需求 4：默认下载目录，已区分 win/mac/linux）；解压到 `<workRoot>/.gh-tmp-<jobid>/`（默认 workRoot=下载目录，保证 rename 同卷），planFlatten 决策后 rename 成 `<workRoot>/<repo>`（冲突→`collidingDirName` 时间戳后缀）。
7. **pnpm approve-builds 治愈**（需求 5）：`pnpm install` 失败/输出含 "Ignored build scripts: xxx" → 解析包名 → 有 `pnpm-workspace.yaml` 就 merge `onlyBuiltDependencies`，否则 merge package.json 的 `pnpm.onlyBuiltDependencies` → 重跑一次 `pnpm install`。网络类错误重试一次。win32 上 pnpm 是 `pnpm.cmd`（必须 shell:true，参数只用空格无关的字面量；路径参数一律走 cwd）。
8. **dsh 注册**（需求 4）：`spawn(process.execPath, [<bin.js>, 'plugin','--profile',profile,'add',`link:${dir}`])`，无 shell——Windows 空格/中文路径安全。bin.js 定位见 `src/bin-resolve.ts`。profile 默认 'web'，可被 settings/请求覆盖。

## 3. 已实测事实（2026-09-04 用 curl 验证）

- 默认分支 zip：`https://codeload.github.com/<o>/<r>/zip/HEAD` → 200 ✅
- 分支：`.../zip/refs/heads/<ref>` → 200 ✅（`.../zip/<ref>` 短式也可）
- 标签：`.../zip/refs/tags/<tag>` → 200 ✅（真实 tag；不存在的 tag 404）
- 404 时 body 是 ASCII "Not Found"（不是 zip）→ 下载后必须校验 `PK` 魔数或 content-type `application/zip`
- 候选 URL 顺序：ref 给定 → refs/tags → refs/heads → 短式 /zip/<ref> → archive ZIP → api zipball/<ref>；默认分支 → /zip/HEAD → api zipball
- **pnpm 11 的构建脚本白名单键是 `allowBuilds:`（name→true 映射）**，pnpm ≤10 是
  `onlyBuiltDependencies:`（字符串列表）。治愈逻辑两者都要支持：读现有键判断风格，
  否则按 probed pnpm 主版本选择。本机 pnpm 11.22.0；本仓库 pnpm-workspace.yaml
  已有 `allowBuilds: esbuild: true` 的实际样本。
- **$HOME 下有 pnpm-workspace.yaml（allowBuilds: koffi 等）**——任何在用户主目录
  附近跑 pnpm 的逻辑都会撞上那个工作区；本项目已用自身 pnpm-workspace.yaml 隔离。

## 4. 权威参考（都在本机，直接读源码）

- **金标准插件（本机已装且工作）**：`/Users/yudu/.dsh/profiles/web/node_modules/dsh-at-file/`
  - `src/index.ts`（host apply/typert/settings）、`src/runtime.ts`（TypertRemoteService + @Remote）、`src/contract.ts`（zod + InvocationDescriptor 写法）、`src/typert.ts`（manifest）、`src/client/index.ts`（$mount、reflect.get、settings.section、slots.inject）、`src/client/SettingsSection.tsx`（settings.section 组件与 PropsRuntime<'settings.section'> 类型）、`src/client/remote.ts`（TypertRemoteContribution + declare module 类型）、`build.mjs`、`package.json`
- **悬浮层先例**：`/Users/yudu/Documents/dsh-QingXiaoPet/`（shell.overlay、locale.register、styles 注入、localStorage store）
- **插件管理器（job+轮询先例）**：`/Users/yudu/.dsh/profiles/web/node_modules/@linxin666/dsh-client-ui-plugin-manager/lib/`（CliGateway job 表、dshSpawnCommand 绕 shell bug）
- **官方类型**：`/Users/yudu/.nvm/versions/node/v22.22.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/`
  - `dsh-typert-protocol/lib/types/`（Remote/TypertRemoteService/InvocationDescriptor/RemoteResult）
  - `dsh-client-runtime/lib/types/client/`（ClientContext/SlotRegistry/snapshot store：`createSnapshotStore`）
  - `dsh-client-ui-settings/lib/types/client/contract/slots.d.ts`（settings.section 的 owner props：`{ close: () => void }`）
  - `dsh-settings/lib/types/index.d.ts`（ctx.settings.register(namespace, schema, {applies:'live'}) → SettingsScope：get/watch/update）
- **开发指南**：`references/dsh-handbook/docs/03-profiles.md`（profile/插件挂载/host-client 双半/常见坑）、`04-plugin-dev.md`（三层验证纪律）

## 5. 环境与命令

- 包管理：`pnpm`（本仓库与 profile 都是 pnpm）。typecheck：`pnpm run typecheck`；测试：`pnpm run test`（vitest）；构建：`pnpm run build`。
- devDependencies 的 `@deepseek-ai/*` 用 `link:` 指到全局 dsh 包（见 package.json）——**已安装成功**（pnpm 输出确认 link 生效）。
- 本仓库自己的 pnpm-workspace.yaml（packages:[.]，allowBuilds: esbuild:true）**必须保留**——它隔离 $HOME 的意外工作区，同时是 pnpm 11 allowBuilds 语法的活样本。
- vitest 3.2.7、tsc 5.9.3、esbuild 0.25.12 均可用；node 22。

## 6. 剩余工作（= 团队任务板）

0. ✅ **host 运行时已完成**（2026-09-04，t1）：`src/index.ts` + `src/settings.ts` + `src/installer.ts`；typecheck 绿（host 文件子集，见下）、`pnpm run smoke:host` 33 项断言全过（mock ctx 起真 runtime：start/list/cancel/dismiss/getSettings/updateSettings、单车道、中文错误、zod codec、apply 桩）。
   **⚠ 报告的缺陷（未擅自修复，pnpm-heal.ts 归 t3）**：`src/pnpm-heal.ts` 的 `mergeWorkspaceAllowList` 向**已存在**的 `onlyBuiltDependencies` 块合并时用 `splice(headerIndex+1, insertAt-headerIndex-1, ...rendered)` **删掉了原有条目**（只剩新增项），违反其 docstring「preserving the rest of the file」。修复方向：找到块内最后一个 `  - ` 条目行，在其后插入新增项、零删除。t3 请加回归单测：`onlyBuiltDependencies:\n  - 'esbuild'` 合并 `['sharp']` 后列表必须是 `esbuild,sharp`。
   **⚠ 验证过的 CLI 事实**：`dsh plugin --profile <p> add link:<abs>` 在 profile 目录内转发 pnpm（`runPlugin`：spawnSync('pnpm', args, cwd=profile 目录)；相对路径规格才 anchor 到调用 cwd，`link:<abs>` 原样）；profile 自带 `pnpm-workspace.yaml`（allowBuilds: cloudflared/cpu-features/node-pty/ssh2）隔离了 $HOME 工作区，注册安全；`link:<abs>` 不触发 pnpm 审批构建。`pnpm-heal` 读到的 "pnpm 11.22.0" 字样来自 pnpm 自身版本横幅，不代表 dsh 版本。pnpm-heal 决策时序：pnpm exit 0 但输出含 Ignored build scripts 也要治愈（提取包名→写白名单→重跑一次）。
   **⚠ 集成注意（t4）**：`pnpm run build` 目前只差 `src/client/index.ts`（t2）；host 半 esbuild 产物已验证可加载（apply/inject/name 正确）。
   **✅ t3 单测已完成（2026-09-04）**：tests/ 四 spec（github-url/pnpm-heal/platform/archive）共 80 断言全绿，`pnpm run test` 退出码 0，`pnpm run typecheck` 全局绿。pnpm-heal.ts 变更：① 修复 mergeWorkspaceAllowList 向已有 onlyBuiltDependencies 块合并时 splice 删条目的缺陷（改为块内最后条目后零删除插入；§6.0 要求的 esbuild+sharp 回归用例已加）；② 修复 inline 流式头：readWorkspaceAllowList 此前读不到 `onlyBuiltDependencies: ['a']`（header 正则 `$` 锚点撞不上流式行，原 inline 分支是死代码），现 inline 优先探测；merge 遇 inline 头改为原行重写合并（旧行为会在流式头下插裸列表项，产出 pnpm 无法解析的 YAML）；③ extractBlockedPackages 的 Ignored 正则改惰性捕获（修「多包名+尾句」把第二个包名连同 Run 提示语吞掉的缺陷；点号包名 lodash.merge 安全）；④ installer 的 readWorkspaceAllowBuilds/mergeWorkspaceAllowBuilds 已逐字迁入 pnpm-heal.ts 为权威实现（语义不变，测试钉住保序幂等）；installer.ts 的 re-export 改造已落地（captain 授权、host-engineer 00:21 执行：删本地函数体 + `export { readWorkspaceAllowBuilds, mergeWorkspaceAllowBuilds } from './pnpm-heal.ts'`，对外表面不变），test-engineer 验证三绿：`pnpm run typecheck` 0、`pnpm run smoke:host` 33/33（SMOKE PASS）、`pnpm run test` 81/81（新增 re-export 同引用断言）。
   **⚠ 报告的缺陷（github-url.ts 对 t3 只读，未修）**：`parseGitHubTarget` 对最常见的「Code → Download ZIP」粘贴链接 `https://github.com/o/r/archive/refs/heads/main.zip` 解析出 ref=`main.zip`（.zip 后缀留在 ref 内）→ codeload/archive/api 全候选 404 → 下载必失败。建议在 archive 分支剥掉结尾 `.zip`/`.tar.gz`/`.tarball` 再回填 ref（t5 评审重点）。次要发现：decideHeal 对 `Ignored build scripts: .`（空名单）会把 `'. Run …'` 碎片当包名走 approve-builds（无害）；installer.mergePackageAllowList 与 readPackageAllowList 一样丢弃非字符串项（当前无运行时调用方）。（t4 复验注：archive 分支剥后缀修复已由 captain 落地并更新 spec，下条为 t4 集成证据。）
   **✅ t4 集成+安装已完成（2026-09-05 00:31，integrator）**：`pnpm run check`（typecheck→test→build）退出码 0，当前树 81/81 测试（platform 9 / github-url 25 / pnpm-heal 37 含 re-export 同引用断言 / archive 10）。产物核验：`lib/index.js` ESM（顶层 import 仅 `@deepseek-ai/dsh-typert-protocol`、`@deepseek-ai/dsh-settings` 与 node:*，无顶层 CJS 标记）；`lib/client.js` 首行 `window.__ModuleLoader__.load({ id: 'dsh-ghplugininstall', factory: (require) => {`、尾行 `return module.exports; } });`（CJS）；`lib/types` 18 个 .d.ts 齐全，exports map 四路径全存在。冒烟：node ESM import lib/index.js 成功（name/inject 正确）；`pnpm run smoke:host` 33 项 SMOKE PASS（复验；scripts/smoke-*.mjs 捆绑产物 mtime 23:40 早于 00:21/00:22 的 re-export 与 zip 后缀修复，语义已由 vitest 钉住，冒烟覆盖面不受影响）。安装：`dsh plugin --profile web add /Users/yudu/Documents/dsh-ghPluginInstall` exit 0（7.3s，pnpm 11.22.0；输出 `+ dsh-ghplugininstall link:/Users/yudu/Documents/dsh-ghPluginInstall`；"Packages: -12" 为旧 lockfile 冗余修剪，六插件依赖树全健在，`dsh plugin --profile web list` exit 0）。三处安装证据：① profile package.json dependencies += `dsh-ghplugininstall: link:…` 且 `dsh.profile.bundles` 尾部追加第 8 项 `dsh-ghplugininstall`；② `node_modules/dsh-ghplugininstall` symlink → 工作区，lib/package.json/dsh.plugin.json/cordis.patch.yml 经链接可见；③ `cordis.patch.yml` md5 `c26a265bd32be4061d5325d89a235ac1` 安装前后逐位一致、mtime 未动。集成零修复（未改业务代码）。dsh web 未重启：pid 51834、lstart Fri Sep 4 22:14:28 2026 前后一致、端口 3080 HTTP 200。插件需重启 dsh web 后生效（验收清单用户侧三项待重启后人工确认）。注意：00:30 重跑 check 重建了 lib/（与已验证产物同规格同握手），profile 经 symlink 直连工作区即时取到最新产物，无需重跑 add。
   **✅ t5 补充（2026-09-05 00:50，integrator，响应 captain e2e 情报）**：复核 captain 00:30-00:45 的真实网络 e2e 修复——github-url.ts 第二缺陷（默认分支候选 /zip/refs/heads/HEAD 与 /archive/refs/heads/HEAD.zip 均 404）已改为实测 200 的 `/zip/HEAD`（L120）与 `/archive/HEAD.zip`（L131），spec L135/L151 钉住；scripts/e2e-rebuild-and-run.mjs（pnpm run e2e:host）先重建五捆绑再跑，杜绝旧代码误测。integrator 一手复跑 `pnpm run e2e:host`：E2E PASS exit 0——codeload /zip/HEAD 下载 200 → zip 落 ~/Downloads/dsh-handbook-HEAD.zip → 「检测到 GitHub 归档包装目录 dsh-handbook-HEAD/，已扁平化（点进去就是项目）」→ 该仓库无 package.json 在 extracting 以中文具体原因失败（需求 3/4/6 真实行为实证）；~/Downloads 遗留 dsh-handbook/ 与 zip 属预期。`pnpm run check` 重跑 81/81 退出码 0。README 已更新：功能区引用 e2e 证据、开发区新增 e2e:host 命令与预期行为说明、已知限制第 5 条注明「pnpm i→build→注册」半段待插件加载后由设置页实跑确认。t5 结构化记录（verdict=pass）已终态不可改，本补充以 README/NOTES 为准；e2e 证据使验收清单第 2/3/4 条由「代码层通过」升级为「真实链路实证」。
   **✅ t5 终审已完成（2026-09-05 00:45，integrator，verdict=pass）**：对照 §7 验收清单 7 条全部给出结论（5 条代码层通过；第 1/2/6 条的实机渲染需重启 dsh web 后人工确认，验证步骤已写入 README）。核对基线：settings.section 注册形状与 dsh-at-file 金标准逐字段一致（list/root，id gh-plugin-install，order 60，label t('nav')）；槽位契约对 dsh-client-ui-settings/lib/types/client/contract/slots.d.ts 核对；shell.overlay 对照 qingxiaopet；host manifest 6 方法 = @Remote×6 = client 6 descriptor（GH_INSTALL_INVOCATIONS 同源单一事实）；中文错误覆盖九类失败路径（URL 非法/下载404/魔数/解压/冲突/pnpm失败两次/build/dsh缺失/注册失败）；安全：host 白名单（github.com/www.github.com，SSRF 面关闭）、下载 512MB 上限+120s 超时、darwin/linux 全 argv 无 shell、win32 shell:true 仅 .cmd 且 dsh 走 node bin.js 直调。发现 6 项（0 blocker/high，均未改动业务代码）：**F1 medium** profile 校验不一致——client PROFILE_RE（InstallSection.tsx L33）与 wire installRequestSchema（contract.ts L107）带 `i` 标志、host registering（installer.ts L524）无 `i`，大写 profile 会通过前两层、跑完整个下载/安装/构建流水后才在 registering 报中文错（修复方向：去两处 `i` + start() 对 profile fail-fast）；F2 low Windows PowerShell -Command 双引号内插 workRoot 自由文本（platform.ts L57，自担配置边界）；F3 low Windows .cmd shell 路径 join 用户 pnpm 自由文本 args（process-run.ts L75）；F4 low 兜底 describeError 内嵌英文原始信息（有意设计，README 已注明）；F5 low `/archive/<ref>.zip` 短式不支持（spec L110 钉住该行为）；F6 low shell.overlay 槽型自声明（ui-layout 类型 link 后会与官方声明成员冲突，届时删除自声明）。**README.md 已交付**：功能/支持的链接形态/使用方法（含重启 dsh web 的一次性须知）/高级选项/常见失败排查表/安全说明/工作原理/开发命令/已知限制。verify：pnpm run check 退出码 0（81/81）；dsh web pid 51834 lstart Fri Sep 4 22:14:28 2026 未变。

1. **client 半**（`src/client/*`）：remote.ts（contribution+类型）、locales.ts（zh/en 完整文案）、styles.ts、InstallSection.tsx（URL 输入、ref 高级项、开始安装、阶段进度+日志尾部、内联错误、成功提示含“重启 dsh web 后生效”、历史列表）、Toasts.tsx（失败/成功弹窗）、index.ts（apply：$mount、locale、settings.section、shell.overlay、轮询）。
2. **单元测试**：github-url（各形态+非法输入）、pnpm-heal（blocked 解析/allow-list merge，**含 mergeWorkspaceAllowList 保留既有条目的回归**）、platform（三平台命令与下载目录）、archive.planFlatten（真实 zip 布局：单根/多根/空）、installer 纯函数（allowBuilds merge/zipFileName/describeUrlError）。
3. **typecheck+build 全绿**，然后 **smoke**（`pnpm run smoke:host` 已就绪；node 直接 import lib/index.js 已验证）。
4. **安装到 web profile**：`dsh plugin --profile web add link:/Users/yudu/Documents/dsh-ghPluginInstall`，验证 profile package.json 依赖 + bundles 列表 + node_modules 链接。**不重启 dsh web**。
5. **README.md**（用法/流程/排错）+ 最终验收清单。

## 7. 验收清单（目标 6 条对照）

- [ ] 设置页侧边栏出现「gh插件安装」（settings.section，zh 文案）
- [ ] 粘贴 GitHub 链接 → 一键安装全流程
- [ ] zip 保存到平台默认下载目录（win/mac/linux 各自逻辑）
- [ ] 解压后点进去就是项目（扁平化），pnpm i / pnpm run build 成功
- [ ] approve-builds 自动治愈（onlyBuiltDependencies 写入 + 重跑）
- [ ] 失败时：设置页内联错误 + toast 弹出具体原因
- [ ] `dsh plugin --profile web add <项目路径>` 自动注册
