/**
 * Pure unit tests for src/github-url.ts. Every URL shape and every candidate
 * URL assertion follows the curl-verified facts in NOTES.md §3 (2026-09-04):
 * codeload `/zip/refs/heads|tags/<ref>` serves 200, HEAD resolves the default
 * branch, and the github.com `/archive/refs/...` URL is the download fallback.
 */
import { describe, expect, it } from 'vitest'
import {
  archiveZipUrl,
  codeloadZipUrl,
  looksLikeGitHub,
  parseGitHubTarget,
  targetLabel,
  UrlParseError,
  type GitHubTarget,
} from '../src/github-url.ts'

/** Error-message-key helper: returns the key, or 'NO-THROW' when parsing passed. */
function errorKeyOf(input: string): string {
  try {
    parseGitHubTarget(input)
    return 'NO-THROW'
  } catch (error) {
    if (error instanceof UrlParseError) return error.messageKey
    return `WRONG-TYPE:${(error as Error).message}`
  }
}

describe('parseGitHubTarget — full URLs', () => {
  it('parses the bare repo URL as the default branch (repo suffix stripped)', () => {
    expect(parseGitHubTarget('https://github.com/user/repo')).toEqual({ kind: 'default', owner: 'user', repo: 'repo' })
    expect(parseGitHubTarget('https://github.com/user/repo.git')).toEqual({ kind: 'default', owner: 'user', repo: 'repo' })
  })

  it('accepts http and www.github.com hosts', () => {
    expect(parseGitHubTarget('http://github.com/o/r')).toEqual({ kind: 'default', owner: 'o', repo: 'r' })
    expect(parseGitHubTarget('https://www.github.com/o/r')).toEqual({ kind: 'default', owner: 'o', repo: 'r' })
  })

  it('parses /tree/<branch> as a branch ref', () => {
    expect(parseGitHubTarget('https://github.com/o/r/tree/main')).toEqual({ kind: 'branch', owner: 'o', repo: 'r', ref: 'main' })
    expect(parseGitHubTarget('https://github.com/o/r/tree/dev/')).toEqual({ kind: 'branch', owner: 'o', repo: 'r', ref: 'dev' })
  })

  it('drops a sub-directory after the ref in /tree and /blob paths', () => {
    // Documented behavior: the installer always builds from the repo root.
    expect(parseGitHubTarget('https://github.com/o/r/tree/main/sub/dir')).toEqual({ kind: 'branch', owner: 'o', repo: 'r', ref: 'main' })
    expect(parseGitHubTarget('https://github.com/o/r/blob/main/src/index.ts')).toEqual({ kind: 'branch', owner: 'o', repo: 'r', ref: 'main' })
  })

  it('classifies 7–40 hex refs under /tree as commits', () => {
    expect(parseGitHubTarget('https://github.com/o/r/tree/9a1b2c3')).toEqual({ kind: 'commit', owner: 'o', repo: 'r', ref: '9a1b2c3' })
    expect(parseGitHubTarget('https://github.com/o/r/tree/9a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b')).toEqual({
      kind: 'commit',
      owner: 'o',
      repo: 'r',
      ref: '9a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b',
    })
  })

  it('parses /releases/tag/<tag> as a tag and other release paths as default', () => {
    expect(parseGitHubTarget('https://github.com/o/r/releases/tag/v1.2.3')).toEqual({ kind: 'tag', owner: 'o', repo: 'r', ref: 'v1.2.3' })
    expect(parseGitHubTarget('https://github.com/o/r/releases/download/v1.2.3/app.zip')).toEqual({ kind: 'default', owner: 'o', repo: 'r' })
  })

  it('parses /archive/refs/... direct zip links (trailing archive suffix stripped from the ref)', () => {
    // The URL builder re-appends `.zip`, so the parser keeps it in the ref.
    expect(parseGitHubTarget('https://github.com/o/r/archive/refs/heads/main.zip')).toEqual({ kind: 'branch', owner: 'o', repo: 'r', ref: 'main' })
    // A ref that genuinely ends in a dot-word is not mangled beyond the suffix strip.
    expect(parseGitHubTarget('https://github.com/o/r/archive/refs/heads/v1.2.zip')).toEqual({ kind: 'branch', owner: 'o', repo: 'r', ref: 'v1.2' })
    expect(parseGitHubTarget('https://github.com/o/r/archive/refs/heads/feature/x.zip')).toEqual({ kind: 'branch', owner: 'o', repo: 'r', ref: 'feature/x' })
    expect(parseGitHubTarget('https://github.com/o/r/archive/refs/tags/v1.2.3.zip')).toEqual({ kind: 'tag', owner: 'o', repo: 'r', ref: 'v1.2.3' })
  })
})

