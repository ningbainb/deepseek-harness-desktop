import assert from 'node:assert/strict'
import test from 'node:test'

import { ContextReconstructor } from '../../src/conversation-import/context-reconstructor.mjs'
import { ImportTokenBudgeter } from '../../src/conversation-import/token-budget.mjs'

test('ContextReconstructor builds structured <external-agent-handoff> message', () => {
  const conversation = {
    schemaVersion: 1,
    source: {
      kind: 'claude-code',
      adapterVersion: '1.0.0',
      sourceSessionId: 'sess-123',
    },
    project: {
      displayName: 'deepseek-harness-desktop',
      originalCwd: '/home/user/code/dsh',
      gitBranch: 'main',
      gitRevision: 'abc123456789',
    },
    conversation: {
      title: 'Fix Context Compaction #55',
      createdAt: Date.now() - 3600000,
      updatedAt: Date.now(),
    },
    messages: [
      { role: 'user', content: 'We need to fix Context Compaction #55 and keep safety check' },
      { role: 'assistant', content: 'I have analyzed the region and safety check logic.' },
      { role: 'user', content: 'Make sure foo.spec.ts passes' },
      { role: 'assistant', content: 'I modified region.ts and ran tests.' },
    ],
    artifacts: {
      referencedFiles: ['src/region.ts', 'src/safety.ts'],
      modifiedFiles: ['src/region.ts'],
      commands: [{ command: 'pnpm test' }],
      errors: ['foo.spec.ts: assertion failed on line 42'],
    },
    stats: { parsedEvents: 10, skippedEvents: 0, malformedEvents: 0 },
  }

  const result = ContextReconstructor.reconstruct(conversation, {
    revisionChanged: true,
    currentRevision: 'def456789012',
  })

  assert.ok(result.promptText.startsWith('<external-agent-handoff>'))
  assert.ok(result.promptText.endsWith('</external-agent-handoff>'))
  assert.ok(result.promptText.includes('Fix Context Compaction #55'))
  assert.ok(result.promptText.includes('src/region.ts'))
  assert.ok(result.promptText.includes('foo.spec.ts: assertion failed'))
  assert.ok(result.promptText.includes('The filesystem and Git state are authoritative'))
  assert.ok(result.promptText.includes('differs from the historical import revision'))
  assert.ok(result.tokenEstimate > 0)
  assert.ok(result.tokenEstimate < 6000)
})

test('ImportTokenBudgeter truncates massive transcripts within hard ceiling', () => {
  const massiveContent = 'A'.repeat(200000) // ~57,000 tokens
  const est = ImportTokenBudgeter.estimateTokens(massiveContent)
  assert.ok(est > 50000)

  const truncated = ImportTokenBudgeter.truncateToTokenBudget(massiveContent, 4000)
  const truncatedEst = ImportTokenBudgeter.estimateTokens(truncated)
  assert.ok(truncatedEst <= 4000)
  assert.ok(truncated.includes('historical context truncated for token budget'))
})
