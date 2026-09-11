import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib'
import { ensureDesktopProfile, resolveDshCliPath, resolveRuntimePackages } from '../src/profile.mjs'
import { DshRuntimeController } from '../src/runtime-controller.mjs'
import { rpcOutcome } from './history-performance-diagnostics.mjs'
import electronPath from 'electron'

// Private-input, local-only diagnostic. No browser, prompts, source edits, or
// raw response/log output. Numeric timings are not an end-to-end UI benchmark.
assert.ok(process.argv[2] && process.argv[3], 'provide explicit private input and a new report path')
const input = resolve(process.argv[2]), output = resolve(process.argv[3])
const attachmentsFirst = process.argv.includes('--attachments-first')
const electronHost = process.argv.includes('--electron-host')
const appDir = resolve(import.meta.dirname, '..')
const require = createRequire(await realpath(join(appDir, 'node_modules/@deepseek-ai/dsh-base/package.json')))
const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')))
const { default: Backend } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-session-persistence-jsonl')))
const { installSessionPersistenceRecovery } = await import('../node_modules/@linxin666/dsh-desktop-compat/lib/session-recovery.js')
const source = await readFile(input)
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const originalHash = hash(source)
const decoded = zstdDecompressSync(source, { info: true, maxOutputLength: 65536 })
const header = JSON.parse(decoded.buffer.toString('utf8'))
const consumed = decoded.engine.bytesWritten
assert.equal(header.version, 0)
assert.ok(consumed > 0 && consumed < source.length)
assert.equal(source.readUInt32LE(consumed), 0xfd2fb528)
const parent = await realpath(tmpdir())
const temporary = await realpath(await mkdtemp(join(parent, 'dsh-history-host-')))
const within = relative(parent, temporary)
assert.ok(within && !within.startsWith('..') && !isAbsolute(within))
const dshHome = join(temporary, 'dsh-home'), workspace = join(temporary, 'workspace')
const report = { complete: false, kind: electronHost ? 'isolated-headless-electron-node-http' : 'isolated-headless-runtime-http', attachmentsFirst, sourceBytes: source.length, pages: [], attachments: [] }
let controller, stage = 'seed', origin, cookie, throughSeq, legacy, copyHash
const imageIds = new Set()

function collectImageIds(events) {
  const pending = [...events]
  let visited = 0
  while (pending.length && imageIds.size < 8 && visited++ < 500_000) {
    const value = pending.pop()
    if (!value || typeof value !== 'object') continue
    if (typeof value.attachmentId === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value.attachmentId)) imageIds.add(value.attachmentId)
    for (const child of Object.values(value)) if (child && typeof child === 'object') pending.push(child)
  }
}

