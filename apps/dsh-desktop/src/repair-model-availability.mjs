import { lstat, readFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'

import { parseDocument } from 'yaml'

import { configuredToolsCapability, repairToolsCapability } from './tools-capability.mjs'

const MAX_CONFIGURATION_BYTES = 1024 * 1024
const CREDENTIAL_REF_PATTERN = /^[A-Z][A-Z0-9_]{1,127}$/u
const BASE_DEFAULT_SELECTION = Object.freeze({
  provider: 'deepseek-official',
  model: 'deepseek-v4-flash',
})

// These names mirror the credential discovery advertised by the pinned pi-ai
// provider catalog. An explicit profile apiKeyEnv always takes precedence.
const PROVIDER_CREDENTIAL_REFS = Object.freeze({
  'ant-ling': ['ANT_LING_API_KEY'],
  'azure-openai-responses': ['AZURE_OPENAI_API_KEY'],
  anthropic: ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_OAUTH_TOKEN', 'ANTHROPIC_API_KEY'],
  cerebras: ['CEREBRAS_API_KEY'],
  'cloudflare-ai-gateway': ['CLOUDFLARE_API_KEY'],
  'cloudflare-workers-ai': ['CLOUDFLARE_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY'],
  fireworks: ['FIREWORKS_API_KEY'],
  'github-copilot': ['COPILOT_GITHUB_TOKEN'],
  google: ['GEMINI_API_KEY'],
  'google-vertex': ['GOOGLE_CLOUD_API_KEY'],
  groq: ['GROQ_API_KEY'],
  huggingface: ['HF_TOKEN'],
  'kimi-coding': ['KIMI_API_KEY'],
  minimax: ['MINIMAX_API_KEY'],
  'minimax-cn': ['MINIMAX_CN_API_KEY'],
  mistral: ['MISTRAL_API_KEY'],
  moonshotai: ['MOONSHOT_API_KEY'],
  'moonshotai-cn': ['MOONSHOT_API_KEY'],
  nvidia: ['NVIDIA_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  opencode: ['OPENCODE_API_KEY'],
  'opencode-go': ['OPENCODE_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
  'qwen-token-plan': ['QWEN_TOKEN_PLAN_API_KEY'],
  'qwen-token-plan-cn': ['QWEN_TOKEN_PLAN_CN_API_KEY'],
  radius: ['RADIUS_API_KEY'],
  together: ['TOGETHER_API_KEY'],
  'vercel-ai-gateway': ['AI_GATEWAY_API_KEY'],
  xai: ['XAI_API_KEY'],
  xiaomi: ['XIAOMI_API_KEY'],
  'xiaomi-token-plan-ams': ['XIAOMI_TOKEN_PLAN_AMS_API_KEY'],
  'xiaomi-token-plan-cn': ['XIAOMI_TOKEN_PLAN_CN_API_KEY'],
  'xiaomi-token-plan-sgp': ['XIAOMI_TOKEN_PLAN_SGP_API_KEY'],
  zai: ['ZAI_API_KEY'],
  'zai-coding-cn': ['ZAI_CODING_CN_API_KEY'],
})

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== ''
}

async function readConfiguration(path) {
  try {
    const metadata = await lstat(path)
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MAX_CONFIGURATION_BYTES) {
      return undefined
    }
    const document = parseDocument(await readFile(path, 'utf8'), {
      prettyErrors: false,
      uniqueKeys: true,
      maxAliasCount: 0,
    })
    if (document.errors.length > 0) return undefined
    const value = document.toJS({ maxAliasCount: 0 }) ?? {}
    return isRecord(value) ? value : undefined
  } catch (error) {
    if (error?.code === 'ENOENT') return {}
    return undefined
  }
}

function credentialRefs(credentials) {
  if (!isRecord(credentials)) return {}
  if (credentials.version === undefined) return credentials
  return credentials.version === 1 && isRecord(credentials.refs) ? credentials.refs : {}
}

function hasCredentialRef(name, sources) {
  if (typeof name !== 'string' || !CREDENTIAL_REF_PATTERN.test(name)) return false
  return sources.some(source => isRecord(source) && nonEmptyString(source[name]))
}

function hasStoredProviderRecord(credentials, provider) {
  if (!isRecord(credentials?.records)) return false
  const record = credentials.records[`llm-pi-ai/${provider}`]
  return isRecord(record) && nonEmptyString(record.kind)
}

function hasCredentialHeader(profile) {
  if (!isRecord(profile?.headers)) return false
  return Object.entries(profile.headers).some(([name, value]) =>
    ['authorization', 'api-key', 'x-api-key'].includes(name.toLowerCase()) && nonEmptyString(value))
}

function selectedModel(settings) {
  const selected = settings?.['agent-default-model']
  if (isRecord(selected) && nonEmptyString(selected.provider) && nonEmptyString(selected.model)) {
    return Object.freeze({ provider: selected.provider.trim(), model: selected.model.trim() })
  }
  return BASE_DEFAULT_SELECTION
}

function safeFallbackSelection(value) {
  if (!isRecord(value) || !nonEmptyString(value.provider) || !nonEmptyString(value.model)) return undefined
  const toolsCapability = ['auto', 'native', 'none'].includes(value.toolsCapability)
    ? value.toolsCapability
    : undefined
  return Object.freeze({
    provider: value.provider.trim(),
    model: value.model.trim(),
    ...(toolsCapability === undefined ? {} : { toolsCapability }),
  })
}

function inspectSelection({ settings, credentials, sources, selection }) {
  if (selection.provider === 'deepseek-official') {
    const config = settings['llm-deepseek']
    const toolsCapability = configuredToolsCapability(settings, selection)
    const tools = repairToolsCapability(toolsCapability)
    if (!tools.compatible) {
      return Object.freeze({
        available: false,
        reason: tools.reason,
        selection,
        toolsCapability,
      })
    }
    const ref = isRecord(config) && config.apiKeyEnv !== undefined
      ? config.apiKeyEnv
      : 'DEEPSEEK_API_KEY'
    return hasCredentialRef(ref, sources)
      ? Object.freeze({ available: true, reason: 'available', selection, toolsCapability })
      : Object.freeze({ available: false, reason: 'missing-credentials', selection, toolsCapability })
  }

  const providers = settings?.['llm-pi-ai']?.providers
  const profile = isRecord(providers) ? providers[selection.provider] : undefined
  if (!isRecord(profile)) {
    return Object.freeze({ available: false, reason: 'no-model', selection })
  }
  const toolsCapability = configuredToolsCapability(settings, selection)
  const tools = repairToolsCapability(toolsCapability)
  if (!tools.compatible) {
    return Object.freeze({
      available: false,
      reason: tools.reason,
      selection,
      toolsCapability,
    })
  }
  if (hasStoredProviderRecord(credentials, selection.provider) || hasCredentialHeader(profile)) {
    return Object.freeze({ available: true, reason: 'available', selection, toolsCapability })
  }

  if (profile.apiKeyEnv !== undefined) {
    return hasCredentialRef(profile.apiKeyEnv, sources)
      ? Object.freeze({ available: true, reason: 'available', selection, toolsCapability })
      : Object.freeze({ available: false, reason: 'missing-credentials', selection, toolsCapability })
  }
  return (PROVIDER_CREDENTIAL_REFS[selection.provider] ?? [])
    .some(ref => hasCredentialRef(ref, sources))
    ? Object.freeze({ available: true, reason: 'available', selection, toolsCapability })
    : Object.freeze({ available: false, reason: 'missing-credentials', selection, toolsCapability })
}

function jobFallbackSelection(status) {
  const toolsCapability = status.toolsCapability ?? status.selection?.toolsCapability
  return Object.freeze({
    ...status.selection,
    ...(toolsCapability === undefined ? {} : { toolsCapability }),
  })
}

/**
 * Check only local, bounded configuration facts before starting model repair.
 * This never calls a provider or reads a secret value out of the process.
 */
export async function resolveRepairModelAvailability({
  dshHome,
  environment = process.env,
  compatibilityEnvironment = {},
  fallbackModels = [],
} = {}) {
  if (typeof dshHome !== 'string' || !isAbsolute(dshHome)) {
    throw new TypeError('repair model availability requires an absolute DSH Home')
  }
  if (!isRecord(environment) || !isRecord(compatibilityEnvironment)) {
    throw new TypeError('repair model credential environments must be objects')
  }
  if (!Array.isArray(fallbackModels)) {
    throw new TypeError('repair model fallbacks must be an array')
  }

  const home = resolve(dshHome)
  const [settings, credentials] = await Promise.all([
    readConfiguration(join(home, 'settings.yaml')),
    readConfiguration(join(home, '.credentials.yaml')),
  ])
  if (!isRecord(settings) || !isRecord(credentials)) {
    return Object.freeze({ available: false, reason: 'no-model' })
  }

  const selection = selectedModel(settings)
  const refs = credentialRefs(credentials)
  const sources = [environment, compatibilityEnvironment, refs]
  const primary = inspectSelection({ settings, credentials, sources, selection })
  const fallbackSelections = fallbackModels
    .slice(0, 1)
    .map(safeFallbackSelection)
    .filter(value => value !== undefined)
  const fallbackStatuses = fallbackSelections.map(fallback => (
    inspectSelection({ settings, credentials, sources, selection: fallback })
  ))
  const fallbackForJob = fallbackStatuses.map(jobFallbackSelection)
  const fallbackAvailable = fallbackStatuses.some(status => status.available)
  const fallbackDetail = fallbackForJob.length > 0 ? { fallbackModels: fallbackForJob } : {}

  if (primary.available) {
    return Object.freeze({ ...primary, ...fallbackDetail })
  }
  if (fallbackAvailable) {
    return Object.freeze({
      available: true,
      reason: 'available',
      selection: primary.selection,
      ...(primary.toolsCapability === undefined ? {} : { toolsCapability: primary.toolsCapability }),
      ...fallbackDetail,
    })
  }
  return primary
}

export async function hasConfiguredRepairModel(options = {}) {
  return (await resolveRepairModelAvailability(options)).available
}
