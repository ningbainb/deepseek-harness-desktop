import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { writePrivateJson } from '../src/atomic-write-adapter.mjs'

test('private JSON replacements keep complete formatted documents and clean up failed writes', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'desktop-private-json-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const parent = join(directory, 'state')
  const path = join(parent, 'value.json')
  await writePrivateJson(path, { value: 0 })
  assert.equal(await readFile(path, 'utf8'), '{\n  "value": 0\n}\n')
  const writes = Array.from({ length: 12 }, (_, i) => ({ value: i + 1 }))
  await Promise.all(writes.map(value => writePrivateJson(path, value)))
  const finalDocument = await readFile(path, 'utf8')
  assert.ok(writes.some(value => JSON.stringify(value, null, 2) + '\n' === finalDocument))
  if (process.platform !== 'win32') {
    assert.equal((await stat(path)).mode & 0o077, 0)
    assert.equal((await stat(parent)).mode & 0o077, 0)
  }
  const occupied = join(parent, 'occupied')
  await mkdir(occupied)
  await writeFile(join(occupied, 'existing'), 'retained')
  await assert.rejects(writePrivateJson(occupied, { value: 99 }))
  assert.equal(await readFile(join(occupied, 'existing'), 'utf8'), 'retained')
  assert.deepEqual((await readdir(parent)).sort(), ['occupied', 'value.json'])
})
