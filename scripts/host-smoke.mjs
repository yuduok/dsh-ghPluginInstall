/**
 * Standalone smoke for the dsh-ghplugininstall host half. Verifies:
 *  1. src/index.mjs loads and exports name/inject/apply
 *  2. GhInstallRuntime instantiates on a bare cordis Context and serves
 *     start/list/cancel/dismiss/getSettings/updateSettings through the wire
 *  3. the single lane runs a job to a terminal state (here: fails fast on a
 *     non-writable work root — no network involved)
 *  4. the pure helpers behave (allowBuilds merge preserves existing entries)
 */
import { Context } from '@deepseek-ai/cordis'
import * as host from './smoke-index.mjs'
import { GhInstallRuntime } from './smoke-installer.mjs'

let failures = 0
const check = (name, cond, detail = '') => {
  if (cond) console.log(`ok - ${name}`)
  else { failures += 1; console.error(`FAIL - ${name} ${detail}`) }
}

// 1) plugin surface
check('name', host.name === 'dsh-ghplugininstall', String(host.name))
check('inject', Array.isArray(host.inject) && host.inject.join(',') === 'typert,settings', String(host.inject))
check('apply is function', typeof host.apply === 'function')

// 2) runtime over a bare context
const ctx = new Context()
const store = {
  workRoot: '/tmp/ghinstall-smoke/nonexistent-parent/forbidden',
  pnpmInstallArgs: '',
  pnpmBuildArgs: '',
  profile: 'web',
  keepZip: true,
}
const runtime = new GhInstallRuntime(ctx, () => store, async (update) => { store[update.field] = update.value })
check('runtime constructed', runtime instanceof GhInstallRuntime)

// 3) settings round-trip
const settings0 = await runtime.getSettings()
check('getSettings', settings0.workRoot === store.workRoot, JSON.stringify(settings0))
const settings1 = await runtime.updateSettings({ field: 'keepZip', value: false })
check('updateSettings', settings1.keepZip === false, JSON.stringify(settings1))

// invalid profile rejected
let rejected = false
try { await runtime.updateSettings({ field: 'profile', value: 'Bad_Profile!' }) } catch { rejected = true }
check('invalid profile rejected', rejected)

// 4) single-lane job run (fails fast: workRoot's parent cannot be created)
const job = await runtime.start({ url: 'https://github.com/owner/repo' })
check('start returns queued/failed job', job.id.length > 0, JSON.stringify(job))
let snap = await runtime.list()
check('list has job', snap.jobs.length === 1)
for (let i = 0; i < 50; i += 1) {
  snap = await runtime.list()
  if (snap.jobs[0].phase === 'failed' || snap.jobs[0].phase === 'done') break
  await new Promise((r) => setTimeout(r, 100))
}
const finished = snap.jobs[0]
check('job reaches terminal phase', finished.phase === 'failed' || finished.phase === 'done', finished.phase)
check('terminal job carries result', typeof finished.result === 'object' && typeof finished.result.ok === 'boolean')
check('error message is Chinese', finished.phase === 'done' || /[\u4e00-\u9fff]/.test(finished.result.error ?? ''), finished.result?.error)
check('runningId cleared', snap.runningId === undefined, String(snap.runningId))

// strict wire codecs (what the gateway applies on every call)
{
  const { installJobSchema, jobsSnapshotSchema, ghInstallSettingsSchema } = await import('./smoke-contract.mjs')
  check('zod job codec', installJobSchema.safeParse(finished).success, JSON.stringify(finished).slice(0, 200))
  check('zod snapshot codec', jobsSnapshotSchema.safeParse(snap).success)
  check('zod settings codec', ghInstallSettingsSchema.safeParse(await runtime.getSettings()).success)
}

// cancel of a finished job is a no-op snapshot
const snap2 = await runtime.cancel({ id: finished.id })
check('cancel terminal no-op', snap2.jobs.length === 1)
const snap3 = await runtime.dismiss({ id: finished.id })
check('dismiss removes terminal job', snap3.jobs.length === 0)

