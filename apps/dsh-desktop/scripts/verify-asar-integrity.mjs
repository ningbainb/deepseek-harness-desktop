import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'

// Use the same ASAR implementation as the installed desktop packager.
const require = createRequire(import.meta.url)
const builderRequire = createRequire(require.resolve('electron-builder/package.json'))
const asar = builderRequire('@electron/asar')

export function verifyAsarIntegrity(archivePath) {
  asar.uncache(archivePath)
  let verified = 0
  for (const archiveEntry of asar.listPackage(archivePath)) {
    const name = archiveEntry.replace(/^[/\\]/u, '')
    const entry = asar.statFile(archivePath, name)
    if (entry.files || entry.link || entry.unpacked) continue
    if (entry.integrity?.algorithm !== 'SHA256') {
      throw new Error(`ASAR entry lacks SHA256 integrity: ${name}`)
    }
    const contents = asar.extractFile(archivePath, name)
    const hash = createHash('sha256').update(contents).digest('hex')
    if (contents.length !== entry.size || hash !== entry.integrity.hash) {
      throw new Error(`ASAR entry integrity mismatch: ${name}`)
    }
    verified += 1
  }
  if (verified === 0) throw new Error('ASAR contains no packed files to verify')
  return verified
}
