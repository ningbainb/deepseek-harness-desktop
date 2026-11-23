import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { ensureDesktopProfile, resolveDshCliPath, resolveRuntimePackages } from '../src/profile.mjs'
import { DESKTOP_PIPE_RUNTIME_URL, DshRuntimeController } from '../src/runtime-controller.mjs'
import { createCodexGrantFixture, createModelPreferencesFixture } from './model-catalog-fixture.mjs'

const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-pipe-'))
const dshHome = join(root, 'community-home')
const repositoryRoot = resolve(import.meta.dirname, '..', '..', '..')
const overlay = resolve(import.meta.dirname, '..', 'runtime-support', 'desktop-pipe.patch.yml')
const diagnostics = []
let controller

function websocketServerFrames(bytes) {
  const split = bytes.indexOf('\r\n\r\n')
  if (split === -1) return undefined
  assert.match(bytes.subarray(0, split).toString('latin1'), /^HTTP\/1\.1 101/u)
  const frames = []
  let offset = split + 4
  while (offset + 2 <= bytes.length) {
    const first = bytes[offset]
    let length = bytes[offset + 1] & 0x7f
    let header = 2
    if (length === 126) {
      if (offset + 4 > bytes.length) break
      length = bytes.readUInt16BE(offset + 2)
      header = 4
    } else if (length === 127) {
      if (offset + 10 > bytes.length) break
      const wide = bytes.readBigUInt64BE(offset + 2)
      assert.ok(wide <= BigInt(Number.MAX_SAFE_INTEGER))
      length = Number(wide)
      header = 10
    }
    if (offset + header + length > bytes.length) break
    frames.push({ opcode: first & 0x0f, payload: bytes.subarray(offset + header, offset + header + length) })
    offset += header + length
  }
  return frames
}

function websocketClientFrame(opcode, payload) {
  assert.ok(payload.length < 126)
  const mask = Buffer.alloc(4)
  crypto.getRandomValues(mask)
  const frame = Buffer.alloc(6 + payload.length)
  frame[0] = 0x80 | opcode
  frame[1] = 0x80 | payload.length
  mask.copy(frame, 2)
  for (let index = 0; index < payload.length; index += 1) frame[6 + index] = payload[index] ^ mask[index % 4]
  return frame
}

