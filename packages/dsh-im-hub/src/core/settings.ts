export const PACKAGE_ID = '@ningbainb/dsh-im-hub'
export const ROUTE_PREFIX = '/api/dsh-im-hub'
export const SETTINGS_FILE = 'im-hub.json'
export const SECRET_MASK = '••••••••'

export const CHANNEL_IDS = ['feishu', 'dingtalk', 'wecom', 'webhook'] as const
export type ChannelId = (typeof CHANNEL_IDS)[number]

export type AccessMode = 'allowlist' | 'open'
export type BusyMode = 'queue' | 'steer'
export type FeishuDomain = 'feishu' | 'lark'
export type WeComMode = 'webhook' | 'app'

export interface ChannelAccessPolicy {
  mode: AccessMode
  allowUsers: string[]
  allowGroups: string[]
  groupMentionOnly: boolean
}

export interface FeishuChannelConfig {
  enabled: boolean
  appId: string
  appSecret: string
  domain: FeishuDomain
  access: ChannelAccessPolicy
}

export interface DingTalkChannelConfig {
  enabled: boolean
  clientId: string
  clientSecret: string
  robotCode: string
  access: ChannelAccessPolicy
}

export interface WeComChannelConfig {
  enabled: boolean
  mode: WeComMode
  webhookUrl: string
  corpId: string
  corpSecret: string
  agentId: string
  token: string
  encodingAesKey: string
  access: ChannelAccessPolicy
}

export interface WebhookChannelConfig {
  enabled: boolean
  signingSecret: string
  outboundUrl: string
  outboundHeaders: Record<string, string>
  replayWindowSec: number
  access: ChannelAccessPolicy
}

export interface ImHubSettings {
  version: 1
  enabled: boolean
  busyMode: BusyMode
  dualApproval: boolean
  maxReplyChars: number
  defaultWorkspacePath: string
  channels: {
    feishu: FeishuChannelConfig
    dingtalk: DingTalkChannelConfig
    wecom: WeComChannelConfig
    webhook: WebhookChannelConfig
  }
}

export type ChannelRuntimeState =
  | 'disabled'
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'webhook-ready'
  | 'error'

export interface ChannelStatusSnapshot {
  id: ChannelId
  enabled: boolean
  state: ChannelRuntimeState
  detail?: string
  lastEventAt?: number
  lastError?: string
  messageCount: number
}

export interface DiagnosticEvent {
  ts: number
  channel: ChannelId | 'hub'
  level: 'info' | 'warn' | 'error'
  message: string
}

export function defaultAccessPolicy(): ChannelAccessPolicy {
  return {
    mode: 'allowlist',
    allowUsers: [],
    allowGroups: [],
    groupMentionOnly: true,
  }
}

export function defaultSettings(): ImHubSettings {
  return {
    version: 1,
    enabled: false,
    busyMode: 'queue',
    dualApproval: true,
    maxReplyChars: 3500,
    defaultWorkspacePath: '',
    channels: {
      feishu: {
        enabled: false,
        appId: '',
        appSecret: '',
        domain: 'feishu',
        access: defaultAccessPolicy(),
      },
      dingtalk: {
        enabled: false,
        clientId: '',
        clientSecret: '',
        robotCode: '',
        access: defaultAccessPolicy(),
      },
      wecom: {
        enabled: false,
        mode: 'webhook',
        webhookUrl: '',
        corpId: '',
        corpSecret: '',
        agentId: '',
        token: '',
        encodingAesKey: '',
        access: defaultAccessPolicy(),
      },
      webhook: {
        enabled: false,
        signingSecret: '',
        outboundUrl: '',
        outboundHeaders: {},
        replayWindowSec: 300,
        access: defaultAccessPolicy(),
      },
    },
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function asTrimmedString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback
}

function mergeSecret(incoming: unknown, existing: string | undefined): string {
  if (typeof incoming !== 'string') return existing ?? ''
  const trimmed = incoming.trim()
  if (trimmed === SECRET_MASK) return existing ?? ''
  return trimmed
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const output: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    output.push(trimmed)
  }
  return output
}

function normalizeHeaders(value: unknown): Record<string, string> {
  const raw = asRecord(value)
  const out: Record<string, string> = {}
  for (const [key, val] of Object.entries(raw)) {
    const k = key.trim()
    if (!k || typeof val !== 'string') continue
    out[k] = val.trim()
  }
  return out
}

