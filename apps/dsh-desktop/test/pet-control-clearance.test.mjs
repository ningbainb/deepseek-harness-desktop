import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import * as petClearance from '../src/pet-control-clearance.mjs'

const { PET_CONTROL_CLEARANCE_SCRIPT, petControlOffset, petRailOffset } = petClearance

const require = createRequire(new URL('../../../packages/dsh-pet/package.json', import.meta.url))
const { JSDOM } = require('jsdom')

test('dedicated settings reserve readable form space and contain the complete pet surface in its own scrollable rail', () => {
  assert.equal(typeof petRailOffset, 'function')
  const measured = { left: 594.78, top: 368, width: 180.45, height: 261.02 }
  const placement = petRailOffset(measured, { width: 783, height: 648 })
  assert.equal(placement.width, 224)
  assert.ok(measured.left + placement.x >= 783 - placement.width + 12)
  assert.ok(measured.left + placement.x + measured.width <= 783 - 12)
  assert.ok(measured.top + placement.y >= 12)
  assert.ok(measured.top + placement.y + measured.height <= 648 - 12)
  const narrow = petRailOffset({ left: 0, top: 0, width: 400, height: 800 }, { width: 520, height: 648 })
  assert.equal(narrow.width, 208)
  assert.ok(520 - narrow.width >= 300)
  assert.equal(narrow.x, 324)
  assert.equal(narrow.y, 12)
})

test('a pet away from controls retains its saved placement', () => {
  assert.deepEqual(petControlOffset({ left: 720, top: 200, width: 100, height: 160 },
    [{ left: 700, top: 500, right: 850, bottom: 530 }], { width: 880, height: 600 }), { x: 0, y: 0 })
})

test('pet clearance leaves model selection and native bottom navigation ordinarily clickable', () => {
  const sprite = { left: 720, top: 420, width: 100, height: 160 }
  const controls = [{ left: 690, top: 535, right: 850, bottom: 565 }, { left: 790, top: 460, right: 825, bottom: 490 }]
  const original = structuredClone(sprite)
  const offset = petControlOffset(sprite, controls, { width: 880, height: 600 })
  assert.ok(offset.x || offset.y)
  for (const control of controls) {
    assert.ok(sprite.left + offset.x + sprite.width <= control.left - 8
      || sprite.left + offset.x >= control.right + 8
      || sprite.top + offset.y + sprite.height <= control.top - 8
      || sprite.top + offset.y >= control.bottom + 8)
  }
  assert.deepEqual(sprite, original)
  assert.ok(sprite.left + offset.x >= 8 && sprite.top + offset.y >= 40)
})

test('pet clearance does not hide or shrink a pet when the viewport has no safe position', () => {
  assert.deepEqual(petControlOffset({ left: 10, top: 50, width: 160, height: 160 },
    [{ left: 0, top: 0, right: 200, bottom: 200 }], { width: 200, height: 200 }), { x: 0, y: 0 })
})

for (const initiallyOpen of [true, false]) {
  test(initiallyOpen ? 'pet clearance preserves native right-panel guide pointer access'
    : 'opening a retained native right panel refreshes pet clearance without resizing', async () => {
    const dom = new JSDOM(`<aside data-sidebar-right-panel="push"${initiallyOpen ? ' data-sidebar-right-open' : ''}><button data-sidebar-right-guide-entry="dsh-browser">Browser preview</button></aside><div data-dsh-pet-root><div style="position:fixed;right:24px;bottom:120px"><div role="button" tabindex="0">Pet</div></div></div>`, { runScripts: 'outside-only' })
    const { window } = dom
    const panel = window.document.querySelector('aside')
    const guide = panel.querySelector('button')
    const floating = window.document.querySelector('[data-dsh-pet-root] > div')
    const frames = new Map()
    let serial = 0
    let clicks = 0
    window.requestAnimationFrame = callback => { frames.set(++serial, callback); return serial }
    window.cancelAnimationFrame = identifier => frames.delete(identifier)
    Object.defineProperties(window, { innerWidth: { value: 1024 }, innerHeight: { value: 768 } })
    floating.getBoundingClientRect = () => {
      const [horizontal = 0, vertical = 0] = (floating.style.translate || '0px 0px').split(' ').map(Number.parseFloat)
      return { left: 800 + horizontal, top: 420 + vertical, width: 100, height: 160 }
    }
    guide.getBoundingClientRect = () => {
      const left = panel.hasAttribute('data-sidebar-right-open') ? 700 : 1040
      return { left, top: 450, right: left + 300, bottom: 510, width: 300, height: 60 }
    }
    guide.addEventListener('click', () => { clicks++ })
    try {
      window.eval(PET_CONTROL_CLEARANCE_SCRIPT)
      if (!initiallyOpen) {
        assert.equal(floating.style.translate, '')
        panel.setAttribute('data-sidebar-right-open', '')
        await new Promise(resolve => setImmediate(resolve))
        assert.ok(frames.size > 0, 'retained native panel opening must schedule clearance')
        for (const [identifier, callback] of frames) { frames.delete(identifier); callback() }
      }
      const pet = floating.getBoundingClientRect()
      const control = guide.getBoundingClientRect()
      assert.ok(pet.left + pet.width <= control.left - 8 || pet.left >= control.right + 8
        || pet.top + pet.height <= control.top - 8 || pet.top >= control.bottom + 8,
      'the complete pet hitbox must leave the native Browser guide clickable')
      assert.equal(floating.style.right, '24px')
      assert.equal(floating.style.bottom, '120px')
      assert.equal(window.document.querySelector('[data-dsh-pet-root] [role="button"]').tabIndex, 0)
      guide.click()
      assert.equal(clicks, 1)
      panel.removeAttribute('data-sidebar-right-open')
      await new Promise(resolve => setImmediate(resolve))
      for (const [identifier, callback] of frames) { frames.delete(identifier); callback() }
      assert.equal(floating.style.translate, '', 'closing the panel restores saved pet placement')
    } finally {
      window.dshPetControlClearance?.dispose()
      dom.window.close()
    }
  })
}

