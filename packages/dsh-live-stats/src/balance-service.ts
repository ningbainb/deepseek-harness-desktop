/**
 * LLM Balance Service.
 * Fetches user balance and quota details from the DeepSeek official balance endpoint
 * (https://api.deepseek.com/user/balance) or active provider configuration.
 *
 * Adheres to official DeepSeek API specs:
 * GET https://api.deepseek.com/user/balance
 * Headers: Authorization: Bearer <API_KEY>, Accept: application/json
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'

export interface BalanceInfo {
  currency: string
  total_balance: string
  granted_balance: string
  topped_up_balance: string
}

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
  error?: string
}

interface CacheEntry {
  data: ModelBalanceResponse
  timestamp: number
}

const CACHE_TTL_MS = 30_000 // 30 seconds cache

/** Find credentials from user home .dsh directory. */
function findKeyInUserFiles(): string | undefined {
  try {
    const homeCandidates = [
      process.env.DSH_HOME,
      process.env.USERPROFILE,
      homedir(),
    ].filter((p): p is string => typeof p === 'string' && p.length > 0)

    for (const home of homeCandidates) {
      const candidates = [
        join(home, '.dsh', '.credentials.yaml'),
        join(home, '.dsh', 'credentials.yaml'),
        join(home, '.credentials.yaml'),
      ]
      for (const filePath of candidates) {
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, 'utf-8')
          const match = content.match(/DEEPSEEK_API_KEY:\s*([^\s\r\n]+)/)
          if (match?.[1]) return match[1].trim()
        }
      }
    }
  } catch {}
  return undefined
}

/** Find active model configuration from user settings.yaml. */
function findModelInUserSettings(): { model: string; provider: string; baseURL?: string } {
  try {
    const homeCandidates = [
      process.env.DSH_HOME,
      process.env.USERPROFILE,
      homedir(),
    ].filter((p): p is string => typeof p === 'string' && p.length > 0)

    for (const home of homeCandidates) {
      const filePath = join(home, '.dsh', 'settings.yaml')
      if (existsSync(filePath)) {
        const content = readFileSync(filePath, 'utf-8')
        const modelMatch = content.match(/^\s*model:\s*([^\s\r\n]+)/m)
        const providerMatch = content.match(/^\s*provider:\s*([^\s\r\n]+)/m)
        const baseMatch = content.match(/^\s*baseURL:\s*([^\s\r\n]+)/m)
        return {
          model: modelMatch?.[1]?.trim() ?? 'DeepSeek-V4-Flash',
          provider: providerMatch?.[1]?.trim() ?? 'deepseek-official',
          baseURL: baseMatch?.[1]?.trim(),
        }
      }
    }
  } catch {}
  return { model: 'DeepSeek-V4-Flash', provider: 'deepseek-official' }
}

export class BalanceService {
  private cache: CacheEntry | undefined
  private explicitApiKey: string | undefined
  private ctx: Context | undefined
  private activeModel: string = 'DeepSeek-V4-Flash'
  private activeProvider: string = 'deepseek-official'
  private customBaseURL: string | undefined

  constructor(apiKey?: string, ctx?: Context) {
    this.explicitApiKey = apiKey
    this.ctx = ctx
  }

  public setApiKey(key: string): void {
    this.explicitApiKey = key
    this.cache = undefined
  }

  public setModelInfo(modelName: string, provider: string): void {
    this.activeModel = modelName
    this.activeProvider = provider
  }

  private async resolveApiKey(): Promise<string | undefined> {
    if (this.explicitApiKey && this.explicitApiKey.trim().length > 0) {
      return this.explicitApiKey.trim()
    }

    // 1. Try ctx.get('credentials')
    if (this.ctx) {
      try {
        const creds = this.ctx.get('credentials') as { resolve?: (key: string) => Promise<{ value: string } | undefined> } | undefined
        if (creds && typeof creds.resolve === 'function') {
          const hit = await creds.resolve('DEEPSEEK_API_KEY')
          if (hit?.value && hit.value.trim().length > 0) {
            return hit.value.trim()
          }
        }
      } catch {}
    }

    // 2. Try process.env
    if (process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY.trim().length > 0) {
      return process.env.DEEPSEEK_API_KEY.trim()
    }

    // 3. Try reading local credentials file
    const fileKey = findKeyInUserFiles()
    if (fileKey && fileKey.length > 0) {
      return fileKey
    }

    return undefined
  }

