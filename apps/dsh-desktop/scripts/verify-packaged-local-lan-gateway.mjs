import assert from 'node:assert/strict'
import { waitForAsyncPageFunction } from './async-page-predicate.mjs'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { networkInterfaces, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { _electron as electron } from 'playwright'

import { isPrivateLanIpv4 } from '../src/local-lan-gateway.mjs'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'

const appDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const appPath = resolve(process.env.DSH_DESKTOP_E2E_EXECUTABLE
  ?? join(appDir, 'dist', 'win-unpacked', 'DeepSeek Harness Desktop.exe'))
const temporary = await mkdtemp(join(tmpdir(), 'dsh-packaged-local-lan-gateway-'))
const userData = join(temporary, 'user-data')
const dshHome = join(temporary, 'dsh-home')
let app

function privateAddresses() {
  return [...new Set(Object.values(networkInterfaces()).flat()
    .filter(row => row?.family === 'IPv4' && !row.internal && isPrivateLanIpv4(row.address))
    .map(row => row.address))]
}

async function reservePort(address) {
  const server = createServer()
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen({ host: address, port: 0, exclusive: true }, resolveListen)
  })
  const bound = server.address()
  assert.ok(bound && typeof bound === 'object')
  await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()))
  return bound.port
}

async function request(url, options = {}) {
  const headers = {
    ...(options.cookie === undefined ? {} : { cookie: options.cookie }),
    ...(options.origin === undefined ? {} : { origin: options.origin }),
  }
  const body = options.body === undefined ? undefined : JSON.stringify(options.body)
  if (body !== undefined) headers['content-type'] = 'application/json'
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    signal: options.signal ?? AbortSignal.timeout(15_000),
    ...(body === undefined ? {} : { body }),
  })
  const text = await response.text()
  let data
  try { data = JSON.parse(text) } catch { data = undefined }
  return { response, status: response.status, text, data }
}

const addresses = privateAddresses()
assert.ok(addresses.length > 0, 'packaged LAN gateway acceptance requires one active private IPv4 interface')
const address = addresses[0]
const port = await reservePort(address)
const origin = `http://${address}:${String(port)}`

try {
  await mkdir(userData, { recursive: true })
  await writeFile(join(userData, 'lan-gateway-state.json'), `${JSON.stringify({
    schemaVersion: 1,
    enabled: true,
    address,
    port,
  }, null, 2)}\n`, 'utf8')
  await seedPrimaryRuntimePermissionForTest({ userData })

  const environment = {
    ...process.env,
    DSH_DESKTOP_USER_DATA: userData,
    DSH_DESKTOP_DISABLE_UPDATES: '1',
    DSH_DESKTOP_VERIFY_UPDATER: '0',
    DSH_HOME: dshHome,
    DSH_AGENTS_HOME: join(userData, 'agents'),
    DEEPSEEK_API_KEY: 'desktop-e2e-invalid-placeholder',
  }
  delete environment.DSH_DESKTOP_REMOTE_HOST
  delete environment.DSH_DESKTOP_REMOTE_PORT

  app = await electron.launch({ executablePath: appPath, cwd: appDir, env: environment })
  const page = await app.firstWindow()
  await page.waitForURL(/^dsh-runtime:\/\/app\//u, { timeout: 120_000 })
  await waitForAsyncPageFunction(page, async () => {
    const status = await window.dshDesktop?.getLanGatewayStatus?.()
    return status?.state === 'running'
  }, undefined, { timeout: 120_000 })

  const status = await page.evaluate(() => window.dshDesktop.getLanGatewayStatus())
  assert.equal(status.address, address)
  assert.equal(status.port, port)
  assert.equal(status.url, origin)
  assert.equal(status.availableAddresses.includes(address), true)

  const issued = await page.evaluate(async () => {
    const response = await fetch('/api/pair/issue', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    return { status: response.status, body: await response.json() }
  })
  assert.equal(issued.status, 200)
  assert.equal(issued.body.url.startsWith(`${origin}/m?pair=`), true)
  assert.equal(issued.body.lanAddresses.includes(address), true)

  const mobilePage = await request(issued.body.url)
  assert.equal(mobilePage.status, 200)
  assert.match(mobilePage.text, /<div id="root"><\/div>/u)
  const bundle = await request(`${origin}/m/mobile.js`)
  assert.equal(bundle.status, 200)
  assert.ok(bundle.text.length > 1_000)

  const accepted = await request(`${origin}/api/pair/accept`, {
    method: 'POST',
    origin,
    body: { token: issued.body.token },
  })
  assert.equal(accepted.status, 200, accepted.text)
  const setCookie = accepted.response.headers.get('set-cookie') ?? ''
  const cookie = /(?:^|,\s*)dsh_pair=([^;]+)/u.exec(setCookie)
  assert.ok(cookie, 'gateway pair accept did not return the paired-device cookie')
  assert.equal(cookie[1], accepted.data?.deviceId, 'gateway cookie must carry the accepted device id')

  const localPairing = await page.evaluate(async () => {
    const response = await fetch('/api/pair/devices')
    return { status: response.status, data: await response.json() }
  })
  assert.equal(localPairing.status, 200)
  assert.equal(localPairing.data.devices.some(device => device.deviceId === accepted.data.deviceId), true)

  const heartbeat = await request(`${origin}/api/pair/heartbeat`, {
    method: 'POST',
    origin,
    cookie: `dsh_pair=${accepted.data.deviceId}`,
    body: {},
  })
  assert.equal(heartbeat.status, 200, heartbeat.text)

  const preferences = await request(`${origin}/m/api/mobile.preferences`, {
    method: 'POST',
    origin,
    cookie: `dsh_pair=${accepted.data.deviceId}`,
    body: {
      type: 'client-request',
      rpcId: 'packaged-local-lan-gateway',
      method: 'mobile.preferences',
      payload: {},
    },
  })
  assert.equal(preferences.status, 200, preferences.text)
  assert.equal(preferences.data?.result?.ok, true)

  assert.equal((await request(`${origin}/api/session/list`, { method: 'POST' })).status, 404)
  assert.equal((await request(`${origin}/api/pair/status`)).status, 404)
  assert.equal((await request(`${origin}/m`, { origin: 'http://evil.invalid' })).status, 403)

  const stopped = await page.evaluate(portValue => window.dshDesktop.configureLanGateway({ enabled: false, port: portValue }), port)
  assert.equal(stopped.state, 'stopped')
  assert.equal(stopped.enabled, false)
  await assert.rejects(fetch(`${origin}/m`, { signal: AbortSignal.timeout(3_000) }))

  console.log(JSON.stringify({
    runtimeTransport: 'authenticated-pipe',
    bind: { exactPrivateAddress: address, port, allInterfaces: false },
    mobileSurface: { page: true, bundle: true, pairAccept: true, pairedApi: true },
    denied: { fullApi: true, localAdminApi: true, foreignOrigin: true },
    lifecycle: { persistedOptIn: true, stoppedCleanly: true },
  }, null, 2))
} finally {
  if (app !== undefined) {
    let processHandle
    try { processHandle = app.process() } catch { processHandle = undefined }
    await app.close().catch(() => {})
    if (processHandle !== undefined && processHandle.exitCode === null) processHandle.kill()
  }
  if (process.env.DSH_KEEP_TEMP === '1') console.error(`temporary retained: ${temporary}`)
  else await rm(temporary, { recursive: true, force: true }).catch(() => {})
}
