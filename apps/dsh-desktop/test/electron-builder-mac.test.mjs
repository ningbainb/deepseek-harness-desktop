import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import YAML from 'yaml'

const appDirectory = join(dirname(fileURLToPath(import.meta.url)), '..')

async function readPackagingConfig() {
  return YAML.parse(await readFile(join(appDirectory, 'electron-builder.yml'), 'utf8'))
}

test('mac packaging is unsigned arm64 dmg+zip without Intel or universal targets', async () => {
  const config = await readPackagingConfig()
  assert.equal(config.mac.identity, null)
  assert.equal(config.mac.hardenedRuntime, false)
  assert.equal(config.mac.forceCodeSigning, false)
  assert.equal(config.mac.icon, 'build/icon.icns')
  assert.equal(config.mac.category, 'public.app-category.developer-tools')
  assert.equal(config.mac.minimumSystemVersion, '11.0')
  assert.equal(config.mac.entitlements, 'build/entitlements.mac.plist')
  assert.equal(config.mac.entitlementsInherit, 'build/entitlements.mac.inherit.plist')
  assert.equal(config.mac.artifactName, 'DeepSeek-Harness-Desktop-${version}-${arch}.${ext}')
  assert.equal(config.dmg.artifactName, 'DeepSeek-Harness-Desktop-${version}-${arch}.${ext}')

  const targets = config.mac.target
  assert.ok(Array.isArray(targets))
  assert.deepEqual(targets.map((entry) => entry.target).sort(), ['dmg', 'zip'])
  for (const entry of targets) {
    assert.deepEqual(entry.arch, ['arm64'])
  }
  const serialized = JSON.stringify(config.mac)
  assert.equal(serialized.includes('x64'), false)
  assert.equal(serialized.includes('universal'), false)
  assert.equal(serialized.includes('ia32'), false)
})

test('bundled MinGit stays a Windows extra resource and is not a mac extra resource', async () => {
  const config = await readPackagingConfig()
  const topLevel = config.extraResources ?? []
  const windows = config.win?.extraResources ?? []
  const mac = config.mac?.extraResources ?? []
  assert.equal(topLevel.some((entry) => entry.to === 'managed-git/current'), false)
  assert.equal(
    windows.some((entry) => (
      entry.from === 'build/bundled-managed-git/managed-git/current'
      && entry.to === 'managed-git/current'
    )),
    true,
  )
  assert.equal(mac.some?.((entry) => entry.to === 'managed-git/current') ?? false, false)
})

test('mac icon and entitlements files exist in the expected formats', async () => {
  const icns = await readFile(join(appDirectory, 'build', 'icon.icns'))
  assert.equal(icns.subarray(0, 4).toString('ascii'), 'icns')
  assert.ok(icns.byteLength > 1024)

  const entitlements = await readFile(join(appDirectory, 'build', 'entitlements.mac.plist'), 'utf8')
  const inherit = await readFile(join(appDirectory, 'build', 'entitlements.mac.inherit.plist'), 'utf8')
  assert.match(entitlements, /com\.apple\.security\.cs\.allow-jit/u)
  assert.match(entitlements, /com\.apple\.security\.cs\.disable-library-validation/u)
  assert.doesNotMatch(entitlements, /com\.apple\.security\.app-sandbox/u)
  assert.match(inherit, /com\.apple\.security\.inherit/u)
  assert.doesNotMatch(inherit, /com\.apple\.security\.app-sandbox/u)
})
