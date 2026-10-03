import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const desktopRequire = createRequire(new URL('../package.json', import.meta.url))
const root = dirname(desktopRequire.resolve('@linxin666/dsh-chat-recovery/package.json'))
const source = await readFile(join(root, 'lib', 'client.js'), 'utf8')

function section(start, end) {
  const begin = source.indexOf(start)
  const finish = source.indexOf(end, begin)
  assert.ok(begin >= 0 && finish > begin)
  return source.slice(begin, finish)
}

const wiring = runInNewContext(`${section('function currentSessionId(snapshot)', '//#endregion')}; ({ currentSessionId, recoverySnapshot, connectBlank, promptRetained, createRetryPorts, createSubmitEdit })`, { setTimeout, clearTimeout })

function fixture() {
  const actions = []
  const original = { id: 'source', cwd: 'C:/isolated-workspace', retainedBy: { mainView: 1 } }
  const list = { byId: { source: original }, ids: ['source'], phase: 'ready' }
  const sessionSnapshot = { sessionId: 'source', running: false, removed: false, lastAgentError: 'fixture-error' }
  const legacy = { nodes: [], turnEnds: new Map(), runningCalls: [], lastTurn: 0 }
  let lifecycleListener
  let chatListener
  let listListener
  let activeReferences = 0
  let lifecycleSubscriptions = 0
  let chatSubscriptions = 0
  let ready = Promise.resolve()
  let result = { ok: true }
  let binding = { session: {
    getSnapshot: () => sessionSnapshot,
    subscribe(listener) { lifecycleSubscriptions += 1; lifecycleListener = listener; return () => { lifecycleSubscriptions -= 1; lifecycleListener = undefined } },
    async prompt(content, mode) { assert.equal(activeReferences, 1); actions.push(['prompt', structuredClone(content), mode]); return result },
  } }
  const sessions = {
    list: { getSnapshot: () => list, subscribe(listener) { listListener = listener; return () => { listListener = undefined } } },
    binding(id) { return id === 'source' ? binding : undefined },
    async create(options) { actions.push(['create', structuredClone(options)]); return 'blank-child' },
    async fork(options) { actions.push(['fork', structuredClone(options)]); return 'fork-child' },
    async using(id, options, operation) {
      assert.equal(options.source, 'controllerOperation')
      activeReferences += 1
      actions.push(['retain', id])
      try { return await operation({ binding, ready }) }
      finally { activeReferences -= 1; actions.push(['release', id]) }
    },
  }
  const workspaces = {
    list: { getSnapshot: () => ({ items: [{ path: original.cwd, workspaceId: 'workspace' }] }) },
    async create(options) { actions.push(['workspace-create', structuredClone(options)]); return { workspaceId: 'created-workspace' } },
  }
  const conversations = { binding(candidate) { assert.equal(candidate, binding); return { target(name) {
    assert.equal(name, 'chat')
    return { getSnapshot: () => ({ legacy }), subscribe(listener) { chatSubscriptions += 1; chatListener = listener; return () => { chatSubscriptions -= 1; chatListener = undefined } } }
  } } } }
  const navigation = { openSession(id) { actions.push(['navigate', id]) } }
  return {
    sessions, workspaces, conversations, navigation, actions, original, list, legacy, sessionSnapshot,
    get binding() { return binding },
    replaceGeneration() { binding = { ...binding, session: { ...binding.session } } },
    get lifecycleSubscriptions() { return lifecycleSubscriptions }, get chatSubscriptions() { return chatSubscriptions },
    setReady(value) { ready = value }, setResult(value) { result = value },
    get activeReferences() { return activeReferences },
    get lifecycleListener() { return lifecycleListener }, get chatListener() { return chatListener }, get listListener() { return listListener },
  }
}

