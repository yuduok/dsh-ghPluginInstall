/**
 * Pure unit tests for src/pnpm-heal.ts (the pnpm build-heal decision layer).
 * Samples mirror real pnpm output styles documented in NOTES.md §3: pnpm 11
 * allow-lists builds through the `allowBuilds` name→true map in
 * pnpm-workspace.yaml, pnpm ≤10 through the `onlyBuiltDependencies` list.
 * Zero I/O, zero network, zero subprocesses.
 */
import { describe, expect, it } from 'vitest'
import {
  collidingDirName,
  decideHeal,
  extractBlockedPackages,
  installDirName,
  mergeWorkspaceAllowBuilds,
  mergeWorkspaceAllowList,
  parseApproveBuildsOutput,
  readPackageAllowList,
  readWorkspaceAllowBuilds,
  readWorkspaceAllowList,
} from '../src/pnpm-heal.ts'

describe('extractBlockedPackages — pnpm “Ignored build scripts” output', () => {
  it('extracts multiple English names and stops before the Run hint', () => {
    const stderr = 'Ignored build scripts: esbuild, sharp. Run "pnpm approve-builds" to allow them.'
    expect(extractBlockedPackages(stderr)).toEqual(['esbuild', 'sharp'])
  })

  it('handles Chinese log context and the full-width comma separator', () => {
    const stderr = '安装依赖\nIgnored build scripts: esbuild，sharp. Run "pnpm approve-builds" to allow them.\n完成'
    expect(extractBlockedPackages(stderr)).toEqual(['esbuild', 'sharp'])
  })

  it('strips quotes around names', () => {
    const stderr = `Ignored build scripts: 'esbuild', "@swc/core". Run "pnpm approve-builds" to allow them.`
    expect(extractBlockedPackages(stderr)).toEqual(['esbuild', '@swc/core'])
  })

  it('keeps dots inside names (lodash.merge) without swallowing the Run hint', () => {
    const stderr = 'Ignored build scripts: lodash.merge, sharp. Run "pnpm approve-builds" to allow them.'
    expect(extractBlockedPackages(stderr)).toEqual(['lodash.merge', 'sharp'])
  })

  it('parses the pnpm 9 removed/flagged bullet list (scoped and dotted names)', () => {
    expect(extractBlockedPackages('some output\n- @swc/core flagged\nmore')).toEqual(['@swc/core'])
    expect(extractBlockedPackages('\n- lodash.merge removed\n')).toEqual(['lodash.merge'])
    // Plain single-word names are intentionally not picked from this style
    // (the heuristic needs an @ or a dot to avoid false positives).
    expect(extractBlockedPackages('\n- esbuild removed\n')).toEqual([])
  })

  it('extracts names from prepare/postinstall script failures', () => {
    expect(extractBlockedPackages('prepare script of "esbuild" failed')).toEqual(['esbuild'])
  })

  it('returns nothing for unrelated stderr', () => {
    expect(extractBlockedPackages('ERR_PNPM_NO_MATCHING_VERSION  No matching version found for esbuild@99')).toEqual([])
  })
})

describe('parseApproveBuildsOutput — picker output', () => {
  it('reads selected checkbox rows and dash rows, ignoring noise', () => {
    const stdout = 'Choose which packages to build\n❯ ◉ esbuild\n  ◯ @swc/core\n  - node-pty\n(nothing else)'
    expect(parseApproveBuildsOutput(stdout)).toEqual(['@swc/core', 'node-pty'])
  })
})

describe('readWorkspaceAllowList — onlyBuiltDependencies (pnpm ≤10)', () => {
  it('reads block-style lists with any quoting', () => {
    const yaml = "onlyBuiltDependencies:\n  - esbuild\n  - 'sharp'\n  - \"@swc/core\"\n"
    expect(readWorkspaceAllowList(yaml)).toEqual(['esbuild', 'sharp', '@swc/core'])
  })

  it('reads inline flow lists', () => {
    expect(readWorkspaceAllowList("onlyBuiltDependencies: ['a', 'b']\npackages:\n  - .\n")).toEqual(['a', 'b'])
    expect(readWorkspaceAllowList('onlyBuiltDependencies: []\n')).toEqual([])
  })

  it('stops at the next top-level key and skips comments/blanks', () => {
    const yaml = "other: 1\nonlyBuiltDependencies:\n\n  # note\n  - a\nnext: 2\n  - b\n"
    expect(readWorkspaceAllowList(yaml)).toEqual(['a'])
  })

  it('returns an empty list for files without the key', () => {
    expect(readWorkspaceAllowList('packages:\n  - .\n')).toEqual([])
  })
})

