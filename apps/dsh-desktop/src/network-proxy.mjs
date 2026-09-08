const PROXY_ENVIRONMENT_KEYS = Object.freeze([
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'no_proxy',
])

const NETWORK_SCOPES = Object.freeze(['api', 'update', 'market'])

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function commandLineProxyConfiguration(commandLine) {
  let proxyBypassRules
  for (const arg of commandLine) {
    if (typeof arg !== 'string') continue
    const bypassMatch = /^--proxy-bypass-list=(.+)$/i.exec(arg.trim())
    if (bypassMatch) proxyBypassRules = bypassMatch[1].trim()
  }
  for (const arg of commandLine) {
    if (typeof arg !== 'string') continue
    const normalized = arg.trim()
    if (/^--no-proxy-server$/iu.test(normalized)) return { mode: 'direct' }
    if (/^--proxy-auto-detect$/iu.test(normalized)) return { mode: 'auto_detect' }
    const pacMatch = /^--proxy-pac-url=(.+)$/i.exec(normalized)
    if (pacMatch) {
      return {
        mode: 'pac_script',
        pacScript: pacMatch[1].trim(),
        ...(proxyBypassRules ? { proxyBypassRules } : {}),
      }
    }
    const fixedMatch = /^--proxy-server=(.+)$/i.exec(normalized)
    if (fixedMatch) {
      return {
        mode: 'fixed_servers',
        proxyRules: fixedMatch[1].trim(),
        ...(proxyBypassRules ? { proxyBypassRules } : {}),
      }
    }
  }
  return undefined
}

function environmentProxyConfiguration(env, prefix = 'DSH_DESKTOP') {
  const mode = nonEmpty(env?.[`${prefix}_PROXY_MODE`])?.toLowerCase()
  const pacScript = nonEmpty(env?.[`${prefix}_PROXY_PAC_URL`])
  const proxyRules = nonEmpty(env?.[`${prefix}_PROXY_RULES`])
  const proxyBypassRules = nonEmpty(env?.[`${prefix}_NO_PROXY`])
    ?? (prefix === 'DSH_DESKTOP' ? nonEmpty(env?.NO_PROXY) ?? nonEmpty(env?.no_proxy) : undefined)
  const hasScopedSetting = mode !== undefined
    || pacScript !== undefined
    || proxyRules !== undefined
    || proxyBypassRules !== undefined
  if (!hasScopedSetting) return undefined

  if (mode === 'direct' || mode === 'system' || mode === 'auto_detect') return { mode }
  if (mode === 'pac_script' || pacScript !== undefined) {
    if (pacScript === undefined) return undefined
    return {
      mode: 'pac_script',
      pacScript,
      ...(proxyBypassRules ? { proxyBypassRules } : {}),
    }
  }
  if (mode === 'fixed_servers' || proxyRules !== undefined) {
    if (proxyRules === undefined) return undefined
    return {
      mode: 'fixed_servers',
      proxyRules,
      ...(proxyBypassRules ? { proxyBypassRules } : {}),
    }
  }
  return undefined
}

function conventionalEnvironmentProxyConfiguration(env) {
  const httpProxy = nonEmpty(env?.HTTP_PROXY) ?? nonEmpty(env?.http_proxy)
    ?? nonEmpty(env?.ALL_PROXY) ?? nonEmpty(env?.all_proxy)
  const httpsProxy = nonEmpty(env?.HTTPS_PROXY) ?? nonEmpty(env?.https_proxy) ?? httpProxy
  const proxyBypassRules = nonEmpty(env?.NO_PROXY) ?? nonEmpty(env?.no_proxy)
  if (httpProxy === undefined && httpsProxy === undefined) return undefined
  const rules = []
  if (httpProxy !== undefined) rules.push(`http=${httpProxy}`)
  if (httpsProxy !== undefined) rules.push(`https=${httpsProxy}`)
  return {
    mode: 'fixed_servers',
    proxyRules: rules.join(';'),
    ...(proxyBypassRules ? { proxyBypassRules } : {}),
  }
}

