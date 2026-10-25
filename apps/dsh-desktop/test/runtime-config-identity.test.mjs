import assert from 'node:assert/strict'
import test from 'node:test'
import { createDesktopConfigurationGuard } from '../src/runtime-config-identity.mjs'

const official = '@deepseek-ai/dsh-client-hmr'
const desktop = '@linxin666/dsh-desktop-client-hmr'
const patches = name => [{ insert: [{ id: 'client-hmr', name, config: { pollIntervalMs: 1250 } }] }]
const entry = (name = desktop, id = 'client-hmr') => ({ options: { id, name } })

test('only a composed official to Desktop owner projects the exact actual entry name', () => {
  const guard = createDesktopConfigurationGuard()
  const raw = patches(official)
  const mapped = patches(desktop)
  const before = JSON.stringify([raw, mapped])
  assert.equal(guard.nameFor(entry()), desktop)
  guard.record(raw, mapped)
  assert.equal(guard.nameFor(entry()), official)
  assert.equal(guard.nameFor(entry(official)), official)
  assert.equal(guard.nameFor(entry('@other/plugin')), '@other/plugin')
  assert.equal(guard.nameFor(entry(desktop, 'another-id')), desktop)
  assert.equal(JSON.stringify([raw, mapped]), before)
})

test('record replaces rather than accumulates old source-owner aliases', () => {
  const guard = createDesktopConfigurationGuard()
  for (const [raw, mapped] of [[patches(desktop), patches(desktop)], [patches(official), patches(official)],
    [patches('@other/owner'), patches(desktop)], [[], patches(desktop)], [patches(official), []]]) {
    guard.record(patches(official), patches(desktop))
    assert.equal(guard.nameFor(entry()), official)
    guard.record(raw, mapped)
    assert.equal(guard.nameFor(entry()), desktop)
  }
})

test('name guards are evaluated by SDK composition rather than inferred from patch mentions', () => {
  const guard = createDesktopConfigurationGuard()
  guard.record([...patches('@other/owner'), { id: 'client-hmr', name: official, config: { pollIntervalMs: 900 } }], patches(desktop))
  assert.equal(guard.nameFor(entry()), desktop)
  guard.record(patches(official), [...patches('@other/owner'), { id: 'client-hmr', name: desktop }])
  assert.equal(guard.nameFor(entry()), desktop)
})

test('nested real groups participate in unique-id checks but ordinary config arrays do not', () => {
  const guard = createDesktopConfigurationGuard()
  const group = name => [{ insert: [{ id: 'group', group: true, config: [{ id: 'client-hmr', name }] }] }]
  guard.record(group(official), group(desktop))
  assert.equal(guard.nameFor(entry()), official)
  for (const side of ['raw', 'mapped']) {
    const duplicate = name => [{ insert: [
      { id: 'group-a', group: true, config: [{ id: 'client-hmr', name }] },
      { id: 'group-b', group: true, config: [{ id: 'client-hmr', name }] },
    ] }]
    guard.record(side === 'raw' ? duplicate(official) : group(official), side === 'mapped' ? duplicate(desktop) : group(desktop))
    assert.equal(guard.nameFor(entry()), desktop)
  }
  const business = name => [...patches(name), { insert: [{ id: 'business', name: '@other/plugin', config: [{ id: 'client-hmr', name }] }] }]
  guard.record(business(official), business(desktop))
  assert.equal(guard.nameFor(entry()), official)
})

test('invalid composition fails closed instead of retaining an earlier alias', () => {
  const guard = createDesktopConfigurationGuard()
  guard.record(patches(official), patches(desktop))
  assert.throws(() => guard.record(null, patches(desktop)), TypeError)
  assert.equal(guard.nameFor(entry()), desktop)
})
