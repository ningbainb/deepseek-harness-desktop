import assert from 'node:assert/strict'
import test from 'node:test'
import { composeEntries } from '@deepseek-ai/dsh-app-boot'
import * as clientHmr from '../src/runtime-client-hmr.mjs'

const { adaptDesktopClientHmrPatches } = clientHmr

const official = '@deepseek-ai/dsh-client-hmr'
const desktop = '@linxin666/dsh-desktop-client-hmr'

test('the Desktop HMR package identity is exported for explicit profile admission', () => {
  assert.equal(clientHmr.DESKTOP_CLIENT_HMR_PACKAGE, desktop)
})

test('explicit profile admission maps the same row without a name-guard marker', () => {
  const source = [
    { insert: [{ id: 'client-hmr', name: official, config: { pollIntervalMs: 500 } }] },
    { id: 'client-hmr', name: desktop, config: { pollIntervalMs: 1250 }, disabled: true },
  ]
  const withoutMarker = [source[0], { id: 'client-hmr', name: official, config: { pollIntervalMs: 750 }, disabled: true }]
  const before = JSON.stringify(withoutMarker)
  const diagnostics = []
  const entries = composeEntries(adaptDesktopClientHmrPatches(withoutMarker, { enabled: true }), message => diagnostics.push(message))
  assert.deepEqual(entries, [{ id: 'client-hmr', name: desktop, config: { pollIntervalMs: 750 }, disabled: true }])
  assert.deepEqual(composeEntries(adaptDesktopClientHmrPatches(source, { enabled: true })),
    [{ id: 'client-hmr', name: desktop, config: { pollIntervalMs: 1250 }, disabled: true }])
  assert.deepEqual(diagnostics, [])
  assert.equal(JSON.stringify(withoutMarker), before)
})

test('explicitly disabled admission wins over every legacy opt-in marker', () => {
  const source = [{ insert: [{ id: 'client-hmr', name: official, config: { pollIntervalMs: 750 } }] },
    { id: 'client-hmr', name: desktop }]
  assert.equal(adaptDesktopClientHmrPatches(source, { enabled: false }), source)
  assert.equal(composeEntries(adaptDesktopClientHmrPatches(source, { enabled: false }))[0].name, official)
  assert.equal(composeEntries(adaptDesktopClientHmrPatches(source))[0].name, desktop)
})

test('actual SDK name guards cannot silently leave the synchronous HMR owner mounted', () => {
  const source = [
    { insert: [{ id: 'client-hmr', name: official, config: { pollIntervalMs: 750 } }] },
    { id: 'client-hmr', name: desktop },
    { id: 'client-hmr', name: official, config: { pollIntervalMs: 1250 } },
  ]
  const before = structuredClone(source)
  const unadapted = composeEntries(source)
  assert.equal(unadapted[0].name, official, 'the SDK treats name as a guard, not a rename operation')
  const diagnostics = []
  const entries = composeEntries(adaptDesktopClientHmrPatches(source), message => diagnostics.push(message))
  assert.equal(entries.length, 1)
  assert.deepEqual(entries[0], { id: 'client-hmr', name: desktop, config: { pollIntervalMs: 1250 } })
  assert.deepEqual(diagnostics, [])
  assert.deepEqual(source, before, 'official and user patch inputs must remain untouched')
})

test('profile HMR adaptation is opt-in, preserves disabled state, and ignores unrelated names and config values', () => {
  const disabled = { id: 'client-hmr', name: official, disabled: true, config: { pollIntervalMs: 2000 } }
  const source = [{ insert: [disabled, { id: 'another-owner', name: official },
    { id: 'custom', name: '@community/own-hmr', config: { id: 'client-hmr', name: official } }] }]
  assert.equal(adaptDesktopClientHmrPatches(source), source)
  const optedIn = [...source, { id: 'client-hmr', name: desktop }]
  const entries = composeEntries(adaptDesktopClientHmrPatches(optedIn))
  assert.equal(entries[0].disabled, true)
  assert.equal(entries[0].config.pollIntervalMs, 2000)
  assert.equal(entries[1].name, official)
  assert.deepEqual(entries[2].config, { id: 'client-hmr', name: official })
})

