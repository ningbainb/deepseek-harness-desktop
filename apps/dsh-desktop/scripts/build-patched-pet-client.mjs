import assert from 'node:assert/strict'
import { readFile, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { clientBundle } from '../../../shared/tsdown.client.ts'
import { typecheckPetClient } from './typecheck-pet-client.mjs'

// Rebuild only our published pet client inside a pnpm patch editing directory.
// Keep the newer multi-pet host, assets and renderers; never replace it with the
// older workspace package or mutate installed/official SDK files in place.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
assert.ok(process.argv[2], 'Pass the pnpm pet patch editing directory')
const target = await realpath(resolve(process.argv[2]))
const within = relative(root, target)
assert.ok(within && !isAbsolute(within) && !within.startsWith('..') && !within.split(sep).includes('node_modules'), 'Patch directory must be inside this repository, outside node_modules')
const manifest = JSON.parse(await readFile(resolve(target, 'package.json'), 'utf8'))
assert.equal(manifest.name, '@linxin666/dsh-pet')
assert.equal(manifest.version, '0.2.5')
assert.equal(await readFile(resolve(target, 'src/client/poll-request.ts'), 'utf8'),
  await readFile(resolve(root, 'packages/dsh-pet/src/client/poll-request.ts'), 'utf8'), 'Keep the tested polling implementation identical')
typecheckPetClient(target)
const localRequire = createRequire(resolve(root, 'packages/dsh-pet/package.json'))
const installedRequire = createRequire(createRequire(resolve(root, 'apps/dsh-desktop/package.json')).resolve('@linxin666/dsh-pet/package.json'))
const { build } = await import(pathToFileURL(localRequire.resolve('tsdown')).href)
process.chdir(target)
const config = clientBundle(manifest.name, [], { clientOnlyBundle: ['clsx'] })({}).find(entry => entry.name === `${manifest.name}/client`)
assert.ok(config)
await build({ ...config, config: false, plugins: [...config.plugins, {
  name: 'patched-pet-dependency-resolution',
  resolveId(id) { if (id === 'clsx') return installedRequire.resolve(id) },
}] })
