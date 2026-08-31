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

    const ledgerPath = join(tempDir, 'state', 'external-conversation-imports-v2.json')

    let createdSession = null
    const mockHost = {
      workspaces: {
        list: { getSnapshot: () => ({ items: [] }) },
        create: async ({ path, title }) => ({ workspaceId: 'ws-test-123', path, title }),
      },
      sessions: {
        create: (id, options) => {
          createdSession = { id: 'sess-test-456', options }
          return createdSession
        },
        flush: async () => {},
      },
    }

    const service = new ConversationImportService({
      claudeRootDir: claudeRoot,
      codexRootDir: codexRoot,
      ledgerPath,
      currentWorkspaceDir: projectDir,
      hostContext: mockHost,
    })

    // 1. Discovery
    const discovery = await service.discoverAll()
    assert.equal(discovery.projects.length, 1)
    assert.equal(discovery.projects[0].sessions.length, 1)
    assert.equal(discovery.projects[0].sessions[0].importStatus, 'not-imported')
    assert.equal(discovery.projects[0].sessions[0].snippet, 'Refactor all CSS variables to native tokens')

    // 2. Create Preview Plan
    const plan = await service.createPreviewPlan({
      sourceKind: 'claude-code',
      sessionRef: sessionFile,
    })

    assert.ok(plan.planId.startsWith('plan-'))
    assert.equal(plan.sessionTitle, 'Refactor UI Tokens')
    assert.equal(plan.matchResult.isExactMatch, true)
    assert.equal(plan.eventCount, 2)
    assert.ok(plan.eventsPreview.length > 0)

    // 3. Confirm and Import
    const importRes = await service.confirmAndImport(plan.planId)
    assert.equal(importRes.ok, true)
    assert.equal(importRes.sessionId, 'sess-test-456')
    assert.equal(importRes.workspaceId, 'ws-test-123')
    assert.equal(importRes.importedEventCount, 2)
    assert.ok(importRes.transcriptHash.length > 0)

    // 4. Verify discovery now marks session as imported
    const rediscovery = await service.discoverAll()
    assert.equal(rediscovery.projects[0].sessions[0].importStatus, 'imported')

    // A source log that changes after preview must not be imported from the
    // stale in-memory snapshot.
    const stalePlan = await service.createPreviewPlan({
      sourceKind: 'claude-code',
      sessionRef: sessionFile,
    })
    await writeFile(
      sessionFile,
      [...lines, JSON.stringify({ role: 'user', content: 'A later source update' })].join('\n'),
      'utf8',
    )
    await assert.rejects(
      () => service.confirmAndImport(stalePlan.planId),
      /源会话在预览后发生变化，请重新扫描并预览后再导入/u,
    )
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('ConversationImportService rejects a preview plan without a valid target workspace', async () => {
  const service = new ConversationImportService({ currentWorkspaceDir: process.cwd() })
  service.activePlans.set('plan-invalid-target', {
    planId: 'plan-invalid-target',
    expiresAt: Date.now() + 60_000,
    sourceKind: 'codex',
    sessionRef: 'C:\\invalid-session.jsonl',
    fingerprint: '',
    effectiveCwd: undefined,
    matchResult: { canImport: false, message: '请先选择工程目录' },
    conversation: { events: [] },
  })

  await assert.rejects(
    () => service.confirmAndImport('plan-invalid-target'),
    /Cannot import session: 请先选择工程目录/u,
  )
})