test('nested Loader groups preserve their structure while initial and live compositions use the same owner', () => {
  const patches = [{ insert: [{ id: 'group', group: true, config: [{ id: 'client-hmr', name: official }] }] },
    { id: 'client-hmr', name: desktop }, { id: 'client-hmr', name: official, config: { pollIntervalMs: 1500 } }]
  const first = composeEntries(adaptDesktopClientHmrPatches(patches))
  const next = composeEntries(adaptDesktopClientHmrPatches([...patches, { id: 'client-hmr', config: { pollIntervalMs: 2500 } }]))
  assert.equal(first[0].config[0].name, desktop)
  assert.equal(first[0].config[0].config.pollIntervalMs, 1500)
  assert.equal(next[0].config[0].name, desktop)
  assert.equal(next[0].config[0].config.pollIntervalMs, 2500)
})

test('config-only group replacements inherit the real target group without changing input bytes or user values', () => {
  const source = [
    { insert: [{ id: 'group', name: 'cordis:group', group: true, config: [{ id: 'client-hmr', name: official }] }] },
    { id: 'client-hmr', name: desktop },
    { id: 'group', config: [{ id: 'client-hmr', name: official, disabled: true, config: { pollIntervalMs: 1250 } }] },
  ]
  const before = JSON.stringify(source)
  const adapted = adaptDesktopClientHmrPatches(source)
  const entries = composeEntries(adapted)
  assert.deepEqual(entries[0].config, [{ id: 'client-hmr', name: desktop, disabled: true, config: { pollIntervalMs: 1250 } }])
  assert.equal(Object.hasOwn(adapted[2], 'group'), false)
  assert.equal(JSON.stringify(source), before)
})

test('ordinary plugin config arrays are not interpreted as Loader entries', () => {
  const business = [{ id: 'client-hmr', name: official, disabled: true, config: { pollIntervalMs: 777 } }]
  const source = [
    { insert: [{ id: 'client-hmr', name: official }, { id: 'plugin', name: '@community/plugin', config: business }] },
    { id: 'client-hmr', name: desktop },
    { id: 'plugin', name: '@community/plugin', config: business },
  ]
  const before = JSON.stringify(source)
  const entries = composeEntries(adaptDesktopClientHmrPatches(source))
  assert.deepEqual(entries[1].config, business)
  assert.equal(JSON.stringify(source), before)
})

test('successful group changes determine how later config-only patches are interpreted', () => {
  const source = [
    { insert: [{ id: 'client-hmr', name: official }, { id: 'plugin', name: 'cordis:group' }] },
    { id: 'client-hmr', name: desktop },
    { id: 'plugin', name: 'cordis:group', group: true },
    { id: 'plugin', config: [{ id: 'client-hmr', name: official, config: { pollIntervalMs: 900 } }] },
  ]
  const entries = composeEntries(adaptDesktopClientHmrPatches(source))
  assert.equal(entries[1].group, true)
  assert.deepEqual(entries[1].config, [{ id: 'client-hmr', name: desktop, config: { pollIntervalMs: 900 } }])
})

test('a false group override preserves subsequent ordinary config data', () => {
  const business = [{ id: 'client-hmr', name: official }]
  const source = [
    { insert: [{ id: 'client-hmr', name: official }, { id: 'plugin', name: '@community/plugin', group: true, config: [] }] },
    { id: 'client-hmr', name: desktop },
    { id: 'plugin', group: false },
    { id: 'plugin', config: business },
  ]
  const entries = composeEntries(adaptDesktopClientHmrPatches(source))
  assert.equal(entries[1].group, false)
  assert.deepEqual(entries[1].config, business)
})

