import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Extension Dock presents declared Desktop compatibility requirements and runtime evidence', async () => {
  const source = await readFile(new URL('../src/ui/extensions.mjs', import.meta.url), 'utf8')

  assert.match(source, /function compatibilityFacts\(compatibility\)/u)
  assert.match(source, /Desktop API \$\{requirements\.desktopApi\}/u)
  assert.match(source, /需要能力 \$\{requirements\.capabilities\.join\(', '\)\}/u)
  assert.match(source, /需要 Surface \$\{requirements\.surfaces\.join\(', '\)\}/u)
  assert.match(source, /已测 DSH \$\{tested\.runtime\}/u)
  assert.match(source, /'desktop-api-range'/u)
  assert.match(source, /'capability-missing'/u)
  assert.match(source, /'surface-unsupported'/u)
  assert.match(source, /'known-native-image-drop-conflict'/u)
  assert.match(source, /会抢占原生图片拖放事件/u)
  assert.match(source, /保留安装状态，请移除或改用后续经验证版本/u)
})

test('Extension Dock exposes only installed discover and settings as plugin top-level areas', async () => {
  const html = await readFile(new URL('../src/ui/extensions.html', import.meta.url), 'utf8')
  const group = /<nav class="page-tabs" data-tab-group="plugins"[\s\S]*?<\/nav>/u.exec(html)?.[0] ?? ''
  assert.match(group, />已安装 /u)
  assert.match(group, />发现插件 /u)
  assert.match(group, />设置</u)
  assert.doesNotMatch(group, />内置能力 /u)
})

test('Extension Dock keeps healthy plugin state quiet and technical fields inside advanced information', async () => {
  const script = await readFile(new URL('../src/ui/extensions.mjs', import.meta.url), 'utf8')
  assert.match(script, /if \(presentation\.label === ''\) return ''/u)
  assert.doesNotMatch(script, /badge compatible[^\n]*compatibilityLabels/u)
  assert.match(script, /plugin-advanced-information/u)
  for (const field of ['Compatibility', 'Runtime Range', 'Source', 'Package Name', 'Integrity']) {
    assert.match(script, new RegExp(field, 'u'))
  }
})

test('Extension Dock plugin dialogs and icon-only controls have accessible contracts', async () => {
  const [html, script] = await Promise.all([
    readFile(new URL('../src/ui/extensions.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/extensions.mjs', import.meta.url), 'utf8'),
  ])
  assert.match(html, /<dialog id="plugin-dialog"[^>]*aria-labelledby="plugin-dialog-title"[^>]*aria-describedby="plugin-dialog-description"/u)
  assert.match(html, /role="status" aria-live="polite"/u)
  assert.match(script, /event\.key === 'Escape'/u)
  assert.match(script, /event\.key !== 'Tab'/u)
  assert.match(script, /aria-label="查看 /u)
  assert.match(script, /aria-label="返回已安装插件"/u)
})

test('Extension Dock does not expose the retired permission reconfirmation control', async () => {
  const [html, script] = await Promise.all([
    readFile(new URL('../src/ui/extensions.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/extensions.mjs', import.meta.url), 'utf8'),
  ])
  for (const source of [html, script]) {
    assert.doesNotMatch(source, /revoke-full-user-trust/u)
    assert.doesNotMatch(source, /下次启动.*重新确认/u)
  }
})

test('Extension Dock exposes scoped network diagnostics without claiming API or installer probes', async () => {
  const [html, script] = await Promise.all([
    readFile(new URL('../src/ui/extensions.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/extensions.mjs', import.meta.url), 'utf8'),
  ])
  assert.match(html, /id="run-network-diagnostics"/u)
  assert.match(html, /模型 API 与安装子进程会明确标为未探测/u)
  assert.match(script, /official-provider-endpoint-not-exposed/u)
  assert.match(script, /pnpm-proxy-transport-unverified/u)
  assert.match(script, /runNetworkDiagnostics\(\)/u)
})

test('Extension Dock keeps migration spacing in CSP-compatible stylesheet rules', async () => {
  const [html, css] = await Promise.all([
    readFile(new URL('../src/ui/extensions.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/extensions.css', import.meta.url), 'utf8'),
  ])
  assert.doesNotMatch(html, /style=/u)
  assert.match(html, /class="panel-head migration-panel-head"/u)
  assert.match(css, /\.migration-panel-head\s*\{\s*margin-top: 32px;\s*\}/u)
})

test('Extension Dock keeps read-only startup work outside the mutation-wide busy queue', async () => {
  const [html, script] = await Promise.all([
    readFile(new URL('../src/ui/extensions.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/extensions.mjs', import.meta.url), 'utf8'),
  ])
  assert.match(html, /id="dock-settings-state"[^>]*hidden/u)
  assert.match(html, /id="dock-settings-retry"[^>]*hidden/u)
  assert.match(script, /let marketRefreshPromise/u)
  assert.match(script, /let pluginUpdatePromise/u)
  assert.match(script, /listCommunityMarket\(force\)/u)
  assert.match(script, /refreshMarket\(\{ force: true \}\)/u)
  assert.match(script, /await refresh\(\)[\s\S]*void refreshMarket\(\)[\s\S]*void checkPluginUpdates/u)
  assert.doesNotMatch(script, /await extensionOperations\.run\(refresh\)/u)
  assert.doesNotMatch(script, /extensionOperations\.run\(\(\) => checkPluginUpdates/u)
})
