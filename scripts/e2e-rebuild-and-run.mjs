/**
 * Rebuild the smoke/e2e bundles from current src, then run the real-network
 * e2e drive. Bundling ORDER matters: smoke-installer.mjs must be regenerated
 * before .e2e-host.mjs inlines it (the stale-bundle ordering bug bit twice).
 *
 * Uses the esbuild Node API (not the CLI shim) so the same script works on
 * macOS, Linux and Windows.
 */
import { execFileSync } from 'node:child_process'
import { build } from 'esbuild'

const dshExternal = ['@deepseek-ai/*']

const bundle = async (entry, outfile, external = []) => {
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: ['node22'],
    external,
    logLevel: 'error',
  })
}

await bundle('src/github-url.ts', 'scripts/smoke-github-url.mjs')
await bundle('src/contract.ts', 'scripts/smoke-contract.mjs')
await bundle('src/settings.ts', 'scripts/smoke-settings.mjs', dshExternal)
await bundle('src/installer.ts', 'scripts/smoke-installer.mjs', dshExternal)
await bundle('src/index.ts', 'scripts/smoke-index.mjs', dshExternal)
await bundle('scripts/e2e-host.mjs', 'scripts/.e2e-host.mjs', dshExternal)

execFileSync(process.execPath, ['scripts/.e2e-host.mjs'], { stdio: 'inherit' })
