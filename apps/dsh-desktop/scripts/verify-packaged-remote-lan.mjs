import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { _electron as electron } from 'playwright'

import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'

const appDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const appPath = resolve(process.env.DSH_DESKTOP_E2E_EXECUTABLE
  ?? join(appDir, 'dist', 'win-unpacked', 'DeepSeek Harness Desktop.exe'))
// The default path is the physical same-LAN acceptance run. The loopback
// mode exercises the exact packaged remote authorization surface when the
// official DSH runtime rejects all-interface binding; it never changes the
// production Host configuration or bypasses that guard.
const loopbackMode = process.argv.includes('--loopback')
const runtimeHost = loopbackMode ? '127.0.0.1' : '0.0.0.0'
const temporary = await mkdtemp(join(tmpdir(), 'dsh-packaged-remote-lan-'))
const userData = join(temporary, 'user-data')
const dshHome = join(temporary, 'dsh-home')
const workspaceAPath = join(temporary, 'workspace-a')
const workspaceBPath = join(temporary, 'workspace-b')
let app

async function dismissStartup(page) {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    await page.waitForTimeout(250)
    const starPrompt = page.locator('#dsh-desktop-star-prompt')
    if (await starPrompt.getAttribute('data-open').catch(() => null) === 'true') {
      await starPrompt.getByRole('button', { name: '先继续使用', exact: true }).click({ force: true })
      continue
    }
    const dialogs = page.getByRole('dialog')
    const count = await dialogs.count().catch(() => 0)
    let clicked = false
    for (let position = count - 1; position >= 0; position -= 1) {
      const dialog = dialogs.nth(position)
      if (!await dialog.isVisible().catch(() => false)) continue
      const text = await dialog.textContent().catch(() => '')
      if (!/内测声明|插件、技能和桌面核心功能在这里/u.test(text || '')) continue
      const button = dialog.getByRole('button', { name: /^(继续|Continue)$/u }).last()
      if (await button.count().catch(() => 0) > 0) {
        await button.click({ force: true })
        clicked = true
        break
      }
    }
    if (clicked) continue
    if (attempt >= 7) break
  }
}

async function launch() {
  await seedPrimaryRuntimePermissionForTest({ userData })
  const instance = await electron.launch({
    executablePath: appPath,
    args: ['--force-renderer-accessibility'],
    cwd: appDir,
    env: {
      ...process.env,
      DSH_DESKTOP_USER_DATA: userData,
      DSH_DESKTOP_DISABLE_UPDATES: '1',
      DSH_DESKTOP_VERIFY_UPDATER: '0',
      DSH_DESKTOP_REMOTE_HOST: runtimeHost,
      DSH_HOME: dshHome,
      DSH_AGENTS_HOME: join(userData, 'agents'),
    },
  })
  // Retain the handle before any readiness assertion so a failed startup
  // still reaches the cleanup path below.
  app = instance
  const electronProcess = instance.process()
  electronProcess.stdout?.on('data', chunk => process.stderr.write(String(chunk)))
  electronProcess.stderr?.on('data', chunk => process.stderr.write(String(chunk)))
  const page = await instance.firstWindow()
  const errors = []
  page.on('pageerror', error => errors.push(`pageerror:${error.message}`))
  page.on('console', message => {
    if (message.type() !== 'error') return
    if (/style-src 'self'/u.test(message.text())) return
    errors.push(`console:${message.text()}`)
  })
  try {
    await page.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { timeout: 120_000 })
  } catch (error) {
    const diagnostic = await page.evaluate(async () => ({
      url: location.href,
      title: document.querySelector('#status-title')?.textContent ?? '',
      detail: document.querySelector('#status-detail')?.textContent ?? '',
      status: await window.dshDesktop?.getStatus?.().catch?.(() => undefined),
      repair: await window.dshDesktop?.getRepairStatus?.().catch?.(() => undefined),
    })).catch(() => undefined)
    console.error(`packaged startup diagnostic: ${JSON.stringify(diagnostic)}`)
    throw error
  }
  await page.waitForSelector('#dsh-desktop-window-chrome', { timeout: 120_000 })
  await dismissStartup(page)
  return { instance, page, errors }
}

