import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { test } from 'node:test'

const desktopRequire = createRequire(new URL('../package.json', import.meta.url))
const sidebar = dirname(desktopRequire.resolve('dsh-better-sidebar/package.json'))

for (const bundle of ['client.js', 'client-registry.js']) {
  test(`${bundle}: sidebar leaves terminal and browser tabs to the official host`, () => {
    const source = readFileSync(join(sidebar, 'lib', bundle), 'utf8')
    const start = source.indexOf('function builtinTabs() {')
    const end = source.indexOf('for (const tab of builtinTabs())', start)
    assert.ok(start >= 0 && end > start, 'the shipped bundle registers built-in tabs')
    const registration = source.slice(start, end)
    for (const id of ['editor', 'git', 'subagent', 'sidechat', 'diff']) {
      assert.match(registration, new RegExp(`id: "${id}"`, 'u'), `${id} remains available`)
    }
    assert.doesNotMatch(registration, /id: "(?:terminal|browser)"/u, 'official host retains terminal and browser ownership')
  })
}

test('Desktop still handles explicit terminal-open requests', () => {
  const ipc = readFileSync(new URL('../src/ipc.mjs', import.meta.url), 'utf8')
  const electron = readFileSync(new URL('../src/electron-app.mjs', import.meta.url), 'utf8')
  assert.match(ipc, /TOOL_ACTIONS = new Set\(\[[^\]]*'terminal-open'/u)
  assert.match(electron, /action === 'terminal-open'\) return toggleDesktopTerminal\(\{ openOnly: true \}\)/u)
})
