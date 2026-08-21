import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { _electron as electron } from 'playwright'

import { AGGREGATED_BUNDLES, BUILTIN_BUNDLES, RETIRED_MANAGED_PACKAGES } from '../src/profile.mjs'
import { MIGRATION_COMPLETION_SCHEMA_VERSION, MIGRATION_SCHEMA_VERSION } from '../src/migration-assistant.mjs'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'

const executablePath = process.env.DSH_DESKTOP_E2E_EXECUTABLE
if (!executablePath) throw new Error('DSH_DESKTOP_E2E_EXECUTABLE is required')

const temporary = await mkdtemp(resolve(tmpdir(), 'dsh-profile-migration-e2e-'))
const legacyCommunityPlugin = '@community/legacy-safe-mode-fixture'
const legacySkinStart = '# --- dsh-skin managed (auto-generated; do not edit) ---'
const legacySkinEnd = '# --- end dsh-skin managed ---'

function legacySkinPackage(skinId) {
  return `@linxin666/dsh-client-ui-skin-${skinId}`
}

function legacySkinSection(skinId) {
  return `${legacySkinStart}\n- insert:\n    - id: ui-skin-${skinId}\n      name: '${legacySkinPackage(skinId)}'\n${legacySkinEnd}`
}

async function waitForRuntimeWindow(app, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const page = app.windows().find((candidate) => /^http:\/\/127\.0\.0\.1:/u.test(candidate.url()))
    if (page) return page
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  throw new Error('runtime window did not appear before the profile migration E2E timeout')
}

async function seedCurrentApplicationMigration({ profileDir, userData }) {
  const migrationDirectory = resolve(userData, 'migration-assistant')
  await mkdir(migrationDirectory, { recursive: true })
  await writeFile(resolve(migrationDirectory, 'completion.json'), `${JSON.stringify({
    schemaVersion: MIGRATION_COMPLETION_SCHEMA_VERSION,
    migrationSchemaVersion: MIGRATION_SCHEMA_VERSION,
    state: 'complete',
    targetVersion: '3.0.0',
    sourceVersion: '3.0.0',
    journalId: 'profile-migration-e2e-current',
    profileIdentitySha256: createHash('sha256').update(profileDir).digest('hex'),
    completedAt: '2026-08-21T00:00:00.000Z',
  }, null, 2)}\n`)
}

async function launchOnce({ dshHome, userData }) {
  await seedPrimaryRuntimePermissionForTest({ userData })
  const app = await electron.launch({
    executablePath,
    env: { ...process.env, DSH_HOME: dshHome, DSH_DESKTOP_USER_DATA: userData },
  })
  let port
  try {
    await app.firstWindow()
    let page
    try {
      page = await waitForRuntimeWindow(app, 120_000)
    } catch (error) {
      const log = await readFile(resolve(userData, 'logs', 'runtime.log'), 'utf8').catch(() => '')
      console.error(`runtime did not become ready; recent log:\n${log.slice(-4_000) || '(no runtime log)'}`)
      throw error
    }
    await page.waitForSelector('style[data-plugin="@linxin666/dsh-client-ui-mode-switcher"]', { state: 'attached' })
    port = new URL(page.url()).port
  } finally {
    await app.close()
  }
  return {
    port,
    runtimeLog: await readFile(resolve(userData, 'logs', 'runtime.log'), 'utf8').catch(() => ''),
  }
}

