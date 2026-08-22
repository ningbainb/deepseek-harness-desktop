import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  USER_PLUGIN_ARCHIVE_PROFILE_ARTIFACTS,
  UserPluginArchive,
  inventoryUserPluginTree,
} from '../src/user-plugin-archive.mjs'

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

async function exists(path) {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function createProfileFixture(root) {
  const profileDir = join(root, 'profile')
  const nodeModules = join(profileDir, 'node_modules')
  const pluginRoot = join(nodeModules, '@community', 'hand-edited-plugin')
  const hiddenPackageRoot = join(nodeModules, 'not-in-manifest')
  const raw = new Map([
    ['package.json', Buffer.from('{\r\n  "name": "my hand-edited profile",\r\n  "scripts": {"repair": "node index.mjs"},\r\n  "pnpm": {"overrides": {"left-pad": "1.3.0"}},\r\n  "packageManager": "pnpm@11.22.0",\r\n  "dsh": {"custom": {"keep": true}}\r\n}\r\n')],
    ['pnpm-lock.yaml', Buffer.from('lockfileVersion: 9.0\r\nsettings:\r\n  autoInstallPeers: false\r\n')],
    ['cordis.patch.yml', Buffer.from('# User text is intentionally raw.\r\n- id: hand-edited-loader\r\n  config: { source: ../outside-project }\r\n')],
    ['.dsh-desktop-links.json', Buffer.from('{\n  "@community/hand-edited-plugin": "link:../outside-project"\n}\n')],
    ['cordis.yml', Buffer.from('plugins:\n  - hand-edited-loader\n')],
    ['cordis.yaml', Buffer.from('profile: desktop\n')],
    ['pnpm-workspace.yaml', Buffer.from('packages:\n  - ../outside-project\n')],
    ['pnpm-workspace.yml', Buffer.from('catalog:\n  hand-edited: workspace:*\n')],
    ['.npmrc', Buffer.from('strict-peer-dependencies=false\n')],
  ])
  const pluginSource = Buffer.from('export const handEdited = "original"\r\n// user modified this file\r\n\0', 'utf8')
  const hiddenBytes = Buffer.from([0, 1, 2, 3, 255, 7, 9])

  await mkdir(pluginRoot, { recursive: true })
  await mkdir(hiddenPackageRoot, { recursive: true })
  await Promise.all([...raw].map(([relativePath, bytes]) => writeFile(join(profileDir, relativePath), bytes)))
  await writeFile(join(pluginRoot, 'package.json'), '{"name":"@community/hand-edited-plugin"}\n')
  await writeFile(join(pluginRoot, 'index.mjs'), pluginSource)
  await writeFile(join(hiddenPackageRoot, 'opaque.bin'), hiddenBytes)

  return {
    profileDir,
    nodeModules,
    pluginSource,
    hiddenBytes,
    raw,
    pluginFile: join(pluginRoot, 'index.mjs'),
    hiddenFile: join(hiddenPackageRoot, 'opaque.bin'),
  }
}

test('archives raw profile artifacts and hand-edited node_modules bytes, then rolls back exactly', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-user-plugin-archive-'))
  try {
    const fixture = await createProfileFixture(root)
    const archive = new UserPluginArchive({ profileDir: fixture.profileDir })
    const transaction = await archive.begin({ operation: 'test-profile-mutation' })

    assert.equal(await exists(fixture.nodeModules), false, 'same-volume archive moves the full node_modules tree')
    const snapshot = await archive.inspect(transaction.snapshotId)
    assert.equal(snapshot.nodeModules.present, true)
    assert.equal(snapshot.nodeModules.storage, 'moved')
    assert.equal(snapshot.nodeModules.inventory.fileCount >= 3, true)

    const archivedArtifacts = new Map(snapshot.profileArtifacts.map((entry) => [entry.relativePath, entry]))
    for (const artifact of USER_PLUGIN_ARCHIVE_PROFILE_ARTIFACTS) {
      const entry = archivedArtifacts.get(artifact.relativePath)
      assert.equal(entry?.kind, 'file', `${artifact.relativePath} is retained as raw bytes`)
      assert.equal(entry.sha256, sha256(fixture.raw.get(artifact.relativePath)))
    }
    const archivedPlugin = snapshot.nodeModules.inventory.entries.find((entry) => (
      entry.path === '@community/hand-edited-plugin/index.mjs'
    ))
    assert.deepEqual(archivedPlugin, {
      kind: 'file',
      path: '@community/hand-edited-plugin/index.mjs',
      mode: archivedPlugin.mode,
      sha256: sha256(fixture.pluginSource),
      size: fixture.pluginSource.length,
    })

    await mkdir(join(fixture.nodeModules, '@community', 'hand-edited-plugin'), { recursive: true })
    await writeFile(fixture.pluginFile, Buffer.from('export const handEdited = "mutated"\n'))
    await writeFile(join(fixture.nodeModules, 'new-package.js'), Buffer.from('temporary generated package'))
    for (const [relativePath] of fixture.raw) {
      await writeFile(join(fixture.profileDir, relativePath), Buffer.from(`mutated ${relativePath}\n`))
    }

    assert.equal((await transaction.markApplied()).phase, 'applied')
    assert.equal((await transaction.rollback()).phase, 'rolled-back')

    for (const [relativePath, expected] of fixture.raw) {
      assert.deepEqual(await readFile(join(fixture.profileDir, relativePath)), expected, `${relativePath} restores byte-for-byte`)
    }
    assert.deepEqual(await readFile(fixture.pluginFile), fixture.pluginSource, 'hand-edited plugin source restores byte-for-byte')
    assert.deepEqual(await readFile(fixture.hiddenFile), fixture.hiddenBytes, 'manifest-external package bytes restore byte-for-byte')
    assert.equal(await exists(join(fixture.nodeModules, 'new-package.js')), false)
    assert.deepEqual(
      await readFile(join(archive.archiveDir, 'snapshots', transaction.snapshotId, 'node_modules', '@community', 'hand-edited-plugin', 'index.mjs')),
      fixture.pluginSource,
      'rollback copies from, rather than consumes, the retained archive',
    )
    assert.deepEqual(await archive.listSnapshots(), [{
      snapshotId: transaction.snapshotId,
      createdAt: snapshot.createdAt,
      nodeModulesPresent: true,
      profileArtifactCount: USER_PLUGIN_ARCHIVE_PROFILE_ARTIFACTS.length,
    }])
    assert.equal((await archive.getState()).active, undefined)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('safe copy transfer retains a fallback archive and can roll back modified plugin bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-user-plugin-archive-copy-'))
  try {
    const fixture = await createProfileFixture(root)
    const archive = new UserPluginArchive({
      profileDir: fixture.profileDir,
      archiveDir: join(root, 'separate-archive-root'),
    })
    const transaction = await archive.begin({
      operation: 'copy-fallback',
      nodeModulesTransfer: 'copy',
    })

    assert.equal(await exists(fixture.nodeModules), true, 'copy fallback leaves the current tree in place until mutation')
    assert.equal((await archive.inspect(transaction.snapshotId)).nodeModules.storage, 'copied')
    await writeFile(fixture.pluginFile, Buffer.from('export const handEdited = "changed after copy"\n'))
    await transaction.markApplied()
    await transaction.rollback()

    assert.deepEqual(await readFile(fixture.pluginFile), fixture.pluginSource)
    assert.deepEqual(
      await readFile(join(archive.archiveDir, 'snapshots', transaction.snapshotId, 'node_modules', '@community', 'hand-edited-plugin', 'index.mjs')),
      fixture.pluginSource,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('recover uses the durable archived journal after an interrupted profile mutation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-user-plugin-archive-recover-'))
  try {
    const fixture = await createProfileFixture(root)
    const archive = new UserPluginArchive({ profileDir: fixture.profileDir })
    const transaction = await archive.begin({ operation: 'interrupted-mutation' })
    await mkdir(join(fixture.nodeModules, '@community', 'hand-edited-plugin'), { recursive: true })
    await writeFile(fixture.pluginFile, Buffer.from('export const handEdited = "interrupted"\n'))
    await writeFile(join(fixture.profileDir, 'package.json'), Buffer.from('{"interrupted":true}\n'))

    assert.deepEqual(await archive.recover(), {
      recovered: true,
      transactionId: transaction.transactionId,
      snapshotId: transaction.snapshotId,
    })
    assert.deepEqual(await readFile(fixture.pluginFile), fixture.pluginSource)
    assert.deepEqual(await readFile(join(fixture.profileDir, 'package.json')), fixture.raw.get('package.json'))
    assert.equal((await archive.getState()).active, undefined)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a committed snapshot can later restore the exact original profile through a new journal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-user-plugin-archive-restore-'))
  try {
    const fixture = await createProfileFixture(root)
    const archive = new UserPluginArchive({ profileDir: fixture.profileDir })
    const transaction = await archive.begin({ operation: 'successful-mutation' })
    await mkdir(join(fixture.nodeModules, '@community', 'hand-edited-plugin'), { recursive: true })
    await writeFile(fixture.pluginFile, Buffer.from('export const handEdited = "committed mutation"\n'))
    await writeFile(join(fixture.profileDir, 'package.json'), Buffer.from('{"committed":true}\n'))
    await transaction.markApplied()
    await transaction.commit()

    const restored = await archive.restore(transaction.snapshotId)
    assert.equal(restored.snapshotId, transaction.snapshotId)
    assert.equal(restored.phase, 'committed')
    assert.deepEqual(await readFile(fixture.pluginFile), fixture.pluginSource)
    assert.deepEqual(await readFile(join(fixture.profileDir, 'package.json')), fixture.raw.get('package.json'))
    assert.equal((await archive.getState()).active, undefined)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a pnpm-style external directory link is archived as metadata and restored without copying its project', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-user-plugin-archive-junction-'))
  try {
    const fixture = await createProfileFixture(root)
    const external = join(root, 'outside-workspace')
    const externalLink = join(fixture.nodeModules, 'linked-outside-workspace')
    await mkdir(external, { recursive: true })
    await writeFile(join(external, 'outside-only.txt'), Buffer.from('this project must not be archived'))
    try {
    await symlink(external, externalLink, 'junction')
    } catch (error) {
      if (['EPERM', 'EACCES', 'UNKNOWN'].includes(error?.code)) {
        context.skip('the current account cannot create a test directory link')
        return
      }
      throw error
    }
    const originalInventory = await inventoryUserPluginTree(fixture.nodeModules)
    const archive = new UserPluginArchive({ profileDir: fixture.profileDir })
    const transaction = await archive.begin({ operation: 'junction-preservation' })
    const snapshot = await archive.inspect(transaction.snapshotId)
    const archivedLink = snapshot.nodeModules.inventory.entries.find((entry) => entry.path === 'linked-outside-workspace')
    assert.equal(archivedLink?.kind, 'symlink')
    assert.equal(snapshot.nodeModules.inventory.entries.some((entry) => entry.path.includes('outside-only')), false)

    await mkdir(join(fixture.nodeModules, '@community', 'hand-edited-plugin'), { recursive: true })
    await writeFile(fixture.pluginFile, Buffer.from('export const handEdited = "temporary"\n'))
    await transaction.markApplied()
    await transaction.rollback()

    assert.deepEqual(await inventoryUserPluginTree(fixture.nodeModules), originalInventory)
    assert.deepEqual(await readFile(join(external, 'outside-only.txt')), Buffer.from('this project must not be archived'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('inventory records link metadata and never traverses an external target', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-user-plugin-archive-link-'))
  try {
    const tree = join(root, 'tree')
    const external = join(root, 'outside-project')
    await mkdir(tree, { recursive: true })
    await mkdir(external, { recursive: true })
    await writeFile(join(external, 'secret-not-archived.txt'), Buffer.from('outside bytes'))
    let linkName = 'external-file-link'
    let linked = join(tree, linkName)
    try {
      await symlink(join(external, 'secret-not-archived.txt'), linked, 'file')
    } catch (error) {
      if (!['EPERM', 'EACCES', 'UNKNOWN'].includes(error?.code)) throw error
      // A Windows junction does not need the symbolic-link privilege and is
      // the link form pnpm uses for directory package targets.
      linkName = 'external-directory-link'
      linked = join(tree, linkName)
      try {
        await symlink(external, linked, 'junction')
      } catch (junctionError) {
        if (['EPERM', 'EACCES', 'UNKNOWN'].includes(junctionError?.code)) {
          context.skip('the current account cannot create a test link')
          return
        }
        throw junctionError
      }
    }

    const inventory = await inventoryUserPluginTree(tree)
    const link = inventory.entries.find((entry) => entry.path === linkName)
    assert.equal(link?.kind, 'symlink')
    assert.equal(typeof link.target, 'string')
    assert.equal(inventory.entries.some((entry) => entry.path.includes('secret-not-archived')), false)
    assert.equal(inventory.fileCount, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('an integrity failure leaves the archived bytes and active rollback journal intact', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-user-plugin-archive-integrity-'))
  try {
    const fixture = await createProfileFixture(root)
    const archive = new UserPluginArchive({ profileDir: fixture.profileDir })
    const transaction = await archive.begin({ operation: 'restore-failure' })
    const archiveArtifact = join(
      archive.archiveDir,
      'snapshots',
      transaction.snapshotId,
      'profile-files',
      'package-json.bin',
    )
    const current = Buffer.from('{"current":"must-not-be-partially-restored"}\n')
    await writeFile(join(fixture.profileDir, 'package.json'), current)
    await writeFile(archiveArtifact, Buffer.from('corrupted archive artifact'))

    await assert.rejects(transaction.rollback(), /integrity check failed/u)
    assert.deepEqual(await readFile(join(fixture.profileDir, 'package.json')), current)
    assert.deepEqual(await readFile(archiveArtifact), Buffer.from('corrupted archive artifact'))
    const active = (await archive.getState()).active
    assert.equal(active?.transactionId, transaction.transactionId)
    assert.equal(active?.phase, 'archived')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
