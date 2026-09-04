/**
 * The ghInstall host runtime: a TypertRemoteService exposing the one-click
 * GitHub-plugin install pipeline to the Web settings page. One job lane at a
 * time (pnpm and `dsh plugin add` must never run concurrently against the
 * same profile), each job walks
 *
 *   download zip (platform download dir) → unzip → flatten → pnpm install
 *   (auto-heal approve-builds) → pnpm run build → dsh plugin add
 *
 * and records a bounded per-phase log tail the client polls through `list()`.
 * Every user-facing failure message is Chinese and names the concrete cause.
 * The pure allow-list YAML/JSON merge helpers and a few small planning
 * functions are exported for the unit tests.
 */
import { existsSync } from 'node:fs'
import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  GhInstallSettings,
  GhInstallSettingsUpdate,
  InstallJob,
  InstallRequest,
  JobLogLine,
  JobPhase,
  JobResult,
  JobsSnapshot,
} from './contract.ts'
import {
  archiveZipUrl,
  codeloadZipUrl,
  parseGitHubTarget,
  targetLabel,
  type GitHubTarget,
} from './github-url.ts'
import { downloadsDir, type PlatformEnv, type PlatformId } from './platform.ts'
import {
  collidingDirName,
  mergeWorkspaceAllowBuilds,
  readWorkspaceAllowBuilds,
  decideHeal,
  extractBlockedPackages,
  installDirName,
  mergeWorkspaceAllowList,
  readWorkspaceAllowList,
  readPackageAllowList,
} from './pnpm-heal.ts'
import { runProcess, describeError, type RunResult } from './process-run.ts'
import { probePnpm, resolveDsh, resolvePnpm, type ResolvedBin } from './bin-resolve.ts'
import { detectPluginDir, downloadTo, extractZip, materialize, planFlatten } from './archive.ts'

/** pnpm 11 allowBuilds helpers live in pnpm-heal.ts (authoritative); re-exported here. */
export { readWorkspaceAllowBuilds, mergeWorkspaceAllowBuilds } from './pnpm-heal.ts'

/** Keep at most this many log lines per job (NOTES §2.5: tail only). */
const LOG_TAIL_LINES = 120
/** Hard cap on finished jobs kept in the in-memory history. */
const MAX_JOBS = 50
/** pnpm install / build budget per attempt. */
const PNPM_TIMEOUT_MS = 15 * 60 * 1000
/** `dsh plugin add` budget (profile init + pnpm add of a link: dependency). */
const REGISTER_TIMEOUT_MS = 300 * 1000
/** How many jobs `list()`/`cancel()`/`dismiss()` snapshots expose (newest first). */
const LIST_TAIL = 20

/** Monotonic counter for job ids: `ghpi-<ts>-<n>`. */
let jobCounter = 0

/** Internal mutable job state (the wire snapshot is a readonly projection). */
interface MutableJob {
  readonly id: string
  url: string
  label: string
  phase: JobPhase
  readonly createdAt: number
  updatedAt: number
  readonly logs: JobLogLine[]
  result?: JobResult
  readonly requestedProfile: string
}

/* ------------------------------------------------------------------ */
/* Pure helpers (unit-tested)                                          */
/* ------------------------------------------------------------------ */

/** Map the current process to the installer's platform id. */
export function currentPlatformId(): PlatformId {
  const p = process.platform
  return p === 'win32' || p === 'darwin' || p === 'linux' ? p : 'other'
}

/** The downloaded zip's file name inside the download dir: `<repo>-<ref>.zip`. */
export function zipFileName(target: GitHubTarget): string {
  const rawRef = 'ref' in target ? target.ref : 'HEAD'
  const ref = rawRef.replace(/[^\w.-]/gu, '-') || 'HEAD'
  return `${installDirName(target.owner, target.repo)}-${ref}.zip`
}

/**
 * Merge names into a package.json `pnpm.onlyBuiltDependencies` list.
 * Returns the original text unchanged when the JSON cannot be parsed.
 */
