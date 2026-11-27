import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { readFileIfPresent } from '../src/read-file-if-present.mjs'

test('optional reads distinguish missing, empty, binary and unreadable state', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'optional-file-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const path = join(directory, 'state')
  assert.equal(await readFileIfPresent(path), undefined)
  await writeFile(path, '')
  assert.equal(await readFileIfPresent(path, 'utf8'), '')
  const bytes = Buffer.from([0, 255, 128])
  await writeFile(path, bytes)
  assert.deepEqual(await readFileIfPresent(path), bytes)
  const denied = Object.assign(new Error('unreadable'), { code: 'EACCES' })
  await assert.rejects(readFileIfPresent(path, 'utf8', async () => { throw denied }), e => e === denied)
})