async function createLegacyFixture(root, skinId) {
  const dshHome = resolve(root, 'dsh-home')
  const userData = resolve(root, 'user-data')
  const profileDir = resolve(dshHome, 'profiles', 'desktop')
  const manifestPath = resolve(profileDir, 'package.json')
  const profilePatchPath = resolve(profileDir, 'cordis.patch.yml')
  const homePatchPath = resolve(dshHome, 'cordis.patch.yml')
  const recoveryStatePath = resolve(userData, 'plugin-recovery', 'state.json')
  const skinPackage = legacySkinPackage(skinId)
  const skinSection = legacySkinSection(skinId)

  await mkdir(profileDir, { recursive: true })
  await writeFile(manifestPath, `${JSON.stringify({
    name: 'dsh-profile-desktop',
    private: true,
    dependencies: {
      'dsh-plugin-hub': '0.1.1',
      [skinPackage]: '0.1.2',
    },
    dsh: {
      profile: {
        bundles: [
          ...BUILTIN_BUNDLES,
          '@linxin666/dsh-client-ui-aionui-panel',
          '@linxin666/dsh-client-ui-git-graph',
          '@linxin666/dsh-client-ui-task-board',
          '@linxin666/dsh-client-ui-skin-center',
          'dsh-plugin-hub',
          skinPackage,
        ],
      },
    },
  }, null, 2)}\n`)
  await writeFile(profilePatchPath, `${skinSection}\n\n- id: retained-community-row\n`)
  await writeFile(homePatchPath, `- id: retained-home-row\n\n${skinSection}\n`)

  const legacySchemasteryRoot = resolve(profileDir, 'node_modules', 'schemastery')
  await mkdir(legacySchemasteryRoot, { recursive: true })
  await writeFile(
    resolve(legacySchemasteryRoot, 'package.json'),
    `${JSON.stringify({ name: 'schemastery', version: '3.18.0' }, null, 2)}\n`,
  )
  const legacyCommunityRoot = resolve(profileDir, 'node_modules', ...legacyCommunityPlugin.split('/'))
  await mkdir(legacyCommunityRoot, { recursive: true })
  await writeFile(resolve(legacyCommunityRoot, 'package.json'), `${JSON.stringify({
    name: legacyCommunityPlugin,
    version: '1.0.0',
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }, null, 2)}\n`)
  await writeFile(resolve(legacyCommunityRoot, 'cordis.patch.yml'), '[]\n')
  await mkdir(resolve(userData, 'plugin-recovery'), { recursive: true })
  await writeFile(recoveryStatePath, `${JSON.stringify({
    version: 1,
    safeMode: true,
    snapshots: [],
    incidents: [{
      id: 'legacy-unknown-timeout',
      createdAt: '2026-08-17T00:00:00.000Z',
      identified: false,
      reasonCode: 'unknown',
      summary: '未能可靠定位故障插件',
      technicalDetails: '[legacy-safe-mode-fixture] host loaded\nDSH runtime did not become ready within 120000ms',
      resolution: 'safe-mode-auto',
    }],
    disabledDependencies: { [legacyCommunityPlugin]: '1.0.0' },
    currentIncidentId: 'legacy-unknown-timeout',
  }, null, 2)}\n`)
  // This E2E isolates legacy plugin/skin cleanup from the separately covered
  // 2.3-2.7 application migration matrix. Mark the app-level 3.0 schema as
  // already complete so the old plugin fixture is not misclassified as an
  // unsupported pre-2.3 Desktop installation.
  await seedCurrentApplicationMigration({ profileDir, userData })

  return {
    dshHome,
    userData,
    profileDir,
    manifestPath,
    profilePatchPath,
    homePatchPath,
    recoveryStatePath,
    skinPackage,
  }
}

function assertRetiredPackagesAreGone(manifest, skinPackage) {
  assert.equal(manifest.dependencies[skinPackage], undefined, `${skinPackage} remained as a retired dependency`)
  assert.equal(manifest.dsh.profile.bundles.includes(skinPackage), false, `${skinPackage} remained as a retired bundle`)
  for (const name of AGGREGATED_BUNDLES) {
    assert.equal(manifest.dsh.profile.bundles.includes(name), false, `${name} remained duplicated`)
  }
  for (const name of RETIRED_MANAGED_PACKAGES) {
    assert.equal(manifest.dependencies[name], undefined, `${name} remained as a retired dependency`)
    assert.equal(manifest.dsh.profile.bundles.includes(name), false, `${name} remained as a retired bundle`)
  }
}

