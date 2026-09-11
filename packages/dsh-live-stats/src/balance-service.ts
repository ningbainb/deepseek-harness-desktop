/**
 * LLM Balance Service.
 * Fetches user balance and quota details from the DeepSeek official balance endpoint
 * (https://api.deepseek.com/user/balance) or active provider configuration.
 *
 * Adheres to official DeepSeek API specs:
 * GET https://api.deepseek.com/user/balance
 * Headers: Authorization: Bearer <API_KEY>, Accept: application/json
 */

import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { credentialKey, credentialRef, isCredentialKeySegment, isCredentialRefName } from '@deepseek-ai/dsh-credentials'
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'

export interface BalanceInfo {
  currency: string
  total_balance: string
  granted_balance: string
  topped_up_balance: string
}
export interface BalanceSelection { provider: string; model: string }
export interface ModelBalanceResponse {
  ok: boolean
  is_available: boolean
  currency: string
  totalBalance: string
  toppedUpBalance: string
  grantedBalance: string
  modelName: string
  provider: string
  fetchedAt: number
  source?: 'deepseek' | 'relay-balance' | 'relay-quota' | 'relay-wallet' | 'relay-allowance'
  error?: string
}
type RecordLike = Record<string, unknown>
const record = (value: unknown): RecordLike => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as RecordLike : {}
const text = (value: unknown): string | undefined => typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
const amount = (value: unknown): boolean => (typeof value === 'number' || (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value))) && Number.isFinite(Number(value))
const TTL = 30_000
const TIMEOUT = 8_000
const MAX_RESPONSE = 64 * 1024

/** Bound decoded bytes and duration; never forward raw upstream errors. */
async function readJson(response: Response): Promise<RecordLike> {
  if (!response.ok) throw new Error('HTTP ' + response.status)
  if (!response.body) return {}
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_RESPONSE) { await reader.cancel(); throw new Error('invalid-response') }
      chunks.push(value)
    }
    try { return record(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
    catch { return {} }
  } finally { reader.releaseLock() }
}

/** Queries only the selected route; credentials and URLs stay on the host. */
export class BalanceService {
  private cache = new Map<string, ModelBalanceResponse>()
  private pending = new Map<string, Promise<ModelBalanceResponse>>()
  private active: BalanceSelection = { model: 'DeepSeek-V4-Flash', provider: 'deepseek-official' }
  constructor(private explicitApiKey?: string, private ctx?: Context) {}
  public setApiKey(key: string): void { this.explicitApiKey = key; this.cache.clear() }
  public setModelInfo(model: string, provider: string): void { this.active = { model, provider } }

