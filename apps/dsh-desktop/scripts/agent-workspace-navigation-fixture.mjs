import assert from 'node:assert/strict'

async function selectCreatedSession(page, workspaceId, click, expectedSessionId) {
  const [createdResponse] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === '/api/session/create'
      && response.request().postDataJSON()?.payload?.args?.request?.workspaceId === workspaceId,
    { timeout: 30_000 }),
    click(),
  ])
  const request = createdResponse.request().postDataJSON()?.payload?.args?.request
  assert.equal(request?.sessionId, expectedSessionId, expectedSessionId === undefined
    ? 'fresh navigation must not name an existing blank session'
    : 'workspace reentry must request the exact original blank session')
  const createdEnvelope = await createdResponse.json()
  assert.equal(createdEnvelope.result?.ok, true)
  const sessionId = createdEnvelope.result.value.sessionId
  assert.equal(typeof sessionId, 'string')
  if (expectedSessionId !== undefined) assert.equal(sessionId, expectedSessionId,
    'workspace reentry must return the exact original blank session')
  await page.locator(`[role="treeitem"][data-row-key="session:${sessionId}"][aria-selected="true"]`)
    .waitFor({ state: 'visible', timeout: 30_000 })
  return sessionId
}

export async function createSessionInWorkspace(page, workspaceId) {
  const group = page.locator(`[role="treeitem"][data-row-key="workspace:${workspaceId}"]`)
  await group.waitFor({ state: 'visible', timeout: 30_000 })
  await group.hover()
  const newSession = group.locator('button').last()
  assert.match(await newSession.getAttribute('aria-label') ?? '', /会话|session/iu)
  return selectCreatedSession(page, workspaceId, () => newSession.click())
}

export async function reenterSessionInWorkspace(page, workspaceId, sessionId, workspacePath) {
  assert.equal(typeof sessionId, 'string')
  assert.ok(sessionId.length > 0)
  assert.equal(typeof workspacePath, 'string')
  assert.ok(workspacePath.length > 0)
  await page.getByRole('button', { name: /^(选择工作区|Choose workspace)$/iu }).click()
  const dialog = page.getByRole('dialog', { name: /^(选择工作区|Choose workspace)$/iu })
  await dialog.waitFor({ state: 'visible', timeout: 30_000 })
  const project = dialog.getByRole('region', { name: /^(已有项目|Existing projects)$/iu }).getByRole('button')
    .filter({ has: page.getByText(workspacePath, { exact: true }) })
  await project.click()
  return selectCreatedSession(page, workspaceId,
    () => dialog.getByRole('button', { name: /^(打开已有项目|Open existing project)$/iu }).click(), sessionId)
}
