import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { ConversationImportService } from '../../src/conversation-import/service.mjs'

test('batch import maps one external project to one DSH workspace and keeps every session separate', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'batch-service-'))
  try {
    const sourceRoot = join(tempDir, 'selected-claude')
    const projectDir = join(sourceRoot, 'projects', 'target-workspace')
    const targetWorkspace = projectDir
    await mkdir(projectDir, { recursive: true })

    const sessionFiles = []
    for (const [name, title] of [['one', 'First task'], ['two', 'Second task']]) {
      const file = join(projectDir, `${name}.jsonl`)
      await writeFile(file, [
        JSON.stringify({ cwd: targetWorkspace, title }),
        JSON.stringify({ role: 'user', content: `${title} user request` }),
        JSON.stringify({ role: 'assistant', content: `${title} assistant answer` }),
      ].join('\n'), 'utf8')
      sessionFiles.push(file)
    }

    const workspaces = []
    const sessions = new Map()
    let createdWorkspaceCount = 0
    let createdSessionCount = 0
    const mockHost = {
      workspaces: {
        list: { getSnapshot: () => ({ items: workspaces }) },
        create: async ({ path, title }) => {
          const workspace = {
            workspaceId: `ws-${++createdWorkspaceCount}`,
            path,
            title,
            attachSession: async (sessionId) => {
              workspace.sessionIds ||= []
              workspace.sessionIds.push(sessionId)
            },
          }
          workspaces.push(workspace)
          return workspace
        },
      },
      sessions: {
        get: (id) => sessions.get(id),
        create: (id, options) => {
          const session = { id: id || `session-${++createdSessionCount}`, header: { cwd: options.meta.cwd } }
          sessions.set(session.id, session)
          return session
        },
        flush: async () => {},
      },
    }

    const service = new ConversationImportService({
      claudeRootDir: join(tempDir, 'default-claude-do-not-use'),
      codexRootDir: join(tempDir, 'default-codex-do-not-use'),
      ledgerPath: join(tempDir, 'state', 'imports.json'),
      currentWorkspaceDir: targetWorkspace,
      hostContext: mockHost,
    })
    service.setSourceRoot('claude-code', sourceRoot)

    const discovered = await service.discoverSelected()
    assert.equal(discovered.sources.find((source) => source.sourceKind === 'claude-code').rootDir, sourceRoot)
    assert.equal(discovered.projects.length, 1)
    assert.equal(discovered.projects[0].sessions.length, 2)

    const preview = await service.createBatchPreviewPlan({
      sourceKind: 'claude-code',
      projectRefs: [{
        sourceKind: 'claude-code',
        rootDir: sourceRoot,
        projectRef: projectDir,
      }],
    })
    assert.equal(preview.totalProjects, 1)
    assert.equal(preview.totalSessions, 2)
    assert.equal(preview.canImport, true)
    assert.equal(preview.workspaces.length, 1)
    await assertSameDirectory(preview.workspaces[0].targetPath, targetWorkspace)

    const progress = []
    const removeProgress = service.subscribeBatchProgress((event) => progress.push(event))
    const result = await service.confirmAndImportBatch(preview.planId)
    removeProgress()

    assert.equal(result.ok, true)
    assert.equal(result.importedCount, 2)
    assert.equal(result.failedCount, 0)
    assert.equal(result.workspaceCount, 1)
    assert.equal(createdWorkspaceCount, 1)
    assert.equal(sessions.size, 2)
    assert.equal(workspaces[0].sessionIds.length, 2)
    assert.notEqual(workspaces[0].sessionIds[0], workspaces[0].sessionIds[1])
    assert.ok(progress.some((event) => event.phase === 'started'))
    assert.equal(progress.filter((event) => event.phase === 'item-complete').length, 2)

    const secondPreview = await service.createBatchPreviewPlan({ sourceKind: 'claude-code' })
    assert.equal(secondPreview.alreadyImportedCount, 2)
    const secondResult = await service.confirmAndImportBatch(secondPreview.planId)
    assert.equal(secondResult.ok, true)
    assert.equal(secondResult.reusedCount, 2)
    assert.equal(secondResult.importedCount, 0)
    assert.equal(createdWorkspaceCount, 1)
    assert.equal(sessions.size, 2)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('batch import scans a selected Codex folder and groups sessions by their original cwd', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'batch-codex-service-'))
  try {
    const sourceRoot = join(tempDir, 'selected-codex')
    const sessionsDir = join(sourceRoot, 'sessions', '2026', '08')
    const targetWorkspace = join(tempDir, 'moved-project')
    await mkdir(sessionsDir, { recursive: true })
    await mkdir(join(sourceRoot, 'archived_sessions'), { recursive: true })
    await mkdir(targetWorkspace, { recursive: true })

    for (const [name, title] of [['one', 'Codex first task'], ['two', 'Codex second task']]) {
      await writeFile(join(sessionsDir, `${name}.jsonl`), [
        JSON.stringify({ type: 'session_meta', payload: { cwd: targetWorkspace } }),
        JSON.stringify({ type: 'response_item', payload: {
          type: 'message', role: 'user', content: [{ type: 'input_text', text: title }],
        } }),
        JSON.stringify({ type: 'response_item', payload: {
          type: 'message', role: 'assistant', content: [{ type: 'output_text', text: `${title} answer` }],
        } }),
      ].map((line) => typeof line === 'string' ? line : JSON.stringify(line)).join('\n'), 'utf8')
    }
    await writeFile(join(sourceRoot, 'archived_sessions', 'archived.jsonl'), [
      JSON.stringify({ type: 'session_meta', payload: { cwd: targetWorkspace } }),
      JSON.stringify({ type: 'response_item', payload: {
        type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Codex archived task' }],
      } }),
      JSON.stringify({ type: 'response_item', payload: {
        type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Archived answer' }],
      } }),
    ].join('\n'), 'utf8')

    const workspaces = []
    const sessions = new Map()
    let workspaceCount = 0
    let sessionCount = 0
    const mockHost = {
      workspaces: {
        list: { getSnapshot: () => ({ items: workspaces }) },
        create: async ({ path, title }) => {
          const workspace = {
            workspaceId: `codex-ws-${++workspaceCount}`,
            path,
            title,
            attachSession: async (id) => { (workspace.sessionIds ||= []).push(id) },
          }
          workspaces.push(workspace)
          return workspace
        },
      },
      sessions: {
        get: (id) => sessions.get(id),
        create: (id, options) => {
          const session = { id: id || `codex-session-${++sessionCount}`, header: { cwd: options.meta.cwd } }
          sessions.set(session.id, session)
          return session
        },
        flush: async () => {},
      },
    }

    const service = new ConversationImportService({
      claudeRootDir: join(tempDir, 'no-claude'),
      codexRootDir: join(tempDir, 'no-codex'),
      ledgerPath: join(tempDir, 'state', 'imports.json'),
      currentWorkspaceDir: targetWorkspace,
      hostContext: mockHost,
    })
    service.setSourceRoot('codex', sourceRoot)

    const preview = await service.createBatchPreviewPlan({ sourceKind: 'codex' })
    assert.equal(preview.totalProjects, 1)
    assert.equal(preview.totalSessions, 3)
    assert.equal(preview.canImport, true)
    assert.equal(preview.workspaces.length, 1)
    await assertSameDirectory(preview.workspaces[0].targetPath, targetWorkspace)

    const result = await service.confirmAndImportBatch(preview.planId)
    assert.equal(result.ok, true)
    assert.equal(result.importedCount, 3)
    assert.equal(workspaceCount, 1)
    assert.equal(sessions.size, 3)
    assert.equal(workspaces[0].sessionIds.length, 3)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

async function assertSameDirectory(actual, expected) {
  assert.equal(typeof actual, 'string')
  const [actualStats, expectedStats] = await Promise.all([
    stat(actual),
    stat(expected),
  ])
  assert.equal(actualStats.isDirectory(), true)
  assert.equal(expectedStats.isDirectory(), true)
  // Windows may expose the same temporary directory through its long name
  // or its 8.3 alias. Compare the filesystem identity, not the spelling.
  assert.equal(actualStats.dev, expectedStats.dev)
  assert.equal(actualStats.ino, expectedStats.ino)
}
