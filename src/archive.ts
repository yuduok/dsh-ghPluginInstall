/**
 * Archive handling: download a URL to a file, unzip with the per-platform
 * command, and plan the flatten step so the final directory IS the project
 * root (requirement 4: 点进去就是项目，而不是再嵌套一个文件夹). The
 * extraction always lands in a staging directory and the installer moves the
 * chosen root into place with a rename, so a failure never leaves a half
 *-written project folder behind.
 */
import { mkdir, readdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createWriteStream } from 'node:fs'
import { runProcess } from './process-run.ts'
import { unzipCommand, type PlatformId } from './platform.ts'

/** Download a URL to a local file, following redirects, with a size cap. */
export async function downloadTo(url: string, destPath: string, maxBytes = 512 * 1024 * 1024): Promise<void> {
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(120_000) })
  if (!response.ok) {
    throw new Error(`下载失败 HTTP ${response.status} ${response.statusText} (${url})`)
  }
  const length = Number(response.headers.get('content-length') ?? '0')
  if (length > maxBytes) {
    throw new Error(`下载文件过大：${length} 字节（上限 ${maxBytes}）`)
  }
  const body = response.body
  if (body === null) throw new Error('下载失败：响应没有内容')
  await mkdir(join(destPath, '..'), { recursive: true })
  let total = 0
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      total += chunk.byteLength
      if (total > maxBytes) {
        controller.error(new Error(`下载超过大小上限 ${maxBytes} 字节`))
        return
      }
      controller.enqueue(chunk)
    },
  })
  await pipeline(
    Readable.fromWeb(body.pipeThrough(counter) as unknown as import('node:stream/web').ReadableStream),
    createWriteStream(destPath),
  )
}

/**
 * What the flatten plan found inside a staging directory after extraction.
 * `rootToMove` is the absolute directory whose CONTENTS are the project
 * (undefined = the staging dir itself is the project root).
 */
export interface FlattenPlan {
  /** Absolute directory to rename into place; its children are the project. */
  readonly rootToMove?: string
  /** Human note about the layout (logged for transparency). */
  readonly note: string
}

/**
 * Inspect an extracted staging directory and decide the flatten move. GitHub
 * archives always carry one top-level folder (`<repo>-<ref>/`), which we
 * move up; archives that are already flat are used as-is.
 */
export async function planFlatten(stagingDir: string): Promise<FlattenPlan> {
  const entries = (await readdir(stagingDir)).filter((name) => name !== '.DS_Store')
  if (entries.length === 0) {
    throw new Error('解压失败：压缩包内容为空')
  }
  if (entries.length > 1) {
    // GitHub archives are always one folder; more than one entry means this
    // is not a plain GitHub archive — use the staging root unchanged rather
    // than guessing (the archive is already "flat").
    return { note: `压缩包顶层有 ${entries.length} 个条目，按扁平归档处理（不嵌套）` }
  }
  const single = entries[0]
  const { stat } = await import('node:fs/promises')
  const info = await stat(join(stagingDir, single))
  if (!info.isDirectory()) {
    return { note: `压缩包顶层是单个文件 ${single}，按扁平归档处理` }
  }
  const children = await readdir(join(stagingDir, single))
  if (children.length === 0) {
    throw new Error('压缩包内的项目文件夹是空的')
  }
  return {
    rootToMove: join(stagingDir, single),
    note: `检测到 GitHub 归档包装目录 ${single}/，已扁平化（点进去就是项目）`,
  }
}

/**
 * Extract `zipPath` into `stagingDir` with the per-platform unpacker.
 * Windows uses PowerShell Expand-Archive; macOS ditto; Linux unzip.
 */
export async function extractZip(
  platform: PlatformId,
  zipPath: string,
  stagingDir: string,
  onLine?: (line: string) => void,
): Promise<void> {
  await mkdir(stagingDir, { recursive: true })
  const cmd = unzipCommand(platform, zipPath, stagingDir)
  const result = await runProcess(cmd.command, cmd.args, {
    cwd: stagingDir,
    timeoutMs: 180_000,
    onLine: (line) => onLine?.(line),
  })
  if (result.code !== 0) {
    const detail = result.stderr.trim() !== '' ? result.stderr.trim() : `exit code ${String(result.code)}`
    throw new Error(`解压失败：${detail}`)
  }
}

/**
 * Move the planned project root into its final place (same-volume rename;
 * the staging dir always lives inside the work root). Removes whatever
 * remains of the staging dir afterwards.
 */
export async function materialize(plan: FlattenPlan, stagingDir: string, finalDir: string): Promise<void> {
  if (plan.rootToMove === undefined) {
    await rename(stagingDir, finalDir)
    return
  }
  await rename(plan.rootToMove, finalDir)
  await rm(stagingDir, { recursive: true, force: true })
}

/**
 * Verify a directory looks like an installable plugin: a package.json with a
 * name. Returns the package name when valid.
 */
export async function detectPluginDir(dir: string): Promise<string | undefined> {
  try {
    const entries = await readdir(dir)
    if (!entries.includes('package.json')) return undefined
    const { readFile } = await import('node:fs/promises')
    const raw = await readFile(join(dir, 'package.json'), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return undefined
    const name = (parsed as { name?: unknown }).name
    return typeof name === 'string' && name !== '' ? name : undefined
  } catch {
    return undefined
  }
}
