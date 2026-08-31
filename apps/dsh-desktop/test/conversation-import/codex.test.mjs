import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdCompressSync } from 'node:zlib'
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

test('CodexAdapter reads user_message and agent_message records from newer rollouts', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'codex-new-format-test-'))
  try {
    const sessionFile = join(tempDir, 'new-format.jsonl')
    const lines = [
      JSON.stringify({ type: 'user_message', id: 'u-1', content: 'Continue the migration' }),
      JSON.stringify({ type: 'agent_reasoning', id: 'r-1', summary: [{ type: 'summary_text', text: 'hidden' }] }),
      JSON.stringify({ type: 'agent_message', id: 'a-1', content: [{ type: 'output_text', text: 'I will inspect the workspace.' }] }),
      JSON.stringify({ type: 'response_item', payload: { type: 'agent_message', id: 'a-2', role: 'assistant', content: [{ type: 'text', text: 'The workspace is ready.' }] } }),
    ]
    await writeFile(sessionFile, lines.join('\n'), 'utf8')
    const conversation = await new CodexAdapter({ rootDir: tempDir }).readConversation(sessionFile)
    assert.deepEqual(conversation.messages.map((message) => message.role), ['user', 'assistant', 'assistant'])
    assert.equal(conversation.events.length, 3)
    assert.ok(conversation.stats.skippedEvents >= 1)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('CodexAdapter imports canonical event_msg messages and command results without duplicates', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'codex-event-msg-test-'))
  try {
    const sessionFile = join(tempDir, 'event-msg.jsonl')
    const lines = [
      JSON.stringify({ timestamp: '2026-08-21T12:00:00Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Inspect the workspace' }] } }),
      JSON.stringify({ timestamp: '2026-08-21T12:00:00Z', type: 'event_msg', payload: { type: 'user_message', message: 'Inspect the workspace', kind: 'plain' } }),
      JSON.stringify({ timestamp: '2026-08-21T12:00:01Z', type: 'event_msg', payload: { type: 'agent_message', message: 'I will inspect the workspace.', phase: 'commentary' } }),
      JSON.stringify({ timestamp: '2026-08-21T12:00:01Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'I will inspect the workspace.' }] } }),
      JSON.stringify({ timestamp: '2026-08-21T12:00:02Z', type: 'response_item', payload: { type: 'function_call', name: 'exec_command', call_id: 'call-1', arguments: '{"command":"pwd"}' } }),
      JSON.stringify({ timestamp: '2026-08-21T12:00:03Z', type: 'event_msg', payload: { type: 'exec_command_end', call_id: 'call-1', aggregated_output: 'C:/workspace', exit_code: 0, status: 'completed' } }),
      JSON.stringify({ timestamp: '2026-08-21T12:00:03Z', type: 'response_item', payload: { type: 'function_call_output', call_id: 'call-1', output: 'C:/workspace' } }),
    ]
    await writeFile(sessionFile, lines.join('\n'), 'utf8')

    const conversation = await new CodexAdapter({ rootDir: tempDir }).readConversation(sessionFile)
    assert.deepEqual(conversation.messages.map((message) => message.content), [
      'Inspect the workspace',
      'I will inspect the workspace.',
    ])
    assert.equal(conversation.events.filter((event) => event.type === 'tool_result').length, 1)
    assert.equal(conversation.events.find((event) => event.type === 'tool_result').toolCallId, 'call-1')
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('CodexAdapter reads zstd-compressed archived rollouts', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'codex-zstd-test-'))
  try {
    const sessionFile = join(tempDir, 'rollout-019cc284-7ad8-7713-8ed9-128157054d82.jsonl.zst')
    const source = [
      JSON.stringify({ timestamp: '2026-08-21T12:00:00Z', type: 'event_msg', payload: { type: 'user_message', message: 'Read the archived session' } }),
      JSON.stringify({ timestamp: '2026-08-21T12:00:01Z', type: 'event_msg', payload: { type: 'agent_message', message: 'The archived session is readable.' } }),
    ].join('\n')
    await writeFile(sessionFile, zstdCompressSync(Buffer.from(source, 'utf8')))

    const conversation = await new CodexAdapter({ rootDir: tempDir }).readConversation(sessionFile)
    assert.deepEqual(conversation.messages.map((message) => message.content), [
      'Read the archived session',
      'The archived session is readable.',
    ])
    assert.equal(conversation.source.sessionId, 'rollout-019cc284-7ad8-7713-8ed9-128157054d82')
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('CodexAdapter ignores generic auto summaries when deriving session titles', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'codex-generic-title-test-'))
  try {
    const sessionsDir = join(tempDir, 'sessions')
    await mkdir(sessionsDir, { recursive: true })
    const sessionFile = join(sessionsDir, 'rollout-019cc284-7ad8-7713-8ed9-128157054d82.jsonl')
    const lines = [
      JSON.stringify({ type: 'turn_context', payload: { summary: 'auto' } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: 'Fix the import flow' } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'agent_message', message: 'I will inspect the runtime.' } }),
    ]
    await writeFile(sessionFile, lines.join('\n'), 'utf8')

    await writeFile(join(tempDir, 'session_index.jsonl'), JSON.stringify({
      id: '019cc284-7ad8-7713-8ed9-128157054d82',
      thread_name: 'Indexed Codex title',
    }) + '\n', 'utf8')
    const adapter = new CodexAdapter({ rootDir: tempDir })
    const projects = await adapter.discoverProjects()
    const sessions = await adapter.discoverSessions(projects[0].projectRef)
    assert.equal(sessions[0].title, 'Indexed Codex title')

    const conversation = await adapter.readConversation(sessionFile)
    assert.equal(conversation.conversation.title, 'Indexed Codex title')
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('CodexAdapter hides internal history-review rollouts from discovery', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'codex-internal-rollout-test-'))
  try {
    const sessionsDir = join(tempDir, 'sessions')
    await mkdir(sessionsDir, { recursive: true })
    const sessionFile = join(sessionsDir, 'rollout-019cc284-7ad8-7713-8ed9-128157054d82.jsonl')
    await writeFile(sessionFile, [
      JSON.stringify({ type: 'session_meta', payload: { thread_source: 'guardian_review', model_provider: 'codex-auto-review' } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'The following is the Codex agent history whose request action you are assessing.' }] } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'agent_message', message: 'Internal review output' } }),
    ].join('\n'), 'utf8')

    const projects = await new CodexAdapter({ rootDir: tempDir }).discoverProjects()
    assert.equal(projects.length, 0)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})
