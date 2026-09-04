/**
 * Per-platform download-directory resolution and shell command planning for
 * the zip acquisition step. The functions here are pure: they take a platform
 * and environment and return the exact command argv the installer runs, so
 * tests can assert the windows / mac / linux behavior without spawning
 * anything.
 */
import { homedir } from 'node:os'

/** Platform keys the installer distinguishes. */
export type PlatformId = 'win32' | 'darwin' | 'linux' | 'other'

/** Environment needed to resolve download paths (test seam). */
export interface PlatformEnv {
  readonly platform: PlatformId
  readonly env: Readonly<Record<string, string | undefined>>
}

/** Resolve the default downloads directory for the current platform. */
export function downloadsDir({ platform, env }: PlatformEnv): string {
  const home = env.HOME ?? env.USERPROFILE ?? homedir()
  switch (platform) {
    case 'win32': {
      // {F42EE2D3-909F-4907-8871-4C22FC0BF756} is the shell Downloads GUID.
      const known = env.UserProfile !== undefined
        ? `${env.UserProfile}\\Downloads`
        : `${home}\\Downloads`
      return known
    }
    case 'darwin': {
      // XDG spec (some users set it) wins, then the standard ~/Downloads.
      return env.XDG_DOWNLOAD_DIR !== undefined ? expandHomeVar(env.XDG_DOWNLOAD_DIR, home) : `${home}/Downloads`
    }
    default: {
      return env.XDG_DOWNLOAD_DIR !== undefined ? expandHomeVar(env.XDG_DOWNLOAD_DIR, home) : `${home}/Downloads`
    }
  }
}

/** Expand $HOME inside an XDG path value. */
function expandHomeVar(value: string, home: string): string {
  return value.replace(/^\$HOME/u, home)
}

/**
 * The unzip command for a platform. PowerShell's Expand-Archive is the only
 * unpacker guaranteed present on Windows; macOS ships ditto; Linux has unzip
 * in every normal user environment (checked at runtime with a clear error).
 */
export function unzipCommand(platform: PlatformId, zipPath: string, outDir: string): { command: string; args: string[] } {
  switch (platform) {
    case 'win32':
      return {
        command: 'powershell.exe',
        args: [
          '-NoProfile', '-NonInteractive', '-Command',
          `Expand-Archive -LiteralPath "${zipPath}" -DestinationPath "${outDir}" -Force`,
        ],
      }
    case 'darwin':
      return { command: 'ditto', args: ['-x', '-k', zipPath, outDir] }
    default:
      return { command: 'unzip', args: ['-o', '-q', zipPath, '-d', outDir] }
  }
}

/** True when the platform may need the PowerShell encoding workaround (CJK paths). */
export function needsEncodingWorkaround(platform: PlatformId): boolean {
  return platform === 'win32'
}