  private resolveModelAndProvider(): { model: string; provider: string; baseURL: string } {
    let model = this.activeModel
    let provider = this.activeProvider
    let baseURL = this.customBaseURL ?? 'https://api.deepseek.com'

    if (this.ctx) {
      try {
        const settings = this.ctx.get('settings') as Record<string, any> | undefined
        if (settings) {
          const defaultModel = settings['agent-default-model']
          if (defaultModel?.model) model = defaultModel.model
          if (defaultModel?.provider) provider = defaultModel.provider

          const deepseekSettings = settings['llm-deepseek']
          if (deepseekSettings?.baseURL) baseURL = deepseekSettings.baseURL
        }
      } catch {}
    }

    if (model === 'DeepSeek-V4-Flash' || provider === 'deepseek-official') {
      const fromFile = findModelInUserSettings()
      if (fromFile.model) model = fromFile.model
      if (fromFile.provider) provider = fromFile.provider
      if (fromFile.baseURL) baseURL = fromFile.baseURL
    }

    return { model, provider, baseURL }
  }

  public async getBalance(forceRefresh = false): Promise<ModelBalanceResponse> {
    const now = Date.now()
    if (!forceRefresh && this.cache && (now - this.cache.timestamp < CACHE_TTL_MS)) {
      return this.cache.data
    }

    const { model, provider, baseURL } = this.resolveModelAndProvider()
    const apiKey = await this.resolveApiKey()

    if (!apiKey) {
      const response: ModelBalanceResponse = {
        ok: false,
        is_available: false,
        currency: 'CNY',
        totalBalance: '--',
        toppedUpBalance: '--',
        grantedBalance: '--',
        modelName: model,
        provider,
        fetchedAt: now,
        error: '未检测到 DeepSeek API Key，请在【设置 -> 模型】或环境变量中配置',
      }
      return response
    }

    try {
      const endpoint = `${baseURL.replace(/\/+$/, '')}/user/balance`
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
      })

      if (!res.ok) {
        let errorDetail = `HTTP ${res.status} ${res.statusText}`
        try {
          const errJson = await res.json() as { error?: { message?: string }; message?: string }
          if (errJson.error?.message) errorDetail = errJson.error.message
          else if (errJson.message) errorDetail = errJson.message
        } catch {}
        throw new Error(errorDetail)
      }

      const json = await res.json() as {
        is_available?: boolean
        balance_infos?: BalanceInfo[]
      }

      const primary = json.balance_infos?.[0] ?? {
        currency: 'CNY',
        total_balance: '0.00',
        granted_balance: '0.00',
        topped_up_balance: '0.00',
      }

      const result: ModelBalanceResponse = {
        ok: true,
        is_available: json.is_available ?? true,
        currency: primary.currency || 'CNY',
        totalBalance: primary.total_balance ?? '0.00',
        toppedUpBalance: primary.topped_up_balance ?? '0.00',
        grantedBalance: primary.granted_balance ?? '0.00',
        modelName: model,
        provider,
        fetchedAt: now,
      }

      this.cache = { data: result, timestamp: now }
      return result
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      if (this.cache) {
        return {
          ...this.cache.data,
          error: `刷新失败: ${errorMsg}`,
          fetchedAt: now,
        }
      }

      return {
        ok: false,
        is_available: false,
        currency: 'CNY',
        totalBalance: '--',
        toppedUpBalance: '--',
        grantedBalance: '--',
        modelName: model,
        provider,
        fetchedAt: now,
        error: `查询余额失败: ${errorMsg}`,
      }
    }
  }
}
