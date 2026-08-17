import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = (relative) => readFile(new URL(relative, import.meta.url), 'utf8')

test('safe mode is visible and exposes one-click recovery outside the runtime renderer', async () => {
  const [html, renderer, preload, electron] = await Promise.all([
    source('../src/ui/extensions.html'),
    source('../src/ui/extensions.mjs'),
    source('../src/preload.cjs'),
    source('../src/electron-app.mjs'),
  ])

  assert.match(html, /id="restore-safe-mode"[^>]*hidden/u)
  assert.match(renderer, /restoreDisabledPlugins\(\)/u)
  assert.match(renderer, /restoreSafeMode\.hidden = !state\.safeMode/u)
  assert.match(preload, /extensions:recovery-restore-all/u)
  assert.match(electron, /title: '插件安全模式'/u)
  assert.match(electron, /buttons: \['打开插件恢复', '稍后'\]/u)
})
