const KNOWN_ACTIVITIES = [
  { pattern: /\[im-qqbot\].*apply/i, text: '正在初始化 QQ 机器人扩展与连接服务...', category: 'qqbot' },
  { pattern: /\[im-qqbot\].*Bot ready/i, text: 'QQ 机器人已就绪', category: 'qqbot' },
  { pattern: /\[ui-skin-center\]/i, text: '正在载入个性化主题与皮肤中心...', category: 'skin' },
  { pattern: /\[plugins\].*compatibility/i, text: '正在校验社区扩展插件兼容性...', category: 'plugins' },
  { pattern: /\[plugins\]/i, text: '正在载入扩展插件...', category: 'plugins' },
  { pattern: /\[managed-git\]/i, text: '正在准备本地 Git 版本控制环境...', category: 'git' },
  { pattern: /\[session\]/i, text: '正在检查历史会话与上下文平衡...', category: 'session' },
  { pattern: /\[workspace\]/i, text: '正在挂载本地工作区...', category: 'workspace' },
  { pattern: /package-resolution.*packages=(\d+)/i, text: '正在解析已安装的扩展组件与插件...', category: 'plugins' },
  { pattern: /profile-ready.*packages=(\d+)/i, text: '已就绪扩展插件运行环境...', category: 'plugins' },
  { pattern: /clean rebuild.*succeeded/i, text: '纯净环境构建就绪...', category: 'recovery' },
  { pattern: /dsh web:\s*https?:\/\//i, text: '本地服务已就绪，正在渲染探索界面...', category: 'ready' },
]

export function formatStartupActivity(stream, line) {
  if (typeof line !== 'string') return undefined
  const trimmed = line.trim()
  if (!trimmed) return undefined

  for (const item of KNOWN_ACTIVITIES) {
    if (item.pattern.test(trimmed)) {
      return { text: item.text, category: item.category, raw: trimmed.slice(0, 80) }
    }
  }

  // Handle generic plugin loading pattern or clean line
  const pluginMatch = trimmed.match(/(?:loading|applying|starting)\s+([@a-z0-9_./-]+)/i)
  if (pluginMatch) {
    return { text: `正在载入扩展: ${pluginMatch[1]}`, category: 'plugin', raw: trimmed.slice(0, 80) }
  }

  if (stream === 'stdout' && trimmed.length > 3 && !trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return { text: trimmed.slice(0, 60), category: 'general', raw: trimmed.slice(0, 80) }
  }

  return undefined
}
