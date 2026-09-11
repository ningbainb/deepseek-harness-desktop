import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  assessPluginCompatibility,
  createHostCompatibility,
  createHostCompatibilityProvider,
  resolveHostPackageVersion,
  resolvePluginPackageVersion,
  resolveProfilePackageVersion,
} from '../src/extensions/plugin-compatibility.mjs'
import { COMMUNITY_PLUGIN_KNOWN_ISSUES } from '../src/extensions/plugin-known-issues.mjs'

const host = createHostCompatibility({
  desktopVersion: '0.1.9',
  nodeVersion: '24.11.1',
  runtimeVersion: '0.1.0-rc.7',
  packages: {
    '@deepseek-ai/cordis': '4.0.1',
    '@deepseek-ai/dsh-agent': '0.1.0-rc.7',
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

test('Host, Profile, and plugin package version resolvers have separate authorities', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-package-authority-'))
  try {
    const appRoot = join(root, 'application')
    const profileDir = join(root, 'profile')
    const hostRoot = join(appRoot, 'node_modules', 'authority-test')
    const profileRoot = join(profileDir, 'node_modules', 'authority-test')
    const pluginRoot = join(root, 'candidate')
    await Promise.all([hostRoot, profileRoot, pluginRoot].map(path => mkdir(path, { recursive: true })))
    await Promise.all([
      writeFile(join(appRoot, 'package.json'), JSON.stringify({ name: 'app', version: '1.0.0' })),
      writeFile(join(hostRoot, 'package.json'), JSON.stringify({ name: 'authority-test', version: '1.0.0' })),
      writeFile(join(profileRoot, 'package.json'), JSON.stringify({ name: 'authority-test', version: '9.0.0' })),
      writeFile(join(pluginRoot, 'package.json'), JSON.stringify({ name: 'authority-test', version: '2.0.0' })),
    ])
    assert.equal(resolveHostPackageVersion('authority-test', { anchors: [join(appRoot, 'package.json')] }), '1.0.0')
    assert.equal(resolveProfilePackageVersion('authority-test', { profileDir }), '9.0.0')
    assert.equal(resolvePluginPackageVersion('authority-test', { pluginRoot }), '2.0.0')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

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
        runtime: '>=0.1.0-rc.7 <0.2.0',
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
  assert.equal(Object.hasOwn(result, 'enabled'), false)
  assert.equal(Object.hasOwn(result, 'action'), false)
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
    runtimeVersion: '0.1.0-rc.7',
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

test('Desktop API, capability, surface, and tested-runtime metadata are assessed independently of plugin identity', () => {
  const desktopHost = createHostCompatibility({
    desktopVersion: '2.7.0',
    desktopApiVersion: '1.2.0',
    nodeVersion: '24.19.0',
    runtimeVersion: '0.1.0-rc.7',
    capabilities: ['notifications.show', 'workspace-files.open'],
    surfaces: ['main', 'extensions'],
    runtimeEvidence: { providerId: 'dsh-cli-provider-v1', runtime: '0.1.0-rc.7' },
    packages: {},
  })
  const result = assessPluginCompatibility(bundle({
    dsh: {
      bundle: { patch: './cordis.patch.yml' },
      compatibility: {
        desktop: { range: '^2.7.0', api: '^1.2.0' },
        runtime: {
          range: '^0.1.0-rc.7',
          evidence: { providerId: 'dsh-cli-provider-v1', runtime: '0.1.0-rc.7', desktop: '2.7.0', verifiedAt: '2026-08-20' },
        },
        capabilities: ['notifications.show'],
        surfaces: ['main'],
      },
    },
  }), desktopHost)
  assert.equal(result.status, 'compatible')
  assert.deepEqual(result.details.requirements, {
    desktop: '^2.7.0',
    runtime: '^0.1.0-rc.7',
    desktopApi: '^1.2.0',
    capabilities: ['notifications.show'],
    surfaces: ['main'],
  })
  assert.deepEqual(result.details.tested, {
    providerId: 'dsh-cli-provider-v1', runtime: '0.1.0-rc.7', desktop: '2.7.0', verifiedAt: '2026-08-20',
  })
})

test('missing declared Desktop capabilities and surfaces fail closed while undeclared plugins remain unknown', () => {
  const desktopHost = createHostCompatibility({
    desktopVersion: '2.7.0',
    desktopApiVersion: '1.2.0',
    nodeVersion: '24.19.0',
    runtimeVersion: '0.1.0-rc.7',
    capabilities: ['notifications.show'],
    surfaces: ['main'],
    packages: {},
  })
  const result = assessPluginCompatibility(bundle({
    dsh: {
      bundle: { patch: './cordis.patch.yml' },
      compatibility: { capabilities: ['workspace-files.open'], surfaces: ['extensions'] },
    },
  }), desktopHost)
  assert.equal(result.status, 'incompatible')
  assert.deepEqual(result.reasons, [
    { code: 'capability-missing', subject: 'workspace-files.open' },
    { code: 'surface-unsupported', subject: 'extensions' },
  ])
})

test('the reproduced dsh-paperclip tuple reports a bounded native image-drop conflict', () => {
  const issue = COMMUNITY_PLUGIN_KNOWN_ISSUES[0]
  assert.equal(issue.id, 'dsh-paperclip-0.2.5-native-image-drop')
  assert.equal(issue.package.integrity, 'sha512-3do+7wwMCzd4fEzxIdC/b52MhWENOJRehgHhGD7VUfgHuNUm8AW2LjZ1I8iLzLG7vjl/7276Xc3RwcPcg9oalA==')
  assert.equal(issue.disposition.startupAction, 'inspect-only')

  const paperclip = {
    name: 'dsh-paperclip',
    version: '0.2.5',
    dsh: { bundle: { patch: './cordis.patch.yml' } },
    peerDependencies: {
      '@deepseek-ai/cordis': '^4.0.1',
      '@deepseek-ai/dsh-client-runtime': '^0.1.0-rc.6',
      '@deepseek-ai/dsh-client-ui-conversation': '^0.1.0-rc.6',
      react: '^18.2.0',
    },
  }
  const exactHost = createHostCompatibility({
    desktopVersion: '3.3.0',
    nodeVersion: '24.18.1',
    runtimeVersion: '0.1.1-rc.1',
    packages: {
      '@deepseek-ai/cordis': '4.0.1',
      '@deepseek-ai/dsh-client-runtime': '0.1.1-rc.1',
      '@deepseek-ai/dsh-client-ui-conversation': '0.1.1-rc.1',
      react: '18.3.1',
    },
  })
  const result = assessPluginCompatibility(paperclip, exactHost)
  assert.equal(result.status, 'incompatible')
  assert.deepEqual(result.reasons, [{
    code: 'known-native-image-drop-conflict',
    subject: 'dsh-paperclip@0.2.5',
    actual: 'conversation.native-image-preview',
  }])
  assert.deepEqual(result.details.tested, {
    desktop: '3.3.0',
    runtime: '0.1.1-rc.1',
    verifiedAt: '2026-09-08',
    matrixArtifact: 'runtime-support/community-plugin-known-issues.json',
  })

  assert.equal(assessPluginCompatibility({ ...paperclip, version: '0.2.6' }, exactHost).status, 'compatible')
  assert.equal(assessPluginCompatibility(paperclip, createHostCompatibility({
    ...exactHost,
    desktopVersion: '3.3.1',
  })).status, 'compatible')
})
