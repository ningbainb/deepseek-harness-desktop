import { normalizeDeepLink } from './deep-links.mjs'

export const NOTIFICATION_CATEGORIES = Object.freeze([
  'plugin-recovery',
  'session',
  'preset',
  'task',
  'run',
  'update',
])

const CATEGORY_SET = new Set(NOTIFICATION_CATEGORIES)
const ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/u

const BUILTINS_FALLBACK_COPY = Object.freeze({
  'full-retry-failed': {
    title: '已使用内置插件启动',
    body: '原有对话和设置仍在；应用已跳过本次未能自动修复的插件。',
  },
  'missing-credentials': {
    title: '自动修复未启用',
    body: '未配置模型 Key，应用已使用内置插件启动。请在模型设置中填写 Key，保存后重新启动以重试自动修复。',
  },
  'no-model': {
    title: '自动修复未启用',
    body: '未配置可用的修复模型，应用已使用内置插件启动。请在模型设置中选择模型并配置 Key。',
  },
  'unsupported-tools': {
    title: '自动修复暂不可用',
    body: '当前模型不支持自动修复所需的工具，应用已使用内置插件启动。请改用支持工具调用的模型。',
  },
  'repair-failed': {
    title: '自动修复未完成',
    body: '自动修复未通过验证，应用已使用内置插件启动；原有对话和设置仍在。',
  },
  'budget-exhausted': {
    title: '自动修复未完成',
    body: '自动修复达到安全尝试上限，应用已使用内置插件启动；原有对话和设置仍在。',
  },
  'profile-permission': {
    title: '正在修复应用安装',
    body: '应用数据目录权限阻止了完整启动，应用已使用内置插件启动。请检查目录权限后重试。',
  },
  'profile-installation': {
    title: '正在修复应用安装',
    body: '应用安装文件阻止了完整启动，应用已使用内置插件启动。请重新安装或修复应用后重试。',
  },
  'profile-failed': {
    title: '已使用内置插件启动',
    body: '应用数据目录未能完成启动，应用已使用内置插件启动；原有对话和设置仍在。',
  },
})

const BUILTINS_FALLBACK_REASON_SET = new Set(Object.keys(BUILTINS_FALLBACK_COPY))

export function builtinsFallbackNotification(fingerprint = 'unknown', reason = 'full-retry-failed') {
  const suffix = typeof fingerprint === 'string' && /^[a-f0-9]{64}$/u.test(fingerprint)
    ? fingerprint.slice(0, 16)
    : 'unknown'
  const copy = BUILTINS_FALLBACK_REASON_SET.has(reason)
    ? BUILTINS_FALLBACK_COPY[reason]
    : BUILTINS_FALLBACK_COPY['full-retry-failed']
  return Object.freeze({
    category: 'plugin-recovery',
    id: `plugin-recovery:builtins:${suffix}`,
    title: copy.title,
    body: copy.body,
  })
}

export function sessionRecoveryNotification(skippedCount = 1) {
  const count = Number.isSafeInteger(skippedCount) && skippedCount > 0
    ? Math.min(skippedCount, 1_000_000)
    : 1
  return Object.freeze({
    category: 'session',
    id: 'session:recovery:' + count,
    title: '有 ' + count + ' 个历史会话暂时无法读取',
    body: '其他历史会话仍可使用；原始会话文件未被修改。',
  })
}

export function normalizeDesktopNotification(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('invalid desktop notification')
  }
  const allowed = new Set(['category', 'id', 'title', 'body', 'deepLink'])
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`desktop notification contains unsupported field ${key}`)
  }
  if (!CATEGORY_SET.has(value.category) || typeof value.id !== 'string' || !ID_PATTERN.test(value.id)) {
    throw new TypeError('desktop notification category or id is invalid')
  }
  const title = typeof value.title === 'string' ? value.title.trim() : ''
  const body = typeof value.body === 'string' ? value.body.trim() : ''
  if (title.length === 0 || title.length > 160 || body.length === 0 || body.length > 1_000) {
    throw new TypeError('desktop notification title or body is invalid')
  }
  const deepLink = value.deepLink === undefined ? undefined : normalizeDeepLink(value.deepLink)
  return Object.freeze({
    category: value.category,
    id: value.id,
    title,
    body,
    ...(deepLink === undefined ? {} : { deepLink }),
  })
}

export class DesktopNotificationService {
  constructor({
    showNative,
    isForeground = () => false,
    routeDeepLink = async () => {},
    now = () => Date.now(),
    minimumIntervalMs = 15_000,
  } = {}) {
    if (typeof showNative !== 'function') throw new TypeError('notification service requires a native presenter')
    this.showNative = showNative
    this.isForeground = isForeground
    this.routeDeepLink = routeDeepLink
    this.now = now
    this.minimumIntervalMs = minimumIntervalMs
    this.ids = new Map()
    this.categories = new Map()
  }

  async show(value, { force = false } = {}) {
    const notification = normalizeDesktopNotification(value)
    const now = this.now()
    if (!force && this.isForeground()) return Object.freeze({ shown: false, reason: 'foreground' })
    if (this.ids.has(notification.id)) return Object.freeze({ shown: false, reason: 'duplicate' })
    const lastCategory = this.categories.get(notification.category)
    if (lastCategory !== undefined && now - lastCategory < this.minimumIntervalMs) {
      return Object.freeze({ shown: false, reason: 'rate-limited' })
    }
    const shown = await this.showNative({
      category: notification.category,
      id: notification.id,
      title: notification.title,
      body: notification.body,
      onClick: notification.deepLink === undefined
        ? undefined
        : () => { void this.routeDeepLink(notification.deepLink) },
    })
    if (shown !== true) return Object.freeze({ shown: false, reason: 'unsupported' })
    this.ids.set(notification.id, now)
    this.categories.set(notification.category, now)
    if (this.ids.size > 512) this.ids.delete(this.ids.keys().next().value)
    return Object.freeze({ shown: true })
  }
}
