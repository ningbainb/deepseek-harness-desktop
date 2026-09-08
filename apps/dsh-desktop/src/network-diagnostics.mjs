import { performance } from 'node:perf_hooks'

import { GITHUB_DOWNLOADS_URL } from './community-links.mjs'
import { COMMUNITY_MARKET_URL } from './extensions/community-market.mjs'
import { NPM_REGISTRY_ORIGIN } from './extensions/plugin-registry.mjs'

const DEFAULT_TIMEOUT_MS = 5_000

function boundedElapsed(startedAt, now) {
  const elapsed = Math.round(now() - startedAt)
  return Number.isSafeInteger(elapsed) ? Math.max(0, Math.min(elapsed, 60_000)) : 0
}
function failureKind(error, signal) {
  if (signal.aborted || error?.name === 'AbortError' || error?.name === 'TimeoutError') return 'timeout'
  if (error?.code === 'ENOTFOUND') return 'dns-failed'
  return 'unreachable'
}

/** Probe one fixed, Desktop-owned endpoint without returning its URL or raw error. */
export async function probeDesktopNetworkEndpoint(fetchImpl, endpoint, {
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = () => performance.now(),
  schedule = setTimeout,
  cancelSchedule = clearTimeout,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('network diagnostic fetch implementation is required')
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://')) throw new TypeError('network diagnostic endpoint must use HTTPS')
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) {
    throw new TypeError('network diagnostic timeout must be between 100 and 30000ms')
  }
  const controller = new AbortController()
  const startedAt = now()
  const timer = schedule(() => controller.abort(), timeoutMs)
  timer?.unref?.()
  let response
  try {
    response = await fetchImpl(endpoint, {
      method: 'GET',
      headers: { accept: '*/*', range: 'bytes=0-0' },
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal,
    })
    const status = Number(response?.status)
    await response?.body?.cancel?.().catch?.(() => {})
    if (status === 407) {
      return Object.freeze({ status: 'blocked', reason: 'proxy-authentication-required', elapsedMs: boundedElapsed(startedAt, now) })
    }
    if (!Number.isInteger(status) || status < 200 || status >= 500) {
      return Object.freeze({ status: 'blocked', reason: 'endpoint-http-error', elapsedMs: boundedElapsed(startedAt, now) })
    }
    return Object.freeze({ status: 'reachable', elapsedMs: boundedElapsed(startedAt, now) })
  } catch (error) {
    await response?.body?.cancel?.().catch?.(() => {})
    return Object.freeze({ status: 'blocked', reason: failureKind(error, controller.signal), elapsedMs: boundedElapsed(startedAt, now) })
  } finally {
    cancelSchedule(timer)
  }
}

export function createDesktopNetworkDiagnostics({ updateFetch, marketFetch, networkStatus } = {}) {
  if (typeof updateFetch !== 'function' || typeof marketFetch !== 'function') {
    throw new TypeError('Desktop network diagnostics require update and market fetch implementations')
  }
  if (networkStatus === null || typeof networkStatus !== 'object' || Array.isArray(networkStatus)) {
    throw new TypeError('Desktop network diagnostics require a safe configuration status')
  }

  return Object.freeze({
    async run() {
      const update = await probeDesktopNetworkEndpoint(updateFetch, GITHUB_DOWNLOADS_URL)
      const market = await probeDesktopNetworkEndpoint(marketFetch, COMMUNITY_MARKET_URL)
      const pluginRegistry = await probeDesktopNetworkEndpoint(marketFetch, NPM_REGISTRY_ORIGIN)
      return Object.freeze({
        api: Object.freeze({
          configuration: networkStatus.api,
          connectivity: Object.freeze({
            status: 'not-probed',
            reason: 'official-provider-endpoint-not-exposed',
          }),
        }),
        update: Object.freeze({ configuration: networkStatus.update, connectivity: update }),
        market: Object.freeze({ configuration: networkStatus.market, connectivity: market }),
        pluginRegistry: Object.freeze({
          configuration: networkStatus.market,
          connectivity: pluginRegistry,
        }),
        pluginInstaller: Object.freeze({
          configuration: networkStatus.market,
          connectivity: Object.freeze({
            status: 'not-probed',
            reason: networkStatus.market?.packageInstaller === 'cooperative-environment'
              ? 'pnpm-child-runs-only-during-user-install'
              : 'pnpm-proxy-transport-unverified',
          }),
        }),
      })
    },
  })
}
