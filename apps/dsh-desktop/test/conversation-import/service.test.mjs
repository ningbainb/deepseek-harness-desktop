import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { ConversationImportService } from '../../src/conversation-import/service.mjs'

test('ConversationImportService coordinates discovery, plan creation, import execution, and ledger commit', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'service-test-'))
  try {
    const claudeRoot = join(tempDir, '.claude')
    const codexRoot = join(tempDir, '.codex')
    const projectDir = join(claudeRoot, 'projects', 'frontend-app')
    await mkdir(projectDir, { recursive: true })

    const sessionFile = join(projectDir, 'session-test.jsonl')
    const lines = [
      JSON.stringify({ cwd: projectDir, title: 'Refactor UI Tokens' }),
      JSON.stringify({ role: 'user', content: 'Refactor all CSS variables to native tokens' }),
      JSON.stringify({ role: 'assistant', content: 'Understood, starting with balance.module.css' }),
    ]
    await writeFile(sessionFile, lines.join('\n'), 'utf8')

    const ledgerPath = join(tempDir, 'state', 'external-conversation-imports-v1.json')

    const service = new ConversationImportService({
      claudeRootDir: claudeRoot,
      codexRootDir: codexRoot,
      ledgerPath,
      currentWorkspaceDir: projectDir,
    })

    // 1. Discovery
    const discovery = await service.discoverAll()
    assert.equal(discovery.projects.length, 1)
    assert.equal(discovery.projects[0].sessions.length, 1)
    assert.equal(discovery.projects[0].sessions[0].importStatus, 'not-imported')

    // 2. Create Preview Plan
    const plan = await service.createPreviewPlan({
      sourceKind: 'claude-code',
      sessionRef: sessionFile,
    })

    assert.ok(plan.planId.startsWith('plan-'))
    assert.equal(plan.sessionTitle, 'Refactor UI Tokens')
    assert.equal(plan.matchResult.isExactMatch, true)
    assert.ok(plan.previewPromptSnippet.includes('<external-agent-handoff>'))

    // 3. Confirm and Import
    const importRes = await service.confirmAndImport(plan.planId)
    assert.equal(importRes.ok, true)
    assert.ok(importRes.targetSessionId.length > 0)

    // 4. Verify discovery now marks session as imported
    const rediscovery = await service.discoverAll()
    assert.equal(rediscovery.projects[0].sessions[0].importStatus, 'imported')
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})
