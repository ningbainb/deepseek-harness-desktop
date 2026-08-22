/**
 * The `web-ui-plugins` locale dictionaries for the group card.
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'title': 'Web UI 插件',
  'description': '统一管理 dsh-web-ui 全家桶插件的启用与配置。',
  'expand': '展开',
  'collapse': '收起',
  'empty': '没有已安装的 dsh-web-ui 插件。',
  'repairTitle': '自动修复记录',
  'repairDescription': '仅显示本机最近一次自动修复的脱敏摘要。',
  'repairNone': '尚未运行过自动修复。',
  'repairLoading': '正在读取修复记录',
  'repairExpand': '查看修复详情',
  'repairCollapse': '收起修复详情',
  'repairApplied': '已应用',
  'repairRolledBack': '已回滚',
  'repairExhausted': '未应用',
  'repairPending': '处理中',
  'repairModels': '调用模型',
  'repairFiles': '变更文件',
  'repairChecks': '验证检查',
  'repairFingerprint': '故障指纹',
  'repairOpenLogs': '打开本地日志',
  'repairExportDiagnostics': '导出脱敏诊断',
  'repairNoItems': '无',
} satisfies Record<string, string>

/** Key union for this namespace. */
export type WebUIPluginsKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'title': 'Web UI Plugins',
  'description': 'Enable and configure the dsh-web-ui family plugins from one place.',
  'expand': 'Show plugins',
  'collapse': 'Hide plugins',
  'empty': 'No dsh-web-ui plugins installed.',
  'repairTitle': 'Automatic repair history',
  'repairDescription': 'A privacy-safe summary of the latest local automatic repair.',
  'repairNone': 'No automatic repair has run.',
  'repairLoading': 'Loading repair history',
  'repairExpand': 'Show repair details',
  'repairCollapse': 'Hide repair details',
  'repairApplied': 'Applied',
  'repairRolledBack': 'Rolled back',
  'repairExhausted': 'Not applied',
  'repairPending': 'In progress',
  'repairModels': 'Models',
  'repairFiles': 'Changed files',
  'repairChecks': 'Checks',
  'repairFingerprint': 'Fingerprint',
  'repairOpenLogs': 'Open local logs',
  'repairExportDiagnostics': 'Export redacted diagnostics',
  'repairNoItems': 'None',
} satisfies Record<WebUIPluginsKey, string>

/**
 * The `community-plugins` locale dictionaries for the community plugin index
 * card.
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const communityPluginsZh = {
  'title': '社区插件',
  'description': '社区贡献者开发与维护的插件，链接指向作者自己的仓库。',
  'expand': '展开',
  'collapse': '收起',
  'empty': '暂无社区插件登记。',
  'author': '作者',
  'repository': '仓库',
  'notice': '条目由贡献者自行登记，与 dsh-web-ui 的发布内容无关；使用前请自行评估。',
} satisfies Record<string, string>

/** Key union for this namespace. */
export type CommunityPluginKey = keyof typeof communityPluginsZh

/** English dictionary, checked complete against the zh key set. */
export const communityPluginsEn = {
  'title': 'Community Plugins',
  'description': "Plugins developed and maintained by community contributors, linking to each author's own repository.",
  'expand': 'Show plugins',
  'collapse': 'Hide plugins',
  'empty': 'No community plugins registered yet.',
  'author': 'Author',
  'repository': 'Repository',
  'notice': 'Entries are contributed by their authors and are separate from dsh-web-ui releases; evaluate before use.',
} satisfies Record<CommunityPluginKey, string>
