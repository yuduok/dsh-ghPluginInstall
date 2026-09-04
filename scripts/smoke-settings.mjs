// src/settings.ts
import z from "@deepseek-ai/schemastery";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";
var GH_INSTALL_NAMESPACE = settingsNamespace("gh-plugin-install");
var GhInstallSettingsSchema = z.object({
  // 空 = 跟随平台默认下载目录（downloadsDir）。
  workRoot: z.string().default(""),
  pnpmInstallArgs: z.string().default(""),
  pnpmBuildArgs: z.string().default(""),
  // 空字符串 = 回落到 'web'。
  profile: z.string().default("web"),
  // 默认不保留：成功后删除下载的 zip（下载过程本身就在下载目录完成）。
  keepZip: z.boolean().default(false)
});
function registerGhInstallSettings(ctx) {
  return ctx.settings.register(GH_INSTALL_NAMESPACE, GhInstallSettingsSchema, { applies: "live" });
}
export {
  GH_INSTALL_NAMESPACE,
  GhInstallSettingsSchema,
  registerGhInstallSettings
};
