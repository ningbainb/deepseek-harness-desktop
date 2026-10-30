import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
test('installer-only reuse rejects a stale runtime even if filenames and version are unchanged', async t => {
  const { verifyInstallerReuseInputs } = await import('../scripts/installer-reuse-verification.mjs')
  const root = await mkdtemp(join(tmpdir(), 'dsh-reuse-source-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const resources = join(root, 'dist/win-unpacked/resources')
  await mkdir(join(root, 'src'), { recursive: true })
  await mkdir(join(resources, 'app.asar.unpacked/src'), { recursive: true })
  await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: {} }))
  await writeFile(join(root, 'src/main.mjs'), 'current-source')
  await writeFile(join(resources, 'app.asar.unpacked/src/main.mjs'), 'stale-source')
  await assert.rejects(verifyInstallerReuseInputs(root, resources), /source.*mismatch/iu)
  await writeFile(join(resources, 'app.asar.unpacked/src/main.mjs'), 'current-source')
  // Packaging intentionally prunes declarations and their now-empty directories.
  await mkdir(join(root, 'src/types'))
  await writeFile(join(root, 'src/types/main.d.ts'), 'declare const main: string')
  const result = await verifyInstallerReuseInputs(root, resources)
  assert.equal(result.checkedFiles, 1)
  await rm(join(root, 'src/main.mjs'))
  await assert.rejects(verifyInstallerReuseInputs(root, resources), /source.*(?:path|mismatch)/iu)
})

test('installer-only reuse rejects same-version bundle-patch and client-registration drift', async t => {
  const { verifyInstallerReuseInputs } = await import('../scripts/installer-reuse-verification.mjs')
  const root = await mkdtemp(join(tmpdir(), 'dsh-reuse-metadata-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const resources = join(root, 'dist/win-unpacked/resources')
  const source = join(root, 'node_modules/@local/fixture-plugin')
  const target = join(resources, 'app.asar.unpacked/node_modules/@local/fixture-plugin')
  for (const p of [join(root, 'src'), join(resources, 'app.asar.unpacked/src'), join(source, 'lib'), join(target, 'lib')]) await mkdir(p, { recursive: true })
  const manifest = { name: '@local/fixture-plugin', version: '1.0.0', main: 'lib/index.js', type: 'module',
    bin: { fixture: 'bin/cli.js' },
    exports: { '.': './lib/index.js', './presets/*': './presets/*' },
    dsh: { bundle: { patch: './cordis.patch.yml' }, client: { entry: './lib/index.js' } } }
  await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: { '@local/fixture-plugin': 'workspace:*' } }))
  for (const p of [source, target]) {
    await writeFile(join(p, 'package.json'), JSON.stringify(manifest))
    await writeFile(join(p, 'lib/index.js'), 'export const entry = 1')
    await writeFile(join(p, 'lib/alternate.js'), 'export const entry = 2')
    await writeFile(join(p, 'cordis.patch.yml'), 'plugins: {}')
    await mkdir(join(p, 'presets'))
    await writeFile(join(p, 'presets/default.yml'), 'mode: normal')
    await mkdir(join(p, 'bin'))
    await writeFile(join(p, 'bin/cli.js'), 'console.log("fixture")')
  }
  await verifyInstallerReuseInputs(root, resources)
  await writeFile(join(source, 'cordis.patch.yml'), 'plugins: { changed: true }')
  await assert.rejects(verifyInstallerReuseInputs(root, resources), /asset.*mismatch/iu)
  await writeFile(join(source, 'cordis.patch.yml'), 'plugins: {}')
  await writeFile(join(source, 'bin/cli.js'), 'console.log("changed")')
  await assert.rejects(verifyInstallerReuseInputs(root, resources), /asset.*mismatch/iu)
  await writeFile(join(source, 'bin/cli.js'), 'console.log("fixture")')
  manifest.dsh.client.entry = './lib/new-client.js'
  await writeFile(join(source, 'package.json'), JSON.stringify(manifest))
  await assert.rejects(verifyInstallerReuseInputs(root, resources), /manifest.*mismatch/iu)
  manifest.dsh.client.entry = './lib/index.js'
  manifest.exports['.'] = { import: './lib/index.js', default: './lib/alternate.js' }
  for (const p of [source, target]) await writeFile(join(p, 'package.json'), JSON.stringify(manifest))
  await verifyInstallerReuseInputs(root, resources)
  manifest.exports['.'] = { default: './lib/alternate.js', import: './lib/index.js' }
  await writeFile(join(source, 'package.json'), JSON.stringify(manifest))
  await assert.rejects(verifyInstallerReuseInputs(root, resources), /manifest.*mismatch/iu)
})
