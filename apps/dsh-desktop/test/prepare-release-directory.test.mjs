import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { prepareReleaseDirectory } from '../scripts/prepare-release-directory.mjs'

test('release directory preparation removes generated outputs but preserves unrelated directories', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-release-directory-'))
  try {
    await Promise.all([
      writeFile(join(directory, 'DeepSeek-Harness-Desktop-Setup-3.0.0-x64.exe'), 'stale installer'),
      writeFile(join(directory, 'dsh-latest.exe'), 'custom-named stale installer'),
      writeFile(join(directory, 'DeepSeek-Harness-Desktop-Setup-3.0.0-x64.exe.blockmap'), 'stale blockmap'),
      writeFile(join(directory, 'latest.yml'), 'stale metadata'),
      writeFile(join(directory, 'SHA256SUMS.txt'), 'stale checksums'),
      writeFile(join(directory, 'release-manifest.json'), 'stale manifest'),
      writeFile(join(directory, 'keep.txt'), 'keep'),
      mkdir(join(directory, 'win-unpacked'), { recursive: true }),
      mkdir(join(directory, 'previous-artifacts'), { recursive: true }),
    ])
    await writeFile(join(directory, 'win-unpacked', 'DeepSeek Harness Desktop.exe'), 'stale unpacked app')
    await writeFile(join(directory, 'previous-artifacts', 'old.exe'), 'preserve')

    const removed = await prepareReleaseDirectory(directory)

    assert.deepEqual(removed.toSorted(), [
      'DeepSeek-Harness-Desktop-Setup-3.0.0-x64.exe',
      'DeepSeek-Harness-Desktop-Setup-3.0.0-x64.exe.blockmap',
      'SHA256SUMS.txt',
      'dsh-latest.exe',
      'latest.yml',
      'release-manifest.json',
      'win-unpacked',
    ].toSorted())
    assert.equal(await readFile(join(directory, 'keep.txt'), 'utf8'), 'keep')
    assert.equal(await readFile(join(directory, 'previous-artifacts', 'old.exe'), 'utf8'), 'preserve')
    await assert.rejects(readFile(join(directory, 'win-unpacked', 'DeepSeek Harness Desktop.exe')), { code: 'ENOENT' })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