describe('parseGitHubTarget — shorthand', () => {
  it('parses owner/repo as the default branch', () => {
    expect(parseGitHubTarget('owner/repo')).toEqual({ kind: 'default', owner: 'owner', repo: 'repo' })
  })

  it('parses owner/repo@ref; a bare trailing @ is dropped', () => {
    expect(parseGitHubTarget('o/r@v1.2.3')).toEqual({ kind: 'branch', owner: 'o', repo: 'r', ref: 'v1.2.3' })
    expect(parseGitHubTarget('owner/repo@')).toEqual({ kind: 'default', owner: 'owner', repo: 'repo' })
  })

  it('classifies a hex shorthand ref as a commit', () => {
    expect(parseGitHubTarget('o/r@9a1b2c3')).toEqual({ kind: 'commit', owner: 'o', repo: 'r', ref: '9a1b2c3' })
  })

  it('accepts the github: prefix and strips .git in shorthand', () => {
    expect(parseGitHubTarget('github:o/r')).toEqual({ kind: 'default', owner: 'o', repo: 'r' })
    expect(parseGitHubTarget('github:o/r@dev')).toEqual({ kind: 'branch', owner: 'o', repo: 'r', ref: 'dev' })
    expect(parseGitHubTarget('github:owner/repo.git')).toEqual({ kind: 'default', owner: 'owner', repo: 'repo' })
  })
})

