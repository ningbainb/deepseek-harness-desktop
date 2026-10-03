import assert from 'node:assert/strict'
import test from 'node:test'
import { chromium } from 'playwright'
import { syncWindowChromeSkinInsets, markWindowChromeViewportRoot, WINDOW_CHROME_CSS, createWindowChromeScript } from '../src/window-chrome.mjs'
import { createStarPromptSurfaceScript, STAR_PROMPT_CSS } from '../src/star-prompt.mjs'

test('a dismissed native dialog leaves the optional prompt reachable above a fixed application root', async context => {
  const browser = await chromium.launch({ headless: true })
  context.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } })
  await page.setContent('<html><body style="margin:0"><div id="root" style="position:fixed;inset:0;background:white"><main><section role="dialog"><button id="native-dismiss">Close native dialog</button></section><div data-dsh-part="scrollport" style="height:100vh">Conversation</div></main></div></body></html>')
  await page.evaluate(() => {
    document.getElementById('native-dismiss').addEventListener('click', event => event.target.closest('[role="dialog"]').remove())
  })
  await page.addStyleTag({ content: WINDOW_CHROME_CSS })
  await page.evaluate(createWindowChromeScript())
  assert.equal(await page.locator('#root').evaluate(root => root.classList.contains('dsh-desktop-modal-layer')), false)
  await page.getByRole('button', { name: 'Close native dialog', exact: true }).click()
  await page.addStyleTag({ content: STAR_PROMPT_CSS })
  await page.evaluate(createStarPromptSurfaceScript({ forceVisible: true, showDelayMs: 0 }))
  const prompt = page.locator('#dsh-desktop-star-prompt[data-open="true"]')
  await prompt.waitFor({ state: 'visible' })
  await prompt.getByRole('button', { name: '先继续使用', exact: true }).click()
  await prompt.waitFor({ state: 'hidden' })
  assert.equal(await page.locator('#root').evaluate(root => root.classList.contains('dsh-desktop-modal-layer')), false)
})

test('skin viewport reset cannot override the native caption or additive skin bar reservations', async context => {
  const browser = await chromium.launch({ headless: true })
  context.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } })
  await page.setContent('<html><head><style>html,body,#root{height:100%;margin:0}</style></head><body><div id="root">Conversation and official login</div></body></html>')
  await page.addStyleTag({ content: WINDOW_CHROME_CSS })
  await page.evaluate(createWindowChromeScript())
  await page.addStyleTag({ content: 'html[data-dsh-skin], html[data-dsh-skin] body { height:100%!important; width:100%!important; margin:0!important; padding:0!important; overflow:hidden!important } [data-skin-chrome="titlebar"] { position:fixed;top:0;height:30px } [data-skin-chrome="statusbar"] { position:fixed;bottom:0;height:24px }' })
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-dsh-skin', 'xp')
    for (const kind of ['titlebar', 'statusbar']) {
      const bar = document.createElement('div')
      bar.setAttribute('data-skin-chrome', kind)
      document.body.appendChild(bar)
    }
  })
  await page.waitForFunction(() => document.getElementById('root').getBoundingClientRect().top === 62)
  const root = await page.locator('#root').boundingBox()
  assert.equal(root.y, 62)
  assert.equal(root.y + root.height, 776)
  await page.evaluate(() => {
    for (const bar of document.querySelectorAll('[data-skin-chrome]')) bar.remove()
    document.documentElement.removeAttribute('data-dsh-skin')
  })
  await page.waitForFunction(() => document.getElementById('root').getBoundingClientRect().top === 32)
  assert.equal((await page.locator('#root').boundingBox()).height, 768)
})

test('skin caption and status bars add to native chrome without mutation loops', () => {
  const values = new Map()
  let mutations = 0
  const style = { getPropertyValue: name => values.get(name) ?? '', setProperty: (name, value) => { values.set(name, value); mutations++ } }
  const bar = (kind, top, bottom) => ({ getAttribute: () => kind, style: { position: 'fixed', display: 'flex', visibility: 'visible' },
    getBoundingClientRect: () => ({ top, bottom, height: bottom - top }) })
  const title = bar('titlebar', 32, 62)
  const status = bar('statusbar', 776, 800)
  const document = { body: { children: [title, status], style: { paddingBottom: '26px' } }, documentElement: { style } }
  const sync = new Function(`return (${syncWindowChromeSkinInsets.toString()})`)()
  for (let index = 0; index < 20; index++) sync({ document, getComputedStyle: element => element.style, chromeHeight: 32, viewportHeight: 800 })
  assert.equal(values.get('--dsh-desktop-skin-top-inset'), '30px')
  assert.equal(values.get('--dsh-desktop-skin-bottom-inset'), '26px')
  assert.equal(mutations, 2)
  document.body.children = []
  document.body.style.paddingBottom = '0px'
  sync({ document, getComputedStyle: element => element.style, chromeHeight: 32, viewportHeight: 800 })
  assert.equal(values.get('--dsh-desktop-skin-top-inset'), '0px')
  assert.equal(values.get('--dsh-desktop-skin-bottom-inset'), '0px')
})

test('hidden skin bars do not reserve space and oversized bars cannot overflow the viewport', () => {
  const values = new Map()
  const title = { getAttribute: () => 'titlebar', style: { position: 'fixed', display: 'none' }, getBoundingClientRect: () => ({ top: 32, bottom: 1000, height: 968 }) }
  const document = { body: { children: [title], style: { paddingBottom: '24px' } },
    documentElement: { style: { getPropertyValue: name => values.get(name), setProperty: (name, value) => values.set(name, value) } } }
  const sync = () => syncWindowChromeSkinInsets({ document, getComputedStyle: element => element.style, chromeHeight: 32, viewportHeight: 800 })
  sync()
  assert.equal(values.get('--dsh-desktop-skin-top-inset'), '0px')
  title.style.display = 'flex'
  sync()
  assert.equal(values.get('--dsh-desktop-skin-top-inset'), '768px')
  assert.equal(values.get('--dsh-desktop-skin-bottom-inset'), '0px')
})

test('a positioned root behind a newly mounted skin caption receives the combined inset', () => {
  let marked = false
  const document = { body: {}, documentElement: { style: { getPropertyValue: () => '30px' } }, getElementById: () => root }
  const root = { parentElement: document.body, classList: { contains: () => marked, toggle: (_name, enabled) => { marked = enabled } }, getBoundingClientRect: () => ({ top: 32 }) }
  markWindowChromeViewportRoot({ document, getComputedStyle: () => ({ position: 'fixed' }), chromeHeight: 32 })
  assert.equal(marked, true)
})
