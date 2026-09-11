import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { appendFile, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

import { createMessage, createUserMessage, expandAssistantStream } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'

import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import { useChineseFixtureLocale } from './dock-settings-fixture.mjs'
import { waitForSessionLog } from './session-log-fixture.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const mainEntry = resolve(appDir, 'src', 'main.mjs')
const configuredExecutable = process.env.DSH_DESKTOP_E2E_EXECUTABLE
const packagedExecutable = configuredExecutable === undefined ? undefined : resolve(configuredExecutable)
if (packagedExecutable !== undefined && !existsSync(packagedExecutable)) {
  throw new Error(`DSH_DESKTOP_E2E_EXECUTABLE does not exist: ${packagedExecutable}`)
}

const temporary = await realpath(await mkdtemp(join(tmpdir(), 'dsh-conversation-scroll-e2e-')))
const userData = join(temporary, 'user-data')
const dshHome = join(temporary, 'dsh-home')
const workspacePath = join(temporary, 'conversation-scroll-workspace')
const profileDir = join(dshHome, 'profiles', 'desktop')
const runtimeReadyTimeoutMs = process.env.CI ? 180_000 : 120_000
const messageCount = 20
const nativeTurns = process.argv.includes('--native-turns')
let activeApp
let activeDiagnostics

async function verifyMessageParticleClearance(page) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas[data-dsh-particle-theme="whale"]')
    if (!(canvas instanceof HTMLCanvasElement)) return false
    const rects = JSON.parse(canvas.dataset.dshParticleContentRects || '[]')
    if (!rects.length) return false
    const bounds = canvas.getBoundingClientRect()
    const messages = [...document.querySelectorAll('[data-pane="conversation"] [data-chat-flow-kind]')]
      .map(element => element.getBoundingClientRect())
      .filter(box => box.width > 0 && box.height > 0 && box.top > bounds.top
        && box.bottom < Number(canvas.dataset.dshParticleContentBottom))
    if (!messages.length || !messages.every(box => rects.some(rect =>
      rect.x <= box.left - bounds.left && rect.y <= box.top - bounds.top
      && rect.x + rect.width >= box.right - bounds.left
      && rect.y + rect.height >= box.bottom - bounds.top))) return false
    const context = canvas.getContext('2d')
    if (!context || !canvas.width || !canvas.height) return false
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    let themeStillVisible = false
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > 0) { themeStillVisible = true; break }
    }
    if (!themeStillVisible) return false
    const ratioX = canvas.width / bounds.width, ratioY = canvas.height / bounds.height
    for (const rect of rects) {
      const left = Math.max(0, Math.ceil(rect.x * ratioX) + 2)
      const top = Math.max(0, Math.ceil(rect.y * ratioY) + 2)
      const right = Math.min(canvas.width, Math.floor((rect.x + rect.width) * ratioX) - 2)
      const bottom = Math.min(canvas.height, Math.floor((rect.y + rect.height) * ratioY) - 2)
      for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
        if (pixels[(y * canvas.width + x) * 4 + 3] !== 0) return false
      }
    }
    return true
  }, undefined, { timeout: 20_000 })
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
    const introDialog = page.getByRole('dialog').filter({ has: continueButton })
    if (await introDialog.isVisible().catch(() => false)) {
      await continueButton.last().click({ force: true })
      continue
    }
    if (attempt >= 7) break
  }
}

