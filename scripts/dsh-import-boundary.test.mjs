import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'

import {
  checkImportBoundary,
  compareImportBoundary,
  createBoundaryBaseline,
  listRepositoryFiles,
  scanRepositoryImports,
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

test('repository import scan excludes generated cache and patch construction scratch trees', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'dsh-import-scratch-'))
  try {
    await execFileAsync('git', ['init'], { cwd: root, windowsHide: true })
    await mkdir(resolve(root, '.patch-work'), { recursive: true })
    await mkdir(resolve(root, '.cache'), { recursive: true })
    await mkdir(resolve(root, '.pnpm_patches'), { recursive: true })
    await writeFile(resolve(root, 'kept.mjs'), "import '@deepseek-ai/dsh-session'\n")
    await writeFile(resolve(root, '.patch-work', 'scratch.mjs'), "import '@deepseek-ai/dsh-settings'\n")
    await writeFile(resolve(root, '.cache', 'scratch.mjs'), "import '@deepseek-ai/dsh-settings'\n")
    await writeFile(resolve(root, '.pnpm_patches', 'scratch.mjs'), `import '${'@deepseek-ai/' + 'dsh-settings'}'\n`)

    assert.deepEqual(await scanRepositoryImports(root), [{
      path: 'kept.mjs',
      kind: 'static-import',
      specifier: '@deepseek-ai/dsh-session',
      line: 1,
      typeOnly: false,
    }])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('SDK persistence adapters do not permit imports from adjacent application modules', () => {
  const specifier = `${'@deepseek-ai/'}dsh-client-ui-settings/client`
  const adapters = [
    'apps/dsh-desktop/src/atomic-write-adapter.mjs',
    'packages/dsh-model-preferences/src/client/persist-config.ts',
    'packages/dsh-personal-prompt/src/client/persist-config.ts',
  ]
  const entries = adapters.map(path => ({ path, kind: 'static-import', specifier, line: 1, typeOnly: true }))
  const baseline = createBoundaryBaseline([])
  assert.deepEqual(compareImportBoundary(entries, baseline), [])
  const adjacent = entries.map(entry => ({ ...entry, path: `${entry.path}.uncontrolled.ts` }))
  assert.equal(compareImportBoundary(adjacent, baseline).length, adjacent.length)
})

test('repository matches the committed direct-import baseline', async () => {
  assert.deepEqual(await checkImportBoundary(), [])
})