async function requestJson(url, options = {}) {
  const headers = { ...(options.cookie ? { cookie: options.cookie } : {}) }
  let body
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(options.body)
  }
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    ...(body === undefined ? {} : { body }),
  })
  const text = await response.text()
  let data
  try { data = JSON.parse(text) } catch { data = undefined }
  return { response, status: response.status, data, text }
}

async function rpc(origin, method, payload, { mobile = false, cookie } = {}) {
  const prefix = mobile ? '/m/api' : '/api'
  return requestJson(`${origin}${prefix}/${method}`, {
    method: 'POST',
    cookie,
    body: {
      type: 'client-request',
      rpcId: randomUUID(),
      method,
      payload,
    },
  })
}

function rpcValue(result, label) {
  assert.equal(result.status, 200, `${label}: HTTP ${result.status} ${result.text.slice(0, 240)}`)
  assert.equal(result.data?.type, 'server-response', `${label}: missing server response envelope`)
  assert.equal(result.data?.result?.ok, true, `${label}: RPC was denied or failed`)
  return result.data.result.value
}

function cookieFromAccept(result) {
  const setCookie = result.response.headers.get('set-cookie') ?? ''
  const match = /(?:^|,\s*)dsh_pair=([^;]+)/u.exec(setCookie)
  assert.ok(match, 'pair accept did not set a device cookie')
  return `dsh_pair=${match[1]}`
}

async function waitForSearch(origin, cookie, query, sessionId) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await rpc(origin, 'session.search', { query }, { mobile: true, cookie })
    if (result.status === 200
      && result.data?.result?.ok === false
      && result.data.result.error?.code === 'forbidden') return 'safely-disabled'
    if (result.status === 200 && result.data?.result?.ok === true) {
      const items = result.data.result.value?.items ?? []
      if (items.some(item => item.sessionId === sessionId)) return 'found'
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 250))
  }
  return 'not-found'
}

/** Read one packaged SSE stream until the server closes it, with a bound. */
async function readSseUntilClose(response, timeoutMs = 5_000) {
  const reader = response.body?.getReader()
  assert.ok(reader, 'packaged SSE response did not expose a readable body')
  const decoder = new TextDecoder()
  let data = ''
  try {
    for (;;) {
      const chunk = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('packaged SSE did not close within the timeout')), timeoutMs)
        reader.read().then(value => {
          clearTimeout(timer)
          resolve(value)
        }, error => {
          clearTimeout(timer)
          reject(error)
        })
      })
      if (chunk.done) return data + decoder.decode()
      data += decoder.decode(chunk.value, { stream: true })
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
}

