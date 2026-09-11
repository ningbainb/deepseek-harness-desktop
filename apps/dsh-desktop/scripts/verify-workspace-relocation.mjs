import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { appendFile, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'

import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import { waitForSessionLog } from './session-log-fixture.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const mainEntry = resolve(appDir, 'src', 'main.mjs')
const configuredExecutable = process.env.DSH_DESKTOP_E2E_EXECUTABLE
const packagedExecutable = configuredExecutable === undefined ? undefined : resolve(configuredExecutable)
if (packagedExecutable !== undefined && !existsSync(packagedExecutable)) {
  throw new Error(`DSH_DESKTOP_E2E_EXECUTABLE does not exist: ${packagedExecutable}`)
}

const temporary = await realpath(await mkdtemp(join(tmpdir(), 'dsh-workspace-relocation-e2e-')))
const userData = join(temporary, 'user-data')
const dshHome = join(temporary, 'dsh-home')
const oldPath = join(temporary, 'project-before-move')
const newPath = join(temporary, 'project-after-move')
const recreatedOldPath = join(temporary, 'project-before-move.runtime-recreated')
const invalidFilePath = join(temporary, 'not-a-directory.txt')
const profileDir = join(dshHome, 'profiles', 'desktop')
const runtimeReadyTimeoutMs = process.env.CI ? 180_000 : 120_000
const historyMarker = 'G08 retained history after directory relocation'
const originalTitle = 'G08 original workspace history'
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
  const instance = await electron.launch({
    executablePath: packagedExecutable ?? electronPath,
    args: packagedExecutable === undefined ? [mainEntry] : [],
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
  page.on('pageerror', error => rendererErrors.push(error.message))
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
  return { instance, page, rendererErrors }
}

async function rpcResult(page, method, payload) {
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
  return response.body.result
}

async function rpc(page, method, payload) {
  const result = await rpcResult(page, method, payload)
  assert.equal(result?.ok, true, `${method}: ${JSON.stringify(result)}`)
  return result.value
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

async function seedHistory(sessionId) {
  const logs = await collectFiles(join(dshHome, 'sessions'), '.jsonl')
  assert.equal(logs.length, 1, `expected one session log, found ${JSON.stringify(logs)}`)
  const logPath = logs[0]
  const lines = (await readFile(logPath, 'utf8')).trimEnd().split(/\r?\n/u)
  const header = JSON.parse(lines[0])
  assert.equal(header.id, sessionId)
  assert.equal(header.cwd, oldPath)
  const existingEvents = lines.slice(1).filter(Boolean).map(line => JSON.parse(line))
  const session = Session.create(SessionId(sessionId), existingEvents)
  session.append('turn/start', { turn: 1 })
  session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: historyMarker }],
    source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  const appended = session.snapshotEvents().slice(existingEvents.length)
  await appendFile(logPath, `${appended.map(event => JSON.stringify(event)).join('\n')}\n`)
}

async function renameWhenReleased(source, destination, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      await rename(source, destination)
      return
    } catch (error) {
      if ((error?.code !== 'EPERM' && error?.code !== 'EBUSY') || Date.now() >= deadline) throw error
      await new Promise(resolveWait => setTimeout(resolveWait, 250))
    }
  }
}