export function mergePackageAllowList(packageJson: string, names: readonly string[]): string {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(packageJson) as Record<string, unknown>
  } catch {
    return packageJson
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return packageJson
  const pnpm = (parsed.pnpm ?? {}) as Record<string, unknown>
  const existingList = Array.isArray(pnpm.onlyBuiltDependencies)
    ? pnpm.onlyBuiltDependencies.filter((entry): entry is string => typeof entry === 'string')
    : []
  const merged = [...new Set([...existingList, ...names])]
  const next = { ...parsed, pnpm: { ...pnpm, onlyBuiltDependencies: merged } }
  return `${JSON.stringify(next, null, 2)}\n`
}

/** Split a free-form extra-arguments string on whitespace (no quoting rules). */
export function splitSimpleArgs(value: string): string[] {
  return value.split(/\s+/u).filter((piece) => piece !== '')
}

/** The last `lines` lines of a command output, for error messages. */
export function tailOf(text: string, lines = 40): string {
  const parts = text.trim().split(/\r?\n/u)
  return parts.slice(-lines).join('\n').trim()
}

/** Chinese message for a URL parse failure (or the raw error otherwise).
 * Duck-typed on `messageKey` rather than `instanceof` so it also handles
 * errors that crossed a module/bundle boundary. */
export function describeUrlError(error: unknown): string {
  const key = (error as { messageKey?: unknown } | null | undefined)?.messageKey
  if (typeof key === 'string') {
    const rawDetail = (error as { detail?: unknown }).detail
    const detail = typeof rawDetail === 'string' ? rawDetail : ''
    switch (key) {
      case 'emptyInput':
        return '请输入 GitHub 项目链接或 owner/repo 简写'
      case 'badProtocol':
        return `仅支持 http(s) 链接，收到协议：${detail}`
      case 'badHost':
        return `仅支持 github.com 项目链接，收到：${detail}`
      case 'badPath':
        return `无法识别的 GitHub 链接路径：${detail}`
      case 'badOwner':
        return `无效的 GitHub 用户名：${detail}`
      case 'badRepo':
        return `无效的 GitHub 仓库名：${detail}`
      case 'badShorthand':
        return `无法识别的 GitHub 简写：${detail}（示例：owner/repo 或 owner/repo@v1.0.0）`
      default:
        return describeError(error)
    }
  }
  return describeError(error)
}

/** Verify the downloaded file actually is a zip (PK magic), else the URL
 * served an error page (GitHub returns "Not Found" bodies for bad refs). */
async function assertZipMagic(zipPath: string): Promise<void> {
  const handle = await open(zipPath, 'r')
  try {
    const buffer = Buffer.alloc(2)
    await handle.read(buffer, 0, 2, 0)
    if (!(buffer[0] === 0x50 && buffer[1] === 0x4b)) {
      throw new Error('下载的内容不是有效的 zip 压缩包（可能是 GitHub 的 404 页面或网络错误页）')
    }
  } finally {
    await handle.close()
  }
}

/** Resolve and create the work root: configured absolute dir or the platform
 * default download directory (requirement 4). */
async function resolveWorkRoot(configured: string, env: PlatformEnv): Promise<string> {
  const raw = configured.trim()
  if (raw !== '' && !isAbsolute(raw)) {
    throw new Error(`设置的工作目录不是绝对路径：${raw}（可在设置中留空以使用系统默认下载目录）`)
  }
  const dir = raw !== '' ? raw : downloadsDir(env)
  await mkdir(dir, { recursive: true })
  return dir
}

/** Pick the final project directory inside the work root, avoiding name
 * collisions with a timestamp suffix. */
function chooseInstallDir(workRoot: string, target: GitHubTarget): string {
  const base = installDirName(target.owner, target.repo)
  if (!existsSync(join(workRoot, base))) return join(workRoot, base)
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = collidingDirName(base, new Date(Date.now() + attempt * 1000))
    if (!existsSync(join(workRoot, candidate))) return join(workRoot, candidate)
  }
  // Let the rename fail loudly with its concrete fs error if even this collides.
  return join(workRoot, collidingDirName(base, new Date()))
}

/**
 * Persist the approve-builds allow list for the project. Style resolution
 * (NOTES §3): an existing `allowBuilds:` key wins (pnpm 11), then an existing
 * `onlyBuiltDependencies:` key (pnpm ≤10); with neither, the probed pnpm
 * major picks. Without a pnpm-workspace.yaml the package.json
 * `pnpm.onlyBuiltDependencies` list is used instead.
 * @returns where the names were written (for the job log).
 */
