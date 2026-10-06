import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const stylesheet = await readFile(new URL('../src/ui/extensions.css', import.meta.url), 'utf8')
const html = await readFile(new URL('../src/ui/extensions.html', import.meta.url), 'utf8')
const base = await readFile(new URL('../src/ui/harness-base.css', import.meta.url), 'utf8')

test('Dock surfaces use opaque inherited colors without backdrop compositing', () => {
  assert.doesNotMatch(stylesheet, /(?:-webkit-)?backdrop-filter:\s*(?!none)[^;]*blur/u)
  assert.doesNotMatch(stylesheet, /background:[^;]*gradient/u)
  assert.match(stylesheet, /--glass-sidebar-bg:\s*var\(--harness-bg-subtle\)/u)
  assert.match(stylesheet, /--glass-toolbar-bg:\s*var\(--harness-bg\)/u)
  assert.match(stylesheet, /--glass-card-bg:\s*var\(--harness-bg\)/u)
  assert.match(stylesheet, /--glass-shadow:\s*none/u)
})

test('Dock pointer feedback preserves navigation geometry and visible keyboard focus', () => {
  assert.doesNotMatch(stylesheet, /transform:\s*translateY/u)
  assert.match(stylesheet, /box-shadow:\s*inset 2px 0 var\(--harness-accent\)/u)
  assert.match(stylesheet, /outline:\s*2px solid var\(--harness-accent\)/u)
  assert.match(base, /button:focus-visible/u)
})

test('Dock readability changes preserve all fifteen destinations and the search control', () => {
  const sidebar = html.slice(html.indexOf('<aside class="settings-sidebar">'), html.indexOf('</aside>'))
  const ids = [...sidebar.matchAll(/id="([^"]+-tab)"/gu)].map(match => match[1])
  assert.deepEqual(ids, ['control-center', 'models', 'value-mode', 'personal-prompt', 'describe-image', 'usage', 'sessions',
    'plugins-hub', 'plugin-options', 'skills', 'qqbot', 'appearance', 'particle-theme', 'backup', 'recovery'].map(id => `${id}-tab`))
  assert.match(sidebar, /id="dock-search"[^>]+type=|type="search"[^>]+id="dock-search"/u)
  assert.match(stylesheet, /height: 28px; min-height: 28px; font-size: 13px/u)
})
