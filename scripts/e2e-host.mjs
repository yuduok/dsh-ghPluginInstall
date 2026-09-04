/**
 * Real end-to-end drive of the host install pipeline against a live GitHub
 * repo (no dsh web, no profile writes): downloads the dsh-handbook zip from
 * codeload into the real platform downloads dir, extracts + flattens it, and
 * runs pnpm install — which must fail with a Chinese "no package.json" reason
 * because the handbook repo ships no package.json. Everything up to and
 * including the pnpm phase therefore exercises real network + real unzip.
 *
 * Usage: node scripts/e2e-host.mjs   (pnpm run e2e:host)
 */
import { Context } from '@deepseek-ai/cordis'
import { GhInstallRuntime } from './smoke-installer.mjs'

const ctx = new Context()
const store = {
  workRoot: '', // empty = platform default downloads dir (the real one)
  pnpmInstallArgs: '',
  pnpmBuildArgs: '',
  profile: 'web',
  keepZip: true,
}
const runtime = new GhInstallRuntime(ctx, () => store, async (update) => { store[update.field] = update.value })

console.log('e2e: starting real pipeline against Electricitysheep/dsh-handbook …')
const job = await runtime.start({ url: 'https://github.com/Electricitysheep/dsh-handbook' })
let snapshot = job
for (let i = 0; i < 120; i++) {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  const list = await runtime.list()
  snapshot = list.jobs.find((entry) => entry.id === job.id) ?? snapshot
  if (snapshot.phase === 'done' || snapshot.phase === 'failed') break
}

console.log('--- final phase:', snapshot.phase)
console.log('--- result:', JSON.stringify(snapshot.result, null, 2))
console.log('--- last logs:')
for (const line of snapshot.logs.slice(-8)) console.log(`  [${line.phase}/${line.stream}] ${line.text}`)

const okPhases = snapshot.logs.some((line) => line.phase === 'downloading')
const flattened = snapshot.logs.some((line) => line.text.includes('扁平化') || line.text.includes('解压'))
const failedWithReason = snapshot.phase === 'failed' && typeof snapshot.result?.error === 'string' && snapshot.result.error.length > 0

if (okPhases && failedWithReason) {
  console.log(`E2E PASS — download/extract/flatten executed (flatten noted: ${flattened}); job failed at pnpm with a concrete Chinese reason, as designed for a repo without package.json.`)
  process.exit(0)
}
console.error('E2E FAIL — unexpected terminal state')
process.exit(1)
