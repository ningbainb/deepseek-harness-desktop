import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse } from 'yaml'
import { defaultReleaseChannel } from '../src/release-manifest.mjs'

async function fileDigests(path) {
  const info = await lstat(path)
  assert.ok(info.isFile() && !info.isSymbolicLink() && info.size > 0, `${basename(path)}: archive must be a nonempty regular file`)
  const sha256 = createHash('sha256')
  const sha512 = createHash('sha512')
  for await (const chunk of createReadStream(path)) {
    sha256.update(chunk)
    sha512.update(chunk)
  }
  return { size: info.size, sha256: sha256.digest('hex'), sha512: sha512.digest('base64') }
}

/** Validate bytes and updater routing while distinguishing installer and internal ZIP. */
export async function verifyDistributionArtifacts({ directory, platform, version, channel = 'latest' }) {
  assert.ok(['darwin', 'linux'].includes(platform), 'distribution platform must be darwin or linux')
  assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u, 'distribution version must be exact SemVer')
  assert.ok(['latest', 'stable', 'beta'].includes(channel), 'distribution channel must be stable/latest or beta')
  const installer = platform === 'linux'
    ? `DeepSeek-Harness-Desktop-${version}-amd64.deb`
    : `DeepSeek-Harness-Desktop-${version}-arm64.dmg`
  const updaterFile = platform === 'linux' ? installer : `DeepSeek-Harness-Desktop-${version}-arm64.zip`
  const expected = new Set([installer, updaterFile])
  const candidates = (await readdir(directory)).filter(name => /^DeepSeek-Harness-Desktop-.*\.(?:deb|AppImage|dmg|zip)$/u.test(name))
  assert.deepEqual(candidates.toSorted(), [...expected].toSorted(), 'distribution must contain exactly one user installer and its required internal archive')
  if (platform === 'linux') {
    assert.equal((await readFile(join(directory, 'linux-unpacked', 'resources', 'package-type'), 'utf8')).trim(), 'deb', 'package-type must select DebUpdater')
  }
  const files = []
  for (const file of expected) {
    files.push({ file, role: file === installer ? 'user-installer' : 'internal-updater', ...await fileDigests(join(directory, file)) })
  }
  const metadataFile = `${channel === 'stable' ? 'latest' : channel}-${platform === 'linux' ? 'linux' : 'mac'}.yml`
  const metadata = parse(await readFile(join(directory, metadataFile), 'utf8'))
  assert.equal(metadata?.version, version, 'updater metadata version mismatch')
  assert.ok(Array.isArray(metadata.files) && metadata.files.length > 0, 'updater metadata files are required')
  const seen = new Set()
  for (const row of metadata.files) {
    assert.ok(expected.has(row.url), 'updater metadata contains an unexpected installer or archive')
    assert.ok(!seen.has(row.url), 'updater metadata contains duplicate archive')
    seen.add(row.url)
    const observed = files.find(file => file.file === row.url)
    assert.equal(row.sha512, observed.sha512, `${row.url}: updater checksum mismatch`)
    assert.equal(row.size, observed.size, `${row.url}: updater size mismatch`)
  }
  assert.ok(seen.has(updaterFile), 'updater metadata must contain the selected archive')
  assert.equal(metadata.path, updaterFile, 'updater update path must select the platform payload')
  assert.equal(metadata.sha512, files.find(file => file.file === updaterFile).sha512, 'legacy updater checksum mismatch')
  return { schemaVersion: 1, platform, arch: platform === 'linux' ? 'x64' : 'arm64', version, updaterFile, metadataFile, files }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const platform = process.argv[2]
  const appDirectory = resolve(import.meta.dirname, '..')
  const manifest = JSON.parse(await readFile(join(appDirectory, 'package.json'), 'utf8'))
  const directory = resolve(process.argv[3] ?? join(appDirectory, 'dist'))
  const channel = defaultReleaseChannel({ version: manifest.version, configuredChannel: process.env.DSH_DESKTOP_UPDATE_CHANNEL })
  const result = await verifyDistributionArtifacts({ directory, platform, version: manifest.version, channel: channel === 'beta' ? 'beta' : 'latest' })
  const receipt = platform === 'linux' ? 'distribution-artifacts-linux-x64.json' : 'distribution-artifacts-macos-arm64.json'
  await writeFile(join(directory, receipt), JSON.stringify({ ...result, sourceCommit: process.env.GITHUB_SHA ?? null }, null, 2) + '\n')
  console.log(`Verified one ${platform} user installer and matching updater payload at ${manifest.version}`)
}
