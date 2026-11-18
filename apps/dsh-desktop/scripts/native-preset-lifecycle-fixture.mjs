import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { desktopLocalPath } from '../src/desktop-remote-path.mjs'
import { prepareFreshNativeSession } from './native-session-blank-fixture.mjs'

const presetName = preset => preset.name ?? ({ standard: '标准模式', minimal: '极简模式', ptc: 'PTC 模式', cordis: '创造模式' }[preset.id] ?? preset.id)

export async function readNativePresetRoster(page) {
  const result = await page.evaluate(async rpcId => {
    const response = await fetch('/api/agentPresets/list', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId, method: 'agentPresets/list', payload: { args: {} } }) })
    return { status: response.status, body: await response.json() }
  }, randomUUID())
  assert.equal(result.status, 200); assert.equal(result.body.result?.ok, true)
  return result.body.result.value.presets
}

/** Use the existing official settings editor; never restore a chat switch. */
export async function verifyDesktopPresetSettings({ page, readRoster = () => readNativePresetRoster(page) }) {
  const before = await readRoster()
  await page.getByRole('button', { name: '账号菜单', exact: true }).click()
  await page.getByRole('menuitem', { name: /^设置/u }).click()
  const settings = page.locator('[role="dialog"].dsh-desktop-settings-window:visible')
  await settings.waitFor({ state: 'visible' })
  await settings.getByRole('button', { name: 'Agent 预设', exact: true }).click()
  const inspected = []
  try {
    await settings.getByRole('heading', { name: 'Agent 预设', exact: true }).waitFor()
    for (const id of ['liangshen', 'value-mode']) {
      const target = before.find(item => item.id === id && !item.broken)
      assert.ok(target, `${id} remains configured without enabling/disabling a preset`)
      const card = settings.locator(`[data-agent-preset-id="${id}"]`)
      await card.waitFor({ state: 'visible' })
      const action = card.getByRole('button', { name: `${target.isDefault ? '新任务默认' : '设为新任务默认'}: ${presetName(target)}`, exact: true })
      assert.equal(await action.count(), 1, 'the original default editor remains reachable')
      assert.equal(await action.isEnabled(), !target.isDefault)
      await card.getByRole('button', { name: `查看配置: ${presetName(target)}`, exact: true }).click()
      const viewer = page.getByRole('dialog', { name: `查看配置 · ${presetName(target)}`, exact: true })
      await viewer.waitFor({ state: 'visible' })
      assert.ok((await viewer.locator('pre').innerText()).trim(), 'the official editor reads actual preset configuration')
      await viewer.getByRole('button', { name: '关闭', exact: true }).last().click()
      await viewer.waitFor({ state: 'hidden' })
      assert.deepEqual(await readRoster(), before, 'viewing settings preserves all presets and the exact selected default')
      inspected.push(id)
    }
  } finally {
    await page.keyboard.press('Escape')
    await settings.waitFor({ state: 'hidden' })
  }
  return inspected
}

/** Desktop keeps failure/retry and history while preset management stays in Settings. */
export async function verifyNativePresetLifecycle({ page, rpc, sessionId, workspaceId, workspacePath,
  messageCount, logPath, openSeededSession, runtimeFetchGate, readWorkspace }) {
  const roster = () => readNativePresetRoster(page)
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
    await page.waitForFunction(() => document.querySelectorAll('[data-chat-flow-kind="user"]').length === 0)
    assert.equal(await page.locator('button[aria-haspopup="menu"][title="选择新任务使用的 Agent 预设"]').count(), 0,
      'Desktop does not expose the official inline preset switch after creating a blank session')
    const seats = (await rpc(page, 'session.list', {})).items
    const blank = seats.find(item => (item.id ?? item.sessionId) === createdId)
    assert.equal(blank?.cwd, workspacePath)
    assert.equal(blank?.blank, true)
    const presetBeforeSettings = blank?.projections?.values?.agentPreset ?? blank?.agentPreset
    const customModes = await verifyDesktopPresetSettings({ page, readRoster: roster })
    const afterSettings = (await rpc(page, 'session.list', {})).items.find(item => (item.id ?? item.sessionId) === createdId)
    assert.equal(afterSettings?.projections?.values?.agentPreset ?? afterSettings?.agentPreset, presetBeforeSettings,
      'opening the retained settings editor does not reset the current blank preset')
    assert.equal((await roster()).find(item => item.isDefault)?.id, originalDefault)
    await openSeededSession(page, sessionId)
    assert.equal(await page.locator('[data-chat-flow-kind="user"]').count(), messageCount)
    assert.equal(await readFile(logPath, 'utf8'), originalHistory)
    assert.deepEqual((await readSeats()).filter(item => item.id !== createdId), before)
    console.log(JSON.stringify({ nativePreset: { failedCreatePreservesView: true, retryCreatesInOriginalWorkspace: true,
      originalHistoryUnchanged: true, defaultUnchanged: true, customModes, createdId } }))
    return { expectedConsole }
  } finally { await restoreArchives() }
}
