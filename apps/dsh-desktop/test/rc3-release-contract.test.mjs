import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createDesktopProfileManifest, isAgentTeamProfileEnabled, AGENT_TEAM_PROFILE_BUNDLE, BUILTIN_BUNDLES, mergeDesktopPatch } from '../src/profile.mjs'
import { parse } from 'yaml'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)))
const rootManifest = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url)))

test('next Desktop has an unambiguous candidate version and exact official rc.5 core', () => {
  assert.equal(manifest.version, '5.3.5')
  assert.equal(rootManifest.version, manifest.version)
  assert.equal(manifest.dependencies['@deepseek-ai/dsh'], '0.2.2-rc.5')
  assert.equal(manifest.dependencies['@deepseek-ai/dsh-web-app'], '0.2.2-rc.5')
  assert.equal(manifest.dependencies['@deepseek-ai/cordis'], '4.1.0')
})

test('retired team profile migrates its switch and never returns on repeated composition', () => {
  const original = { custom: { keep: true }, dsh: { profile: { bundles: [AGENT_TEAM_PROFILE_BUNDLE, '@community/example'] } } }
  const migrated = createDesktopProfileManifest(original)
  assert.equal(migrated.dsh.profile.bundles.includes(AGENT_TEAM_PROFILE_BUNDLE), false)
  assert.equal(isAgentTeamProfileEnabled(migrated), true)
  assert.deepEqual(createDesktopProfileManifest(migrated), migrated)
  assert.deepEqual(migrated.custom, original.custom)
  assert.equal(migrated.dsh.profile.bundles.includes('@community/example'), true)
  assert.equal(original.dsh.profile.bundles.includes(AGENT_TEAM_PROFILE_BUNDLE), true)
})

test('explicit team disable takes precedence over a stale legacy bundle', () => {
  const next = createDesktopProfileManifest({ dsh: { profile: { desktopAgentTeamEnabled: false, bundles: [AGENT_TEAM_PROFILE_BUNDLE] } } })
  assert.equal(isAgentTeamProfileEnabled(next), false)
  assert.equal(next.dsh.profile.bundles.includes(AGENT_TEAM_PROFILE_BUNDLE), false)
})

test('context suite is pinned while existing memory and preferences remain installed', () => {
  assert.equal(manifest.dependencies['dsh-context'], '0.85.1')
  assert.equal(manifest.dependencies['dsh-context-memory'], '1.2.0')
  assert.equal(manifest.dependencies['dsh-prompt-customizer'], '2.2.0')
  assert.equal(manifest.dependencies['@ningbainb/dsh-memory'], 'workspace:*')
  assert.equal(manifest.dependencies['@ningbainb/dsh-personal-prompt'], 'workspace:*')
})

test('context suite is composed once and optional collection/customization starts disabled', () => {
  const profile = createDesktopProfileManifest()
  for (const name of ['dsh-context', 'dsh-context-memory', 'dsh-prompt-customizer']) {
    assert.equal(BUILTIN_BUNDLES.filter(item => item === name).length, 1)
    assert.equal(profile.dsh.profile.bundles.filter(item => item === name).length, 1)
  }
  const rows = parse(mergeDesktopPatch())
  assert.equal(rows.find(row => row.id === 'dsh-context-memory')?.disabled, true)
  assert.equal(rows.find(row => row.id === 'prompt-customizer')?.disabled, true)
})

test('changing global team switch updates only defaultEnabled in a preserved managed config', () => {
  const before = mergeDesktopPatch('', undefined, { agentTeamEnabled: false })
  const changed = before.replace('maxTasks: 256', 'maxTasks: 99')
  const next = parse(mergeDesktopPatch(changed, undefined, { agentTeamEnabled: true }))
  assert.deepEqual(next.find(row => row.id === 'agent-team').config, { maxTasks: 99, defaultEnabled: true })
})

test('minimal defaults apply to new installations and preserve ambiguous legacy defaults', () => {
  const fresh = createDesktopProfileManifest()
  assert.equal(fresh.dsh.profile.desktopDefaults, 'minimal-v1')
  const legacy = createDesktopProfileManifest({ name: 'existing-user', dsh: { profile: { bundles: [] } } })
  assert.equal(legacy.dsh.profile.desktopDefaults, 'legacy-preserved')
  assert.equal(createDesktopProfileManifest({}, { isNewInstallation: false }).dsh.profile.desktopDefaults, 'legacy-preserved')
  const rows = parse(mergeDesktopPatch('', undefined, { minimalDefaults: true }))
  for (const id of ['pet', 'dafeiyu-pet', 'live-stats']) assert.equal(rows.findLast(row => row.id === id)?.disabled, true)
  const saved = mergeDesktopPatch('', undefined, { minimalDefaults: true }) + '\n- id: pet\n  disabled: false\n'
  assert.equal(parse(mergeDesktopPatch(saved, undefined, { minimalDefaults: true })).findLast(row => row.id === 'pet').disabled, false)
})
