/**
 * `gh-plugin-install` locale namespace: the settings-page installer copy and
 * the toast texts. Chinese is the product copy; English mirrors it.
 */
// Type-only: pins the LocaleNamespaceMap augmentation target into the program,
// so the `declare module` below always resolves (harness-side stub package).
import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'nav': 'gh插件安装',
  'settings.title': 'GitHub 插件安装',
  'settings.subtitle': '粘贴 GitHub 项目链接，一键完成下载 zip → 解压 → pnpm i → 构建 → 注册到 dsh web 插件列表。',
  'form.url': 'GitHub 项目',
  'form.urlPlaceholder': 'https://github.com/owner/repo 或 owner/repo@v1.2.3',
  'form.urlHint': '支持完整链接（/tree/、/archive/、/releases/tag/）、owner/repo 简写与 @ref。',
  'form.advanced': '高级选项',
  'form.profile': '目标 profile',
  'form.profilePlaceholder': '留空使用默认（web）',
  'form.profileHint': '安装完成后执行 dsh plugin --profile <名> add。',
  'form.profileInvalid': 'profile 只能包含小写字母、数字和连字符。',
  'form.start': '开始安装',
  'form.starting': '正在提交…',
  'form.emptyUrl': '请先粘贴 GitHub 项目链接。',
  'form.badUrl': '这不是可识别的 GitHub 项目链接或 owner/repo 简写。',
  'remote.unmounted': '安装服务未挂载，请确认 dsh web 已加载本插件后重试。',
  'remote.startFailed': '提交安装任务失败：{message}',
  'phase.title': '任务进度',
  'phase.queued': '排队中',
  'phase.downloading': '下载 zip',
  'phase.extracting': '解压并扁平化',
  'phase.installing': '安装依赖 (pnpm i)',
  'phase.building': '构建 (pnpm run build)',
  'phase.registering': '注册插件 (dsh plugin add)',
  'phase.done': '安装完成',
  'phase.failed': '安装失败',
  'phase.step': '第 {index} 步 / 共 {total} 步',
  'logs.title': '最近日志',
  'logs.empty': '暂无日志输出。',
  'logs.showMore': '展开全部',
  'logs.showLess': '收起',
  'error.title': '安装失败（{phase}）',
  'error.detail': '失败原因',
  'cancel': '取消排队',
  'cancelling': '正在取消…',
  'dismiss': '移除记录',
  'success.title': '安装成功',
  'success.desc': '插件 {label} 已注册到 profile「{profile}」。重启 dsh web 后生效。',
  'success.pluginDir': '插件目录：{path}',
  'history.title': '安装记录',
  'history.empty': '还没有安装记录。',
  'history.running': '进行中',
  'history.at': '{time}',
  'toast.failedTitle': 'gh插件安装失败',
  'toast.successTitle': 'gh插件安装成功',
  'toast.successDesc': '{label} 已注册，重启 dsh web 后生效。',
  'toast.detail': '查看详情',
  'toast.close': '关闭',
} satisfies Record<string, string>

/** The `gh-plugin-install` namespace key union. */
export type GhInstallKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'nav': 'GH Plugin Install',
  'settings.title': 'GitHub plugin install',
  'settings.subtitle': 'Paste a GitHub project link to download the zip, extract, run pnpm i, build, and register the plugin with dsh web in one click.',
  'form.url': 'GitHub project',
  'form.urlPlaceholder': 'https://github.com/owner/repo or owner/repo@v1.2.3',
  'form.urlHint': 'Accepts full links (/tree/, /archive/, /releases/tag/), the owner/repo shorthand, and @ref.',
  'form.advanced': 'Advanced options',
  'form.profile': 'Target profile',
  'form.profilePlaceholder': 'Leave empty for the default (web)',
  'form.profileHint': 'Runs dsh plugin --profile <name> add after the build.',
  'form.profileInvalid': 'A profile may only contain lowercase letters, digits, and hyphens.',
  'form.start': 'Start install',
  'form.starting': 'Submitting…',
  'form.emptyUrl': 'Paste a GitHub project link first.',
  'form.badUrl': 'This is not a recognizable GitHub project link or owner/repo shorthand.',
  'remote.unmounted': 'The install service is not mounted; make sure dsh web loaded this plugin and retry.',
  'remote.startFailed': 'Submitting the install job failed: {message}',
  'phase.title': 'Job progress',
  'phase.queued': 'Queued',
  'phase.downloading': 'Downloading zip',
  'phase.extracting': 'Extracting and flattening',
  'phase.installing': 'Installing dependencies (pnpm i)',
  'phase.building': 'Building (pnpm run build)',
  'phase.registering': 'Registering plugin (dsh plugin add)',
  'phase.done': 'Installed',
  'phase.failed': 'Install failed',
  'phase.step': 'Step {index} of {total}',
  'logs.title': 'Recent log',
  'logs.empty': 'No log output yet.',
  'logs.showMore': 'Show all',
  'logs.showLess': 'Collapse',
  'error.title': 'Install failed ({phase})',
  'error.detail': 'Failure reason',
  'cancel': 'Cancel queued job',
  'cancelling': 'Cancelling…',
  'dismiss': 'Dismiss record',
  'success.title': 'Install succeeded',
  'success.desc': 'Plugin {label} was registered with profile "{profile}". Restart dsh web to apply it.',
  'success.pluginDir': 'Plugin directory: {path}',
  'history.title': 'Install history',
  'history.empty': 'No install jobs yet.',
  'history.running': 'Running',
  'history.at': '{time}',
  'toast.failedTitle': 'GH plugin install failed',
  'toast.successTitle': 'GH plugin install succeeded',
  'toast.successDesc': '{label} was registered; restart dsh web to apply it.',
  'toast.detail': 'View details',
  'toast.close': 'Close',
} satisfies Record<GhInstallKey, string>

/** Locale namespace id registered under ctx.locale. */
export const NS = 'gh-plugin-install'

/** The active run phases, in order (queued → done; failed is terminal-side). */
export const RUN_PHASES = ['queued', 'downloading', 'extracting', 'installing', 'building', 'registering'] as const

/**
 * Fill one dictionary template's `{name}`-style placeholders.
 * @param template - dictionary text.
 * @param params - placeholder values; absent params replace nothing.
 * @returns the filled text.
 */
export function fmt(template: string, params?: Record<string, string>): string {
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => params[key] ?? whole)
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The GitHub plugin installer's settings and toast copy. */
    [NS]: GhInstallKey
  }
}
