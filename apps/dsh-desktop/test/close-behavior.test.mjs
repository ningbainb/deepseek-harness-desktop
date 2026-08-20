import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  assertAutomaticSafeMode,
  assertCloseBehavior,
  CLOSE_BEHAVIORS,
  createCloseBehaviorController,
  DEFAULT_CLOSE_BEHAVIOR,
  DEFAULT_AUTOMATIC_SAFE_MODE,
  DesktopClosePreferencesStore,
  isBackgroundAutomationEnabled,
  normalizeAutomaticSafeMode,
  normalizeCloseBehavior,
  normalizeDesktopClosePreferences,
} from '../src/close-behavior.mjs'

const tick = () => new Promise((resolve) => setImmediate(resolve))

function closeEvent() {
  let prevented = 0
  return {
    preventDefault: () => { prevented += 1 },
    get prevented() { return prevented },
  }
}

test('close behavior preserves the historical quit default for missing and malformed preferences', () => {
  assert.equal(DEFAULT_CLOSE_BEHAVIOR, CLOSE_BEHAVIORS.QUIT)
  for (const value of [undefined, null, '', 'minimize', {}, 1]) {
    assert.equal(normalizeCloseBehavior(value), CLOSE_BEHAVIORS.QUIT)
  }
  assert.equal(DEFAULT_AUTOMATIC_SAFE_MODE, true)
  assert.deepEqual(normalizeDesktopClosePreferences(), { closeBehavior: 'quit', automaticSafeMode: true })
  assert.deepEqual(normalizeDesktopClosePreferences({ closeBehavior: 'ask' }), { closeBehavior: 'ask', automaticSafeMode: true })
  assert.deepEqual(normalizeDesktopClosePreferences({ automaticSafeMode: false }), { closeBehavior: 'quit', automaticSafeMode: false })
  for (const value of [undefined, null, '', 0, {}, []]) assert.equal(normalizeAutomaticSafeMode(value), true)
  assert.equal(normalizeAutomaticSafeMode(false), false)
  assert.equal(assertAutomaticSafeMode(true), true)
  assert.throws(() => assertAutomaticSafeMode('false'), /invalid automatic safe mode preference/u)
  assert.equal(assertCloseBehavior('minimize-to-tray'), 'minimize-to-tray')
  assert.equal(isBackgroundAutomationEnabled('minimize-to-tray'), true)
  assert.equal(isBackgroundAutomationEnabled('ask'), false)
  assert.equal(isBackgroundAutomationEnabled('invalid'), false)
  assert.throws(() => assertCloseBehavior('background-forever'), /invalid close behavior/u)
})

test('desktop preference store survives missing/corrupt legacy files and persists scoped settings', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-close-behavior-'))
  const path = join(directory, 'desktop-preferences.json')
  const store = new DesktopClosePreferencesStore(path)
  try {
    assert.deepEqual(await store.load(), { closeBehavior: 'quit', automaticSafeMode: true })
    await writeFile(path, JSON.stringify({ closeBehavior: 'legacy-minimize' }), 'utf8')
    assert.deepEqual(await store.load(), { closeBehavior: 'quit', automaticSafeMode: true })
    await writeFile(path, JSON.stringify({ closeBehavior: 'ask', automaticSafeMode: 'no' }), 'utf8')
    assert.deepEqual(await store.load(), { closeBehavior: 'ask', automaticSafeMode: true })
    assert.equal(await store.saveAutomaticSafeMode(false), false)
    assert.deepEqual(await new DesktopClosePreferencesStore(path).load(), {
      closeBehavior: 'ask',
      automaticSafeMode: false,
    })
    assert.equal(await store.saveCloseBehavior('minimize-to-tray'), 'minimize-to-tray')
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), {
      closeBehavior: 'minimize-to-tray',
      automaticSafeMode: false,
    })
    assert.deepEqual(await store.load(), { closeBehavior: 'minimize-to-tray', automaticSafeMode: false })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('opt-in minimize-to-tray intercepts a window close and leaves runtime ownership untouched', () => {
  let hidden = 0
  let quit = 0
  const controller = createCloseBehaviorController({
    getCloseBehavior: () => CLOSE_BEHAVIORS.MINIMIZE_TO_TRAY,
    canMinimizeToTray: () => true,
    hideWindow: () => { hidden += 1 },
    requestQuit: () => { quit += 1 },
  })
  const event = closeEvent()
  assert.equal(controller.handleWindowClose(event), true)
  assert.equal(event.prevented, 1)
  assert.equal(hidden, 1)
  assert.equal(quit, 0)
})

