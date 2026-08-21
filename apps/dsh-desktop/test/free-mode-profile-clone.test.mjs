import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readlink, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  FreeModeProfileCloneError,
  cloneFreeModeAgentConfig,
  cloneFreeModeHomePatch,
  cloneFreeModeProfile,
  inspectFreeModeAgentConfigClone,
  inspectFreeModeHomePatch,
  inspectFreeModeProfileClone,
  isFreeModeAgentConfigCloneEntry,
  isFreeModeProfileCloneEntry,
} from '../src/free-mode-profile-clone.mjs'

async function fixture(prefix = 'dsh-free-profile-clone-') {
  const root = await mkdtemp(join(tmpdir(), prefix))
  const source = join(root, 'original', 'profiles', 'desktop')
  const target = join(root, 'session', 'profiles', 'free-session')
  const sourceDshHome = join(root, 'original')
  const targetDshHome = join(root, 'session')
  const workspace = join(root, 'workspace-plugin')
  await Promise.all([
    mkdir(join(source, 'node_modules', 'custom-plugin'), { recursive: true }),
    mkdir(join(source, 'state', 'task-board'), { recursive: true }),
    mkdir(join(sourceDshHome, '.agent-presets', 'custom-repair-agent', 'prompts'), { recursive: true }),
    mkdir(join(sourceDshHome, 'skills', 'repair-evidence'), { recursive: true }),
    mkdir(target, { recursive: true }),
    mkdir(workspace, { recursive: true }),
  ])
  await Promise.all([
    writeFile(join(source, 'package.json'), '{"name":"custom","scripts":{"repair":"node repair.mjs"}}\n'),
    writeFile(join(source, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n'),
    writeFile(join(source, 'cordis.patch.yml'), '- id: user-patch\n'),
    writeFile(join(sourceDshHome, 'cordis.patch.yml'), '- id: root-user-patch\n'),
    writeFile(join(targetDshHome, 'cordis.patch.yml'), '- id: generated-default\n'),
    writeFile(join(sourceDshHome, 'settings.yaml'), 'agent:\n  preset: custom-repair-agent\n'),
    writeFile(join(sourceDshHome, '.credentials.yaml'), 'providerToken: desktop-agent-secret\n'),
    writeFile(join(sourceDshHome, '.env'), 'REPAIR_AGENT_TOKEN=desktop-agent-env-secret\n'),
    writeFile(join(sourceDshHome, '.agent-presets', 'custom-repair-agent', 'agent.cordis.yml'), 'name: custom-repair-agent\n'),
    writeFile(join(sourceDshHome, '.agent-presets', 'custom-repair-agent', 'prompts', 'repair.md'), 'Repair the current session only.\n'),
    writeFile(join(sourceDshHome, 'skills', 'repair-evidence', 'SKILL.md'), '---\nname: repair-evidence\ndescription: inspect recovery evidence\n---\n'),
    writeFile(join(source, 'node_modules', 'custom-plugin', 'index.mjs'), 'export const handEdited = true\n'),
    writeFile(join(source, 'state', 'task-board', 'tasks-v3.json'), '{"schemaVersion":3,"projects":[]}\n'),
    writeFile(join(workspace, 'index.mjs'), 'export const workspaceSource = true\n'),
    writeFile(join(target, 'baseline-only.txt'), 'remove me\n'),
  ])
  // Junctions do not require the Windows symlink privilege and preserve the
  // essential no-follow behavior on the Windows target this Desktop ships.
  await symlink(workspace, join(source, 'node_modules', 'workspace-plugin'), 'junction')
  return { root, source, target, sourceDshHome, targetDshHome, workspace }
}

test('copies user-modified profile/plugin bytes and the fixed home patch into an isolated Free Mode session without traversing workspace links', async () => {
  const { source, target, sourceDshHome, targetDshHome, workspace } = await fixture()
  const before = await inspectFreeModeProfileClone({ sourceProfileDir: source })
  const homePatchBefore = await inspectFreeModeHomePatch({ sourceDshHome })
  const result = await cloneFreeModeProfile({
    sourceProfileDir: source,
    targetProfileDir: target,
    idFactory: () => 'copy-1',
  })
  const homePatchResult = await cloneFreeModeHomePatch({
    sourceDshHome,
    targetDshHome,
    expectedDigest: homePatchBefore.digest,
    idFactory: () => 'home-copy-1',
  })
  const after = await inspectFreeModeProfileClone({ sourceProfileDir: source })

  assert.equal(result.cloned, true)
  assert.equal(result.digest, before.digest)
  assert.equal(after.digest, before.digest)
  assert.equal(await readFile(join(target, 'package.json'), 'utf8'), await readFile(join(source, 'package.json'), 'utf8'))
  assert.equal(await readFile(join(target, 'node_modules', 'custom-plugin', 'index.mjs'), 'utf8'), 'export const handEdited = true\n')
  assert.equal(await readFile(join(target, 'state', 'task-board', 'tasks-v3.json'), 'utf8'), '{"schemaVersion":3,"projects":[]}\n')
  assert.equal(await readlink(join(target, 'node_modules', 'workspace-plugin')), await readlink(join(source, 'node_modules', 'workspace-plugin')))
  assert.equal(await readFile(join(workspace, 'index.mjs'), 'utf8'), 'export const workspaceSource = true\n')
  await assert.rejects(readFile(join(target, 'baseline-only.txt')), { code: 'ENOENT' })
  assert.equal(result.entries.some((entry) => entry.id === 'node_modules' && entry.present), true)
  assert.equal(result.links >= 1, true)
  assert.equal(homePatchResult.digest, homePatchBefore.digest)
  assert.equal(await readFile(join(targetDshHome, 'cordis.patch.yml'), 'utf8'), '- id: root-user-patch\n')
})

test('rejects a root patch that changes after its Free Mode copy was reviewed', async () => {
  const { sourceDshHome, targetDshHome } = await fixture('dsh-free-home-patch-review-')
  const review = await inspectFreeModeHomePatch({ sourceDshHome })
  await writeFile(join(sourceDshHome, 'cordis.patch.yml'), '- id: changed-after-review\n')
  await assert.rejects(
    cloneFreeModeHomePatch({
      sourceDshHome,
      targetDshHome,
      expectedDigest: review.digest,
      idFactory: () => 'home-copy-expected',
    }),
    (error) => error instanceof FreeModeProfileCloneError && error.code === 'free-mode-home-patch-source-changed',
  )
  assert.equal(await readFile(join(targetDshHome, 'cordis.patch.yml'), 'utf8'), '- id: generated-default\n')
})

test('copies only fixed user Agent configuration into the isolated Free Mode home without exposing credential bytes', async () => {
  const { root, sourceDshHome, targetDshHome } = await fixture('dsh-free-agent-config-copy-')
  await Promise.all([
    writeFile(join(targetDshHome, 'settings.yaml'), 'agent:\n  preset: generated-default\n'),
    writeFile(join(targetDshHome, '.credentials.yaml'), 'providerToken: generated-default\n'),
    writeFile(join(targetDshHome, '.env'), 'GENERATED_DEFAULT=true\n'),
    mkdir(join(targetDshHome, '.agent-presets', 'generated-default'), { recursive: true }),
    mkdir(join(targetDshHome, 'skills', 'generated-skill'), { recursive: true }),
  ])
  await Promise.all([
    writeFile(join(targetDshHome, '.agent-presets', 'generated-default', 'agent.cordis.yml'), 'name: generated-default\n'),
    writeFile(join(targetDshHome, 'skills', 'generated-skill', 'SKILL.md'), 'generated\n'),
  ])

  const reviewed = await inspectFreeModeAgentConfigClone({ sourceDshHome })
  const result = await cloneFreeModeAgentConfig({
    sourceDshHome,
    targetDshHome,
    expectedDigest: reviewed.digest,
    idFactory: () => 'agent-copy-1',
  })

  assert.equal(result.cloned, true)
  assert.equal(result.digest, reviewed.digest)
  assert.deepEqual(result.clonedEntries, ['settings.yaml', '.credentials.yaml', '.env', '.agent-presets', 'skills'])
  assert.equal(await readFile(join(targetDshHome, 'settings.yaml'), 'utf8'), 'agent:\n  preset: custom-repair-agent\n')
  assert.equal(await readFile(join(targetDshHome, '.credentials.yaml'), 'utf8'), 'providerToken: desktop-agent-secret\n')
  assert.equal(await readFile(join(targetDshHome, '.env'), 'utf8'), 'REPAIR_AGENT_TOKEN=desktop-agent-env-secret\n')
  assert.equal(await readFile(join(targetDshHome, '.agent-presets', 'custom-repair-agent', 'prompts', 'repair.md'), 'utf8'), 'Repair the current session only.\n')
  assert.equal(await readFile(join(targetDshHome, 'skills', 'repair-evidence', 'SKILL.md'), 'utf8'), '---\nname: repair-evidence\ndescription: inspect recovery evidence\n---\n')
  await assert.rejects(readFile(join(targetDshHome, '.agent-presets', 'generated-default', 'agent.cordis.yml')), { code: 'ENOENT' })
  await assert.rejects(readFile(join(targetDshHome, 'skills', 'generated-skill', 'SKILL.md')), { code: 'ENOENT' })

  const publicReview = JSON.stringify(reviewed)
  const publicResult = JSON.stringify(result)
  for (const secret of [
    'desktop-agent-secret',
    'desktop-agent-env-secret',
    'custom-repair-agent',
    'repair-evidence',
    sourceDshHome,
    root,
  ]) {
    assert.equal(publicReview.includes(secret), false)
    assert.equal(publicResult.includes(secret), false)
  }
  const parentEntries = await readdir(root)
  assert.equal(parentEntries.some((name) => name.startsWith('.desktop-free-agent-config-stage-')), false)
  assert.equal(parentEntries.some((name) => name.startsWith('.desktop-free-agent-config-backup-')), false)
})

test('rejects Agent configuration links instead of following a project or workspace path', async () => {
  const { sourceDshHome, targetDshHome, workspace } = await fixture('dsh-free-agent-config-link-')
  await symlink(workspace, join(sourceDshHome, '.agent-presets', 'linked-workspace'), 'junction')

  await assert.rejects(
    inspectFreeModeAgentConfigClone({ sourceDshHome }),
    (error) => error instanceof FreeModeProfileCloneError && error.code === 'free-mode-agent-config-link-not-allowed',
  )
  await assert.rejects(
    cloneFreeModeAgentConfig({
      sourceDshHome,
      targetDshHome,
      idFactory: () => 'agent-link-1',
    }),
    (error) => error instanceof FreeModeProfileCloneError && error.code === 'free-mode-agent-config-link-not-allowed',
  )
  assert.equal(await readFile(join(workspace, 'index.mjs'), 'utf8'), 'export const workspaceSource = true\n')
  await assert.rejects(readFile(join(targetDshHome, '.agent-presets', 'linked-workspace', 'index.mjs')), { code: 'ENOENT' })
})

test('does not alter an isolated target when Agent configuration changes during staging', async () => {
  const { sourceDshHome, targetDshHome } = await fixture('dsh-free-agent-config-change-')
  await writeFile(join(targetDshHome, 'settings.yaml'), 'agent:\n  preset: generated-default\n')
  const fs = await import('node:fs/promises')
  let mutated = false
  await assert.rejects(
    cloneFreeModeAgentConfig({
      sourceDshHome,
      targetDshHome,
      idFactory: () => 'agent-change-1',
      fs: {
        ...fs,
        writeFile: async (...args) => {
          await fs.writeFile(...args)
          if (!mutated) {
            mutated = true
            await writeFile(join(sourceDshHome, '.credentials.yaml'), 'providerToken: changed-after-consent\n')
          }
        },
      },
    }),
    (error) => error instanceof FreeModeProfileCloneError && error.code === 'free-mode-agent-config-source-changed',
  )
  assert.equal(await readFile(join(targetDshHome, 'settings.yaml'), 'utf8'), 'agent:\n  preset: generated-default\n')
  await assert.rejects(readFile(join(targetDshHome, '.credentials.yaml')), { code: 'ENOENT' })
})

test('leaves generated target Agent state alone when no allowlisted source entry exists', async () => {
  const { sourceDshHome, targetDshHome } = await fixture('dsh-free-agent-config-empty-')
  await Promise.all([
    rm(join(sourceDshHome, 'settings.yaml')),
    rm(join(sourceDshHome, '.credentials.yaml')),
    rm(join(sourceDshHome, '.env')),
    rm(join(sourceDshHome, '.agent-presets'), { recursive: true, force: true }),
    rm(join(sourceDshHome, 'skills'), { recursive: true, force: true }),
  ])
  await writeFile(join(targetDshHome, 'settings.yaml'), 'agent:\n  preset: generated-default\n')

  const inspected = await inspectFreeModeAgentConfigClone({ sourceDshHome })
  const result = await cloneFreeModeAgentConfig({
    sourceDshHome,
    targetDshHome,
    expectedDigest: inspected.digest,
    idFactory: () => 'agent-empty-1',
  })

  assert.equal(result.cloned, false)
  assert.deepEqual(result.clonedEntries, [])
  assert.equal(await readFile(join(targetDshHome, 'settings.yaml'), 'utf8'), 'agent:\n  preset: generated-default\n')
})

test('bounds recursive Agent state before it can consume an isolated session', async () => {
  const { sourceDshHome, targetDshHome } = await fixture('dsh-free-agent-config-budget-')
  const presetRoot = join(sourceDshHome, '.agent-presets', 'custom-repair-agent')
  for (let index = 0; index < 512; index += 1) {
    await writeFile(join(presetRoot, `bounded-${index}.txt`), 'x')
  }
  await writeFile(join(targetDshHome, 'settings.yaml'), 'agent:\n  preset: generated-default\n')

  await assert.rejects(
    inspectFreeModeAgentConfigClone({ sourceDshHome }),
    (error) => error instanceof FreeModeProfileCloneError && error.code === 'free-mode-agent-config-budget-exceeded',
  )
  assert.equal(await readFile(join(targetDshHome, 'settings.yaml'), 'utf8'), 'agent:\n  preset: generated-default\n')
})

test('fails closed and preserves the isolated target when the original changes during staging', async () => {
  const { source, target } = await fixture('dsh-free-profile-clone-change-')
  const sourcePlugin = join(source, 'node_modules', 'custom-plugin', 'index.mjs')
  const targetBaseline = join(target, 'baseline-only.txt')
  const fs = await import('node:fs/promises')
  let mutated = false
  const result = cloneFreeModeProfile({
    sourceProfileDir: source,
    targetProfileDir: target,
    idFactory: () => 'copy-2',
    fs: {
      ...fs,
      copyFile: async (...args) => {
        await fs.copyFile(...args)
        if (!mutated) {
          mutated = true
          await writeFile(sourcePlugin, 'export const changedAfterConsent = true\n')
        }
      },
    },
  })
  await assert.rejects(result, (error) => error instanceof FreeModeProfileCloneError && error.code === 'free-mode-profile-clone-source-changed')
  assert.equal(await readFile(targetBaseline, 'utf8'), 'remove me\n')
  await assert.rejects(readFile(join(target, 'package.json')), { code: 'ENOENT' })
})

test('rejects a profile that changed between the native review and the copy operation', async () => {
  const { source, target } = await fixture('dsh-free-profile-clone-review-')
  const reviewed = await inspectFreeModeProfileClone({ sourceProfileDir: source })
  await writeFile(join(source, 'cordis.patch.yml'), '- id: changed-after-review\n')
  await assert.rejects(
    cloneFreeModeProfile({
      sourceProfileDir: source,
      targetProfileDir: target,
      expectedDigest: reviewed.digest,
      idFactory: () => 'copy-expected',
    }),
    (error) => error instanceof FreeModeProfileCloneError && error.code === 'free-mode-profile-clone-source-changed',
  )
  assert.equal(await readFile(join(target, 'baseline-only.txt'), 'utf8'), 'remove me\n')
})

test('rejects missing or overlapping profile roots and exposes only fixed clone-entry names', async () => {
  const { source, target, sourceDshHome, targetDshHome } = await fixture('dsh-free-profile-clone-input-')
  await assert.rejects(
    cloneFreeModeProfile({ sourceProfileDir: source, targetProfileDir: join(source, 'nested'), idFactory: () => 'copy-3' }),
    (error) => error instanceof FreeModeProfileCloneError && error.code === 'free-mode-profile-clone-path-overlap',
  )
  await assert.rejects(
    inspectFreeModeProfileClone({ sourceProfileDir: join(target, 'absent') }),
    (error) => error instanceof FreeModeProfileCloneError && error.code === 'free-mode-profile-clone-source-missing',
  )
  await assert.rejects(
    cloneFreeModeAgentConfig({
      sourceDshHome,
      targetDshHome: join(sourceDshHome, 'nested-free-mode'),
      idFactory: () => 'agent-overlap-1',
    }),
    (error) => error instanceof FreeModeProfileCloneError && error.code === 'free-mode-agent-config-path-overlap',
  )
  assert.equal(isFreeModeProfileCloneEntry('node_modules'), true)
  assert.equal(isFreeModeProfileCloneEntry('../workspace'), false)
  assert.equal(isFreeModeAgentConfigCloneEntry('.agent-presets'), true)
  assert.equal(isFreeModeAgentConfigCloneEntry('skills'), true)
  assert.equal(isFreeModeAgentConfigCloneEntry('../workspace'), false)
})
