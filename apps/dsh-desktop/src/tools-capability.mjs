export const TOOLS_CAPABILITIES = Object.freeze(['auto', 'native', 'none'])
export const UNSUPPORTED_TOOLS_CODE = 'UNSUPPORTED_TOOLS'

const SAFE_OPERATION = /^[a-z][a-z0-9._-]{0,63}$/iu
const SAFE_PROVIDER = /^[a-z0-9][a-z0-9._-]{0,63}$/iu
const SAFE_MODEL = /^[a-z0-9][a-z0-9._:/-]{0,127}$/iu
const MAX_SAFE_COUNT = 10_000

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function boundedString(value, pattern, fallback = 'unknown') {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128 || !pattern.test(value)) {
    return fallback
  }
  return value
}

function boundedCount(value) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(Math.trunc(value), MAX_SAFE_COUNT))
}

function requestedToolCount(options) {
  if (!isRecord(options)) return 0
  if (Array.isArray(options.tools)) return boundedCount(options.tools.length)
  return options.tools === undefined ? 0 : 1
}

export function normalizeToolsCapability(value) {
  return TOOLS_CAPABILITIES.includes(value) ? value : 'auto'
}

export function hasToolHistory(options) {
  if (!isRecord(options) || !Array.isArray(options.messages)) return false
  return options.messages.some((message) => {
    if (!isRecord(message)) return false
    if (message.role === 'tool') return true
    return Array.isArray(message.content)
      && message.content.some((block) => block?.type === 'tool-call' || block?.type === 'tool-result')
  })
}

function configuredRoute(settings, provider) {
  if (!isRecord(settings) || typeof provider !== 'string' || provider.length === 0) return undefined
  if (provider === 'deepseek-official') return settings['llm-deepseek']
  return settings['llm-pi-ai']?.providers?.[provider]
}

// Resolve a route-level capability. Provider id is the only routing key;
// model names never select or override tools behavior.
export function configuredToolsCapability(settings, selection) {
  const provider = typeof selection?.provider === 'string' ? selection.provider.trim() : ''
  const route = configuredRoute(settings, provider)
  return normalizeToolsCapability(route?.toolsCapability)
}

export class UnsupportedToolsError extends Error {
  constructor(message = 'provider route does not support tool history') {
    super(message)
    this.name = 'UnsupportedToolsError'
    this.code = UNSUPPORTED_TOOLS_CODE
  }
}

export function describeToolsRequest({
  options,
  capability = 'auto',
  operation = 'chat',
  provider,
  model,
  stream = true,
  toolsSent,
} = {}) {
  const normalizedCapability = normalizeToolsCapability(capability)
  const toolsRequested = requestedToolCount(options)
  const sent = toolsSent === undefined
    ? normalizedCapability === 'none' ? 0 : toolsRequested
    : typeof toolsSent === 'boolean'
      ? toolsSent ? toolsRequested : 0
      : boundedCount(toolsSent)
  return Object.freeze({
    provider: boundedString(provider, SAFE_PROVIDER),
    model: boundedString(model, SAFE_MODEL),
    operation: boundedString(operation, SAFE_OPERATION),
    messageCount: isRecord(options) && Array.isArray(options.messages)
      ? Math.min(options.messages.length, 10_000)
      : 0,
    stream: stream === true,
    toolsRequested,
    toolsSent: sent,
    toolsCapability: normalizedCapability,
    toolHistory: hasToolHistory(options),
  })
}

// Apply the request-side tools contract without mutating GenerateOptions.
// none is valid for ordinary chat, but tool history is a hard capability
// error and must be decided before entering a provider adapter.
export function prepareToolsRequest(options, {
  capability = 'auto',
  operation = 'chat',
  provider,
  model,
} = {}) {
  if (!isRecord(options)) throw new TypeError('LLM request options must be an object')
  const normalizedCapability = normalizeToolsCapability(capability)
  const toolHistory = hasToolHistory(options)
  if (normalizedCapability === 'none' && toolHistory) {
    throw new UnsupportedToolsError()
  }

  const requestOptions = normalizedCapability === 'none'
    ? (({ tools: _tools, ...rest }) => rest)(options)
    : options
  const diagnostics = describeToolsRequest({
    options,
    capability: normalizedCapability,
    operation,
    provider,
    model,
    toolsSent: normalizedCapability === 'none' ? 0 : requestedToolCount(options),
  })
  return Object.freeze({ options: requestOptions, diagnostics })
}

export function repairToolsCapability(capability) {
  const normalizedCapability = normalizeToolsCapability(capability)
  return normalizedCapability === 'none'
    ? Object.freeze({ compatible: false, reason: 'unsupported-tools', toolsCapability: normalizedCapability })
    : Object.freeze({ compatible: true, reason: 'available', toolsCapability: normalizedCapability })
}