function normalizeAccessPolicy(raw: unknown, fallback: ChannelAccessPolicy): ChannelAccessPolicy {
  const rec = asRecord(raw)
  const mode: AccessMode = rec.mode === 'open' ? 'open' : fallback.mode
  return {
    mode: rec.mode === 'open' || rec.mode === 'allowlist' ? rec.mode : mode,
    allowUsers: Array.isArray(rec.allowUsers) ? normalizeStringList(rec.allowUsers) : [...fallback.allowUsers],
    allowGroups: Array.isArray(rec.allowGroups) ? normalizeStringList(rec.allowGroups) : [...fallback.allowGroups],
    groupMentionOnly: typeof rec.groupMentionOnly === 'boolean' ? rec.groupMentionOnly : fallback.groupMentionOnly,
  }
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.max(min, Math.min(max, Math.round(num)))
}

function isMaskedSecretWebhookUrl(url: string): boolean {
  const qIndex = url.indexOf('?')
  if (qIndex < 0) return false
  return url.slice(qIndex).includes(SECRET_MASK)
}

export function normalizeSettings(
  raw: unknown,
  existing?: ImHubSettings,
): { settings: ImHubSettings; problems: string[] } {
  const problems: string[] = []
  const base = existing ? structuredCloneSafe(existing) : defaultSettings()
  const rec = asRecord(raw)
  const rawChannels = asRecord(rec.channels)

  const feishuRaw = asRecord(rawChannels.feishu)
  const dingtalkRaw = asRecord(rawChannels.dingtalk)
  const wecomRaw = asRecord(rawChannels.wecom)
  const webhookRaw = asRecord(rawChannels.webhook)

  const incomingWebhookUrl = typeof wecomRaw.webhookUrl === 'string' ? wecomRaw.webhookUrl.trim() : undefined
  const mergedWeComWebhookUrl = incomingWebhookUrl === undefined
    ? base.channels.wecom.webhookUrl
    : (incomingWebhookUrl === SECRET_MASK || isMaskedSecretWebhookUrl(incomingWebhookUrl))
      ? base.channels.wecom.webhookUrl
      : incomingWebhookUrl

  const settings: ImHubSettings = {
    version: 1,
    enabled: typeof rec.enabled === 'boolean' ? rec.enabled : base.enabled,
    busyMode: rec.busyMode === 'steer' || rec.busyMode === 'queue' ? rec.busyMode : base.busyMode,
    dualApproval: typeof rec.dualApproval === 'boolean' ? rec.dualApproval : base.dualApproval,
    maxReplyChars: clampInteger(rec.maxReplyChars, base.maxReplyChars, 500, 16000),
    defaultWorkspacePath: typeof rec.defaultWorkspacePath === 'string'
      ? rec.defaultWorkspacePath.trim()
      : base.defaultWorkspacePath,
    channels: {
      feishu: {
        enabled: typeof feishuRaw.enabled === 'boolean' ? feishuRaw.enabled : base.channels.feishu.enabled,
        appId: asTrimmedString(feishuRaw.appId, base.channels.feishu.appId),
        appSecret: mergeSecret(feishuRaw.appSecret, base.channels.feishu.appSecret),
        domain: feishuRaw.domain === 'lark' || feishuRaw.domain === 'feishu'
          ? feishuRaw.domain
          : base.channels.feishu.domain,
        access: normalizeAccessPolicy(feishuRaw.access, base.channels.feishu.access),
      },
      dingtalk: {
        enabled: typeof dingtalkRaw.enabled === 'boolean' ? dingtalkRaw.enabled : base.channels.dingtalk.enabled,
        clientId: asTrimmedString(dingtalkRaw.clientId, base.channels.dingtalk.clientId),
        clientSecret: mergeSecret(dingtalkRaw.clientSecret, base.channels.dingtalk.clientSecret),
        robotCode: asTrimmedString(dingtalkRaw.robotCode, base.channels.dingtalk.robotCode),
        access: normalizeAccessPolicy(dingtalkRaw.access, base.channels.dingtalk.access),
      },
      wecom: {
        enabled: typeof wecomRaw.enabled === 'boolean' ? wecomRaw.enabled : base.channels.wecom.enabled,
        mode: wecomRaw.mode === 'app' || wecomRaw.mode === 'webhook'
          ? wecomRaw.mode
          : base.channels.wecom.mode,
        webhookUrl: mergedWeComWebhookUrl,
        corpId: asTrimmedString(wecomRaw.corpId, base.channels.wecom.corpId),
        corpSecret: mergeSecret(wecomRaw.corpSecret, base.channels.wecom.corpSecret),
        agentId: asTrimmedString(wecomRaw.agentId, base.channels.wecom.agentId),
        token: mergeSecret(wecomRaw.token, base.channels.wecom.token),
        encodingAesKey: mergeSecret(wecomRaw.encodingAesKey, base.channels.wecom.encodingAesKey),
        access: normalizeAccessPolicy(wecomRaw.access, base.channels.wecom.access),
      },
      webhook: {
        enabled: typeof webhookRaw.enabled === 'boolean' ? webhookRaw.enabled : base.channels.webhook.enabled,
        signingSecret: mergeSecret(webhookRaw.signingSecret, base.channels.webhook.signingSecret),
        outboundUrl: asTrimmedString(webhookRaw.outboundUrl, base.channels.webhook.outboundUrl),
        outboundHeaders: webhookRaw.outboundHeaders !== undefined
          ? normalizeHeaders(webhookRaw.outboundHeaders)
          : { ...base.channels.webhook.outboundHeaders },
        replayWindowSec: clampInteger(
          webhookRaw.replayWindowSec,
          base.channels.webhook.replayWindowSec,
          30,
          3600,
        ),
        access: normalizeAccessPolicy(webhookRaw.access, base.channels.webhook.access),
      },
    },
  }

  if (settings.channels.feishu.enabled && (!settings.channels.feishu.appId || !settings.channels.feishu.appSecret)) {
    problems.push('feishu: appId and appSecret are recommended when enabled')
  }
  if (settings.channels.dingtalk.enabled && (!settings.channels.dingtalk.clientId || !settings.channels.dingtalk.clientSecret)) {
    problems.push('dingtalk: clientId and clientSecret are recommended when enabled')
  }
  if (settings.channels.wecom.enabled) {
    if (settings.channels.wecom.mode === 'webhook' && !settings.channels.wecom.webhookUrl) {
      problems.push('wecom: webhookUrl is recommended in webhook mode')
    }
    if (settings.channels.wecom.mode === 'app' && (!settings.channels.wecom.corpId || !settings.channels.wecom.corpSecret)) {
      problems.push('wecom: corpId and corpSecret are recommended in app mode')
    }
  }
  if (settings.channels.webhook.enabled && !settings.channels.webhook.signingSecret) {
    problems.push('webhook: signingSecret is required for inbound verification')
  }

  return { settings, problems }
}

