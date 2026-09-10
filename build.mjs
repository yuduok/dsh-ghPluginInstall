/**
 * Single-file client + ESM host build for dsh-ghplugininstall.
 *
 * The web server serves exactly one file per plugin (/plugins/<id>/client.js),
 * so the client half is one CJS bundle wrapped in the ModuleLoader factory
 * handshake; @deepseek-ai/dsh-* and react stay external (the web app's module
 * system provides them). The host half is plain ESM for Node, externalizing
 * @deepseek-ai/dsh-* and cordis while bundling schemastery and zod (the Loader
 * validates Config against the schema; the wire codecs cross both halves).
 *
 * Cross-platform notes (Windows / Linux / macOS):
 *  - Before tsc, the @deepseek-ai/* type packages are linked from the global
 *    dsh installation (scripts/dev-links.mjs, junctions on Windows) — they are
 *    never npm dependencies, so package.json and the lockfile stay free of
 *    machine-specific paths.
 *  - TypeScript and esbuild are invoked via `node <pkg>/bin/<js>` instead of
 *    the node_modules/.bin shims: on Windows those are .cmd files, which
 *    execFileSync cannot spawn directly.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { build } from 'esbuild'

const node = (script, args = []) => execFileSync(process.execPath, [script, ...args], { stdio: 'inherit' })

// 1) Type/runtime links from the global dsh install (idempotent).
node('scripts/dev-links.mjs')

// 2) esbuild bundles.
mkdirSync('lib', { recursive: true })

const dshExternal = ['@deepseek-ai/cordis', '@deepseek-ai/dsh-*']

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: ['node22'],
  sourcemap: true,
  external: dshExternal,
  logLevel: 'info',
})

await build({
  entryPoints: ['src/client/index.ts'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['es2022'],
  sourcemap: true,
  jsx: 'automatic',
  external: [...dshExternal, 'react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'scheduler'],
  banner: {
    js: "window.__ModuleLoader__.load({ id: 'dsh-ghplugininstall', factory: (require) => { var module = { exports: {} }; var exports = module.exports;",
  },
  footer: {
    js: 'return module.exports; } });',
  },
  logLevel: 'info',
})

// 3) Declaration files via TypeScript's JS entry (no .bin shims).
const tscEntries = ['node_modules/typescript/bin/tsc', 'node_modules/typescript/lib/tsc.js']
const tsc = tscEntries.find((entry) => existsSync(entry))
if (tsc === undefined) throw new Error('typescript is not installed — run pnpm install first')
node(tsc, ['-p', 'tsconfig.json'])
