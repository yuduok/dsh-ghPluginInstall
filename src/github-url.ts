/**
 * Pure helpers for GitHub zip URLs and archive layout decisions. Zero I/O and
 * zero dsh imports so the unit tests run in milliseconds.
 */

/** Ways a user may hand over a GitHub project. */
export type GitHubTarget =
  | { readonly kind: 'branch'; readonly owner: string; readonly repo: string; readonly ref: string }
  | { readonly kind: 'tag'; readonly owner: string; readonly repo: string; readonly ref: string }
  | { readonly kind: 'commit'; readonly owner: string; readonly repo: string; readonly ref: string }
  | { readonly kind: 'default'; readonly owner: string; readonly repo: string }

/** Parse error with a user-facing message key and details. */
export class UrlParseError extends Error {
  constructor(readonly messageKey: string, readonly detail?: string) {
    super(detail ?? messageKey)
    this.name = 'UrlParseError'
  }
}

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/
const REPO_RE = /^[A-Za-z0-9._-]+$/
const SHA_RE = /^[0-9a-f]{7,40}$/i

function assertOwnerRepo(owner: string, repo: string): void {
  if (!OWNER_RE.test(owner)) throw new UrlParseError('badOwner', owner)
  if (!REPO_RE.test(repo)) throw new UrlParseError('badRepo', repo)
}

/**
 * Normalize any accepted input into a GitHubTarget:
 *  - full URLs: https://github.com/<owner>/<repo>[/tree|/archive/refs/heads/<ref>[/zip|/tarball]]
 *  - shorthand: owner/repo, owner/repo@ref, github:owner/repo[@ref]
 * The tag `v1.2.3` and branch shapes are distinguished by the archive path
 * only; bare refs keep the `branch` kind (GitHub serves both the same way
 * through codeload, and the kind only picks the fallback zip URL shape).
 */
export function parseGitHubTarget(input: string): GitHubTarget {
  const raw = input.trim()
  if (raw === '') throw new UrlParseError('emptyInput')

  // Strip an optional github: scheme prefix from CLI-style shorthand.
  const shorthand = raw.startsWith('github:') ? raw.slice('github:'.length) : raw

  // Full http(s) URL forms.
  const url = tryParseUrl(shorthand)
  if (url !== undefined) {
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new UrlParseError('badProtocol', url.protocol)
    }
    const host = url.hostname.toLowerCase()
    if (host !== 'github.com' && host !== 'www.github.com') {
      throw new UrlParseError('badHost', host)
    }
    const segments = url.pathname.split('/').filter((segment) => segment !== '')
    if (segments.length < 2) throw new UrlParseError('badPath', url.pathname)
    const [owner, repoRaw] = segments
    const repo = repoRaw.replace(/\.git$/u, '')
    assertOwnerRepo(owner, repo)
    if (segments.length === 2) return { kind: 'default', owner, repo }
    // /archive/refs/heads/<ref>(/zipball|/tarball|.zip) — the direct zip link
    // users paste from the Code → Download ZIP button. A trailing archive
    // suffix is part of the URL, not the ref name: strip it so the ref is
    // servable by codeload (…/refs/heads/main.zip ⇒ ref 'main').
    if (segments[2] === 'archive') {
      if (segments.length < 5) throw new UrlParseError('badPath', url.pathname)
      if (segments[3] !== 'refs') throw new UrlParseError('badPath', url.pathname)
      const kind = segments[4] === 'tags' ? 'tag' : 'branch'
      let ref = decodeURIComponent(segments.slice(5).join('/'))
      ref = ref.replace(/\.(?:zip|tar\.gz|tgz|tarball)$/iu, '')
      if (ref === '') throw new UrlParseError('badPath', url.pathname)
      return { kind, owner, repo, ref }
    }
    // /tree/<ref>(/sub/dir) and /blob/<ref> — ref with optional sub-path.
    if (segments[2] === 'tree' || segments[2] === 'blob') {
      const ref = decodeURIComponent(segments[3] ?? '')
      if (ref === '') throw new UrlParseError('badPath', url.pathname)
      return { kind: SHA_RE.test(ref) ? 'commit' : 'branch', owner, repo, ref }
    }
    // /releases/tag/<tag> and /releases/download/... fall back to the default
    // branch (release assets are zips of a tag; codeload serves the tag zip).
    if (segments[2] === 'releases') {
      if (segments[3] === 'tag' && segments.length >= 4) {
        const ref = decodeURIComponent(segments[4] ?? '')
        if (ref !== '') return { kind: 'tag', owner, repo, ref }
      }
      return { kind: 'default', owner, repo }
    }
    return { kind: 'default', owner, repo }
  }

  // Shorthand: [github:]owner/repo[@ref]
  const at = shorthand.lastIndexOf('@')
  const base = at > 0 ? shorthand.slice(0, at) : shorthand
  const ref = at > 0 ? shorthand.slice(at + 1) : undefined
  const parts = base.split('/').filter((segment) => segment !== '')
  if (parts.length !== 2) throw new UrlParseError('badShorthand', shorthand)
  const [owner, repo] = parts
  const cleanRepo = repo.replace(/\.git$/u, '')
  assertOwnerRepo(owner, cleanRepo)
  if (ref === undefined || ref === '') return { kind: 'default', owner, repo: cleanRepo }
  return { kind: SHA_RE.test(ref) ? 'commit' : 'branch', owner, repo: cleanRepo, ref }
}

function tryParseUrl(value: string): URL | undefined {
  try {
    return new URL(value)
  } catch {
    return undefined
  }
}

/** The codeload zip URL for a parsed target (followed by GitHub redirects). */
export function codeloadZipUrl(target: GitHubTarget): string {
  const ref = 'ref' in target ? target.ref : undefined
  if (ref === undefined) {
    // The short form `/zip/HEAD` resolves the default branch (verified 200 on
    // real repos); the `refs/heads/HEAD` shape 404s because HEAD is not a
    // branch name under refs/heads.
    return `https://codeload.github.com/${target.owner}/${target.repo}/zip/HEAD`
  }
  const shape = target.kind === 'tag' ? 'tags' : 'heads'
  return `https://codeload.github.com/${target.owner}/${target.repo}/zip/refs/${shape}/${encodeURIComponent(ref)}`
}

/** The github.com archive URL used as the download fallback. */
export function archiveZipUrl(target: GitHubTarget): string {
  if (!('ref' in target)) {
    // `/archive/HEAD.zip` is the verified working default-branch fallback
    // (the `refs/heads/HEAD.zip` shape 404s).
    return `https://github.com/${target.owner}/${target.repo}/archive/HEAD.zip`
  }
  const shape = target.kind === 'tag' ? 'tags' : 'heads'
  return `https://github.com/${target.owner}/${target.repo}/archive/refs/${shape}/${encodeURIComponent(target.ref)}.zip`
}

/** A human display name for the target. */
export function targetLabel(target: GitHubTarget): string {
  const base = `${target.owner}/${target.repo}`
  return 'ref' in target ? `${base}@${target.ref}` : base
}

/**
 * A plausible GitHub URL/spec check used before parsing, so the UI can tell
 * "not a GitHub project" from "malformed".
 */
export function looksLikeGitHub(input: string): boolean {
  const raw = input.trim().toLowerCase()
  if (raw === '') return false
  if (raw.startsWith('github:') || raw.startsWith('https://github.com/') || raw.startsWith('http://github.com/')) return true
  // owner/repo or owner/repo@ref
  return /^[a-z0-9][a-z0-9-]*\/[a-z0-9._-]+(@[\w.-]+)?$/u.test(raw.replace(/^github\//u, ''))
}
