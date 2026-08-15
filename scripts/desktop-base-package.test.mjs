import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageDir = join(root, 'packages', 'dsh-desktop-base')

function patchRows(text) {
  const lines = text.split(/\r?\n/u)
  const rows = []
  for (let index = 0; index < lines.length; index += 1) {
    const id = lines[index].trim().match(/^-\s+id:\s+([^\s]+)$/u)?.[1]
    if (id === undefined) continue
    const name = lines[index + 1]?.trim().match(/^name:\s+['"]?([^'"\s]+)['"]?$/u)?.[1]
    if (name !== undefined) rows.push({ id, name })
  }
  return rows
}

test('desktop base aggregate has a publishable pinned manifest', async () => {
  const manifest = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8'))

  assert.equal(manifest.name, 'dsh-desktop-base')
  assert.equal(manifest.version, '0.1.0')
  assert.equal(manifest.license, 'BSD-3-Clause')
  assert.deepEqual(manifest.dsh, { bundle: { patch: './cordis.patch.yml' } })
  assert.deepEqual(manifest.publishConfig, {
    access: 'public',
    registry: 'https://registry.npmjs.org/',
  })
  assert.deepEqual(manifest.dependencies, {
    '@linxin666/dsh-web-ui-all': 'workspace:0.1.15',
    'dsh-codex-connect': '0.1.0-alpha.4.5',
    dshmarket: '1.3.0',
    'reasoning-slider': '0.0.2',
  })
  assert.equal(Object.keys(manifest.dependencies).some((name) => name.startsWith('@tencent-connect/')), false)
})

test('desktop base patch activates every approved child and excludes QQ Bot', async () => {
  const [aggregatePatch, webUiPatch] = await Promise.all([
    readFile(join(packageDir, 'cordis.patch.yml'), 'utf8'),
    readFile(join(root, 'packages', 'dsh-web-ui-all', 'cordis.patch.yml'), 'utf8'),
  ])
  const aggregateRows = patchRows(aggregatePatch)

  for (const row of patchRows(webUiPatch)) {
    assert.equal(
      aggregateRows.some((candidate) => candidate.id === row.id && candidate.name === row.name),
      true,
      `missing ${row.id} -> ${row.name}`,
    )
  }
  for (const expected of [
    { id: 'dsh-market', name: 'dshmarket' },
    { id: 'llm-openai-codex', name: 'dsh-codex-connect' },
    { id: 'reasoning-slider', name: 'reasoning-slider' },
  ]) {
    assert.equal(
      aggregateRows.some((candidate) => candidate.id === expected.id && candidate.name === expected.name),
      true,
      `missing ${expected.id} -> ${expected.name}`,
    )
  }
  assert.equal(aggregateRows.some(({ id, name }) => /qqbot|tencent/u.test(`${id} ${name}`)), false)
  assert.match(aggregatePatch, /enableSearch:\s+false/u)
  assert.match(aggregatePatch, /enableImageTool:\s+false/u)
})

test('desktop base package documents upstream ownership', async () => {
  const [readme, notices] = await Promise.all([
    readFile(join(packageDir, 'README.md'), 'utf8'),
    readFile(join(packageDir, 'THIRD_PARTY_NOTICES.md'), 'utf8'),
  ])

  assert.match(readme, /dsh plugin .* add dsh-desktop-base/u)
  for (const name of ['@linxin666/dsh-web-ui-all', 'dshmarket', 'dsh-codex-connect', 'reasoning-slider']) {
    assert.match(notices, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'))
  }
})
