import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { desktopLocalPath } from '../src/desktop-remote-path.mjs'
import { prepareFreshNativeSession } from './native-session-blank-fixture.mjs'

const presetName = preset => preset.name ?? ({ standard: '标准模式', minimal: '极简模式', ptc: 'PTC 模式', cordis: '创造模式' }[preset.id] ?? preset.id)

/** Desktop uses the official blank-session picker; history remains immutable. */
export async function verifyNativePresetLifecycle({ page, rpc, sessionId, workspaceId, workspacePath,
  messageCount, logPath, openSeededSession, runtimeFetchGate, readWorkspace }) {
  const roster = async () => {
    const result = await page.evaluate(async rpcId => {
      const response = await fetch('/api/agentPresets/list', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId, method: 'agentPresets/list', payload: { args: {} } }) })
      return { status: response.status, body: await response.json() }
    }, randomUUID())
    assert.equal(result.status, 200); assert.equal(result.body.result?.ok, true)
    return result.body.result.value.presets
  }
  const readSeats = async () => (await rpc(page, 'session.list', {})).items.map(item => ({
    id: item.id ?? item.sessionId, blank: item.blank, cwd: item.cwd,
  })).sort((a, b) => a.id.localeCompare(b.id))
  const before = await readSeats(), originalHistory = await readFile(logPath, 'utf8')
  const originalDefault = (await roster()).find(item => item.isDefault)?.id
  assert.equal(typeof originalDefault, 'string')
  assert.equal(before.find(item => item.id === sessionId)?.blank, false)
  assert.equal(await page.locator('[data-dsh-mode-switcher]').count(), 0, 'Desktop has no duplicate community header chooser')
  const restoreArchives = await prepareFreshNativeSession({ rpc, page, sessionId, workspacePath, readSeats, readWorkspace })
  const create = page.getByRole('button', { name: '新建会话', exact: true }).filter({ hasText: '新会话' })
  assert.equal(await create.count(), 1)
  const createResponse = response => desktopLocalPath(new URL(response.url()).pathname) === '/api/session/create'
    && response.request().method() === 'POST'
  const failureMessage = 'mode-switch-create-failure-fixture'
  const expectedConsole = []
  const onConsole = message => {
    if (message.type() === 'warning' && message.text().startsWith('new session failed:')
      && message.text().includes(failureMessage)) expectedConsole.push(`warning: ${message.text()}`)
  }
  try {
    await writeFile(runtimeFetchGate, 'reject-session-create')
    page.on('console', onConsole)
    try {
      const pending = page.waitForResponse(createResponse); pending.catch(() => {})
      await create.click()
      const response = await pending, rejected = await response.json()
      assert.equal(rejected.result?.ok, false)
      assert.equal(rejected.result?.error?.message, failureMessage)
      await page.getByText(failureMessage, { exact: false }).first().waitFor({ state: 'visible' })
      assert.deepEqual(await readSeats(), before, 'failed native creation keeps every original session')
      assert.equal(await page.locator('[data-chat-flow-kind="user"]').count(), messageCount)
      assert.equal(await create.isEnabled(), true, 'native creation permits retry')
      assert.equal((await roster()).find(item => item.isDefault)?.id, originalDefault)
      assert.equal(expectedConsole.length, 1, 'the native failure is reported exactly once')
    } finally {
      await writeFile(runtimeFetchGate, 'open')
      page.off('console', onConsole)
    }
    const pending = page.waitForResponse(createResponse); pending.catch(() => {})
    await create.click()
    const response = await pending, created = await response.json()
    assert.equal(created.result?.ok, true)
    assert.equal(response.request().postDataJSON().payload?.args?.request?.workspaceId, workspaceId)
    const createdId = created.result.value.sessionId
    assert.notEqual(createdId, sessionId)
    await page.locator(`[data-row-key="session:${createdId}"][aria-selected="true"]`).waitFor()
    await page.waitForFunction(() => document.querySelectorAll('[data-chat-flow-kind="user"]').length === 0)
    const picker = page.locator('button[aria-haspopup="menu"][title="选择新任务使用的 Agent 预设"]')
    await picker.waitFor({ state: 'visible' })
    const customModes = []
    for (const id of ['liangshen', 'value-mode']) {
      const target = (await roster()).find(item => item.id === id && !item.broken)
      assert.ok(target, `${id} remains available through the native preset owner`)
      await picker.click()
      // The official seat renders each option's name as an exact text span.
      // Do not depend on private Menu roles or generated CSS class names.
      const option = page.getByText(presetName(target), { exact: true }).filter({ visible: true })
      assert.equal(await option.count(), 1, 'the native menu exposes exactly one target preset')
      const selected = page.waitForResponse(candidate => desktopLocalPath(new URL(candidate.url()).pathname) === '/api/agentPresets/select'
        && candidate.request().method() === 'POST')
      selected.catch(() => {})
      await option.click()
      assert.equal((await (await selected).json()).result?.ok, true)
      await page.waitForFunction(name => [...document.querySelectorAll('button[aria-haspopup="menu"]')]
        .some(button => button.title === '选择新任务使用的 Agent 预设' && button.textContent?.includes(name)), presetName(target))
      const seats = (await rpc(page, 'session.list', {})).items
      const blank = seats.find(item => (item.id ?? item.sessionId) === createdId)
      assert.equal(blank?.cwd, workspacePath)
      assert.equal(blank?.projections?.values?.agentPreset ?? blank?.agentPreset, id)
      assert.equal(blank?.blank, true)
      assert.equal((await roster()).find(item => item.isDefault)?.id, originalDefault)
      customModes.push(id)
    }
    await openSeededSession(page, sessionId)
    assert.equal(await page.locator('[data-chat-flow-kind="user"]').count(), messageCount)
    assert.equal(await readFile(logPath, 'utf8'), originalHistory)
    assert.deepEqual((await readSeats()).filter(item => item.id !== createdId), before)
    console.log(JSON.stringify({ nativePreset: { failedCreatePreservesView: true, retryCreatesInOriginalWorkspace: true,
      originalHistoryUnchanged: true, defaultUnchanged: true, customModes, createdId } }))
    return { expectedConsole }
  } finally { await restoreArchives() }
}