async function launch() {
  await seedPrimaryRuntimePermissionForTest({ userData })
  const args = packagedExecutable === undefined ? [mainEntry] : []
  const instance = await electron.launch({
    executablePath: packagedExecutable ?? electronPath,
    args,
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
  activeApp = instance
  await useChineseFixtureLocale(instance)
  const page = await instance.firstWindow()
  const rendererErrors = []
  const rendererConsole = []
  const failedRequests = []
  activeDiagnostics = { rendererErrors, rendererConsole, failedRequests }
  page.on('requestfailed', request => failedRequests.push({
    method: request.method(), path: new URL(request.url()).pathname,
    failure: request.failure()?.errorText,
  }))
  page.on('pageerror', error => rendererErrors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') {
      rendererConsole.push(`${message.type()}: ${message.text()}`)
    }
  })
  try {
    await page.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { timeout: runtimeReadyTimeoutMs })
    await page.waitForSelector('style[data-plugin="@linxin666/dsh-web-ui-all"]', {
      state: 'attached',
      timeout: runtimeReadyTimeoutMs,
    })
    await dismissStartup(page)
  } catch (error) {
    const runtimeLog = await readFile(join(userData, 'logs', 'runtime.log'), 'utf8').catch(() => '')
    console.error(`runtime did not become ready; recent log:\n${runtimeLog.slice(-8_000) || '(no runtime log)'}`)
    console.error(`renderer readiness diagnostics:\n${JSON.stringify({
      error: error instanceof Error ? error.stack ?? error.message : String(error),
      rendererErrors,
      rendererConsole,
    }, null, 2)}`)
    throw error
  }
  return { instance, page, rendererErrors, rendererConsole }
}

