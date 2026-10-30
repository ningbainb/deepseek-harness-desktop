import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { after, before, test } from 'node:test'

const require = createRequire(new URL('../../../packages/dsh-release-plugin-adapter/package.json', import.meta.url))
const { transform } = require('lightningcss')
const { chromium } = createRequire(new URL('../package.json', import.meta.url))('playwright')
const source = readFileSync(new URL('../../../packages/dsh-release-plugin-adapter/src/client/adapter.module.css', import.meta.url))
const compiled = transform({ filename: 'adapter.module.css', code: source, cssModules: true })
let browser
before(async () => { browser = await chromium.launch({ headless: true }) })
after(async () => { await browser?.close() })

// Isolated Chromium component fixture, separate from native application acceptance.
// The same native tooltip assertions remain in verify-beta-usability.mjs.
async function fixture(t, width, label) {
  const page = await browser.newPage({ viewport: { width, height: 640 } })
  t.after(() => page.close())
  await page.setContent(`<style>${compiled.code.toString()}
    body{margin:0;font:13px system-ui}main{display:flex;align-items:center;flex-direction:column;width:100%}
    [data-composer-dock]{display:flex;justify-content:center;align-items:center;gap:12px;max-width:100%}
    button,summary{flex:none;white-space:nowrap}
  </style><main data-conversation-session="fixture" style="width:calc(100% - ${width >= 880 ? 264 : 0}px);margin-left:${width >= 880 ? 264 : 0}px">
    <div data-composer-card><div data-composer-placeholder></div></div>
    <div data-composer-dock><button>1 turn</button><span class="${compiled.exports.predictionHint.name}" role="note">${label}</span><summary>Usage details</summary><button id="context">Context</button></div>
  </main>`)
  const style = () => page.getByRole('note', { includeHidden: true }).evaluate(guide => {
    const style = getComputedStyle(guide)
    return { display: style.display, visibility: style.visibility, flexShrink: style.flexShrink, minWidth: style.minWidth,
      overflow: style.overflow, textOverflow: style.textOverflow, whiteSpace: style.whiteSpace, pointerEvents: style.pointerEvents,
      focusable: guide.hasAttribute('tabindex'), textFits: guide.scrollWidth <= guide.clientWidth + 1,
      context: document.querySelector('#context').getBoundingClientRect().toJSON(),
      controlsInside: [...document.querySelectorAll('button,summary')].every(control => {
        const rect = control.getBoundingClientRect(); return rect.width > 0 && rect.left >= 0 && rect.right <= innerWidth
      }) }
  })
  const suggestion = active => page.locator('[data-composer-placeholder]').evaluate((element, active) => element.classList.toggle('pp-inline-active', active), active)
  const composing = active => page.locator('[data-composer-placeholder]').evaluate((element, active) => {
    if (active) element.setAttribute('data-composer-composing', 'true')
    else element.removeAttribute('data-composer-composing')
  }, active)
  return { page, style, suggestion, composing }
}

test('prediction guide keeps its layout box while suggestions appear, compose and disappear', async t => {
  for (const width of [880, 1024]) for (const label of ['Tab 采纳建议，确认后发送', 'Tab to accept · Review before sending']) {
  const f = await fixture(t, width, label)
  const inactive = await f.style()
  assert.notEqual(inactive.display, 'none', 'A late suggestion must not insert a new flex item and move the hovered context button')
  assert.equal(inactive.visibility, 'hidden', 'No shortcut text is exposed without a suggestion')
  const display = inactive.display
  for (const [action, active, visibility] of [[f.suggestion, true, 'visible'], [f.composing, true, 'hidden'], [f.composing, false, 'visible'], [f.suggestion, false, 'hidden']]) {
    await action(active)
    const current = await f.style()
    assert.equal(current.visibility, visibility)
    assert.equal(current.display, display, 'Guide visibility preserves flex participation')
    assert.equal(current.context.x, inactive.context.x, 'Guide transitions keep the context button horizontally stable')
    assert.equal(current.context.y, inactive.context.y, 'Guide transitions keep the context button vertically stable')
    assert.equal(current.controlsInside, true)
    assert.equal(current.textFits, true, 'The full guide remains readable beside the tested desktop controls')
  }
  }
})

test('the reserved guide can shrink without covering controls or taking pointer input', async t => {
  for (const width of [360, 880]) {
  const f = await fixture(t, width, 'Tab to accept · Review before sending')
  await f.suggestion(true)
  const style = await f.style()
  assert.equal(Number(style.flexShrink), width <= 640 ? 1 : 0)
  assert.equal(parseFloat(style.minWidth), 0)
  assert.equal(style.overflow, 'hidden')
  assert.equal(style.textOverflow, 'ellipsis')
  assert.equal(style.whiteSpace, 'nowrap')
  assert.equal(style.pointerEvents, 'none')
  assert.equal(style.focusable, false)
  assert.equal(style.controlsInside, true)
  }
})
