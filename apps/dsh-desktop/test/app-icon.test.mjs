import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import test from 'node:test'

import { applyWindowIcon, PACKAGED_APP_ICON_NAME, resolveAppIconPath } from '../src/app-icon.mjs'
import { verifyBrandingAssets } from '../scripts/verify-branding-assets.mjs'
import { iconAssetBytesEqual } from '../scripts/icon-asset-bytes.mjs'

test('brand checks normalize only generated text line endings and preserve exact binary checks', () => {
  const canonical = Buffer.from('export const icon = "fixture"\n')
  const windows = Buffer.from('export const icon = "fixture"\r\n')
  assert.equal(iconAssetBytesEqual('app-brand-icon.generated.ts', windows, canonical), true)
  assert.equal(iconAssetBytesEqual('icon.png', windows, canonical), false)
  assert.equal(iconAssetBytesEqual('icon.ico', windows, canonical), false)
  assert.equal(iconAssetBytesEqual('icon.icns', windows, canonical), false)
  assert.equal(iconAssetBytesEqual('app-brand-icon.generated.ts', Buffer.from('changed\n'), canonical), false)
  assert.equal(iconAssetBytesEqual('icon.png', undefined, canonical), false)
})

test('Desktop artwork preserves the verified 4.4.0 icon across every build format', async () => {
  const manifest = await verifyBrandingAssets(join(import.meta.dirname, '..'))
  assert.equal(manifest.artworkVersion, '4.4.0')
})

test('packaged icon verification rejects replaced artwork', async () => {
  const appDirectory = join(import.meta.dirname, '..')
  const resources = await mkdtemp(join(tmpdir(), 'dsh-branding-'))
  try {
    await writeFile(join(resources, 'app-icon.png'), await readFile(join(appDirectory, 'build', 'icon.png')))
    await verifyBrandingAssets(appDirectory, { resources })
    await writeFile(join(resources, 'app-icon.png'), 'replaced artwork')
    await assert.rejects(verifyBrandingAssets(appDirectory, { resources }), /must match the pinned branding artwork/u)
  } finally {
    await rm(resources, { recursive: true, force: true })
  }
})

test('development icon resolves to the shared build artwork', () => {
  assert.equal(
    resolveAppIconPath({ isPackaged: false, sourceDir: join('repo', 'apps', 'dsh-desktop', 'src') }),
    join('repo', 'apps', 'dsh-desktop', 'build', 'icon.png'),
  )
})

test('packaged icon resolves beside app.asar resources', () => {
  assert.equal(PACKAGED_APP_ICON_NAME, 'app-icon.png')
  assert.equal(
    resolveAppIconPath({ isPackaged: true, resourcesPath: join('install', 'resources') }),
    join('install', 'resources', 'app-icon.png'),
  )
})

test('runtime icon is applied explicitly to a BrowserWindow', () => {
  const calls = []
  const window = { setIcon: (icon) => calls.push(icon) }
  const icon = { source: 'kawaii-deepseek' }
  assert.equal(applyWindowIcon(window, icon), window)
  assert.deepEqual(calls, [icon])
})

test('all platform and in-app brand icons match the canonical source', () => {
  const result = spawnSync(process.execPath, ['scripts/generate-app-icons.mjs', '--check'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /verified 7 app icon assets/u)
})
