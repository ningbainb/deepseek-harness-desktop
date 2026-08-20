import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (name) => readFile(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('main preload exposes product actions without extension mutation channels', async () => {
  const source = await read('preload-main.cjs')
  assert.match(source, /desktop:contract/u)
  assert.doesNotMatch(source, /require\(['"]\.\/preload-common\.cjs['"]\)/u)
  assert.match(source, /desktop:update-install/u)
  assert.match(source, /desktop:skills-list/u)
  assert.match(source, /desktop:settings-window-bounds-get/u)
  assert.match(source, /desktop:settings-window-bounds-set/u)
  assert.doesNotMatch(source, /desktop:background-status/u)
  assert.doesNotMatch(source, /desktop:close-behavior-(?:get|set)/u)
  assert.doesNotMatch(source, /extensions:plugin-(?:install|update|remove|enable)/u)
  assert.doesNotMatch(source, /extensions:skill-import/u)
  assert.doesNotMatch(source, /extensions:qqbot-/u)
})

test('extension preload exposes extension operations without product update actions', async () => {
  const source = await read('preload-extension.cjs')
  assert.match(source, /desktop:contract/u)
  assert.doesNotMatch(source, /require\(['"]\.\/preload-common\.cjs['"]\)/u)
  assert.match(source, /extensions:plugin-install/u)
  assert.match(source, /extensions:recovery-automatic-safe-mode-set/u)
  assert.match(source, /extensions:skill-import/u)
  assert.match(source, /extensions:qqbot-bind/u)
  assert.doesNotMatch(source, /desktop:update-install/u)
  assert.doesNotMatch(source, /desktop:action/u)
  assert.doesNotMatch(source, /desktop:deep-link/u)
})

test('Electron binds each renderer window to its dedicated preload', async () => {
  const source = await read('electron-app.mjs')
  assert.match(source, /preload:\s*MAIN_PRELOAD_PATH/u)
  assert.match(source, /secondaryWindowWebPreferences\(\{ preload: EXTENSION_PRELOAD_PATH \}\)/u)
  assert.match(source, /DESKTOP_SURFACES\.COMMUNITY/u)
})
