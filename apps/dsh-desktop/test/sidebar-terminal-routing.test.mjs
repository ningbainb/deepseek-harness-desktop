import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import vm from 'node:vm'
import { resolveRuntimePackages } from '../src/profile.mjs'

const desktopRequire = createRequire(new URL('../package.json', import.meta.url))
const sidebar = dirname(desktopRequire.resolve('dsh-better-sidebar/package.json'))

for (const bundle of ['client.js', 'client-registry.js']) {
  test(`${bundle}: produced-file row retains the official rc.2 list-slot contract and closing Turn`, () => {
    const source = readFileSync(join(sidebar, 'lib', bundle), 'utf8')
    const officialRoot = resolveRuntimePackages().get('@deepseek-ai/dsh-client-ui-deliverables')
    const official = readFileSync(join(officialRoot, 'lib', 'client.js'), 'utf8')
    const selection = official.match(/function selectProducedFiles\(owner\) \{[\s\S]*?\n\t\t\}/u)?.[0]
    const produced = official.match(/function producedForClosing\([\s\S]*?\n\t\t\}/u)?.[0]
    assert.ok(selection, 'official deliverables must expose its Turn-local produced-file selector')
    assert.ok(produced)
    const select = vm.runInNewContext(`(() => { ${produced}; return (${selection}); })()`)
    const owner = {
      seq: 5,
      turn: { data: new Map([['deliverables', { produced: [
        { seq: 2, path: 'a.txt' }, { seq: 4, path: 'a.txt' },
        { seq: 5, path: 'b.txt' }, { seq: 6, path: 'future.txt' },
      ] }]]) },
    }
    assert.deepEqual([...select(owner)], ['a.txt', 'b.txt'])
    assert.equal(select({ ...owner, turn: { data: new Map() } }), null)
    assert.match(official, /name: "conversation.chat.turnTail",\s*id: "@deepseek-ai\/dsh-client-ui-deliverables"/u)
    assert.match(official, /ctx\.provide\("chatFileMentions"/u)
    assert.doesNotMatch(official, /select: \(owner\)/u)
    assert.doesNotMatch(source, /id: "dsh-better-sidebar-produced-files"/u)
  })

  test(`${bundle}: UI terminals use Desktop, without stealing web, agent or inactive-session PTYs`, async () => {
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
