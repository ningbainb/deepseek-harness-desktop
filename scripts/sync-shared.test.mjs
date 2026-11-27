import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { REPO_ROOT, applySync, checkSync, copyEntries, headerFor, renderCopy, stripHeader } from './sync-shared.mjs'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))

test('header/strip round-trips every file kind', () => {
  for (const file of ['settings-form.ts', 'PluginSettingsCard.tsx', 'settings-card.module.css']) {
    const source = 'export const x = 1' + String.fromCharCode(10)
    const sourceRel = 'shared/client/settings/' + file
    const rendered = renderCopy(source, file, sourceRel)
    assert.ok(rendered.startsWith(headerFor(file, sourceRel)))
    assert.equal(stripHeader(rendered, file, sourceRel), source)
    assert.equal(stripHeader('mangled ' + rendered.slice(10), file, sourceRel), undefined)
  }
})

test('stripHeader accepts a Windows CRLF separator', () => {
  const file = 'settings-form.ts'
  const sourceRel = 'shared/client/settings/settings-form.ts'
  const source = 'export const x = 1\r\n'
  const rendered = `${headerFor(file, sourceRel)}\r\n${source}`
  assert.equal(stripHeader(rendered, file, sourceRel), source)
})

test('copies cover each client and host helper and its consuming plugins', () => {
  const entries = copyEntries()
  assert.equal(entries.length, 39)
  assert.deepEqual(entries.filter(entry => entry.file === 'repair-path.mjs').map(entry => entry.target), [
    join(REPO_ROOT, 'apps/dsh-desktop/src/repair-path.mjs'),
    join(REPO_ROOT, 'packages/dsh-desktop-repair/src/repair-path.mjs'),
  ])
  const clientTrio = entries.filter(entry => entry.sourceRel.startsWith('shared/client/settings/'))
  assert.equal(clientTrio.length, 18)
  assert.deepEqual(entries.filter(entry => entry.sourceRel === 'shared/client/sidebar-entry-anchor.ts').map(entry => entry.target),
    ['dsh-ssh', 'dsh-task-board', 'dsh-web-ui-all', 'dsh-live-stats'].map(pkg =>
      join(REPO_ROOT, 'packages', pkg, 'src/client/sidebar-entry-anchor.ts')))
  const telemetryCopies = entries.filter(entry => entry.file === 'feature-telemetry.ts')
  assert.deepEqual(telemetryCopies.map(entry => entry.target), [
    join(REPO_ROOT, 'packages/dsh-web-ui-settings/src/client/feature-telemetry.ts'),
    join(REPO_ROOT, 'packages/dsh-aionui-panel/src/client/feature-telemetry.ts'),
  ])
  const hostCopies = entries.filter(entry => /[\\/]src[\\/]host[\\/]/.test(entry.target) || /[\\/]src[\\/]dsh-home\.ts$/.test(entry.target))
  assert.equal(hostCopies.length, 7)
  for (const file of ['preset-schema.ts', 'preset-registry.ts', 'sync.ts']) {
    const copies = entries.filter(entry => entry.sourceRel === `shared/host/presets/${file}`)
    assert.deepEqual(copies.map(copy => copy.target), [
      join(REPO_ROOT, 'packages/dsh-liangshen/src', file),
      join(REPO_ROOT, 'packages/dsh-value-mode/src', file),
    ])
  }
})

test('checkSync detects drift and applySync repairs it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sync-shared-test-'))
  try {
    // Fake tree: shared source + one consumer copy with wrong content.
    const sourceDir = join(root, 'shared', 'client', 'settings')
    await mkdir(sourceDir, { recursive: true })
    await writeFile(join(sourceDir, 'settings-form.ts'), 'export const good = 1' + String.fromCharCode(10))
    await writeFile(join(sourceDir, 'PluginSettingsCard.tsx'), 'export const card = 1' + String.fromCharCode(10))
    await writeFile(join(sourceDir, 'settings-card.module.css'), '.card { color: red }' + String.fromCharCode(10))
    await writeFile(join(root, 'shared', 'client', 'feature-telemetry.ts'), 'export const event = 1\n')
    await writeFile(join(root, 'shared', 'client', 'sidebar-entry-anchor.ts'), 'export {}\n')
    const hostDir = join(root, 'shared', 'host')
    await mkdir(hostDir, { recursive: true })
    await writeFile(join(hostDir, 'repair-path.mjs'), 'export {}\n')
    await writeFile(join(hostDir, 'poll-guard.ts'), 'export const guard = 1' + String.fromCharCode(10))
    await writeFile(join(hostDir, 'dsh-home.ts'), 'export const home = 1' + String.fromCharCode(10))
    await writeFile(join(hostDir, 'workspace-git-env.ts'), 'export const env = {}\n')
    const presetDir = join(hostDir, 'presets')
    await mkdir(presetDir, { recursive: true })
    for (const file of ['preset-registry.ts', 'preset-schema.ts', 'sync.ts']) {
      await writeFile(join(presetDir, file), 'export {}\n')
    }
    const targetDir = join(root, 'packages', 'dsh-pet', 'src', 'client')
    await mkdir(targetDir, { recursive: true })
    await writeFile(join(targetDir, 'settings-form.ts'), renderCopy('export const bad = 2' + String.fromCharCode(10), 'settings-form.ts', 'shared/client/settings/settings-form.ts'))

    // checkSync compares all consumers; the missing files count as drift too.
    const before = await checkSync(root)
    assert.ok(before.some(entry => entry.reason === 'content drifted from shared source'))
    assert.ok(before.some(entry => entry.reason === 'missing'))

    await applySync(root)
    const after = await checkSync(root)
    assert.deepEqual(after, [])
    const fixed = await readFile(join(targetDir, 'settings-form.ts'), 'utf8')
    assert.equal(stripHeader(fixed, 'settings-form.ts', 'shared/client/settings/settings-form.ts'), 'export const good = 1' + String.fromCharCode(10))
    const telemetry = await readFile(join(root, 'packages/dsh-aionui-panel/src/client/feature-telemetry.ts'), 'utf8')
    assert.equal(stripHeader(telemetry, 'feature-telemetry.ts', 'shared/client/feature-telemetry.ts'), 'export const event = 1\n')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('every generated desktop and plugin source copy has a declared owner', () => {
  const paths = execFileSync('git', [
    'grep', '-l', '-z', '--untracked', '-E', '^(/[*]|//) Generated by scripts/sync-shared[.]mjs from ',
    '--', ':(glob)packages/**/src/**', ':(glob)apps/**/src/**',
  ], { cwd: REPO_ROOT, encoding: 'utf8' }).split('\0').filter(Boolean)
  const declared = copyEntries().map(entry => entry.target).sort()
  assert.deepEqual(paths.map(path => join(REPO_ROOT, path)).sort(), declared)
})

test('the live tree is in sync', async () => {
  const drift = await checkSync()
  assert.deepEqual(drift, [])
})
