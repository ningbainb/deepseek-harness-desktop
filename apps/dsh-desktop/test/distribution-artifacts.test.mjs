import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { stringify } from 'yaml'
import { verifyDistributionArtifacts } from '../scripts/verify-distribution-artifacts.mjs'

const version = '5.3.0-rc.1'
const digest = (bytes, algorithm = 'sha512', encoding = 'base64') => createHash(algorithm).update(bytes).digest(encoding)

async function fixture(t, platform) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-distribution-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const names = platform === 'linux'
    ? [`DeepSeek-Harness-Desktop-${version}-amd64.deb`]
    : [`DeepSeek-Harness-Desktop-${version}-arm64.dmg`, `DeepSeek-Harness-Desktop-${version}-arm64.zip`]
  const payloads = names.map(name => Buffer.from(`fixture ${name}`))
  for (const [index, name] of names.entries()) await writeFile(join(directory, name), payloads[index])
  const metadata = { version, files: names.map((url, index) => ({ url, size: payloads[index].length, sha512: digest(payloads[index]) })) }
  const update = platform === 'linux' ? names[0] : names[1]
  metadata.path = update
  metadata.sha512 = digest(payloads[names.indexOf(update)])
  const metadataFile = join(directory, `beta-${platform === 'linux' ? 'linux' : 'mac'}.yml`)
  await writeFile(metadataFile, stringify(metadata))
  if (platform === 'linux') {
    await mkdir(join(directory, 'linux-unpacked', 'resources'), { recursive: true })
    await writeFile(join(directory, 'linux-unpacked', 'resources', 'package-type'), 'deb')
  }
  return { directory, names, payloads, metadata, metadataFile, platform, version, channel: 'beta' }
}

test('Linux distribution has exactly one user deb and matching updater selection and bytes', async t => {
  const state = await fixture(t, 'linux')
  const result = await verifyDistributionArtifacts(state)
  assert.equal(result.platform, 'linux')
  assert.deepEqual(result.files.map(row => [row.file, row.role]), [[state.names[0], 'user-installer']])
  assert.equal(result.files[0].sha256, digest(state.payloads[0], 'sha256', 'hex'))
  assert.equal(result.updaterFile, state.names[0])
})

test('macOS exposes only DMG as installer while the verified ZIP is an internal updater payload', async t => {
  const state = await fixture(t, 'darwin')
  const result = await verifyDistributionArtifacts(state)
  assert.deepEqual(result.files.map(row => [row.file, row.role]), [[state.names[0], 'user-installer'], [state.names[1], 'internal-updater']])
  assert.equal(result.updaterFile, state.names[1])
})

for (const mutation of ['duplicate-user-installer', 'wrong-package-type', 'wrong-version', 'wrong-hash', 'duplicate-metadata', 'wrong-update-path']) {
  test(`distribution verification rejects ${mutation}`, async t => {
    const state = await fixture(t, 'linux')
    if (mutation === 'duplicate-user-installer') await writeFile(join(state.directory, `DeepSeek-Harness-Desktop-${version}-x86_64.AppImage`), 'obsolete archive')
    if (mutation === 'wrong-package-type') await writeFile(join(state.directory, 'linux-unpacked', 'resources', 'package-type'), 'AppImage')
    if (mutation === 'wrong-version') state.metadata.version = '5.2.0'
    if (mutation === 'wrong-hash') await writeFile(join(state.directory, state.names[0]), 'tampered')
    if (mutation === 'duplicate-metadata') state.metadata.files.push(state.metadata.files[0])
    if (mutation === 'wrong-update-path') state.metadata.path = 'other.deb'
    await writeFile(state.metadataFile, stringify(state.metadata))
    await assert.rejects(verifyDistributionArtifacts(state), /installer|package-type|version|checksum|size|duplicate|update path/u)
  })
}

test('missing macOS updater ZIP does not pass as a complete single-installer distribution', async t => {
  const state = await fixture(t, 'darwin')
  await rm(join(state.directory, state.names[1]))
  await assert.rejects(verifyDistributionArtifacts(state), /missing|ENOENT|archive/u)
})
