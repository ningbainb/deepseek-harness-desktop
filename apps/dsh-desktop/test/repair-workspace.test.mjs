import assert from 'node:assert/strict'
import { lstat, mkdir, mkdtemp, readFile, readlink, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { RepairWorkspace, resolveEnabledRepairRoots } from '../src/repair-workspace.mjs'

test('enabled repair roots include the original profile and every non-built-in bundle real root', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-repair-roots-'))
  try {
    const profileDir = join(root, 'profile')
    const builtin = join(profileDir, 'node_modules', '@built-in', 'bundle')
    const plugin = join(root, 'linked-plugin')
    const pluginLink = join(profileDir, 'node_modules', '@user', 'plugin')
    await mkdir(builtin, { recursive: true })
    await mkdir(plugin, { recursive: true })
    await mkdir(join(profileDir, 'node_modules', '@user'), { recursive: true })
    await writeFile(join(profileDir, 'package.json'), `${JSON.stringify({
      dependencies: {
        '@built-in/bundle': '1.0.0',
        '@user/plugin': 'link:C:/private/path',
      },
      dsh: { profile: { bundles: ['@built-in/bundle', '@user/plugin', '@missing/plugin'] } },
    })}\n`)
    try {
      await symlink(plugin, pluginLink, 'junction')
    } catch (error) {
      if (['EPERM', 'EACCES', 'UNKNOWN'].includes(error?.code)) {
        context.skip('the current account cannot create a directory link')
        return
      }
      throw error
    }

    const resolved = await resolveEnabledRepairRoots({
      profileDir,
      builtInBundles: ['@built-in/bundle'],
    })

    assert.deepEqual(resolved.roots.map(rootEntry => [rootEntry.kind, rootEntry.packageName]), [
      ['profile', undefined],
      ['plugin', '@user/plugin'],
    ])
    assert.equal(resolved.roots[1].path, await realpath(plugin))
    assert.deepEqual(resolved.bundles.map(bundle => bundle.name), [
      '@built-in/bundle',
      '@missing/plugin',
      '@user/plugin',
    ])
    assert.equal(JSON.stringify(resolved).includes('C:/private/path'), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('repair workspace materializes real plugin content and rewrites only candidate dependencies', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-repair-workspace-'))
  try {
    const profileDir = join(root, 'profile')
    const regular = join(profileDir, 'node_modules', 'regular-plugin')
    const external = join(root, 'external-linked-plugin')
    const linked = join(profileDir, 'node_modules', 'linked-plugin')
    await mkdir(regular, { recursive: true })
    await mkdir(external, { recursive: true })
    await writeFile(join(profileDir, 'package.json'), `${JSON.stringify({
      name: 'profile',
      dependencies: {
        'regular-plugin': '1.0.0',
        'linked-plugin': 'link:../../external-linked-plugin',
      },
    }, null, 2)}\n`)
    await writeFile(join(regular, 'index.mjs'), 'export const value = "regular"\n')
    await writeFile(join(external, 'index.mjs'), 'export const value = "linked"\n')
    try {
      await symlink(external, linked, 'junction')
    } catch (error) {
      if (['EPERM', 'EACCES', 'UNKNOWN'].includes(error?.code)) {
        context.skip('the current account cannot create a directory link')
        return
      }
      throw error
    }

    const workspace = new RepairWorkspace({
      incidentDir: join(root, 'incident'),
      profileDir,
      roots: [
        { id: 'profile', kind: 'profile', path: profileDir },
        { id: 'regular', kind: 'plugin', path: regular, packageName: 'regular-plugin' },
        { id: 'linked', kind: 'plugin', path: linked, packageName: 'linked-plugin' },
      ],
    })
    const staged = await workspace.stage()
    assert.equal(await readFile(join(staged.workspace, 'plugins', 'regular', 'index.mjs'), 'utf8'), 'export const value = "regular"\n')
    assert.equal(await readFile(join(staged.workspace, 'plugins', 'linked', 'index.mjs'), 'utf8'), 'export const value = "linked"\n')
    const candidateManifest = JSON.parse(await readFile(join(staged.workspace, 'profile', 'package.json'), 'utf8'))
    assert.equal(candidateManifest.dependencies['regular-plugin'], 'link:../plugins/regular')
    assert.equal(candidateManifest.dependencies['linked-plugin'], 'link:../plugins/linked')
    const originalManifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
    assert.equal(originalManifest.dependencies['linked-plugin'], 'link:../../external-linked-plugin')

    await writeFile(join(staged.workspace, 'plugins', 'linked', 'index.mjs'), 'export const value = "candidate"\n')
    assert.equal(await readFile(join(external, 'index.mjs'), 'utf8'), 'export const value = "linked"\n')
    assert.equal((await lstat(linked)).isSymbolicLink(), true)
    assert.equal(await readlink(linked), external)
    assert.deepEqual((await workspace.changedFiles()).map((entry) => entry.path), ['plugins/linked/index.mjs'])
    assert.throws(() => workspace.resolveCandidatePath('linked', '../../outside.txt'), /outside repair workspace/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('repair workspace rejects apply when an original changes after staging', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-repair-conflict-'))
  try {
    const profileDir = join(root, 'profile')
    const plugin = join(profileDir, 'node_modules', 'plugin')
    await mkdir(plugin, { recursive: true })
    await writeFile(join(profileDir, 'package.json'), '{"name":"profile"}\n')
    await writeFile(join(plugin, 'index.mjs'), 'original\n')
    const workspace = new RepairWorkspace({
      incidentDir: join(root, 'incident'),
      profileDir,
      roots: [
        { id: 'profile', kind: 'profile', path: profileDir },
        { id: 'plugin', kind: 'plugin', path: plugin, packageName: 'plugin' },
      ],
    })
    const staged = await workspace.stage()
    await writeFile(join(staged.workspace, 'plugins', 'plugin', 'index.mjs'), 'candidate\n')
    await writeFile(join(plugin, 'index.mjs'), 'concurrent user edit\n')
    await assert.rejects(workspace.apply(), /changed after repair staging/u)
    assert.equal(await readFile(join(plugin, 'index.mjs'), 'utf8'), 'concurrent user edit\n')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
