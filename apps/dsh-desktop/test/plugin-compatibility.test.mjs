import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assessPluginCompatibility,
  createHostCompatibility,
  createHostCompatibilityProvider,
} from '../src/extensions/plugin-compatibility.mjs'

const host = createHostCompatibility({
  desktopVersion: '0.1.9',
  nodeVersion: '24.11.1',
  runtimeVersion: '0.1.0-rc.6',
  packages: {
    '@deepseek-ai/cordis': '4.0.1',
    '@deepseek-ai/dsh-agent': '0.1.0-rc.6',
    react: '18.3.1',
  },
})

function bundle(extra = {}) {
  return {
    name: '@community/example',
    version: '1.2.3',
    dsh: { bundle: { patch: './cordis.patch.yml' } },
    ...extra,
  }
}

test('compatibility rejects packages that are not DSH bundles', () => {
  const result = assessPluginCompatibility({ name: 'plain', version: '1.0.0' }, host)
  assert.equal(result.status, 'incompatible')
  assert.deepEqual(result.reasons.map((reason) => reason.code), ['not-dsh-bundle'])
})

test('explicit desktop and prerelease runtime ranges produce a compatible result', () => {
  const result = assessPluginCompatibility(bundle({
    dsh: {
      bundle: { patch: './cordis.patch.yml' },
      compatibility: {
        desktop: '>=0.1.9 <0.2.0',
        runtime: '>=0.1.0-rc.6 <0.2.0',
      },
    },
  }), host)
  assert.equal(result.status, 'compatible')
  assert.deepEqual(result.reasons, [])
})

test('explicit desktop mismatch is incompatible and bounded', () => {
  const result = assessPluginCompatibility(bundle({
    dsh: {
      bundle: { patch: './cordis.patch.yml' },
      compatibility: { desktop: '>=0.2.0' },
    },
  }), host)
  assert.equal(result.status, 'incompatible')
  assert.deepEqual(result.reasons, [{
    code: 'desktop-range',
    subject: 'desktop',
    required: '>=0.2.0',
    actual: '0.1.9',
  }])
})

test('Node engine and required peer conflicts are incompatible', () => {
  const result = assessPluginCompatibility(bundle({
    engines: { node: '>=25' },
    peerDependencies: {
      '@deepseek-ai/cordis': '^5.0.0',
      '@deepseek-ai/dsh-missing': '^0.1.0',
    },
  }), host)
  assert.equal(result.status, 'incompatible')
  assert.deepEqual(result.reasons.map((reason) => reason.code), [
    'node-range',
    'peer-range',
    'peer-missing',
  ])
})

test('optional missing peers are ignored and a satisfied DSH peer proves compatibility', () => {
  const result = assessPluginCompatibility(bundle({
    peerDependencies: {
      '@deepseek-ai/cordis': '^4.0.1',
      '@community/optional-host': '^1.0.0',
    },
    peerDependenciesMeta: {
      '@community/optional-host': { optional: true },
    },
  }), host)
  assert.equal(result.status, 'compatible')
  assert.deepEqual(result.reasons, [])
})

test('a valid bundle without a DSH or desktop constraint remains unknown', () => {
  const result = assessPluginCompatibility(bundle({
    engines: { node: '>=22' },
    peerDependencies: { react: '^18.0.0' },
  }), host)
  assert.equal(result.status, 'unknown')
  assert.deepEqual(result.reasons, [{ code: 'compatibility-undeclared' }])
})

test('malformed publisher ranges fail closed instead of becoming unknown', () => {
  const result = assessPluginCompatibility(bundle({
    dsh: {
      bundle: { patch: './cordis.patch.yml' },
      compatibility: { runtime: 'definitely-not-semver' },
    },
  }), host)
  assert.equal(result.status, 'incompatible')
  assert.equal(result.reasons[0].code, 'invalid-range')
  assert.equal(result.reasons[0].subject, 'runtime')
})

test('host snapshots reject invalid versions and freeze public package versions', () => {
  assert.throws(() => createHostCompatibility({
    desktopVersion: 'latest',
    nodeVersion: '24.0.0',
    runtimeVersion: '0.1.0',
    packages: {},
  }), /desktop version/u)
  assert.equal(Object.isFrozen(host), true)
  assert.equal(Object.isFrozen(host.packages), true)
})

test('host providers resolve only candidate peers and cache actual package versions', () => {
  const calls = []
  const provider = createHostCompatibilityProvider({
    desktopVersion: '0.1.9',
    nodeVersion: '24.11.1',
    runtimeVersion: '0.1.0-rc.6',
    resolvePackageVersion: (name) => {
      calls.push(name)
      return name === '@deepseek-ai/cordis' ? '4.0.1' : undefined
    },
  })
  const manifest = bundle({
    peerDependencies: {
      '@deepseek-ai/cordis': '^4.0.1',
      '@deepseek-ai/missing': '^0.1.0',
    },
  })
  const first = provider(manifest)
  const second = provider(manifest)
  assert.equal(first.packages['@deepseek-ai/cordis'], '4.0.1')
  assert.equal(first.packages['@deepseek-ai/missing'], undefined)
  assert.deepEqual(calls, ['@deepseek-ai/cordis', '@deepseek-ai/missing'])
  assert.notEqual(first, second)
})
