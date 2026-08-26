import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'

import {
  checkImportBoundary,
  compareImportBoundary,
  createBoundaryBaseline,
  listRepositoryFiles,
  scanSourceText,
} from './dsh-import-boundary.mjs'

const execFileAsync = promisify(execFile)

test('DSH import scanner recognizes static, dynamic, require, and type-only imports', () => {
  const prefix = '@deepseek-ai/'
  const entries = scanSourceText(`
    import Runtime from '${prefix}dsh-runtime'
    import type { Session } from '${prefix}dsh-session'
    const lazy = import('${prefix}dsh-workspace/client')
    const legacy = require('${prefix}dsh-settings')
  `)
  assert.deepEqual(entries.map(({ kind, specifier, typeOnly }) => ({ kind, specifier, typeOnly })), [
    { kind: 'static-import', specifier: '@deepseek-ai/dsh-runtime', typeOnly: false },
    { kind: 'static-import', specifier: '@deepseek-ai/dsh-session', typeOnly: true },
    { kind: 'dynamic-import', specifier: '@deepseek-ai/dsh-workspace/client', typeOnly: false },
    { kind: 'require', specifier: '@deepseek-ai/dsh-settings', typeOnly: false },
  ])
})

test('boundary rejects a new import and permits controlled adapter imports', () => {
  const specifier = `${'@deepseek-ai/'}dsh-settings`
  const existing = [{
    path: 'packages/example/src/index.ts',
    kind: 'static-import',
    specifier,
    line: 1,
    typeOnly: false,
  }]
  const baseline = createBoundaryBaseline(existing)
  assert.deepEqual(compareImportBoundary([...existing, { ...existing[0], line: 2 }], baseline), [{
    path: 'packages/example/src/index.ts',
    kind: 'static-import',
    specifier: '@deepseek-ai/dsh-settings',
    allowed: 1,
    actual: 2,
  }])
  assert.deepEqual(compareImportBoundary([...existing, {
    ...existing[0],
    path: 'apps/dsh-desktop/src/runtime-provider.mjs',
  }], baseline), [])
  assert.deepEqual(compareImportBoundary([...existing, {
    ...existing[0],
    path: 'packages/dsh-desktop-repair/src/model-runner.ts',
  }], baseline), [])
})

test('repository file listing omits tracked files deleted from the working tree', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'dsh-import-files-'))
  try {
    await execFileAsync('git', ['init'], { cwd: root, windowsHide: true })
    await writeFile(resolve(root, 'kept.mjs'), 'export const kept = true\n')
    await writeFile(resolve(root, 'deleted.mjs'), 'export const deleted = true\n')
    await execFileAsync('git', ['add', '--', 'kept.mjs', 'deleted.mjs'], { cwd: root, windowsHide: true })
    await unlink(resolve(root, 'deleted.mjs'))
    await writeFile(resolve(root, 'untracked.mjs'), 'export const untracked = true\n')

    assert.deepEqual((await listRepositoryFiles(root)).toSorted(), ['kept.mjs', 'untracked.mjs'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('repository matches the committed direct-import baseline', async () => {
  assert.deepEqual(await checkImportBoundary(), [])
})