test('Recovery selects the retained main view, not an unrelated sidebar or stale legacy selection', () => {
  const state = fixture()
  state.list.current = 'stale'
  state.list.byId.side = { id: 'side', retainedBy: { sidebar: 1 } }
  assert.equal(wiring.currentSessionId(state.list), 'source')
  state.original.retainedBy.mainView = 0
  assert.equal(wiring.currentSessionId(state.list), 'stale')
  delete state.list.current
  assert.equal(wiring.currentSessionId(state.list), undefined)
})

test('Recovery joins the actual Chat legacy slice and Session lifecycle without rewriting history', () => {
  const state = fixture()
  const snapshot = wiring.recoverySnapshot(state.binding, state.conversations)
  assert.equal(snapshot.nodes, state.legacy.nodes)
  assert.equal(snapshot.turnEnds, state.legacy.turnEnds)
  assert.equal(snapshot.sessionId, 'source')
  assert.equal(snapshot.running, false)
  assert.equal(snapshot.removed, false)
  assert.equal(snapshot.lastAgentError, state.sessionSnapshot.lastAgentError)
  assert.equal(Object.hasOwn(state.legacy, 'lastAgentError'), false)
})

test('Blank recovery creates a new Session with the workspace controller, without replacing the source', async () => {
  const state = fixture()
  const original = structuredClone(state.original)
  assert.equal(await wiring.connectBlank(state.sessions, state.workspaces, state.original.cwd), 'blank-child')
  assert.deepEqual(state.actions, [['create', { workspaceId: 'workspace', cwd: original.cwd }]])
  assert.equal(await wiring.connectBlank(state.sessions, state.workspaces, 'C:/other-workspace'), 'blank-child')
  assert.deepEqual(state.actions.slice(1), [['workspace-create', { path: 'C:/other-workspace' }], ['create', { workspaceId: 'created-workspace', cwd: 'C:/other-workspace' }]])
  await assert.rejects(wiring.connectBlank(state.sessions, state.workspaces, ''), /no workspace directory/u)
  assert.deepEqual(state.original, original)
})

test('Recovery waits for retained history before prompting and releases ownership on success or failure', async () => {
  const state = fixture()
  let makeReady
  state.setReady(new Promise(resolveReady => { makeReady = resolveReady }))
  const request = wiring.promptRetained(state.sessions, 'new-child', 'edited text')
  await Promise.resolve()
  assert.deepEqual(state.actions, [['retain', 'new-child']])
  makeReady()
  assert.equal((await request).ok, true)
  assert.deepEqual(state.actions.slice(1), [['prompt', [{ type: 'text', text: 'edited text' }], 'queue'], ['release', 'new-child']])
  assert.equal(state.activeReferences, 0)
  state.setReady(Promise.reject(new Error('fixture history refused')))
  await assert.rejects(wiring.promptRetained(state.sessions, 'refused-child', 'must not submit'), /history refused/u)
  assert.equal(state.activeReferences, 0)
  assert.deepEqual(state.actions.slice(-2), [['retain', 'refused-child'], ['release', 'refused-child']])
})

test('Edit preserves the source, forks the exact prefix and uses native navigation rather than retired Session.open', async () => {
  const state = fixture()
  const original = structuredClone(state.original)
  const submit = wiring.createSubmitEdit(state.sessions, state.workspaces, state.navigation)
  await submit({ sessionId: 'source', forkAtSeq: 42, editedText: 'new text' })
  assert.deepEqual(state.actions, [['fork', { sessionId: 'source', atSeq: 42, increaseTitle: true }], ['navigate', 'fork-child'], ['retain', 'fork-child'], ['prompt', [{ type: 'text', text: 'new text' }], 'queue'], ['release', 'fork-child']])
  assert.deepEqual(state.original, original)
  state.setResult({ ok: false, error: { code: 'fixture-refused', message: 'rejected' } })
  await assert.rejects(submit({ sessionId: 'source', forkAtSeq: null, editedText: 'refused text' }), /fixture-refused: rejected/u)
  assert.equal(state.activeReferences, 0)
  assert.deepEqual(state.original, original)
})

