import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createDesktopNetworkDiagnostics,
  probeDesktopNetworkEndpoint,
} from '../src/network-diagnostics.mjs'

function response(status = 200) {
  return {
    status,
    body: { cancel: async () => {} },
  }
}

test('network endpoint probes return bounded safe outcomes without URLs or raw errors', async () => {
  let time = 100
  const reachable = await probeDesktopNetworkEndpoint(async () => response(206), 'https://updates.example/release', {
    now: () => { time += 7; return time },
  })
  assert.deepEqual(reachable, { status: 'reachable', elapsedMs: 7 })

  const auth = await probeDesktopNetworkEndpoint(async () => response(407), 'https://market.example/catalog')
  assert.equal(auth.status, 'blocked')
  assert.equal(auth.reason, 'proxy-authentication-required')

  const secret = 'must-not-return-from-diagnostic'
  const failed = await probeDesktopNetworkEndpoint(async () => {
    throw new Error(`getaddrinfo failure ${secret} at https://private.example/path`)
  }, 'https://registry.example/')
  assert.deepEqual(Object.keys(failed).toSorted(), ['elapsedMs', 'reason', 'status'])
  assert.equal(failed.reason, 'unreachable')
  assert.doesNotMatch(JSON.stringify(failed), new RegExp(secret, 'u'))
  assert.doesNotMatch(JSON.stringify(failed), /private\.example/u)
})

test('network endpoint timeout is observable even when the transport waits for cancellation', async () => {
  const result = await probeDesktopNetworkEndpoint((_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('late transport detail'), { name: 'AbortError' })), { once: true })
  }), 'https://updates.example/release', {
    timeoutMs: 100,
    schedule: (callback) => { queueMicrotask(callback); return 1 },
    cancelSchedule: () => {},
  })
  assert.equal(result.status, 'blocked')
  assert.equal(result.reason, 'timeout')
})

test('Desktop network diagnostics separate reachable transports from capability-only entries', async () => {
  const requested = []
  const fetch = async (url) => {
    requested.push(url)
    return response(200)
  }
  const safeStatus = {
    api: { applied: false, summary: 'mode=system-default rules=0 bypass=0 pac=no' },
    update: { applied: true, summary: 'mode=direct rules=0 bypass=0 pac=no' },
    market: {
      applied: true,
      summary: 'mode=fixed_servers rules=1 kinds=https bypass=0 pac=no',
      packageInstaller: 'cooperative-environment',
    },
  }
  const diagnostics = createDesktopNetworkDiagnostics({
    updateFetch: fetch,
    marketFetch: fetch,
    networkStatus: safeStatus,
  })
  const result = await diagnostics.run()
  assert.equal(result.update.connectivity.status, 'reachable')
  assert.equal(result.market.connectivity.status, 'reachable')
  assert.equal(result.pluginRegistry.connectivity.status, 'reachable')
  assert.equal(result.api.connectivity.status, 'not-probed')
  assert.equal(result.pluginInstaller.connectivity.status, 'not-probed')
  assert.equal(result.pluginInstaller.connectivity.reason, 'pnpm-child-runs-only-during-user-install')
  assert.equal(requested.length, 3)
  assert.doesNotMatch(JSON.stringify(result), /https:\/\//u)
})
