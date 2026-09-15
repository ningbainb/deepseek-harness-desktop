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

async function readPackageManifest() {
  return JSON.parse(await readFile(join(appDirectory, 'package.json'), 'utf8'))
}

test('Linux packaging is x64 AppImage and deb with stable artifact names', async () => {
  const config = await readPackagingConfig()
  const manifest = await readPackageManifest()
  assert.equal(manifest.homepage, 'https://github.com/ningbainb/deepseek-harness-desktop')
  assert.equal(manifest.desktopName, config.appId)
  assert.equal(config.linux.icon, 'build/icon.png')
  assert.equal(config.linux.category, 'Development')
  assert.equal(config.linux.maintainer, 'ningbainb <ningbainb@users.noreply.github.com>')
  assert.equal(config.linux.vendor, 'ningbainb')
  assert.equal(config.linux.executableName, 'deepseek-harness-desktop')
  assert.equal(config.linux.syncDesktopName, true)
  assert.deepEqual(config.linux.target.map((entry) => entry.target), ['AppImage', 'deb'])
  for (const entry of config.linux.target) assert.deepEqual(entry.arch, ['x64'])
  assert.equal(config.appImage.artifactName, 'DeepSeek-Harness-Desktop-${version}-x86_64.${ext}')
  assert.equal(config.deb.artifactName, 'DeepSeek-Harness-Desktop-${version}-amd64.${ext}')
  assert.equal(config.deb.packageCategory, 'devel')
})

test('Linux packaging uses system Git and never inherits bundled MinGit', async () => {
  const config = await readPackagingConfig()
  const topLevel = config.extraResources ?? []
  const linux = config.linux?.extraResources ?? []
  assert.equal(topLevel.some((entry) => entry.to === 'managed-git/current'), false)
  assert.equal(linux.some((entry) => entry.to === 'managed-git/current'), false)
  assert.equal(config.win.extraResources.some((entry) => entry.to === 'managed-git/current'), true)
})
