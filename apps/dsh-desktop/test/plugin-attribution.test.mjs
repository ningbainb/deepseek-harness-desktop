import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { createPluginInventory } from '../src/extensions/plugins.mjs'

const appDirectory = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = join(appDirectory, '..', '..')

const CONFIRMED_NINGBAINB_MANIFESTS = [
  'packages/dsh-value-mode/package.json',
  'packages/dsh-memory/package.json',
  'packages/dsh-personal-prompt/package.json',
  'packages/dsh-user-scope/package.json',
  'packages/dsh-chat-artifacts/package.json',
  'packages/dsh-model-preferences/package.json',
  'packages/dsh-desktop-compat/package.json',
  'packages/dsh-desktop-repair/package.json',
  'packages/dsh-live-stats/package.json',
  'packages/dsh-particle-theme/package.json',
  'packages/dsh-mode-switcher/package.json',
  'packages/dsh-liangshen/package.json',
  'packages/dsh-web-ui-settings/package.json',
  'packages/dsh-remote-web-ui/package.json',
  'packages/dsh-llm-antigravity/package.json',
  'apps/dsh-desktop/package.json',
]

test('confirmed desktop and plugin manifests attribute author to ningbainb', async () => {
  for (const relativePath of CONFIRMED_NINGBAINB_MANIFESTS) {
    const manifest = JSON.parse(await readFile(join(repoRoot, relativePath), 'utf8'))
    assert.equal(manifest.author, 'ningbainb', `${relativePath} should set author to ningbainb`)
  }
})

test('createPluginInventory attributes confirmed plugins to ningbainb and omits 666 publishers', () => {
  const manifest = {
    dependencies: {
      '@linxin666/dsh-value-mode': '0.1.0',
      '@ningbainb/dsh-memory': '0.1.0',
      '@linxin666/dsh-ssh': '0.1.0',
      'dsh-context': '0.87.1',
    },
    dsh: { profile: { bundles: [] } },
  }
  const installedManifests = new Map([
    ['@linxin666/dsh-value-mode', { version: '0.1.0', author: 'linxin666' }],
    ['@ningbainb/dsh-memory', { version: '0.1.0' }],
    ['@linxin666/dsh-ssh', { version: '0.1.0', author: 'linxin666' }],
    ['dsh-context', { version: '0.87.1', author: 'bowenliang123' }],
  ])

  const inventory = new Map(
    createPluginInventory(manifest, { installedManifests }).map((entry) => [entry.name, entry]),
  )

  assert.equal(inventory.get('@linxin666/dsh-value-mode')?.publisher, 'ningbainb')
  assert.equal(inventory.get('@ningbainb/dsh-memory')?.publisher, 'ningbainb')
  assert.equal(inventory.get('@linxin666/dsh-ssh')?.publisher, undefined)
  assert.equal(inventory.get('dsh-context')?.publisher, 'bowenliang123')
})

test('extensions renderer marks confirmed native plugins as ningbainb and suppresses 666 labels', async () => {
  const source = await readFile(join(appDirectory, 'src', 'ui', 'extensions.mjs'), 'utf8')
  assert.match(source, /id:\s*'value-mode'[\s\S]*?author:\s*'ningbainb'/)
  assert.match(source, /id:\s*'liangshen'[\s\S]*?author:\s*'ningbainb'/)
  assert.match(source, /作者：\$\{item\.author\}/)
  assert.match(source, /\/666\/i\.test\(item\.packageName\)/)
  assert.match(source, /formatInstalledPublisher\(plugin\)/)
})
