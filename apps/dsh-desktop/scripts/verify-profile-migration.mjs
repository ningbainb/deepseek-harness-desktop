import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { _electron as electron } from 'playwright'

import { AGGREGATED_BUNDLES, BUILTIN_BUNDLES, RETIRED_MANAGED_PACKAGES } from '../src/profile.mjs'

const executablePath = process.env.DSH_DESKTOP_E2E_EXECUTABLE
if (!executablePath) throw new Error('DSH_DESKTOP_E2E_EXECUTABLE is required')

const temporary = await mkdtemp(resolve(tmpdir(), 'dsh-profile-migration-e2e-'))
const dshHome = resolve(temporary, 'dsh-home')
const userData = resolve(temporary, 'user-data')
const profileDir = resolve(dshHome, 'profiles', 'desktop')
const manifestPath = resolve(profileDir, 'package.json')
const profilePatchPath = resolve(profileDir, 'cordis.patch.yml')
const homePatchPath = resolve(dshHome, 'cordis.patch.yml')
const recoveryStatePath = resolve(userData, 'plugin-recovery', 'state.json')
const legacyCommunityPlugin = '@community/legacy-safe-mode-fixture'
const legacySkinSection = '# --- dsh-skin managed (auto-generated; do not edit) ---\n- insert:\n    - id: ui-skin-qq98\n      name: \'@linxin666/dsh-client-ui-skin-qq98\'\n# --- end dsh-skin managed ---'

async function launchOnce() {
  const app = await electron.launch({
    executablePath,
    env: { ...process.env, DSH_HOME: dshHome, DSH_DESKTOP_USER_DATA: userData },
  })
  try {
    const page = await app.firstWindow()
    try {
      await page.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { timeout: 120_000 })
    } catch (error) {
      const log = await readFile(resolve(userData, 'logs', 'runtime.log'), 'utf8').catch(() => '')
      console.error(`runtime did not become ready; recent log:\n${log.slice(-4_000) || '(no runtime log)'}`)
      throw error
    }
    await page.waitForSelector('style[data-plugin="@linxin666/dsh-client-ui-mode-switcher"]', { state: 'attached' })
    return new URL(page.url()).port
  } finally {
    await app.close()
  }
}

try {
  await mkdir(profileDir, { recursive: true })
  await writeFile(manifestPath, `${JSON.stringify({
    name: 'dsh-profile-desktop',
    private: true,
    dependencies: {
      'dsh-plugin-hub': '0.1.1',
      '@linxin666/dsh-client-ui-skin-qq98': '0.1.2',
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
          '@linxin666/dsh-client-ui-skin-qq98',
        ],
      },
    },
  }, null, 2)}\n`)
  await writeFile(profilePatchPath, `${legacySkinSection}\n\n- id: retained-community-row\n`)
  await writeFile(homePatchPath, `- id: retained-home-row\n\n${legacySkinSection}\n`)
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

  const firstPort = await launchOnce()
  const migrated = JSON.parse(await readFile(manifestPath, 'utf8'))
  assert.deepEqual(migrated.dsh.profile.bundles, [...BUILTIN_BUNDLES, legacyCommunityPlugin])
  assert.equal(migrated.dependencies[legacyCommunityPlugin], '1.0.0')
  const repairedRecovery = JSON.parse(await readFile(recoveryStatePath, 'utf8'))
  assert.equal(repairedRecovery.policyVersion, 2)
  assert.equal(repairedRecovery.safeMode, false)
  assert.deepEqual(repairedRecovery.disabledDependencies, {})
  assert.equal(repairedRecovery.incidents[0].resolution, 'legacy-false-positive-repaired')
  for (const name of AGGREGATED_BUNDLES) {
    assert.equal(migrated.dsh.profile.bundles.includes(name), false, `${name} remained duplicated`)
  }
  for (const name of RETIRED_MANAGED_PACKAGES) {
    assert.equal(migrated.dependencies[name], undefined, `${name} remained as a retired dependency`)
    assert.equal(migrated.dsh.profile.bundles.includes(name), false, `${name} remained as a retired bundle`)
  }
  const migratedProfilePatch = await readFile(profilePatchPath, 'utf8')
  const migratedHomePatch = await readFile(homePatchPath, 'utf8')
  assert.doesNotMatch(migratedProfilePatch, /dsh-skin managed/u)
  assert.match(migratedProfilePatch, /retained-community-row/u)
  assert.match(migratedHomePatch, /retained-home-row/u)
  assert.match(migratedHomePatch, /dsh-skin managed/u)
  assert.match(migratedHomePatch, /@linxin666\/dsh-client-ui-skin-qq98/u)
  const managedLinks = JSON.parse(await readFile(resolve(profileDir, '.dsh-desktop-links.json'), 'utf8'))
  assert.equal(managedLinks.schemastery?.mode, 'link')
  assert.match(managedLinks.schemastery?.source ?? '', /node_modules[\\/]schemastery$/u)
  const migratedSchemastery = JSON.parse(await readFile(resolve(legacySchemasteryRoot, 'package.json'), 'utf8'))
  assert.deepEqual(
    { name: migratedSchemastery.name, version: migratedSchemastery.version },
    { name: 'schemastery', version: '3.18.0' },
  )
  const migratedSkinAlias = JSON.parse(await readFile(
    resolve(profileDir, 'node_modules', '@linxin666', 'dsh-client-ui-skin-qq98', 'package.json'),
    'utf8',
  ))
  assert.equal(migratedSkinAlias.name, '@linxin666/dsh-client-ui-skin-qq98')

  const secondPort = await launchOnce()
  assert.equal(secondPort, firstPort, 'packaged Desktop changed ports across a normal restart')
  const restarted = JSON.parse(await readFile(manifestPath, 'utf8'))
  assert.deepEqual(restarted.dsh.profile.bundles, [...BUILTIN_BUNDLES, legacyCommunityPlugin])
  assert.equal(await readFile(homePatchPath, 'utf8'), migratedHomePatch)

  // Desktop 0.1.8 could leave this file empty after the legacy skin section
  // was the only content. Verify the packaged app repairs that exact upgrade
  // state even when the earlier migration is no longer detectable.
  await writeFile(homePatchPath, '')
  const repairedPort = await launchOnce()
  assert.equal(repairedPort, firstPort, 'packaged Desktop changed ports during profile repair')
  assert.equal(await readFile(homePatchPath, 'utf8'), '[]\n')
  console.log(`verified legacy false-positive repair, aggregate and schemastery migration, stable port ${firstPort}, selected-skin preservation, restart idempotency, and packaged blank-patch recovery`)
} finally {
  await rm(temporary, { recursive: true, force: true })
}
