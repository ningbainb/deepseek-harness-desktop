import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import vm from 'node:vm'
import { resolveRuntimePackages } from '../src/profile.mjs'

const desktopRequire = createRequire(new URL('../package.json', import.meta.url))
const sidebar = dirname(desktopRequire.resolve('dsh-better-sidebar/package.json'))

// Published SDK clients may be single-line compressed output. These two
// selectors contain a flat body or one nested loop; extract their actual
// declarations without assuming indentation, line breaks or quote style.
function officialSelector(source, name) {
  return source.match(new RegExp(`function\\s+${name}\\([^)]*\\)\\s*\\{(?:[^{}]|\\{[^{}]*\\})*\\}`, 'u'))?.[0]
}

for (const bundle of ['client.js', 'client-registry.js']) {
  test(`${bundle}: produced-file row retains the official list-slot contract and closing Turn`, () => {
    const source = readFileSync(join(sidebar, 'lib', bundle), 'utf8')
    const officialRoot = resolveRuntimePackages().get('@deepseek-ai/dsh-client-ui-deliverables')
    const official = readFileSync(join(officialRoot, 'lib', 'client.js'), 'utf8')
    const selection = officialSelector(official, 'selectProducedFiles')
    const produced = officialSelector(official, 'producedForClosing')
    assert.ok(selection, 'official deliverables must expose its Turn-local produced-file selector')
    assert.ok(produced)
    const select = vm.runInNewContext(`(() => { ${produced}; return (${selection}); })()`)
    const owner = {
      turn: { data: new Map([['deliverables', { produced: [
        { seq: 2, path: 'a.txt' }, { seq: 4, path: 'a.txt' },
        { seq: 5, path: 'b.txt' },
      ] }]]) },
    }
    // The SDK now selects the completed Turn accumulator. Later turns and
    // other sessions own separate data, rather than sharing an event cutoff.
    const nextTurn = { turn: { data: new Map([['deliverables', { produced: [{ seq: 6, path: 'future.txt' }] }]]) } }
    const otherSession = { turn: { data: new Map([['deliverables', { produced: [{ seq: 2, path: 'private.txt' }] }]]) } }
    assert.deepEqual([...select(owner)], ['a.txt', 'b.txt'])
    assert.deepEqual([...select(nextTurn)], ['future.txt'])
    assert.deepEqual([...select(otherSession)], ['private.txt'])
    assert.deepEqual([...select(owner)], ['a.txt', 'b.txt'])
    assert.equal(select({ ...owner, turn: { data: new Map() } }), null)
    assert.match(official, /name:\s*(["'`])conversation\.chat\.turnTail\1,\s*id:\s*(["'`])@deepseek-ai\/dsh-client-ui-deliverables\2/u)
    assert.match(official, /ctx\.provide\(\s*(["'`])chatFileMentions\1/u)
    assert.doesNotMatch(official, /select:\s*(?:\(owner\)|owner)\s*=>/u)
    assert.doesNotMatch(source, /id:\s*(["'`])dsh-better-sidebar-produced-files\1/u)
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