test('pet clearance avoids dedicated settings controls and refreshes when a retained panel is hidden', async () => {
  const dom = new JSDOM('<main data-dsh-dock-settings="memory"><section><button>New memory</button></section></main><div data-dsh-pet-root><div style="position:fixed;right:24px;bottom:120px"><div role="button">Pet</div></div></div>', { runScripts: 'outside-only' })
  const { window } = dom
  const page = window.document.querySelector('main')
  const panel = page.querySelector('section')
  const floating = window.document.querySelector('[data-dsh-pet-root] > div')
  const frames = new Map()
  let serial = 0
  window.requestAnimationFrame = callback => { frames.set(++serial, callback); return serial }
  window.cancelAnimationFrame = identifier => frames.delete(identifier)
  Object.defineProperties(window, { innerWidth: { value: 880 }, innerHeight: { value: 600 } })
  floating.getBoundingClientRect = () => {
    const [horizontal = 0, vertical = 0] = (floating.style.translate || '0px 0px').split(' ').map(Number.parseFloat)
    return { left: 720 + horizontal, top: 420 + vertical, width: 100, height: 160 }
  }
  panel.querySelector('button').getBoundingClientRect = () => panel.hidden
    ? { width: 0, height: 0 }
    : { left: 770, top: 450, right: 790, bottom: 550, width: 20, height: 100 }
  try {
    window.eval(PET_CONTROL_CLEARANCE_SCRIPT)
    assert.equal(page.getAttribute('data-dsh-dock-pet-rail'), '', 'a dedicated settings form must reserve a separate pet area')
    assert.equal(window.document.documentElement.style.getPropertyValue('--dsh-dock-pet-rail-width'), '224px')
    assert.equal(floating.style.right, '24px')
    assert.equal(floating.style.bottom, '120px')
    panel.hidden = true
    page.setAttribute('data-dsh-dock-settings', 'personal-prompt')
    await new Promise(resolve => setImmediate(resolve))
    assert.ok(frames.size > 0, 'retained-panel navigation must refresh control clearance')
    for (const [identifier, callback] of frames) { frames.delete(identifier); callback() }
    assert.equal(floating.style.translate, '')
    window.document.querySelector('[data-dsh-pet-root]').remove()
    await new Promise(resolve => setImmediate(resolve))
    for (const [identifier, callback] of frames) { frames.delete(identifier); callback() }
    assert.equal(page.hasAttribute('data-dsh-dock-pet-rail'), false)
    assert.equal(window.document.documentElement.style.getPropertyValue('--dsh-dock-pet-rail-width'), '')
  } finally {
    window.dshPetControlClearance?.dispose()
    dom.window.close()
  }
})

