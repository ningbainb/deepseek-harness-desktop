import assert from 'node:assert/strict'
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { RepairTransactionManager } from '../src/repair-transaction.mjs'
import { UserPluginArchive } from '../src/user-plugin-archive.mjs'

test('repair transaction restores profile bytes, missing state, and external linked plugin bytes after a failed restart', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-repair-transaction-'))
  try {
    const profileDir = join(root, 'profile')
    const external = join(root, 'external')
    const link = join(profileDir, 'node_modules', 'linked')
    const manifestBytes = Buffer.from('{\r\n  "name": "profile",\r\n  "dependencies": {"linked": "link:../../external"}\r\n}\r\n')
    const pluginBytes = Buffer.from('export const broken = true\r\n')
    await mkdir(join(profileDir, 'node_modules'), { recursive: true })
    await mkdir(external, { recursive: true })
    await writeFile(join(profileDir, 'package.json'), manifestBytes)
    await writeFile(join(external, 'index.mjs'), pluginBytes)
    try {
      await symlink(external, link, 'junction')
    } catch (error) {
      if (['EPERM', 'EACCES', 'UNKNOWN'].includes(error?.code)) {
        context.skip('the current account cannot create a directory link')
        return
      }
      throw error
    }

    const archive = new UserPluginArchive({ profileDir, archiveDir: join(root, 'archive') })
    const manager = new RepairTransactionManager({
      archive,
      incidentDir: join(root, 'incident'),
      profileDir,
      roots: [
        { id: 'profile', kind: 'profile', path: profileDir },
        { id: 'linked', kind: 'plugin', path: link, packageName: 'linked' },
      ],
    })
    const transaction = await manager.begin({ incidentFingerprint: 'a'.repeat(64) })
    const staged = await transaction.stage()
    await writeFile(join(staged.workspace, 'profile', 'package.json'), '{"name":"profile-repaired","dependencies":{"linked":"link:../plugins/linked"}}\n')
    await writeFile(join(staged.workspace, 'plugins', 'linked', 'index.mjs'), 'export const broken = false\n')
    await writeFile(join(staged.workspace, 'plugins', 'linked', 'created.mjs'), 'candidate-only\n')

    const applied = await transaction.apply()
    assert.equal(applied.changedFiles.length, 3)
    assert.equal(await readFile(join(external, 'index.mjs'), 'utf8'), 'export const broken = false\n')
    assert.equal(await readFile(join(external, 'created.mjs'), 'utf8'), 'candidate-only\n')
    const appliedManifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
    assert.equal(appliedManifest.name, 'profile-repaired')
    assert.equal(appliedManifest.dependencies.linked, 'link:../../external')
    assert.deepEqual(
      (await archive.getState()).active.affectedExternalFiles.map((entry) => entry.relativePath),
      ['created.mjs', 'index.mjs'],
    )

    await transaction.rollback()
    assert.deepEqual(await readFile(join(profileDir, 'package.json')), manifestBytes)
    assert.deepEqual(await readFile(join(external, 'index.mjs')), pluginBytes)
    await assert.rejects(readFile(join(external, 'created.mjs')), { code: 'ENOENT' })
    assert.equal((await lstat(link)).isSymbolicLink(), true)
    assert.equal((await archive.getState()).active, undefined)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
