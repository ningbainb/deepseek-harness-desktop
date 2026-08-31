import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { ClaudeCodeAdapter } from '../../src/conversation-import/adapters/claude-code.mjs'
import { ADAPTER_STATUS } from '../../src/conversation-import/schema.mjs'

test('ClaudeCodeAdapter probes availability and discovers projects and sessions', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'claude-adapter-test-'))
  try {
    const claudeRoot = join(tempDir, '.claude')
    const projectDir = join(claudeRoot, 'projects', 'my-awesome-app')
    await mkdir(projectDir, { recursive: true })

    const sessionFile = join(projectDir, 'session-123.jsonl')
    const lines = [
      JSON.stringify({ type: 'metadata', cwd: 'C:\\Projects\\my-awesome-app', git_branch: 'main', git_commit: 'abc123456789' }),
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'Fix bug in auth service' } }),
      JSON.stringify({ type: 'reasoning', content: 'Internal hidden chain of thought that must not be imported' }),
      JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: 'I inspected auth.ts and found the error.' } }),
      JSON.stringify({ type: 'tool_use', name: 'FileEdit', input: { file_path: 'src/auth.ts' } }),
      JSON.stringify({ type: 'tool_result', content: 'Error: secret sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890 leaked' }),
      '{"incomplete_json_line_truncated',
    ]
    await writeFile(sessionFile, lines.join('\n'), 'utf8')

    const adapter = new ClaudeCodeAdapter({ rootDir: claudeRoot })
    const probe = await adapter.probe()
    assert.equal(probe.available, true)
    assert.equal(probe.status, ADAPTER_STATUS.RECOGNIZED)

    const projects = await adapter.discoverProjects()
    assert.equal(projects.length, 1)
    assert.equal(projects[0].displayName, 'my-awesome-app')
    assert.equal(projects[0].sessionCount, 1)

    const sessions = await adapter.discoverSessions(projects[0].projectRef)
    assert.equal(sessions.length, 1)
    assert.equal(sessions[0].sessionRef, sessionFile)
    assert.equal(sessions[0].title, 'Fix bug in auth service')
    assert.ok(sessions[0].fingerprint.length > 0)

    const conv = await adapter.readConversation(sessionFile)
    assert.equal(conv.source.kind, 'claude-code')
    assert.equal(conv.conversation.title, 'Fix bug in auth service')
    assert.equal(conv.project.gitBranch, 'main')
    assert.equal(conv.project.gitRevision, 'abc123456789')
    assert.equal(conv.messages.length, 2)
    assert.equal(conv.messages[0].role, 'user')
    assert.equal(conv.messages[0].content, 'Fix bug in auth service')
    assert.equal(conv.messages[1].role, 'assistant')
    assert.equal(conv.messages[1].content, 'I inspected auth.ts and found the error.')

    // Verify reasoning was skipped
    assert.ok(!conv.messages.some((m) => m.content.includes('Internal hidden chain of thought')))

    // Verify modified file was extracted
    assert.ok(conv.artifacts.modifiedFiles.includes('src/auth.ts'))

    // Verify secret in tool result was redacted
    assert.ok(conv.artifacts.errors.some((e) => e.includes('[REDACTED_API_KEY]')))
    assert.ok(!conv.artifacts.errors.some((e) => e.includes('sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890')))

    // Verify tolerant handling of truncated line
    assert.equal(conv.stats.malformedEvents, 1)
    assert.equal(conv.stats.skippedEvents, 1)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('ClaudeCodeAdapter supports Chinese non-ASCII project paths and untitled sessions', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'claude-chinese-test-'))
  try {
    const claudeRoot = join(tempDir, '.claude')
    const projectDir = join(claudeRoot, 'projects', '项目_深度学习模型')
    await mkdir(projectDir, { recursive: true })

    const sessionFile = join(projectDir, 'session-chinese.jsonl')
    const lines = [
      JSON.stringify({ type: 'user', content: '请帮我优化多维表格插件的数据渲染性能' }),
      JSON.stringify({ type: 'assistant', content: '已完成渲染管线重构。' }),
    ]
    await writeFile(sessionFile, lines.join('\n'), 'utf8')

    const adapter = new ClaudeCodeAdapter({ rootDir: claudeRoot })
    const projects = await adapter.discoverProjects()
    assert.equal(projects.length, 1)
    assert.equal(projects[0].displayName, '项目_深度学习模型')

    const conv = await adapter.readConversation(sessionFile)
    assert.equal(conv.conversation.title, '请帮我优化多维表格插件的数据渲染性能')
    assert.equal(conv.messages.length, 2)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('ClaudeCodeAdapter preserves tool_result blocks embedded in user records', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'claude-tool-result-test-'))
  try {
    const sessionFile = join(tempDir, 'embedded-tool-result.jsonl')
    const lines = [
      JSON.stringify({ type: 'user', id: 'u-1', message: { role: 'user', content: 'Inspect the project' } }),
      JSON.stringify({ type: 'assistant', id: 'a-1', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'call-1', name: 'Read', input: { file_path: 'README.md' } }] } }),
      JSON.stringify({ type: 'user', id: 'r-1', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call-1', content: [{ type: 'text', text: 'file contents' }], is_error: false }] } }),
      JSON.stringify({ type: 'assistant', id: 'a-2', message: { role: 'assistant', content: [{ type: 'text', text: 'Finished.' }] } }),
    ]
    await writeFile(sessionFile, lines.join('\n'), 'utf8')
    const conversation = await new ClaudeCodeAdapter({ rootDir: tempDir }).readConversation(sessionFile)
    assert.equal(conversation.events.filter((event) => event.type === 'tool_result').length, 1)
    assert.equal(conversation.events.find((event) => event.type === 'tool_result').toolCallId, 'call-1')
    assert.equal(conversation.conversation.toolCallCount, 1)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})
