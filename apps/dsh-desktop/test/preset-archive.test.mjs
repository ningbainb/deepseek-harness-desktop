import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

import {
  createPresetBuffer,
  inspectPresetZip,
  readPresetBuffer,
  selectPortableSettings,
} from '../src/presets/preset-archive.mjs'

const manifest = Object.freeze({
  name: 'Review environment',
  description: 'A portable, secret-free Desktop setup.',
  createdAt: '2026-08-18T00:00:00.000Z',
  source: { desktopVersion: '2.5.0', runtimeVersion: '0.1.0-rc.6' },
  requiredCapabilities: ['runtime.lifecycle'],
  requiredSecrets: ['DEEPSEEK_API_KEY'],
})
const packages = Object.freeze([Object.freeze({
  name: '@community/review',
  version: '2.0.0',
  integrity: 'sha512-cmV2aWV3',
})])

function validPreset(overrides = {}) {
  return {
    manifest,
    packages,
    settings: { language: 'zh-CN', appearance: { theme: 'dark' } },
    skills: { review: { 'SKILL.md': '# Review\n\nRead the diff carefully.\n' } },
    taskTemplates: [{ id: 'review', title: 'Review this change' }],
    readme: '# Review environment\n',
    ...overrides,
  }
}

function rewriteArchive(buffer, mutate) {
  const files = unzipSync(buffer)
  mutate(files)
  return Buffer.from(zipSync(files, { level: 9 }))
}

function firstCentralDirectoryOffset(buffer) {
  for (let offset = 0; offset <= buffer.length - 4; offset += 1) {
    if (buffer.readUInt32LE(offset) === 0x02014b50) return offset
  }
  throw new Error('central directory fixture not found')
}

test('preset v1 round-trips exact packages, allowlisted settings, skills, and trust evidence', () => {
  const buffer = createPresetBuffer(validPreset())
  const parsed = readPresetBuffer(buffer)
  assert.equal(parsed.manifest.formatVersion, 1)
  assert.equal(parsed.manifest.name, manifest.name)
  assert.deepEqual(parsed.packages, packages)
  assert.deepEqual(parsed.settings, { language: 'zh-CN', appearance: { theme: 'dark' } })
  assert.equal(parsed.skills.get('review').get('SKILL.md').toString('utf8').startsWith('# Review'), true)
  assert.deepEqual(parsed.taskTemplates, [{ id: 'review', title: 'Review this change' }])
  assert.deepEqual(parsed.trust, {
    level: 'untrusted',
    integrityVerified: true,
    executableContent: false,
    secretValues: false,
  })
})

test('preset v1 ignores additive optional manifest metadata but explains unsupported required majors', () => {
  const parsed = readPresetBuffer(createPresetBuffer(validPreset({
    manifest: {
      ...manifest,
      futureOptionalMetadata: { displayHint: 'not part of the v1 import plan' },
      source: { ...manifest.source, futureRuntimeMetadata: 'ignored' },
    },
  })))
  assert.equal(Object.hasOwn(parsed.manifest, 'futureOptionalMetadata'), false)
  assert.equal(Object.hasOwn(parsed.manifest.source, 'futureRuntimeMetadata'), false)
  const futureMajor = rewriteArchive(createPresetBuffer(validPreset()), (files) => {
    const nextManifest = { ...JSON.parse(strFromU8(files['dsh-preset.json'])), formatVersion: 2 }
    files['dsh-preset.json'] = strToU8(`${JSON.stringify(nextManifest, null, 2)}\n`)
    const integrity = JSON.parse(strFromU8(files['integrity.json']))
    integrity.files['dsh-preset.json'] = createHash('sha256').update(files['dsh-preset.json']).digest('hex')
    files['integrity.json'] = strToU8(`${JSON.stringify(integrity, null, 2)}\n`)
  })
  assert.throws(() => readPresetBuffer(futureMajor), /Upgrade DeepSeek Harness Desktop/u)
})

test('preset integrity is verified before content is returned', () => {
  const changed = rewriteArchive(createPresetBuffer(validPreset()), (files) => {
    files['settings.json'] = strToU8('{"language":"en-US"}\n')
  })
  assert.throws(() => readPresetBuffer(changed), /integrity verification failed/u)
})

test('preset rejects secret values, local paths, Git URLs, scripts, and non-exact packages', () => {
  assert.throws(
    () => createPresetBuffer(validPreset({ settings: { ui: { apiToken: 'not-portable' } } })),
    /secret field/u,
  )
  assert.throws(
    () => createPresetBuffer(validPreset({ settings: { ui: { root: 'C:\\Users\\person\\repo' } } })),
    /local path/u,
  )
  assert.throws(
    () => createPresetBuffer(validPreset({ readme: 'git+https://example.com/unsafe.git' })),
    /Git URL/u,
  )
  assert.throws(
    () => createPresetBuffer(validPreset({ skills: { review: { 'SKILL.md': '# Review', 'run.mjs': 'process.exit()' } } })),
    /executable scripts/u,
  )
  assert.throws(
    () => createPresetBuffer(validPreset({ packages: [{ ...packages[0], version: '^2.0.0' }] })),
    /exact versions/u,
  )
  assert.throws(
    () => createPresetBuffer(validPreset({ settings: { shellCommand: 'whoami' } })),
    /not allowlisted/u,
  )
  assert.throws(
    () => createPresetBuffer(validPreset({ skills: { review: { 'SKILL.md': '# Review', 'credentials.json': '{}' } } })),
    /hidden credential files/u,
  )
  assert.throws(
    () => createPresetBuffer(validPreset({ skills: { review: { 'SKILL.md': 'api_token=super-secret-value' } } })),
    /secret value/u,
  )
  assert.throws(
    () => createPresetBuffer(validPreset({ skills: { review: { 'SKILL.md': '# Review', 'config.yaml': 'apiKey: x\n' } } })),
    /secret field/u,
  )
  assert.throws(
    () => createPresetBuffer(validPreset({ skills: { review: { 'SKILL.md': '# Review', 'notes.md:stream': 'unsafe' } } })),
    /invalid path/u,
  )
})

test('portable settings selection records omitted local-only and sensitive fields', () => {
  assert.deepEqual(selectPortableSettings({
    language: 'en',
    windowBounds: { x: 10 },
    ui: { apiKey: 'secret-value' },
  }), {
    settings: { language: 'en' },
    skipped: [
      { kind: 'setting', key: 'windowBounds', reason: 'not-allowlisted' },
      { kind: 'setting', key: 'ui', reason: 'non-portable-or-sensitive' },
    ],
  })
})

test('preset ZIP inspection rejects traversal, symbolic links, and compression bombs', () => {
  const traversal = Buffer.from(zipSync({ '../outside.txt': strToU8('outside') }))
  assert.throws(() => inspectPresetZip(traversal), /traversal/u)

  const symlink = Buffer.from(createPresetBuffer(validPreset()))
  const central = firstCentralDirectoryOffset(symlink)
  symlink.writeUInt16LE(0x0314, central + 4)
  symlink.writeUInt32LE(0xa1ff0000, central + 38)
  assert.throws(() => inspectPresetZip(symlink), /symbolic link/u)

  const bomb = Buffer.from(zipSync({ 'large.txt': strToU8('x'.repeat(128 * 1024)) }, { level: 9 }))
  assert.throws(() => inspectPresetZip(bomb), /compression ratio/u)
})
