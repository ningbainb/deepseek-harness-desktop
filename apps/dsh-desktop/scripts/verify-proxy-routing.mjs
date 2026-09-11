#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import electronPath from 'electron'
import { _electron as electron } from 'playwright'

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporary = await mkdtemp(resolve(tmpdir(), 'dsh-proxy-routing-e2e-'))

async function listen(server) {
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolveListen()
    })
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('test server address is unavailable')
  return address.port
}

async function close(server) {
  await new Promise((resolveClose) => {
    server.close(() => resolveClose())
    server.closeAllConnections()
  })
}

const targetRequests = []
const proxyRequests = []
const authProxyRequests = []
const pacRequests = []

const target = createServer((request, response) => {
  targetRequests.push(request.url)
  response.writeHead(200, { 'content-type': 'text/plain' })
  response.end('direct-target')
})
const proxy = createServer((request, response) => {
  proxyRequests.push(request.url)
  response.writeHead(200, { 'content-type': 'text/plain' })
  response.end('proxy-target')
})
const authProxy = createServer((request, response) => {
  authProxyRequests.push({
    url: request.url,
    authorized: request.headers['proxy-authorization'] === `Basic ${Buffer.from('proxy-user:proxy-password').toString('base64')}`,
  })
  if (!authProxyRequests.at(-1).authorized) {
    response.writeHead(407, { 'proxy-authenticate': 'Basic realm="dsh-test"' })
    response.end('proxy authentication required')
    return
  }
  response.writeHead(200, { 'content-type': 'text/plain' })
  response.end('authenticated-proxy-target')
})
const pac = createServer((_request, response) => {
  pacRequests.push('requested')
  response.writeHead(200, { 'content-type': 'application/x-ns-proxy-autoconfig' })
  response.end('function FindProxyForURL(url, host) { return invalid syntax; }')
})

