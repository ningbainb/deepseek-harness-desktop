import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { composeEntries, loadProfileDirectory } from '@deepseek-ai/dsh-app-boot'
import { ensureDesktopProfile } from '../src/profile.mjs'

// Actual installed dependencies and the complete generated Desktop bundle stack.
// No manifest rewriting, copied peer fields, or compatibility exemptions.
const require = createRequire(import.meta.url)
const home = await mkdtemp(join(tmpdir(), 'dsh-sidebar-installed-profile-'))
await ensureDesktopProfile({ dshHome: home })
const profileDir = join(home, 'profiles', 'desktop')
const installAnchor = require.resolve('@deepseek-ai/dsh/package.json')
const profile = loadProfileDirectory('dsh', profileDir, installAnchor)
const entries = composeEntries(profile.layers.flatMap(layer => layer.patches))
const installedManifestPath = require.resolve('dsh-better-sidebar/package.json')
const installedManifest = JSON.parse(await readFile(installedManifestPath, 'utf8'))
const report = { home, profileDir, installAnchor, installedManifestPath,
  connectionPeer: installedManifest.peerDependencies?.['@deepseek-ai/dsh-client-connection'] ?? null,
  layers: profile.layers.map(layer => layer.packageName), skippedBundles: profile.skippedBundles,
  sidebarEntries: entries.filter(entry => entry.name === 'dsh-better-sidebar'),
}
await writeFile(join(home, 'result.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
assert.deepEqual(profile.skippedBundles, [], 'Every declared Desktop bundle must enter the actual installed profile compilation')
assert.ok(profile.layers.some(layer => layer.packageName === 'dsh-better-sidebar'))
assert.equal(report.sidebarEntries.length, 1, 'Retain exactly one actual sidebar mount')
