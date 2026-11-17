import assert from 'node:assert/strict'

// Shared with the cold-session startup benchmark: a deep link alone does not
// expand the rc3 workspace tree or prove that the intended session is selected.
export async function reopenNativeSession({ page, workspaceId, sessionId, listSessions, timeoutMs = 30000 }) {
  const listed = await listSessions()
  assert.ok(listed.items?.some(item => (item.id ?? item.sessionId) === sessionId),
    'Retained session must remain in the official session list')
  const group = page.locator(`[role="treeitem"][data-row-key="workspace:${workspaceId}"]`)
  await group.waitFor({ state: 'visible', timeout: timeoutMs })
  if (await group.getAttribute('aria-expanded') !== 'true') await group.click()
  const row = page.locator(`[role="treeitem"][data-row-key="session:${sessionId}"]`)
  await row.waitFor({ state: 'visible', timeout: timeoutMs })
  if (await row.getAttribute('aria-selected') !== 'true') await row.click()
  await page.locator(`[data-row-key="session:${sessionId}"][aria-selected="true"]`)
    .waitFor({ state: 'visible', timeout: timeoutMs })
}
