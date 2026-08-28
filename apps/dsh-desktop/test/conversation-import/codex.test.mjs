import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { CodexAdapter } from '../../src/conversation-import/adapters/codex.mjs'
import { ADAPTER_STATUS } from '../../src/conversation-import/schema.mjs'

test('CodexAdapter discovers sessions, extracts tool calls, and handles truncated lines', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'codex-adapter-test-'))
  try {
    const codexRoot = join(tempDir, '.codex')
    const sessionsDir = join(codexRoot, 'sessions')
    await mkdir(sessionsDir, { recursive: true })

    const sessionFile = join(sessionsDir, 'session-abc.jsonl')
    const lines = [
      JSON.stringify({ cwd: 'C:\\Projects\\codex-harness', git_branch: 'feature/import', git_commit: 'fedcba987654' }),
      JSON.stringify({ role: 'user', content: 'Implement context handoff bridge for Codex' }),
      JSON.stringify({ type: 'rollout_trace', content: 'Hidden rollout events that must be ignored' }),
      JSON.stringify({ role: 'assistant', content: 'I will create the bridge file and test it.' }),
      JSON.stringify({
        type: 'tool_call',
        name: 'write_file',
        arguments: JSON.stringify({ path: 'src/bridge.ts', content: 'export const bridge = true' }),
      }),
      JSON.stringify({
        type: 'tool_call',
        name: 'execute_command',
        arguments: JSON.stringify({ command: 'pnpm test --filter bridge' }),
      }),
      JSON.stringify({
        type: 'tool_result',
        status: 'failed',
        error: 'Test failed: secret Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 expired',
      }),
      '{"incomplete_codex_line',
    ]
    await writeFile(sessionFile, lines.join('\n'), 'utf8')

    const adapter = new CodexAdapter({ rootDir: codexRoot })
    const probe = await adapter.probe()
    assert.equal(probe.available, true)
    assert.equal(probe.status, ADAPTER_STATUS.RECOGNIZED)

    const projects = await adapter.discoverProjects()
    assert.equal(projects.length, 1)
    assert.equal(projects[0].sessionCount, 1)

    const sessions = await adapter.discoverSessions(projects[0].projectRef)
    assert.equal(sessions.length, 1)
    assert.equal(sessions[0].sessionRef, sessionFile)
    assert.equal(sessions[0].title, 'Implement context handoff bridge for Codex')

    const conv = await adapter.readConversation(sessionFile)
    assert.equal(conv.source.kind, 'codex')
    assert.equal(conv.project.gitBranch, 'feature/import')
    assert.equal(conv.project.gitRevision, 'fedcba987654')
    assert.equal(conv.messages.length, 2)
    assert.equal(conv.messages[0].role, 'user')
    assert.equal(conv.messages[0].content, 'Implement context handoff bridge for Codex')

    // Verify rollout trace was skipped
    assert.ok(!conv.messages.some((m) => m.content.includes('Hidden rollout events')))

    // Verify modified file was extracted
    assert.ok(conv.artifacts.modifiedFiles.includes('src/bridge.ts'))

    // Verify command was extracted
    assert.ok(conv.artifacts.commands.some((c) => c.command.includes('pnpm test')))

    // Verify secret was redacted
    assert.ok(conv.artifacts.errors.some((e) => e.includes('[REDACTED_AUTH]')))
    assert.ok(!conv.artifacts.errors.some((e) => e.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')))

    // Verify tolerant handling of truncated line
    assert.equal(conv.stats.malformedEvents, 1)
    assert.equal(conv.stats.skippedEvents, 1)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})