async function writeBuildAllowList(projectDir: string, names: readonly string[], pnpmMajor: number): Promise<string> {
  const workspacePath = join(projectDir, 'pnpm-workspace.yaml')
  if (existsSync(workspacePath)) {
    const original = await readFile(workspacePath, 'utf8')
    let merged: string
    let where: string
    if (/^allowBuilds\s*:/mu.test(original)) {
      merged = mergeWorkspaceAllowBuilds(original, names)
      where = 'pnpm-workspace.yaml（allowBuilds，pnpm 11 语法）'
    } else if (/^onlyBuiltDependencies\s*:/mu.test(original)) {
      merged = mergeWorkspaceAllowList(original, names)
      where = 'pnpm-workspace.yaml（onlyBuiltDependencies，pnpm ≤10 语法）'
    } else if (pnpmMajor >= 11) {
      merged = mergeWorkspaceAllowBuilds(original, names)
      where = 'pnpm-workspace.yaml（allowBuilds，pnpm 11 语法）'
    } else {
      merged = mergeWorkspaceAllowList(original, names)
      where = 'pnpm-workspace.yaml（onlyBuiltDependencies，pnpm ≤10 语法）'
    }
    if (merged !== original) await writeFile(workspacePath, merged, 'utf8')
    return where
  }
  const packageJsonPath = join(projectDir, 'package.json')
  let original: string
  try {
    original = await readFile(packageJsonPath, 'utf8')
  } catch (error) {
    throw new Error(`自动处理构建脚本失败：项目里没有 pnpm-workspace.yaml，也读不到 package.json（${describeError(error)}）`)
  }
  const merged = mergePackageAllowList(original, names)
  if (merged === original) {
    throw new Error('自动处理构建脚本失败：package.json 不是有效的 JSON，无法写入 pnpm.onlyBuiltDependencies')
  }
  await writeFile(packageJsonPath, merged, 'utf8')
  return 'package.json（pnpm.onlyBuiltDependencies）'
}

/* ------------------------------------------------------------------ */
/* The runtime                                                         */
/* ------------------------------------------------------------------ */

/**
 * The ghInstall Remote service (wire namespace `ghInstall`, cordis key
 * `ghInstall`). The single job lane advances asynchronously; `start` only
 * enqueues. All exceptions thrown from these methods reach the client as
 * `{ok:false,error}` RemoteResults (gateway-wrapped), matching the at-file
 * contract.
 */
export class GhInstallRuntime extends TypertRemoteService {
  private readonly jobs = new Map<string, MutableJob>()
  private runningId: string | undefined
  private pumping = false

  constructor(
    ctx: Context,
    private readonly readSettings: () => GhInstallSettings,
    private readonly writeSettings: (update: GhInstallSettingsUpdate) => Promise<void>,
  ) {
    super(ctx, 'ghInstall')
  }

  /** Enqueue one install job and return its snapshot (phase `queued`). */
  @Remote
  async start(request: InstallRequest): Promise<InstallJob> {
    const url = request.url.trim()
    const requestedProfile = request.profile?.trim() ?? ''
    const now = Date.now()

    // Merge duplicate starts of the same project into the active job.
    for (const existing of this.jobs.values()) {
      if (existing.url === url && (existing.phase === 'queued' || this.runningId === existing.id)) {
        this.log(existing, existing.phase, '检测到相同链接的任务正在进行中，本次请求合并到现有任务')
        return this.wireJob(existing)
      }
    }

    const job: MutableJob = {
      id: `ghpi-${Date.now()}-${(jobCounter += 1)}`,
      url,
      label: url,
      phase: 'queued',
      createdAt: now,
      updatedAt: now,
      logs: [],
      requestedProfile,
    }

    // Fail fast on unparseable input: create the job terminal so the client
    // can show the inline error immediately.
    try {
      parseGitHubTarget(url)
    } catch (error) {
      const message = describeUrlError(error)
      job.phase = 'failed'
      job.result = { ok: false, error: message, failedPhase: 'queued' }
      this.log(job, 'queued', `失败：${message}`, 'stderr')
      this.jobs.set(job.id, job)
      this.pruneHistory()
      return this.wireJob(job)
    }
    // Fail fast on an invalid profile too (t5 finding F1): it must not run
    // the whole download/build pipeline only to die at the registering step.
    if (requestedProfile !== '' && !/^[a-z0-9-]+$/u.test(requestedProfile)) {
      const message = `profile 名称不合法：${requestedProfile}（只允许小写字母、数字和连字符）`
      job.phase = 'failed'
      job.result = { ok: false, error: message, failedPhase: 'queued' }
      this.log(job, 'queued', `失败：${message}`, 'stderr')
      this.jobs.set(job.id, job)
      this.pruneHistory()
      return this.wireJob(job)
    }

    this.jobs.set(job.id, job)
    this.pruneHistory()
    if (this.pumping) this.log(job, 'queued', '已有安装任务在执行，当前任务排队等待（单车道）')
    // Kick the lane; the active pump re-checks the queue, so this is race-safe.
    void this.pump()
    return this.wireJob(job)
  }