/** Existing all-Desktop proxy contract retained for callers and old launchers. */
export function resolveDesktopProxyConfiguration(commandLine = [], env = process.env) {
  return commandLineProxyConfiguration(commandLine)
    ?? environmentProxyConfiguration(env)
    ?? conventionalEnvironmentProxyConfiguration(env)
}

/**
 * Resolve one transport independently. CLI flags intentionally stay highest
 * priority because Chromium consumes them before application startup. A
 * scope-specific environment setting then wins over the legacy Desktop-wide
 * and conventional proxy variables.
 */
export function resolveScopedDesktopProxyConfiguration(scope, commandLine = [], env = process.env) {
  if (!NETWORK_SCOPES.includes(scope)) throw new TypeError(`unsupported Desktop network scope: ${String(scope)}`)
  return commandLineProxyConfiguration(commandLine)
    ?? environmentProxyConfiguration(env, `DSH_DESKTOP_${scope.toUpperCase()}`)
    ?? environmentProxyConfiguration(env)
    ?? conventionalEnvironmentProxyConfiguration(env)
}

export function resolveDesktopNetworkPlan(commandLine = [], env = process.env) {
  return Object.freeze(Object.fromEntries(NETWORK_SCOPES.map((scope) => [
    scope,
    resolveScopedDesktopProxyConfiguration(scope, commandLine, env),
  ])))
}

/** Describe proxy shape without retaining endpoints, user names, or passwords. */
export function describeDesktopProxyConfiguration(config) {
  if (config === undefined) return 'mode=system-default rules=0 bypass=0 pac=no'
  const mode = config.mode ?? (config.pacScript ? 'pac_script' : 'fixed_servers')
  const ruleEntries = typeof config.proxyRules === 'string'
    ? config.proxyRules.split(';').map(value => value.trim()).filter(Boolean)
    : []
  const ruleKinds = [...new Set(ruleEntries.map((entry) => {
    const match = /^([a-z][a-z0-9+.-]*)=/iu.exec(entry)
    return match?.[1]?.toLowerCase() ?? 'all'
  }))].toSorted()
  const bypassCount = typeof config.proxyBypassRules === 'string'
    ? config.proxyBypassRules.split(/[;,]/u).map(value => value.trim()).filter(Boolean).length
    : 0
  return `mode=${mode} rules=${ruleEntries.length} kinds=${ruleKinds.join(',') || 'none'} bypass=${bypassCount} pac=${config.pacScript ? 'yes' : 'no'}`
}

function fixedServerEnvironment(config) {
  const entries = config.proxyRules.split(';').map((value) => value.trim()).filter(Boolean)
  const routed = {}
  for (const entry of entries) {
    const match = /^([a-z][a-z0-9+.-]*)=(.+)$/iu.exec(entry)
    if (match === null) {
      routed.HTTP_PROXY ??= entry
      routed.HTTPS_PROXY ??= entry
      continue
    }
    const kind = match[1].toLowerCase()
    const value = match[2].trim()
    if (kind === 'http') routed.HTTP_PROXY = value
    else if (kind === 'https') routed.HTTPS_PROXY = value
    else if (kind === 'socks' || kind === 'socks4' || kind === 'socks5') routed.ALL_PROXY = value
  }
  if (config.proxyBypassRules) routed.NO_PROXY = config.proxyBypassRules
  return routed
}

function withCaseAliases(values) {
  const result = {}
  for (const [key, value] of Object.entries(values)) {
    result[key] = value
    result[key.toLowerCase()] = value
  }
  return result
}

/**
 * Project only proxy modes representable as conventional child-process
 * environment variables. This configures cooperative SDKs; it is not a
 * process sandbox and cannot force arbitrary providers to use a dispatcher.
 */
