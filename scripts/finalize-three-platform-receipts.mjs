import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

const digest = bytes => createHash('sha256').update(bytes).digest('hex')

export async function finalizeThreePlatformReceipts(directory, version) {
  const manifestPath = join(directory, 'release-manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  assert.equal(manifest.version, version)
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.channel, 'stable')
  assert.ok(Array.isArray(manifest.files) && manifest.files.length > 0)
  const sums = manifest.files.filter(entry => entry.file === 'SHA256SUMS.txt')
  assert.equal(sums.length, 1)
  const seen = new Set()
  for (const entry of manifest.files) {
    assert.ok(typeof entry.file === 'string' && basename(entry.file) === entry.file && !entry.file.includes('\\') && !['.', '..'].includes(entry.file))
    assert.equal(seen.has(entry.file), false)
    seen.add(entry.file)
    const bytes = await readFile(join(directory, entry.file === 'SHA256SUMS.txt' ? 'SHA256SUMS-windows.txt' : entry.file))
    assert.equal(bytes.length, entry.size, `${entry.file}: native receipt size mismatch`)
    assert.equal(digest(bytes), entry.sha256, `${entry.file}: native receipt checksum mismatch`)
  }
  const checksum = await readFile(join(directory, 'SHA256SUMS.txt'))
  const required = [
    `DeepSeek-Harness-Desktop-Setup-${version}-x64.exe`,
    `DeepSeek-Harness-Desktop-${version}-arm64.dmg`,
    `DeepSeek-Harness-Desktop-${version}-arm64.zip`,
    `DeepSeek-Harness-Desktop-${version}-x86_64.AppImage`,
    `DeepSeek-Harness-Desktop-${version}-amd64.deb`,
  ]
  const rows = checksum.toString('utf8').trimEnd().split(/\r?\n/u)
  assert.equal(rows.length, required.length)
  for (const file of required) {
    const bytes = await readFile(join(directory, file))
    assert.equal(rows.filter(row => row === `${digest(bytes)}  ${file}`).length, 1, `${file}: combined receipt mismatch`)
  }
  sums[0].size = checksum.length
  sums[0].sha256 = digest(checksum)
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  return manifest
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  await finalizeThreePlatformReceipts(resolve(process.argv[2]), process.argv[3])
  console.log('Verified native receipts and reconciled the public Windows manifest with combined checksums')
}
