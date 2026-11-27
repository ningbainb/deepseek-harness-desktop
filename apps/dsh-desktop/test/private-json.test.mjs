import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { writeJsonAtomic, writePrivateJson } from '../src/atomic-write-adapter.mjs'

test('journal replacements retain default file and directory permissions and leave complete JSON on disk', async t => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-journal-json-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const parent = join(root, 'journal')
  const reference = join(root, 'reference')
  await mkdir(reference)
  await writeFile(join(reference, 'ordinary.json'), 'original')
  const path = join(parent, 'state.json')
  await writeJsonAtomic(path, { stage: 1 })
  await writeJsonAtomic(path, { stage: 2 })
  assert.equal(await readFile(path, 'utf8'), '{\n  "stage": 2\n}\n')
  assert.equal((await stat(path)).mode & 0o777, (await stat(join(reference, 'ordinary.json'))).mode & 0o777)
  assert.equal((await stat(parent)).mode & 0o777, (await stat(reference)).mode & 0o777)
  const occupied = join(parent, 'archive')
  await mkdir(occupied)
  await writeFile(join(occupied, 'backup'), 'retained')
  await assert.rejects(writeJsonAtomic(occupied, {}))
  assert.equal(await readFile(join(occupied, 'backup'), 'utf8'), 'retained')
  assert.deepEqual((await readdir(parent)).sort(), ['archive', 'state.json'])
})

test('private JSON replacements keep complete formatted documents and clean up failed writes', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'desktop-private-json-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const parent = join(directory, 'state')
  const path = join(parent, 'value.json')
  await writePrivateJson(path, { value: 0 })
  assert.equal(await readFile(path, 'utf8'), '{\n  "value": 0\n}\n')
  const writes = Array.from({ length: 12 }, (_, i) => ({ value: i + 1 }))
  const permitted = new Set([{ value: 0 }, ...writes].map(value => JSON.stringify(value, null, 2) + '\n'))
  // Open and close a finite series of independent readers while writers compete.
  // Windows may defer replacement while another process holds a file open.
  async function observeReplacements() {
    for (let sample = 0; sample < 24; sample += 1) {
      assert.ok(permitted.has(await readFile(path, 'utf8')), 'reader saw an incomplete or unexpected document')
    }
  }
  await Promise.all([observeReplacements(), ...writes.map(value => writePrivateJson(path, value))])
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
