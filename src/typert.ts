/**
 * The hand-written host Typert manifest for the ghInstall Remote. Registered
 * through `ctx.typert.register` in the plugin body, it claims the wire
 * endpoints through the strict registry — the same path generated artifacts
 * use — so the Host Gateway resolves the namespace without consulting the
 * `@Remote` marker table (marker independence matters when the tsx-loaded
 * gateway and a profile-loaded plugin bundle hold separate decorator module
 * state).
 */
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry/types'
import { GH_INSTALL_INVOCATIONS } from './contract.ts'

/** The ghInstall namespace's host manifest (strict codecs shared with the client). */
export const TYPERT_MANIFEST: TypertContribution = {
  package: 'dsh-ghplugininstall',
  face: 'host',
  schemas: [],
  model: {
    services: [
      {
        key: 'ghInstall',
        exportName: 'GhInstallRuntime',
        description: 'One-click GitHub zip plugin installation: download, extract, pnpm build, dsh plugin add.',
        tags: [],
        members: [
          { kind: 'method', name: 'start', signature: 'start(request: InstallRequest): Promise<InstallJob>' },
          { kind: 'method', name: 'list', signature: 'list(): Promise<JobsSnapshot>' },
          { kind: 'method', name: 'cancel', signature: 'cancel(input: { id: string }): Promise<JobsSnapshot>' },
          { kind: 'method', name: 'dismiss', signature: 'dismiss(input: { id: string }): Promise<JobsSnapshot>' },
          { kind: 'method', name: 'getSettings', signature: 'getSettings(): GhInstallSettings' },
          { kind: 'method', name: 'updateSettings', signature: 'updateSettings(update: GhInstallSettingsUpdate): Promise<GhInstallSettings>' },
        ],
        types: [],
      },
    ],
    events: [],
    objects: [],
  },
  invocations: GH_INSTALL_INVOCATIONS,
}
