/**
 * The ghInstall wire contract, shared verbatim by the host manifest
 * (`ctx.typert.register` in typert.ts) and the client contribution
 * (`ctx.remote.$mount` in client/remote.ts). One source of truth for the
 * install job shapes, the settings section, and the strict zod codecs.
 */
import { z } from 'zod'
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol'

/** Lifecycle phase of one install job. */
export type JobPhase =
  | 'queued'        // accepted, waiting for the single-lane worker
  | 'downloading'   // fetching the zip
  | 'extracting'    // unzipping + flattening
  | 'installing'    // pnpm i (with approve-builds healing)
  | 'building'      // pnpm run build
  | 'registering'   // dsh plugin --profile web add <dir>
  | 'done'
  | 'failed'

/** Every phase a job passes through, in order. */
export const JOB_PHASES: readonly JobPhase[] = [
  'queued', 'downloading', 'extracting', 'installing', 'building', 'registering', 'done', 'failed',
] as const

export const jobPhaseSchema = z.enum(JOB_PHASES)

/** One log line attached to a job. */
export interface JobLogLine {
  readonly at: number          // epoch ms
  readonly phase: JobPhase
  readonly text: string        // one console line (already trimmed)
  readonly stream: 'stdout' | 'stderr' | 'info'
}

export const jobLogLineSchema = z.object({
  at: z.number().int(),
  phase: jobPhaseSchema,
  text: z.string(),
  stream: z.enum(['stdout', 'stderr', 'info']),
})

/** Terminal outcome of a job. */
export interface JobResult {
  readonly ok: boolean
  /** Failure reason (user-facing); empty on success. */
  readonly error?: string
  /** The phase that failed, when the job failed. */
  readonly failedPhase?: JobPhase
  /** The final plugin directory that was handed to `dsh plugin add`. */
  readonly pluginDir?: string
  /** The profile the plugin was added to. */
  readonly profile?: string
}

export const jobResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  failedPhase: jobPhaseSchema.optional(),
  pluginDir: z.string().optional(),
  profile: z.string().optional(),
})

/** Full state of one install job (a snapshot for polling). */
export interface InstallJob {
  readonly id: string
  readonly url: string
  readonly label: string
  readonly phase: JobPhase
  readonly createdAt: number
  readonly updatedAt: number
  readonly logs: readonly JobLogLine[]
  readonly result?: JobResult
}

export const installJobSchema = z.object({
  id: z.string().min(1),
  url: z.string(),
  label: z.string(),
  phase: jobPhaseSchema,
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  logs: z.array(jobLogLineSchema),
  result: jobResultSchema.optional(),
}).readonly()

/** Job list summary (the poll payload). */
export interface JobsSnapshot {
  readonly jobs: readonly InstallJob[]
  readonly runningId?: string
}

export const jobsSnapshotSchema = z.object({
  jobs: z.array(installJobSchema),
  runningId: z.string().optional(),
}).readonly()

/** Request body for starting an install. */
export interface InstallRequest {
  readonly url: string
  /** Optional explicit profile name; defaults to the plugin's target profile. */
  readonly profile?: string
}

export const installRequestSchema = z.object({
  url: z.string().min(1),
  profile: z.string().min(1).regex(/^[a-z0-9-]+$/u).optional(),
}).readonly()

/** Request body for cancelling a queued job or dismissing a failed one. */
export const jobIdSchema = z.object({ id: z.string().min(1) }).readonly()

/** Durable settings for the settings section. */
export interface GhInstallSettings {
  /** Where extracted plugin folders are placed (absolute). Empty = platform default. */
  readonly workRoot: string
  /** Extra pnpm arguments for the install phase. */
  readonly pnpmInstallArgs: string
  /** Extra pnpm arguments for the build phase. */
  readonly pnpmBuildArgs: string
  /** Profile used by `dsh plugin --profile <p> add`. */
  readonly profile: string
  /** Keep the downloaded zip after a successful install. */
  readonly keepZip: boolean
}

export const ghInstallSettingsSchema = z.object({
  workRoot: z.string(),
  pnpmInstallArgs: z.string(),
  pnpmBuildArgs: z.string(),
  profile: z.string().regex(/^[a-z0-9-]*$/u),
  keepZip: z.boolean(),
}).readonly()

/** One settings field update. */
export type GhInstallSettingsUpdate =
  | { readonly field: 'workRoot'; readonly value: string }
  | { readonly field: 'pnpmInstallArgs'; readonly value: string }
  | { readonly field: 'pnpmBuildArgs'; readonly value: string }
  | { readonly field: 'profile'; readonly value: string }
  | { readonly field: 'keepZip'; readonly value: boolean }

