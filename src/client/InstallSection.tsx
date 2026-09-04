/**
 * Settings section for the one-click GitHub installer (the「gh插件安装」page
 * inside the settings dialog). Renders the start form (URL + optional target
 * profile), the running job's phase progress and log tail, the selected
 * history job's inline failure/success blocks, and the history list.
 */
import { useMemo, useState, type ReactElement } from 'react'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale, PropsRuntime, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { parseGitHubTarget } from '../github-url.ts'
import type { GhInstallSettings, InstallJob } from '../contract.ts'
import { RUN_PHASES } from './locales.ts'
import type { GhSectionInjected } from './index.ts'

/**
 * The slot-component prop mapping the framework applies to injected faces:
 * every `hooks.xxx` snapshot-store entry arrives as a `useXxx` selector-hook
 * prop, and other inject fields pass through unchanged (the renderer does
 * this mapping at render time — see dsh-at-file's SettingsSection). The
 * workspace's dsh-client-ui-slots type stub ships `InjectFace<T> = T`
 * without the mapping, so the mapped face is derived here.
 */
export type MappedInjectFace<T extends { hooks: Record<string, unknown> }> = Omit<T, 'hooks'> & {
  [K in keyof T['hooks'] as K extends string ? `use${Capitalize<K>}` : never]: T['hooks'][K] extends ObservableSnapshot<infer S>
    ? SnapshotSelectorHook<S>
    : never
}

/** Full section props: runtime share + mapped inject face + locale seat. */
export type GhInstallSectionProps = PropsRuntime<'settings.section'> & MappedInjectFace<GhSectionInjected> & PropsLocale<'gh-plugin-install'>

/** The profile name grammar shared with the wire contract's zod schema. */
const PROFILE_RE = /^[a-z0-9-]+$/u

/** Job phases that keep the job on the "running" card. */
const ACTIVE_PHASES: ReadonlySet<string> = new Set<string>(RUN_PHASES)

/** Badge state for a job row. */
function badgeState(job: InstallJob): 'running' | 'done' | 'failed' {
  if (job.phase === 'done') return 'done'
  if (job.phase === 'failed') return 'failed'
  return 'running'
}

/** Compact timestamp: time-of-day today, full date otherwise. */
function fmtTime(at: number): string {
  const date = new Date(at)
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString()
    : date.toLocaleString()
}

/** The last `limit` log lines of a job (the host keeps the tail already). */
function LogTail({ job, limit, emptyText }: { job: InstallJob; limit: number; emptyText: string }): ReactElement {
  const tail = job.logs.slice(-limit)
  return (
    <pre className="dsh_ghpi_logTail">
      {tail.length === 0
        ? emptyText
        : tail.map((line, index) => (
          <span key={`${line.at}-${index}`} className="dsh_ghpi_logLine" data-stream={line.stream}>
            {line.text}
            {'\n'}
          </span>
        ))}
    </pre>
  )
}

