/**
 * dsh-ghplugininstall client plugin: the browser half of the one-click GitHub
 * installer. Mounts the ghInstall Remote namespace, registers the settings
 * section (「gh插件安装」in the nav) and the toast overlay, and drives the
 * shared snapshot store with a 1.2s list() poll (toast detection included;
 * poll failures stay silent in the UI and go to the console).
 */
// Type-only: brings the settings.section SlotMap declaration into this program.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: brings the ctx.locale Context merge into this program.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext, ObservableSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { TypertClientRemote, TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type { GhInstallSettings, InstallJob, JobsSnapshot } from '../contract.ts'
import { GH_INSTALL_REMOTE } from './remote.ts'
import { GhInstallSection } from './InstallSection.tsx'
import { GhToasts } from './Toasts.tsx'
import { NS, en, zh, fmt } from './locales.ts'
import { adoptStyles } from './styles.ts'

/** Required services: the Remote mount face, slots, and locale. */
export const inject = ['remote', 'slots', 'locale']

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * Mirrors the `shell.overlay` seat that @deepseek-ai/dsh-client-ui-layout
     * declares at runtime (that package is not linked in this workspace's
     * type environment, so the shape is restated here; identical to the
     * shipped declaration, so the merges stay compatible).
     */
    'shell.overlay': { kind: 'list'; scope: 'root' }
  }
}

/** The mounted ghInstall namespace service's callable face. */
type GhInstallRemoteFace = TypertRemoteNamespaceMap['ghInstall']

/** Poll cadence for the job list (the host owns the single-lane worker). */
const POLL_INTERVAL_MS = 1200

/** Poller-written client state (one snapshot store). */
interface GhInstallState {
  /** Every job the host knows about (host order; the UI sorts for display). */
  jobs: readonly InstallJob[]
  /** The job currently executing on the host's single-lane worker. */
  runningId?: string
  /** Durable settings (the advanced panel's default profile), or until the first read. */
  settings: GhInstallSettings | undefined
  /** True once one list() round-trip succeeded. */
  mounted: boolean
  /** The last start/cancel/dismiss failure, shown inline near the form. */
  actionError: string | undefined
}

/** One toast entry (a point-in-time copy of the job it reports). */
interface GhToastItem {
  readonly id: number
  readonly kind: 'success' | 'error'
  readonly title: string
  readonly body: string
  /** The job snapshot at toast time; backs the click-to-expand detail. */
  readonly job?: InstallJob
}

/** Ephemeral section navigation retained while the plugin stays mounted. */
interface GhSectionViewState {
  advancedOpen: boolean
  selectedJobId: string | undefined
}

/** Injected business face of the settings section component. */
export interface GhSectionInjected {
  hooks: { store: ObservableSnapshot<GhInstallState> }
  viewState: GhSectionViewState
  start: (url: string, profileOverride?: string) => Promise<void>
  cancelJob: (id: string) => Promise<void>
  dismissJob: (id: string) => Promise<void>
}

/** Injected business face of the toast overlay component. */
export interface GhToastsInjected {
  hooks: { toasts: ObservableSnapshot<{ items: readonly GhToastItem[] }> }
  closeToast: (id: number) => void
}