  private service(name: string): unknown {
    try { return (this.ctx?.get as ((key: string) => unknown) | undefined)?.call(this.ctx, name) } catch { return undefined }
  }
  private settings(namespace: string): RecordLike {
    const settings = this.service('settings') as { get?: (ns: string) => unknown } | undefined
    try { return record(settings?.get?.(namespace)) } catch { return {} }
  }
  private selection(): BalanceSelection {
    const defaults = this.service('agentDefaultModel') as { currentSelection?: () => BalanceSelection } | undefined
    try { if (defaults?.currentSelection) return defaults.currentSelection() } catch {}
    const value = this.settings('agent-default-model')
    return { provider: text(value.provider) ?? this.active.provider, model: text(value.model) ?? this.active.model }
  }
  public async getBalance(forceRefresh = false, selected?: BalanceSelection): Promise<ModelBalanceResponse> {
    const { provider, model } = selected ?? this.selection()
    const empty: ModelBalanceResponse = { ok: false, is_available: false, currency: '', totalBalance: '--', toppedUpBalance: '--', grantedBalance: '--', modelName: model, provider, fetchedAt: Date.now() }
    const fail = (error: string) => ({ ...empty, error })
    const native = provider === 'deepseek-official'
    const profiles = record(this.settings('llm-pi-ai').providers)
    const profile = native ? this.settings('llm-deepseek') : record(Object.hasOwn(profiles, provider) ? profiles[provider] : undefined)
    const base = text(profile.baseURL) ?? (native ? text(process.env.DEEPSEEK_BASE_URL) ?? 'https://api.deepseek.com' : provider === 'deepseek' && Object.hasOwn(profiles, provider) ? 'https://api.deepseek.com' : undefined)
    if (!base) return fail('当前 Provider 没有可验证的官方余额接口或中转余额接口')
    let url: URL
    try {
      url = new URL(base)
      if (url.username || url.password || url.search || url.hash || !['https:', 'http:'].includes(url.protocol)) throw new Error()
      if (url.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error()
    } catch { return fail('余额接口地址无效；远程站点需要 HTTPS') }
    const official = url.origin === 'https://api.deepseek.com'
    const prefix = url.pathname.replace(/\/+$/, '').replace(/\/(?:v1|beta|anthropic)$/, '')
    const endpoint = url.origin + prefix
    const ref = text(profile.apiKeyEnv) ?? (native ? 'DEEPSEEK_API_KEY' : undefined)
    const credentials = this.service('credentials') as CredentialProvider | undefined
    let key: string | undefined
    try {
      if (ref && isCredentialRefName(ref)) {
        // The installed credential provider owns isolation; never scan other homes.
        key = credentials ? text((await credentials.resolve(credentialRef(ref)))?.value) : text(process.env[ref])
      } else if (!native && isCredentialKeySegment(provider)) {
        const stored = await credentials?.readRecord(credentialKey('llm-pi-ai', provider))
        if (stored?.kind === 'api-key') key = text(stored.key)
        if (!stored && provider === 'deepseek') key = credentials ? text((await credentials.resolve(credentialRef('DEEPSEEK_API_KEY')))?.value) : text(process.env.DEEPSEEK_API_KEY)
      }
      if (!this.ctx && native) key = text(this.explicitApiKey) ?? key
    } catch { return fail('无法读取当前服务商凭据，请检查模型设置') }
    if (!key) return fail('未检测到当前服务商的 API Key，请在模型设置中配置')
    const identity = createHash('sha256').update(JSON.stringify([provider, endpoint, key])).digest('hex')
    const cached = this.cache.get(identity)
    if (!forceRefresh && cached && Date.now() - cached.fetchedAt < TTL) return { ...cached, modelName: model }
    let request = this.pending.get(identity)
    if (!request) {
      request = this.query(endpoint, key, official, empty, cached?.source).then(result => {
        if (result.ok || result.error?.includes('未开放')) {
          if (this.cache.size >= 32) this.cache.delete(this.cache.keys().next().value!)
          this.cache.set(identity, result)
        }
        return result
      }).finally(() => { this.pending.delete(identity) })
      this.pending.set(identity, request)
    }
    return { ...await request, modelName: model }
  }

  private async query(endpoint: string, key: string, official: boolean, empty: ModelBalanceResponse, preferred?: ModelBalanceResponse['source']): Promise<ModelBalanceResponse> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT)
    const request = async (path: string) => readJson(await fetch(endpoint + path, {
      method: 'GET', redirect: 'error', signal: controller.signal,
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + key },
    }))
    const parseBalance = (json: RecordLike): ModelBalanceResponse | undefined => {
      const primary = record(Array.isArray(json.balance_infos) ? json.balance_infos[0] : undefined)
      if (typeof primary.currency !== 'string' || !['CNY', 'USD'].includes(primary.currency)
        || ![primary.total_balance, primary.granted_balance, primary.topped_up_balance].every(value => typeof value === 'string' && amount(value))) return undefined
      return { ...empty, ok: true, is_available: json.is_available === true, currency: primary.currency,
        totalBalance: primary.total_balance as string, grantedBalance: primary.granted_balance as string, toppedUpBalance: primary.topped_up_balance as string,
        source: official ? 'deepseek' : 'relay-balance', fetchedAt: Date.now() }
    }
    const parseUsage = (json: RecordLike): ModelBalanceResponse | undefined => {
      // Sub2API /v1/usage distinguishes wallet funds from subscription/key limits.
      if (!['unrestricted', 'quota_limited'].includes(String(json.mode)) || json.isValid !== true || !['USD', 'CNY'].includes(String(json.unit))) return undefined
      const wallet = json.mode === 'unrestricted' && amount(json.balance)
      const remaining = wallet ? json.balance : json.remaining
      if (!amount(remaining) || (!wallet && Number(remaining) < 0)) return undefined
      return { ...empty, ok: true, currency: String(json.unit), totalBalance: String(remaining),
        is_available: Number(remaining) > 0 && json.status !== 'expired', source: wallet ? 'relay-wallet' : 'relay-allowance', fetchedAt: Date.now() }
    }
    const optional = async (path: string, parse: (data: RecordLike) => ModelBalanceResponse | undefined) => {
      try { return parse(await request(path)) }
      catch (error) {
        if (!(error instanceof Error) || !/^HTTP (404|405|501)$/.test(error.message)) throw error
        return undefined
      }
    }
    try {
      if (official) return parseBalance(await request('/user/balance')) ?? { ...empty, error: '官方余额接口未返回完整的余额明细' }
      // Only capability misses fall through; auth failures, rate limits and outages stop here.
      if (preferred !== 'relay-quota' && preferred !== 'relay-wallet' && preferred !== 'relay-allowance') {
        const balance = await optional('/user/balance', parseBalance)
        if (balance) return balance
      }
      if (preferred !== 'relay-quota') {
        const usage = await optional('/v1/usage', parseUsage)
        if (usage) return usage
      }
      for (const prefix of ['', '/v1']) {
        let subscription: RecordLike, usage: RecordLike
        try { [subscription, usage] = await Promise.all([request(prefix + '/dashboard/billing/subscription'), request(prefix + '/dashboard/billing/usage')]) }
        catch (error) {
          if (error instanceof Error && /^HTTP (404|405|501)$/.test(error.message)) continue
          throw error
        }
        if (subscription.object !== 'billing_subscription' || usage.object !== 'list'
          || !amount(subscription.hard_limit_usd) || !amount(usage.total_usage)
          || Number(subscription.hard_limit_usd) < 0 || Number(usage.total_usage) < 0) continue
        // New API returns account OR token quota in site-defined units despite *_usd.
        // Never assert USD, a wallet balance, or an invented top-up.
        if (Number(subscription.hard_limit_usd) === 100_000_000 && Number(subscription.soft_limit_usd) === 100_000_000) return { ...empty, error: '站点返回无限额度标记，实际余额请到钱包查看' }
        const remaining = Number(subscription.hard_limit_usd) - Number(usage.total_usage) / 100
        return { ...empty, ok: true, is_available: remaining > 0, totalBalance: String(Number(remaining.toFixed(6))), currency: '额度', source: 'relay-quota', fetchedAt: Date.now() }
      }
      return { ...empty, error: '中转站未开放可识别的余额接口，请到该站钱包查看' }
    } catch (error) {
      const code = error instanceof Error ? error.message : ''
      const message = controller.signal.aborted ? '请求超时，请稍后重试'
        : /^HTTP (404|405|501)$/.test(code) ? '中转站未开放兼容余额接口，请到该站钱包查看'
        : /^HTTP (401|403)$/.test(code) ? '当前服务商拒绝余额查询，请检查密钥和查询权限'
        : code === 'HTTP 429' ? '查询过于频繁，请稍后重试' : '服务商暂时不可用或响应格式无效，请稍后重试'
      return { ...empty, error: '查询余额失败: ' + message }
    } finally { clearTimeout(timer); controller.abort() }
  }
}
