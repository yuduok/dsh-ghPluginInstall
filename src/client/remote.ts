/**
 * The client-side Typert Remote contribution for the dsh-ghplugininstall host
 * service: mounts the shared strict descriptors into `ctx.remote.ghInstall`.
 * The descriptors and codecs come from the shared contract module, so the
 * browser bundle and the host manifest stay on one wire definition.
 */
import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { GH_INSTALL_INVOCATIONS } from '../contract.ts'
import type { GhInstallSettings, GhInstallSettingsUpdate, InstallJob, JobsSnapshot, InstallRequest } from '../contract.ts'

export type { GhInstallSettings, GhInstallSettingsUpdate, InstallJob, JobsSnapshot, InstallRequest } from '../contract.ts'

/** The ghInstall Remote namespace's client contribution. */
export const GH_INSTALL_REMOTE: TypertRemoteContribution = {
  package: 'dsh-ghplugininstall',
  descriptors: GH_INSTALL_INVOCATIONS,
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  // Typed face of the mounted namespace. Note: the runtime access is NOT the
  // dotted `ctx.remote.ghInstall` read — that path walks the cordis fiber chain
  // and stops at the Loader's runtime-less internal forks between a plugin
  // entry and the root fiber. The plugin resolves the namespace service
  // through `ctx.reflect.get('remote.ghInstall')` instead (see client/index.ts).
  /** The `ghInstall` namespace face mounted under `ctx.remote.ghInstall`. */
  interface TypertRemoteNamespace$6768496e7374616c6c {
    start: (request: InstallRequest) => Promise<RemoteResult<InstallJob>>
    list: () => Promise<RemoteResult<JobsSnapshot>>
    cancel: (input: { id: string }) => Promise<RemoteResult<JobsSnapshot>>
    dismiss: (input: { id: string }) => Promise<RemoteResult<JobsSnapshot>>
    getSettings: () => Promise<RemoteResult<GhInstallSettings>>
    updateSettings: (update: GhInstallSettingsUpdate) => Promise<RemoteResult<GhInstallSettings>>
  }
  interface TypertRemoteMap {
    'ghInstall/start': (request: InstallRequest) => Promise<RemoteResult<InstallJob>>
    'ghInstall/list': () => Promise<RemoteResult<JobsSnapshot>>
    'ghInstall/cancel': (input: { id: string }) => Promise<RemoteResult<JobsSnapshot>>
    'ghInstall/dismiss': (input: { id: string }) => Promise<RemoteResult<JobsSnapshot>>
    'ghInstall/getSettings': () => Promise<RemoteResult<GhInstallSettings>>
    'ghInstall/updateSettings': (update: GhInstallSettingsUpdate) => Promise<RemoteResult<GhInstallSettings>>
  }
  interface TypertRemoteNamespaceMap {
    ghInstall: TypertRemoteNamespace$6768496e7374616c6c
  }
}
