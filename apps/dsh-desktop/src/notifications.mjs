import { normalizeDeepLink } from './deep-links.mjs'

export const NOTIFICATION_CATEGORIES = Object.freeze([
  'plugin-recovery',
  'preset',
  'task',
  'run',
  'update',
])

const CATEGORY_SET = new Set(NOTIFICATION_CATEGORIES)
const ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/u

export function builtinsFallbackNotification(fingerprint = 'unknown') {
  const suffix = typeof fingerprint === 'string' && /^[a-f0-9]{64}$/u.test(fingerprint)
    ? fingerprint.slice(0, 16)
    : 'unknown'
  return Object.freeze({
    category: 'plugin-recovery',
    id: `plugin-recovery:builtins:${suffix}`,
    title: '已使用内置插件启动',
    body: '原有对话和设置仍在；应用已跳过本次未能自动修复的插件。',
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

  async show(value) {
    const notification = normalizeDesktopNotification(value)
    const now = this.now()
    if (this.isForeground()) return Object.freeze({ shown: false, reason: 'foreground' })
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
