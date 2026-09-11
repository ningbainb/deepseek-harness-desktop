import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import YAML from 'yaml'

import { createPresetBuffer, readPresetFile } from '../src/presets/preset-archive.mjs'
import { PresetService } from '../src/presets/preset-service.mjs'
import { PluginManager } from '../src/extensions/plugins.mjs'
import { DESKTOP_REPAIR_BUNDLE, ensureDesktopProfile } from '../src/profile.mjs'

const packageLock = Object.freeze({
  name: '@community/review',
  version: '2.0.0',
  integrity: 'sha512-cmV2aWV3',
})

function runtimeProvider(capabilities = ['runtime.lifecycle', 'profile.paths']) {
  return {
    probe: () => ({
      capabilities: capabilities.map((id) => ({ id, status: 'available' })),
    }),
  }
}

function pluginManager(version = '1.0.0') {
  return {
    inventory: async () => [{ name: packageLock.name, version }],
    portablePackages: async () => [packageLock],
    inspect: async () => ({
      name: packageLock.name,
      version: packageLock.version,
      integrity: packageLock.integrity,
      bundle: true,
      status: 'compatible',
      compatibility: { status: 'compatible', reasons: [] },
    }),
  }
}

function archive() {
  return createPresetBuffer({
    manifest: {
      name: 'Review',
      createdAt: '2026-08-18T00:00:00.000Z',
      source: { desktopVersion: '2.5.0', runtimeVersion: '0.1.0-rc.6' },
      requiredCapabilities: ['runtime.lifecycle', 'profile.paths'],
      requiredSecrets: ['DEEPSEEK_API_KEY'],
    },
    packages: [packageLock],
    settings: { language: 'en-US' },
    taskTemplates: [{ id: 'new', title: 'New task' }],
    skills: {
      review: {
        'SKILL.md': '---\nname: review\ndescription: Review changes\n---\n\nReview carefully.\n',
      },
    },
    readme: '# Review\n',
  })
}

test('preset preview reports trust, capabilities, required secret names, and explicit conflicts', async () => {
  const dshHome = await mkdtemp(join(tmpdir(), 'dsh-preset-preview-'))
  try {
    await mkdir(join(dshHome, 'skills', 'review'), { recursive: true })
    await writeFile(join(dshHome, 'skills', 'review', 'SKILL.md'), 'old')
    const service = new PresetService({
      dshHome,
      desktopVersion: '2.5.0',
      runtimeVersion: '0.1.0-rc.6',
      pluginManager: pluginManager(),
      runtimeProvider: runtimeProvider(),
    })
    const preview = await service.previewBuffer(archive())
    assert.equal(preview.trust.level, 'untrusted')
    assert.equal(preview.trust.integrityVerified, true)
    assert.deepEqual(preview.requiredSecrets, ['DEEPSEEK_API_KEY'])
    assert.equal(preview.packages[0].status, 'conflict')
    assert.deepEqual(preview.packages[0].review, {
      status: 'compatible', reasons: [], bundle: true, integrityVerified: true,
    })
    assert.equal(preview.skills[0].status, 'conflict')
    assert.equal(preview.capabilities.every((item) => item.available), true)
    const record = service.resolvePlan(preview.id)
    assert.throws(() => service.packageSpecs(record), /invalid preset conflict choice/u)
    assert.deepEqual(service.packageSpecs(record, { [packageLock.name]: 'preset' }), [`${packageLock.name}@2.0.0`])
    assert.deepEqual(service.packageSpecs(record, { [packageLock.name]: 'skip' }), [])
  } finally {
    await rm(dshHome, { recursive: true, force: true })
  }
})

