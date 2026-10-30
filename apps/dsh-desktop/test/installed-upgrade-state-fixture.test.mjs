import assert from 'node:assert/strict'
import test from 'node:test'

test('installed-upgrade model fixture refuses invalid credentials and never reflects them', async context => {
  const { createInstalledUpgradeFixture } = await import('../scripts/installed-upgrade-state-fixture.mjs')
  const fixture = await createInstalledUpgradeFixture()
  context.after(() => fixture.close())
  const response = await fetch(fixture.baseURL + '/chat/completions', {
    method: 'POST', headers: { authorization: 'Bearer incorrect-synthetic-secret', 'content-type': 'application/json' },
    body: JSON.stringify({ model: fixture.modelId, messages: [] }),
  })
  assert.equal(response.status, 401)
  assert.doesNotMatch(await response.text(), /incorrect-synthetic-secret/u)
  assert.equal(fixture.requestEvidence().at(-1).authenticated, false)
  assert.doesNotMatch(JSON.stringify(fixture.requestEvidence()), /incorrect-synthetic-secret/u)
})

test('installed-upgrade chat proves the stored Key and original context reach the expected model', async context => {
  const { createInstalledUpgradeFixture } = await import('../scripts/installed-upgrade-state-fixture.mjs')
  const fixture = await createInstalledUpgradeFixture()
  context.after(() => fixture.close())
  fixture.expectChat({ phase: 'new-upgrade-A', prompt: 'Continue exact A', replyText: 'Retained A reply',
    originalUserText: 'Old A user', originalReplyText: 'Old A assistant' })
  const response = await fetch(fixture.baseURL + '/chat/completions', {
    method: 'POST', headers: { authorization: 'Bearer ' + fixture.keyValue, 'content-type': 'application/json' },
    body: JSON.stringify({ model: fixture.modelId, messages: [
      { role: 'user', content: 'Old A user' }, { role: 'assistant', content: [{ type: 'text', text: 'Old A assistant' }] },
      { role: 'user', content: 'Continue exact A' },
    ] }),
  })
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /text\/event-stream/u)
  const content = await response.text()
  assert.match(content, /Retained A reply/u)
  assert.match(content, /\[DONE\]/u)
  const evidence = fixture.requestEvidence().at(-1)
  assert.deepEqual({ authenticated: evidence.authenticated, modelMatches: evidence.modelMatches,
    promptMatches: evidence.promptMatches, originalUserPresent: evidence.originalUserPresent,
    originalReplyPresent: evidence.originalReplyPresent }, {
    authenticated: true, modelMatches: true, promptMatches: true, originalUserPresent: true, originalReplyPresent: true,
  })
  assert.equal(evidence.foreignContextPresent, false)
  assert.doesNotMatch(JSON.stringify(fixture.requestEvidence()), new RegExp(fixture.keyValue, 'u'))
})

test('a contextless authenticated request cannot certify the upgrade history', async context => {
  const { createInstalledUpgradeFixture } = await import('../scripts/installed-upgrade-state-fixture.mjs')
  const fixture = await createInstalledUpgradeFixture()
  context.after(() => fixture.close())
  fixture.expectChat({ phase: 'new-restart-A', prompt: 'Continue exact A', replyText: 'Reply',
    originalUserText: 'Old A user', originalReplyText: 'Old A assistant' })
  const response = await fetch(fixture.baseURL + '/chat/completions', {
    method: 'POST', headers: { authorization: 'Bearer ' + fixture.keyValue, 'content-type': 'application/json' },
    body: JSON.stringify({ model: fixture.modelId, messages: [{ role: 'user', content: 'Continue exact A' }] }),
  })
  await response.text()
  const evidence = fixture.requestEvidence().at(-1)
  assert.equal(evidence.authenticated, true)
  assert.equal(evidence.originalUserPresent, false)
  assert.equal(evidence.originalReplyPresent, false)
})

test('another session in the model context is detected even when all expected A history is present', async context => {
  const { createInstalledUpgradeFixture } = await import('../scripts/installed-upgrade-state-fixture.mjs')
  const fixture = await createInstalledUpgradeFixture()
  context.after(() => fixture.close())
  fixture.expectChat({ phase: 'new-upgrade-A', prompt: 'Continue A', replyText: 'Reply A',
    originalUserText: 'Old user A', originalReplyText: 'Old reply A',
    forbiddenTexts: ['Only user B', 'Only reply B'] })
  const response = await fetch(fixture.baseURL + '/chat/completions', {
    method: 'POST', headers: { authorization: 'Bearer ' + fixture.keyValue, 'content-type': 'application/json' },
    body: JSON.stringify({ model: fixture.modelId, messages: [
      { role: 'user', content: 'Old user A' }, { role: 'assistant', content: 'Old reply A' },
      { role: 'user', content: 'Only user B' }, { role: 'assistant', content: 'Only reply B' },
      { role: 'user', content: 'Continue A' },
    ] }),
  })
  await response.text()
  const evidence = fixture.requestEvidence().at(-1)
  assert.equal(evidence.authenticated, true)
  assert.equal(evidence.originalUserPresent, true)
  assert.equal(evidence.originalReplyPresent, true)
  assert.equal(evidence.foreignContextPresent, true, 'a cross-session leak must not certify a clean upgrade')
})

