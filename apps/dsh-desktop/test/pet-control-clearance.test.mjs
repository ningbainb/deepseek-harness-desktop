import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { PET_CONTROL_CLEARANCE_SCRIPT, petControlOffset } from '../src/pet-control-clearance.mjs'

const require = createRequire(new URL('../../../packages/dsh-pet/package.json', import.meta.url))
const { JSDOM } = require('jsdom')

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