describe('parseGitHubTarget — invalid inputs throw UrlParseError with a message key', () => {
  it('empty input → emptyInput', () => {
    expect(errorKeyOf('')).toBe('emptyInput')
    expect(errorKeyOf('   ')).toBe('emptyInput')
  })

  it('non-github host → badHost; non-http protocol → badProtocol', () => {
    expect(errorKeyOf('https://gitlab.com/o/r')).toBe('badHost')
    expect(errorKeyOf('ftp://github.com/o/r')).toBe('badProtocol')
  })

  it('too-short or malformed URL paths → badPath', () => {
    expect(errorKeyOf('https://github.com/o')).toBe('badPath')
    expect(errorKeyOf('https://github.com/o/r/archive/main.zip')).toBe('badPath')
    expect(errorKeyOf('https://github.com/o/r/archive/refs/heads/')).toBe('badPath')
    expect(errorKeyOf('https://github.com/o/r/tree/')).toBe('badPath')
  })

  it('bad owner/repo names → badOwner / badShorthand', () => {
    expect(errorKeyOf('https://github.com/-o/r')).toBe('badOwner')
    expect(errorKeyOf('@o/r')).toBe('badOwner')
    expect(errorKeyOf('owner')).toBe('badShorthand')
    expect(errorKeyOf('o/r/x')).toBe('badShorthand')
  })

  it('the thrown error is a UrlParseError carrying detail', () => {
    try {
      parseGitHubTarget('https://gitlab.com/o/r')
      expect.unreachable('parseGitHubTarget should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(UrlParseError)
      expect((error as UrlParseError).messageKey).toBe('badHost')
      expect((error as UrlParseError).detail).toBe('gitlab.com')
    }
  })
})

describe('codeloadZipUrl — NOTES §3 candidate URL shapes', () => {
  it('resolves the default branch through the short /zip/HEAD form (refs/heads/HEAD 404s)', () => {
    expect(codeloadZipUrl({ kind: 'default', owner: 'o', repo: 'r' })).toBe('https://codeload.github.com/o/r/zip/HEAD')
  })

  it('builds refs/heads for branches (slash refs URL-encoded)', () => {
    expect(codeloadZipUrl({ kind: 'branch', owner: 'o', repo: 'r', ref: 'main' })).toBe('https://codeload.github.com/o/r/zip/refs/heads/main')
    expect(codeloadZipUrl({ kind: 'branch', owner: 'o', repo: 'r', ref: 'feature/x' })).toBe('https://codeload.github.com/o/r/zip/refs/heads/feature%2Fx')
  })

  it('builds refs/tags for tags and heads for commits', () => {
    expect(codeloadZipUrl({ kind: 'tag', owner: 'o', repo: 'r', ref: 'v1.2.3' })).toBe('https://codeload.github.com/o/r/zip/refs/tags/v1.2.3')
    expect(codeloadZipUrl({ kind: 'commit', owner: 'o', repo: 'r', ref: '9a1b2c3' })).toBe('https://codeload.github.com/o/r/zip/refs/heads/9a1b2c3')
  })
})

describe('archiveZipUrl — github.com fallback shapes', () => {
  it('uses /archive/HEAD.zip for the default branch (verified working fallback)', () => {
    expect(archiveZipUrl({ kind: 'default', owner: 'o', repo: 'r' })).toBe('https://github.com/o/r/archive/HEAD.zip')
  })

  it('selects heads/tags per kind', () => {
    expect(archiveZipUrl({ kind: 'branch', owner: 'o', repo: 'r', ref: 'main' })).toBe('https://github.com/o/r/archive/refs/heads/main.zip')
    expect(archiveZipUrl({ kind: 'tag', owner: 'o', repo: 'r', ref: 'v1.2.3' })).toBe('https://github.com/o/r/archive/refs/tags/v1.2.3.zip')
    expect(archiveZipUrl({ kind: 'commit', owner: 'o', repo: 'r', ref: '9a1b2c3' })).toBe('https://github.com/o/r/archive/refs/heads/9a1b2c3.zip')
  })

  it('URL-encodes slash refs', () => {
    const target = { kind: 'branch', owner: 'o', repo: 'r', ref: 'feature/x' } as const satisfies GitHubTarget
    expect(archiveZipUrl(target)).toBe('https://github.com/o/r/archive/refs/heads/feature%2Fx.zip')
  })
})

describe('targetLabel and looksLikeGitHub', () => {
  it('labels targets with an optional @ref', () => {
    expect(targetLabel({ kind: 'default', owner: 'o', repo: 'r' })).toBe('o/r')
    expect(targetLabel({ kind: 'tag', owner: 'o', repo: 'r', ref: 'v1.2.3' })).toBe('o/r@v1.2.3')
  })

  it('accepts github hosts, the github: prefix, and owner/repo shorthand', () => {
    expect(looksLikeGitHub('https://github.com/o/r')).toBe(true)
    expect(looksLikeGitHub('HTTP://GITHUB.COM/o/r')).toBe(true)
    expect(looksLikeGitHub('github:o/r@dev')).toBe(true)
    expect(looksLikeGitHub('owner/repo')).toBe(true)
    expect(looksLikeGitHub('owner/repo@v1.0')).toBe(true)
  })

  it('rejects non-github hosts and free text', () => {
    expect(looksLikeGitHub('')).toBe(false)
    expect(looksLikeGitHub('https://gitlab.com/o/r')).toBe(false)
    expect(looksLikeGitHub('just some text')).toBe(false)
  })
})
