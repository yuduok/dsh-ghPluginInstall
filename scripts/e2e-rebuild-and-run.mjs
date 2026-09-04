/**
 * Rebuild the smoke/e2e bundles from current src, then run the real-network
 * e2e drive. Bundling ORDER matters: smoke-installer.mjs must be regenerated
 * before .e2e-host.mjs inlines it (the stale-bundle ordering bug bit twice).
 */
import { execFileSync } from 'node:child_process'

const es = (args) => execFileSync('node_modules/.bin/esbuild', args, { stdio: 'inherit' })

es(['src/github-url.ts', '--bundle', '--format=esm', '--platform=node', '--outfile=scripts/smoke-github-url.mjs', '--log-level=error'])
es(['src/contract.ts', '--bundle', '--format=esm', '--platform=node', '--outfile=scripts/smoke-contract.mjs', '--log-level=error'])
es(['src/settings.ts', '--bundle', '--format=esm', '--platform=node', '--external:@deepseek-ai/*', '--outfile=scripts/smoke-settings.mjs', '--log-level=error'])
es(['src/installer.ts', '--bundle', '--format=esm', '--platform=node', '--target=node22', '--external:@deepseek-ai/*', '--outfile=scripts/smoke-installer.mjs', '--log-level=error'])
es(['src/index.ts', '--bundle', '--format=esm', '--platform=node', '--target=node22', '--external:@deepseek-ai/*', '--outfile=scripts/smoke-index.mjs', '--log-level=error'])
es(['scripts/e2e-host.mjs', '--bundle', '--format=esm', '--platform=node', '--target=node22', '--external:@deepseek-ai/*', '--outfile=scripts/.e2e-host.mjs', '--log-level=error'])

execFileSync('node', ['scripts/.e2e-host.mjs'], { stdio: 'inherit' })
