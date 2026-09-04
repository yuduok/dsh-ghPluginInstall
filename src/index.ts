/**
 * dsh-ghplugininstall host plugin: mounts the `ghInstall` Typert Remote
 * service (one-click GitHub zip plugin installation for the Web settings
 * page), registers the strict Typert manifest, and registers the durable
 * `gh-plugin-install` settings namespace. The client half (settings section,
 * toasts, polling) ships in the same package under `./client`.
 */
import type { Context } from '@deepseek-ai/cordis'
// Type-only: brings the `ctx.typert` Context merge into this program.
import type {} from '@deepseek-ai/dsh-typert-registry'
// Type-only: brings the `ctx.settings` Context merge in.
import type {} from '@deepseek-ai/dsh-settings'
import { GhInstallRuntime } from './installer.ts'
import { TYPERT_MANIFEST } from './typert.ts'
import { registerGhInstallSettings } from './settings.ts'
import type { GhInstallSettings, GhInstallSettingsUpdate } from './contract.ts'

/** Cordis plugin name (the Loader entry and client bundle id). */
export const name = 'dsh-ghplugininstall'

/** Services required before load: the Typert registry and the settings provider. */
export const inject = ['typert', 'settings']

/**
 * Mount the ghInstall service, the settings namespace, and the wire manifest.
 * @param ctx - host cordis context.
 */
export function apply(ctx: Context): void {
  // The durable settings section; the runtime reads its live value per call.
  const settings = registerGhInstallSettings(ctx)
  const readSettings = (): GhInstallSettings => settings.get()
  const writeSettings = async (update: GhInstallSettingsUpdate): Promise<void> => {
    await settings.update({ [update.field]: update.value })
  }

  new GhInstallRuntime(ctx, readSettings, writeSettings)

  // Strict endpoint registration: the gateway resolves ghInstall/<method>
  // from this manifest, independent of decorator marker state.
  ctx.effect(() => {
    const dispose = ctx.typert.register(TYPERT_MANIFEST)
    return () => {
      void dispose()
    }
  }, 'dsh-ghplugininstall: typert manifest')
}
