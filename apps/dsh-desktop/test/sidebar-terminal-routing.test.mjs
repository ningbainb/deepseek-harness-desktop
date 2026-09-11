import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import vm from 'node:vm'

const desktopRequire = createRequire(new URL('../package.json', import.meta.url))
const aggregateRequire = createRequire(desktopRequire.resolve('@linxin666/dsh-web-ui-all/package.json'))
const sidebar = dirname(aggregateRequire.resolve('dsh-better-sidebar/package.json'))

for (const bundle of ['client.js', 'client-registry.js']) {
  test(`${bundle}: UI terminals use Desktop, without stealing web, agent or inactive-session PTYs`, async () => {
    const source = readFileSync(join(sidebar, 'lib', bundle), 'utf8')
    const start = source.indexOf('const openTab = (seed, scope) => {')
    const end = source.indexOf('const descriptor = tabs.get(seed.type);', start)
    assert.ok(start >= 0 && end > start)
    const calls = [], alerts = []
    let enabled = true
    const window = { dshDesktop: { shellContext: { mode: 'advanced' }, toolAction: async action => calls.push(action) }, alert: text => alerts.push(text) }
    const availability = source.split('\n').find(line => line.includes('available:') && line.includes('uiTerminalCount(state)'))
    assert.ok(availability)
    const available = vm.runInNewContext(`(${availability.trim().replace(/^available: /u, '').replace(/,$/u, '')})`, { window, uiTerminalCount: () => 3 })
    assert.equal(available(null, null, {}), true, 'old plugin quota cannot disable the native terminal entry')
    const open = vm.runInNewContext(`${source.slice(start, end)} return 'plugin-pty' }; openTab`, {
      window, console: { warn() {} }, isTabEnabled: () => enabled,
      store: { getSnapshot: () => ({ sessionId: 'active' }) },
    })
    assert.equal(open({ type: 'terminal' }, { sessionId: 'active' }), undefined)
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(calls, ['terminal-open'])
    assert.equal(open({ type: 'terminal', id: 'agent:owned' }), 'plugin-pty')
    assert.equal(open({ type: 'terminal' }, { sessionId: 'background' }), 'plugin-pty')
    assert.equal(open({ type: 'editor' }), 'plugin-pty')
    enabled = false
    open({ type: 'terminal' })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(calls.length, 1, 'disabled entries cannot open a Desktop terminal')
    enabled = true
    window.dshDesktop.toolAction = async () => { throw new Error('fixture failure') }
    open({ type: 'terminal' })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(alerts.length, 1, 'a failed bridge must not look like a dead click')
    delete window.dshDesktop
    assert.equal(available(null, null, {}), false, 'web PTY quota remains enforced')
    assert.equal(open({ type: 'terminal' }), 'plugin-pty')
  })
}
