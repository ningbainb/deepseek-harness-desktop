import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import test from 'node:test'
import * as fixture from '../scripts/dock-settings-fixture.mjs'
import { assertAgentTeamProfile } from '../scripts/agent-team-profile-fixture.mjs'
import { createDesktopProfileManifest, mergeDesktopPatch } from '../src/profile.mjs'

const require = createRequire(new URL('../../../packages/dsh-web-ui-settings/package.json', import.meta.url))
const { JSDOM } = require('jsdom')
const html = await readFile(new URL('../src/ui/extensions.html', import.meta.url), 'utf8')

test('clarity acceptance reaches every retained destination through its real primary group', async () => {
  assert.equal(typeof fixture.visitDockDestination, 'function')
  const dom = new JSDOM(html)
  const { document } = dom.window
  const clicked = []
  const dock = { locator(selector) {
    const element = document.querySelector(selector)
    assert.ok(element, selector)
    return {
      evaluate: async callback => callback(element),
      async scrollIntoViewIfNeeded() { assert.equal(element.closest('[hidden]'), null, `${selector} must be reached via its primary group`) },
      async click() {
        assert.equal(element.closest('[hidden]'), null, `${selector} must support ordinary clicks`)
        clicked.push(element.id)
        for (const nav of document.querySelectorAll('[data-tab-group]')) nav.hidden = nav.dataset.tabGroup !== element.dataset.group
        for (const tab of document.querySelectorAll('[data-tab]')) tab.classList.toggle('active', tab === element)
      },
      async waitFor() { assert.equal(element.classList.contains('active'), true) },
    }
  } }
  for (const id of ['control-center', 'models', 'value-mode', 'personal-prompt', 'describe-image', 'usage', 'sessions',
    'plugins-hub', 'plugin-options', 'skills', 'qqbot', 'appearance', 'particle-theme', 'backup', 'recovery']) {
    await fixture.visitDockDestination(dock, `${id}-tab`)
    assert.equal(clicked.at(-1), `${id}-tab`)
  }
  assert.equal(new Set(clicked).size >= 15, true)
})

test('team acceptance validates the rc3 persisted switch instead of inserting a duplicate official roster bundle', async () => {
  const source = await readFile(new URL('../scripts/verify-dock-settings.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /bundles\.includes\('@deepseek-ai\/dsh-agent-team'\), true/u)
  assert.match(source, /assertAgentTeamProfile\(enabledProfile,[\s\S]*?true\)/u)
  assert.match(source, /assertAgentTeamProfile\(disabledProfile,[\s\S]*?false\)/u)
})

test('team acceptance rejects manifest/patch disagreement and checks both actual rc3 switch values', () => {
  for (const enabled of [true, false]) {
    const profile = createDesktopProfileManifest({ dsh: { profile: { desktopAgentTeamEnabled: enabled } } })
    const patch = mergeDesktopPatch('', undefined, { agentTeamEnabled: enabled })
    assertAgentTeamProfile(profile, patch, enabled)
    assert.throws(() => assertAgentTeamProfile(profile, patch, !enabled))
    assert.throws(() => assertAgentTeamProfile(profile, patch.replace(`defaultEnabled: ${enabled}`, `defaultEnabled: ${!enabled}`), enabled))
  }
})

test('warm model tabs and preset export use the visible grouped navigation driver', async () => {
  const catalog = await readFile(new URL('../scripts/verify-dock-model-catalog.mjs', import.meta.url), 'utf8')
  const preset = await readFile(new URL('../scripts/verify-preset-export.mjs', import.meta.url), 'utf8')
  assert.ok(catalog.includes("await visitDockDestination(dock, id + '-tab')"))
  assert.ok(preset.includes("await visitDockDestination(dock, 'backup-tab')"))
})