test('Retry ports expose native snapshots, navigation and rejected model outcomes without hiding failures', async () => {
  const state = fixture()
  const ports = wiring.createRetryPorts(state.sessions, state.workspaces, state.conversations, state.navigation)
  assert.equal(ports.currentId(), 'source')
  assert.equal(ports.snapshot('source').nodes, state.legacy.nodes)
  assert.equal(ports.snapshot('not-retained'), undefined)
  assert.equal(ports.cwdOf('source'), state.original.cwd)
  ports.open('new-child')
  state.setResult({ ok: false, error: { code: 'fixture-refused', message: 'rejected' } })
  const result = await ports.prompt('new-child', 'retry text')
  assert.equal(result.ok, false)
  assert.equal(result.code, 'fixture-refused')
  assert.equal(result.message, 'rejected')
  assert.equal(state.activeReferences, 0)
})

test('Recovery mounts both preserved controls, observes Chat updates and cleans up every observer', () => {
  const state = fixture()
  const disposers = []
  const slots = []
  const languages = []
  let reviews = 0
  let disposed = false
  class Supervisor {
    constructor(ports) { assert.equal(ports.currentId(), 'source') }
    review() { reviews += 1 }
    manualRetry() {}
    dispose() { disposed = true }
  }
  const apply = runInNewContext(`${section('function apply(ctx) {', '//#endregion')}; apply`, {
    ...wiring, NS: 'chat-recovery', zh: {}, en: {}, RetrySupervisor: Supervisor,
    reportDailyHeartbeat() {}, claimChatRecoveryApply: () => true, releaseChatRecoveryApply() {},
    TurnActionsView() {}, RetryDockView() {},
  })
  const ctx = {
    sessions: state.sessions, workspaces: state.workspaces, uiConversation: state.conversations, uiWorkspace: state.navigation,
    effect(callback) { const dispose = callback(); assert.equal(typeof dispose, 'function'); disposers.push(dispose); return dispose },
    locale: { register(namespace, language, dictionary) { assert.equal(namespace, 'chat-recovery'); assert.ok(dictionary); languages.push(language); return () => { languages.splice(languages.indexOf(language), 1) } } },
    slots: { inject(name, callback) { disposers.push(callback()) }, register(options) { assert.equal(options.id, 'chat-recovery'); assert.equal(Object.hasOwn(options, 'select'), false); slots.push(options.name); return () => { slots.splice(slots.indexOf(options.name), 1) } } },
  }
  apply(ctx)
  assert.deepEqual(languages, ['zh', 'en'])
  assert.deepEqual(slots, ['conversation.chat.turnTail', 'conversation.composer.dock'])
  const before = reviews
  state.chatListener()
  state.lifecycleListener()
  assert.equal(reviews, before + 2)
  const previousLifecycle = state.lifecycleListener
  const previousChat = state.chatListener
  state.replaceGeneration()
  state.listListener()
  assert.notEqual(state.lifecycleListener, previousLifecycle)
  assert.notEqual(state.chatListener, previousChat)
  assert.equal(state.lifecycleSubscriptions, 1)
  assert.equal(state.chatSubscriptions, 1)
  state.original.retainedBy.mainView = 0
  state.listListener()
  assert.equal(state.lifecycleSubscriptions, 0)
  assert.equal(state.chatSubscriptions, 0)
  state.original.retainedBy.mainView = 1
  state.listListener()
  assert.equal(state.lifecycleSubscriptions, 1)
  assert.equal(state.chatSubscriptions, 1)
  for (const dispose of disposers.reverse()) dispose()
  assert.equal(disposed, true)
  assert.equal(state.listListener, undefined)
  assert.equal(state.lifecycleListener, undefined)
  assert.equal(state.chatListener, undefined)
  assert.equal(state.lifecycleSubscriptions, 0)
  assert.equal(state.chatSubscriptions, 0)
  assert.deepEqual(languages, [])
  assert.deepEqual(slots, [])
})
