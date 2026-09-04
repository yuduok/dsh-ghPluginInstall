/**
 * Discovery of the external binaries the installer needs: pnpm (install and
 * build phases) and the dsh CLI (the profile write path). Windows .cmd shims
 * are resolved to their real paths so the spawn layer can decide the shell
 * mode; the dsh CLI is additionally resolvable as `node <install>/lib/bin.js`,
 * which sidesteps the CLI's own shell:true argument-splitting bug on Windows
 * (dsh-handbook ch.3, discussion #1420).
 */
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { runProcess } from './process-run.ts'

/** One resolved external binary. */
export interface ResolvedBin {
  readonly command: string
  readonly argsPrefix: readonly string[]
}

/** Candidate absolute paths for a bare command name on this platform. */
export function pathCandidates(name: string, platform: string): string[] {
  const pathValue = process.env.PATH ?? ''
  const exts = platform === 'win32' ? ['.cmd', '.exe', '.bat', ''] : ['']
  const out: string[] = []
  for (const dir of pathValue.split(delimiter)) {
    if (dir === '') continue
    for (const ext of exts) out.push(join(dir, `${name}${ext}`))
  }
  return out
}

/** Find an executable on PATH (existence probe only). */
export function findOnPath(name: string, platform: string = process.platform): string | undefined {
  for (const candidate of pathCandidates(name, platform)) {
    if (candidate === '') continue
    try {
      if (existsSync(candidate)) return candidate
    } catch {
      // unreadable PATH entry; skip
    }
  }
  return undefined
}

/** Resolve pnpm: absolute PATH hit first, then the bare name. */
export function resolvePnpm(platform: string = process.platform): ResolvedBin {
  const hit = findOnPath('pnpm', platform)
  if (hit === undefined) return { command: 'pnpm', argsPrefix: [] }
  return { command: hit, argsPrefix: [] }
}

/** Candidate roots for a globally installed @deepseek-ai/dsh package. */
export function dshCliCandidates(platform: string = process.platform): string[] {
  const out: string[] = []
  const isWin = platform === 'win32'
  if (platform === 'darwin' || platform === 'linux') {
    out.push('/usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js')
  }
  // Version-manager layouts (nvm/fnm/volta) and Windows npm roots.
  for (const base of [process.env.NVM_DIR, process.env.FNM_DIR, process.env.VOLTA_HOME]) {
    if (base === undefined) continue
    out.push(join(base, 'versions/node'))
  }
  // Walk the current node prefix (works for nvm-style and npm -g installs).
  const nodePrefix = process.execPath
  const nodeDir = nodePrefix.slice(0, Math.max(nodePrefix.lastIndexOf('/'), nodePrefix.lastIndexOf('\\')))
  out.push(join(nodeDir, isWin ? 'node_modules/@deepseek-ai/dsh/lib/bin.js' : '../lib/node_modules/@deepseek-ai/dsh/lib/bin.js'))
  out.push(join(nodeDir, isWin ? 'node_modules/@deepseek-ai/dsh/lib/bin.js' : 'lib/node_modules/@deepseek-ai/dsh/lib/bin.js'))
  // The npm global prefix reported by the environment.
  if (process.env.PREFIX !== undefined) {
    out.push(join(process.env.PREFIX, isWin ? 'node_modules/@deepseek-ai/dsh/lib/bin.js' : 'lib/node_modules/@deepseek-ai/dsh/lib/bin.js'))
  }
  return out
}

/**
 * Resolve the dsh CLI invocation. Preference order:
 *  1. `node <global>/@deepseek-ai/dsh/lib/bin.js` — no shell, spaces and CJK
 *     safe, exactly the process the `dsh` shim runs.
 *  2. The PATH `dsh` / `dsh.cmd` executable.
 * Returns undefined when nothing usable was found; the caller reports it.
 */
export function resolveDsh(platform: string = process.platform): ResolvedBin | undefined {
  for (const candidate of dshCliCandidates(platform)) {
    try {
      if (existsSync(candidate)) return { command: process.execPath, argsPrefix: [candidate] }
    } catch {
      // skip unreadable candidates
    }
  }
  const pathHit = findOnPath('dsh', platform)
  if (pathHit !== undefined) return { command: pathHit, argsPrefix: [] }
  return undefined
}

/** Probe `pnpm --version`; undefined when pnpm is missing or broken. */
export async function probePnpm(pnpm: ResolvedBin, cwd: string): Promise<string | undefined> {
  const result = await runProcess(pnpm.command, [...pnpm.argsPrefix, '--version'], { cwd, timeoutMs: 20_000 })
  const version = result.stdout.trim().split(/\r?\n/u).pop()
  return result.code === 0 && version !== '' ? version : undefined
}

/** Probe `dsh --version`; undefined when the CLI is missing or broken. */
export async function probeDsh(dsh: ResolvedBin, cwd: string): Promise<string | undefined> {
  const result = await runProcess(dsh.command, [...dsh.argsPrefix, '--version'], { cwd, timeoutMs: 20_000 })
  const version = result.stdout.trim().split(/\r?\n/u).pop()
  return result.code === 0 && version !== '' ? version : undefined
}
