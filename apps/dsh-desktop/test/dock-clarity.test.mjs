import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const stylesheet = await readFile(new URL('../src/ui/extensions.css', import.meta.url), 'utf8')
const html = await readFile(new URL('../src/ui/extensions.html', import.meta.url), 'utf8')
const base = await readFile(new URL('../src/ui/harness-base.css', import.meta.url), 'utf8')

test('dedicated Dock settings stay below the official body-portal overlays', async () => {
  const require = createRequire(import.meta.url)
  const settings = await readFile(new URL('../../../packages/dsh-web-ui-settings/src/client/dock-settings.module.css', import.meta.url), 'utf8')
  const sdk = pathToFileURL(require.resolve('@deepseek-ai/dsh-client-ui-primitives/package.json'))
  const zIndex = (css, selector) => Number(css.match(new RegExp(`${selector}\\s*\\{[^}]*z-index:\\s*(\\d+)`, 'u'))?.[1])
  const dockLayer = zIndex(settings, '\\.page')
  for (const stylesheet of ['Modal.module.css', 'HoverCard.module.css', 'Menu.module.css']) {
    const overlay = await readFile(new URL(`lib/${stylesheet}`, sdk), 'utf8')
    const overlayLayer = Number(overlay.match(/z-index:\s*(\d+)/u)?.[1])
    assert.ok(Number.isFinite(dockLayer) && dockLayer > 0 && dockLayer < overlayLayer,
      `Dock layer ${dockLayer} must remain below ${stylesheet} layer ${overlayLayer}`)
  }
})

test('dedicated Dock pet stacking preserves the companion below popup controls without hiding or disabling it', async () => {
  const settings = await readFile(new URL('../../../packages/dsh-web-ui-settings/src/client/dock-settings.module.css', import.meta.url), 'utf8')
  const declarations = settings.match(/:global\(body:has\(\[data-dsh-dock-settings\]\) > \[data-dsh-pet-root\]\)\s*\{([^}]+)\}/u)?.[1]
  assert.ok(declarations, 'pet stacking must be scoped to the dedicated Dock document only')
  assert.match(declarations, /position:\s*relative/u)
  const layer = Number(declarations.match(/z-index:\s*(\d+)/u)?.[1])
  assert.ok(layer > 90 && layer < 100)
  assert.doesNotMatch(declarations, /display:\s*none|visibility:\s*hidden|pointer-events:\s*none/u)
})

test('dedicated Dock forms reclaim the whole document width without a reserved pet column or partition', async () => {
  const settings = await readFile(new URL('../../../packages/dsh-web-ui-settings/src/client/dock-settings.module.css', import.meta.url), 'utf8')
  const page = settings.match(/\.page\s*\{([^}]+)\}/u)?.[1]
  assert.match(page, /(?:^|;)\s*width:\s*100%;/u)
  assert.doesNotMatch(settings, /--dsh-dock-pet-rail-width|data-dsh-dock-pet-rail/u)
})

test('Dock surfaces use opaque inherited colors without backdrop compositing', () => {
  assert.doesNotMatch(stylesheet, /(?:-webkit-)?backdrop-filter:\s*(?!none)[^;]*blur/u)
  assert.doesNotMatch(stylesheet, /background:[^;]*gradient/u)
  assert.match(stylesheet, /--glass-sidebar-bg:\s*var\(--harness-bg-subtle\)/u)
  assert.match(stylesheet, /--glass-toolbar-bg:\s*var\(--harness-bg\)/u)
  assert.match(stylesheet, /--glass-card-bg:\s*var\(--harness-bg\)/u)
  assert.match(stylesheet, /--glass-shadow:\s*none/u)
})

test('Dock pointer feedback preserves navigation geometry and visible keyboard focus', () => {
  assert.doesNotMatch(stylesheet, /transform:\s*translateY/u)
  assert.doesNotMatch(stylesheet, /box-shadow:\s*inset 2px 0/u)
  assert.match(stylesheet, /\.settings-sidebar nav button\.tab\.active\s*\{[^}]*box-shadow:\s*none;[^}]*background:\s*var\(--harness-bg-hover\)/u)
  assert.match(stylesheet, /outline:\s*2px solid var\(--harness-accent\)/u)
  assert.match(base, /button:focus-visible/u)
})

