import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import test from 'node:test'
import * as fixture from '../scripts/native-browser-session-fixture.mjs'
import { desktopDeepLink } from '../src/distribution-identity.mjs'

async function browserFixture(context, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'native-browser-session-unit-'))
  context.after(() => {
    const target = resolve(directory)
    assert.equal(dirname(target), resolve(tmpdir()))
    assert.ok(basename(target).startsWith('native-browser-session-unit-'))
    return rm(target, { recursive: true, force: true })
  })
  context.mock.method(console, 'error', () => {})
  context.mock.method(console, 'log', () => {})
  const logPath = join(directory, 'session.v4.jsonl')
  const originalLog = Buffer.from([0x41, 0x80, 0x0d, 0x0a])
  await writeFile(logPath, originalLog)
  const workspacePath = 'E:/fixture-workspace'
  const seats = [
    { sessionId: 'session-a', cwd: workspacePath, blank: false },
    { sessionId: 'old-draft-1', cwd: workspacePath, blank: true },
    { sessionId: 'old-draft-2', cwd: workspacePath, blank: true },
    { sessionId: 'unrelated', cwd: 'E:/other-workspace', blank: true },
  ]
  const state = { current: 'session-a', newClicks: 0, navigation: [], unrouted: 0, browsers: new Map(),
    archived: new Set(['old-draft-2']), archiveCalls: [] }
  let seatReads = 0
  const browser = () => state.browsers.get(state.current)
  const visible = () => browser()?.visible === true
  const input = {
    fill: async value => { browser().input = value },
    inputValue: async () => browser().input,
    press: async key => {
      if (key === 'Enter') browser().src = browser().input
      else { assert.equal(key, 'Control+w'); browser().visible = false }
    },
  }
  const iframe = { getAttribute: async name => { assert.equal(name, 'src'); return browser().src } }
  const body = {
    count: async () => Number(visible()),
    waitFor: async ({ state: expected }) => assert.equal(visible(), expected === 'visible', 'browser visibility must follow real navigation'),
    locator: selector => {
      if (selector === 'input') return input
      if (selector === 'iframe') return iframe
      assert.equal(selector, '[data-dsh-browser-close]')
      return { count: async () => 0 }
    },
    frameLocator: () => ({ getByText: () => ({ waitFor: async () => assert.match(browser().src, /^https:\/\/native-session-browser.test\//u) }) }),
  }
  const floating = {
    filter: () => floating,
    waitFor: async ({ state: expected }) => assert.equal(visible() && browser().floating === true, expected === 'visible'),
    getByRole: () => ({ click: async () => { browser().visible = false } }),
  }
  const panel = {
    waitFor: async () => {},
    getByRole: role => role === 'tab'
      ? { filter: () => ({ count: async () => 1, click: async () => {}, boundingBox: async () => ({ x: 0, y: 0, width: 100, height: 30 }) }) }
      : { click: async () => { state.browsers.set(state.current, { input: '', src: null, visible: true, floating: false }) } },
  }
  const newSession = {
    filter: () => newSession,
    count: async () => 1,
    click: async () => {
      state.newClicks += 1
      const count = options.createdCount ?? 1
      for (let index = 0; index < count; index++) {
        seats.push({ sessionId: index === 0 ? 'session-b' : 'session-c', cwd: options.wrongWorkspace ? 'E:/wrong' : workspacePath, blank: !options.nonblankB })
      }
      state.current = count === 0 ? 'old-draft-1' : 'session-b'
      if (options.duplicateId) seats.push({ ...seats[0] })
      if (options.dropOldOnCreate) seats.splice(1, 1)
      if (options.leakBrowser) state.browsers.set(state.current, { ...state.browsers.get('session-a') })
    },
  }
  const page = {
    url: () => 'dsh-runtime://app/',
    route: async () => { if (options.failRoute) throw new Error('fixture route setup failed') },
    unroute: async () => { state.unrouted += 1 },
    locator: selector => {
      if (selector === '[data-aionui-native-panel="browser"]') return body
      if (selector.includes('float-host')) return floating
      if (selector.includes('expand]')) return { count: async () => 0 }
      assert.equal(selector, '[data-sidebar-right-panel]')
      return panel
    },
    getByRole: role => role === 'button' ? newSession : { evaluateAll: async () => [] },
    waitForFunction: async predicate => {
      assert.notEqual(predicate.constructor.name, 'AsyncFunction', 'no asynchronous Playwright predicate')
      const document = { querySelectorAll: () => ({ length: state.current === 'session-a' ? 20 : 0 }) }
      assert.equal(new Function('document', `return (${predicate})()`)(document), true,
        'public navigation must reach an empty conversation')
    },
    mouse: { move: async () => {}, down: async () => {}, up: async () => { browser().floating = true } },
  }
  const window = {
    evaluate: async (callback, link) => callback({ webContents: { send: (channel, payload) => {
      assert.equal(channel, 'desktop:deep-link')
      assert.deepEqual(payload, { kind: 'session', id: 'session-b', href: desktopDeepLink('session/session-b') })
      state.navigation.push(payload.id)
      if (!options.dropNavigation) state.current = payload.id
      if (options.createCOnReturn) seats.push({ sessionId: 'session-c', cwd: workspacePath, blank: true })
      if (options.dropOldOnReturn) seats.splice(1, 1)
      if (options.changeOldDraft) seats[1].blank = false
      if (options.changeBOnReturn) seats.find(seat => seat.sessionId === 'session-b').blank = false
      if (options.wrongBrowserAddress) browser().src = 'https://native-session-browser.test/wrong'
      if (options.wrongBrowserDraft) browser().input = 'lost draft'
    } } }, link),
  }
  const run = () => fixture.verifyNativeBrowserSessionIsolation({
    page, logPath, sessionId: 'session-a', workspacePath,
    readWorkspace: async () => ({ archivedSessionIds: [...state.archived], pinnedSessionIds: ['pinned-unrelated'] }),
    rpc: async (_page, method, request) => {
      if (method === 'session.list') {
        if (++seatReads === 3 && options.failInitialSeats) throw new Error('fixture initial seats failed')
        return { items: structuredClone(options.legacyIds ? seats.map(({ sessionId, ...seat }) => ({ id: sessionId, ...seat })) : seats) }
      }
      if (method === 'workspace.list') return { archivedSessionIds: [...state.archived], pinnedSessionIds: ['pinned-unrelated'] }
      state.archiveCalls.push({ method, id: request.sessionId })
      if (method === 'workspace.archiveSession') state.archived.add(request.sessionId)
      else {
        assert.equal(method, 'workspace.unarchiveSession')
        state.archived.delete(request.sessionId)
      }
      return {}
    },
    openSeededSession: async (_page, id) => { assert.equal(id, 'session-a'); state.current = id },
    navigateToSession: async id => {
      await fixture.navigateNativeBrowserSession(window, id)
      if (options.changeLogBytes) await writeFile(logPath, Buffer.from([0x41, 0x81, 0x0d, 0x0a]))
    },
  })
  return { run, state, seats, originalLog, logPath }
}

test('binds exactly one clicked B alongside old drafts and returns through the real navigation callback', async context => {
  const scenario = await browserFixture(context)
  await scenario.run()
  assert.equal(scenario.state.newClicks, 1)
  assert.deepEqual(scenario.state.navigation, ['session-b'])
  assert.equal(scenario.state.unrouted, 1)
  assert.equal(scenario.state.current, 'session-a')
  assert.deepEqual(scenario.seats.map(seat => seat.sessionId), ['session-a', 'old-draft-1', 'old-draft-2', 'unrelated', 'session-b'])
  assert.deepEqual([...scenario.state.archived], ['old-draft-2'])
  assert.deepEqual(scenario.state.archiveCalls, [
    { method: 'workspace.archiveSession', id: 'old-draft-1' },
    { method: 'workspace.unarchiveSession', id: 'old-draft-1' },
  ], 'The rc.4 fresh-creation precondition must restore drafts and leave unrelated/prior archives unchanged')
  assert.deepEqual(await readFile(scenario.logPath), scenario.originalLog)
})

for (const [name, options, message] of [
  ['reusing an old draft instead of creating B', { createdCount: 0 }, /exactly one new session/u],
  ['creating B and C', { createdCount: 2 }, /exactly one new session/u],
  ['duplicate session identities', { duplicateId: true }, /unique/u],
  ['a nonblank new B', { nonblankB: true }, /blank/u],
  ['B in a different workspace', { wrongWorkspace: true }, /workspace/u],
  ['deleting an old draft during creation', { dropOldOnCreate: true }, /preserve/u],
  ['leaking A into the new seat', { leakBrowser: true }, /strictly equal/u],
  ['sending an event without navigating', { dropNavigation: true }, /public navigation must reach an empty conversation/u],
  ['creating C while returning to B', { createCOnReturn: true }, /preserve/u],
  ['deleting an old draft while returning', { dropOldOnReturn: true }, /preserve/u],
  ['silently marking an old draft nonblank', { changeOldDraft: true }, /preserve/u],
  ['silently marking B nonblank', { changeBOnReturn: true }, /preserve/u],
  ['losing B browser address', { wrongBrowserAddress: true }, /strictly equal/u],
  ['losing B pending input', { wrongBrowserDraft: true }, /closing A must not close or reset B/u],
  ['changing invalid UTF8 bytes with identical decoded text', { changeLogBytes: true }, /must not rewrite history/u],
]) {
  test(`rejects ${name}`, async context => {
    const scenario = await browserFixture(context, options)
    await assert.rejects(scenario.run(), message)
    assert.equal(scenario.state.unrouted, 1)
  })
}

test('navigation sends the production deep-link format through public webContents', async () => {
  const sent = []
  const window = { evaluate: async (callback, link) => callback({ webContents: { send: (...args) => sent.push(args) } }, link) }
  await fixture.navigateNativeBrowserSession(window, 'session-b')
  assert.deepEqual(sent, [['desktop:deep-link', { kind: 'session', id: 'session-b', href: desktopDeepLink('session/session-b') }]])
})

test('retains explicit legacy id compatibility without relying on list order', async context => {
  const scenario = await browserFixture(context, { legacyIds: true })
  await scenario.run()
  assert.equal(scenario.state.newClicks, 1)
  assert.deepEqual(scenario.state.navigation, ['session-b'])
})

for (const options of [{ failRoute: true }, { failInitialSeats: true }]) {
  test(`restores temporary archives when post-preparation setup fails: ${Object.keys(options)[0]}`, async context => {
    const scenario = await browserFixture(context, options)
    await assert.rejects(scenario.run(), /fixture (route setup|initial seats) failed/u)
    assert.deepEqual([...scenario.state.archived], ['old-draft-2'])
    assert.ok(scenario.state.archiveCalls.some(call => call.method === 'workspace.unarchiveSession'))
    assert.equal(scenario.state.newClicks, 0)
    assert.deepEqual(await readFile(scenario.logPath), scenario.originalLog)
  })
}