describe('mergeWorkspaceAllowList — preserves every pre-existing entry (NOTES §6.0 regression)', () => {
  it('keeps existing entries and appends the additions after the last one', () => {
    const before = "onlyBuiltDependencies:\n  - 'esbuild'\n"
    const merged = mergeWorkspaceAllowList(before, ['sharp'])
    expect(merged).toBe("onlyBuiltDependencies:\n  - 'esbuild'\n  - 'sharp'\n")
    expect(readWorkspaceAllowList(merged)).toEqual(['esbuild', 'sharp'])
  })

  it('is idempotent: merging the same names twice changes nothing', () => {
    const once = mergeWorkspaceAllowList("onlyBuiltDependencies:\n  - 'esbuild'\n", ['sharp'])
    expect(mergeWorkspaceAllowList(once, ['sharp'])).toBe(once)
  })

  it('inserts a separator blank line before a following top-level key', () => {
    const before = "onlyBuiltDependencies:\npackages:\n  - .\n"
    expect(mergeWorkspaceAllowList(before, ['sharp'])).toBe("onlyBuiltDependencies:\n  - 'sharp'\n\npackages:\n  - .\n")
  })

  it('merges into an inline flow header in place', () => {
    const before = "onlyBuiltDependencies: ['a']\npackages:\n  - .\n"
    const merged = mergeWorkspaceAllowList(before, ['b'])
    expect(merged).toBe("onlyBuiltDependencies: ['a', 'b']\npackages:\n  - .\n")
    expect(mergeWorkspaceAllowList(merged, ['b'])).toBe(merged)
  })

  it('creates the block after the packages section of a real workspace file', () => {
    const before = '# c\npackages:\n  - .\n\nallowBuilds:\n  esbuild: true\n'
    expect(mergeWorkspaceAllowList(before, ['sharp'])).toBe(
      '# c\npackages:\n  - .\n\nonlyBuiltDependencies:\n  - \'sharp\'\n\nallowBuilds:\n  esbuild: true\n',
    )
  })

  it('handles empty files and files without a packages section', () => {
    expect(mergeWorkspaceAllowList('', ['sharp'])).toBe("onlyBuiltDependencies:\n  - 'sharp'\n\n")
    expect(mergeWorkspaceAllowList('foo: bar\n', ['sharp'])).toBe("onlyBuiltDependencies:\n  - 'sharp'\n\nfoo: bar\n")
  })

  it('returns the input untouched for empty additions', () => {
    const yaml = "onlyBuiltDependencies:\n  - 'esbuild'\n"
    expect(mergeWorkspaceAllowList(yaml, [])).toBe(yaml)
  })
})

describe('readWorkspaceAllowBuilds — allowBuilds map (pnpm 11)', () => {
  it('reads the real repo-style sample', () => {
    const yaml = 'packages:\n  - .\n# pnpm 11 build-script allowlist (pnpm <=10 uses onlyBuiltDependencies).\nallowBuilds:\n  esbuild: true\n'
    expect(readWorkspaceAllowBuilds(yaml)).toEqual(['esbuild'])
  })

  it('collects every key in order, scoped names included', () => {
    const yaml = 'allowBuilds:\n  esbuild: true\n\n  # comment\n  koffi: true\n  @swc/core: true\nother: 1\n  sharp: true\n'
    expect(readWorkspaceAllowBuilds(yaml)).toEqual(['esbuild', 'koffi', '@swc/core'])
  })

  it('ignores files without the block header', () => {
    expect(readWorkspaceAllowBuilds('onlyBuiltDependencies:\n  - esbuild\n')).toEqual([])
  })
})

