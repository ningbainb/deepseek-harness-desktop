import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyElectronProxyConfiguration,
  createAbortableElectronSessionFetch,
  describeDesktopProxyConfiguration,
  resolveDesktopNetworkPlan,
  resolveScopedDesktopProxyConfiguration,
  runtimeProxyEnvironmentFor,
} from '../src/network-proxy.mjs'

test('scoped proxy settings are independent and preserve documented precedence', () => {
  const env = {
    DSH_DESKTOP_PROXY_RULES: 'http://global.example:8000',
    DSH_DESKTOP_API_PROXY_MODE: 'direct',
    DSH_DESKTOP_UPDATE_PROXY_PAC_URL: 'https://updates.example/proxy.pac',
    DSH_DESKTOP_UPDATE_NO_PROXY: 'updates.internal',
    DSH_DESKTOP_MARKET_PROXY_RULES: 'https=http://market.example:9000',
    DSH_DESKTOP_MARKET_NO_PROXY: 'registry.internal',
  }
  assert.deepEqual(resolveDesktopNetworkPlan([], env), {
    api: { mode: 'direct' },
    update: {
      mode: 'pac_script',
      pacScript: 'https://updates.example/proxy.pac',
      proxyBypassRules: 'updates.internal',
    },
    market: {
      mode: 'fixed_servers',
      proxyRules: 'https=http://market.example:9000',
      proxyBypassRules: 'registry.internal',
    },
  })

  const commandLine = ['--proxy-server=http://cli.example:7000']
  for (const scope of ['api', 'update', 'market']) {
    assert.deepEqual(resolveScopedDesktopProxyConfiguration(scope, commandLine, env), {
      mode: 'fixed_servers',
      proxyRules: 'http://cli.example:7000',
    })
  }
})

test('runtime proxy projection clears direct mode and maps representable fixed rules', () => {
  const direct = runtimeProxyEnvironmentFor({ mode: 'direct' })
  assert.equal(direct.status, 'configured')
  for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy']) {
    assert.equal(direct.environment[key], '')
  }

  const fixed = runtimeProxyEnvironmentFor({
    mode: 'fixed_servers',
    proxyRules: 'http=http://alice:secret@proxy.example:8080;https=http://proxy.example:8443',
    proxyBypassRules: 'localhost,127.0.0.1',
  })
  assert.equal(fixed.status, 'configured')
  assert.equal(fixed.environment.HTTP_PROXY, 'http://alice:secret@proxy.example:8080')
  assert.equal(fixed.environment.HTTPS_PROXY, 'http://proxy.example:8443')
  assert.equal(fixed.environment.NO_PROXY, 'localhost,127.0.0.1')
  assert.equal(fixed.environment.http_proxy, fixed.environment.HTTP_PROXY)

  assert.deepEqual(runtimeProxyEnvironmentFor({ mode: 'pac_script', pacScript: 'https://proxy.example/pac' }), {
    environment: {},
    status: 'unsupported',
    reason: 'pac-not-supported-by-runtime-environment',
  })
})

test('Electron proxy application is awaited and emits only credential-free routing shape', async () => {
  const calls = []
  const logs = []
  const secret = 'must-not-enter-log'
  const config = {
    mode: 'fixed_servers',
    proxyRules: `http=http://alice:${secret}@proxy.example:8080`,
    proxyBypassRules: 'localhost',
  }
  const status = await applyElectronProxyConfiguration({
    setProxy: async (value) => calls.push(value),
  }, config, {
    scope: 'market',
    log: async (line) => logs.push(line),
  })
  assert.deepEqual(calls, [config])
  assert.equal(status.applied, true)
  assert.equal(status.summary, describeDesktopProxyConfiguration(config))
  assert.doesNotMatch(JSON.stringify({ status, logs }), new RegExp(secret, 'u'))
  assert.doesNotMatch(JSON.stringify({ status, logs }), /alice|proxy\.example/u)

  const failed = await applyElectronProxyConfiguration({
    setProxy: async () => { throw Object.assign(new Error(`failed ${secret}`), { code: 'ERR_PROXY_CONNECTION_FAILED' }) },
  }, config, { scope: 'update', log: async (line) => logs.push(line) })
  assert.equal(failed.applied, false)
  assert.equal(failed.error, 'ERR_PROXY_CONNECTION_FAILED')
  assert.doesNotMatch(JSON.stringify({ failed, logs }), new RegExp(secret, 'u'))
})

test('abortable Electron fetch returns at caller cancellation and resets only its isolated Session', async () => {
  let closeCalls = 0
  const session = {
    fetch: async () => new Promise(() => {}),
    closeAllConnections: async () => { closeCalls += 1 },
  }
  const fetch = createAbortableElectronSessionFetch(session)
  const controller = new AbortController()
  const operation = fetch('http://proxy-auth.example/frozen', { signal: controller.signal })
  controller.abort(new Error('bounded fixture timeout'))
  await assert.rejects(operation, /bounded fixture timeout/u)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(closeCalls, 1)

  const alreadyAborted = new AbortController()
  alreadyAborted.abort()
  await assert.rejects(fetch('http://proxy-auth.example/frozen', { signal: alreadyAborted.signal }), {
    name: 'AbortError',
  })
  assert.equal(closeCalls, 1)
})
