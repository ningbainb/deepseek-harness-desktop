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
