import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { assessPluginCompatibility, createHostCompatibility } from '../src/extensions/plugin-compatibility.mjs'
import { enforceCompatibilityAdmission, resolvePnpmCliPath, runPnpm } from '../src/extensions/plugins.mjs'
import { createRuntimeBaseline } from '../src/runtime-baseline.mjs'
import { validateProtectedRuntimeGraph } from '../src/runtime-graph-validator.mjs'
import { createRuntimePackagePolicy } from '../src/runtime-package-policy.mjs'

const SOURCE_FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'plugins')

function portable(path) {
  return path.replaceAll('\\', '/')
}

async function createIsolatedProfile(pluginDirectory) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-isolated-linker-'))
  const fixtures = join(root, 'fixtures')
  const profileDir = join(root, 'profile')
  await cp(SOURCE_FIXTURES, fixtures, { recursive: true })
  await mkdir(profileDir, { recursive: true })
  const protectedRoot = join(fixtures, 'protected-runtime')
  const pluginRoot = join(fixtures, pluginDirectory)
  const pluginManifest = JSON.parse(await readFile(join(pluginRoot, 'package.json'), 'utf8'))
  await writeFile(join(profileDir, 'package.json'), `${JSON.stringify({
    name: 'isolated-profile',
    private: true,
    dependencies: {
      'protected-runtime': `link:${portable(protectedRoot)}`,
      [pluginManifest.name]: `file:${portable(pluginRoot)}`,
    },
  }, null, 2)}\n`)
  await writeFile(join(profileDir, 'pnpm-workspace.yaml'), 'packages:\n  - .\n\nnodeLinker: isolated\nautoInstallPeers: false\n')
  await runPnpm({
    pnpmCli: resolvePnpmCliPath(),
    profileDir,
    executable: process.execPath,
    args: ['install', '--offline'],
    timeoutMs: 60_000,
  })
  const policy = createRuntimePackagePolicy({ desktopRuntime: ['protected-runtime'] })
  const baseline = await createRuntimeBaseline({
    desktopVersion: '3.5.0',
    runtimeVersion: '1.0.0',
    packageRoots: new Map([['protected-runtime', protectedRoot]]),
    policy,
  })
  return { root, profileDir, pluginManifest, policy, baseline }
}

test('real pnpm isolated linker keeps a compatible local plugin behind the protected Runtime link', async () => {
  const value = await createIsolatedProfile('good')
  try {
    const result = await validateProtectedRuntimeGraph(value)
    assert.equal(result.valid, true)
    assert.equal(result.protectedLinks[0].name, 'protected-runtime')
    const installed = JSON.parse(await readFile(
      join(value.profileDir, 'node_modules', '@fixtures', 'dsh-good-plugin', 'package.json'),
      'utf8',
    ))
    assert.equal(installed.name, '@fixtures/dsh-good-plugin')
  } finally {
    await rm(value.root, { recursive: true, force: true })
  }
})

test('real pnpm isolated linker exposes direct and transitive protected Runtime conflicts', async () => {
  for (const directory of ['direct-runtime-conflict', 'transitive-runtime-conflict']) {
    const value = await createIsolatedProfile(directory)
    try {
      await assert.rejects(
        validateProtectedRuntimeGraph(value),
        (error) => /^PROTECTED_.*CONFLICT$/u.test(error.code),
      )
    } finally {
      await rm(value.root, { recursive: true, force: true })
    }
  }
})

test('fixture compatibility admission covers compatible, unknown, and incompatible metadata', async () => {
  const host = createHostCompatibility({
    desktopVersion: '3.5.0',
    nodeVersion: process.versions.node,
    runtimeVersion: '0.1.5-rc.1',
    packages: { 'protected-runtime': '1.0.0' },
  })
  const readFixture = async (directory) => JSON.parse(await readFile(
    join(SOURCE_FIXTURES, directory, 'package.json'),
    'utf8',
  ))
  const good = assessPluginCompatibility(await readFixture('good'), host)
  const unknown = assessPluginCompatibility(await readFixture('unknown'), host)
  const incompatible = assessPluginCompatibility(await readFixture('incompatible'), host)
  assert.equal(enforceCompatibilityAdmission(good).status, 'compatible')
  assert.throws(() => enforceCompatibilityAdmission(unknown), { code: 'PLUGIN_COMPATIBILITY_CONFIRMATION_REQUIRED' })
  assert.equal(enforceCompatibilityAdmission(unknown, { allowUnknown: true }).status, 'unknown')
  assert.throws(() => enforceCompatibilityAdmission(incompatible, { allowUnknown: true }), { code: 'PLUGIN_INCOMPATIBLE' })
  assert.equal((await readFixture('invalid-bundle')).dsh, undefined)
})