try {
  await mkdir(profileDir, { recursive: true })
  await mkdir(oldPath, { recursive: true })
  await writeFile(join(oldPath, 'project-sentinel.txt'), 'workspace relocation sentinel\n')
  await writeFile(invalidFilePath, 'not a directory\n')
  await writeFile(join(profileDir, 'cordis.patch.yml'), [
    '- id: session-persistence-jsonl',
    '  config:',
    "    root: !!js dshHomePath('sessions')",
    '    compression: none',
    '',
  ].join('\n'))

  const first = await launch()
  activeApp = first.instance
  const missingResult = await rpcResult(first.page, 'workspace.create', { path: newPath })
  assert.equal(missingResult?.ok, false)
  assert.equal(missingResult?.error?.code, 'workspace/invalid-path', JSON.stringify(missingResult))
  const fileResult = await rpcResult(first.page, 'workspace.create', { path: invalidFilePath })
  assert.equal(fileResult?.ok, false)
  assert.equal(fileResult?.error?.code, 'workspace/invalid-path', JSON.stringify(fileResult))

  const oldCreation = await rpc(first.page, 'workspace.create', { path: oldPath })
  assert.equal(oldCreation.created, true)
  const oldWorkspaceId = oldCreation.workspace.workspaceId
  const oldSession = await rpc(first.page, 'session.create', { workspaceId: oldWorkspaceId })
  const oldSessionId = oldSession.sessionId
  assert.equal(typeof oldSessionId, 'string')
  await rpc(first.page, 'session.rename', { sessionId: oldSessionId, title: originalTitle })
  assert.deepEqual(first.rendererErrors, [])
  await waitForSessionLog(join(dshHome, 'sessions'), oldSessionId)
  await activeApp.close()
  activeApp = undefined

  await seedHistory(oldSessionId)

  const selection = await launch()
  activeApp = selection.instance
  const selectionSessions = await rpc(selection.page, 'session.list', {})
  const seededSummary = selectionSessions.items.find(item => item.sessionId === oldSessionId)
  assert.ok(seededSummary, 'seeded Session is missing from the list')
  assert.equal(seededSummary.blank, false, 'seeded Session was still classified as blank')
  const oldGroup = selection.page.getByRole('treeitem').filter({ hasText: basename(oldPath) }).first()
  await oldGroup.waitFor({ state: 'visible', timeout: 15_000 })
  if (await oldGroup.getAttribute('aria-expanded') !== 'true') await oldGroup.click({ force: true })
  const history = selection.page.getByText(historyMarker, { exact: true })
  if (!await history.isVisible().catch(() => false)) {
    const originalSession = selection.page.locator('[role="treeitem"]')
      .filter({ hasText: originalTitle })
      .first()
    try {
      await originalSession.waitFor({ state: 'visible', timeout: 15_000 })
      await originalSession.click({ force: true })
    } catch (error) {
      const tree = await selection.page.locator('[role="treeitem"]').evaluateAll(rows => rows.map(row => ({
        selected: row.getAttribute('aria-selected'),
        text: row.textContent?.trim(),
      })))
      console.error(JSON.stringify({ selectionSessions, tree }, null, 2))
      throw error
    }
  }
  await history.waitFor({ state: 'visible', timeout: 15_000 })
  assert.deepEqual(selection.rendererErrors, [])
  await activeApp.close()
  activeApp = undefined

  await renameWhenReleased(oldPath, newPath)
  assert.equal(existsSync(oldPath), false)
  assert.equal(existsSync(join(newPath, 'project-sentinel.txt')), true)

  const second = await launch()
  activeApp = second.instance
  await second.page.getByText(historyMarker, { exact: true }).waitFor({ state: 'visible', timeout: 15_000 })
  const interruptedOld = second.page.getByRole('treeitem').filter({ hasText: basename(oldPath) }).first()
  await interruptedOld.waitFor({ state: 'visible', timeout: 15_000 })

  const newCreation = await rpc(second.page, 'workspace.create', { path: newPath })
  assert.equal(newCreation.created, true)
  const newWorkspaceId = newCreation.workspace.workspaceId
  assert.notEqual(newWorkspaceId, oldWorkspaceId)
  assert.equal(newCreation.workspace.path, newPath)
  const repeatedCreation = await rpc(second.page, 'workspace.create', { path: newPath })
  assert.equal(repeatedCreation.created, false)
  assert.equal(repeatedCreation.workspace.workspaceId, newWorkspaceId)

  const newSession = await rpc(second.page, 'session.create', { workspaceId: newWorkspaceId })
  const sessionList = await rpc(second.page, 'session.list', {})
  const newSummary = sessionList.items.find(item => item.sessionId === newSession.sessionId)
  const oldSummary = sessionList.items.find(item => item.sessionId === oldSessionId)
  assert.equal(newSummary?.cwd, newPath, 'new Session did not use the relocated directory')
  assert.equal(oldSummary?.cwd, oldPath, 'old Session cwd was silently rewritten')

  const forbiddenRebind = await rpcResult(second.page, 'workspace.insertSessionBefore', {
    workspaceId: newWorkspaceId,
    sessionId: oldSessionId,
  })
  assert.equal(forbiddenRebind?.ok, false)
  assert.equal(forbiddenRebind?.error?.code, 'workspace/move-invalid', JSON.stringify(forbiddenRebind))
  await second.page.getByText(historyMarker, { exact: true }).waitFor({ state: 'visible', timeout: 15_000 })
  assert.deepEqual(second.rendererErrors, [])
  await activeApp.close()
  activeApp = undefined

  if (existsSync(oldPath)) {
    assert.equal(existsSync(join(oldPath, 'project-sentinel.txt')), false, 'the moved project data unexpectedly returned before rollback')
    await renameWhenReleased(oldPath, recreatedOldPath)
  }
  await renameWhenReleased(newPath, oldPath)
  assert.equal(existsSync(join(oldPath, 'project-sentinel.txt')), true)
  assert.equal(existsSync(newPath), false)

  const third = await launch()
  activeApp = third.instance
  await third.page.getByText(historyMarker, { exact: true }).waitFor({ state: 'visible', timeout: 15_000 })
  const restoredOld = third.page.getByRole('treeitem').filter({ hasText: basename(oldPath) }).first()
  await restoredOld.waitFor({ state: 'visible', timeout: 15_000 })
  const restoredSessions = await rpc(third.page, 'session.list', {})
  assert.equal(restoredSessions.items.find(item => item.sessionId === oldSessionId)?.cwd, oldPath)
  assert.equal(restoredSessions.items.find(item => item.sessionId === newSession.sessionId)?.cwd, newPath)

  const oldIdempotent = await rpc(third.page, 'workspace.create', { path: oldPath })
  assert.equal(oldIdempotent.created, false)
  assert.equal(oldIdempotent.workspace.workspaceId, oldWorkspaceId)
  await rpc(third.page, 'workspace.delete', { workspaceId: newWorkspaceId })
  await third.page.getByRole('treeitem').filter({ hasText: basename(newPath) }).first()
    .waitFor({ state: 'hidden', timeout: 15_000 })
  const finalSessions = await rpc(third.page, 'session.list', {})
  assert.equal(finalSessions.items.some(item => item.sessionId === oldSessionId), true)
  assert.equal(finalSessions.items.some(item => item.sessionId === newSession.sessionId), true)
  await third.page.getByText(historyMarker, { exact: true }).waitFor({ state: 'visible', timeout: 15_000 })
  assert.deepEqual(third.rendererErrors, [])

  console.log(JSON.stringify({
    mode: packagedExecutable === undefined ? 'development' : 'packaged',
    oldWorkspaceId,
    newWorkspaceId,
    oldSessionId,
    newSessionId: newSession.sessionId,
    historyRetained: true,
    newSessionCwdVerified: true,
    rollbackRestoredMembership: true,
  }))
} finally {
  await activeApp?.close()
  await rm(temporary, { recursive: true, force: true })
}
