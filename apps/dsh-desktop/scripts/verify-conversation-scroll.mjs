import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { appendFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'

import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const mainEntry = resolve(appDir, 'src', 'main.mjs')
const configuredExecutable = process.env.DSH_DESKTOP_E2E_EXECUTABLE
const packagedExecutable = configuredExecutable === undefined ? undefined : resolve(configuredExecutable)
if (packagedExecutable !== undefined && !existsSync(packagedExecutable)) {
  throw new Error(`DSH_DESKTOP_E2E_EXECUTABLE does not exist: ${packagedExecutable}`)
}

const temporary = await mkdtemp(join(tmpdir(), 'dsh-conversation-scroll-e2e-'))
const userData = join(temporary, 'user-data')
const dshHome = join(temporary, 'dsh-home')
const workspacePath = join(temporary, 'conversation-scroll-workspace')
const profileDir = join(dshHome, 'profiles', 'desktop')
const runtimeReadyTimeoutMs = process.env.CI ? 180_000 : 120_000
const messageCount = 20
let activeApp

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
  const page = await instance.firstWindow()
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
    await page.waitForSelector('style[data-plugin="@linxin666/dsh-web-ui-all"]', {
      state: 'attached',
      timeout: runtimeReadyTimeoutMs,
    })
    await dismissStartup(page)
  } catch (error) {
    const runtimeLog = await readFile(join(userData, 'logs', 'runtime.log'), 'utf8').catch(() => '')
    console.error(`runtime did not become ready; recent log:\n${runtimeLog.slice(-8_000) || '(no runtime log)'}`)
    throw error
  }
  return { instance, page, rendererErrors, rendererConsole }
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
  for (let index = 1; index <= messageCount; index += 1) {
    session.append('user/message', createUserMessage({
      content: [{
        type: 'text',
        text: `G02.5 turn ${String(index).padStart(2, '0')}\n${'Long conversation viewport evidence. '.repeat(14)}`,
      }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })
  }
  const appended = session.events.slice(existingEvents.length)
  assert.equal(appended.length, messageCount + 1)
  await appendFile(logPath, `${appended.map(event => JSON.stringify(event)).join('\n')}\n`)
  return logPath
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

async function navigatorState(page) {
  return page.evaluate(() => {
    const scroll = document.querySelector('[data-conversation-scroll]')
    const turns = [...document.querySelectorAll('[data-chat-flow-kind="user"]')]
    const nav = document.querySelector('[data-dsh-turn-navigator]')
    const counter = nav?.querySelector('[data-role="counter"]')
    if (!(scroll instanceof HTMLElement) || !(nav instanceof HTMLElement) || !(counter instanceof HTMLElement)) {
      throw new Error('conversation navigator is unavailable')
    }
    const scrollRect = scroll.getBoundingClientRect()
    return {
      counter: counter.textContent,
      scrollTop: scroll.scrollTop,
      scrollHeight: scroll.scrollHeight,
      clientHeight: scroll.clientHeight,
      turnOffsets: turns.map(turn => turn.getBoundingClientRect().top - scrollRect.top - scroll.clientTop),
      nextDisabled: nav.querySelector('[data-role="next"]')?.disabled,
      bottomDisabled: nav.querySelector('[data-role="bottom"]')?.disabled,
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
    const counter = document.querySelector('[data-dsh-turn-navigator] [data-role="counter"]')
    const navigator = document.querySelector('[data-dsh-turn-navigator]')
    const button = navigator?.querySelector('button')
    if (!(counter instanceof HTMLElement) || !(navigator instanceof HTMLElement) || !(button instanceof HTMLElement)) {
      throw new Error('navigator counter or button is unavailable')
    }
    const style = getComputedStyle(counter)
    const navigatorStyle = getComputedStyle(navigator)
    const buttonStyle = getComputedStyle(button)
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
      contrast: contrast(style.color, style.backgroundColor),
      color: style.color,
      background: style.backgroundColor,
      navigatorPosition: navigatorStyle.position,
      buttonWidth: buttonStyle.width,
      buttonHeight: buttonStyle.height,
      overlaps,
    }
  })
  assert.ok(state.contrast >= 3, `dark navigator counter contrast is too low: ${JSON.stringify(state)}`)
  assert.equal(state.navigatorPosition, 'absolute', JSON.stringify(state))
  assert.equal(state.buttonWidth, '32px', JSON.stringify(state))
  assert.equal(state.buttonHeight, '32px', JSON.stringify(state))
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
  assert.deepEqual(first.rendererErrors, [])
  await activeApp.close()
  activeApp = undefined

  const logPath = await seedConversationLog(sessionId)

  const second = await launch()
  activeApp = second.instance
  await openSeededSession(second.page, sessionId)
  const turns = second.page.locator('[data-chat-flow-kind="user"]')
  assert.equal(await turns.count(), messageCount)
  assert.match(await turns.first().innerText(), /G02\.5 turn 01/u)
  assert.match(await turns.last().innerText(), /G02\.5 turn 20/u)

  await second.page.evaluate(() => {
    const scroll = document.querySelector('[data-conversation-scroll]')
    const inputScroll = document.querySelector('[data-input-scroll]')
    if (!(scroll instanceof HTMLElement) || !(inputScroll instanceof HTMLElement)) throw new Error('scroll elements unavailable')
    scroll.scrollTop = 0
    inputScroll.scrollTop = inputScroll.scrollHeight
  })
  await second.page.waitForTimeout(200)
  const beforeWheel = await conversationGeometry(second.page)
  assert.ok(beforeWheel.scrollHeight > beforeWheel.scrollClientHeight * 2, JSON.stringify(beforeWheel))
  assert.ok(beforeWheel.composer.top >= beforeWheel.scrollRect.top, JSON.stringify(beforeWheel))
  assert.ok(beforeWheel.composer.bottom <= beforeWheel.viewportHeight + 2, JSON.stringify(beforeWheel))

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
  assert.equal((await navigatorState(second.page)).counter, `1/${messageCount}`)

  await second.page.locator('[data-dsh-turn-navigator] [data-role="next"]').click()
  await second.page.waitForFunction(expected => document.querySelector('[data-dsh-turn-navigator] [data-role="counter"]')?.textContent === expected, `2/${messageCount}`)
  await second.page.waitForTimeout(450)
  let navigation = await navigatorState(second.page)
  assert.ok(Math.abs(navigation.turnOffsets[1] - 60) <= 5, JSON.stringify(navigation))

  await second.page.locator('[data-dsh-turn-navigator] [data-role="next"]').click()
  await second.page.waitForFunction(expected => document.querySelector('[data-dsh-turn-navigator] [data-role="counter"]')?.textContent === expected, `3/${messageCount}`)
  await second.page.locator('[data-dsh-turn-navigator] [data-role="prev"]').click()
  await second.page.waitForFunction(expected => document.querySelector('[data-dsh-turn-navigator] [data-role="counter"]')?.textContent === expected, `2/${messageCount}`)
  await second.page.waitForTimeout(450)
  navigation = await navigatorState(second.page)
  assert.ok(Math.abs(navigation.turnOffsets[1] - 60) <= 5, JSON.stringify(navigation))

  await second.page.locator('[data-dsh-turn-navigator] [data-role="bottom"]').click()
  await second.page.waitForFunction(() => {
    const scroll = document.querySelector('[data-conversation-scroll]')
    return scroll instanceof HTMLElement && scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 40
  })
  navigation = await navigatorState(second.page)
  assert.equal(navigation.counter, `${messageCount}/${messageCount}`)
  assert.equal(navigation.bottomDisabled, true)

  const dark = await assertDarkReadability(second.page)
  assert.deepEqual(second.rendererErrors, [])
  const seriousConsole = second.rendererConsole.filter(line => !/favicon|DevTools|style-src 'self'|Electron Security Warning/iu.test(line))
  assert.deepEqual(seriousConsole, [])

  console.log(JSON.stringify({
    mode: packagedExecutable === undefined ? 'development-electron' : 'packaged-electron',
    sessionId,
    logPath,
    restoredTurns: messageCount,
    wheelForwardedFromInput: true,
    composerStayedFixed: true,
    navigatorPreviousNextAndBottom: true,
    darkCounterContrast: Number(dark.contrast.toFixed(2)),
    sidebarRowsOverlap: false,
  }, null, 2))
} finally {
  await activeApp?.close()
  await rm(temporary, { recursive: true, force: true })
}
