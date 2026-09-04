/**
 * Pure decision logic for the pnpm build-healing step. The pnpm install and
 * build phases can halt on blocked build scripts; pnpm ≥10 refuses to run
 * dependency build scripts until the packages are allow-listed — pnpm 11 uses
 * the `allowBuilds` name→true map in pnpm-workspace.yaml, pnpm ≤10 uses the
 * `onlyBuiltDependencies` list there or `pnpm.onlyBuiltDependencies` in
 * package.json. Given the captured stderr of a failed phase and the workspace
 * file text, this module decides the next action and produces the updated
 * file text. Zero I/O.
 */

/** What the caller should do next after a failed phase. */
export type HealAction =
  | { readonly kind: 'retry' }                       // transient failure; just run the phase again
  | { readonly kind: 'approve-builds' }              // merge allow-list, write files, re-run the phase
  | { readonly kind: 'approve-builds-interactive' }  // run `pnpm approve-builds` with a TTY-free yes pipe
  | { readonly kind: 'give-up' }                     // unknown failure; surface stderr to the user

/** Extract every blocked-package name from pnpm's ignored/removed build output. */
export function extractBlockedPackages(stderr: string): string[] {
  const names = new Set<string>()
  // pnpm ≥10: "Ignored build scripts: esbuild, sharp. Run "pnpm approve-builds" ...".
  // Lazy up to the sentence dot so package names keep their own dots
  // (lodash.merge) while the trailing `Run "pnpm approve-builds"` hint is
  // never swallowed into the last captured name.
  const ignored = /Ignored build scripts?:\s*(.+?)\.\s*(?:Run\b|$)/mu.exec(stderr)
  if (ignored?.[1] !== undefined) {
    for (const piece of ignored[1].split(/[,，]/u)) {
      const name = piece.trim().replace(/^['"]|['"]$/gu, '')
      if (name !== '' && name !== 'Run') names.add(name)
    }
  }
  // pnpm 9 removed-builds notice: "flagged as unsafe and removed" list lines.
  for (const match of stderr.matchAll(/(?:^|\n)\s*[-–]\s*([@a-z0-9][@a-z0-9._/-]*)\s*(?:\(.+?\))?\s*(?:removed|flagged)/giu)) {
    const name = match[1]?.trim()
    if (name !== undefined && name.startsWith('@') || name !== undefined && name.includes('.')) names.add(name)
  }
  // "node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>" prepare failures often
  // name the package right after "prepare script of" / "postinstall of".
  for (const match of stderr.matchAll(/(?:prepare|preinstall|install|postinstall) script of (?:['"])([^'"]+)(?:['"])/giu)) {
    const name = match[1]?.trim()
    if (name !== undefined) names.add(name)
  }
  return [...names]
}

/** Parse a `pnpm approve-builds`-style picker output into package names. */
export function parseApproveBuildsOutput(stdout: string): string[] {
  const names: string[] = []
  for (const line of stdout.split(/\r?\n/u)) {
    // checkbox lines: "◉ esbuild" / "◯ sharp" / "❯ ◯ @swc/core"
    const box = /^\s*[◉◯○❯▸o\-*xX]\s*(?:\[[ xX]?\]\s*)?([@a-z0-9][@a-z0-9._/-]*)/u.exec(line)
    if (box?.[1] !== undefined) {
      names.push(box[1])
      continue
    }
    // plain "  - name" list rows under a "choose which packages to build" header
    const dash = /^\s*[-•]\s*([@a-z0-9][@a-z0-9._/-]*)\s*$/u.exec(line)
    if (dash?.[1] !== undefined) names.push(dash[1])
  }
  return [...new Set(names)]
}

/** Read the `onlyBuiltDependencies` list out of a pnpm-workspace.yaml body. */
export function readWorkspaceAllowList(yaml: string): string[] {
  const lines = yaml.split(/\r?\n/u)
  const out: string[] = []
  let inBlock = false
  for (const line of lines) {
    // Inline flow list (`onlyBuiltDependencies: ['a', 'b']`) — probe it before
    // the block header, whose `$` anchor can never match a full flow list.
    const inline = /^onlyBuiltDependencies\s*:\s*\[(.*)\]\s*$/u.exec(line)
    if (inline !== null) {
      out.push(...inline[1].split(',').map((piece) => piece.trim().replace(/^['"]|['"]$/gu, '')).filter((name) => name !== ''))
      inBlock = false
      continue
    }
    const header = /^onlyBuiltDependencies\s*:\s*(?:\[\s*)?$/u.exec(line)
    if (header !== null) {
      inBlock = true
      continue
    }
    if (inBlock) {
      if (/^\s+#/u.test(line)) continue
      const item = /^\s*-\s*(.+?)\s*$/u.exec(line)
      if (item !== null) {
        out.push(item[1].trim().replace(/^['"]|['"]$/gu, ''))
        continue
      }
      if (line.trim() === '') continue
      inBlock = false
    }
  }
  return out
}

/**
 * Merge names into the `onlyBuiltDependencies` block, preserving the rest of
 * the file (NOTES §6.0: every pre-existing entry must survive the merge).
 * An inline-flow header (`onlyBuiltDependencies: ['a', 'b']`) is rewritten in
 * place with the merged list — inserting bare `- 'x'` items under a flow
 * header would produce YAML that pnpm cannot parse.
 */
export function mergeWorkspaceAllowList(yaml: string, names: readonly string[]): string {
  if (names.length === 0) return yaml
  const existing = new Set(readWorkspaceAllowList(yaml))
  const additions = names.filter((name) => !existing.has(name))
  if (additions.length === 0) return yaml
  const lines = yaml.split(/\r?\n/u)
  const headerIndex = lines.findIndex((line) => /^onlyBuiltDependencies\s*:/u.test(line))
  if (headerIndex >= 0) {
    const header = lines[headerIndex] as string
    // Inline-flow header: merge in place, re-rendering the full list.
    const inline = /^onlyBuiltDependencies\s*:\s*\[(.*)\]\s*$/u.exec(header)
    if (inline !== null) {
      const items = inline[1].split(',').map((piece) => piece.trim().replace(/^['"]|['"]$/gu, '')).filter((name) => name !== '')
      const merged = [...items, ...additions]
      lines[headerIndex] = `onlyBuiltDependencies: [${merged.map((name) => `'${name}'`).join(', ')}]`
      return lines.join('\n')
    }
    // Block-style header: locate the last `  - ` entry of the block and
    // insert after it — nothing is removed (the old splice here deleted the
    // pre-existing entries).
    let lastEntry = headerIndex
    let scan = headerIndex + 1
    while (scan < lines.length) {
      const line = lines[scan] as string
      if (/^\s+-\s/u.test(line)) {
        lastEntry = scan
        scan += 1
        continue
      }
      if (line.trim() === '' || /^\s+#/u.test(line)) {
        scan += 1
        continue
      }
      break
    }
    const rendered = additions.map((name) => `  - '${name}'`)
    lines.splice(lastEntry + 1, 0, ...rendered)
    if (lastEntry === headerIndex && scan < lines.length && lines[scan]?.trim() !== '') {
      lines.splice(lastEntry + 1 + rendered.length, 0, '')
    }
    return lines.join('\n')
  }
  const block = [`onlyBuiltDependencies:`, ...additions.map((name) => `  - '${name}'`), '']
  if (yaml.trim() === '') return `${block.join('\n')}\n`
  // Insert after the leading `packages:` block when present, else at the top.
  const packagesIndex = lines.findIndex((line) => /^packages\s*:/u.test(line))
  if (packagesIndex >= 0) {
    let insertAt = packagesIndex + 1
    while (insertAt < lines.length && (lines[insertAt].trim() === '' || /^\s+-\s/u.test(lines[insertAt]) || /^\s*#/u.test(lines[insertAt]))) insertAt += 1
    lines.splice(insertAt, 0, ...block)
    return lines.join('\n')
  }
  return `${[...block, ...lines].join('\n')}`
}

/** Read `pnpm.onlyBuiltDependencies` from a package.json text (returns undefined on any parse problem). */
export function readPackageAllowList(packageJson: string): string[] | undefined {
  try {
    const parsed: unknown = JSON.parse(packageJson)
    if (typeof parsed !== 'object' || parsed === null) return undefined
    const pnpm = (parsed as { pnpm?: unknown }).pnpm
    if (typeof pnpm !== 'object' || pnpm === null) return undefined
    const list = (pnpm as { onlyBuiltDependencies?: unknown }).onlyBuiltDependencies
    if (!Array.isArray(list)) return undefined
    return list.filter((entry): entry is string => typeof entry === 'string')
  } catch {
    return undefined
  }
}

/**
 * Read the pnpm 11 `allowBuilds` name→true map out of a pnpm-workspace.yaml
 * body. Moved here verbatim from installer.ts (t3 migration) so there is one
 * authoritative implementation; installer.ts re-exports these.
 */
export function readWorkspaceAllowBuilds(yaml: string): string[] {
  const lines = yaml.split(/\r?\n/u)
  const out: string[] = []
  let inBlock = false
  for (const line of lines) {
    if (/^allowBuilds\s*:\s*$/u.test(line)) {
      inBlock = true
      continue
    }
    if (!inBlock) continue
    if (line.trim() === '' || /^\s+#/u.test(line)) continue
    const entry = /^\s+([@A-Za-z0-9][\w@./-]*)\s*:/u.exec(line)
    if (entry !== null) {
      out.push(entry[1])
      continue
    }
    inBlock = false
  }
  return out
}

/**
 * Merge names into a pnpm-workspace.yaml `allowBuilds` block (pnpm 11 style:
 * `  <name>: true`), preserving every existing entry and the entry order. A
 * file without the block gets one appended; an inline-flow header is left
 * untouched and the block goes to the end of the file.
 */
export function mergeWorkspaceAllowBuilds(yaml: string, names: readonly string[]): string {
  if (names.length === 0) return yaml
  const existing = new Set(readWorkspaceAllowBuilds(yaml))
  const additions = names.filter((name) => !existing.has(name))
  if (additions.length === 0) return yaml
  const lines = yaml.split(/\r?\n/u)
  const rendered = additions.map((name) => `  ${name}: true`)
  const headerIndex = lines.findIndex((line) => /^allowBuilds\s*:\s*$/u.test(line))
  if (headerIndex >= 0) {
    // Walk the existing block (map entries, blanks, comments) and insert the
    // additions right after the last entry — nothing is removed.
    let scan = headerIndex + 1
    let lastEntry = headerIndex
    while (scan < lines.length) {
      const line = lines[scan] as string
      if (/^\s+[\w@./-]+\s*:/u.test(line)) {
        lastEntry = scan
        scan += 1
        continue
      }
      if (line.trim() === '' || /^\s+#/u.test(line)) {
        scan += 1
        continue
      }
      break
    }
    lines.splice(lastEntry + 1, 0, ...rendered)
    return lines.join('\n')
  }
  const block = ['allowBuilds:', ...rendered, '']
  if (yaml.trim() === '') return `${block.join('\n')}\n`
  return [...lines, ...block].join('\n')
}

/** Decide the healing action from a phase's failure output. */
export function decideHeal(stderr: string): HealAction {
  if (/approve-builds|Ignored build scripts|removed.*build scripts|onlyBuiltDependencies/u.test(stderr)) {
    return extractBlockedPackages(stderr).length > 0
      ? { kind: 'approve-builds' }
      : { kind: 'approve-builds-interactive' }
  }
  if (/ETIMEDOUT|ECONNRESET|network timeout|socket hang up|fetch failed|EAI_AGAIN/u.test(stderr)) return { kind: 'retry' }
  return { kind: 'give-up' }
}

/** The install directory name for a target (inside the downloads root). */
export function installDirName(owner: string, repo: string): string {
  return repo.replace(/[^\w.-]/gu, '_')
}

/** Append a short timestamp suffix used to resolve a name collision. */
export function collidingDirName(base: string, now: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `${base}-${stamp}`
}
