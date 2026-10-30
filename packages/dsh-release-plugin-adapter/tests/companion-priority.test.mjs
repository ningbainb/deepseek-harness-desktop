import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const require = createRequire(new URL('../../../apps/dsh-desktop/package.json', import.meta.url))
const root = process.env.DSH_PET_PRIORITY_PACKAGE_ROOT ?? dirname(require.resolve('@linxin666/dsh-pet/package.json'))
const localRequire = createRequire(new URL('../package.json', import.meta.url))
const ts = localRequire('typescript')
const source = readFileSync(join(root, 'src/client/companion-priority.ts'), 'utf8')
const module = { exports: {} }
runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
  { module, exports: module.exports })
const { installCompanionPriority } = module.exports

function fixture(active) {
  const target = new EventTarget()
  let value = active
  target.document = { documentElement: { getAttribute(key) {
    assert.equal(key, 'data-desktop-dafeiyu-visible'); return value
  } } }
  let changes = 0
  const policy = installCompanionPriority(target, () => { changes++ })
  return { target, policy, set(next) { value = next; target.dispatchEvent(new Event('dsh-dafeiyu-visibility')) }, changes: () => changes }
}

test('full-body companion suppresses the original; absence preserves standalone pet behavior', () => {
  for (const [value, allowed] of [[null, true], ['false', true], ['true', false]]) {
    const f = fixture(value)
    assert.equal(f.policy.allowed(), allowed)
    assert.equal(f.changes(), 0)
    f.policy.dispose()
  }
})

test('on/off/on signals every transition; malformed events use current document policy', () => {
  const f = fixture('false')
  f.set('true'); assert.equal(f.policy.allowed(), false)
  f.set('false'); assert.equal(f.policy.allowed(), true)
  f.set('true'); assert.equal(f.policy.allowed(), false)
  assert.equal(f.changes(), 3)
  f.target.dispatchEvent(new CustomEvent('dsh-dafeiyu-visibility', { detail: 'false' }))
  assert.equal(f.policy.allowed(), false)
  f.policy.dispose()
})

test('adapter disposal releases priority before its old document attribute is restored', () => {
  const f = fixture('true')
  f.target.dispatchEvent(new CustomEvent('dsh-dafeiyu-visibility', { detail: false }))
  assert.equal(f.policy.allowed(), true)
  assert.equal(f.changes(), 1)
  f.policy.dispose()
})

test('disposal removes the listener and prevents late remount notifications', () => {
  const f = fixture('true')
  f.policy.dispose(); f.policy.dispose(); f.set('false')
  assert.equal(f.changes(), 0)
})