async function verifyInvalidLegacySkinFallsBack() {
  const fixture = await createLegacyFixture(resolve(temporary, 'invalid-qq98'), 'qq98')
  const firstRun = await launchOnce(fixture)
  assert.doesNotMatch(
    firstRun.runtimeLog,
    /ERR_MODULE_NOT_FOUND[\s\S]{0,500}@linxin666\/dsh-client-ui-skin-qq98/u,
    'the retired qq98 package was still loaded during boot',
  )

  const migrated = JSON.parse(await readFile(fixture.manifestPath, 'utf8'))
  assert.deepEqual(migrated.dsh.profile.bundles, [...BUILTIN_BUNDLES, legacyCommunityPlugin])
  assert.equal(migrated.dependencies[legacyCommunityPlugin], '1.0.0')
  assertRetiredPackagesAreGone(migrated, fixture.skinPackage)

  const repairedRecovery = JSON.parse(await readFile(fixture.recoveryStatePath, 'utf8'))
  assert.equal(repairedRecovery.policyVersion, 4)
  assert.equal(repairedRecovery.safeMode, false)
  assert.deepEqual(repairedRecovery.disabledDependencies, {})
  assert.equal(repairedRecovery.incidents[0].resolution, 'legacy-false-positive-repaired')

  const migratedProfilePatch = await readFile(fixture.profilePatchPath, 'utf8')
  const migratedHomePatch = await readFile(fixture.homePatchPath, 'utf8')
  assert.doesNotMatch(migratedProfilePatch, /dsh-skin managed/u)
  assert.doesNotMatch(migratedProfilePatch, /@linxin666\/dsh-client-ui-skin-qq98/u)
  assert.match(migratedProfilePatch, /retained-community-row/u)
  assert.match(migratedHomePatch, /retained-home-row/u)
  assert.doesNotMatch(migratedHomePatch, /dsh-skin managed/u)
  await assert.rejects(
    readFile(resolve(fixture.dshHome, 'skin-center-active.json'), 'utf8'),
    error => error?.code === 'ENOENT',
  )
  const retiredSkin = JSON.parse(await readFile(resolve(fixture.profileDir, '.dsh-desktop-retired-skin.json'), 'utf8'))
  assert.equal(retiredSkin.schemaVersion, 1)
  assert.equal(retiredSkin.packageName, fixture.skinPackage)
  assert.equal(retiredSkin.skinId, 'qq98')
  assert.equal(retiredSkin.reason, 'not-bundled-by-skin-center-v2')

  const managedLinks = JSON.parse(await readFile(resolve(fixture.profileDir, '.dsh-desktop-links.json'), 'utf8'))
  assert.equal(managedLinks.schemastery?.mode, 'link')
  assert.match(managedLinks.schemastery?.source ?? '', /node_modules[\\/]schemastery$/u)
  const migratedSchemastery = JSON.parse(await readFile(
    resolve(fixture.profileDir, 'node_modules', 'schemastery', 'package.json'),
    'utf8',
  ))
  assert.deepEqual(
    { name: migratedSchemastery.name, version: migratedSchemastery.version },
    { name: 'schemastery', version: '3.18.0' },
  )

  const secondRun = await launchOnce(fixture)
  assert.equal(secondRun.port, firstRun.port, 'packaged Desktop changed ports across a normal restart')
  const restarted = JSON.parse(await readFile(fixture.manifestPath, 'utf8'))
  assert.deepEqual(restarted.dsh.profile.bundles, [...BUILTIN_BUNDLES, legacyCommunityPlugin])
  assert.equal(await readFile(fixture.homePatchPath, 'utf8'), migratedHomePatch)

  // Desktop 0.1.8 could leave this file empty after the legacy skin section
  // was the only content. Verify the packaged app repairs that exact upgrade
  // state even when the earlier migration is no longer detectable.
  await writeFile(fixture.homePatchPath, '')
  const repairedRun = await launchOnce(fixture)
  assert.equal(repairedRun.port, firstRun.port, 'packaged Desktop changed ports during profile repair')
  assert.equal(await readFile(fixture.homePatchPath, 'utf8'), '[]\n')
}

async function verifyKnownLegacySkinMigratesToV2Selection() {
  const fixture = await createLegacyFixture(resolve(temporary, 'known-xp'), 'xp')
  const firstRun = await launchOnce(fixture)
  assert.doesNotMatch(
    firstRun.runtimeLog,
    /ERR_MODULE_NOT_FOUND[\s\S]{0,500}@linxin666\/dsh-client-ui-skin-xp/u,
    'the retired xp package was still loaded during boot',
  )

  const migrated = JSON.parse(await readFile(fixture.manifestPath, 'utf8'))
  assert.deepEqual(migrated.dsh.profile.bundles, [...BUILTIN_BUNDLES, legacyCommunityPlugin])
  assertRetiredPackagesAreGone(migrated, fixture.skinPackage)
  const activeSelection = JSON.parse(await readFile(resolve(fixture.dshHome, 'skin-center-active.json'), 'utf8'))
  assert.deepEqual(activeSelection, { active: 'xp' })
  const migratedProfilePatch = await readFile(fixture.profilePatchPath, 'utf8')
  const migratedHomePatch = await readFile(fixture.homePatchPath, 'utf8')
  assert.doesNotMatch(migratedProfilePatch, /dsh-skin managed/u)
  assert.doesNotMatch(migratedProfilePatch, /@linxin666\/dsh-client-ui-skin-xp/u)
  assert.doesNotMatch(migratedHomePatch, /dsh-skin managed/u)
  await assert.rejects(
    readFile(resolve(fixture.profileDir, '.dsh-desktop-retired-skin.json'), 'utf8'),
    error => error?.code === 'ENOENT',
  )

  const secondRun = await launchOnce(fixture)
  assert.equal(secondRun.port, firstRun.port, 'packaged Desktop changed ports after v2 active selection migration')
  assert.deepEqual(
    JSON.parse(await readFile(resolve(fixture.dshHome, 'skin-center-active.json'), 'utf8')),
    { active: 'xp' },
  )
}

try {
  await verifyInvalidLegacySkinFallsBack()
  await verifyKnownLegacySkinMigratesToV2Selection()
  console.log('verified legacy false-positive repair, aggregate and schemastery migration, qq98 safe fallback, and xp Skin Center v2 selection migration')
} finally {
  await rm(temporary, { recursive: true, force: true })
}