test('quit, unavailable tray, safe mode, crash, and explicit process exit all bypass background hiding', () => {
  let hidden = 0
  let behavior = CLOSE_BEHAVIORS.MINIMIZE_TO_TRAY
  let bypass
  const controller = createCloseBehaviorController({
    getCloseBehavior: () => behavior,
    canMinimizeToTray: () => true,
    getBypassReason: () => bypass,
    hideWindow: () => { hidden += 1 },
  })

  behavior = CLOSE_BEHAVIORS.QUIT
  assert.equal(controller.handleWindowClose(closeEvent()), false)
  behavior = CLOSE_BEHAVIORS.MINIMIZE_TO_TRAY
  bypass = 'safe-mode'
  assert.equal(controller.handleWindowClose(closeEvent()), false)
  bypass = 'runtime-crashed'
  assert.equal(controller.handleWindowClose(closeEvent()), false)
  bypass = undefined
  controller.beginExplicitQuit()
  assert.equal(controller.handleWindowClose(closeEvent()), false)
  controller.cancelExplicitQuit()
  assert.equal(controller.handleWindowClose(closeEvent()), true)
  assert.equal(hidden, 1)

  const unavailable = createCloseBehaviorController({
    getCloseBehavior: () => CLOSE_BEHAVIORS.MINIMIZE_TO_TRAY,
    canMinimizeToTray: () => false,
    hideWindow: () => { throw new Error('must not hide') },
  })
  assert.equal(unavailable.handleWindowClose(closeEvent()), false)
})

test('ask behavior opens one prompt, supports minimize or quit, and treats dismissal as cancel', async () => {
  let outcome = CLOSE_BEHAVIORS.MINIMIZE_TO_TRAY
  let prompts = 0
  let hidden = 0
  let quits = 0
  const controller = createCloseBehaviorController({
    getCloseBehavior: () => CLOSE_BEHAVIORS.ASK,
    canMinimizeToTray: () => true,
    hideWindow: () => { hidden += 1 },
    promptForClose: async () => {
      prompts += 1
      return outcome
    },
    requestQuit: () => { quits += 1 },
  })

  const first = closeEvent()
  const duplicate = closeEvent()
  assert.equal(controller.handleWindowClose(first), true)
  assert.equal(controller.handleWindowClose(duplicate), true)
  assert.equal(first.prevented, 1)
  assert.equal(duplicate.prevented, 1)
  await tick()
  assert.equal(prompts, 1)
  assert.equal(hidden, 1)

  outcome = CLOSE_BEHAVIORS.QUIT
  assert.equal(controller.handleWindowClose(closeEvent()), true)
  await tick()
  assert.equal(quits, 1)
  assert.equal(controller.explicitQuit, true)

  controller.cancelExplicitQuit()
  outcome = 'cancel'
  assert.equal(controller.handleWindowClose(closeEvent()), true)
  await tick()
  assert.equal(hidden, 1)
  assert.equal(quits, 1)
})

test('a failed ask prompt does not hide or quit the desktop', async () => {
  let hidden = 0
  let quits = 0
  const diagnostics = []
  const controller = createCloseBehaviorController({
    getCloseBehavior: () => CLOSE_BEHAVIORS.ASK,
    canMinimizeToTray: () => true,
    hideWindow: () => { hidden += 1 },
    promptForClose: async () => { throw new Error('dialog unavailable') },
    requestQuit: () => { quits += 1 },
    log: (error) => diagnostics.push(error.message),
  })
  assert.equal(controller.handleWindowClose(closeEvent()), true)
  await tick()
  assert.equal(hidden, 0)
  assert.equal(quits, 0)
  assert.deepEqual(diagnostics, ['dialog unavailable'])
})

test('policy adapter failures fail closed to normal quitting instead of hiding the shell', () => {
  const diagnostics = []
  const bypassFailure = createCloseBehaviorController({
    getCloseBehavior: () => { throw new Error('preferences unavailable') },
    canMinimizeToTray: () => { throw new Error('tray unavailable') },
    getBypassReason: () => { throw new Error('shutdown state unavailable') },
    hideWindow: () => { throw new Error('must not hide') },
    log: (error) => diagnostics.push(error.message),
  })
  assert.equal(bypassFailure.handleWindowClose(closeEvent()), false)
  assert.deepEqual(diagnostics, ['shutdown state unavailable'])

  const preferenceFailure = createCloseBehaviorController({
    getCloseBehavior: () => { throw new Error('preferences unavailable') },
    canMinimizeToTray: () => true,
    hideWindow: () => { throw new Error('must not hide') },
    log: (error) => diagnostics.push(error.message),
  })
  assert.equal(preferenceFailure.handleWindowClose(closeEvent()), false)

  const trayFailure = createCloseBehaviorController({
    getCloseBehavior: () => CLOSE_BEHAVIORS.MINIMIZE_TO_TRAY,
    canMinimizeToTray: () => { throw new Error('tray unavailable') },
    hideWindow: () => { throw new Error('must not hide') },
    log: (error) => diagnostics.push(error.message),
  })
  assert.equal(trayFailure.handleWindowClose(closeEvent()), false)
  assert.deepEqual(diagnostics, [
    'shutdown state unavailable',
    'preferences unavailable',
    'tray unavailable',
  ])
})