test('the clearance controller preserves drag styles, pet actions and restores its transient offset on disposal', () => {
  const dom = new JSDOM('<div data-dsh-pet-root><div style="position:fixed;right:24px;bottom:120px"><div data-sprite-wrap><div role="button" tabindex="0">Pet</div></div></div></div><button data-dsh-relay-model-entry>Model</button>', { runScripts: 'outside-only' })
  const { window } = dom
  const sprite = window.document.querySelector('[role="button"]')
  const wrapping = sprite.parentElement
  const floating = wrapping.parentElement
  let translation = ''
  let translationWrites = 0
  Object.defineProperty(floating.style, 'translate', {
    get: () => translation.replace(/ 0px$/u, ''),
    set: value => { translation = value; translationWrites++ },
  })
  let clicks = 0
  sprite.addEventListener('click', () => { clicks++ })
  const frames = new Map()
  let serial = 0
  window.requestAnimationFrame = callback => { frames.set(++serial, callback); return serial }
  window.cancelAnimationFrame = identifier => frames.delete(identifier)
  Object.defineProperties(window, { innerWidth: { value: 880 }, innerHeight: { value: 600 } })
  floating.getBoundingClientRect = () => {
    const [horizontal = 0, vertical = 0] = (floating.style.translate || '0px 0px').split(' ').map(Number.parseFloat)
    return { left: 720 + horizontal, top: 420 + vertical, width: 100, height: 160 }
  }
  window.document.querySelector('[data-dsh-relay-model-entry]').getBoundingClientRect = () => ({
    left: 770, top: 450, right: 790, bottom: 550, width: 20, height: 100,
  })
  try {
    window.eval(PET_CONTROL_CLEARANCE_SCRIPT)
    assert.notEqual(floating.style.translate, '')
    assert.equal(wrapping.style.translate, '', 'the sprite wrapper cannot leave its original floating hitbox behind')
    assert.equal(floating.style.right, '24px')
    assert.equal(floating.style.bottom, '120px')
    assert.equal(sprite.tabIndex, 0)
    window.dispatchEvent(new window.Event('resize'))
    for (const [identifier, callback] of frames) { frames.delete(identifier); callback() }
    assert.equal(translationWrites, 1, 'CSS serialization of a zero axis cannot create a mutation loop')
    sprite.click()
    assert.equal(clicks, 1)
    sprite.dispatchEvent(new window.Event('pointerdown', { bubbles: true }))
    floating.style.right = '100px'
    window.dispatchEvent(new window.Event('resize'))
    for (const [identifier, callback] of frames) { frames.delete(identifier); callback() }
    assert.equal(floating.style.right, '100px')
    window.document.dispatchEvent(new window.Event('pointerup', { bubbles: true }))
    window.dshPetControlClearance.dispose()
    assert.equal(floating.style.translate, '')
    assert.equal(floating.style.right, '100px')
    assert.equal(floating.style.bottom, '120px')
    assert.equal(frames.size, 0)
  } finally {
    dom.window.close()
  }
})

for (const summon of [false, true]) {
  test(summon ? 'a hidden pet retains its native summon button inside the settings rail without changing saved coordinates'
    : 'feedback and status surfaces are measured above the sprite so their full content remains scroll-reachable', () => {
    const dom = new JSDOM(`<main data-dsh-dock-settings="memory"></main><div data-dsh-pet-root>${summon
      ? '<button data-dsh-part="summon-button" style="position:fixed;right:24px;bottom:120px">Summon</button>'
      : '<div style="position:fixed;right:24px;bottom:120px"><div role="button">Pet</div><div role="status">Complete status</div></div>'}</div>`, { runScripts: 'outside-only' })
    const { window } = dom
    const root = window.document.querySelector('[data-dsh-pet-root]')
    const floating = root.firstElementChild
    window.requestAnimationFrame = () => 1
    window.cancelAnimationFrame = () => {}
    Object.defineProperties(window, { innerWidth: { value: 783 }, innerHeight: { value: 648 } })
    const shifted = (left, top, width, height) => {
      const [horizontal = 0, vertical = 0] = (floating.style.translate || '0px 0px').split(' ').map(Number.parseFloat)
      return { left: left + horizontal, top: top + vertical, width, height }
    }
    floating.getBoundingClientRect = () => shifted(600, 30, 148, 160)
    const status = root.querySelector('[role="status"]')
    if (status) status.getBoundingClientRect = () => shifted(530, -90, 260, 110)
    try {
      window.eval(PET_CONTROL_CLEARANCE_SCRIPT)
      assert.equal(window.document.querySelector('main').hasAttribute('data-dsh-dock-pet-rail'), true)
      assert.equal(floating.style.right, '24px')
      assert.equal(floating.style.bottom, '120px')
      if (status) {
        assert.ok(status.getBoundingClientRect().top >= 12)
        assert.ok(status.getBoundingClientRect().left >= 783 - 224 + 12)
      }
    } finally {
      window.dshPetControlClearance?.dispose()
      assert.equal(floating.style.translate, '')
      dom.window.close()
    }
  })
}
