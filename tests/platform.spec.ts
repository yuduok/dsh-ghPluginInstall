/**
 * Pure unit tests for src/platform.ts: per-platform downloads directory and
 * the exact unzip argv per platform (Windows PowerShell Expand-Archive,
 * macOS ditto, Linux unzip). Nothing here spawns a process.
 */
import { homedir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { downloadsDir, needsEncodingWorkaround, unzipCommand, type PlatformEnv } from '../src/platform.ts'

const env = (values: Record<string, string>): PlatformEnv['env'] => values

describe('downloadsDir', () => {
  it('windows uses %UserProfile%\\Downloads (shell Downloads GUID folder)', () => {
    expect(downloadsDir({ platform: 'win32', env: env({ UserProfile: 'C:\\Users\\zhi' }) })).toBe('C:\\Users\\zhi\\Downloads')
  })

  it('windows falls back to HOME-based paths', () => {
    expect(downloadsDir({ platform: 'win32', env: env({ HOME: 'C:\\Users\\zhi' }) })).toBe('C:\\Users\\zhi\\Downloads')
    // Without HOME/USERPROFILE the module uses os.homedir() and appends \Downloads.
    expect(downloadsDir({ platform: 'win32', env: env({}) })).toBe(`${homedir()}\\Downloads`)
  })

  it('darwin uses ~/Downloads unless XDG_DOWNLOAD_DIR (with $HOME expansion) is set', () => {
    expect(downloadsDir({ platform: 'darwin', env: env({ HOME: '/Users/zhi' }) })).toBe('/Users/zhi/Downloads')
    expect(downloadsDir({ platform: 'darwin', env: env({ HOME: '/Users/zhi', XDG_DOWNLOAD_DIR: '$HOME/存档' }) })).toBe('/Users/zhi/存档')
  })

  it('linux mirrors the XDG-then-default behavior', () => {
    expect(downloadsDir({ platform: 'linux', env: env({ HOME: '/home/zhi', XDG_DOWNLOAD_DIR: '$HOME/Downloads' }) })).toBe('/home/zhi/Downloads')
    expect(downloadsDir({ platform: 'linux', env: env({ USERPROFILE: '/home/zhi' }) })).toBe('/home/zhi/Downloads')
  })

  it('unknown platforms follow the XDG-or-default branch', () => {
    expect(downloadsDir({ platform: 'other', env: env({ HOME: '/home/zhi' }) })).toBe('/home/zhi/Downloads')
  })
})

describe('unzipCommand', () => {
  it('windows runs PowerShell Expand-Archive with -LiteralPath (CJK-safe)', () => {
    expect(unzipCommand('win32', 'C:\\Users\\zhi\\Downloads\\repo-main.zip', 'C:\\work\\stage')).toEqual({
      command: 'powershell.exe',
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Expand-Archive -LiteralPath "C:\\Users\\zhi\\Downloads\\repo-main.zip" -DestinationPath "C:\\work\\stage" -Force',
      ],
    })
  })

  it('darwin uses ditto -x -k', () => {
    expect(unzipCommand('darwin', '/Users/zhi/Downloads/repo-main.zip', '/Users/zhi/Downloads/.gh-tmp-1')).toEqual({
      command: 'ditto',
      args: ['-x', '-k', '/Users/zhi/Downloads/repo-main.zip', '/Users/zhi/Downloads/.gh-tmp-1'],
    })
  })

  it('linux (and unknown platforms) use unzip -o -q -d', () => {
    expect(unzipCommand('linux', '/home/zhi/Downloads/repo-main.zip', '/home/zhi/Downloads/.gh-tmp-1')).toEqual({
      command: 'unzip',
      args: ['-o', '-q', '/home/zhi/Downloads/repo-main.zip', '-d', '/home/zhi/Downloads/.gh-tmp-1'],
    })
    expect(unzipCommand('other', '/tmp/a.zip', '/tmp/out').command).toBe('unzip')
  })
})

describe('needsEncodingWorkaround', () => {
  it('applies only on win32', () => {
    expect(needsEncodingWorkaround('win32')).toBe(true)
    expect(needsEncodingWorkaround('darwin')).toBe(false)
    expect(needsEncodingWorkaround('linux')).toBe(false)
  })
})
