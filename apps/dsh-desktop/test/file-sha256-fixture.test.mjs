import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileSha256 } from '../scripts/file-sha256-fixture.mjs'

test('acceptance evidence hashes the entire file, including empty and multi-chunk binary files', async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-fixture-digest-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const file = join(root, 'payload')
  await assert.rejects(fileSha256(file), { code: 'ENOENT' })
  await writeFile(file, '')
  assert.equal(await fileSha256(file), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  const binary = Buffer.alloc(200_000)
  for (let i = 0; i < binary.length; i++) binary[i] = i % 256
  await writeFile(file, binary)
  assert.equal(await fileSha256(file), 'c7a7d73b68d21102bf7d6d9be27b4106497efc8119224bebfbd26b375541bde7')
})