  /** Poll payload: every job (newest first) plus the running lane id. */
  @Remote
  async list(): Promise<JobsSnapshot> {
    return this.snapshot()
  }

  /** Cancel a job that has not started yet (the lane itself is not preemptible). */
  @Remote
  async cancel(input: { readonly id: string }): Promise<JobsSnapshot> {
    const job = this.jobs.get(input.id)
    if (job !== undefined && job.phase === 'queued') {
      job.phase = 'failed'
      job.updatedAt = Date.now()
      job.result = { ok: false, error: '任务已取消（尚未开始执行）', failedPhase: 'queued' }
      this.log(job, 'queued', '任务已被用户取消')
    }
    return this.snapshot()
  }

  /** Drop one finished job from the history list. */
  @Remote
  async dismiss(input: { readonly id: string }): Promise<JobsSnapshot> {
    const job = this.jobs.get(input.id)
    if (job !== undefined && (job.phase === 'done' || job.phase === 'failed') && this.runningId !== job.id) {
      this.jobs.delete(input.id)
    }
    return this.snapshot()
  }

  /** Read the durable settings section. */
  @Remote
  getSettings(): GhInstallSettings {
    return this.readSettings()
  }

  /** Validate, persist one field update, and return the resolved section. */
  @Remote
  async updateSettings(update: GhInstallSettingsUpdate): Promise<GhInstallSettings> {
    validateSettingsUpdate(update)
    await this.writeSettings(update)
    return this.readSettings()
  }

  /* ---------------- internals ---------------- */

  private snapshot(): JobsSnapshot {
    const jobs = [...this.jobs.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, LIST_TAIL)
      .map((job) => this.wireJob(job))
    // An idle lane sends NO runningId key at all: the gateway's JSON-safety
    // boundary rejects a present-but-undefined value, which would fail every
    // list() (and disable the install button client-wide).
    return this.runningId === undefined ? { jobs } : { jobs, runningId: this.runningId }
  }

  private wireJob(job: MutableJob): InstallJob {
    // Same JSON-safety discipline for optional keys: omit `result` entirely
    // while the job is running instead of shipping result: undefined.
    return job.result === undefined
      ? {
          id: job.id,
          url: job.url,
          label: job.label,
          phase: job.phase,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          logs: [...job.logs],
        }
      : {
          id: job.id,
          url: job.url,
          label: job.label,
          phase: job.phase,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          logs: [...job.logs],
          result: job.result,
        }
  }

  private pruneHistory(): void {
    if (this.jobs.size <= MAX_JOBS) return
    const terminal = [...this.jobs.values()]
      .filter((job) => job.phase === 'done' || job.phase === 'failed')
      .sort((a, b) => a.createdAt - b.createdAt)
    const excess = this.jobs.size - MAX_JOBS
    for (const job of terminal.slice(0, excess)) this.jobs.delete(job.id)
  }

  private log(job: MutableJob, phase: JobPhase, text: string, stream: JobLogLine['stream'] = 'info'): void {
    const line = text.trim()
    if (line === '') return
    job.logs.push({ at: Date.now(), phase, text: line, stream })
    if (job.logs.length > LOG_TAIL_LINES) job.logs.splice(0, job.logs.length - LOG_TAIL_LINES)
    job.updatedAt = Date.now()
  }

