import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import test from 'node:test'

import { patchPostimages, validateBuiltinPluginAdaptation } from './verify-builtin-plugin-adaptation.mjs'

function fixture() {
  const repoRoot = resolve('adaptation-fixture')
  const name = '@desktop/test-plugin'
  const root = join(repoRoot, 'packages', 'dsh-test-plugin')
  const plugin = {
    name,
    selection: { source: 'workspace', version: '1.0.0', path: 'packages/dsh-test-plugin' },
    reason: 'Keep the desktop workspace-open boundary.',
    desktopContracts: ['Only registered workspaces may be opened.'],
    publicSnapshot: { status: 'available', latest: '2.0.0', checkedAt: '2026-09-12T00:00:00Z', url: 'https://registry.npmjs.org/%40desktop%2Ftest-plugin' },
    validation: { automatedChecks: ['tests/workspace-boundary.test.mjs'], desktopAcceptance: ['Open a registered workspace.'], results: [] },
  }
  const mounts = {
    topLevel: ['@desktop/aggregate'],
    dependencyOnly: [],
    repairBundle: '@desktop/repair',
    aggregateEntries: [{ id: 'workspace', name }],
  }
  const state = {
    repoRoot,
    names: [name],
    runtimeVersion: '0.1.5-rc.1',
    packages: new Map([[name, { name, version: '1.0.0', root }]]),
    patchedDependencies: {},
    lockedPatches: {},
    lockPackages: [`${name}@1.0.0`],
    ...structuredClone(mounts),
  }
  const files = new Map([
    [root, ''],
    [join(repoRoot, 'tests/workspace-boundary.test.mjs'), 'test source'],
  ])
  const io = { exists: path => files.has(path), realpath: path => path, readText: path => {
    if (!files.has(path)) throw new Error(`missing file: ${path}`)
    return files.get(path)
  } }
  const manifest = { schemaVersion: 1, policy: 'desktop-first', runtimeVersion: state.runtimeVersion, mounts, plugins: [plugin] }
  const validate = () => validateBuiltinPluginAdaptation(manifest, state, io)
  return { state, plugin, manifest, files, validate }
}

test('a retained desktop version can be below public latest without claiming interactive acceptance', () => {
  const f = fixture()
  assert.deepEqual(f.validate(), { errors: [], checked: 1 })
  assert.deepEqual(f.plugin.validation.results, [])
})

test('rejects the same package version when npm replaces a reviewed workspace implementation', () => {
  const f = fixture()
  f.state.packages.get(f.plugin.name).root = join(f.state.repoRoot, 'node_modules', '.pnpm', 'package', 'node_modules', '@desktop', 'test-plugin')
  assert.match(f.validate().errors.join('\n'), /workspace fixes replaced/)
})

test('rejects version drift, missing builtin decisions, and missing resolved packages', () => {
  const f = fixture()
  f.state.packages.get(f.plugin.name).version = '2.0.0'
  assert.match(f.validate().errors.join('\n'), /expected 1.0.0, resolved 2.0.0/)
  f.state.names.push('@desktop/unreviewed')
  assert.match(f.validate().errors.join('\n'), /builtin has no adaptation decision: @desktop\/unreviewed/)
  f.state.packages.clear()
  assert.match(f.validate().errors.join('\n'), /builtin package did not resolve/)
})

function addPatchedNpmPackage(f) {
  const { name } = f.plugin
  const root = join(f.state.repoRoot, 'node_modules', '.pnpm', 'patched-package', 'node_modules', '@desktop', 'test-plugin')
  const patch = 'diff --git a/lib/client.js b/lib/client.js\n--- a/lib/client.js\n+++ b/lib/client.js\n@@ -1,2 +1,2 @@\n context()\n-openAnyPath()\n+openRegisteredWorkspace()\n'
  f.plugin.selection = { source: 'npm', version: '1.0.0', patch: 'patches/desktop.patch' }
  f.state.packages.get(name).root = root
  f.state.patchedDependencies[`${name}@1.0.0`] = 'patches/desktop.patch'
  f.state.lockedPatches[`${name}@1.0.0`] = createHash('sha256').update(patch).digest('hex')
  f.files.set(join(f.state.repoRoot, 'patches/desktop.patch'), patch.replaceAll('\n', '\r\n'))
  f.files.set(join(root, 'lib/client.js'), 'context()\nopenRegisteredWorkspace()\n')
  return root
}

test('verifies installed patch bytes rather than accepting a declaration or lock hash alone', () => {
  const f = fixture()
  const root = addPatchedNpmPackage(f)
  assert.deepEqual(f.validate().errors, [])
  f.files.set(join(root, 'lib/client.js'), 'context()\nopenAnyPath()\n')
  assert.match(f.validate().errors.join('\n'), /installed patch hunk is missing in lib\/client.js/)
})

test('rejects missing patch declarations and stale lock hashes', () => {
  const f = fixture()
  addPatchedNpmPackage(f)
  delete f.state.patchedDependencies[`${f.plugin.name}@1.0.0`]
  f.state.lockedPatches[`${f.plugin.name}@1.0.0`] = 'stale-hash'
  const errors = f.validate().errors.join('\n')
  assert.match(errors, /patch declaration changed/)
  assert.match(errors, /patch and lockfile hash differ/)
})

test('rejects removed, duplicate, and reordered aggregate mounts', () => {
  const f = fixture()
  f.state.aggregateEntries = []
  assert.match(f.validate().errors.join('\n'), /aggregate mount changed or duplicated: workspace/)
  f.state.aggregateEntries = [...f.manifest.mounts.aggregateEntries, ...f.manifest.mounts.aggregateEntries]
  assert.match(f.validate().errors.join('\n'), /aggregate mount changed or duplicated: workspace/)
  f.manifest.mounts.aggregateEntries.push({ id: 'second', name: '@desktop/second' })
  f.state.aggregateEntries = [...f.manifest.mounts.aggregateEntries].reverse()
  assert.match(f.validate().errors.join('\n'), /aggregate mount composition or order changed/)
})

test('rejects missing regression references and compatibility labels masquerading as test results', () => {
  const f = fixture()
  f.files.clear()
  f.plugin.validation.results.push({ kind: 'compatible', outcome: 'passed' })
  const errors = f.validate().errors.join('\n')
  assert.match(errors, /automated check is missing/)
  assert.match(errors, /invalid validation result kind/)
  assert.match(errors, /recorded result needs time, evidence, and scope/)
})

test('unified diff verification preserves context and excludes removed text', () => {
  const patch = 'diff --git a/lib/a.js b/lib/a.js\n--- a/lib/a.js\n+++ b/lib/a.js\n@@ -1,3 +1,3 @@\n start\n-old\n+new\n end\n'
  assert.deepEqual(patchPostimages(patch), [{ file: 'lib/a.js', text: 'start\nnew\nend' }])
  assert.throws(() => patchPostimages(patch.replace('+++ b/lib/a.js', '+++ b/../../other.js')), /unsafe target/)
})