export function runtimeProxyEnvironmentFor(config) {
  if (config === undefined || config.mode === 'system') {
    return Object.freeze({
      environment: Object.freeze({}),
      status: 'inherited',
      reason: 'provider-transport-unverified',
    })
  }
  if (config.mode === 'direct') {
    return Object.freeze({
      environment: Object.freeze(Object.fromEntries(PROXY_ENVIRONMENT_KEYS.map((key) => [key, '']))),
      status: 'configured',
      reason: 'proxy-environment-cleared',
    })
  }
  if (config.mode !== 'fixed_servers' || typeof config.proxyRules !== 'string') {
    return Object.freeze({
      environment: Object.freeze({}),
      status: 'unsupported',
      reason: config.mode === 'pac_script' ? 'pac-not-supported-by-runtime-environment' : 'auto-detect-not-supported-by-runtime-environment',
    })
  }
  const values = fixedServerEnvironment(config)
  if (values.HTTP_PROXY === undefined && values.HTTPS_PROXY === undefined && values.ALL_PROXY === undefined) {
    return Object.freeze({
      environment: Object.freeze({}),
      status: 'unsupported',
      reason: 'proxy-rules-not-representable-as-runtime-environment',
    })
  }
  return Object.freeze({
    environment: Object.freeze(withCaseAliases(values)),
    status: 'configured',
    reason: 'cooperative-provider-environment',
  })
}

/** Apply one Electron Session policy and return a credential-free status. */
export async function applyElectronProxyConfiguration(session, config, { scope, log = async () => {} } = {}) {
  if (typeof session?.setProxy !== 'function') throw new TypeError('Electron Session proxy API is unavailable')
  const label = NETWORK_SCOPES.includes(scope) ? scope : 'unknown'
  const summary = describeDesktopProxyConfiguration(config)
  if (config === undefined) {
    await log(`[network] scope=${label} configured ${summary}`)
    return Object.freeze({ scope: label, applied: true, summary })
  }
  try {
    await session.setProxy(config)
    await log(`[network] scope=${label} configured ${summary}`)
    return Object.freeze({ scope: label, applied: true, summary })
  } catch (error) {
    const code = typeof error?.code === 'string' ? error.code : error?.name ?? 'unknown'
    await log(`[network] scope=${label} proxy configuration failed: ${code}`)
    return Object.freeze({ scope: label, applied: false, summary, error: String(code).slice(0, 80) })
  }
}

function abortError(signal) {
  if (signal?.reason instanceof Error) return signal.reason
  const error = new Error('Electron Session request aborted')
  error.name = 'AbortError'
  return error
}

/**
 * Electron Session.fetch can remain pending while Chromium waits on a proxy
 * authentication challenge. Convert caller cancellation into a hard promise
 * boundary and reset only the caller-owned isolated Session connections.
 */
export function createAbortableElectronSessionFetch(session, { closeConnectionsOnAbort = true } = {}) {
  if (typeof session?.fetch !== 'function') throw new TypeError('Electron Session fetch API is unavailable')
  if (typeof closeConnectionsOnAbort !== 'boolean') throw new TypeError('closeConnectionsOnAbort must be a boolean')
  return async function abortableSessionFetch(input, init = {}) {
    const signal = init?.signal
    if (signal === undefined) return session.fetch(input, init)
    if (typeof signal?.addEventListener !== 'function') throw new TypeError('request signal is invalid')
    if (signal.aborted) throw abortError(signal)

    let onAbort
    const cancellation = new Promise((_, reject) => {
      onAbort = () => {
        if (closeConnectionsOnAbort) void Promise.resolve(session.closeAllConnections?.()).catch(() => {})
        reject(abortError(signal))
      }
      signal.addEventListener('abort', onAbort, { once: true })
    })
    const request = Promise.resolve().then(() => session.fetch(input, init))
    try {
      return await Promise.race([request, cancellation])
    } finally {
      signal.removeEventListener('abort', onAbort)
    }
  }
}

export const DESKTOP_NETWORK_SCOPES = NETWORK_SCOPES
