import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import {
  BUILTIN_BUNDLES,
  BUILTIN_RUNTIME_PACKAGES,
  createDesktopProfileManifest,
} from '../src/profile.mjs'

const releasePlugins = [
  '@local/dsh-prompt-pilot',
  'dsh-dafeiyu-pet',
  'dsh-builtin-browser',
  '@linxin666/dsh-release-plugin-adapter',
]

test('5.2.0 profiles mount each release plugin once and retain existing companions and browser capabilities', () => {
  const manifest = createDesktopProfileManifest()
  for (const name of releasePlugins) {
    assert.equal(BUILTIN_BUNDLES.filter(value => value === name).length, 1, `${name}: one top-level mount`)
    assert.equal(manifest.dsh.profile.bundles.filter(value => value === name).length, 1, `${name}: fresh profile mount`)
    assert.ok(BUILTIN_RUNTIME_PACKAGES.includes(name), `${name}: managed package closure`)
  }
  for (const name of ['@linxin666/dsh-pet', '@linxin666/dsh-client-ui-aionui-panel', '@deepseek-ai/dsh-browser-use']) {
    assert.ok(BUILTIN_RUNTIME_PACKAGES.includes(name), `${name}: existing capability retained`)
  }
  assert.ok(BUILTIN_BUNDLES.indexOf('@linxin666/dsh-release-plugin-adapter') > BUILTIN_BUNDLES.indexOf('dsh-dafeiyu-pet'))
})

test('5.2.0 pins release input tarballs without pulling a second Electron runtime', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const selected = {
    '@local/dsh-prompt-pilot': 'dsh-prompt-pilot-1.2.3.tgz',
    'dsh-dafeiyu-pet': 'dsh-dafeiyu-pet-0.2.0.tgz',
    'dsh-builtin-browser': 'dsh-builtin-browser-0.4.14.tgz',
  }
  for (const [name, filename] of Object.entries(selected)) {
    assert.equal(manifest.dependencies[name], `file:../../vendor/plugins-20261026/${filename}`)
  }
  const workspace = parse(readFileSync(new URL('../../../pnpm-workspace.yaml', import.meta.url), 'utf8'))
  assert.equal(workspace.overrides['dsh-builtin-browser>electron'], manifest.devDependencies.electron)
})