async function rpc(page, method, payload) {
  const response = await page.evaluate(async ({ rpcMethod, rpcPayload, rpcId }) => {
    const endpoint = rpcMethod.replace('.', '/')
    const requestField = rpcMethod === 'session.list' ? '_request' : 'request'
    const result = await fetch(`/api/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId,
        method: endpoint,
        payload: { args: { [requestField]: rpcPayload } },
      }),
    })
    return { status: result.status, body: await result.json().catch(() => undefined) }
  }, { rpcMethod: method, rpcPayload: payload, rpcId: randomUUID() })
  assert.equal(response.status, 200, `${method}: HTTP ${response.status}`)
  assert.equal(response.body?.type, 'server-response', `${method}: missing response envelope`)
  assert.equal(response.body?.result?.ok, true, `${method}: ${JSON.stringify(response.body?.result)}`)
  return response.body.result.value
}

async function collectFiles(root, suffix) {
  const found = []
  const pending = [root]
  while (pending.length > 0) {
    const current = pending.pop()
    const entries = await readdir(current, { withFileTypes: true }).catch(error => {
      if (error?.code === 'ENOENT') return []
      throw error
    })
    for (const entry of entries) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) pending.push(path)
      else if (entry.isFile() && entry.name.endsWith(suffix)) found.push(path)
    }
  }
  return found
}

async function seedConversationLog(sessionId) {
  const logs = await collectFiles(join(dshHome, 'sessions'), '.jsonl')
  assert.equal(logs.length, 1, `expected one uncompressed session log, found ${JSON.stringify(logs)}`)
  const logPath = logs[0]
  const original = await readFile(logPath, 'utf8')
  const lines = original.trimEnd().split(/\r?\n/u)
  assert.ok(lines.length >= 1, 'session log is missing its header')
  const header = JSON.parse(lines[0])
  assert.equal(header.id, sessionId)
  assert.equal(header.cwd, workspacePath)
  const existingEvents = lines.slice(1).filter(Boolean).map(line => JSON.parse(line))
  assert.ok(existingEvents.every((event, index) => event.seq === index), 'new session events are not contiguous')

  // Desktop session creation records its permission baseline immediately.
  // Replaying that valid prefix lets the official Session implementation mint
  // the end-seed marker and all following event sequence numbers correctly.
  const session = Session.create(SessionId(sessionId), existingEvents)
  // A user-message-only log is still a provisional blank session in the
  // official sessionListMetadata projection. Keep one real enclosing turn
  // for the compatibility fixture: it has no per-message native turn rail,
  // but New Session must not legitimately reuse it as an untouched draft.
  if (!nativeTurns) session.append('turn/start', { turn: 1 })
  for (let index = 1; index <= messageCount; index += 1) {
    if (nativeTurns) session.append('turn/start', { turn: index })
    session.append('user/message', createUserMessage({
      content: [{
        type: 'text',
        text: `G02.5 turn ${String(index).padStart(2, '0')}\n${'Long conversation viewport evidence. '.repeat(14)}`,
      }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    if (nativeTurns && index === messageCount) {
      // A real durable settlement drives both official and desktop projections.
      // No provider request, injected DOM metric, or real user log is involved.
      session.append('step/start', { turn: index, step: 1 })
      const time0 = Date.now()
      await new Promise(resolve => setTimeout(resolve, 30))
      const stream = [{ type: 'text-chunks', time0, index: 0, dt: [20], texts: ['Statistics fixture. ', 'Completed.'] }]
      assert.equal(expandAssistantStream(stream).length, 2, 'validate compact stream before persisting the fixture')
      session.append('assistant/message', {
        turn: index, step: 1,
        message: createMessage({
          role: 'assistant',
          content: [{ type: 'text', text: 'Statistics fixture. Completed.' }],
          source: { kind: 'model', provider: 'mock', model: 'mock' },
        }),
        stream,
        usage: { inputTokens: 100, outputTokens: 40, cacheReadTokens: 200 },
      }, { surfaceOp: 'append' })
      session.append('step/end', { turn: index, step: 1 })
    }
    if (nativeTurns) session.append('turn/end', { turn: index, reason: { kind: 'completed' } })
  }
  if (!nativeTurns) session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  const appended = session.snapshotEvents().slice(existingEvents.length)
  assert.equal(appended.length, nativeTurns ? messageCount * 3 + 4 : messageCount + 3)
  await appendFile(logPath, `${appended.map(event => JSON.stringify(event)).join('\n')}\n`)
  return { logPath, asOfSeq: session.snapshotEvents().at(-1).seq }
}

// The public cold list is a checkpoint hint, while opening history hydrates
// the exact log and writes its projection checkpoint asynchronously. Wait for
// that precise cut, not for blank=false, so an incorrect value still fails.
async function waitForSeededSummary(page, sessionId, asOfSeq) {
  const deadline = Date.now() + 10_000
  let summary
  let reads = 0
  while (Date.now() < deadline) {
    summary = (await rpc(page, 'session.list', {})).items.find(item => item.id === sessionId || item.sessionId === sessionId)
    assert.ok(summary, 'restored session must remain listed while its checkpoint converges')
    reads += 1
    if (reads === 1) console.log('restored session checkpoint', JSON.stringify({ expectedSeq: asOfSeq,
      observedSeq: summary.projections?.asOfSeq, blank: summary.blank }))
    if (summary.projections?.asOfSeq >= asOfSeq) {
      console.log('restored session checkpoint ready', JSON.stringify({ reads,
        asOfSeq: summary.projections.asOfSeq, blank: summary.blank }))
      return summary
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 100))
  }
  assert.fail(`restored checkpoint did not reach log cut ${asOfSeq}: ${JSON.stringify(summary)}`)
}

async function openSeededSession(page, sessionId) {
  const turns = page.locator('[data-chat-flow-kind="user"]')
  if (await turns.count() === messageCount) return

  const listed = await rpc(page, 'session.list', {})
  const summaries = Array.isArray(listed?.items) ? listed.items : []
  const summary = summaries.find(item => item?.id === sessionId || item?.sessionId === sessionId)
  assert.ok(summary, `restored session is missing from session.list: ${JSON.stringify(listed)}`)

  const group = page.getByRole('treeitem').filter({ hasText: basename(workspacePath) }).first()
  await group.waitFor({ state: 'visible', timeout: 30_000 })
  if (await group.getAttribute('aria-expanded') !== 'true') await group.click({ force: true })
  await page.waitForTimeout(500)

  const expectedTitle = typeof summary.displayTitle === 'string' ? summary.displayTitle : summary.title
  let sessionRow = typeof expectedTitle === 'string' && expectedTitle !== ''
    ? page.getByRole('treeitem').filter({ hasText: expectedTitle }).first()
    : undefined
  if (sessionRow === undefined || !await sessionRow.isVisible().catch(() => false)) {
    // A title-less restored session falls back to the Workspace label. Select
    // the non-current session row, not the selected provisional New Session.
    sessionRow = page.locator('[role="treeitem"][aria-selected="false"]')
      .filter({ hasText: basename(workspacePath) })
      .first()
    assert.equal(await sessionRow.isVisible().catch(() => false), true, `restored session row is unavailable: ${JSON.stringify(listed)}`)
  }
  await sessionRow.click({ force: true })
  try {
    await page.waitForFunction(expected => document.querySelectorAll('[data-chat-flow-kind="user"]').length === expected, messageCount, {
      timeout: 30_000,
    })
  } catch (error) {
    const diagnostic = await page.getByRole('treeitem').evaluateAll(rows => rows.map(row => ({
      text: row.textContent,
      selected: row.getAttribute('aria-selected'),
      expanded: row.getAttribute('aria-expanded'),
    })))
    console.error(`restored session open diagnostic:\n${JSON.stringify({ summary, diagnostic, renderedTurns: await turns.count() }, null, 2)}`)
    throw error
  }
}

async function verifyStatsSupplement(page) {
  const native = page.locator('[data-composer-stats]')
  const supplement = page.locator('[data-dsh-live-stats]')
  await native.waitFor({ state: 'visible' })
  await supplement.waitFor({ state: 'visible' })
  assert.equal(await native.count(), 1, 'the official cumulative stats have one owner')
  assert.equal(await supplement.count(), 1, 'desktop contributes one compact supplement')
  assert.match(await native.innerText(), /340/u, 'official provider usage remains visible')
  assert.match(await native.innerText(), /tok\/s/u, 'official average speed remains visible')
  const summary = supplement.locator('summary')
  assert.match(await summary.innerText(), /^≈¥[\d.,]+ · 明细$/u)
  assert.equal(await supplement.evaluate(element => element.open), false)
  assert.equal(await supplement.locator('dl').isVisible(), false, 'detailed metrics do not duplicate the primary row')
  await summary.focus()
  await page.keyboard.press('Enter')
  await supplement.locator('dl').waitFor({ state: 'visible' })
  const metrics = await supplement.locator('dl').innerText()
  assert.match(metrics, /API 输入\s*300/u)
  assert.match(metrics, /API 输出\s*40/u)
  assert.match(metrics, /滚动 1 秒\s*[\d.]+ tok\/s/u)
  assert.match(metrics, /步骤峰值\s*[\d.]+ tok\/s/u)
  const bounds = await supplement.boundingBox()
  assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.height < 220, JSON.stringify(bounds))
  if (process.env.DSH_DESKTOP_DOCK_SCREENSHOTS) {
    await page.screenshot({ path: join(resolve(process.env.DSH_DESKTOP_DOCK_SCREENSHOTS), 'native-stats-details.png') })
  }
  await summary.click()
  assert.equal(await supplement.evaluate(element => element.open), false)
  assert.equal(await supplement.locator('dl').isVisible(), false)
  // Native drill-down is still usable; we never mutate or replace its controls.
  await native.getByRole('button').filter({ hasText: '340' }).click()
  await page.locator('[data-session-stats-usage]').waitFor({ state: 'visible', timeout: 5_000 })
  await page.keyboard.press('Escape')
}

async function conversationGeometry(page) {
  return page.evaluate(() => {
    const scroll = document.querySelector('[data-conversation-scroll]')
    const composer = document.querySelector('[data-composer-seat]')
    const inputScroll = document.querySelector('[data-input-scroll]')
    if (!(scroll instanceof HTMLElement) || !(composer instanceof HTMLElement) || !(inputScroll instanceof HTMLElement)) {
      throw new Error('conversation scroll, composer seat, or input scroll is unavailable')
    }
    const composerRect = composer.getBoundingClientRect()
    const scrollRect = scroll.getBoundingClientRect()
    return {
      scrollTop: scroll.scrollTop,
      scrollHeight: scroll.scrollHeight,
      scrollClientHeight: scroll.clientHeight,
      scrollRect: { top: scrollRect.top, bottom: scrollRect.bottom },
      composer: { top: composerRect.top, bottom: composerRect.bottom },
      inputScrollTop: inputScroll.scrollTop,
      inputScrollHeight: inputScroll.scrollHeight,
      inputClientHeight: inputScroll.clientHeight,
      viewportHeight: innerHeight,
    }
  })
}

async function assertDarkReadability(page) {
  await page.evaluate(() => {
    document.body.setAttribute('data-ds-dark-theme', '')
  })
  await page.waitForTimeout(250)
  const state = await page.evaluate(() => {
    const parseRgb = (value) => {
      const values = value.match(/[\d.]+/gu)?.map(Number) ?? []
      return values.slice(0, 3)
    }
    const luminance = (rgb) => {
      const channels = rgb.map(value => {
        const normalized = value / 255
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
      })
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
    }
    const contrast = (foreground, background) => {
      const a = luminance(parseRgb(foreground))
      const b = luminance(parseRgb(background))
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
    }
    const label = document.querySelector('[role="treeitem"]')
    if (!(label instanceof HTMLElement)) throw new Error('sidebar label unavailable')
    const style = getComputedStyle(label)
    let background = 'rgb(24, 24, 24)'
    for (let node = label; node; node = node.parentElement) {
      const color = getComputedStyle(node).backgroundColor
      if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') { background = color; break }
    }
    const rows = [...document.querySelectorAll('[role="treeitem"]')]
      .filter(row => row instanceof HTMLElement && row.getClientRects().length > 0)
      .map(row => {
        const rect = row.getBoundingClientRect()
        return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }
      })
      .filter(rect => rect.bottom > rect.top)
      .sort((left, right) => left.top - right.top)
    const overlaps = []
    for (let index = 1; index < rows.length; index += 1) {
      const previous = rows[index - 1]
      const current = rows[index]
      if (Math.min(previous.right, current.right) > Math.max(previous.left, current.left)
        && current.top < previous.bottom - 1) overlaps.push({ previous, current })
    }
    return {
      contrast: contrast(style.color, background),
      color: style.color,
      background,
      fallbackCount: document.querySelectorAll('[data-dsh-turn-navigator]').length,
      overlaps,
    }
  })
  assert.ok(state.contrast >= 3, `dark sidebar label contrast is too low: ${JSON.stringify(state)}`)
  assert.equal(state.fallbackCount, 0, 'Desktop never overlays the removed floating pager')
  assert.deepEqual(state.overlaps, [], `visible sidebar rows overlap: ${JSON.stringify(state.overlaps)}`)
  return state
}

try {
  await mkdir(profileDir, { recursive: true })
  await mkdir(workspacePath, { recursive: true })
  await writeFile(join(workspacePath, 'reference-only.pdf'), 'PDF path-reference sentinel; this file is not parsed by the UI.\n')
  await writeFile(join(profileDir, 'cordis.patch.yml'), [
    '- id: session-persistence-jsonl',
    '  config:',
    "    root: !!js dshHomePath('sessions')",
    '    compression: none',
    '',
  ].join('\n'))

  const first = await launch()
  activeApp = first.instance
  const workspace = await rpc(first.page, 'workspace.create', { path: workspacePath })
  const workspaceId = workspace?.workspace?.workspaceId ?? workspace?.workspaceId
  assert.equal(typeof workspaceId, 'string', JSON.stringify(workspace))
  const created = await rpc(first.page, 'session.create', { workspaceId })
  assert.equal(typeof created?.sessionId, 'string', JSON.stringify(created))
  const sessionId = created.sessionId
  await first.page.locator('[data-pane="conversation"]').waitFor({ state: 'visible' })
  assert.equal(await first.page.locator('[data-chat-flow-kind="user"]').count(), 0)
  await first.page.locator('[data-dsh-turn-navigator]').waitFor({ state: 'detached' })
  await first.page.locator('[data-dsh-live-stats]').waitFor({ state: 'detached' })
  if (process.env.DSH_DESKTOP_DOCK_SCREENSHOTS) {
    const screenshots = resolve(process.env.DSH_DESKTOP_DOCK_SCREENSHOTS)
    await mkdir(screenshots, { recursive: true })
    await first.page.screenshot({ path: join(screenshots, 'conversation-empty-no-navigation.png') })
  }
  assert.deepEqual(first.rendererErrors, [])
  await waitForSessionLog(join(dshHome, 'sessions'), sessionId)
  await activeApp.close()
  activeApp = undefined

  const { logPath, asOfSeq } = await seedConversationLog(sessionId)

  const second = await launch()
  activeApp = second.instance
  await openSeededSession(second.page, sessionId)
  const seededSummary = await waitForSeededSummary(second.page, sessionId, asOfSeq)
  assert.equal(seededSummary?.blank, false, 'the restored history must not be classified as a reusable blank draft')
  if (nativeTurns) {
    await (await activeApp.browserWindow(second.page)).evaluate(window => window.setSize(1700, 820))
    await second.page.waitForFunction(() => document.querySelector('[data-pane="conversation"]')?.getBoundingClientRect().width > 900)
  }
  assert.equal(await second.page.locator('[data-memory-activity="true"]').count(), 0, 'memory controls live in Dock settings, not the conversation header')
  const turns = second.page.locator('[data-chat-flow-kind="user"]')
  assert.equal(await turns.count(), messageCount)
  assert.match(await turns.first().innerText(), /G02\.5 turn 01/u)
  assert.match(await turns.last().innerText(), /G02\.5 turn 20/u)
  if (nativeTurns) await verifyStatsSupplement(second.page)

  await second.page.evaluate(() => {
    const scroll = document.querySelector('[data-conversation-scroll]')
    const inputScroll = document.querySelector('[data-input-scroll]')
    if (!(scroll instanceof HTMLElement) || !(inputScroll instanceof HTMLElement)) throw new Error('scroll elements unavailable')
    scroll.scrollTop = 0
    inputScroll.scrollTop = inputScroll.scrollHeight
  })
  await second.page.waitForTimeout(200)
  await verifyMessageParticleClearance(second.page)
  const beforeWheel = await conversationGeometry(second.page)
  const nativeBottom = second.page.getByRole('button', { name: '回到底部', exact: true })
  await nativeBottom.waitFor({ state: 'visible' })
  console.log('native bottom control', await nativeBottom.evaluate(button => ({
    label: button.getAttribute('aria-label'),
    conversationOwned: Boolean(button.closest('[data-pane="conversation"]')),
  })))
  if (!nativeTurns) {
    assert.equal(await second.page.locator('[data-dsh-turn-navigator] [data-role="bottom"]').isVisible(), false,
      'the native bottom action owns the visible control, including legacy histories')
  }
  assert.ok(beforeWheel.scrollHeight > beforeWheel.scrollClientHeight * 2, JSON.stringify(beforeWheel))
  assert.ok(beforeWheel.composer.top >= beforeWheel.scrollRect.top, JSON.stringify(beforeWheel))
  assert.ok(beforeWheel.composer.bottom <= beforeWheel.viewportHeight + 2, JSON.stringify(beforeWheel))
  if (nativeTurns) {
    try {
      await second.page.getByRole('navigation', { name: '轮次导航', exact: true }).waitFor()
    } catch (error) {
      console.error('Native navigation diagnostic:', await second.page.evaluate(() => ({
        navigation: [...document.querySelectorAll('nav')].map(nav => ({ label: nav.getAttribute('aria-label'), buttons: nav.querySelectorAll('button').length, bounds: nav.getBoundingClientRect().toJSON(), display: getComputedStyle(nav).display })),
        turns: [...document.querySelectorAll('[data-chat-turn]')].map(node => node.getAttribute('data-chat-turn')),
        fallback: document.querySelectorAll('[data-dsh-turn-navigator]').length,
      })))
      throw error
    }
    await second.page.locator('[data-dsh-turn-navigator]').waitFor({ state: 'detached' })
  }
  assert.equal(await second.page.locator('[data-dsh-turn-navigator]').count(), 0, 'legacy and native histories have no floating pager')
  if (process.env.DSH_DESKTOP_DOCK_SCREENSHOTS) {
    const screenshots = resolve(process.env.DSH_DESKTOP_DOCK_SCREENSHOTS)
    await mkdir(screenshots, { recursive: true })
    await second.page.screenshot({ path: join(screenshots, nativeTurns ? 'conversation-native-navigation.png' : 'conversation-navigation.png') })
  }
  const inputScroll = second.page.locator('[data-input-scroll]')
  await inputScroll.hover()
  await second.page.mouse.wheel(0, 900)
  await second.page.waitForTimeout(250)
  const afterWheel = await conversationGeometry(second.page)
  assert.ok(afterWheel.scrollTop >= beforeWheel.scrollTop + 400, JSON.stringify({ beforeWheel, afterWheel }))
  assert.ok(Math.abs(afterWheel.composer.top - beforeWheel.composer.top) <= 2, JSON.stringify({ beforeWheel, afterWheel }))
  assert.ok(Math.abs(afterWheel.composer.bottom - beforeWheel.composer.bottom) <= 2, JSON.stringify({ beforeWheel, afterWheel }))
  assert.equal(afterWheel.inputScrollTop, beforeWheel.inputScrollTop)

  await second.page.evaluate(() => {
    const scroll = document.querySelector('[data-conversation-scroll]')
    if (!(scroll instanceof HTMLElement)) throw new Error('conversation scroll unavailable')
    scroll.scrollTop = 0
  })
  await second.page.waitForTimeout(200)
  let dark
  if (nativeTurns) {
    const rail = second.page.getByRole('navigation', { name: '轮次导航', exact: true })
    assert.equal(await rail.getByRole('button').count(), messageCount, 'native rail includes every real turn')
    for (const turn of [2, 3, 2, 20, 1]) {
      const mark = rail.getByRole('button', { name: `跳转到第 ${turn} 轮`, exact: true })
      await mark.focus()
      await mark.press('Enter')
      await second.page.waitForFunction(turn => document.querySelector(`nav[aria-label="轮次导航"] button[aria-label="跳转到第 ${turn} 轮"]`)?.getAttribute('aria-current') === 'true', turn)
      assert.equal(await second.page.locator('[data-dsh-turn-navigator]').count(), 0, 'fallback stays unmounted during native navigation')
    }
    await second.page.getByRole('button', { name: '回到底部', exact: true }).click()
    await second.page.waitForFunction(() => {
      const scroll = document.querySelector('[data-conversation-scroll]')
      return scroll instanceof HTMLElement && scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 40
    })
    await second.page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''))
    assert.equal(await rail.isVisible(), true, 'native navigation remains visible in dark mode')
    assert.equal(await rail.getByRole('button').count(), messageCount)
    assert.equal(await second.page.locator('[data-dsh-turn-navigator]').count(), 0)
    const nativeWindow = await activeApp.browserWindow(second.page)
    // Native-default layout no longer spends 260px on a legacy Explorer.
    // Narrow the actual conversation, not a window size that used to imply it.
    await nativeWindow.evaluate(window => window.setSize(1000, 820))
    await second.page.waitForFunction(() => document.querySelector('[data-pane="conversation"]')?.getBoundingClientRect().width < 800)
    assert.equal(await rail.isVisible(), false, 'DSH hides its native rail in a narrow container')
    assert.equal(await second.page.locator('[data-dsh-turn-navigator]').count(), 0, 'narrow Desktop stays free of the removed pager')
    await second.page.evaluate(() => { document.querySelector('[data-conversation-scroll]').scrollTop = 0 })
    await nativeBottom.waitFor({ state: 'visible' })
    await nativeBottom.click()
    await second.page.waitForFunction(() => {
      const scroll = document.querySelector('[data-conversation-scroll]')
      return scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 40
    })

    await nativeWindow.evaluate(window => window.setSize(1700, 820))
    await rail.waitFor({ state: 'visible' })
    await second.page.locator('[data-dsh-turn-navigator]').waitFor({ state: 'detached' })
  } else {
    // User-requested removal: the legacy floating pager is not a Desktop
    // navigation owner. Its standalone-web behavior remains in Vitest.
    // Check the actual replacement contract: scroll, native bottom, and no
    // overlay even when opening menus or switching color schemes.
    await nativeBottom.click()
    await second.page.waitForFunction(() => {
      const scroll = document.querySelector('[data-conversation-scroll]')
      return scroll instanceof HTMLElement && scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 40
    })
    await second.page.getByRole('button', { name: /工具|Tools/u }).click()
    assert.equal(await second.page.locator('[data-dsh-turn-navigator]').count(), 0)
    await second.page.keyboard.press('Escape')
    dark = await assertDarkReadability(second.page)
  }
  // The brand logo also has this accessible name; choose the explicit action.
  await second.page.getByRole('button', { name: '新建会话', exact: true }).filter({ hasText: '新会话' }).click()
  try {
    await second.page.waitForFunction(() => document.querySelectorAll('[data-chat-flow-kind="user"]').length === 0)
  } catch (error) {
    console.error('new-session roundtrip diagnostic', await second.page.evaluate(() => ({
      panes: [...document.querySelectorAll('[data-pane="conversation"]')].map(pane => ({
        bounds: pane.getBoundingClientRect().toJSON(),
        users: pane.querySelectorAll('[data-chat-flow-kind="user"]').length,
        text: pane.textContent.slice(-1_500),
      })),
      dialogs: [...document.querySelectorAll('[role="dialog"]')].map(dialog => dialog.textContent.slice(0, 1_000)),
      selected: [...document.querySelectorAll('[role="treeitem"][aria-selected="true"]')].map(item => item.textContent),
    })))
    if (process.env.DSH_DESKTOP_DOCK_SCREENSHOTS) {
      await second.page.screenshot({ path: join(resolve(process.env.DSH_DESKTOP_DOCK_SCREENSHOTS), 'new-session-roundtrip-failure.png') })
    }
    throw error
  }
  await second.page.locator('[data-dsh-turn-navigator]').waitFor({ state: 'detached' })
  await second.page.locator('[data-dsh-live-stats]').waitFor({ state: 'detached' })
  await openSeededSession(second.page, sessionId)
  assert.equal(await turns.count(), messageCount, 'history remains navigable after leaving for an empty session')
  if (nativeTurns) {
    await second.page.locator('[data-dsh-live-stats]').waitFor({ state: 'visible' })
    assert.match(await second.page.locator('[data-dsh-live-stats] summary').innerText(), /^≈¥[\d.,]+ · 明细$/u)
  }
  if (process.argv.includes('--native-tabs')) {
    const { verifyNativeBrowserSessionIsolation } = await import('./native-browser-session-fixture.mjs')
    await verifyNativeBrowserSessionIsolation({ page: second.page, rpc, sessionId, workspacePath, logPath, openSeededSession })
  }
  assert.deepEqual(second.rendererErrors, [])
  const seriousConsole = second.rendererConsole.filter(line => !/favicon|DevTools|style-src 'self'|Electron Security Warning/iu.test(line))
  assert.deepEqual(seriousConsole, [])

  if (process.argv.includes('--mode-switch')) {
    const { verifyModeSwitchLifecycle } = await import('./mode-switch-lifecycle-fixture.mjs')
    await verifyModeSwitchLifecycle({ page: second.page, rpc, sessionId, workspaceId,
      workspacePath, messageCount, logPath, openSeededSession })
    await activeApp.close()
    activeApp = undefined
    assert.deepEqual(second.rendererErrors, [], 'mode switching must not introduce renderer exceptions')
    assert.deepEqual(second.rendererConsole.filter(line =>
      !/favicon|DevTools|style-src 'self'|Electron Security Warning/iu.test(line)), [],
    'mode switching and shutdown must not introduce unexpected console errors')
  }

  console.log(JSON.stringify({
    mode: packagedExecutable === undefined ? 'development-electron' : 'packaged-electron',
    sessionId,
    logPath,
    restoredTurns: messageCount,
    emptyConversationHasNoCompatibilityNavigation: true,
    wheelForwardedFromInput: true,
    composerStayedFixed: true,
    nativeTurnNavigation: nativeTurns,
    nativeBackToBottom: true,
    desktopFloatingPagerRemoved: true,
    nativeBottomActionDeduplicated: true,
    emptySessionRoundTrip: true,
    nativeStatsSupplement: nativeTurns,
    navigationOwner: 'native-dsh',
    darkSidebarContrast: dark ? Number(dark.contrast.toFixed(2)) : undefined,
    sidebarRowsOverlap: dark ? false : undefined,
  }, null, 2))
} catch (error) {
  console.error('conversation lifecycle failure diagnostics', JSON.stringify(activeDiagnostics))
  throw error
} finally {
  await activeApp?.close()
  await rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })
}