let electronApp
try {
  const [targetPort, proxyPort, authProxyPort, pacPort] = await Promise.all([
    listen(target),
    listen(proxy),
    listen(authProxy),
    listen(pac),
  ])
  console.log('Proxy routing fixture servers ready')
  electronApp = await electron.launch({
    executablePath: electronPath,
    args: [resolve(APP_DIR, 'src', 'main.mjs')],
    cwd: APP_DIR,
    env: {
      ...process.env,
      DSH_DESKTOP_DISABLE_UPDATES: '1',
      DSH_DESKTOP_HOLD_STARTUP: '1',
      DSH_DESKTOP_PROXY_MODE: 'direct',
      DSH_DESKTOP_USER_DATA: resolve(temporary, 'user-data'),
      DSH_HOME: resolve(temporary, 'dsh-home'),
      ELECTRON_ENABLE_LOGGING: '0',
    },
  })
  await electronApp.firstWindow()
  console.log('Proxy routing Electron process ready')

  const routed = await electronApp.evaluate(async ({ session }, input) => {
    const networkSession = session.fromPartition('dsh-proxy-routing-e2e', { cache: false })
    await networkSession.setProxy({
      mode: 'fixed_servers',
      proxyRules: `http://127.0.0.1:${input.proxyPort}`,
    })
    const response = await networkSession.fetch('http://dsh-proxy-route.invalid/catalog', {
      signal: AbortSignal.timeout(3_000),
    })
    return { status: response.status, body: await response.text() }
  }, { proxyPort })
  assert.deepEqual(routed, { status: 200, body: 'proxy-target' })
  assert.equal(proxyRequests.length, 1)
  assert.match(proxyRequests[0], /^http:\/\/dsh-proxy-route\.invalid\/catalog$/u)
  console.log('Fixed proxy route verified')

  const bypassed = await electronApp.evaluate(async ({ session }, input) => {
    const networkSession = session.fromPartition('dsh-proxy-bypass-e2e', { cache: false })
    await networkSession.setProxy({
      mode: 'fixed_servers',
      proxyRules: `http://127.0.0.1:${input.proxyPort}`,
      proxyBypassRules: 'localhost,127.0.0.1',
    })
    const response = await networkSession.fetch(`http://127.0.0.1:${input.targetPort}/no-proxy`, {
      signal: AbortSignal.timeout(3_000),
    })
    return { status: response.status, body: await response.text() }
  }, { proxyPort, targetPort })
  assert.deepEqual(bypassed, { status: 200, body: 'direct-target' })
  assert.deepEqual(targetRequests, ['/no-proxy'])
  assert.equal(proxyRequests.length, 1)
  console.log('Proxy bypass route verified')

  const authRecovery = await electronApp.evaluate(async ({ net, session }, input) => {
    const networkSession = session.fromPartition('dsh-proxy-auth-e2e', { cache: false })
    await networkSession.setProxy({
      mode: 'fixed_servers',
      proxyRules: `http://127.0.0.1:${input.authProxyPort}`,
    })
    const startedAt = Date.now()
    const challenge = await new Promise((resolveChallenge) => {
      const request = net.request({
        url: 'http://dsh-auth-route.invalid/manifest',
        session: networkSession,
      })
      let challenged = false
      const timer = setTimeout(() => {
        request.abort()
        resolveChallenge({ outcome: 'timeout', challenged })
      }, 2_000)
      request.on('login', (authInfo, callback) => {
        challenged = authInfo.isProxy === true
        callback()
      })
      request.on('response', (response) => {
        clearTimeout(timer)
        response.on('data', () => {})
        response.on('end', () => resolveChallenge({ outcome: `response-${response.statusCode}`, challenged }))
      })
      request.on('error', () => {
        clearTimeout(timer)
        resolveChallenge({ outcome: 'failed', challenged })
      })
      request.end()
    })
    await networkSession.setProxy({ mode: 'direct' })
    const response = await networkSession.fetch(`http://127.0.0.1:${input.targetPort}/after-auth`, {
      signal: AbortSignal.timeout(3_000),
    })
    return {
      ...challenge,
      elapsedMs: Date.now() - startedAt,
      recovered: response.status === 200 && await response.text() === 'direct-target',
    }
  }, { authProxyPort, targetPort })
  assert.ok(['failed', 'timeout', 'response-407'].includes(authRecovery.outcome))
  assert.equal(authRecovery.challenged, true)
  assert.ok(authRecovery.elapsedMs < 4_000)
  assert.equal(authRecovery.recovered, true)
  assert.ok(authProxyRequests.length >= 1)
  assert.equal(authProxyRequests.some((request) => request.authorized), false)
  console.log('Authenticated proxy challenge recovery verified')

  const pacRecovery = await electronApp.evaluate(async ({ session }, input) => {
    const networkSession = session.fromPartition('dsh-proxy-pac-e2e', { cache: false })
    await networkSession.setProxy({
      mode: 'pac_script',
      pacScript: `http://127.0.0.1:${input.pacPort}/invalid.pac`,
    })
    const startedAt = Date.now()
    const request = networkSession.fetch('http://dsh-pac-route.invalid/fail', { signal: AbortSignal.timeout(2_000) })
      .then(() => 'response', () => 'failed')
    const outcome = await Promise.race([
      request,
      new Promise((resolveTimeout) => setTimeout(() => resolveTimeout('timeout'), 2_000)),
    ])
    const elapsedMs = Date.now() - startedAt
    await networkSession.setProxy({ mode: 'direct' })
    await networkSession.closeAllConnections()
    const response = await networkSession.fetch(`http://127.0.0.1:${input.targetPort}/after-pac`, {
      signal: AbortSignal.timeout(3_000),
    })
    return { outcome, elapsedMs, recovered: response.status === 200 && await response.text() === 'direct-target' }
  }, { pacPort, targetPort })
  assert.ok(['failed', 'timeout'].includes(pacRecovery.outcome))
  assert.ok(pacRecovery.elapsedMs < 4_000)
  assert.equal(pacRecovery.recovered, true)
  assert.ok(pacRequests.length >= 1)
  console.log('PAC failure recovery verified')

  const dnsRecovery = await electronApp.evaluate(async ({ session }, input) => {
    const networkSession = session.fromPartition('dsh-proxy-dns-e2e', { cache: false })
    await networkSession.setProxy({ mode: 'direct' })
    const startedAt = Date.now()
    const request = networkSession.fetch('http://dsh-dns-route.invalid/fail', { signal: AbortSignal.timeout(2_000) })
      .then(() => 'response', () => 'failed')
    const outcome = await Promise.race([
      request,
      new Promise((resolveTimeout) => setTimeout(() => resolveTimeout('timeout'), 2_000)),
    ])
    const elapsedMs = Date.now() - startedAt
    await networkSession.closeAllConnections()
    const response = await networkSession.fetch(`http://127.0.0.1:${input.targetPort}/after-dns`, {
      signal: AbortSignal.timeout(3_000),
    })
    return { outcome, elapsedMs, recovered: response.status === 200 && await response.text() === 'direct-target' }
  }, { targetPort })
  assert.ok(['failed', 'timeout'].includes(dnsRecovery.outcome))
  assert.ok(dnsRecovery.elapsedMs < 4_000)
  assert.equal(dnsRecovery.recovered, true)
  console.log('DNS failure recovery verified')

  console.log('Desktop Electron proxy routing verified: fixed, bypass, authenticated, PAC recovery, DNS recovery')
} finally {
  let phase = 'network sessions'
  let deadline
  try {
    await Promise.race([
      (async () => {
        console.log(`Closing proxy fixture ${phase}`)
        if (electronApp) {
          await electronApp.evaluate(async ({ session }) => {
            await Promise.all(['routing', 'bypass', 'auth', 'pac', 'dns'].map(kind =>
              session.fromPartition(`dsh-proxy-${kind}-e2e`, { cache: false }).closeAllConnections()))
          })
          phase = 'Electron application'
          console.log(`Closing proxy fixture ${phase}`)
          await electronApp.close()
        }
        phase = 'HTTP servers'
        console.log(`Closing proxy fixture ${phase}`)
        await Promise.all([close(target), close(proxy), close(authProxy), close(pac)])
        phase = 'temporary data'
        await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
        console.log('Proxy fixture exited and cleaned up')
      })(),
      new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error(
        `proxy fixture teardown exceeded 30s at ${phase}; fixture retained at ${temporary}`,
      )), 30_000) }),
    ])
  } finally { clearTimeout(deadline) }
}
