import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { finalizeThreePlatformReceipts } from './finalize-three-platform-receipts.mjs'

const digest = bytes => createHash('sha256').update(bytes).digest('hex')

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-public-receipts-'))
  const files = ['DeepSeek-Harness-Desktop-Setup-5.0.0-x64.exe', 'DeepSeek-Harness-Desktop-5.0.0-arm64.dmg',
    'DeepSeek-Harness-Desktop-5.0.0-arm64.zip', 'DeepSeek-Harness-Desktop-5.0.0-x86_64.AppImage', 'DeepSeek-Harness-Desktop-5.0.0-amd64.deb']
  const contents = files.map(file => Buffer.from(file))
  const combined = files.map((file, index) => `${digest(contents[index])}  ${file}\n`).join('')
  const original = Buffer.from(combined.split('\n', 1)[0] + '\n')
  const manifest = { schemaVersion: 1, version: '5.0.0', channel: 'stable', runtime: { version: '0.2.0-rc.2' }, files: [
    { file: files[0], size: contents[0].length, sha256: digest(contents[0]), signature: { status: 'unsigned' } },
    { file: 'SHA256SUMS.txt', size: original.length, sha256: digest(original), signature: { status: 'not-applicable' } },
  ] }
  await Promise.all(files.map((file, index) => writeFile(join(directory, file), contents[index])))
  await writeFile(join(directory, 'SHA256SUMS-windows.txt'), original)
  await writeFile(join(directory, 'SHA256SUMS.txt'), combined)
  await writeFile(join(directory, 'release-manifest.json'), JSON.stringify(manifest))
  return { directory, manifest, combined, original }
}

test('public receipt reconciliation preserves installer evidence and binds the combined checksum file', async () => {
  const state = await fixture()
  try {
    const result = await finalizeThreePlatformReceipts(state.directory, '5.0.0')
    assert.deepEqual(result.files[0], state.manifest.files[0])
    assert.deepEqual(result.runtime, state.manifest.runtime)
    assert.equal(result.files[1].size, Buffer.byteLength(state.combined))
    assert.equal(result.files[1].sha256, digest(state.combined))
    assert.deepEqual(await readFile(join(state.directory, 'SHA256SUMS-windows.txt')), state.original)
  } finally {
    await rm(state.directory, { recursive: true, force: true })
  }
})

test('public receipt reconciliation rejects tampered native receipts, assets and wrong versions', async () => {
  for (const mutation of ['windows-receipt', 'linux-asset', 'extra-checksum', 'wrong-version', 'unsafe-path']) {
    const state = await fixture()
    try {
      if (mutation === 'windows-receipt') await writeFile(join(state.directory, 'SHA256SUMS-windows.txt'), 'changed')
      if (mutation === 'linux-asset') await writeFile(join(state.directory, 'DeepSeek-Harness-Desktop-5.0.0-amd64.deb'), 'changed')
      if (mutation === 'extra-checksum') await writeFile(join(state.directory, 'SHA256SUMS.txt'), state.combined + 'unexpected\n')
      if (mutation === 'unsafe-path') {
        state.manifest.files[0].file = '../outside.exe'
        await writeFile(join(state.directory, 'release-manifest.json'), JSON.stringify(state.manifest))
      }
      await assert.rejects(finalizeThreePlatformReceipts(state.directory, mutation === 'wrong-version' ? '4.4.0' : '5.0.0'))
    } finally {
      await rm(state.directory, { recursive: true, force: true })
    }
  }
})
