import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'

// Runs against the real loaded client and an isolated durable conversation.
// Only the first create response is fault-injected; successful mode selection
// uses the real Host, workspace, preset composition and session persistence.
export async function verifyModeSwitchLifecycle({ page, rpc, sessionId, workspaceId,
  workspacePath, messageCount, logPath, openSeededSession }) {
  async function roster() {
    const response = await page.evaluate(async rpcId => {
      const result = await fetch('/api/agentPresets/list', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId,
          method: 'agentPresets/list', payload: { args: {} } }),
      })
      return { status: result.status, body: await result.json() }
    }, randomUUID())
    assert.equal(response.status, 200)
    assert.equal(response.body?.result?.ok, true, JSON.stringify(response.body))
    return response.body.result.value.presets
  }

  const beforeRoster = await roster()
  const originalDefault = beforeRoster.find(preset => preset.isDefault)?.id
  assert.equal(typeof originalDefault, 'string', 'the original default must be known')
  const before = (await rpc(page, 'session.list', {})).items
  const original = before.find(item => (item.id ?? item.sessionId) === sessionId)
  assert.ok(original)
  assert.equal(original.blank, false)
  const originalPreset = original.projections?.values?.agentPreset ?? original.agentPreset
  const target = beforeRoster.find(preset => preset.id === 'minimal' && !preset.broken
    && preset.id !== originalPreset)
  assert.ok(target, 'the shipped minimal mode must be available for the standard history fixture')
  const originalHistory = await readFile(logPath, 'utf8')
  const switcher = page.locator('[data-dsh-mode-switcher="true"]')
  const trigger = switcher.getByRole('button', { name: /当前模式/u })
  try {
    await trigger.waitFor({ state: 'visible', timeout: 15_000 })
  } catch (error) {
    console.error('mode-switch entry diagnostic', JSON.stringify({
      legacyPreset: original.agentPreset,
      projectedPreset: original.projections?.values?.agentPreset,
      availablePresetIds: beforeRoster.filter(preset => !preset.broken).map(preset => preset.id),
      renderedSwitchers: await switcher.count(),
    }))
    throw error
  }

  async function selectTarget(preset = target) {
    await trigger.click()
    await switcher.getByRole('option').filter({ hasText: preset.name ?? preset.id }).click()
  }

  const failureMessage = 'mode-switch-create-failure-fixture'
  let rejectedCreates = 0
  const requestPaths = []
  const noteRequest = request => {
    if (request.method() === 'POST' && request.url().startsWith(new URL(page.url()).origin)) {
      requestPaths.push(new URL(request.url()).pathname)
      if (requestPaths.length > 12) requestPaths.shift()
    }
  }
  const createRoute = '**/api/session/create'
  const rejectCreate = async route => {
    assert.equal(route.request().method(), 'POST')
    const request = route.request().postDataJSON()
    rejectedCreates += 1
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      type: 'server-response', rpcId: request.rpcId, method: request.method,
      result: { ok: false, error: { code: 'gateway/internal', message: failureMessage, details: {} } },
    }) })
  }
  await page.route(createRoute, rejectCreate)
  page.on('request', noteRequest)
  try {
    await selectTarget()
    try {
      await page.waitForFunction(message => document.querySelector('[data-dsh-mode-switcher]')
        ?.getAttribute('title')?.includes(message), failureMessage)
    } catch (error) {
      console.error('mode-switch rejection diagnostic', JSON.stringify({
        rejectedCreates, requestPaths, title: await switcher.getAttribute('title'),
        renderedUsers: await page.locator('[data-chat-flow-kind="user"]').count(),
        enabled: await trigger.isEnabled(),
      }))
      throw error
    }
    assert.equal(rejectedCreates, 1, 'one user choice must issue one create')
    assert.equal(await trigger.isEnabled(), true, 'failure must permit retry')
    assert.equal(await page.locator('[data-chat-flow-kind="user"]').count(), messageCount,
      'failed mode creation must leave the original history on screen')
    const afterFailure = (await rpc(page, 'session.list', {})).items
    assert.deepEqual(afterFailure.map(item => item.id ?? item.sessionId).sort(),
      before.map(item => item.id ?? item.sessionId).sort(), 'rejected create must not add sessions')
    assert.equal((await roster()).find(preset => preset.isDefault)?.id, originalDefault)
  } finally {
    await page.unroute(createRoute, rejectCreate)
    page.off('request', noteRequest)
  }

  const responsePromise = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/session/create'
      && response.request().method() === 'POST', { timeout: 30_000 })
  // Attach the rejection handler immediately so a click failure cannot leave
  // an unhandled response waiter; the original error still propagates below.
  responsePromise.catch(() => {})
  await selectTarget()
  const response = await responsePromise
  const request = response.request().postDataJSON()
  assert.equal(request.payload?.args?.request?.workspaceId, workspaceId)
  assert.equal(request.payload?.args?.request?.agentPreset, target.id)
  const created = await response.json()
  assert.equal(created.result?.ok, true, JSON.stringify(created))
  const createdId = created.result.value.sessionId
  assert.notEqual(createdId, sessionId)
  await page.waitForFunction(() => document.querySelectorAll('[data-chat-flow-kind="user"]').length === 0)
  // Blank conversations use the official hero picker, not the history-only
  // desktop header action. Verify the real native seat's target label.
  const nativePreset = page.getByRole('button', { name: target.name ?? target.id, exact: true })
    .and(page.locator('[aria-haspopup="menu"]'))
  await nativePreset.waitFor({ state: 'visible', timeout: 15_000 })
  const after = (await rpc(page, 'session.list', {})).items
  const newSession = after.find(item => (item.id ?? item.sessionId) === createdId)
  assert.equal(newSession?.cwd, workspacePath, 'mode selection must not cross workspaces')
  assert.equal(newSession?.projections?.values?.agentPreset ?? newSession?.agentPreset, target.id)
  assert.equal(after.find(item => (item.id ?? item.sessionId) === sessionId)?.blank, false)
  assert.equal((await roster()).find(preset => preset.isDefault)?.id, originalDefault)
  await openSeededSession(page, sessionId)
  assert.equal(await page.locator('[data-chat-flow-kind="user"]').count(), messageCount)
  assert.equal(await readFile(logPath, 'utf8'), originalHistory, 'switching must not rewrite original history')
  const customModes = []
  for (const id of ['liangshen', 'value-mode']) {
    const preset = (await roster()).find(item => item.id === id)
    assert.ok(preset && !preset.broken, `${id} must be available in the shipped mode menu`)
    const pending = page.waitForResponse(response => new URL(response.url()).pathname === '/api/session/create'
      && response.request().method() === 'POST', { timeout: 30_000 })
    pending.catch(() => {})
    await selectTarget(preset)
    const response = await pending
    assert.equal(response.request().postDataJSON().payload?.args?.request?.agentPreset, id)
    const body = await response.json()
    assert.equal(body.result?.ok, true, `${id}: ${JSON.stringify(body)}`)
    assert.notEqual(body.result.value.sessionId, sessionId)
    await page.getByRole('button', { name: preset.name ?? id, exact: true })
      .and(page.locator('[aria-haspopup="menu"]')).waitFor({ state: 'visible', timeout: 15_000 })
    assert.equal((await roster()).find(item => item.isDefault)?.id, originalDefault)
    await openSeededSession(page, sessionId)
    assert.equal(await page.locator('[data-chat-flow-kind="user"]').count(), messageCount)
    assert.equal(await readFile(logPath, 'utf8'), originalHistory)
    customModes.push(id)
  }
  console.log(JSON.stringify({ modeSwitch: { failedCreatePreservesView: true,
    retryCreatesInOriginalWorkspace: true, originalHistoryUnchanged: true,
    originalDefaultRestored: true, customModes, sourceSessionId: sessionId, targetSessionId: createdId } }))
}
