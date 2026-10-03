import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { ensureDesktopProfile, resolveDshCliPath, resolveRuntimePackages } from '../src/profile.mjs'
import { DESKTOP_PIPE_RUNTIME_URL, DshRuntimeController } from '../src/runtime-controller.mjs'

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
  controller = new DshRuntimeController({
    cliPath: resolveDshCliPath(),
    cwd: repositoryRoot,
    dshHome,
    executable: process.execPath,
    transport: 'pipe',
    patchFiles: [overlay],
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

  const eventsAbort = new AbortController()
  const eventsTimeout = setTimeout(() => eventsAbort.abort(new Error('Events readiness probe timed out')), 15_000)
  const events = controller.openDuplex('$events', { args: {} }, eventsAbort.signal)
  const eventsIterator = events[Symbol.asyncIterator]()
  try {
    if (typeof events.close === 'function') await events.close()
    const ready = await eventsIterator.next()
    assert.equal(ready.done, false)
    assert.equal(ready.value.type, 'ready')
    assert.equal(typeof ready.value.clientId, 'string')
    assert.equal(ready.value.host.home, homedir())
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
  }))
} catch (error) {
  console.error(`Runtime pipe diagnostics:\n${diagnostics.slice(-120).join('\n') || '(empty)'}`)
  throw error
} finally {
  await controller?.stop().catch(() => {})
  if (process.env.DSH_DESKTOP_KEEP_TEST_HOME === '1') console.error(`retained runtime pipe fixture: ${root}`)
  else await rm(root, { recursive: true, force: true })
}
