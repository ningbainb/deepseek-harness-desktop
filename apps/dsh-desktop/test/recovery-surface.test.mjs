import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = (relative) => readFile(new URL(relative, import.meta.url), 'utf8')

test('safe mode is visible and exposes one-click recovery outside the runtime renderer', async () => {
  const [html, renderer, preload, electron] = await Promise.all([
    source('../src/ui/extensions.html'),
    source('../src/ui/extensions.mjs'),
    source('../src/preload-extension.cjs'),
    source('../src/electron-app.mjs'),
  ])

  assert.match(html, /id="restore-safe-mode"[^>]*hidden/u)
  assert.match(html, /type="checkbox"[^>]*id="automatic-safe-mode"/u)
  assert.match(html, /for="automatic-safe-mode"/u)
  assert.match(renderer, /restoreDisabledPlugins\(\)/u)
  assert.match(renderer, /setAutomaticSafeMode\(enabled\)/u)
  assert.match(renderer, /automaticSafeMode\.checked = state\.automaticSafeMode !== false/u)
  assert.match(renderer, /restoreSafeMode\.hidden = !state\.safeMode/u)
  assert.match(renderer, /baselineQuarantineAvailable/u)
  assert.match(renderer, /恢复原始加载配置并重启/u)
  assert.match(preload, /extensions:recovery-restore-all/u)
  assert.match(preload, /extensions:recovery-automatic-safe-mode-set/u)
  assert.match(electron, /getAutomaticSafeMode: \(\) => automaticSafeMode/u)
  assert.match(electron, /title: '插件安全模式'/u)
  assert.match(electron, /buttons: \['打开插件恢复', '稍后'\]/u)
})
