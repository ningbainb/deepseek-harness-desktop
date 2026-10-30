import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const { JSDOM } = createRequire(new URL('../../../packages/dsh-web-ui-settings/package.json', import.meta.url))('jsdom')
const source = readFileSync(require.resolve('@linxin666/dsh-usage/client'), 'utf8')
function shippedFunction(name) {
  const start = source.indexOf(`\t\tfunction ${name}(`)
  if (start < 0) return ''
  const end = source.indexOf('\n\t\t}', start)
  assert.ok(end > start, `shipped ${name} body must exist`)
  return source.slice(start, end + '\n\t\t}'.length)
}

function fixture(t, html = '<aside data-pane="sidebar"><div class="shell_footArea"><div class="shell_settingsArea"><button>Settings</button></div></div></aside><main id="conversation"></main>') {
  const dom = new JSDOM(html)
  t.after(() => dom.window.close())
  const { document } = dom.window
  let invalidation, queries = 0, unmounted = 0, unsubscribed = 0
  const originalQuery = document.querySelector.bind(document)
  document.querySelector = selector => {
    if (selector.includes('sidebar')) queries++
    return originalQuery(selector)
  }
  const context = vm.createContext({
    document, SIDEBAR_SELECTOR: '[data-pane="sidebar"], [class*="sidebarCol"]',
    FOOT_CARD_SELECTOR: '[data-dsh-usage-foot-card]', SETTINGS_AREA_SELECTOR: '[class*="settingsArea"]',
    react_dom_client: { createRoot: container => ({ render: () => { container.textContent = 'Today spending' }, unmount: () => { unmounted++ } }) },
    react: { createElement() {} }, UsageFootCard() {},
    subscribeBodyInvalidations: listener => { invalidation = listener; return () => { unsubscribed++ } },
  })
  vm.runInContext(`${shippedFunction('sidebarColumn')}\n${shippedFunction('footArea')}\n${shippedFunction('mountUsageFootCard')}`, context)
  const dispose = vm.runInContext('mountUsageFootCard({})', context)
  return { document, dispose, invalidate: () => invalidation(),
    stats: () => ({ queries, unmounted, unsubscribed }),
    card: () => originalQuery('[data-dsh-usage-foot-card]'),
    foot: () => originalQuery('[class*="footArea"]'), settings: () => originalQuery('[class*="settingsArea"]'),
  }
}

test('settled usage footer does not rescan the sidebar during streaming or pet mutations', t => {
  const f = fixture(t)
  const card = f.card(), settings = f.settings()
  assert.equal(card.nextElementSibling, settings)
  for (let index = 0; index < 1000; index++) {
    f.document.getElementById('conversation').textContent = `chunk ${index}`
    f.invalidate()
  }
  assert.ok(f.stats().queries < 20, `stream caused ${f.stats().queries} sidebar scans`)
  assert.equal(f.card(), card)
  assert.equal(card.nextElementSibling, settings)
  assert.equal(settings.textContent, 'Settings')
  f.dispose()
  assert.deepEqual(f.stats(), { queries: f.stats().queries, unmounted: 1, unsubscribed: 1 })
  assert.equal(card.isConnected, false)
  assert.equal(settings.isConnected, true)
})

test('usage footer heals after settings replacement, footer replacement and displaced card', t => {
  const f = fixture(t)
  const card = f.card()
  const replacement = f.settings().cloneNode(true)
  f.settings().replaceWith(replacement)
  f.invalidate()
  assert.equal(card.nextElementSibling, replacement)
  const nextFoot = f.foot().cloneNode(false)
  nextFoot.innerHTML = '<div class="next_settingsArea"><button>New settings</button></div>'
  f.foot().replaceWith(nextFoot)
  f.invalidate()
  assert.equal(f.card(), card)
  assert.equal(card.parentElement, nextFoot)
  assert.equal(card.nextElementSibling, f.settings())
  f.document.body.append(card)
  f.invalidate()
  assert.equal(card.parentElement, nextFoot)
  assert.equal(card.nextElementSibling, f.settings())
  f.dispose()
})

test('usage footer handles late sidebar and settings without losing its mounted card', t => {
  const f = fixture(t, '<main id="conversation"></main>')
  assert.equal(f.card(), null)
  f.document.body.insertAdjacentHTML('afterbegin', '<aside data-pane="sidebar"><div class="shell_footArea"></div></aside>')
  f.invalidate()
  const card = f.card()
  assert.equal(f.foot().lastElementChild, card)
  f.foot().insertAdjacentHTML('afterbegin', '<div class="late_settingsArea"><button>Late settings</button></div>')
  f.invalidate()
  assert.equal(card.nextElementSibling, f.settings())
  f.dispose()
})