/** Render the installer section. */
export function GhInstallSection({
  useStore,
  viewState,
  start,
  cancelJob,
  dismissJob,
  t,
}: GhInstallSectionProps) {
  const state = useStore(snapshot => snapshot)
  const jobs = state.jobs
  const defaultProfile = (settings => settings === undefined || settings.profile === '' ? 'web' : settings.profile)(state.settings)

  // --- retained view state (mirrored into useState to trigger re-render) ---
  const [advancedOpen, setAdvancedOpenState] = useState(viewState.advancedOpen)
  const setAdvancedOpen = (next: boolean): void => {
    viewState.advancedOpen = next
    setAdvancedOpenState(next)
  }
  const [selectedId, setSelectedIdState] = useState(viewState.selectedJobId)
  const selectJob = (id: string): void => {
    viewState.selectedJobId = id
    setSelectedIdState(id)
  }

  // --- form state ---
  const [url, setUrl] = useState('')
  const [profileOverride, setProfileOverride] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const trimmedUrl = url.trim()
  const parsedTarget = useMemo(() => {
    if (trimmedUrl === '') return undefined
    try {
      return parseGitHubTarget(trimmedUrl)
    } catch {
      return null
    }
  }, [trimmedUrl])
  const urlError = trimmedUrl === ''
    ? undefined
    : parsedTarget === null || parsedTarget === undefined
      ? t('form.badUrl')
      : undefined
  const trimmedProfile = profileOverride.trim()
  const profileError = trimmedProfile === '' || PROFILE_RE.test(trimmedProfile)
    ? undefined
    : t('form.profileInvalid')
  const canStart = parsedTarget !== undefined && parsedTarget !== null
    && urlError === undefined && profileError === undefined
    && !submitting && state.mounted

  const submit = async (): Promise<void> => {
    if (!canStart) return
    setSubmitting(true)
    try {
      await start(trimmedUrl, trimmedProfile === '' ? undefined : trimmedProfile)
    } finally {
      setSubmitting(false)
    }
  }

  // --- job selection ---
  const activeJob = jobs.find(job => job.id === state.runningId)
    ?? jobs.find(job => ACTIVE_PHASES.has(job.phase))
  const terminalJobs = jobs
    .filter(job => !ACTIVE_PHASES.has(job.phase))
    .slice()
    .sort((left, right) => right.updatedAt - left.updatedAt)
  const selectedJob = terminalJobs.find(job => job.id === selectedId) ?? terminalJobs[0]
  const activeStep = activeJob === undefined ? -1 : RUN_PHASES.indexOf(activeJob.phase as (typeof RUN_PHASES)[number])

  return (
    <section className="dsh_ghpi_section" aria-labelledby="dsh-ghpi-title">
      <h2 id="dsh-ghpi-title" className="dsh_ghpi_title">{t('settings.title')}</h2>
      <p className="dsh_ghpi_subtitle">{t('settings.subtitle')}</p>

      {/* ── Start form ── */}
      <div className="dsh_ghpi_card">
        <h3 className="dsh_ghpi_cardTitle">{t('form.url')}</h3>
        <div className="dsh_ghpi_formRow">
          <input
            className="dsh_ghpi_input"
            value={url}
            placeholder={t('form.urlPlaceholder')}
            spellCheck={false}
            aria-invalid={urlError !== undefined}
            aria-describedby="dsh-ghpi-url-message"
            disabled={submitting}
            onChange={event => { setUrl(event.target.value) }}
            onKeyDown={event => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              void submit()
            }}
          />
          <button
            type="button"
            className="dsh_ghpi_startButton"
            disabled={!canStart}
            onClick={() => { void submit() }}
          >
            {submitting ? t('form.starting') : t('form.start')}
          </button>
        </div>
        {urlError === undefined
          ? <div id="dsh-ghpi-url-message" className="dsh_ghpi_hint">{t('form.urlHint')}</div>
          : <div id="dsh-ghpi-url-message" className="dsh_ghpi_errorText">{urlError}</div>}
        {profileError !== undefined && <div className="dsh_ghpi_errorText">{profileError}</div>}
        {state.actionError !== undefined && <div className="dsh_ghpi_errorText">{state.actionError}</div>}
        <button
          type="button"
          className="dsh_ghpi_advancedToggle"
          aria-expanded={advancedOpen}
          onClick={() => { setAdvancedOpen(!advancedOpen) }}
        >
          {advancedOpen ? '▾' : '▸'} {t('form.advanced')}
        </button>
        {advancedOpen && (
          <div className="dsh_ghpi_advancedPanel">
            <label className="dsh_ghpi_field">
              <span className="dsh_ghpi_fieldLabel">{t('form.profile')}</span>
              <input
                className="dsh_ghpi_input"
                value={profileOverride}
                placeholder={defaultProfile}
                spellCheck={false}
                onChange={event => { setProfileOverride(event.target.value) }}
                onKeyDown={event => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  void submit()
                }}
              />
              <span className="dsh_ghpi_hint">{t('form.profileHint')}</span>
            </label>
          </div>
        )}
      </div>

      {/* ── Running job: phase progress + log tail ── */}
      {activeJob !== undefined && (
        <div className="dsh_ghpi_card">
          <div className="dsh_ghpi_phaseTrack">
            {RUN_PHASES.map((phase, index) => (
              <span
                key={phase}
                className="dsh_ghpi_phaseStep"
                data-state={index < activeStep ? 'done' : index === activeStep ? 'current' : 'pending'}
              />
            ))}
          </div>
          <div className="dsh_ghpi_phaseCaption">
            <span className="dsh_ghpi_phaseName">
              {t(`phase.${activeJob.phase}`)} · {activeJob.label === '' ? activeJob.url : activeJob.label}
            </span>
            <span className="dsh_ghpi_phaseCount">
              {t('phase.step', { index: String(activeStep + 1), total: String(RUN_PHASES.length) })}
            </span>
          </div>
          <div className="dsh_ghpi_detailActions">
            <button
              type="button"
              className="dsh_ghpi_ghostButton"
              disabled={cancelling || activeJob.phase !== 'queued'}
              onClick={() => {
                setCancelling(true)
                void cancelJob(activeJob.id).finally(() => { setCancelling(false) })
              }}
            >
              {cancelling ? t('cancelling') : t('cancel')}
            </button>
          </div>
          <LogTail job={activeJob} limit={4} emptyText={t('logs.empty')} />
        </div>
      )}

      {/* ── History list ── */}
      <div className="dsh_ghpi_card">
        <h3 className="dsh_ghpi_cardTitle">{t('history.title')}</h3>
        {terminalJobs.length === 0 ? (
          <div className="dsh_ghpi_empty">{t('history.empty')}</div>
        ) : (
          <div className="dsh_ghpi_historyList">
            {terminalJobs.map(job => {
              const selected = job.id === selectedJob?.id
              const result = job.result
              return (
                <div className="dsh_ghpi_historyRow" key={job.id}>
                  <button
                    type="button"
                    className="dsh_ghpi_historyMain"
                    aria-expanded={selected}
                    onClick={() => { selectJob(selected ? '' : job.id) }}
                  >
                    <span className="dsh_ghpi_badge" data-state={badgeState(job)}>
                      {t(`phase.${job.phase}`)}
                    </span>
                    <span className="dsh_ghpi_historyLabel">
                      {job.label === '' ? job.url : job.label}
                    </span>
                    <span className="dsh_ghpi_historyTime">{fmtTime(job.updatedAt)}</span>
                  </button>
                  {selected && job.phase === 'failed' && (
                    <div className="dsh_ghpi_historyDetail">
                      <div className="dsh_ghpi_errorBlock">
                        <p className="dsh_ghpi_errorTitle">
                          {t('error.title', { phase: t(`phase.${result?.failedPhase ?? 'failed'}`) })}
                        </p>
                        <p className="dsh_ghpi_errorBody">{result?.error ?? '—'}</p>
                      </div>
                      <LogTail job={job} limit={8} emptyText={t('logs.empty')} />
                      <div className="dsh_ghpi_detailActions">
                        <button
                          type="button"
                          className="dsh_ghpi_ghostButton"
                          onClick={() => { void dismissJob(job.id) }}
                        >
                          {t('dismiss')}
                        </button>
                      </div>
                    </div>
                  )}
                  {selected && job.phase === 'done' && (
                    <div className="dsh_ghpi_historyDetail">
                      <div className="dsh_ghpi_successBlock">
                        <p className="dsh_ghpi_successTitle">{t('success.title')}</p>
                        <p className="dsh_ghpi_successText">
                          {t('success.desc', { label: job.label === '' ? job.url : job.label, profile: result?.profile ?? defaultProfile })}
                        </p>
                        {result?.pluginDir !== undefined && (
                          <p className="dsh_ghpi_successText">
                            {t('success.pluginDir', { path: result.pluginDir })}
                          </p>
                        )}
                      </div>
                      <div className="dsh_ghpi_detailActions">
                        <button
                          type="button"
                          className="dsh_ghpi_ghostButton"
                          onClick={() => { void dismissJob(job.id) }}
                        >
                          {t('dismiss')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
