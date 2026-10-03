import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { prepareSourceSkins } from '../scripts/prepare-source-skins.mjs'
import { BUILTIN_SKIN_IDS } from '../src/profile.mjs'

test('clean source dependencies receive the same verified offline skins as packaged builds', async context => {
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-source-skins-'))
  context.after(() => rm(temporary, { recursive: true, force: true }))
  const nodeModulesRoot = join(temporary, 'node_modules')
  const packageRoot = join(nodeModulesRoot, '@linxin666', 'dsh-client-ui-skin-center')
  const skinRoot = join(packageRoot, 'skins')
  await mkdir(join(skinRoot, 'blue-fantasy'), { recursive: true })
  await writeFile(join(skinRoot, 'blue-fantasy', 'preserved.txt'), 'existing shipped skin')
  await writeFile(join(packageRoot, 'package.json'), JSON.stringify({
    name: '@linxin666/dsh-client-ui-skin-center', version: '0.4.4', files: ['lib', 'skins/blue-fantasy'],
  }))
  const officialRoot = join(nodeModulesRoot, '@deepseek-ai', 'dsh')
  await mkdir(officialRoot, { recursive: true })
  await writeFile(join(officialRoot, 'preserved.txt'), 'official runtime untouched')
  const restored = await prepareSourceSkins(nodeModulesRoot)
  assert.deepEqual(restored, BUILTIN_SKIN_IDS.filter(id => id !== 'blue-fantasy').toSorted())
  assert.deepEqual((await readdir(skinRoot)).toSorted(), [...BUILTIN_SKIN_IDS].toSorted())
  const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
  for (const id of BUILTIN_SKIN_IDS) assert.ok(manifest.files.includes(`skins/${id}`))
  assert.deepEqual(await prepareSourceSkins(nodeModulesRoot), [])
  assert.equal(await readFile(join(skinRoot, 'blue-fantasy', 'preserved.txt'), 'utf8'), 'existing shipped skin')
  assert.equal(await readFile(join(officialRoot, 'preserved.txt'), 'utf8'), 'official runtime untouched')
})
