import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import test from 'node:test'

import { applyWindowIcon, PACKAGED_APP_ICON_NAME, resolveAppIconPath } from '../src/app-icon.mjs'

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