export const ghInstallSettingsUpdateSchema = z.discriminatedUnion('field', [
  z.object({ field: z.literal('workRoot'), value: z.string() }).readonly(),
  z.object({ field: z.literal('pnpmInstallArgs'), value: z.string() }).readonly(),
  z.object({ field: z.literal('pnpmBuildArgs'), value: z.string() }).readonly(),
  z.object({ field: z.literal('profile'), value: z.string() }).readonly(),
  z.object({ field: z.literal('keepZip'), value: z.boolean() }).readonly(),
])

/** The strict wire codecs for one field update (union member shapes above). */
export const ghInstallSettingsUpdateUnionSchema = z.union([
  z.object({ field: z.literal('workRoot'), value: z.string() }).readonly(),
  z.object({ field: z.literal('pnpmInstallArgs'), value: z.string() }).readonly(),
  z.object({ field: z.literal('pnpmBuildArgs'), value: z.string() }).readonly(),
  z.object({ field: z.literal('profile'), value: z.string() }).readonly(),
  z.object({ field: z.literal('keepZip'), value: z.boolean() }).readonly(),
])

/**
 * The ghInstall Remote namespace's strict invocation descriptors. Every
 * method is `direct`; parameters travel as JSON.
 */
export const GH_INSTALL_INVOCATIONS: readonly InvocationDescriptor[] = [
  {
    id: 'dsh-ghplugininstall#ghInstall/start',
    service: 'ghInstall',
    namespace: 'ghInstall',
    method: 'start',
    invocation: { kind: 'direct' },
    parameters: [
      {
        name: 'request',
        wire: 'request',
        source: 'json',
        codec: { mode: 'strict', typeSymbol: 'dsh-ghplugininstall#InstallRequest', schema: installRequestSchema },
      },
    ],
    result: {
      mode: 'strict',
      typeSymbol: 'dsh-ghplugininstall#InstallJob',
      schema: installJobSchema,
    },
  },
  {
    id: 'dsh-ghplugininstall#ghInstall/list',
    service: 'ghInstall',
    namespace: 'ghInstall',
    method: 'list',
    invocation: { kind: 'direct' },
    parameters: [],
    result: {
      mode: 'strict',
      typeSymbol: 'dsh-ghplugininstall#JobsSnapshot',
      schema: jobsSnapshotSchema,
    },
  },
  {
    id: 'dsh-ghplugininstall#ghInstall/cancel',
    service: 'ghInstall',
    namespace: 'ghInstall',
    method: 'cancel',
    invocation: { kind: 'direct' },
    parameters: [
      {
        name: 'input',
        wire: 'input',
        source: 'json',
        codec: { mode: 'strict', typeSymbol: 'dsh-ghplugininstall#jobId', schema: jobIdSchema },
      },
    ],
    result: {
      mode: 'strict',
      typeSymbol: 'dsh-ghplugininstall#JobsSnapshot',
      schema: jobsSnapshotSchema,
    },
  },
  {
    id: 'dsh-ghplugininstall#ghInstall/dismiss',
    service: 'ghInstall',
    namespace: 'ghInstall',
    method: 'dismiss',
    invocation: { kind: 'direct' },
    parameters: [
      {
        name: 'input',
        wire: 'input',
        source: 'json',
        codec: { mode: 'strict', typeSymbol: 'dsh-ghplugininstall#jobId', schema: jobIdSchema },
      },
    ],
    result: {
      mode: 'strict',
      typeSymbol: 'dsh-ghplugininstall#JobsSnapshot',
      schema: jobsSnapshotSchema,
    },
  },
  {
    id: 'dsh-ghplugininstall#ghInstall/getSettings',
    service: 'ghInstall',
    namespace: 'ghInstall',
    method: 'getSettings',
    invocation: { kind: 'direct' },
    parameters: [],
    result: {
      mode: 'strict',
      typeSymbol: 'dsh-ghplugininstall#GhInstallSettings',
      schema: ghInstallSettingsSchema,
    },
  },
  {
    id: 'dsh-ghplugininstall#ghInstall/updateSettings',
    service: 'ghInstall',
    namespace: 'ghInstall',
    method: 'updateSettings',
    invocation: { kind: 'direct' },
    parameters: [
      {
        name: 'update',
        wire: 'update',
        source: 'json',
        codec: { mode: 'strict', typeSymbol: 'dsh-ghplugininstall#GhInstallSettingsUpdate', schema: ghInstallSettingsUpdateUnionSchema },
      },
    ],
    result: {
      mode: 'strict',
      typeSymbol: 'dsh-ghplugininstall#GhInstallSettings',
      schema: ghInstallSettingsSchema,
    },
  },
]