test('preset staged settings, task templates, and skill conflicts restore exactly on rollback', async () => {
  const dshHome = await mkdtemp(join(tmpdir(), 'dsh-preset-rollback-'))
  const settingsPath = join(dshHome, 'settings.yaml')
  const templatesPath = join(dshHome, 'task-templates.json')
  const skillPath = join(dshHome, 'skills', 'review', 'SKILL.md')
  try {
    await mkdir(join(dshHome, 'skills', 'review'), { recursive: true })
    await writeFile(settingsPath, 'language: zh-CN\nlocalCredential:\n  token: keep-existing-secret\n')
    await writeFile(templatesPath, '[{"id":"old"}]\n')
    await writeFile(skillPath, 'old skill\n')
    const service = new PresetService({
      dshHome,
      desktopVersion: '2.5.0',
      runtimeVersion: '0.1.0-rc.6',
      pluginManager: pluginManager(),
      runtimeProvider: runtimeProvider(),
    })
    const preview = await service.previewBuffer(archive())
    const transaction = await service.stageConfig(service.resolvePlan(preview.id), {
      skills: { review: 'preset' },
    })
    assert.equal(await readFile(skillPath, 'utf8'), 'old skill\n', 'staging must not mutate live state')
    await transaction.apply()
    assert.deepEqual(YAML.parse(await readFile(settingsPath, 'utf8')), {
      language: 'en-US',
      localCredential: { token: 'keep-existing-secret' },
    })
    assert.deepEqual(JSON.parse(await readFile(templatesPath, 'utf8')), [{ id: 'new', title: 'New task' }])
    assert.match(await readFile(skillPath, 'utf8'), /Review carefully/u)
    assert.equal(await transaction.rollback(), true)
    assert.equal(await readFile(settingsPath, 'utf8'), 'language: zh-CN\nlocalCredential:\n  token: keep-existing-secret\n')
    assert.equal(await readFile(templatesPath, 'utf8'), '[{"id":"old"}]\n')
    assert.equal(await readFile(skillPath, 'utf8'), 'old skill\n')
  } finally {
    await rm(dshHome, { recursive: true, force: true })
  }
})

test('preset export creates a validated archive without secret values', async () => {
  const dshHome = await mkdtemp(join(tmpdir(), 'dsh-preset-export-'))
  const output = join(dshHome, 'portable.dshpreset')
  try {
    await mkdir(join(dshHome, 'skills', 'review'), { recursive: true })
    await writeFile(join(dshHome, 'skills', 'review', 'SKILL.md'), '---\nname: review\ndescription: Review\n---\n')
    await writeFile(join(dshHome, 'settings.yaml'), 'language: zh-CN\nwindowBounds:\n  x: 4\nui:\n  apiToken: must-not-export\n')
    const service = new PresetService({
      dshHome,
      desktopVersion: '2.5.0',
      runtimeVersion: '0.1.0-rc.6',
      pluginManager: pluginManager('2.0.0'),
      runtimeProvider: runtimeProvider(),
      now: () => Date.parse('2026-08-18T00:00:00.000Z'),
    })
    const result = await service.exportFile(output, { name: 'Portable' })
    assert.equal(result.packages, 1)
    assert.equal(result.skills, 1)
    assert.deepEqual(result.skipped, [
      { kind: 'setting', key: 'windowBounds', reason: 'not-allowlisted' },
      { kind: 'setting', key: 'ui', reason: 'non-portable-or-sensitive' },
    ])
    const parsed = await readPresetFile(output)
    assert.deepEqual(parsed.manifest.requiredSecrets, [])
    assert.deepEqual(parsed.packages, [packageLock])
    assert.deepEqual(parsed.settings, { language: 'zh-CN' })
  } finally {
    await rm(dshHome, { recursive: true, force: true })
  }
})

