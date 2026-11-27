import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { chromium } from 'playwright'
import { dismissKnownStartupNotices, dismissRuntimeOnboarding, dismissStartupContinuationDialogs, onboardingControlsReady } from '../scripts/dismiss-onboarding-fixture.mjs'
import { dismissFirstRunModelChooserWhenShown } from '../scripts/dock-settings-fixture.mjs'

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

describe('desktop startup prompts in the renderer', () => {
  let browser
  before(async () => { browser = await chromium.launch({ headless: true }) })
  after(async () => { await browser?.close() })

  async function startupPage(t, markup) {
    const page = await browser.newPage()
    t.after(() => page.close())
    await page.setContent(`<div id="dsh-desktop-star-prompt" data-open="false" hidden>
      <button id="star">先继续使用</button></div>${markup}`)
    await page.evaluate(() => {
      window.clicked = []
      document.addEventListener('click', event => {
        window.clicked.push(event.target.id)
        const prompt = event.target.closest('#dsh-desktop-star-prompt, [role=dialog]')
        if (prompt) {
          prompt.hidden = true
          prompt.dataset.open = 'false'
        }
      })
    })
    t.mock.method(page, 'waitForTimeout', async ms => { assert.equal(ms, 250) })
    return page
  }

  test('dismisses the star first and clicks only the last exact continuation inside its visible dialog', async t => {
    const page = await startupPage(t, `
      <div role="dialog"><button id="first">Continue</button><button id="intro">继续</button>
        <button hidden>Continue</button></div>
      <div role="dialog" hidden><button>Continue</button></div>
      <button id="outside">Continue</button>`)
    await page.locator('#dsh-desktop-star-prompt').evaluate(prompt => {
      prompt.dataset.open = 'true'
      prompt.hidden = false
    })
    await dismissStartupContinuationDialogs(page)
    assert.deepEqual(await page.evaluate(() => window.clicked), ['star', 'intro'])
    assert.equal(page.waitForTimeout.mock.callCount(), 8)
  })

  test('does not guess between two visible continuation dialogs', async t => {
    const page = await startupPage(t, `
      <div role="dialog"><button id="first">Continue</button></div>
      <div role="dialog"><button id="second">继续</button></div>`)
    await dismissStartupContinuationDialogs(page)
    assert.deepEqual(await page.evaluate(() => window.clicked), [])
    assert.equal(page.waitForTimeout.mock.callCount(), 8)
  })

  test('defers a late first-run chooser before the native account click', async t => {
    const page = await startupPage(t, `<button id="account">Account menu</button>
      <button id="unrelated">Maybe later</button>`)
    await dismissFirstRunModelChooserWhenShown(page)
    await dismissStartupContinuationDialogs(page)
    await page.evaluate(() => {
      const backdrop = document.createElement('div')
      backdrop.dataset.dshFirstRunRoot = 'true'
      backdrop.style.cssText = 'position:fixed;inset:0;z-index:10'
      backdrop.innerHTML = '<section role="region" data-dsh-first-run-chooser><button id="login">Sign in</button><button id="defer">Maybe later</button></section>'
      backdrop.querySelector('#defer').addEventListener('click', event => {
        if (event.isTrusted) backdrop.remove()
      })
      document.body.append(backdrop)
    })
    await page.getByRole('button', { name: 'Account menu' }).click({ timeout: 5000 })
    assert.deepEqual(await page.evaluate(() => window.clicked), ['defer', 'account'])
  })

  test('checks notice text and visibility in reverse dialog order before continuing', async t => {
    const page = await startupPage(t, `
      <div role="dialog">内测声明<button id="earlier">Continue</button></div>
      <div role="dialog">插件、技能和桌面核心功能在这里<button id="later">继续</button></div>
      <div role="dialog">内测声明<button id="wrong-label">Continue later</button></div>
      <div role="dialog" style="display:none">内测声明<button>Continue</button></div>
      <div role="dialog">Approve access<button id="unrelated">Continue</button></div>`)
    await dismissKnownStartupNotices(page)
    assert.deepEqual(await page.evaluate(() => window.clicked), ['later', 'earlier'])
    assert.equal(await page.locator('#unrelated').isVisible(), true)
  })

  test('handles prompts appearing on the eighth poll and stops after sixteen busy polls', async t => {
    const page = await startupPage(t, '<div role="dialog" hidden><button id="late">继续</button></div>')
    let polls = 0
    page.waitForTimeout.mock.mockImplementation(async ms => {
      assert.equal(ms, 250)
      if (++polls >= 8) await page.locator('[role=dialog]').evaluate(dialog => { dialog.hidden = false })
    })
    await dismissStartupContinuationDialogs(page)
    assert.equal(polls, 16)
    assert.deepEqual(await page.evaluate(() => window.clicked), Array(9).fill('late'))
  })
})
