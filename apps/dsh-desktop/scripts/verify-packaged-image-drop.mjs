#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { randomFillSync, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { _electron as electron } from 'playwright'
import sharp from 'sharp'

import { createMemorySample, normalizeProcessSnapshot } from './packaged-memory-metrics.mjs'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'

const executeFile = promisify(execFile)
const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const appPath = resolve(process.env.DSH_DESKTOP_E2E_EXECUTABLE
  ?? join(appDir, 'dist', 'win-unpacked', 'DeepSeek Harness Desktop.exe'))
const operationCount = 20
const maxSourceBytes = 32 * 1024 * 1024
const retainedGrowthFloorBytes = 64 * 1024 * 1024
const runtimeReadyTimeoutMs = process.env.CI ? 240_000 : 180_000

if (process.platform !== 'win32') throw new Error('packaged image-drop verification currently requires Windows')
if (!existsSync(appPath)) throw new Error(`packaged executable does not exist: ${appPath}`)

const temporary = await mkdtemp(join(tmpdir(), 'dsh-packaged-image-drop-'))
const userData = join(temporary, 'user-data')
const dshHome = join(temporary, 'dsh-home')
const workspacePath = join(temporary, 'workspace')
const fixtureFiles = new Map()
let activeApplication

const wait = delayMs => new Promise(resolveWait => setTimeout(resolveWait, delayMs))
const median = (values) => {
  const sorted = [...values].toSorted((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

async function dismissStartup(page) {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    await page.waitForTimeout(250)
    const starPrompt = page.locator('#dsh-desktop-star-prompt')
    if (await starPrompt.getAttribute('data-open').catch(() => null) === 'true') {
      await starPrompt.getByRole('button', { name: '先继续使用', exact: true }).click({ force: true })
      continue
    }
    const continueButton = page.getByRole('button', { name: /^(?:继续|Continue)$/u })
    if (await page.getByRole('dialog').filter({ has: continueButton }).isVisible().catch(() => false)) {
      await continueButton.last().click({ force: true })
      continue
    }
    if (attempt >= 7) break
  }
}

async function rpc(page, method, payload) {
  const response = await page.evaluate(async ({ rpcMethod, rpcPayload, rpcId }) => {
    const result = await fetch(`/api/${rpcMethod}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId,
        method: rpcMethod,
        payload: rpcPayload,
      }),
    })
    return { status: result.status, body: await result.json().catch(() => undefined) }
  }, { rpcMethod: method, rpcPayload: payload, rpcId: randomUUID() })
  assert.equal(response.status, 200, `${method}: HTTP ${response.status}`)
  assert.equal(response.body?.type, 'server-response', `${method}: missing response envelope`)
  assert.equal(response.body?.result?.ok, true, `${method}: ${JSON.stringify(response.body?.result)}`)
  return response.body.result.value
}

async function openCreatedSession(page, sessionId) {
  const listed = await rpc(page, 'session.list', {})
  const summaries = Array.isArray(listed?.items) ? listed.items : []
  const summary = summaries.find(item => item?.id === sessionId || item?.sessionId === sessionId)
  assert.ok(summary, `created session is missing from session.list: ${JSON.stringify(listed)}`)

  const group = page.getByRole('treeitem').filter({ hasText: basename(workspacePath) }).first()
  await group.waitFor({ state: 'visible', timeout: 30_000 })
  if (await group.getAttribute('aria-expanded') !== 'true') await group.click({ force: true })
  await page.waitForTimeout(500)

  const expectedTitle = typeof summary.displayTitle === 'string' ? summary.displayTitle : summary.title
  let sessionRow = typeof expectedTitle === 'string' && expectedTitle !== ''
    ? page.getByRole('treeitem').filter({ hasText: expectedTitle }).first()
    : undefined
  if (sessionRow === undefined || !await sessionRow.isVisible().catch(() => false)) {
    sessionRow = page.locator('[role="treeitem"][aria-selected="false"]')
      .filter({ hasText: basename(workspacePath) })
      .first()
  }
  if (await sessionRow.isVisible().catch(() => false)) {
    await sessionRow.click({ force: true })
    return
  }

  // Blank Host-created sessions are intentionally omitted from history. Use
  // the real Desktop entry to create and activate the blank composer instead.
  const newSession = page.getByRole('button', { name: '新建会话', exact: true }).last()
  await newSession.waitFor({ state: 'visible', timeout: 30_000 })
  await newSession.click({ force: true })
}

async function fixturePayload() {
  const width = 2304
  const height = 2304
  let pixels = Buffer.allocUnsafe(width * height * 3)
  randomFillSync(pixels)
  const large = await sharp(pixels, {
    raw: { width, height, channels: 3 },
  }).jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer()
  pixels.fill(0)
  pixels = undefined
  assert.ok(large.byteLength > 3 * 1024 * 1024, `large fixture is not oversized: ${large.byteLength}`)
  assert.ok(large.byteLength <= maxSourceBytes, `large fixture exceeds source safety limit: ${large.byteLength}`)

  const small = await sharp({
    create: {
      width: 64,
      height: 64,
      channels: 4,
      background: { r: 42, g: 104, b: 220, alpha: 1 },
    },
  }).png().toBuffer()
  const corrupt = Buffer.alloc(2 * 1024 * 1024 + 64, 0x61)

  const fixtures = {
    large: { name: 'large.jpg', type: 'image/jpeg', bytes: large },
    small: { name: 'small.png', type: 'image/png', bytes: small },
    corrupt: { name: 'corrupt.png', type: 'image/png', bytes: corrupt },
  }
  const directory = join(temporary, 'image-fixtures')
  await mkdir(directory)
  for (const [key, fixture] of Object.entries(fixtures)) {
    const path = join(directory, fixture.name)
    await writeFile(path, fixture.bytes)
    fixtureFiles.set(key, path)
  }

  return {
    ...Object.fromEntries(Object.entries(fixtures).map(([key, fixture]) => [key, {
      name: fixture.name, type: fixture.type, size: fixture.bytes.length,
    }])),
    sizes: { large: large.byteLength, small: small.byteLength, corrupt: corrupt.byteLength },
    dimensions: { width, height },
  }
}

async function installBrowserHarness(page, payload) {
  await page.evaluate((encoded) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.hidden = true
    input.dataset.dshImageDropFixture = 'true'
    document.body.append(input)
    const originalCreate = URL.createObjectURL.bind(URL)
    const originalRevoke = URL.revokeObjectURL.bind(URL)
    const liveUrls = new Set()
    const harness = {
      fixtures: Object.fromEntries(Object.entries(encoded).filter(([key]) => key !== 'sizes' && key !== 'dimensions').map(([key, fixture]) => [key, {
        name: fixture.name,
        type: fixture.type,
        size: fixture.size,
      }])),
      currentTransfer: null,
      phaseTrace: [],
      createdUrls: 0,
      revokedUrls: 0,
      liveUrls,
    }
    URL.createObjectURL = (object) => {
      const url = originalCreate(object)
      harness.createdUrls += 1
      liveUrls.add(url)
      return url
    }
    URL.revokeObjectURL = (url) => {
      harness.revokedUrls += 1
      liveUrls.delete(url)
      originalRevoke(url)
    }
    const inlay = document.querySelector('[data-testid="aionui-drag-inlay"]')
    if (!(inlay instanceof HTMLElement)) throw new Error('image drop inlay is unavailable')
    const recordPhase = () => {
      const phase = inlay.dataset.phase ?? 'missing'
      if (harness.phaseTrace.at(-1) !== phase) harness.phaseTrace.push(phase)
    }
    new MutationObserver(recordPhase).observe(inlay, { attributes: true, attributeFilter: ['data-phase'] })
    recordPhase()
    globalThis.__dshImageDropHarness = harness
  }, payload)
}

async function beginDrag(page, fixtureName, sequence) {
  const path = fixtureFiles.get(fixtureName)
  assert.equal(typeof path, 'string', `missing disk fixture: ${fixtureName}`)
  // DOM.setFileInputFiles supplies an OS-backed File, as a real external drop
  // does. Rebuilding it from a Uint8Array on every iteration instead makes
  // Chromium retain synthetic blob buffers even without any application drop
  // handler, contaminating the retained-memory measurement below.
  await page.locator('input[data-dsh-image-drop-fixture]').setInputFiles(path)
  await page.evaluate(({ fixtureKey, fileSequence }) => {
    const harness = globalThis.__dshImageDropHarness
    const fixture = harness?.fixtures?.[fixtureKey]
    const target = document.querySelector('[data-composer-card]')
    if (fixture === undefined || !(target instanceof HTMLElement)) throw new Error('drop fixture or composer is unavailable')
    harness.phaseTrace = []
    const input = document.querySelector('input[data-dsh-image-drop-fixture]')
    const sourceFile = input?.files?.[0]
    if (!(sourceFile instanceof File) || sourceFile.size !== fixture.size) throw new Error('disk fixture bytes do not match')
    const file = new File([sourceFile], `${fileSequence}-${fixture.name}`, { type: fixture.type })
    const transfer = new DataTransfer()
    transfer.items.add(file)
    harness.currentTransfer = transfer
    for (const type of ['dragenter', 'dragover']) {
      target.dispatchEvent(new DragEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        dataTransfer: transfer,
      }))
    }
  }, { fixtureKey: fixtureName, fileSequence: sequence })
  await page.waitForFunction(() => document.querySelectorAll('#dshDropOverlayClip').length === 1)
}

async function finishDrop(page, cancel = false) {
  await page.evaluate((shouldCancel) => {
    const harness = globalThis.__dshImageDropHarness
    const target = document.querySelector('[data-composer-card]')
    if (!(target instanceof HTMLElement) || !(harness?.currentTransfer instanceof DataTransfer)) {
      throw new Error('active drop transfer or composer is unavailable')
    }
    target.dispatchEvent(new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      composed: true,
      dataTransfer: harness.currentTransfer,
    }))
    harness.currentTransfer = null
    document.querySelector('input[data-dsh-image-drop-fixture]').value = ''
    if (shouldCancel) {
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }))
    }
  }, cancel)
}

async function browserState(page) {
  return page.evaluate(() => {
    const inlay = document.querySelector('[data-testid="aionui-drag-inlay"]')
    const card = document.querySelector('[data-composer-card]')
    const harness = globalThis.__dshImageDropHarness
    if (!(inlay instanceof HTMLElement) || !(card instanceof HTMLElement) || harness === undefined) {
      throw new Error('image drop browser state is unavailable')
    }
    return {
      phase: inlay.dataset.phase,
      phaseTrace: [...harness.phaseTrace],
      attachments: card.querySelectorAll('img[src^="blob:"]').length,
      overlays: document.querySelectorAll('#dshDropOverlayClip').length,
      liveUrls: harness.liveUrls.size,
      createdUrls: harness.createdUrls,
      revokedUrls: harness.revokedUrls,
      inputDisabled: card.querySelector('textarea')?.disabled,
    }
  })
}

async function electronMemorySample(application, label) {
  const { rows, mainProcessMemory } = await application.evaluate(({ app }) => ({
    rows: app.getAppMetrics().map(metric => ({
      type: metric.type,
      workingSetBytes: (metric.memory?.workingSetSize ?? 0) * 1024,
      privateBytes: (metric.memory?.privateBytes ?? 0) * 1024,
    })),
    mainProcessMemory: process.memoryUsage(),
  }))
  return {
    label,
    totalWorkingSetBytes: rows.reduce((sum, row) => sum + row.workingSetBytes, 0),
    totalPrivateBytes: rows.reduce((sum, row) => sum + row.privateBytes, 0),
    processCount: rows.length,
    processes: rows,
    mainProcessMemory,
  }
}

async function waitForState(page, application, predicate, label, timeoutMs = 45_000) {
  const startedAt = Date.now()
  const memory = []
  while (Date.now() - startedAt < timeoutMs) {
    const state = await browserState(page)
    memory.push(await electronMemorySample(application, label))
    if (predicate(state)) return { state, memory }
    await wait(50)
  }
  throw new Error(`${label} did not settle: ${JSON.stringify(await browserState(page))}`)
}

async function removeAttachment(page) {
  await page.evaluate(() => {
    const image = document.querySelector('[data-composer-card] img[src^="blob:"]')
    const item = image?.parentElement?.parentElement
    const buttons = item?.querySelectorAll('button') ?? []
    const remove = buttons.item(buttons.length - 1)
    if (!(remove instanceof HTMLButtonElement) || buttons.length < 2) throw new Error('attachment remove button is unavailable')
    remove.click()
  })
  await page.waitForFunction(() => {
    const harness = globalThis.__dshImageDropHarness
    return document.querySelectorAll('[data-composer-card] img[src^="blob:"]').length === 0
      && harness?.liveUrls?.size === 0
  })
}

async function attachmentEvidence(page) {
  return page.evaluate(async () => {
    const image = document.querySelector('[data-composer-card] img[src^="blob:"]')
    if (!(image instanceof HTMLImageElement)) throw new Error('attachment preview is unavailable')
    const response = await fetch(image.src)
    const blob = await response.blob()
    const bitmap = await createImageBitmap(blob)
    try {
      return {
        bytes: blob.size,
        type: blob.type,
        width: bitmap.width,
        height: bitmap.height,
      }
    } finally {
      bitmap.close()
    }
  })
}

async function idleMedian(application, label) {
  const samples = []
  for (let index = 0; index < 7; index += 1) {
    samples.push(await electronMemorySample(application, label))
    await wait(150)
  }
  return {
    label,
    totalWorkingSetBytes: median(samples.map(sample => sample.totalWorkingSetBytes)),
    totalPrivateBytes: median(samples.map(sample => sample.totalPrivateBytes)),
    processCount: median(samples.map(sample => sample.processCount)),
    processesAtMiddleSample: samples[Math.floor(samples.length / 2)].processes,
    mainProcessMemoryAtMiddleSample: samples[Math.floor(samples.length / 2)].mainProcessMemory,
  }
}

const snapshotCommand = [
  "$ErrorActionPreference='Stop';",
  'Get-CimInstance Win32_Process',
  '| Select-Object ProcessId,ParentProcessId,WorkingSetSize,PrivatePageCount,Name,CommandLine',
  '| ConvertTo-Json -Compress',
].join(' ')

async function processTreeSample(rootProcessId, elapsedMs) {
  const { stdout } = await executeFile('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    snapshotCommand,
  ], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
    timeout: 15_000,
  })
  return createMemorySample(normalizeProcessSnapshot(JSON.parse(stdout)), rootProcessId, elapsedMs)
}

try {
  await mkdir(workspacePath, { recursive: true })
  await seedPrimaryRuntimePermissionForTest({ userData })
  activeApplication = await electron.launch({
    executablePath: appPath,
    cwd: appDir,
    env: {
      ...process.env,
      DSH_DESKTOP_USER_DATA: userData,
      DSH_DESKTOP_DISABLE_UPDATES: '1',
      DSH_DESKTOP_VERIFY_UPDATER: '0',
      DSH_HOME: dshHome,
      DSH_AGENTS_HOME: join(userData, 'agents'),
    },
  })
  const page = await activeApplication.firstWindow()
  const rendererErrors = []
  const rendererConsole = []
  page.on('pageerror', error => rendererErrors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') {
      rendererConsole.push(`${message.type()}: ${message.text()}`)
    }
  })
  try {
    await page.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { timeout: runtimeReadyTimeoutMs })
    await page.waitForSelector('style[data-plugin="@linxin666/dsh-client-ui-aionui-panel"]', {
      state: 'attached',
      timeout: runtimeReadyTimeoutMs,
    })
    await dismissStartup(page)
  } catch (error) {
    const runtimeLog = await readFile(join(userData, 'logs', 'runtime.log'), 'utf8').catch(() => '')
    throw new Error(`${error.message}\nRecent runtime log:\n${runtimeLog.slice(-8_000)}`, { cause: error })
  }

  const workspace = await rpc(page, 'workspace.create', { path: workspacePath })
  const workspaceId = workspace?.workspace?.workspaceId ?? workspace?.workspaceId
  assert.equal(typeof workspaceId, 'string', JSON.stringify(workspace))
  const session = await rpc(page, 'session.create', { workspaceId })
  assert.equal(typeof session?.sessionId, 'string', JSON.stringify(session))
  await openCreatedSession(page, session.sessionId)
  await page.waitForSelector('[data-testid="aionui-drag-inlay"]', { state: 'attached', timeout: 30_000 })
  await page.waitForSelector('[data-composer-card] textarea:not([disabled])', { state: 'visible', timeout: 30_000 })

  let payload = await fixturePayload()
  const fixtureEvidence = { sizes: payload.sizes, dimensions: payload.dimensions }
  await installBrowserHarness(page, payload)
  payload = undefined

  const rootProcessId = activeApplication.process().pid
  const measuredAt = Date.now()
  const baseline = await idleMedian(activeApplication, 'baseline')
  const treeSamples = [{ label: 'baseline', ...(await processTreeSample(rootProcessId, 0)) }]
  const activityMemory = []

  await beginDrag(page, 'corrupt', 'failure')
  await finishDrop(page)
  const failed = await waitForState(page, activeApplication, state => state.phase === 'failed', 'corrupt-image')
  activityMemory.push(...failed.memory)
  assert.equal(failed.state.attachments, 0)
  assert.equal(failed.state.overlays, 0)
  assert.equal(failed.state.liveUrls, 0)
  assert.ok(failed.state.phaseTrace.includes('validating'), JSON.stringify(failed.state))
  assert.ok(failed.state.phaseTrace.includes('failed'), JSON.stringify(failed.state))

  await beginDrag(page, 'large', 'failure-retry')
  await finishDrop(page)
  const retry = await waitForState(page, activeApplication, state => state.phase === 'idle' && state.attachments === 1, 'failure-retry')
  activityMemory.push(...retry.memory)
  assert.equal(retry.state.overlays, 0)
  assert.equal(retry.state.liveUrls, 1)
  assert.ok(retry.state.phaseTrace.includes('decoding'), JSON.stringify(retry.state))
  assert.ok(retry.state.phaseTrace.includes('compressing'), JSON.stringify(retry.state))
  const compressedEvidence = await attachmentEvidence(page)
  assert.ok(compressedEvidence.bytes <= 3 * 1024 * 1024, JSON.stringify(compressedEvidence))
  assert.ok(Math.max(compressedEvidence.width, compressedEvidence.height) <= 2048, JSON.stringify(compressedEvidence))
  assert.equal(compressedEvidence.type, 'image/jpeg')
  await removeAttachment(page)

  await beginDrag(page, 'large', 'cancel')
  await finishDrop(page, true)
  const cancelled = await waitForState(page, activeApplication, state => state.phase === 'idle' && state.attachments === 0, 'cancelled-image')
  activityMemory.push(...cancelled.memory)
  assert.equal(cancelled.state.overlays, 0)
  assert.equal(cancelled.state.liveUrls, 0)

  await beginDrag(page, 'large', 'cancel-retry')
  await finishDrop(page)
  const cancelRetry = await waitForState(page, activeApplication, state => state.phase === 'idle' && state.attachments === 1, 'cancel-retry')
  activityMemory.push(...cancelRetry.memory)
  await removeAttachment(page)

  const groupIdle = []
  for (let operation = 1; operation <= operationCount; operation += 1) {
    await beginDrag(page, 'large', `continuous-${operation}`)
    await finishDrop(page)
    const settled = await waitForState(
      page,
      activeApplication,
      state => state.phase === 'idle' && state.attachments === 1 && state.overlays === 0,
      `continuous-${operation}`,
    )
    activityMemory.push(...settled.memory)
    assert.equal(settled.state.liveUrls, 1, JSON.stringify(settled.state))
    assert.equal(settled.state.inputDisabled, false, JSON.stringify(settled.state))
    await removeAttachment(page)
    if (operation % 5 === 0) {
      await wait(750)
      groupIdle.push(await idleMedian(activeApplication, `after-${operation}`))
      console.log('image-drop idle memory', JSON.stringify(groupIdle.at(-1)))
      treeSamples.push({
        label: `after-${operation}`,
        ...(await processTreeSample(rootProcessId, Date.now() - measuredAt)),
      })
    }
  }

  await beginDrag(page, 'large', 'large-then-small-large')
  await finishDrop(page)
  const largeThen = await waitForState(page, activeApplication, state => state.phase === 'idle' && state.attachments === 1, 'large-then-small-large')
  activityMemory.push(...largeThen.memory)
  await removeAttachment(page)
  await beginDrag(page, 'small', 'large-then-small-small')
  await finishDrop(page)
  const smallThen = await waitForState(page, activeApplication, state => state.phase === 'idle' && state.attachments === 1, 'large-then-small-small')
  activityMemory.push(...smallThen.memory)
  assert.deepEqual(smallThen.state.phaseTrace, [], 'small image should stay on the native attachment path')
  await removeAttachment(page)

  const finalState = await browserState(page)
  assert.equal(finalState.phase, 'idle')
  assert.equal(finalState.attachments, 0)
  assert.equal(finalState.overlays, 0)
  assert.equal(finalState.liveUrls, 0)
  assert.equal(finalState.createdUrls, finalState.revokedUrls)
  assert.equal(finalState.inputDisabled, false)

  const firstIdle = groupIdle[0].totalWorkingSetBytes
  const lastIdle = groupIdle.at(-1).totalWorkingSetBytes
  const allowedRetainedGrowthBytes = Math.max(retainedGrowthFloorBytes, Math.round(firstIdle * 0.1))
  assert.ok(
    lastIdle - firstIdle <= allowedRetainedGrowthBytes,
    `working set kept growing across image-drop groups: ${JSON.stringify({ groupIdle, allowedRetainedGrowthBytes })}`,
  )
  const seriousConsole = rendererConsole.filter(line => !/favicon|DevTools|style-src 'self'|Electron Security Warning/iu.test(line))
  assert.deepEqual(rendererErrors, [])
  assert.deepEqual(seriousConsole, [])

  console.log(JSON.stringify({
    appPath,
    fixtureEvidence,
    compressedEvidence,
    cases: {
      corruptFailureRetry: true,
      cancellationRetry: true,
      continuousLargeDrops: operationCount,
      largeThenSmall: true,
      nativeSmallImagePath: true,
      overlaysCleared: true,
      objectUrlsBalanced: {
        created: finalState.createdUrls,
        revoked: finalState.revokedUrls,
      },
    },
    memory: {
      baseline,
      electronWorkingSetPeakBytes: Math.max(...activityMemory.map(sample => sample.totalWorkingSetBytes)),
      electronPrivatePeakBytes: Math.max(...activityMemory.map(sample => sample.totalPrivateBytes)),
      groupIdle,
      allowedRetainedGrowthBytes,
      observedRetainedGrowthBytes: lastIdle - firstIdle,
      completeProcessTree: treeSamples,
    },
  }, null, 2))
} finally {
  await activeApplication?.close().catch(() => {})
  await rm(temporary, { recursive: true, force: true })
}
