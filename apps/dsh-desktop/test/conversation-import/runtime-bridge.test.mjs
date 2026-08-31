import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { DESKTOP_WORKSPACE_FILE_OPEN_TOKEN_HEADER } from '@linxin666/dsh-desktop-compat/workspace-file-open-policy'
import { DSHSessionBridge } from '../../src/conversation-import/session-bridge.mjs'

const CAPABILITY_TOKEN = 'a'.repeat(43)

test('DSHSessionBridge imports through the real runtime route and maps the durable result', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-runtime-bridge-'))
  const project = join(root, 'project')
  await mkdir(project)
  let request
  const bridge = new DSHSessionBridge({
    runtimeProvider: { status: { state: 'ready', url: 'http://127.0.0.1:43125/' } },
    getRuntimeOrigin: () => 'http://127.0.0.1:43125/',
    getCapabilityToken: () => CAPABILITY_TOKEN,
    fetchImpl: async (url, options) => {
      request = { url, options }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          workspaceId: 'workspace-1',
          sessionId: 'import-session-1',
          title: 'Imported',
          seedEventCount: 1,
          eventCount: 2,
        }),
      }
    },
  })
  try {
    const result = await bridge.importConversationSession({
      projectCwd: project,
      title: 'Imported',
      importId: 'imp-test',
      sessionId: 'import-session-1',
      conversation: {
        source: { kind: 'codex', sessionId: 'source-1' },
        conversation: { title: 'Imported', startedAt: Date.now() },
        events: [{ sequence: 1, eventId: 'source-event-1', type: 'message', role: 'user', content: 'hello' }],
      },
    })
    assert.equal(result.ok, true)
    assert.equal(result.workspaceId, 'workspace-1')
    assert.equal(result.sessionId, 'import-session-1')
    assert.equal(result.importedEventCount, 1)
    assert.equal(request.url, 'http://127.0.0.1:43125/desktop/conversation-import')
    assert.equal(request.options.method, 'POST')
    assert.equal(request.options.headers[DESKTOP_WORKSPACE_FILE_OPEN_TOKEN_HEADER], CAPABILITY_TOKEN)
    const body = JSON.parse(request.options.body)
    assert.equal(body.projectCwd, await import('node:fs/promises').then(({ realpath }) => realpath(project)))
    assert.equal(body.seed[0].seq, 0)
    assert.equal(body.seed[0].type, 'turn/start')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