try {
  await ensureDesktopProfile({ dshHome, packageRoots: resolveRuntimePackages() })
  const modelFixture = createModelPreferencesFixture()
  await writeFile(join(dshHome, 'settings.yaml'), JSON.stringify(modelFixture.settings))
  // These optional routes are asserted below. The production clean profile
  // intentionally starts with the statistics and pet plugins disabled.
  const routeFixture = join(root, 'optional-routes.patch.yml')
  await writeFile(routeFixture, '- id: live-stats\n  disabled: false\n- id: pet\n  disabled: false\n')
  controller = new DshRuntimeController({
    cliPath: resolveDshCliPath(),
    cwd: repositoryRoot,
    dshHome,
    executable: process.execPath,
    transport: 'pipe',
    patchFiles: [overlay, routeFixture],
    environmentProvider: () => modelFixture.environment,
    startupTimeoutMs: 180_000,
    shutdownTimeoutMs: 15_000,
    logStore: { append: async (line) => diagnostics.push(String(line)) },
  })
  assert.equal(await controller.start(), DESKTOP_PIPE_RUNTIME_URL)
  const index = await controller.fetch('http://dsh.internal/')
  assert.equal(index.status, 200)
  const html = await index.text()
  assert.match(html, /__DSH_TRANSPORT__/u)
  assert.match(html, /__DSH_BOOT__/u)

  const approvalUrl = 'http://dsh.internal/api/dsh-agent-inbox/pending'
  const inboxResponse = await controller.fetch(approvalUrl, { headers: { 'x-dsh-agent-inbox': '1' } })
  assert.equal(inboxResponse.status, 200)
  assert.deepEqual(await inboxResponse.json(), [])
  assert.equal((await controller.fetch(approvalUrl)).status, 403)

  const eventsAbort = new AbortController()
  const eventsTimeout = setTimeout(() => eventsAbort.abort(new Error('Events readiness probe timed out')), 15_000)
  const events = controller.openDuplex('$events', { args: {} }, eventsAbort.signal)
  const eventsIterator = events[Symbol.asyncIterator]()
  async function readModelCatalog() {
    const rpcId = crypto.randomUUID()
    const response = await controller.fetch('http://dsh.internal/api/session/modelCatalog', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId, method: 'session/modelCatalog', payload: { args: {} } }),
    })
    assert.equal(response.status, 200)
    const envelope = await response.json()
    assert.equal(envelope.rpcId, rpcId)
    assert.equal(envelope.result.ok, true, JSON.stringify(envelope.result.error))
    return envelope.result.value
  }
  async function expectCodexGrantChange() {
    for (;;) {
      const event = await eventsIterator.next()
      assert.equal(event.done, false, 'the native credential change must reach the client')
      if (event.value.type === 'emit' && event.value.event === 'credentials/record-updated'
        && event.value.args[0] === 'llm-pi-ai/openai-codex') return
    }
  }
  try {
    if (typeof events.close === 'function') await events.close()
    const ready = await eventsIterator.next()
    assert.equal(ready.done, false)
    assert.equal(ready.value.type, 'ready')
    assert.equal(typeof ready.value.clientId, 'string')
    assert.equal(ready.value.host.home, homedir())
    const signedOut = await readModelCatalog()
    assert.equal(signedOut.groups.some(group => group.id === 'openai-codex'), false)
    assert.equal(signedOut.routableProviders.includes('openai-codex'), false)
    assert.equal(signedOut.groups.some(group => group.id === 'project-relay'), true)
    await writeFile(join(dshHome, '.credentials.yaml'), JSON.stringify(createCodexGrantFixture()), { mode: 0o600 })
    await expectCodexGrantChange()
    const signedIn = await readModelCatalog()
    assert.ok(signedIn.groups.find(group => group.id === 'openai-codex')?.models.length)
    assert.equal(signedIn.routableProviders.includes('openai-codex'), true)
    const logout = await controller.fetch('http://dsh.internal/api/dsh-chatgpt-auth/logout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    assert.equal(logout.status, 200)
    const logoutResult = await logout.json()
    assert.equal(logoutResult.ok, true)
    assert.equal(logoutResult.value.configured, false)
    await expectCodexGrantChange()
    assert.deepEqual(await readModelCatalog(), signedOut, 'logout restores only the original signed-out catalog')
  } finally {
    clearTimeout(eventsTimeout)
    eventsAbort.abort(new Error('Events readiness probe complete'))
    await eventsIterator.return()
  }

  const rpcId = crypto.randomUUID()
  const inventory = await controller.fetch('http://dsh.internal/api/pluginInventory/list', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId,
      method: 'pluginInventory/list',
      payload: { args: {} },
    }),
  })
  assert.equal(inventory.status, 200)
  const envelope = await inventory.json()
  assert.equal(envelope.type, 'server-response')
  assert.equal(envelope.rpcId, rpcId)
  assert.equal(envelope.result.ok, true)
  const plugins = Array.isArray(envelope.result.value)
    ? envelope.result.value
    : envelope.result.value?.entries
  assert.equal(Array.isArray(plugins), true, JSON.stringify(envelope.result.value))
  assert.equal(plugins.length > 0, true, JSON.stringify(envelope.result.value))

  const stats = await controller.fetch('http://dsh.internal/api/live-stats/stats')
  assert.equal(stats.status, 200)
  assert.equal((await stats.json()).ok, true)
  const petAsset = await controller.fetch('http://dsh.internal/pet/whale/pet.json', { method: 'HEAD' })
  assert.equal(petAsset.status, 200)
  assert.match(petAsset.headers.get('content-type') ?? '', /application\/json/u)

  const websocketAbort = new AbortController()
  const websocketTimeout = setTimeout(() => websocketAbort.abort(new Error('WebSocket probe timed out')), 15_000)
  const websocket = controller.openDuplex('websocket', {
    url: `/api/dsh-ssh/terminal?alias=missing-${crypto.randomUUID()}`,
    protocols: [],
  }, websocketAbort.signal)
  const websocketChunks = []
  let closeReplied = false
  try {
    for await (const value of websocket) {
      websocketChunks.push(Buffer.from(value, 'base64'))
      const frames = websocketServerFrames(Buffer.concat(websocketChunks))
      const close = frames?.find(frame => frame.opcode === 8)
      if (close !== undefined && !closeReplied) {
        closeReplied = true
        await websocket.write(websocketClientFrame(8, close.payload).toString('base64'))
      }
    }
  } finally {
    clearTimeout(websocketTimeout)
    websocketAbort.abort(new Error('WebSocket probe complete'))
  }
  const websocketFrames = websocketServerFrames(Buffer.concat(websocketChunks))
  assert.ok(websocketFrames !== undefined)
  assert.equal(websocketFrames.some(frame => frame.opcode === 1 && JSON.parse(frame.payload.toString('utf8')).type === 'exit'), true)
  assert.equal(closeReplied, true)
  assert.equal(diagnostics.some((line) => /dsh web:\s+http:/u.test(line)), false)
  assert.equal(diagnostics.some((line) => line.includes('dsh desktop pipe: ready')), true)

  console.log(JSON.stringify({
    transport: 'pipe',
    runtimeUrl: DESKTOP_PIPE_RUNTIME_URL,
    pluginCount: plugins.length,
    communityRoutes: ['live-stats', 'pet-asset', 'ssh-websocket'],
    httpReadyLineObserved: false,
    officialEventsReady: true,
    codexCatalogFollowsLocalGrant: true,
  }))
} catch (error) {
  console.error(`Runtime pipe diagnostics:\n${diagnostics.slice(-120).join('\n') || '(empty)'}`)
  throw error
} finally {
  await controller?.stop().catch(() => {})
  if (process.env.DSH_DESKTOP_KEEP_TEST_HOME === '1') console.error(`retained runtime pipe fixture: ${root}`)
  else await rm(root, { recursive: true, force: true })
}