test('real managed Desktop profile exports offline without a pnpm lockfile, including the repair component', async () => {
  const dshHome = await mkdtemp(join(tmpdir(), 'dsh-preset-managed-'))
  try {
    const { profileDir, manifest } = await ensureDesktopProfile({ dshHome })
    assert.ok(manifest.dependencies[DESKTOP_REPAIR_BUNDLE], 'exercise the bundled repair component')
    await assert.rejects(readFile(join(profileDir, 'pnpm-lock.yaml')), { code: 'ENOENT' })
    const originalManifest = await readFile(join(profileDir, 'package.json'))
    await writeFile(join(dshHome, 'settings.yaml'), 'language: zh-CN\nui:\n  apiToken: must-not-export\n')
    const manager = new PluginManager({
      profileDir,
      runner: assert.fail,
      registry: { fetchManifest: assert.fail },
    })
    const service = new PresetService({
      dshHome, desktopVersion: '3.5.0', runtimeVersion: '0.1.5-rc.1',
      pluginManager: manager, runtimeProvider: runtimeProvider(),
    })
    const output = join(dshHome, '导出目录', '当前环境.dshpreset')
    const result = await service.exportFile(output)
    const parsed = await readPresetFile(output)
    assert.equal(result.packages, 0, 'bundled components are supplied by Desktop, not community packages')
    assert.deepEqual(parsed.packages, [])
    assert.deepEqual(parsed.settings, { language: 'zh-CN' })
    assert.deepEqual(await readFile(join(profileDir, 'package.json')), originalManifest)
    await assert.rejects(readFile(join(profileDir, 'pnpm-lock.yaml')), { code: 'ENOENT' })
    await assert.rejects(readFile(join(profileDir, 'desktop-plugins.lock.json')), { code: 'ENOENT' })
    const preview = await service.previewFile(output)
    assert.equal(preview.trust.integrityVerified, true)
    assert.deepEqual(preview.packages, [])
    assert.deepEqual(preview.settings, ['language'])
  } finally {
    await rm(dshHome, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})

test('real community plugin export retains exact lock integrity and preserves the old output on failure', async () => {
  const dshHome = await mkdtemp(join(tmpdir(), 'dsh-preset-community-'))
  try {
    const profileDir = join(dshHome, 'profiles', 'desktop')
    const packageDir = join(profileDir, 'node_modules', '@community', 'review')
    await mkdir(packageDir, { recursive: true })
    await writeFile(join(profileDir, 'package.json'), JSON.stringify({ dependencies: { [packageLock.name]: '^2.0.0' } }))
    await writeFile(join(packageDir, 'package.json'), JSON.stringify({ name: packageLock.name, version: packageLock.version }))
    const manager = new PluginManager({ profileDir, runner: assert.fail, registry: { fetchManifest: assert.fail } })
    const service = new PresetService({
      dshHome, desktopVersion: '3.5.0', runtimeVersion: '0.1.5-rc.1',
      pluginManager: manager, runtimeProvider: runtimeProvider(),
    })
    const output = join(dshHome, 'existing.dshpreset')
    await writeFile(output, 'previous export')
    await assert.rejects(service.exportFile(output), /lockfile is required/u)
    assert.equal(await readFile(output, 'utf8'), 'previous export')
    const lockPath = join(profileDir, 'pnpm-lock.yaml')
    await writeFile(lockPath, YAML.stringify({ packages: {
      [`${packageLock.name}@1.0.0`]: { resolution: { integrity: packageLock.integrity } },
    } }))
    await assert.rejects(service.exportFile(output), /integrity is unavailable/u)
    assert.equal(await readFile(output, 'utf8'), 'previous export')
    await writeFile(lockPath, 'packages: [invalid')
    await assert.rejects(service.exportFile(output), /lockfile is invalid/u)
    assert.equal(await readFile(output, 'utf8'), 'previous export')
    const lock = YAML.stringify({ packages: {
      [`${packageLock.name}@${packageLock.version}(peer@1.0.0)`]: { resolution: { integrity: packageLock.integrity } },
    } })
    await writeFile(lockPath, lock)
    const exported = await service.exportFile(output)
    assert.equal(exported.packages, 1)
    assert.deepEqual((await readPresetFile(output)).packages, [packageLock])
    assert.equal(await readFile(lockPath, 'utf8'), lock, 'export never repairs or regenerates package locks')
  } finally {
    await rm(dshHome, { recursive: true, force: true })
  }
})

test('preset prepared package verification binds registry integrity, bundle identity, and compatibility to the reviewed lock', async () => {
  const dshHome = await mkdtemp(join(tmpdir(), 'dsh-preset-prepared-'))
  try {
    const service = new PresetService({
      dshHome,
      desktopVersion: '2.5.0',
      runtimeVersion: '0.1.0-rc.6',
      pluginManager: pluginManager(),
      runtimeProvider: runtimeProvider(),
    })
    const plan = await service.previewBuffer(archive())
    const record = service.resolvePlan(plan.id)
    const prepared = {
      items: [{
        ...packageLock,
        spec: `${packageLock.name}@${packageLock.version}`,
        manifest: { dsh: { bundle: { patch: './cordis.patch.yml' } } },
        compatibility: { status: 'compatible', reasons: [] },
      }],
    }
    assert.equal(service.verifyPreparedPackages(record, prepared), true)
    assert.throws(
      () => service.verifyPreparedPackages(record, { items: [{ ...prepared.items[0], integrity: 'sha512-d3Jvbmc=' }] }),
      /does not match.*Preset lock/u,
    )
  } finally {
    await rm(dshHome, { recursive: true, force: true })
  }
})

test('preset import refuses a preview whose required runtime capability is unavailable', async () => {
  const dshHome = await mkdtemp(join(tmpdir(), 'dsh-preset-capability-'))
  try {
    const service = new PresetService({
      dshHome,
      desktopVersion: '2.5.0',
      runtimeVersion: '0.1.0-rc.6',
      pluginManager: pluginManager('2.0.0'),
      runtimeProvider: runtimeProvider(['runtime.lifecycle']),
    })
    const preview = await service.previewBuffer(archive())
    assert.equal(preview.capabilities.find((item) => item.id === 'profile.paths').available, false)
    assert.throws(() => service.resolvePlan(preview.id), /capabilities.*unavailable/u)
  } finally {
    await rm(dshHome, { recursive: true, force: true })
  }
})