test('Dock navigation and chapter surfaces use spacing instead of partitions or frames', () => {
  const sidebarRules = [...stylesheet.matchAll(/(?:^|\n)\.settings-sidebar\s*\{([^}]+)\}/gu)]
  assert.ok(sidebarRules.length > 0)
  assert.ok(sidebarRules.every(([, declarations]) => !/border-right:\s*1px/u.test(declarations)))
  const surface = stylesheet.slice(stylesheet.lastIndexOf('\nform,\n')).split('}')[0]
  assert.match(surface, /\.native-card,/u)
  assert.match(surface, /border:\s*0;/u)
  assert.match(surface, /border-radius:\s*0;/u)
  assert.match(surface, /background:\s*transparent;/u)
  assert.match(stylesheet, /\.native-card\s*\{[^}]*padding:\s*20px 0;/u)
  for (const selector of ['developer-tools', 'native-catalog-disclosure']) {
    const declarations = stylesheet.match(new RegExp(`\\.${selector}\\s*\\{([^}]+)\\}`, 'u'))?.[1]
    assert.doesNotMatch(declarations, /border-top:\s*1px/u)
  }
  const summary = stylesheet.match(/\.plugin-update-summary,\s*\.environment-repair\s*\{([^}]+)\}/u)?.[1]
  assert.match(summary, /border:\s*0;/u)
  assert.match(summary, /background:\s*transparent;/u)
})

test('dedicated Dock collaboration and control sections do not recreate chapter cards', async () => {
  const settings = await readFile(new URL('../../../packages/dsh-web-ui-settings/src/client/dock-settings.module.css', import.meta.url), 'utf8')
  for (const selector of ['collaborationCard', 'controlHero', 'controlCard']) {
    const declarations = settings.match(new RegExp(`\\.${selector}\\s*\\{([^}]+)\\}`, 'u'))?.[1]
    assert.match(declarations, /border:\s*0;/u, selector)
    assert.match(declarations, /border-radius:\s*0;/u, selector)
    assert.match(declarations, /background:\s*transparent;/u, selector)
  }
  assert.doesNotMatch(settings, /border-(?:bottom|top):\s*1px/u)
  assert.match(settings, /summary:focus-visible/u)
})

test('Dock model onboarding and plugin roots share the unframed presentation without flattening their controls', async () => {
  const settings = await readFile(new URL('../../../packages/dsh-web-ui-settings/src/client/dock-settings.module.css', import.meta.url), 'utf8')
  for (const attribute of ['data-relay-onboarding-card', 'data-model-preferences-card', 'data-dsh-plugin']) {
    assert.ok(settings.includes(`.content :global([${attribute}])`), attribute)
  }
  assert.match(settings, /\.content > :global\(li\)/u)
  assert.doesNotMatch(settings, /\.content\s+\*\s*\{[^}]*border:\s*0/u)
})

test('Dock model rows and strategy choices stay unframed without losing selection feedback', async () => {
  const value = await readFile(new URL('../../../packages/dsh-value-mode/src/client/value-mode-dock.module.css', import.meta.url), 'utf8')
  assert.doesNotMatch(value, /border-(?:bottom|top):\s*1px/u)
  const group = value.match(/\.card \[class\*='strategyGroup'\]\s*\{([^}]+)\}/u)?.[1]
  assert.match(group, /border:\s*0;/u)
  assert.match(group, /gap:\s*8px;/u)
  assert.match(value, /button\[aria-pressed='true'\][^}]*font-weight:\s*600/u)
  assert.match(value, /:focus-visible/u)
  assert.match(value, /\[class\*='strategyTitle'\]\s*\{[^}]*font-weight:\s*500/u)
  assert.match(value, /button\[aria-pressed='true'\] \[class\*='strategyTitle'\]\s*\{[^}]*font-weight:\s*650/u)
  assert.match(value, /@media \(max-width: 540px\)[\s\S]*\.setupHint\s*\{[^}]*position:\s*static/u)
})

test('Dock inactive navigation uses readable primary text in light and dark themes', () => {
  const navigationRules = [...stylesheet.matchAll(/(?:^|\n)nav button\.tab\s*\{([^}]+)\}/gu)]
  assert.ok(navigationRules.length > 0)
  assert.ok(navigationRules.some(([, declarations]) => /color:\s*var\(--harness-text\);/u.test(declarations)))
  assert.ok(navigationRules.every(([, declarations]) => !/color:\s*var\(--harness-text-secondary\);/u.test(declarations)))
})

test('Dock readability changes preserve all fifteen destinations and the search control', () => {
  const sidebar = html.slice(html.indexOf('<aside class="settings-sidebar">'), html.indexOf('</aside>'))
  const ids = [...sidebar.matchAll(/id="([^"]+-tab)"/gu)].map(match => match[1])
  assert.deepEqual(ids, ['control-center', 'models', 'value-mode', 'personal-prompt', 'describe-image', 'usage', 'sessions',
    'plugins-hub', 'plugin-options', 'skills', 'qqbot', 'appearance', 'particle-theme', 'backup', 'recovery'].map(id => `${id}-tab`))
  assert.match(sidebar, /id="dock-search"[^>]+type=|type="search"[^>]+id="dock-search"/u)
  assert.match(stylesheet, /height: 28px; min-height: 28px; font-size: 13px/u)
})