  private setPhase(job: MutableJob, phase: JobPhase, note?: string): void {
    job.phase = phase
    job.updatedAt = Date.now()
    if (note !== undefined) this.log(job, phase, note)
  }

  /** The single-lane worker: runs queued jobs strictly one at a time. */
  private async pump(): Promise<void> {
    if (this.pumping) return
    this.pumping = true
    try {
      for (;;) {
        const next = [...this.jobs.values()].find((job) => job.phase === 'queued')
        if (next === undefined) break
        this.runningId = next.id
        await this.runJob(next)
        this.runningId = undefined
      }
    } finally {
      this.pumping = false
    }
    // Second chance: a job enqueued while this pump was exiting is picked up
    // now that `pumping` is false again (start() always re-kicks, this just
    // closes the hand-over window).
    if ([...this.jobs.values()].some((job) => job.phase === 'queued')) await this.pump()
  }

  private async runJob(job: MutableJob): Promise<void> {
    const settings = this.readSettings()
    const env: PlatformEnv = { platform: currentPlatformId(), env: process.env }
    let failedPhase: JobPhase = 'queued'
    let stagingDir: string | undefined
    let zipPath: string | undefined
    let finalDir: string | undefined
    try {
      /* ---------------- downloading ---------------- */
      failedPhase = 'downloading'
      this.setPhase(job, 'downloading', '解析 GitHub 地址…')
      const target = parseGitHubTarget(job.url)
      job.label = targetLabel(target)
      this.log(job, 'downloading', `目标项目：${job.label}`)
      const workRoot = await resolveWorkRoot(settings.workRoot, env)
      this.log(job, 'downloading', `下载/工作目录：${workRoot}`)
      zipPath = join(workRoot, zipFileName(target))
      const candidates = [codeloadZipUrl(target), archiveZipUrl(target)]
      let downloaded = false
      let lastError: unknown
      for (const url of candidates) {
        try {
          this.log(job, 'downloading', `下载 ${url}`)
          await downloadTo(url, zipPath)
          await assertZipMagic(zipPath)
          downloaded = true
          break
        } catch (error) {
          lastError = error
          this.log(job, 'downloading', `下载地址不可用：${describeError(error)}`, 'stderr')
        }
      }
      if (!downloaded) {
        throw new Error(`下载失败（已尝试 ${candidates.length} 个下载地址）：${describeError(lastError)}。请检查网络连接，或确认仓库 / 分支 / 标签确实存在。`)
      }
      this.log(job, 'downloading', `zip 已保存到 ${zipPath}`)

      /* ---------------- extracting ---------------- */
      failedPhase = 'extracting'
      this.setPhase(job, 'extracting')
      stagingDir = join(workRoot, `.gh-tmp-${job.id}`)
      await rm(stagingDir, { recursive: true, force: true })
      await extractZip(env.platform, zipPath, stagingDir, (line) => this.log(job, 'extracting', line, 'stdout'))
      const plan = await planFlatten(stagingDir)
      this.log(job, 'extracting', plan.note)
      finalDir = chooseInstallDir(workRoot, target)
      try {
        await materialize(plan, stagingDir, finalDir)
      } catch (error) {
        throw new Error(`无法把项目放到 ${finalDir}：${describeError(error)}`)
      }
      stagingDir = undefined
      this.log(job, 'extracting', `项目目录：${finalDir}`)
      const pkgName = await detectPluginDir(finalDir)
      if (pkgName === undefined) {
        this.log(job, 'extracting', '提示：package.json 缺少 name 字段或不可读，将继续尝试安装', 'stderr')
      } else {
        this.log(job, 'extracting', `插件包名：${pkgName}`)
      }
      if (!existsSync(join(finalDir, 'package.json'))) {
        throw new Error(`解压后的目录 ${finalDir} 里没有 package.json，无法安装（请确认链接指向插件项目根目录）`)
      }

      /* ---------------- installing ---------------- */
      failedPhase = 'installing'
      this.setPhase(job, 'installing')
      const pnpm = resolvePnpm(env.platform)
      const pnpmVersion = await probePnpm(pnpm, finalDir)
      const pnpmMajor = pnpmVersion === undefined ? 11 : Number.parseInt(pnpmVersion.split('.')[0] ?? '', 10) || 11
      this.log(job, 'installing', pnpmVersion === undefined
        ? '未探测到 pnpm 版本，仍将尝试 pnpm install'
        : `使用 pnpm ${pnpmVersion}`)
      const installArgs = ['install', ...splitSimpleArgs(settings.pnpmInstallArgs)]
      // When the project has no workspace of its own, ignore any stray
      // pnpm-workspace.yaml above it (e.g. the one at $HOME) so installs land
      // in the project instead of that workspace root.
      const projectHasWorkspace = existsSync(join(finalDir, 'pnpm-workspace.yaml'))
      if (!projectHasWorkspace) installArgs.push('--ignore-workspace')
      await this.runPnpmPhase(job, 'installing', pnpm, installArgs, finalDir, pnpmMajor)

      /* ---------------- building ---------------- */
      failedPhase = 'building'
      const buildScript = await readBuildScript(finalDir)
      if (buildScript === undefined) {
        this.setPhase(job, 'building', 'package.json 没有 build 脚本，跳过构建')
      } else {
        this.setPhase(job, 'building', `pnpm run build（脚本：${buildScript}）`)
        const buildArgs = ['run', 'build', ...splitSimpleArgs(settings.pnpmBuildArgs)]
        await this.runPnpmPhase(job, 'building', pnpm, buildArgs, finalDir, pnpmMajor)
      }

      /* ---------------- registering ---------------- */
      failedPhase = 'registering'
      this.setPhase(job, 'registering')
      const profile = job.requestedProfile !== '' ? job.requestedProfile : settings.profile.trim() !== '' ? settings.profile.trim() : 'web'
      if (!/^[a-z0-9-]+$/u.test(profile)) {
        throw new Error(`profile 名称不合法：${profile}（只允许小写字母、数字和连字符）`)
      }
      const dsh = resolveDsh(env.platform)
      if (dsh === undefined) {
        throw new Error('未找到 dsh CLI：无法执行 dsh plugin add。请确认 dsh 已全局安装。')
      }
      this.log(job, 'registering', `注册插件：dsh plugin --profile ${profile} add link:${finalDir}`)
      // process.execPath + bin.js, no shell: spaces and CJK paths survive.
      const registered = await runProcess(dsh.command, [...dsh.argsPrefix, 'plugin', '--profile', profile, 'add', `link:${finalDir}`], {
        cwd: finalDir,
        timeoutMs: REGISTER_TIMEOUT_MS,
        onLine: (line, stream) => this.log(job, 'registering', line, stream),
      })
      if (registered.code !== 0) {
        const detail = registered.stderr.trim() !== '' ? registered.stderr : registered.stdout
        throw new Error(`dsh plugin add 失败（退出码 ${String(registered.code)}）：\n${tailOf(detail, 10)}`)
      }
      this.log(job, 'registering', `插件已写入 profile「${profile}」，重启 dsh web 后生效`)

      /* ---------------- done ---------------- */
      this.setPhase(job, 'done', `安装完成：${finalDir}（profile：${profile}）。重启 dsh web 后插件生效。`)
      job.result = { ok: true, pluginDir: finalDir, profile }
      if (!settings.keepZip && zipPath !== undefined) {
        await rm(zipPath, { force: true })
        this.log(job, 'done', `已按设置删除下载的 zip（保留可在设置中开启）`)
      }
    } catch (error) {
      const message = describeError(error)
      this.log(job, failedPhase, `失败：${message}`, 'stderr')
      job.phase = 'failed'
      job.updatedAt = Date.now()
      job.result = { ok: false, error: message, failedPhase }
    } finally {
      // A failed or interrupted extraction never leaves staging garbage.
      if (stagingDir !== undefined) await rm(stagingDir, { recursive: true, force: true })
      this.pruneHistory()
    }
  }

