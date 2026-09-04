/**
 * Process helpers for the installer pipeline. Every spawn goes through this
 * module so the platform nuances live in exactly one place:
 *  - Windows `.cmd` shims (pnpm) need shell:true; args are restricted to
 *    space-free literals on that path.
 *  - `node <bin.js>` invocations never use a shell, so paths with spaces and
 *    CJK characters survive verbatim (the dsh CLI's known shell:true bug
 *    never applies to this plugin).
 *  - Output is captured with a bounded tail and forwarded to a log sink.
 */
import { spawn } from 'node:child_process'

/** Options for {@link runProcess}. */
export interface RunOptions {
  readonly cwd: string
  readonly timeoutMs?: number
  /** Called per output line for live progress. */
  readonly onLine?: (line: string, stream: 'stdout' | 'stderr') => void
  /** Extra environment for the child. */
  readonly env?: Record<string, string>
}

/** Result of a completed process run. */
export interface RunResult {
  readonly code: number | null
  readonly signal: NodeJS.Signals | null
  readonly stdout: string
  readonly stderr: string
  readonly timedOut: boolean
  readonly spawnError?: string
}

const MAX_CAPTURE = 64 * 1024

/** Append text to a bounded capture buffer, keeping the tail. */
export class TailBuffer {
  private value = ''
  constructor(private readonly max = MAX_CAPTURE) {}
  push(text: string): void {
    this.value += text
    if (this.value.length > this.max) this.value = this.value.slice(-this.max)
  }
  toString(): string {
    return this.value
  }
  tail(lines: number): string {
    const parts = this.value.split(/\r?\n/u)
    return parts.slice(-lines).join('\n')
  }
}

/** Split a stream chunk into complete lines and invoke a callback. */
export function splitLines(chunk: string, rest: { value: string }, onLine: (line: string) => void): void {
  rest.value += chunk
  for (;;) {
    const index = rest.value.indexOf('\n')
    if (index < 0) break
    const line = rest.value.slice(0, index).replace(/\r$/u, '')
    rest.value = rest.value.slice(index + 1)
    if (line !== '') onLine(line)
  }
}

/**
 * Run one process to completion (or timeout). Windows .cmd/.bat files go
 * through the shell because Node refuses to spawn them directly; every other
 * command runs with an argv array and no shell.
 */
export function runProcess(command: string, args: readonly string[], options: RunOptions): Promise<RunResult> {
  const isWindowsScript = /\.cmd$/iu.test(command) || /\.bat$/iu.test(command)
  const shell = process.platform === 'win32' && isWindowsScript
  return new Promise((resolve) => {
    let child: import('node:child_process').ChildProcess
    try {
      const spawnArgs: readonly string[] = shell ? [args.join(' ')] : [...args]
      child = spawn(command, [...spawnArgs], {
        cwd: options.cwd,
        env: options.env === undefined ? process.env : { ...process.env, ...options.env },
        stdio: ['ignore', 'pipe', 'pipe'],
        shell,
        windowsHide: true,
      })
    } catch (error) {
      resolve({ code: null, signal: null, stdout: '', stderr: '', timedOut: false, spawnError: describeError(error) })
      return
    }
    const stdout = new TailBuffer()
    const stderr = new TailBuffer()
    let timedOut = false
    const restOut = { value: '' }
    const restErr = { value: '' }
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      stdout.push(chunk)
      splitLines(chunk, restOut, (line) => options.onLine?.(line, 'stdout'))
    })
    child.stderr?.on('data', (chunk: string) => {
      stderr.push(chunk)
      splitLines(chunk, restErr, (line) => options.onLine?.(line, 'stderr'))
    })
    const timer = options.timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
          timedOut = true
          child.kill('SIGKILL')
        }, options.timeoutMs)
    const finish = (code: number | null, signal: NodeJS.Signals | null): void => {
      if (timer !== undefined) clearTimeout(timer)
      // Drain whatever remains after the streams close.
      if (restOut.value !== '') options.onLine?.(restOut.value, 'stdout')
      if (restErr.value !== '') options.onLine?.(restErr.value, 'stderr')
      resolve({
        code,
        signal,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        timedOut,
      })
    }
    child.on('error', (error: Error) => {
      finish(null, null)
      // The 'error' event means spawn itself failed; surface it through stderr.
      stderr.push(`\n[spawn error] ${describeError(error)}`)
    })
    child.on('close', finish)
  })
}

/** Human message for an unknown error. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