// 5) pure helpers
const { mergeWorkspaceAllowBuilds, readWorkspaceAllowBuilds, mergePackageAllowList, zipFileName, splitSimpleArgs, tailOf, describeUrlError, currentPlatformId } = await import('./smoke-installer.mjs')
const yaml = 'packages:\n  - .\nallowBuilds:\n  esbuild: true\n'
const merged = mergeWorkspaceAllowBuilds(yaml, ['esbuild', 'sharp'])
check('allowBuilds merge preserves', merged.includes('esbuild: true') && merged.includes('sharp: true'), JSON.stringify(merged))
check('allowBuilds merge idempotent', mergeWorkspaceAllowBuilds(merged, ['sharp']) === merged)
check('allowBuilds read', JSON.stringify(readWorkspaceAllowBuilds(merged)) === JSON.stringify(['esbuild', 'sharp']))
const pkgJson = '{"name":"x","pnpm":{"onlyBuiltDependencies":["esbuild"]}}'
const pkgMerged = JSON.parse(mergePackageAllowList(pkgJson, ['sharp', 'esbuild']))
check('package.json merge', pkgMerged.pnpm.onlyBuiltDependencies.join(',') === 'esbuild,sharp')
check('zipFileName', zipFileName({ kind: 'tag', owner: 'o', repo: 'r', ref: 'v1.0.0/beta+1' }) === 'r-v1.0.0-beta-1.zip')
check('splitSimpleArgs', JSON.stringify(splitSimpleArgs('  --frozen-lockfile   --prod ')) === JSON.stringify(['--frozen-lockfile', '--prod']))
check('tailOf', tailOf('a\nb\nc', 2) === 'b\nc')
check('currentPlatformId', ['win32', 'darwin', 'linux', 'other'].includes(currentPlatformId()))

// URL-error mapping through a real UrlParseError
const { parseGitHubTarget } = await import('./smoke-github-url.mjs')
try { parseGitHubTarget('https://gitlab.com/a/b') } catch (e) {
  check('badHost mapped to Chinese', /github\.com/.test(describeUrlError(e)), describeUrlError(e))
}

// 5b) known upstream bug in src/pnpm-heal.ts mergeWorkspaceAllowList
// (merging into an existing onlyBuiltDependencies block drops its existing
// entries). Per the t1 contract that shared file must not be modified by the
// host half — the defect is reported to the captain / test-engineer (t3), who
// owns pnpm-heal.ts fixes. No assertion here on purpose.

// 6) apply() end-to-end with service stubs + schema defaults
{
  const { GhInstallSettingsSchema } = await import('./smoke-settings.mjs')
  const defaults = GhInstallSettingsSchema({})
  check('schema defaults', defaults.workRoot === '' && defaults.pnpmInstallArgs === '' && defaults.pnpmBuildArgs === '' && defaults.profile === 'web' && defaults.keepZip === false, JSON.stringify(defaults))
  const registeredNs = []
  const patches = []
  const manifests = []
  const stubCtx = new Context()
  stubCtx.settings = {
    register: (ns, schema, opts) => {
      registeredNs.push({ ns, applies: opts?.applies })
      return {
        get: () => GhInstallSettingsSchema({}),
        update: async (patch) => { patches.push(patch) },
        watch: () => () => {},
      }
    },
  }
  stubCtx.typert = { register: (manifest) => { manifests.push(manifest); return () => {} } }
  host.apply(stubCtx)
  await new Promise((r) => setImmediate(r))
  check('apply registers settings ns', registeredNs.length === 1 && registeredNs[0].ns === 'gh-plugin-install' && registeredNs[0].applies === 'live', JSON.stringify(registeredNs))
  check('apply registers typert manifest', manifests.length === 1 && manifests[0].package === 'dsh-ghplugininstall' && manifests[0].invocations.length === 6, JSON.stringify(manifests.map((m) => [m.package, m.invocations?.length])))
  check('manifest service key', manifests[0]?.model?.services?.[0]?.key === 'ghInstall')
  // settings write path: the runtime apply() registered is reachable as the
  // cordis service `ghInstall` (second construction would rightly throw
  // "service ghInstall has been registered").
  let doubleRegisterThrows = false
  try { new GhInstallRuntime(stubCtx, () => GhInstallSettingsSchema({}), async () => {}) } catch { doubleRegisterThrows = true }
  check('double register rejected', doubleRegisterThrows)
  const rt = stubCtx.ghInstall
  await rt.updateSettings({ field: 'profile', value: 'test' })
  check('settings patch routed', JSON.stringify(patches.at(-1)) === '{"profile":"test"}', JSON.stringify(patches))
}

console.log(failures === 0 ? 'SMOKE PASS' : `SMOKE FAIL (${failures})`)
