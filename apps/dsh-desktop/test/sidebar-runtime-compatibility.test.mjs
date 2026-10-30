import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { composeEntries, evaluatePluginCompatibility, loadProfileDirectory } from '@deepseek-ai/dsh-app-boot'

const require = createRequire(import.meta.url)
// Default: the actual installed package. The archive pipeline may supply its
// complete extracted + patched package; no manifest fields are synthesized.
const packageRoot = resolve(process.env.DSH_SIDEBAR_PACKAGE_ROOT || dirname(require.resolve('dsh-better-sidebar/package.json')))
const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
const connectionPeer = manifest.peerDependencies?.['@deepseek-ai/dsh-client-connection']
assert.equal(manifest.name, 'dsh-better-sidebar')
assert.equal(manifest.version, '0.24.1')

for (const version of ['0.2.1-rc.2', '0.2.1-rc.3', '0.2.1-rc.4']) {
  test(`the actual sidebar package passes the real SDK compatibility gate on ${version}`, () => {
    assert.equal(evaluatePluginCompatibility(manifest, {}, version), undefined)
  })
}

test('the actual package declares its Connection peer and retains the lower bound without exemptions', () => {
  assert.equal(connectionPeer, '^0.2.1-rc.2')
  assert.equal(manifest.devDependencies?.['@deepseek-ai/dsh-client-connection'], undefined)
  const issue = evaluatePluginCompatibility(manifest, {}, '0.2.1-rc.1')
  assert.equal(issue.exempted, false)
  assert.equal(issue.requirements['@deepseek-ai/dsh-client-connection'], connectionPeer)
})

test('the real rc4 profile loader retains the actual package bundle with no skipped bundles or exemptions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-sidebar-peer-'))
  try {
    const packageDir = join(directory, 'node_modules', 'dsh-better-sidebar')
    await mkdir(join(directory, 'node_modules'), { recursive: true })
    await symlink(packageRoot, packageDir, 'junction')
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'fixture-profile', private: true,
      dependencies: { 'dsh-better-sidebar': '0.24.1' }, dsh: { profile: { bundles: ['dsh-better-sidebar'] } },
    }))
    // Resolve the full linked package, never a copied or edited manifest.
    const profile = loadProfileDirectory('dsh', directory, join(directory, 'package.json'))
    assert.deepEqual(profile.skippedBundles, [], 'The bundle must reach Host composition without an exemption')
    assert.deepEqual(profile.layers.map(layer => layer.packageName), ['dsh-better-sidebar'])
    const entry = composeEntries(profile.layers.flatMap(layer => layer.patches)).find(entry => entry.id === 'better-sidebar')
    assert.equal(entry.name, 'dsh-better-sidebar')
    assert.match(entry.disabled.__jsExpr, /e\.options\.id !== 'better-sidebar'/u)
    assert.deepEqual(JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8')), manifest)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
