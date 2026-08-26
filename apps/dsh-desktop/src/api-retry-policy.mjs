const RETRYABLE_CODES = Object.freeze([
  'EMPTY_RESPONSE',
  'RATE_LIMIT',
  'SERVER',
  'TIMEOUT',
  'TRANSPORT',
  'STREAM_CLOSED',
])

const RETRY_BACKOFF = Object.freeze({
  initialDelayMs: 750,
  maxDelayMs: 15_000,
  jitterRatio: 0.15,
})

export const DEFAULT_API_RETRY_POLICY = Object.freeze({
  mode: 'normal',
  maxRetries: 4,
  retryableCodes: RETRYABLE_CODES,
  backoff: RETRY_BACKOFF,
})

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function copyPolicy() {
  return {
    mode: DEFAULT_API_RETRY_POLICY.mode,
    maxRetries: DEFAULT_API_RETRY_POLICY.maxRetries,
    retryableCodes: [...DEFAULT_API_RETRY_POLICY.retryableCodes],
    backoff: { ...DEFAULT_API_RETRY_POLICY.backoff },
  }
}

/** Add bounded transient retry defaults without replacing explicit user policies. */
export function withDefaultApiRetryPolicies(value) {
  if (!isRecord(value)) return { changed: false, settings: value, paths: [] }
  let settings = value
  const paths = []
  const deepseek = value['llm-deepseek']
  if (isRecord(deepseek) && deepseek.retryPolicy === undefined) {
    settings = { ...settings, 'llm-deepseek': { ...deepseek, retryPolicy: copyPolicy() } }
    paths.push(['llm-deepseek', 'retryPolicy'])
  }

  const piAi = value['llm-pi-ai']
  if (isRecord(piAi) && isRecord(piAi.providers)) {
    let providers = piAi.providers
    for (const [name, profile] of Object.entries(piAi.providers)) {
      if (!isRecord(profile) || profile.retryPolicy !== undefined) continue
      if (providers === piAi.providers) providers = { ...providers }
      providers[name] = { ...profile, retryPolicy: copyPolicy() }
      paths.push(['llm-pi-ai', 'providers', name, 'retryPolicy'])
    }
    if (providers !== piAi.providers) {
      settings = { ...settings, 'llm-pi-ai': { ...piAi, providers } }
    }
  }
  return { changed: paths.length > 0, settings, paths }
}
