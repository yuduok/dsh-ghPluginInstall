/**
 * The `gh-plugin-install` settings namespace: the durable work root, extra
 * pnpm arguments, the target profile, and the zip retention switch. Managed
 * from the Web settings page (「gh插件安装」section) through the remote
 * `getSettings`/`updateSettings` methods; every read goes through the owner
 * scope's live value, so changes take effect without a restart.
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { settingsNamespace, type SettingsScope } from '@deepseek-ai/dsh-settings'
import type { GhInstallSettings } from './contract.ts'

/** The branded namespace name (the Web allowlist must list the same string). */
export const GH_INSTALL_NAMESPACE = settingsNamespace('gh-plugin-install')

/** Schemastery schema of the `gh-plugin-install` namespace section. */
export const GhInstallSettingsSchema: z<GhInstallSettings> = z.object({
  // 空 = 跟随平台默认下载目录（downloadsDir）。
  workRoot: z.string().default(''),
  pnpmInstallArgs: z.string().default(''),
  pnpmBuildArgs: z.string().default(''),
  // 空字符串 = 回落到 'web'。
  profile: z.string().default('web'),
  // 默认不保留：成功后删除下载的 zip（下载过程本身就在下载目录完成）。
  keepZip: z.boolean().default(false),
})

/**
 * Register the namespace with the settings provider and return its owner scope.
 * @param ctx - the plugin context carrying the settings provider.
 * @returns the owner scope backing the runtime's live settings reads.
 */
export function registerGhInstallSettings(ctx: Context): SettingsScope<GhInstallSettings> {
  return ctx.settings.register(GH_INSTALL_NAMESPACE, GhInstallSettingsSchema, { applies: 'live' })
}
