import assert from 'node:assert/strict'

// Shared with the cold-session startup benchmark: a deep link alone does not
// expand the rc3 workspace tree or prove that the intended session is selected.
export async function reopenNativeSession({ page, workspaceId, workspaceLabel, sessionId, sessionTitle, listSessions, timeoutMs = 30000 }) {
  const listed = await listSessions()
  assert.ok(listed.items?.some(item => (item.id ?? item.sessionId) === sessionId),
    'Retained session must remain in the official session list')
  const groupSelector = `[role="treeitem"][data-row-key="workspace:${workspaceId}"]`
  const group = page.locator(groupSelector)
  await group.waitFor({ state: 'visible', timeout: timeoutMs })
  if (await group.getAttribute('aria-expanded') !== 'true') {
    const label = workspaceLabel === undefined ? group : group.getByText(workspaceLabel, { exact: true })
    await label.click({ timeout: timeoutMs })
    await page.locator(groupSelector + '[aria-expanded="true"]').waitFor({ state: 'visible', timeout: timeoutMs })
  }
  const row = page.locator(`[role="treeitem"][data-row-key="session:${sessionId}"]`)
  await row.waitFor({ state: 'visible', timeout: timeoutMs })
  const title = sessionTitle === undefined ? row : row.getByText(sessionTitle, { exact: true })
  if (sessionTitle !== undefined) await title.waitFor({ state: 'visible', timeout: timeoutMs })
  if (await row.getAttribute('aria-selected') !== 'true') await title.click({ timeout: timeoutMs })
  await page.locator(`[data-row-key="session:${sessionId}"][aria-selected="true"]`)
    .waitFor({ state: 'visible', timeout: timeoutMs })
}
