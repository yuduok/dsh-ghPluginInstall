/**
 * Cross-platform dev-links: make the @deepseek-ai/* type/runtime packages of
 * the globally installed dsh resolvable inside this repo, on macOS / Linux /
 * Windows, WITHOUT any absolute paths in package.json or the lockfile.
 *
 * Why: the dsh plugin peers are provided by the host runtime, so they must
 * never be installed from the npm registry (the rc.1 chain 404s). Development
 * needs them for `tsc --noEmit` (client declarations) and for the smoke/e2e
 * bundles. This module locates the global dsh installation and links the
 * packages into node_modules with `fs.symlinkSync(..., 'junction')` — a
 * junction works on Windows without admin rights.
 *
 * Called by build.mjs before tsc, and by `pnpm run setup:dev`.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, symlinkSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** The @deepseek-ai packages this repo's typecheck and smoke needs. */
export const NEEDED_PACKAGES = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-typert-protocol',
  '@deepseek-ai/dsh-typert-registry',
  '@deepseek-ai/dsh-client-runtime',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-settings',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/schemastery',
]

/** The dsh CLI marker inside a global node_modules tree. */
const DSH_MARKER = join('@deepseek-ai/dsh', 'lib', 'bin.js')

/**
 * Locate the node_modules tree that contains the @deepseek-ai peer packages.
 * The dsh CLI installs them NESTED inside its own node_modules
 * (<global>/@deepseek-ai/dsh/node_modules/@deepseek-ai/...); fall back to the
 * global root when a deployment hoists them.
 */
export function findDshGlobalRoot() {
  const globalRoot = findGlobalNodeModulesRoot()
  if (globalRoot === undefined) return undefined
  const nested = join(globalRoot, '@deepseek-ai/dsh', 'node_modules')
  if (isPackageResolvable(join(nested, NEEDED_PACKAGES[0] ?? '@deepseek-ai/cordis'))) return nested
  if (isPackageResolvable(join(globalRoot, NEEDED_PACKAGES[0] ?? '@deepseek-ai/cordis'))) return globalRoot
  return nested // dsh exists here; report the nested tree (per-package errors name it)
}

function findGlobalNodeModulesRoot() {
  const candidates = []
  const isWin = process.platform === 'win32'
  const nodeDir = dirname(process.execPath)

  // 1) The running node's own global tree (nvm and node-installers agree).
  if (isWin) {
    candidates.push(join(nodeDir, 'node_modules'))
    if (process.env.APPDATA !== undefined) candidates.push(join(process.env.APPDATA, 'npm', 'node_modules'))
  } else {
    candidates.push(join(nodeDir, '..', 'lib', 'node_modules'))
    candidates.push(join(nodeDir, 'lib', 'node_modules'))
  }

  // 2) `npm prefix -g` via the node-shipped npm CLI (authoritative, no shell).
  try {
    const npmCli = join(nodeDir, isWin ? 'node_modules/npm/bin/npm-cli.js' : 'lib/node_modules/npm/bin/npm-cli.js')
    if (existsSync(npmCli)) {
      const prefix = execFileSync(process.execPath, [npmCli, 'prefix', '-g'], { encoding: 'utf8' }).trim()
      if (prefix !== '') candidates.push(isWin ? join(prefix, 'node_modules') : join(prefix, 'lib', 'node_modules'))
    }
  } catch {
    // npm probe is best-effort
  }

  // 3) Version-manager roots (nvm / fnm / volta), every installed version.
  for (const base of [process.env.NVM_DIR, process.env.FNM_DIR, process.env.VOLTA_HOME]) {
    if (base === undefined) continue
    try {
      const versionsDir = join(base, 'versions/node')
      if (!statSync(versionsDir).isDirectory()) continue
      for (const version of readdirSync(versionsDir)) {
        candidates.push(join(versionsDir, version, isWin ? 'node_modules' : 'lib/node_modules'))
      }
    } catch {
      // unreadable version root; skip
    }
  }

  for (const candidate of candidates) {
    try {
      if (statSync(join(candidate, DSH_MARKER)).isFile()) return candidate
    } catch {
      // not this tree
    }
  }
  return undefined
}

function isPackageResolvable(packageDir) {
  try {
    return statSync(join(packageDir, 'package.json')).isFile()
  } catch {
    return false
  }
}

/**
 * Ensure every needed package resolves from node_modules. Idempotent; never
 * throws for a missing global dsh (returns the list it could not link so the
 * caller decides how loud to be).
 */
export function ensureDevLinks(cwd = process.cwd()) {
  const root = findDshGlobalRoot()
  if (root === undefined) return { linked: [], missing: [...NEEDED_PACKAGES] }
  const linked = []
  const missing = []
  for (const name of NEEDED_PACKAGES) {
    const target = join(cwd, 'node_modules', name)
    if (isPackageResolvable(target)) {
      linked.push(name) // already linked (or restored by a previous run)
      continue
    }
    const source = join(root, name)
    if (!isPackageResolvable(source)) {
      missing.push(name)
      continue
    }
    try {
      mkdirSync(dirname(target), { recursive: true }) // the @deepseek-ai scope dir
      symlinkSync(source, target, 'junction')
      linked.push(name)
    } catch {
      if (isPackageResolvable(target)) linked.push(name)
      else missing.push(name)
    }
  }
  return { linked, missing }
}

/** CLI entry: `node scripts/dev-links.mjs` — loud about a missing global dsh. */
export function main() {
  const { linked, missing } = ensureDevLinks()
  for (const name of linked) console.log(`ok - ${name}`)
  if (missing.length > 0) {
    console.error('无法从全局 dsh 安装链接以下包（找不到全局 @deepseek-ai/dsh）：')
    for (const name of missing) console.error(`  - ${name}`)
    console.error('请先全局安装 dsh（npm i -g @deepseek-ai/dsh），或确认其安装位置。')
    return 1
  }
  console.log(`DEV-LINKS OK（${linked.length} 个包已可解析）`)
  return 0
}

// Self-run when executed directly (`node scripts/dev-links.mjs`, which is how
// build.mjs invokes it); stays import-safe for setup-dev.mjs.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main())
}
