import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import afterPack from './after-pack.cjs'

const appDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export async function canonicalizeSourceSkinAssets({
  assetsRoot = join(appDirectory, 'build', 'skin-center-v2-assets'),
  manifestPath = join(appDirectory, 'build', 'skin-center-v2-assets.sha256.json'),
} = {}) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (!Array.isArray(manifest.files)) throw new Error('bundled Skin Center asset manifest is invalid')
  const pending = []
  const digest = bytes => createHash('sha256').update(bytes).digest('hex')
  for (const entry of manifest.files) {
    if (typeof entry.path !== 'string' || typeof entry.sha256 !== 'string'
      || !/^[a-z0-9-]+\/.+/u.test(entry.path) || entry.path.includes('..') || entry.path.includes('\\')) {
      throw new Error('bundled Skin Center asset path is invalid')
    }
    const path = resolve(assetsRoot, entry.path)
    const difference = relative(assetsRoot, path)
    if (difference.startsWith('..') || isAbsolute(difference)) throw new Error('bundled Skin Center asset escapes source root')
    const bytes = await readFile(path)
    if (digest(bytes) === entry.sha256) continue
    const text = bytes.toString('utf8')
    if (!Buffer.from(text).equals(bytes)) throw new Error(`bundled Skin Center asset hash mismatch: ${entry.path}`)
    const normalized = text.replaceAll('\r\n', '\n')
    const candidates = [normalized, normalized.replace(/\n$/u, '')].map(value => Buffer.from(value))
    const canonical = candidates.find(candidate => digest(candidate) === entry.sha256)
    if (!canonical) throw new Error(`bundled Skin Center asset hash mismatch: ${entry.path}`)
    pending.push({ path, canonical })
  }
  for (const { path, canonical } of pending) await writeFile(path, canonical)
  return pending.length
}

export async function prepareSourceSkins(nodeModulesRoot = join(appDirectory, 'node_modules')) {
  await canonicalizeSourceSkinAssets()
  return afterPack.restoreAllBundledSkinAssets(nodeModulesRoot)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const restored = await prepareSourceSkins()
  console.log(`Verified source Skin Center assets: restored ${restored.length} offline skins`)
}