test('a rejected name guard cannot turn an ordinary target into a group or rewrite its config', () => {
  const business = [{ id: 'client-hmr', name: official }]
  const source = [
    { insert: [{ id: 'client-hmr', name: official }, { id: 'plugin', name: '@community/plugin', config: business }] },
    { id: 'client-hmr', name: desktop },
    { id: 'plugin', name: '@community/not-the-owner', group: true, config: business },
    { id: 'plugin', config: business },
  ]
  const adapted = adaptDesktopClientHmrPatches(source)
  const diagnostics = []
  const entries = composeEntries(adapted, message => diagnostics.push(message))
  assert.deepEqual(adapted[2].config, business)
  assert.deepEqual(entries[1].config, business)
  assert.equal(entries[1].group, undefined)
  assert.equal(diagnostics.length, 1)
  assert.match(diagnostics[0], /name mismatch/u)
})

test('insert names are not guards and successful group inserts index their nested children', () => {
  const source = [
    { insert: [{ id: 'group', name: 'cordis:group', group: true, config: [] }] },
    { id: 'group', name: '@community/not-a-guard', insert: [{ id: 'inner', group: true, config: [] }] },
    { id: 'inner', insert: [{ id: 'client-hmr', name: official, config: { pollIntervalMs: 500 } }] },
    { id: 'client-hmr', name: desktop },
    { id: 'client-hmr', name: official, config: { pollIntervalMs: 1500 } },
  ]
  const diagnostics = []
  const entries = composeEntries(adaptDesktopClientHmrPatches(source), message => diagnostics.push(message))
  assert.deepEqual(entries[0].config[0].config, [{ id: 'client-hmr', name: desktop, config: { pollIntervalMs: 1500 } }])
  assert.deepEqual(diagnostics, [])
})

test('failed group inserts do not introduce targets for later config mapping', () => {
  const business = [{ id: 'client-hmr', name: official }]
  const source = [
    { insert: [{ id: 'client-hmr', name: official }, { id: 'plugin', name: '@community/plugin' }] },
    { id: 'client-hmr', name: desktop },
    { id: 'plugin', insert: [{ id: 'missing-group', group: true, config: [] }] },
    { id: 'missing-group', config: business },
  ]
  const adapted = adaptDesktopClientHmrPatches(source)
  const diagnostics = []
  const entries = composeEntries(adapted, message => diagnostics.push(message))
  assert.deepEqual(adapted[3].config, business)
  assert.equal(entries.length, 2)
  assert.equal(diagnostics.length, 2)
  assert.match(diagnostics[0], /not a group/u)
  assert.match(diagnostics[1], /not found/u)
})

test('replacing group config does not reindex new children when a later guard targets an old child', () => {
  const business = [{ id: 'client-hmr', name: official }]
  const source = [
    { insert: [{ id: 'client-hmr', name: official },
      { id: 'outer', group: true, config: [{ id: 'inner', name: 'cordis:group', group: true, config: [] }] }] },
    { id: 'client-hmr', name: desktop },
    { id: 'outer', config: [{ id: 'inner', name: '@community/plugin', config: business }] },
    { id: 'inner', name: '@community/plugin', group: true, config: business },
  ]
  const adapted = adaptDesktopClientHmrPatches(source)
  const diagnostics = []
  const entries = composeEntries(adapted, message => diagnostics.push(message))
  assert.deepEqual(adapted[3].config, business)
  assert.deepEqual(entries[1].config, [{ id: 'inner', name: '@community/plugin', config: business }])
  assert.equal(diagnostics.length, 1)
  assert.match(diagnostics[0], /name mismatch/u)
})

test('new children in a group config replacement do not supply group inheritance to subsequent patches', () => {
  const business = [{ id: 'client-hmr', name: official }]
  const source = [
    { insert: [{ id: 'client-hmr', name: official },
      { id: 'outer', group: true, config: [{ id: 'inner', name: '@community/plugin' }] }] },
    { id: 'client-hmr', name: desktop },
    { id: 'outer', config: [{ id: 'inner', name: 'cordis:group', group: true, config: [] }] },
    { id: 'inner', config: business },
  ]
  const adapted = adaptDesktopClientHmrPatches(source)
  const entries = composeEntries(adapted)
  assert.deepEqual(adapted[3].config, business)
  assert.deepEqual(entries[1].config, [{ id: 'inner', name: 'cordis:group', group: true, config: [] }])
})
