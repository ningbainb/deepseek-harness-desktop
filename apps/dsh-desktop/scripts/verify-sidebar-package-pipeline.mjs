import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { composeEntries, evaluatePluginCompatibility, loadProfileDirectory } from '@deepseek-ai/dsh-app-boot'

const options = Object.fromEntries(Array.from({ length: (process.argv.length - 2) / 2 }, (_, index) => [process.argv[2 + index * 2], process.argv[3 + index * 2]]))
const archive = options['--archive'], metadataPath = options['--metadata'], output = options['--output']
for (const path of [archive, metadataPath, output]) assert.ok(typeof path === 'string' && isAbsolute(path), 'Pass absolute --archive, --metadata and new --output paths')
const patchPath = resolve(import.meta.dirname, '../../../patches/dsh-better-sidebar@0.24.1.patch')
const require = createRequire(import.meta.url)
const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
  assert.equal(result.status, 0, `${command}: ${result.error?.message ?? result.stderr}`)
  return result.stdout
}
const digest = value => createHash('sha256').update(value).digest('hex')
const metadata = JSON.parse(await readFile(metadataPath, 'utf8'))
assert.equal(metadata.name, 'dsh-better-sidebar')
assert.equal(metadata.version, '0.24.1')
const bytes = await readFile(archive)
assert.equal('sha512-' + createHash('sha512').update(bytes).digest('base64'), metadata.dist.integrity)
const names = run('tar', ['-tf', archive]).trim().split(/\r?\n/u)
assert.ok(names.every(name => name.startsWith('package/') && !name.includes('\\') && !name.split('/').includes('..')))
assert.ok(run('tar', ['-tvf', archive]).trim().split(/\r?\n/u).every(line => /^[-d]/u.test(line)), 'Reject archive links')
await mkdir(output) // Refuse reuse or overwrite of earlier evidence.
run('tar', ['-xf', archive, '-C', output])
const packageRoot = join(output, 'package')
const original = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
assert.equal(original.peerDependencies?.['@deepseek-ai/dsh-client-connection'], undefined)
assert.equal(original.devDependencies?.['@deepseek-ai/dsh-client-connection'], undefined)
const patchBytes = await readFile(patchPath)
run('git', ['apply', '--check', patchPath], packageRoot)
run('git', ['apply', patchPath], packageRoot)
const patched = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
assert.equal(patched.peerDependencies['@deepseek-ai/dsh-client-connection'], '^0.2.1-rc.2')
assert.equal(patched.devDependencies?.['@deepseek-ai/dsh-client-connection'], undefined)
for (const version of ['0.2.1-rc.2', '0.2.1-rc.3', '0.2.1-rc.4']) assert.equal(evaluatePluginCompatibility(patched, {}, version), undefined)
assert.equal(evaluatePluginCompatibility(patched, {}, '0.2.1-rc.1').exempted, false)
const profileDir = join(output, 'profile')
await mkdir(join(profileDir, 'node_modules'), { recursive: true })
await symlink(packageRoot, join(profileDir, 'node_modules', 'dsh-better-sidebar'), 'junction')
await writeFile(join(profileDir, 'package.json'), JSON.stringify({ name: 'archive-profile', private: true,
  dependencies: { 'dsh-better-sidebar': '0.24.1' }, dsh: { profile: { bundles: ['dsh-better-sidebar'] } },
}))
const profile = loadProfileDirectory('dsh', profileDir, join(profileDir, 'package.json'))
assert.deepEqual(profile.skippedBundles, [])
assert.ok(profile.layers.some(layer => layer.packageName === 'dsh-better-sidebar'))
assert.ok(composeEntries(profile.layers.flatMap(layer => layer.patches)).some(row => row.id === 'better-sidebar' && row.name === 'dsh-better-sidebar'))
const installed = JSON.parse(await readFile(require.resolve('dsh-better-sidebar/package.json'), 'utf8'))
const installedRoot = dirname(require.resolve('dsh-better-sidebar/package.json'))
const existingCodePreserved = []
for (const [, file] of patchBytes.toString().matchAll(/^diff --git a\/(.*?) b\//gmu)) {
  if (file === 'package.json') continue
  const previous = (await readFile(join(installedRoot, file), 'utf8')).replace(/\r\n/gu, '\n')
  const current = (await readFile(join(packageRoot, file), 'utf8')).replace(/\r\n/gu, '\n')
  assert.equal(current, previous, `Preserve existing code content in ${file}`)
  existingCodePreserved.push(file)
}
const result = { status: 'passed-archive-pipeline', packageRoot, archiveIntegrity: metadata.dist.integrity,
  patch: { bytes: patchBytes.length, sha256: digest(patchBytes) },
  originalConnection: { peer: original.peerDependencies?.['@deepseek-ai/dsh-client-connection'] ?? null, dev: original.devDependencies?.['@deepseek-ai/dsh-client-connection'] ?? null },
  installedConnection: { peer: installed.peerDependencies?.['@deepseek-ai/dsh-client-connection'] ?? null, dev: installed.devDependencies?.['@deepseek-ai/dsh-client-connection'] ?? null },
  patchedConnection: { peer: patched.peerDependencies['@deepseek-ai/dsh-client-connection'], dev: patched.devDependencies?.['@deepseek-ai/dsh-client-connection'] ?? null },
  layers: profile.layers.map(layer => layer.packageName), skippedBundles: profile.skippedBundles,
  existingCodePreserved, comparison: 'Code content compared after LF normalization; installed patch output has mixed line endings.',
  manifestSha256: { original: digest(JSON.stringify(original)), installed: digest(JSON.stringify(installed)), patched: digest(JSON.stringify(patched)) },
  boundary: 'Full verified upstream archive plus actual central patch; installed package and Electron acceptance remain separate.',
}
await writeFile(join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