describe('mergeWorkspaceAllowBuilds — pnpm 11 map merge', () => {
  it('appends after the last entry and preserves existing keys and order', () => {
    const before = 'packages:\n  - .\n# note\nallowBuilds:\n  esbuild: true\n'
    const merged = mergeWorkspaceAllowBuilds(before, ['sharp', '@swc/core'])
    expect(merged).toBe('packages:\n  - .\n# note\nallowBuilds:\n  esbuild: true\n  sharp: true\n  @swc/core: true\n')
    expect(readWorkspaceAllowBuilds(merged)).toEqual(['esbuild', 'sharp', '@swc/core'])
  })

  it('is idempotent and skips already-present names', () => {
    const before = 'allowBuilds:\n  esbuild: true\n'
    expect(mergeWorkspaceAllowBuilds(before, ['esbuild'])).toBe(before)
    const merged = mergeWorkspaceAllowBuilds(before, ['sharp'])
    expect(mergeWorkspaceAllowBuilds(merged, ['sharp'])).toBe(merged)
  })

  it('appends a fresh block at the end for files without one', () => {
    expect(mergeWorkspaceAllowBuilds('', ['sharp'])).toBe('allowBuilds:\n  sharp: true\n\n')
    expect(mergeWorkspaceAllowBuilds('packages:\n  - .\n', ['sharp'])).toBe('packages:\n  - .\n\nallowBuilds:\n  sharp: true\n')
  })

  it('leaves an inline-flow header untouched and appends the block at the end', () => {
    const before = 'allowBuilds: {esbuild: true}\n'
    expect(mergeWorkspaceAllowBuilds(before, ['sharp'])).toBe('allowBuilds: {esbuild: true}\n\nallowBuilds:\n  sharp: true\n')
  })
})

describe('readPackageAllowList — package.json pnpm.onlyBuiltDependencies', () => {
  it('returns the string list', () => {
    expect(readPackageAllowList('{"name":"x","pnpm":{"onlyBuiltDependencies":["esbuild","sharp"]}}')).toEqual(['esbuild', 'sharp'])
  })

  it('returns undefined for missing keys or invalid JSON', () => {
    expect(readPackageAllowList('{"name":"x"}')).toBeUndefined()
    expect(readPackageAllowList('{"pnpm":{"other":1}}')).toBeUndefined()
    expect(readPackageAllowList('{"pnpm":{"onlyBuiltDependencies":"esbuild"}}')).toBeUndefined()
    expect(readPackageAllowList('not json')).toBeUndefined()
  })

  it('skips non-string entries in the returned view (documented behavior)', () => {
    expect(readPackageAllowList('{"pnpm":{"onlyBuiltDependencies":["esbuild",1,null]}}')).toEqual(['esbuild'])
  })
})

describe('decideHeal — next action per failure output', () => {
  it('chooses approve-builds when blocked package names are extractable', () => {
    expect(decideHeal('Ignored build scripts: esbuild. Run "pnpm approve-builds" to allow them.')).toEqual({ kind: 'approve-builds' })
  })

  it('falls back to the interactive approve-builds flow without names', () => {
    expect(decideHeal('please configure onlyBuiltDependencies or run pnpm approve-builds')).toEqual({ kind: 'approve-builds-interactive' })
    expect(decideHeal('failed: please run "pnpm approve-builds" to approve the build scripts before installing')).toEqual({ kind: 'approve-builds-interactive' })
  })

  it('retries once on transient network errors', () => {
    for (const sample of ['ETIMEDOUT at registry', 'ECONNRESET', 'network timeout at registry.npmjs.org', 'socket hang up', 'fetch failed', 'EAI_AGAIN']) {
      expect(decideHeal(sample)).toEqual({ kind: 'retry' })
    }
  })

  it('gives up on any other failure', () => {
    expect(decideHeal('ERR_PNPM_NO_MATCHING_VERSION  No matching version found for esbuild@99')).toEqual({ kind: 'give-up' })
    expect(decideHeal('ELIFECYCLE Command failed with exit code 1.')).toEqual({ kind: 'give-up' })
  })

  it('checks approve-builds before network errors', () => {
    expect(decideHeal('Ignored build scripts: esbuild. Run "pnpm approve-builds" to allow them.\nfetch failed')).toEqual({ kind: 'approve-builds' })
  })
})

describe('installDirName and collidingDirName', () => {
  it('sanitizes the repo name for the filesystem', () => {
    expect(installDirName('owner', 'my-repo.test')).toBe('my-repo.test')
    expect(installDirName('owner', 'my repo/x')).toBe('my_repo_x')
  })

  it('appends a zero-padded timestamp suffix', () => {
    expect(collidingDirName('repo', new Date(2026, 8, 4, 10, 28, 30))).toBe('repo-20260904-102830')
  })
})

describe('installer.ts re-exports the authoritative pnpm-heal implementations', () => {
  it('installer and pnpm-heal expose the very same allowBuilds functions', async () => {
    const installer = await import('../src/installer.ts')
    expect(installer.readWorkspaceAllowBuilds).toBe(readWorkspaceAllowBuilds)
    expect(installer.mergeWorkspaceAllowBuilds).toBe(mergeWorkspaceAllowBuilds)
  })
})