test('a blank old session is opened by its native workspace action without requiring a hidden title row', async () => {
  const { createOpenedInstalledSession } = await import('../scripts/installed-upgrade-state-fixture.mjs')
  assert.equal(typeof createOpenedInstalledSession, 'function')
  const events = []
  let resolveResponse
  const response = { url: () => 'dsh-runtime://app/api/session/create',
    request: () => ({ postDataJSON: () => ({ payload: { args: { request: { workspaceId: 'workspace-A' } } } }) }),
    json: async () => ({ type: 'server-response', result: { ok: true, value: { sessionId: 'blank-old-session' } } }),
  }
  const group = { first() { return this }, filter({ hasText }) { assert.equal(hasText, 'project'); return this },
    async waitFor() {}, async hover() { events.push('hover-workspace') }, async getAttribute() { return 'true' },
    getByRole(role, { name }) {
      assert.equal(role, 'button'); assert.ok(name.test('在“project”中新建会话'))
      return { async click() { events.push('native-create-and-open'); resolveResponse(response) } }
    },
  }
  const page = { getByRole(role) { assert.equal(role, 'treeitem'); return group },
    waitForResponse(predicate) {
      assert.equal(predicate(response), true)
      assert.equal(predicate({ ...response, request: () => ({ postDataJSON: () => ({ payload: { args: { request: { workspaceId: 'another-workspace' } } } }) }) }), false)
      events.push('listen-for-native-create')
      return new Promise(resolve => { resolveResponse = resolve })
    },
  }
  assert.equal(await createOpenedInstalledSession(page, '/isolated/project', 'workspace-A', { readSessions: async () => [] }), 'blank-old-session')
  assert.deepEqual(events, ['hover-workspace', 'listen-for-native-create', 'native-create-and-open'])
})

test('native reuse of the one old blank does not wait for a nonexistent create response', async () => {
  const { createOpenedInstalledSession } = await import('../scripts/installed-upgrade-state-fixture.mjs')
  const seats = [{ sessionId: 'old-reusable', cwd: '/isolated/project', blank: true }]
  const events = []
  let opened = false
  const selected = { filter({ hasText }) { assert.ok(hasText.test('新会话')); return this },
    async waitFor() { assert.equal(opened, true); events.push('selected-native-blank') } }
  const group = { filter() { return this }, first() { return this }, async waitFor() {},
    async getAttribute() { return 'true' }, async hover() {},
    getByRole() { return { async click() { opened = true; events.push('native-open') } } },
  }
  const page = { getByRole(role, options) { assert.equal(role, 'treeitem'); return options?.selected ? selected : group },
    waitForResponse() { throw new Error('the old native reuse path performs no session/create request') } }
  const id = await createOpenedInstalledSession(page, '/isolated/project', 'workspace-A', { readSessions: async () => seats })
  assert.equal(id, 'old-reusable')
  assert.deepEqual(events, ['native-open', 'selected-native-blank'])
})

test('an earlier cross-session leak sent to another model cannot hide behind a later clean expected-model request', async context => {
  const { createInstalledUpgradeFixture, assertInstalledChatEvidence } = await import('../scripts/installed-upgrade-state-fixture.mjs')
  assert.equal(typeof assertInstalledChatEvidence, 'function')
  const fixture = await createInstalledUpgradeFixture()
  context.after(() => fixture.close())
  fixture.expectChat({ phase: 'new-upgrade-A', prompt: 'Continue A', replyText: 'Reply A',
    originalUserText: 'Old user A', originalReplyText: 'Old reply A', forbiddenTexts: ['Only user B'] })
  const history = [{ role: 'user', content: 'Old user A' }, { role: 'assistant', content: 'Old reply A' }]
  for (const body of [
    { model: 'wrong-model', messages: [...history, { role: 'user', content: 'Only user B' }, { role: 'user', content: 'Continue A' }] },
    { model: fixture.modelId, messages: [...history, { role: 'user', content: 'Continue A' }] },
  ]) {
    const response = await fetch(fixture.baseURL + '/chat/completions', { method: 'POST',
      headers: { authorization: 'Bearer ' + fixture.keyValue, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    await response.text()
  }
  assert.throws(() => assertInstalledChatEvidence(fixture.requestEvidence(), { requireHistory: true }), /another session/iu)
  assert.doesNotThrow(() => assertInstalledChatEvidence(fixture.requestEvidence().slice(1), { requireHistory: true }))
})