try {
  await mkdir(workspaceAPath, { recursive: true })
  await mkdir(workspaceBPath, { recursive: true })

  const launched = await launch()
  app = launched.instance
  const loopbackOrigin = new URL(await launched.page.url()).origin
  const port = new URL(loopbackOrigin).port

  // Pairing deliberately refuses to mint a dead loopback-only QR by default.
  // For the packaged authorization run, configure the documented manual
  // publicBaseUrl seam to a secure, non-routable origin in the isolated test
  // profile. The current security contract rejects cleartext public origins;
  // the URL is used only to satisfy QR construction while all test traffic
  // stays on the real packaged loopback /m/api and SSE handlers.
  if (loopbackMode) {
    const described = await requestJson(`${loopbackOrigin}/api/dsh-web-ui-settings/describe`, {
      method: 'POST',
      body: {},
    })
    assert.equal(described.status, 200, `settings bridge unavailable: ${described.text.slice(0, 240)}`)
    const remoteNamespace = described.data?.value?.namespaces?.find(entry => entry.ns === 'remote-web-ui')
    assert.ok(remoteNamespace, 'remote-web-ui settings namespace was not exposed')
    const configured = await requestJson(`${loopbackOrigin}/api/dsh-web-ui-settings/mutate`, {
      method: 'POST',
      body: {
        ns: 'remote-web-ui',
        ops: [{ op: 'set', path: ['publicBaseUrl'], value: 'https://packaged-loopback.invalid' }],
        expectedRevision: remoteNamespace.revision,
      },
    })
    assert.equal(configured.status, 200, `loopback publicBaseUrl mutation failed: ${configured.text.slice(0, 240)}`)
    assert.equal(configured.data?.ok, true, 'loopback publicBaseUrl was rejected')
    await new Promise(resolveDelay => setTimeout(resolveDelay, 100))
  }

  // The first issue call is intentionally only a LAN capability probe. The
  // token is replaced immediately before each real A/B pairing below.
  const probeIssue = await requestJson(`${loopbackOrigin}/api/pair/issue`, { method: 'POST', body: {} })
  assert.equal(probeIssue.status, 200, `LAN bind was not active: ${probeIssue.text.slice(0, 240)}`)
  const lanAddresses = Array.isArray(probeIssue.data?.lanAddresses)
    ? probeIssue.data.lanAddresses
    : []

  let lanAddress = '127.0.0.1'
  if (!loopbackMode) {
    assert.ok(lanAddresses.length > 0, 'no LAN address was advertised')
    lanAddress = undefined
    for (const candidate of lanAddresses) {
      const candidateOrigin = `http://${candidate}:${port}`
      const status = await requestJson(`${candidateOrigin}/api/pair/status`).catch(() => undefined)
      if (status?.status === 200) {
        lanAddress = candidate
        break
      }
    }
    assert.ok(lanAddress, `advertised LAN addresses were not reachable: ${JSON.stringify(lanAddresses)}`)
  }
  const lanOrigin = loopbackMode ? loopbackOrigin : `http://${lanAddress}:${port}`

  const workspaceA = rpcValue(await rpc(loopbackOrigin, 'workspace.create', { path: workspaceAPath }), 'workspace A create')
  const workspaceB = rpcValue(await rpc(loopbackOrigin, 'workspace.create', { path: workspaceBPath }), 'workspace B create')
  const workspaceAId = workspaceA.workspace.workspaceId
  const workspaceBId = workspaceB.workspace.workspaceId
  assert.notEqual(workspaceAId, workspaceBId)

  async function pair(workspaceId) {
    const issued = await requestJson(`${loopbackOrigin}/api/pair/issue`, {
      method: 'POST',
      body: {
        workspaceId,
        ...(loopbackMode ? {} : { address: lanAddress }),
      },
    })
    assert.equal(issued.status, 200, 'pair issue failed')
    assert.equal(typeof issued.data?.token, 'string')
    const accepted = await requestJson(`${lanOrigin}/api/pair/accept`, {
      method: 'POST',
      body: { token: issued.data.token },
    })
    assert.equal(accepted.status, 200, `pair accept failed: ${accepted.text.slice(0, 240)}`)
    return { cookie: cookieFromAccept(accepted), deviceId: accepted.data.deviceId }
  }

  const deviceA = await pair(workspaceAId)
  const deviceB = await pair(workspaceBId)
  assert.notEqual(deviceA.cookie, deviceB.cookie)

  const workspacesA = rpcValue(await rpc(lanOrigin, 'workspace.list', {}, { mobile: true, cookie: deviceA.cookie }), 'A workspace list')
  const workspacesB = rpcValue(await rpc(lanOrigin, 'workspace.list', {}, { mobile: true, cookie: deviceB.cookie }), 'B workspace list')
  assert.deepEqual(workspacesA.items.map(item => item.workspaceId), [workspaceAId])
  assert.deepEqual(workspacesB.items.map(item => item.workspaceId), [workspaceBId])

  const crossCreate = await rpc(lanOrigin, 'session.create', { workspaceId: workspaceBId }, { mobile: true, cookie: deviceA.cookie })
  assert.equal(crossCreate.status, 200)
  assert.equal(crossCreate.data?.result?.ok, false, 'A could create a session in B workspace')

  const sessionA = rpcValue(await rpc(lanOrigin, 'session.create', { workspaceId: workspaceAId }, { mobile: true, cookie: deviceA.cookie }), 'A session create').sessionId
  const sessionB = rpcValue(await rpc(lanOrigin, 'session.create', { workspaceId: workspaceBId }, { mobile: true, cookie: deviceB.cookie }), 'B session create').sessionId
  assert.notEqual(sessionA, sessionB)

  rpcValue(await rpc(lanOrigin, 'session.rename', { sessionId: sessionA, title: 'LAN-A-unique' }, { mobile: true, cookie: deviceA.cookie }), 'A rename')
  rpcValue(await rpc(lanOrigin, 'session.rename', { sessionId: sessionB, title: 'LAN-B-unique' }, { mobile: true, cookie: deviceB.cookie }), 'B rename')
  rpcValue(await rpc(lanOrigin, 'session.history', { sessionId: sessionA }, { mobile: true, cookie: deviceA.cookie }), 'A history')
  const crossHistory = await rpc(lanOrigin, 'session.history', { sessionId: sessionA }, { mobile: true, cookie: deviceB.cookie })
  assert.equal(crossHistory.status, 200)
  assert.equal(crossHistory.data?.result?.ok, false, 'B could read A history')

  const sessionListA = rpcValue(await rpc(lanOrigin, 'session.list', {}, { mobile: true, cookie: deviceA.cookie }), 'A session list')
  const sessionListB = rpcValue(await rpc(lanOrigin, 'session.list', {}, { mobile: true, cookie: deviceB.cookie }), 'B session list')
  assert.deepEqual(sessionListA.items.map(item => item.sessionId), [sessionA])
  assert.deepEqual(sessionListB.items.map(item => item.sessionId), [sessionB])

  // The Host search contract indexes message events, not session titles. Add
  // a harmless unique user message so this check proves scoped search rather
  // than accidentally relying on rename metadata. If the optional index is
  // unavailable or unhealthy, the remote route must fail closed instead.
  const searchMarker = `packaged-remote-search-${randomUUID()}`
  const markerSend = rpcValue(await rpc(lanOrigin, 'session.prompt', {
    sessionId: sessionA,
    mode: 'queue',
    content: [{ type: 'text', text: searchMarker }],
  }, { mobile: true, cookie: deviceA.cookie }), 'A search marker send')
  assert.equal(markerSend.accepted, true)
  const searchResult = await waitForSearch(lanOrigin, deviceA.cookie, searchMarker, sessionA)
  let searchMode
  if (searchResult === 'safely-disabled') {
    searchMode = 'safely-disabled'
  } else {
    assert.equal(searchResult, 'found', 'A search did not return its own message session')
    const searchBForA = await rpc(lanOrigin, 'session.search', { query: searchMarker }, { mobile: true, cookie: deviceB.cookie })
    assert.equal(searchBForA.status, 200)
    assert.equal(searchBForA.data?.result?.ok, true)
    assert.equal((searchBForA.data.result.value.items ?? []).some(item => item.sessionId === sessionA), false, 'B search returned A session')
    searchMode = 'scoped'
  }

  const sendA = rpcValue(await rpc(lanOrigin, 'session.prompt', {
    sessionId: sessionA,
    mode: 'queue',
    content: [{ type: 'text', text: '/model' }],
  }, { mobile: true, cookie: deviceA.cookie }), 'A slash-command send')
  assert.equal(sendA.accepted, true)

  const modelsA = rpcValue(await rpc(lanOrigin, 'session.models', { sessionId: sessionA }, { mobile: true, cookie: deviceA.cookie }), 'A model read')
  assert.equal(typeof modelsA.current?.provider, 'string')
  assert.equal(typeof modelsA.current?.model, 'string')
  const selectedA = rpcValue(await rpc(lanOrigin, 'session.selectModel', {
    sessionId: sessionA,
    provider: modelsA.current.provider,
    model: modelsA.current.model,
    ...(modelsA.current.reasoningEffort === undefined ? {} : { reasoningEffort: modelsA.current.reasoningEffort }),
  }, { mobile: true, cookie: deviceA.cookie }), 'A model select')
  assert.equal(selectedA.selected.provider, modelsA.current.provider)
  assert.equal(selectedA.selected.model, modelsA.current.model)

  const eventsResponse = await fetch(`${lanOrigin}/m/api/events.mux`, {
    headers: { cookie: deviceA.cookie },
  })
  assert.equal(eventsResponse.status, 200, `A SSE open failed: HTTP ${eventsResponse.status}`)
  assert.match(eventsResponse.headers.get('content-type') ?? '', /text\/event-stream/u)
  const sseClosed = readSseUntilClose(eventsResponse)
  await new Promise(resolveDelay => setTimeout(resolveDelay, 100))

  const revokeStartedAt = performance.now()
  const revoked = await requestJson(`${loopbackOrigin}/api/pair/device/revoke`, {
    method: 'POST',
    body: { deviceId: deviceA.deviceId },
  })
  assert.equal(revoked.status, 200, 'device A revoke failed')
  const sseData = await sseClosed
  const sseCloseMs = Math.round(performance.now() - revokeStartedAt)
  assert.ok(sseCloseMs <= 2_000, `device A SSE closed too slowly after revoke: ${String(sseCloseMs)}ms`)
  assert.equal(sseData.includes(sessionB), false, 'A SSE received a B session identity')
  const afterRevokeA = await rpc(lanOrigin, 'mobile.preferences', {}, { mobile: true, cookie: deviceA.cookie })
  const afterRevokeB = await rpc(lanOrigin, 'mobile.preferences', {}, { mobile: true, cookie: deviceB.cookie })
  assert.equal(afterRevokeA.status, 403, 'revoked device A remained authorized')
  assert.equal(afterRevokeB.status, 200, 'device B was affected by A revoke')

  assert.deepEqual(launched.errors, [], JSON.stringify(launched.errors))
  console.log(JSON.stringify({
    bind: { host: runtimeHost, loopbackOrigin, lanAddress, lanReachable: true, physicalLan: !loopbackMode },
    pairing: { distinctDevices: true, workspaceScoped: true },
    isolation: { workspaceList: true, sessionList: true, historyDenied: true, search: searchMode, searchScoped: searchMode === 'scoped', crossWorkspaceCreateDenied: true },
    remoteOperations: { send: true, modelRead: true, modelSelect: true, rename: true },
    revoke: { deviceADeniedImmediately: true, deviceBStillAuthorized: true, sseClosedImmediately: true, sseCloseMs },
    pageErrorCount: launched.errors.length,
  }, null, 2))
} finally {
  if (app !== undefined) {
    let electronProcess
    try {
      electronProcess = app.process()
    } catch {
      electronProcess = undefined
    }
    await app.close().catch(() => {})
    if (electronProcess !== undefined && electronProcess.exitCode === null) electronProcess.kill()
  }
  if (process.env.DSH_KEEP_TEMP === '1') {
    console.error(`temporary retained: ${temporary}`)
  } else {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        await rm(temporary, { recursive: true, force: true })
        break
      } catch (error) {
        if (attempt === 9) {
          console.error(`temporary cleanup deferred: ${error instanceof Error ? error.code ?? error.message : String(error)}`)
          break
        }
        await new Promise(resolveDelay => setTimeout(resolveDelay, 500))
      }
    }
  }
}
