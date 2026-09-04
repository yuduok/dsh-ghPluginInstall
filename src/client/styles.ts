/**
 * The gh-plugin-install stylesheet, hand-written as a template string and
 * injected once by the plugin body: the web server serves exactly one file
 * per client plugin, so no separate CSS artifact may exist. Tokens come only
 * from the shared `--dsw-alias-*` design platform (no literal colors); class
 * names carry the `dsh_ghpi_` prefix to stay unique in the assembled shell.
 */

/** Stable `<style>` element id (idempotent injection across HMR re-runs). */
export const STYLE_ID = 'dsh-ghplugininstall-style'

/** The installer's injected stylesheet text. */
export const cssText = `
/* ── Settings section shell ── */
.dsh_ghpi_section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.dsh_ghpi_title {
  margin: 0;
  color: var(--dsw-alias-label-primary);
  font-size: 18px;
  line-height: 26px;
  font-weight: 600;
}
.dsh_ghpi_subtitle {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 20px;
}
.dsh_ghpi_card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: 14px 16px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
}
.dsh_ghpi_cardTitle {
  margin: 0;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  line-height: 22px;
  font-weight: 600;
}

/* ── Start form ── */
.dsh_ghpi_fieldLabel {
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}
.dsh_ghpi_input {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  outline: none;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
}
.dsh_ghpi_input:focus {
  border-color: var(--dsw-alias-brand-primary);
}
.dsh_ghpi_input:disabled {
  opacity: 0.55;
}
.dsh_ghpi_input[aria-invalid='true'] {
  border-color: var(--dsw-alias-state-error-primary);
}
.dsh_ghpi_formRow {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}
.dsh_ghpi_formRow .dsh_ghpi_input {
  flex: 1 1 260px;
  width: auto;
}
.dsh_ghpi_advancedToggle {
  align-self: flex-start;
  padding: 0;
  border: 0;
  background: none;
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}
.dsh_ghpi_advancedToggle:hover {
  color: var(--dsw-alias-label-primary);
}
.dsh_ghpi_advancedPanel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px dashed var(--dsw-alias-border-l2);
  border-radius: 8px;
}
.dsh_ghpi_field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.dsh_ghpi_hint {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
.dsh_ghpi_errorText {
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
}
.dsh_ghpi_startButton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex: none;
  height: 34px;
  padding: 0 16px;
  border: 0;
  border-radius: 17px;
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-inverted);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  cursor: pointer;
}
.dsh_ghpi_startButton:disabled {
  opacity: 0.45;
  cursor: default;
}
.dsh_ghpi_ghostButton {
  flex: none;
  min-height: 26px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 13px;
  background: none;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}
.dsh_ghpi_ghostButton:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dsh_ghpi_ghostButton:disabled {
  opacity: 0.45;
  cursor: default;
}

/* ── Phase progress + logs ── */
.dsh_ghpi_phaseTrack {
  display: flex;
  gap: 4px;
  min-width: 0;
}
.dsh_ghpi_phaseStep {
  flex: 1 1 0;
  height: 4px;
  border-radius: 2px;
  background: var(--dsw-alias-border-l2);
}
.dsh_ghpi_phaseStep[data-state='current'] {
  background: var(--dsw-alias-brand-primary);
}
.dsh_ghpi_phaseStep[data-state='done'] {
  background: var(--dsw-alias-brand-primary);
  opacity: 0.45;
}
.dsh_ghpi_phaseCaption {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}
.dsh_ghpi_phaseName {
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 20px;
  font-weight: 600;
}
.dsh_ghpi_phaseCount {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
.dsh_ghpi_logTail {
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1));
  color: var(--dsw-alias-label-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 18px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 132px;
  overflow: auto;
}
.dsh_ghpi_logLine[data-stream='stderr'] {
  color: var(--dsw-alias-state-error-primary);
}

/* ── Failure / success blocks ── */
.dsh_ghpi_errorBlock {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--dsw-alias-state-error-primary);
  border-radius: 8px;
}
.dsh_ghpi_errorTitle {
  margin: 0;
  color: var(--dsw-alias-state-error-primary);
  font-size: 13px;
  line-height: 20px;
  font-weight: 600;
}
.dsh_ghpi_errorBody {
  margin: 0;
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.dsh_ghpi_successBlock {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--dsw-alias-brand-primary);
  border-radius: 8px;
}
.dsh_ghpi_successTitle {
  margin: 0;
  color: var(--dsw-alias-brand-primary);
  font-size: 13px;
  line-height: 20px;
  font-weight: 600;
}
.dsh_ghpi_successText {
  margin: 0;
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
}
.dsh_ghpi_code {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 16px;
  overflow-wrap: anywhere;
}

/* ── History list ── */
.dsh_ghpi_historyList {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
}
.dsh_ghpi_historyRow + .dsh_ghpi_historyRow {
  border-top: 1px solid var(--dsw-alias-border-l1);
}
.dsh_ghpi_historyMain {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
  min-height: 40px;
  padding: 6px 12px;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.dsh_ghpi_historyMain:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh_ghpi_historyLabel {
  min-width: 0;
  flex: 1 1 180px;
  overflow: hidden;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh_ghpi_historyTime {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
.dsh_ghpi_badge {
  flex: none;
  padding: 2px 6px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 4px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
}
.dsh_ghpi_badge[data-state='running'] {
  border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-brand-primary);
}
.dsh_ghpi_badge[data-state='done'] {
  border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-brand-primary);
  opacity: 0.7;
}
.dsh_ghpi_badge[data-state='failed'] {
  border-color: var(--dsw-alias-state-error-primary);
  color: var(--dsw-alias-state-error-primary);
}
.dsh_ghpi_historyDetail {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 4px 12px 12px;
}
.dsh_ghpi_detailRow {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}
.dsh_ghpi_detailActions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}
.dsh_ghpi_empty {
  padding: 16px 12px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 20px;
  text-align: center;
}

/* ── Toasts (shell.overlay occupant) ── */
.dsh_ghpi_toasts {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 2147483000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 360px;
  max-width: calc(100vw - 32px);
  pointer-events: none;
}
.dsh_ghpi_toast {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-left-width: 3px;
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.16);
  cursor: pointer;
}
.dsh_ghpi_toast[data-kind='success'] {
  border-left-color: var(--dsw-alias-brand-primary);
}
.dsh_ghpi_toast[data-kind='error'] {
  border-left-color: var(--dsw-alias-state-error-primary);
}
.dsh_ghpi_toastMain {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1 1 auto;
}
.dsh_ghpi_toastTitle {
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 20px;
  font-weight: 600;
}
.dsh_ghpi_toast[data-kind='error'] .dsh_ghpi_toastTitle {
  color: var(--dsw-alias-state-error-primary);
}
.dsh_ghpi_toastBody {
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.dsh_ghpi_toastBody[data-expanded='true'] {
  display: block;
  max-height: 140px;
  overflow: auto;
}
.dsh_ghpi_toastHint {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
}
.dsh_ghpi_toastClose {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 11px;
  background: none;
  color: var(--dsw-alias-label-dimmed);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}
.dsh_ghpi_toastClose:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
`

/**
 * Inject the installer stylesheet once (stable id; HMR-safe).
 */
export function adoptStyles(): void {
  if (document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  // Mark ownership explicitly so DSH client HMR cannot attribute this tag to
  // whichever plugin happens to materialize after dsh-ghplugininstall.
  style.dataset.plugin = 'dsh-ghplugininstall'
  style.dataset.pluginCss = STYLE_ID
  style.textContent = cssText
  document.head.appendChild(style)
}
