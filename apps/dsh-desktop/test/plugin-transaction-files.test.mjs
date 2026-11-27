import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { lstatIfPresent, syncDirectory } from '../src/plugin-transaction-files.mjs'

test('plugin transactions inspect a link without following it and distinguish absence from errors', async t => {
  const root = await fs.mkdtemp(join(tmpdir(), 'plugin-transaction-files-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const target = join(root, 'target')
  const link = join(root, 'link')
  await fs.mkdir(target)
  await fs.symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir')
  assert.equal((await lstatIfPresent(link)).isSymbolicLink(), true)
  assert.equal(await lstatIfPresent(join(root, 'missing')), undefined)
  await assert.rejects(lstatIfPresent(null), { code: 'ERR_INVALID_ARG_TYPE' })
})

test('directory flush tolerates unsupported operations, closes handles and surfaces I/O failures', async t => {
  const open = t.mock.method(fs, 'open')
  const operations = []
  open.mock.mockImplementation(async () => ({
    sync: async () => { operations.push('sync') },
    close: async () => { operations.push('close') },
  }))
  await syncDirectory('parent')
  assert.deepEqual(operations, ['sync', 'close'])

  for (const phase of ['open', 'sync']) {
    for (const code of ['EINVAL', 'EPERM', 'EISDIR', 'UNKNOWN', 'EIO', 'ENOENT', 'EACCES']) {
      const error = Object.assign(new Error(code), { code })
      const close = t.mock.fn(async () => { throw new Error('close failure') })
      open.mock.mockImplementation(async (path, flag) => {
        assert.equal(path, 'parent')
        assert.equal(flag, 'r')
        if (phase === 'open') throw error
        return { sync: async () => { throw error }, close }
      })
      const result = syncDirectory('parent')
      if (['EIO', 'ENOENT', 'EACCES'].includes(code)) await assert.rejects(result, failure => failure === error)
      else await result
      assert.equal(close.mock.callCount(), phase === 'sync' ? 1 : 0)
    }
  }
})