async function rpc(method, request) {
  const started = performance.now()
  const response = await fetch(`${origin}/api/${method.replace('.', '/')}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin, cookie }, signal: AbortSignal.timeout(120000),
    body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method: method.replace('.', '/'), payload: { args: { request } } }),
  })
  const headersAt = performance.now()
  const text = await response.text()
  const bodyAt = performance.now()
  let body
  try { body = JSON.parse(text) } catch {
    report.transportFailure = { httpStatus: response.status, bytes: Buffer.byteLength(text), json: false }
    throw new Error('RPC response is not JSON')
  }
  const timing = { httpStatus: response.status, ...rpcOutcome(body),
    headersMs: Math.round(headersAt - started), bodyMs: Math.round(bodyAt - headersAt),
    parseMs: Math.round(performance.now() - bodyAt), totalMs: Math.round(performance.now() - started), bytes: Buffer.byteLength(text) }
  return { timing, value: body?.result?.value }
}

async function readPage(beforeSeq) {
  const result = await rpc('session.page', { address: { kind: 'session', sessionId: header.id }, throughSeq, maxMessages: 200,
    ...(beforeSeq === undefined ? {} : { beforeSeq }) })
  assert.equal(result.timing.applicationOk, true, 'read-only page RPC failed')
  const records = result.value.records
  assert.ok(Array.isArray(records) && records.length > 0, 'history page must contain records')
  const first = records[0].event.seq, last = records.at(-1).event.seq
  assert.ok(Number.isSafeInteger(first) && first >= 0)
  assert.equal(last - first + 1, records.length, 'page event sequence must remain contiguous')
  return { ...result.timing, firstSeq: first, lastSeq: last, events: records.length, hasMore: result.value.hasMore }
}

try {
  await mkdir(workspace, { recursive: true })
  const ctx = new Context()
  let recovery
  const preparation = performance.now()
  try {
    await ctx.plugin(Backend, { root: join(dshHome, 'sessions'), compression: 'zstd' })
    const isolatedHeader = { ...header, cwd: workspace }
    legacy = join(dirname(ctx.sessionPersistence.locate(isolatedHeader).path), 'session.jsonl.zstd')
    await mkdir(dirname(legacy), { recursive: true })
    const copy = Buffer.concat([zstdCompressSync(Buffer.from(JSON.stringify(isolatedHeader) + '\n')), source.subarray(consumed)])
    copyHash = hash(copy)
    await writeFile(legacy, copy, { flag: 'wx' })
    recovery = installSessionPersistenceRecovery(ctx.sessionPersistence)
    const reader = await ctx.sessionPersistence.open(header.id, 'read', { signal: AbortSignal.timeout(120000) })
    try {
      const { events } = await reader.read()
      throughSeq = events.at(-1).seq
      report.events = events.length
      assert.equal(throughSeq + 1, events.length)
      collectImageIds(events)
    } finally { await reader.close() }
  } finally { recovery?.restore(); await ctx.fiber.dispose() }
  report.preparationMs = Math.round(performance.now() - preparation)
  report.imageReferenceSampleCount = imageIds.size
  stage = 'runtime'
  await ensureDesktopProfile({ dshHome, packageRoots: resolveRuntimePackages() })
  controller = new DshRuntimeController({ cliPath: resolveDshCliPath(), cwd: resolve(appDir, '../..'), dshHome,
    executable: electronHost ? electronPath : process.execPath, preferredPort: 0, startupTimeoutMs: 180000, shutdownTimeoutMs: 15000,
    environmentProvider: () => ({ DSH_AGENTS_HOME: join(temporary, 'agents') }) })
  const start = performance.now()
  const launchUrl = await controller.start()
  origin = new URL(launchUrl).origin
  report.runtimeStartMs = Math.round(performance.now() - start)
  stage = 'authenticate'
  // Follow the native launch-token exchange without logging credentials or
  // following a redirect without a cookie jar. Keep the authority in memory.
  const authenticated = await fetch(launchUrl, { redirect: 'manual', signal: AbortSignal.timeout(10000) })
  assert.equal(authenticated.status, 303, 'expected native launch-token exchange')
  assert.equal(authenticated.headers.get('location'), '/')
  cookie = authenticated.headers.getSetCookie().map(value => value.split(';', 1)[0]).join('; ')
  assert.ok(cookie, 'native session cookie required')
  await authenticated.body?.cancel()
  if (attachmentsFirst) {
    stage = 'cold-concurrent-attachments'
    const coldStart = performance.now()
    const cold = await Promise.all([
      readPage(),
      ...[...imageIds].map(async attachmentId => ({ mode: 'cold-concurrent',
        ...(await rpc('session.attachment', { sessionId: header.id, attachmentId })).timing })),
    ])
    report.coldConcurrentPage = cold[0]
    report.attachments.push(...cold.slice(1))
    report.coldConcurrentGroupMs = Math.round(performance.now() - coldStart)
  }
  stage = 'pages'
  const pagingStart = performance.now()
  let beforeSeq, eventCount = 0
  for (let page = 0; page < 64; page++) {
    const item = await readPage(beforeSeq)
    report.pages.push(item)
    eventCount += item.events
    if (!item.hasMore) break
    assert.ok(beforeSeq === undefined || item.firstSeq < beforeSeq, 'paging must advance toward the start')
    beforeSeq = item.firstSeq
  }
  assert.equal(report.pages.at(-1).firstSeq, 0)
  assert.equal(eventCount, throughSeq + 1)
  report.allPageMs = Math.round(performance.now() - pagingStart)
  console.log(JSON.stringify({ stage: 'headless-pages-complete', pages: report.pages.length, events: eventCount, totalMs: report.allPageMs }))
  const ids = [...imageIds]
  stage = 'attachments'
  for (const attachmentId of ids.slice(0, 4)) {
    const result = await rpc('session.attachment', { sessionId: header.id, attachmentId })
    report.attachments.push({ mode: 'serial', ...result.timing })
  }
  if (ids.length) {
    const concurrentStart = performance.now()
    const mixed = await Promise.all([
      readPage(),
      ...ids.slice(0, 4).map(async attachmentId => ({ mode: 'concurrent', ...(await rpc('session.attachment', { sessionId: header.id, attachmentId })).timing })),
    ])
    report.concurrentPage = mixed[0]
    report.attachments.push(...mixed.slice(1))
    report.concurrentGroupMs = Math.round(performance.now() - concurrentStart)
  }
  assert.equal(hash(await readFile(legacy + '.desktop-v0-permission-preset-backup-v3.4.0')), copyHash)
  report.backupPreserved = true
  report.complete = true
} catch (error) {
  report.failure = { stage, name: error?.name ?? 'Error' }
  process.exitCode = 1
} finally {
  await controller?.stop()
  assert.equal(hash(await readFile(input)), originalHash)
  report.originalPreserved = true
  await rm(temporary, { recursive: true, force: true })
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
  console.log(JSON.stringify(report))
}