function maskSecret(value: string): string {
  return value.trim() === '' ? '' : SECRET_MASK
}

function maskWebhookUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''
  const keyIndex = trimmed.indexOf('key=')
  if (keyIndex < 0) return trimmed
  const prefix = trimmed.slice(0, keyIndex + 4)
  const rest = trimmed.slice(keyIndex + 4)
  const ampIndex = rest.indexOf('&')
  const suffix = ampIndex >= 0 ? rest.slice(ampIndex) : ''
  return `${prefix}${SECRET_MASK}${suffix}`
}

export function redactSettingsForClient(settings: ImHubSettings): ImHubSettings {
  const cloned = structuredCloneSafe(settings)
  cloned.channels.feishu.appSecret = maskSecret(cloned.channels.feishu.appSecret)
  cloned.channels.dingtalk.clientSecret = maskSecret(cloned.channels.dingtalk.clientSecret)
  cloned.channels.wecom.corpSecret = maskSecret(cloned.channels.wecom.corpSecret)
  cloned.channels.wecom.token = maskSecret(cloned.channels.wecom.token)
  cloned.channels.wecom.encodingAesKey = maskSecret(cloned.channels.wecom.encodingAesKey)
  cloned.channels.wecom.webhookUrl = maskWebhookUrl(cloned.channels.wecom.webhookUrl)
  cloned.channels.webhook.signingSecret = maskSecret(cloned.channels.webhook.signingSecret)
  return cloned
}

function structuredCloneSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
