import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { CodexAdapter } from '../../src/conversation-import/adapters/codex.mjs'
import { ClaudeCodeAdapter } from '../../src/conversation-import/adapters/claude-code.mjs'
import { validateExternalConversationV2 } from '../../src/conversation-import/schema.mjs'

test('CodexAdapter and ClaudeCodeAdapter correctly parse sanitized V2 fixtures', async () => {
  const codexFixture = fileURLToPath(new URL('../fixtures/codex/sanitized-rollout.jsonl', import.meta.url))
  const claudeFixture = fileURLToPath(new URL('../fixtures/claude-code/sanitized-session.jsonl', import.meta.url))

  const codex = new CodexAdapter()
  const codexConv = await codex.readConversation(codexFixture)

  assert.equal(validateExternalConversationV2(codexConv), true)
  assert.equal(codexConv.source.kind, 'codex')
  assert.equal(codexConv.events.length, 5)
  assert.equal(codexConv.conversation.toolCallCount, 1)
  assert.equal(codexConv.stats.malformedEvents, 1)
  assert.equal(codexConv.stats.skippedEvents, 1)

  const claude = new ClaudeCodeAdapter()
  const claudeConv = await claude.readConversation(claudeFixture)

  assert.equal(validateExternalConversationV2(claudeConv), true)
  assert.equal(claudeConv.source.kind, 'claude-code')
  assert.equal(claudeConv.events.length, 5)
  assert.equal(claudeConv.conversation.toolCallCount, 1)
  assert.equal(claudeConv.stats.skippedEvents, 1)
})
