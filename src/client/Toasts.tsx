/**
 * Toast stack for the gh-plugin-install plugin, registered into the
 * `shell.overlay` seat (list slot, root scope, click-through shell). The
 * poller pushes a toast when a job settles; entries auto-dismiss after 8 s
 * and can be closed manually. Clicking a toast expands its full failure
 * reason (the concrete `job.result.error`).
 */
import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { MappedInjectFace } from './InstallSection.tsx'
import type { GhToastsInjected } from './index.ts'
import { NS } from './locales.ts'

/** Full overlay props: runtime share + mapped inject face + locale seat. */
export type GhToastsProps = PropsRuntime<'shell.overlay'> & MappedInjectFace<GhToastsInjected> & PropsLocale<'gh-plugin-install'>

/** Auto-dismiss delay for one toast (ms). */
const TOAST_TTL_MS = 8000

/** Render the toast stack (nothing while empty). */
export function GhToasts({
  useToasts,
  closeToast,
  t,
}: GhToastsProps): ReactElement | null {
  const items = useToasts(snap => snap.items)

  // Auto-dismiss: one timer per entry id, re-armed when the stack changes.
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())
  useEffect(() => {
    const armed = timers.current
    for (const item of items) {
      if (armed.has(item.id)) continue
      armed.set(item.id, setTimeout(() => { closeToast(item.id) }, TOAST_TTL_MS))
    }
    for (const [id, timer] of armed) {
      if (!items.some(item => item.id === id)) {
        clearTimeout(timer)
        armed.delete(id)
      }
    }
    return () => {
      for (const timer of armed.values()) clearTimeout(timer)
      armed.clear()
    }
  }, [items, closeToast])

  // Expanded detail per toast (click to toggle).
  const [expanded, setExpanded] = useState(() => new Set<number>())
  const toggle = (id: number): void => {
    setExpanded(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (items.length === 0) return null

  return (
    <div className="dsh_ghpi_toasts" role="status" aria-live="polite">
      {items.map(item => {
        const open = expanded.has(item.id)
        return (
          <div
            key={item.id}
            className="dsh_ghpi_toast"
            data-kind={item.kind}
            role="status"
            onClick={() => { toggle(item.id) }}
          >
            <div className="dsh_ghpi_toastMain">
              <span className="dsh_ghpi_toastTitle">{item.title}</span>
              <span className="dsh_ghpi_toastBody" data-expanded={open}>{item.body}</span>
              {item.kind === 'error' && !open && <span className="dsh_ghpi_toastHint">{t('toast.detail')}</span>}
            </div>
            <button
              type="button"
              className="dsh_ghpi_toastClose"
              aria-label={t('toast.close')}
              onClick={event => {
                event.stopPropagation()
                closeToast(item.id)
              }}
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
