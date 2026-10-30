import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
test('installer reuse invalidates only its exact generated NSIS cache, preserving unrelated archives', async t => {
  const { invalidateNsisArchiveCache } = await import('../scripts/nsis-archive-cache.mjs')
  const root = await mkdtemp(join(await realpath(tmpdir()), 'dsh-nsis-cache-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const cache = join(root, '@linxin666dsh-desktop-5.2.0-x64.nsis.7z')
  await writeFile(cache, 'interrupted-archive')
  await writeFile(join(root, 'user-backup.7z'), 'retain')
  assert.equal(await invalidateNsisArchiveCache(root, '5.2.0'), true)
  assert.equal(await access(cache).then(() => true, () => false), false)
  assert.equal(await readFile(join(root, 'user-backup.7z'), 'utf8'), 'retain')
  assert.equal(await invalidateNsisArchiveCache(root, '5.2.0'), false)
})
test('NSIS cache invalidation refuses linked paths and malformed versions', async t => {
  const { invalidateNsisArchiveCache } = await import('../scripts/nsis-archive-cache.mjs')
  const root = await mkdtemp(join(await realpath(tmpdir()), 'dsh-nsis-cache-link-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'real'))
  await symlink(join(root, 'real'), join(root, 'linked'), 'junction')
  await assert.rejects(invalidateNsisArchiveCache(join(root, 'linked'), '5.2.0'), /link/iu)
  await assert.rejects(invalidateNsisArchiveCache(root, '../5.2.0'), /version/iu)
})
