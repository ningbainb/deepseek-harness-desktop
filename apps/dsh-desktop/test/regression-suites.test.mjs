import assert from 'node:assert/strict'
import test from 'node:test'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getRegressionSuites, resolveSuiteTarget, validateRegressionSuites } from '../scripts/regression-suites.mjs'

const appDir = resolve(fileURLToPath(new URL('..', import.meta.url)))

test('macOS full regression catalogue has 29 stable, valid scheduling units', () => {
  const suites = validateRegressionSuites(getRegressionSuites({ platform: 'darwin', full: true }), { appDir })
  assert.equal(suites.length, 29)
  assert.equal(new Set(suites.map(suite => suite.id)).size, suites.length)
  assert.deepEqual(
    suites.reduce((counts, suite) => {
      const target = resolveSuiteTarget(suite, { packagedExecutable: '/candidate/app' })
      counts[target] = (counts[target] ?? 0) + 1
      return counts
    }, {}),
    { packaged: 26, fixture: 1, source: 2 },
  )
})

test('Windows full catalogue preserves its DPI, installer and update suites', () => {
  const suites = validateRegressionSuites(getRegressionSuites({ platform: 'win32', full: true }), { appDir })
  assert.equal(suites.length, 31)
  assert.equal(suites.some(suite => suite.id === 'desktop.windows-dpi'), true)
  assert.equal(suites.some(suite => suite.id === 'desktop.installer-lifecycle-windows'), true)
  assert.equal(suites.some(suite => suite.id === 'desktop.update-shutdown-windows'), true)
  assert.equal(suites.some(suite => suite.id === 'desktop.macos-lifecycle-packaged'), false)
})

test('catalogue validation rejects duplicate ids and missing scripts', () => {
  const valid = getRegressionSuites({ platform: 'darwin' })[0]
  assert.throws(
    () => validateRegressionSuites([valid, { ...valid, script: 'scripts/missing-regression-script.mjs' }], { appDir }),
    /duplicate suite id:[\s\S]*script does not exist/,
  )
})

test('target resolution reports fixture, source and adaptable suites honestly', () => {
  const suites = getRegressionSuites({ platform: 'darwin', full: true })
  const fixture = suites.find(suite => suite.id === 'desktop.settings-readiness')
  const source = suites.find(suite => suite.id === 'desktop.runtime-provider')
  const adaptable = suites.find(suite => suite.id === 'desktop.window-chrome')
  assert.equal(resolveSuiteTarget(fixture, { packagedExecutable: '/candidate/app' }), 'fixture')
  assert.equal(resolveSuiteTarget(source, { packagedExecutable: '/candidate/app' }), 'source')
  assert.equal(resolveSuiteTarget(adaptable, {}), 'source')
  assert.equal(resolveSuiteTarget(adaptable, { packagedExecutable: '/candidate/app' }), 'packaged')
})
