import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import afterPack from './after-pack.cjs'

const appDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export async function prepareSourceSkins(nodeModulesRoot = join(appDirectory, 'node_modules')) {
  return afterPack.restoreAllBundledSkinAssets(nodeModulesRoot)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const restored = await prepareSourceSkins()
  console.log(`Verified source Skin Center assets: restored ${restored.length} offline skins`)
}