/**
 * Compose the installer surface.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  adoptStyles()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-ghplugininstall: dictionaries')

  const store = createSnapshotStore<GhInstallState>({
    jobs: [],
    runningId: undefined,
    settings: undefined,
    mounted: false,
    actionError: undefined,
  })
  const toasts = createSnapshotStore<{ items: readonly GhToastItem[] }>({ items: [] })
  const viewState: GhSectionViewState = { advancedOpen: false, selectedJobId: undefined }
  const t = ctx.locale.bind(NS)

  // --- toast plumbing -------------------------------------------------------
  let toastSeq = 0
  const pushToast = (item: Omit<GhToastItem, 'id'>): void => {
    toastSeq += 1
    toasts.set({ items: [...toasts.getSnapshot().items, { ...item, id: toastSeq }] })
  }
  const closeToast = (id: number): void => {
    toasts.set({ items: toasts.getSnapshot().items.filter(entry => entry.id !== id) })
  }

  // --- remote face ----------------------------------------------------------
  // The mounted namespace handle resolves through the service store
  // (`ctx.reflect.get`), not through the dotted `ctx.remote.ghInstall` read:
  // that path walks the cordis fiber chain, which stops at the Loader's
  // runtime-less internal forks between a plugin entry and the root fiber
  // (see remote.ts; same pattern as dsh-at-file).
  let ghInstall: GhInstallRemoteFace | undefined

  // Job ids already reported through a toast, so the first snapshot after a
  // page load (full of historical failures) stays silent.
  const reported = new Set<string>()
  let primed = false

  const reportToasts = (snapshot: JobsSnapshot, silent: boolean): void => {
    for (const job of snapshot.jobs) {
      if (job.phase !== 'done' && job.phase !== 'failed') continue
      if (reported.has(job.id)) continue
      reported.add(job.id)
      if (silent) continue
      const label = job.label === '' ? job.url : job.label
      if (job.phase === 'done') {
        pushToast({ kind: 'success', title: t('toast.successTitle'), body: fmt(t('toast.successDesc'), { label }), job })
      } else {
        // The concrete failure reason rides the toast body; the expanded
        // detail (click) carries the whole job snapshot.
        pushToast({ kind: 'error', title: t('toast.failedTitle'), body: job.result?.error ?? t('error.detail'), job })
      }
    }
  }

  const applySnapshot = (snapshot: JobsSnapshot): void => {
    const silent = !primed
    primed = true
    reportToasts(snapshot, silent)
    store.update(draft => {
      draft.jobs = snapshot.jobs
      draft.runningId = snapshot.runningId
    })
  }

  const poll = async (): Promise<void> => {
    const face = ghInstall
    if (face === undefined) return
    try {
      const result = await face.list()
      if (ghInstall !== face) return
      if (!result.ok) {
        console.warn('[dsh-ghplugininstall] list failed:', result.error.message)
        return
      }
      applySnapshot(result.value)
      store.update(draft => { draft.mounted = true })
    } catch (error) {
      // Poll failures stay silent in the UI (transient gateway hiccups must
      // not flash errors on every settings open); the console keeps the trace.
      console.warn('[dsh-ghplugininstall] poll failed:', error)
    }
  }

  const loadSettings = async (): Promise<void> => {
    const face = ghInstall
    if (face === undefined) return
    try {
      const result = await face.getSettings()
      if (ghInstall !== face) return
      if (!result.ok) {
        console.warn('[dsh-ghplugininstall] settings read failed:', result.error.message)
        return
      }
      store.update(draft => { draft.settings = result.value })
    } catch (error) {
      console.warn('[dsh-ghplugininstall] settings read failed:', error)
    }
  }

  // --- user actions ---------------------------------------------------------
  const start = async (url: string, profileOverride?: string): Promise<void> => {
    const face = ghInstall
    if (face === undefined) {
      store.update(draft => { draft.actionError = t('remote.unmounted') })
      return
    }
    const request = profileOverride === undefined || profileOverride === '' ? { url } : { url, profile: profileOverride }
    try {
      const result = await face.start(request)
      if (ghInstall !== face) return
      if (!result.ok) {
        store.update(draft => { draft.actionError = fmt(t('remote.startFailed'), { message: result.error.message }) })
        return
      }
      const job = result.value
      store.update(draft => {
        draft.actionError = undefined
        draft.mounted = true
        draft.jobs = [job, ...draft.jobs.filter(entry => entry.id !== job.id)]
      })
      // The queued job shows up on the next poll anyway; poll now for snappiness.
      void poll()
    } catch (error) {
      store.update(draft => { draft.actionError = fmt(t('remote.startFailed'), { message: String(error) }) })
    }
  }

  const mutate = async (method: 'cancel' | 'dismiss', id: string): Promise<void> => {
    const face = ghInstall
    if (face === undefined) return
    try {
      const result = await face[method]({ id })
      if (ghInstall !== face) return
      if (!result.ok) {
        store.update(draft => { draft.actionError = result.error.message })
        return
      }
      store.update(draft => { draft.actionError = undefined })
      applySnapshot(result.value)
    } catch (error) {
      store.update(draft => { draft.actionError = String(error) })
    }
  }
  const cancelJob = (id: string): Promise<void> => mutate('cancel', id)
  const dismissJob = (id: string): Promise<void> => mutate('dismiss', id)

  // --- effects --------------------------------------------------------------
  ctx.effect(async () => {
    const remote = (ctx as unknown as { remote: TypertClientRemote }).remote
    const dispose = await remote.$mount(GH_INSTALL_REMOTE)
    ghInstall = (ctx.reflect as unknown as { get(name: string): unknown }).get('remote.ghInstall') as GhInstallRemoteFace | undefined
    if (ghInstall === undefined) {
      throw new Error('dsh-ghplugininstall: the ghInstall Remote namespace did not mount')
    }
    await loadSettings()
    void poll()
    return () => {
      ghInstall = undefined
      void dispose()
    }
  }, 'dsh-ghplugininstall: remote')

  // A reconnect may have rebuilt the host: repull settings and jobs.
  ctx.effect(() => {
    const off = ctx.on('connection/reset', () => {
      reported.clear()
      void loadSettings()
      void poll()
    })
    return () => { off() }
  }, 'dsh-ghplugininstall: reconnect refresh')

  ctx.effect(() => {
    const timer = window.setInterval(() => { void poll() }, POLL_INTERVAL_MS)
    return () => { window.clearInterval(timer) }
  }, 'dsh-ghplugininstall: job poll')

  // --- slots ------------------------------------------------------------------
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'gh-plugin-install',
    order: 60,
    label: () => t('nav'),
    locale: NS,
    inject: (): GhSectionInjected => ({
      hooks: { store },
      viewState,
      start,
      cancelJob,
      dismissJob,
    }),
  }, GhInstallSection))

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'gh-plugin-install-toasts',
    order: 200,
    locale: NS,
    inject: (): GhToastsInjected => ({
      hooks: { toasts },
      closeToast,
    }),
  }, GhToasts))
}