  /**
   * One pnpm phase with the approve-builds / network healing ladder (NOTES
   * §2.7): on an approve-builds signal the blocked packages are parsed and
   * written into the allow list, then the phase runs again — once. Network
   * errors retry once. Everything else surfaces the output tail.
   */
  private async runPnpmPhase(
    job: MutableJob,
    phase: Extract<JobPhase, 'installing' | 'building'>,
    pnpm: ResolvedBin,
    baseArgs: readonly string[],
    cwd: string,
    pnpmMajor: number,
  ): Promise<void> {
    const label = phase === 'installing' ? 'pnpm install' : 'pnpm run build'
    const attempt = (): Promise<RunResult> =>
      runProcess(pnpm.command, [...pnpm.argsPrefix, ...baseArgs], {
        cwd,
        timeoutMs: PNPM_TIMEOUT_MS,
        onLine: (line, stream) => this.log(job, phase, line, stream),
      })
    const first = await attempt()
    const failed = (detail: string): Error => new Error(`${label} 失败：${detail}`)

    if (first.spawnError !== undefined) {
      throw failed(`无法启动 pnpm（${first.spawnError}）。请确认 pnpm 已全局安装（npm i -g pnpm）。`)
    }
    if (first.code === 0) {
      // pnpm ≥10 exits 0 while silently skipping dependency build scripts.
      const skipped = extractBlockedPackages(`${first.stderr}\n${first.stdout}`)
      if (skipped.length > 0) {
        const where = await writeBuildAllowList(cwd, skipped, pnpmMajor)
        this.log(job, phase, `pnpm 跳过了依赖构建脚本（${skipped.join('、')}），已写入 ${where} 并重新执行`)
        const retried = await attempt()
        if (retried.code !== 0) {
          throw failed(`写入构建白名单（${where}）并重试后仍失败（退出码 ${String(retried.code)}）：\n${tailOf(`${retried.stderr}\n${retried.stdout}`)}`)
        }
        this.log(job, phase, `${label} 完成（构建脚本已治愈）`)
      }
      return
    }
    const output = `${first.stderr}\n${first.stdout}`
    const action = decideHeal(output)
    if (action.kind === 'approve-builds-interactive') {
      throw failed(`pnpm 要求交互式确认依赖构建脚本，且无法自动识别涉及的包名。原始输出：\n${tailOf(output)}`)
    }
    if (action.kind === 'approve-builds') {
      const blocked = extractBlockedPackages(output)
      if (blocked.length > 0) {
        this.log(job, phase, `pnpm 阻止了以下依赖的构建脚本：${blocked.join('、')}；正在写入构建白名单并重试`)
        const where = await writeBuildAllowList(cwd, blocked, pnpmMajor)
        this.log(job, phase, `已写入 ${where}，重新执行 ${label}`)
        const retried = await attempt()
        if (retried.code !== 0) {
          throw failed(`写入构建白名单（${where}）并重试后仍失败（退出码 ${String(retried.code)}）：\n${tailOf(`${retried.stderr}\n${retried.stdout}`)}`)
        }
        this.log(job, phase, `${label} 完成（构建脚本已治愈）`)
        return
      }
    }
    if (action.kind === 'retry') {
      this.log(job, phase, '检测到网络错误，自动重试一次')
      const retried = await attempt()
      if (retried.code !== 0) {
        throw failed(`网络重试后仍失败（退出码 ${String(retried.code)}）：\n${tailOf(`${retried.stderr}\n${retried.stdout}`)}`)
      }
      this.log(job, phase, `${label} 完成（网络重试成功）`)
      return
    }
    throw failed(`退出码 ${String(first.code)}：\n${tailOf(output)}`)
  }
}

/** Read the project's `scripts.build` (undefined = nothing to build). */
async function readBuildScript(dir: string): Promise<string | undefined> {
  try {
    const raw = await readFile(join(dir, 'package.json'), 'utf8')
    const parsed = JSON.parse(raw) as { scripts?: { build?: unknown } }
    return typeof parsed.scripts?.build === 'string' && parsed.scripts.build !== '' ? parsed.scripts.build : undefined
  } catch {
    return undefined
  }
}

/** Settings-field validation with concrete Chinese messages. */
function validateSettingsUpdate(update: GhInstallSettingsUpdate): void {
  if (update.field === 'profile') {
    if (!/^[a-z0-9-]*$/u.test(update.value)) {
      throw new Error(`profile 名称只能包含小写字母、数字和连字符，收到：${update.value}`)
    }
    return
  }
  if (update.field === 'workRoot') {
    const value = update.value.trim()
    if (value !== '' && !isAbsolute(value)) {
      throw new Error(`工作目录必须是绝对路径（留空则使用系统默认下载目录），收到：${update.value}`)
    }
  }
}
