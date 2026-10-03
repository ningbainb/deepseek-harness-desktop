import assert from 'node:assert/strict'
import test from 'node:test'
import { dismissRuntimeOnboarding, onboardingControlsReady } from '../scripts/dismiss-onboarding-fixture.mjs'

test('onboarding readiness never accepts a visible disabled continuation', () => {
  const previousDocument = globalThis.document
  const control = { textContent: 'Continue', disabled: true, getClientRects: () => [{}] }
  globalThis.document = { querySelectorAll: () => [control] }
  try {
    assert.equal(onboardingControlsReady(), false)
    control.disabled = false
    assert.equal(onboardingControlsReady(), true)
    control.disabled = true
    control.getClientRects = () => []
    assert.equal(onboardingControlsReady(), true)
  } finally {
    globalThis.document = previousDocument
  }
})

function fixture({ disappeared = false, clickFailure, readinessFailure, finalFailure } = {}) {
  let visible = !disappeared
  const calls = []
  const button = {
    isVisible: async () => visible,
    click: async () => {
      calls.push('click')
      if (disappeared) visible = false
      if (clickFailure) throw clickFailure
      visible = false
    },
    waitFor: async options => {
      assert.deepEqual(options, { state: 'hidden', timeout: 10_000 })
      calls.push('hidden')
      if (finalFailure) throw finalFailure
      assert.equal(visible, false)
    },
  }
  return {
    calls,
    page: {
      getByRole: () => button,
      waitForFunction: async (predicate, argument, options) => {
        assert.equal(predicate, onboardingControlsReady)
        assert.equal(argument, undefined)
        assert.deepEqual(options, { timeout: 30_000 })
        calls.push('ready')
        if (readinessFailure) throw readinessFailure
        if (disappeared && clickFailure) visible = true
      },
    },
  }
}

test('onboarding accepts completion before the click only after the hidden assertion', async () => {
  const state = fixture({ disappeared: true })
  await dismissRuntimeOnboarding(state.page)
  assert.deepEqual(state.calls, ['ready', 'hidden'])
})

test('onboarding handles automatic dismissal during a pending click without omitting the hidden assertion', async () => {
  const state = fixture({ disappeared: true, clickFailure: new Error('detached during click') })
  await dismissRuntimeOnboarding(state.page)
  assert.deepEqual(state.calls, ['ready', 'click', 'hidden'])
})

test('onboarding does not swallow an action failure while its continuation is still visible', async () => {
  const failure = new Error('visible continuation failed')
  await assert.rejects(dismissRuntimeOnboarding(fixture({ clickFailure: failure }).page), error => error === failure)
})

test('onboarding readiness and final visibility failures remain gate failures', async () => {
  for (const option of ['readinessFailure', 'finalFailure']) {
    const failure = new Error(option)
    await assert.rejects(dismissRuntimeOnboarding(fixture({ [option]: failure }).page), error => error === failure)
  }
})
