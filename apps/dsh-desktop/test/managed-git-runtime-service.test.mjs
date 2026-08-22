import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import test from 'node:test'

import { strToU8, zipSync } from 'fflate'

import {
  installManagedGitArchive,
  managedGitPaths,
  normalizeManagedGitManifest,
  selectManagedGitRelease,
} from '../src/managed-git.mjs'
import { MANAGED_GIT_MANIFEST } from '../src/managed-git-manifest.mjs'
import {
  createManagedGitRuntimeService,
  downloadManagedGitArchive,
  prependManagedGitPathEntry,
} from '../src/managed-git-runtime-service.mjs'

const VERSION = '2.50.1.windows.1'
const GIT_EXECUTABLE = Buffer.from('fixture-git-executable')

function digest(value) {
  return createHash('sha256').update(value).digest('hex')
}

function markDosDirectoryEntries(archive) {
  let offset = 0
  while (offset + 46 <= archive.byteLength) {
    if (archive.readUInt32LE(offset) !== 0x02014b50) {
      offset += 1
      continue
    }
    const nameLength = archive.readUInt16LE(offset + 28)
    const extraLength = archive.readUInt16LE(offset + 30)
    const commentLength = archive.readUInt16LE(offset + 32)
    const nameStart = offset + 46
    const name = archive.subarray(nameStart, nameStart + nameLength).toString('utf8')
    if (name.endsWith('/')) {
      archive.writeUInt32LE(archive.readUInt32LE(offset + 38) | 0x10, offset + 38)
    }
    offset = nameStart + nameLength + extraLength + commentLength
  }
  return archive
}

function rootArchive() {
  return markDosDirectoryEntries(Buffer.from(zipSync({
    'cmd/git.exe': GIT_EXECUTABLE,
    'etc/': new Uint8Array(),
    'etc/gitconfig': strToU8('fixture configuration'),
    'usr/': new Uint8Array(),
    'usr/share/doc.txt': strToU8('fixture documentation'),
  }, { level: 0 })))
}

function releaseFor(archive) {
  return {
    id: 'mingit-fixture-2.50.1-windows.1-x64',
    platform: 'win32',
    arch: 'x64',
    version: VERSION,
    archive: {
      format: 'zip',
      url: 'https://github.com/git-for-windows/git/releases/download/v2.50.1.windows.1/MinGit-fixture-64-bit.zip',
      sha256: digest(archive),
      bytes: archive.byteLength,
      rootDirectory: '.',
    },
    git: {
      executablePath: 'cmd/git.exe',
      sha256: digest(GIT_EXECUTABLE),
      bytes: GIT_EXECUTABLE.byteLength,
    },
  }
}

function manifestFor(archive) {
  return { schemaVersion: 1, releases: [releaseFor(archive)] }
}

function successfulGitSpawn(version = VERSION, calls = []) {
  return (executable, args, options) => {
    calls.push({ executable, args, options })
    const child = new EventEmitter()
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.kill = () => {
      queueMicrotask(() => child.emit('close', null, 'SIGTERM'))
      return true
    }
    queueMicrotask(() => {
      child.stdout.write(`git version ${version}\n`)
      child.stdout.end()
      child.stderr.end()
      child.emit('close', 0, null)
    })
    return child
  }
}

test('bundled managed Git manifest is static, official, and complete for x64 and arm64', () => {
  const manifest = normalizeManagedGitManifest(MANAGED_GIT_MANIFEST)
  assert.equal(Object.isFrozen(manifest), true)
  assert.equal(manifest.releases.length, 2)
  for (const release of manifest.releases) {
    assert.match(release.archive.url, /^https:\/\/github\.com\/git-for-windows\/git\/releases\/download\/v2\.55\.0\.windows\.5\/MinGit-2\.55\.0\.5-(?:64-bit|arm64)\.zip$/u)
    assert.equal(release.archive.rootDirectory, '.')
    assert.equal(release.git.executablePath, 'cmd/git.exe')
    assert.match(release.archive.sha256, /^[a-f0-9]{64}$/u)
    assert.match(release.git.sha256, /^[a-f0-9]{64}$/u)
  }
  assert.equal(selectManagedGitRelease(manifest, { platform: 'win32', arch: 'x64' }).archive.sha256, '56d7b226b7693196cfc71fef26568f536c4a021ab6c37ff2db4287bed908e96e')
  assert.equal(selectManagedGitRelease(manifest, { platform: 'win32', arch: 'arm64' }).archive.sha256, '05843f9d6e60306c3ab886799e2c67200caab921571f10512df3493049179ddb')
})

test('packaged bundled Git is verified and preferred without probing or changing the system Git', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-bundled-git-runtime-'))
  try {
    const bundledGitDirectory = join(root, 'resources')
    const bundledExecutable = join(bundledGitDirectory, 'managed-git', 'current', 'cmd', 'git.exe')
    let systemProbeCalls = 0
    let confirmationCalls = 0
    const service = createManagedGitRuntimeService({
      userDataDirectory: join(root, 'user-data'),
      bundledGitDirectory,
      temporaryDirectory: root,
      manifest: manifestFor(rootArchive()),
      platform: 'win32',
      arch: 'x64',
      confirm: async () => {
        confirmationCalls += 1
        return true
      },
      probeSystemGitFn: async () => {
        systemProbeCalls += 1
        return { available: true, version: VERSION }
      },
      verifyManagedGitInstallFn: async ({ userDataDirectory }) => {
        assert.equal(userDataDirectory, bundledGitDirectory)
        return { executablePath: bundledExecutable, version: VERSION }
      },
    })
    const result = await service.inspect(['C:\\runtime-bin'])
    assert.equal(result.status, 'bundled-git-available')
    assert.equal(result.source, 'bundled')
    assert.equal(result.executablePath, bundledExecutable)
    assert.deepEqual(result.pathEntries, [join(bundledGitDirectory, 'managed-git', 'current', 'cmd'), 'C:\\runtime-bin'])
    assert.equal(systemProbeCalls, 0)
    assert.equal(confirmationCalls, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('pinned archive downloader streams only the reviewed URL and rejects an unapproved redirect', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-managed-git-download-'))
  try {
    const archive = rootArchive()
    const release = releaseFor(archive)
    const calls = []
    const downloaded = await downloadManagedGitArchive({
      release,
      destinationDirectory: root,
      fetchImpl: async (url, options) => {
        calls.push({ url, options })
        return new Response(archive, {
          status: 200,
          headers: { 'content-length': String(archive.byteLength), 'content-encoding': 'identity' },
        })
      },
    })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, release.archive.url)
    assert.equal(calls[0].options.redirect, 'manual')
    assert.equal(calls[0].options.credentials, 'omit')
    assert.equal((await readFile(downloaded.archivePath)).equals(archive), true)

    await assert.rejects(
      downloadManagedGitArchive({
        release,
        destinationDirectory: join(root, 'bad-redirect'),
        fetchImpl: async () => new Response(null, {
          status: 302,
          headers: { location: 'https://example.invalid/replacement.zip' },
        }),
      }),
      (error) => error?.code === 'MANAGED_GIT_DOWNLOAD_REDIRECT_INVALID',
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('cancelled managed Git repair does not mutate user data, global PATH, or system configuration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-managed-git-cancel-'))
  try {
    const userDataDirectory = join(root, 'user-data')
    const temporaryDirectory = join(root, 'temporary')
    await mkdir(temporaryDirectory)
    let confirmationCalls = 0
    let downloadCalls = 0
    let installCalls = 0
    const pathBefore = process.env.PATH
    const service = createManagedGitRuntimeService({
      userDataDirectory,
      temporaryDirectory,
      manifest: manifestFor(rootArchive()),
      platform: 'win32',
      arch: 'x64',
      confirm: async () => {
        confirmationCalls += 1
        return false
      },
      probeSystemGitFn: async () => ({ available: false, reason: 'not-found' }),
      verifyManagedGitInstallFn: async () => { throw new Error('no managed install') },
      downloadManagedGitArchiveFn: async () => {
        downloadCalls += 1
        throw new Error('must not download after cancellation')
      },
      installManagedGitArchiveFn: async () => {
        installCalls += 1
        throw new Error('must not install after cancellation')
      },
    })
    const result = await service.repair(['C:\\runtime-bin'])
    assert.equal(result.status, 'managed-git-cancelled')
    assert.deepEqual(result.pathEntries, ['C:\\runtime-bin'])
    assert.equal(confirmationCalls, 1)
    assert.equal(downloadCalls, 0)
    assert.equal(installCalls, 0)
    assert.equal(process.env.PATH, pathBefore)
    await assert.rejects(stat(userDataDirectory), /ENOENT/u)
    assert.deepEqual(await readdir(temporaryDirectory), [])
    const source = await readFile(new URL('../src/managed-git-runtime-service.mjs', import.meta.url), 'utf8')
    assert.doesNotMatch(source, /process\.env\.(?:PATH|Path)\s*=/u)
    assert.doesNotMatch(source, /\b(?:setx|reg(?:\.exe)?)\b/iu)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('managed Git repair rejects a bad downloaded hash without replacing a prior directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-managed-git-hash-rollback-'))
  try {
    const archive = rootArchive()
    const userDataDirectory = join(root, 'user-data')
    const temporaryDirectory = join(root, 'temporary')
    const paths = managedGitPaths(userDataDirectory)
    await mkdir(temporaryDirectory)
    await mkdir(paths.installDirectory, { recursive: true })
    await writeFile(join(paths.installDirectory, 'legacy.txt'), 'preserve this install')
    let installCalls = 0
    const service = createManagedGitRuntimeService({
      userDataDirectory,
      temporaryDirectory,
      manifest: manifestFor(archive),
      platform: 'win32',
      arch: 'x64',
      confirm: async () => true,
      probeSystemGitFn: async () => ({ available: false, reason: 'not-found' }),
      verifyManagedGitInstallFn: async () => { throw new Error('legacy directory is not a verified install') },
      downloadManagedGitArchiveFn: async ({ destinationDirectory }) => {
        const archivePath = join(destinationDirectory, 'archive.zip')
        await writeFile(archivePath, Buffer.alloc(archive.byteLength, 0x74))
        return { archivePath }
      },
      installManagedGitArchiveFn: async () => {
        installCalls += 1
        throw new Error('installer must not see a hash-failed archive')
      },
    })
    await assert.rejects(
      service.repair(),
      (error) => error?.code === 'MANAGED_GIT_ARCHIVE_HASH_MISMATCH',
    )
    assert.equal(installCalls, 0)
    assert.equal(await readFile(join(paths.installDirectory, 'legacy.txt'), 'utf8'), 'preserve this install')
    assert.deepEqual(await readdir(temporaryDirectory), [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('managed Git repair atomically installs a verified root ZIP and puts its cmd directory first for Runtime', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-managed-git-repair-'))
  try {
    const archive = rootArchive()
    const userDataDirectory = join(root, 'user-data')
    const temporaryDirectory = join(root, 'temporary')
    const paths = managedGitPaths(userDataDirectory)
    await mkdir(temporaryDirectory)
    const calls = []
    const service = createManagedGitRuntimeService({
      userDataDirectory,
      temporaryDirectory,
      manifest: manifestFor(archive),
      platform: 'win32',
      arch: 'x64',
      confirm: async ({ releaseId, version, archiveBytes }) => {
        assert.equal(releaseId, 'mingit-fixture-2.50.1-windows.1-x64')
        assert.equal(version, VERSION)
        assert.equal(archiveBytes, archive.byteLength)
        return true
      },
      probeSystemGitFn: async () => ({ available: false, reason: 'not-found' }),
      downloadManagedGitArchiveFn: async ({ destinationDirectory }) => {
        const archivePath = join(destinationDirectory, 'archive.zip')
        await writeFile(archivePath, archive)
        return { archivePath }
      },
      spawn: successfulGitSpawn(VERSION, calls),
      timeoutMs: 50,
      now: () => new Date('2026-08-21T00:00:00.000Z'),
    })
    const result = await service.repair(['C:\\runtime-bin', join(paths.installDirectory, 'CMD')])
    assert.equal(result.status, 'managed-git-installed')
    assert.equal(result.executablePath, join(paths.installDirectory, 'cmd', 'git.exe'))
    assert.deepEqual(result.pathEntries, [join(paths.installDirectory, 'cmd'), 'C:\\runtime-bin'])
    assert.equal((await readFile(result.executablePath)).equals(GIT_EXECUTABLE), true)
    const inspected = await service.inspect(['C:\\runtime-bin'])
    assert.equal(inspected.status, 'managed-git-available')
    assert.deepEqual(inspected.pathEntries, [join(paths.installDirectory, 'cmd'), 'C:\\runtime-bin'])
    assert.equal(calls.length, 2)
    assert.equal(calls[0].options.shell, false)
    assert.equal((await stat(result.executablePath)).isFile(), true)
    assert.deepEqual(await readdir(temporaryDirectory), [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('system Git bypasses confirmation, download, and managed PATH injection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-managed-git-system-'))
  try {
    let confirmationCalls = 0
    let verifyCalls = 0
    const service = createManagedGitRuntimeService({
      userDataDirectory: join(root, 'user-data'),
      temporaryDirectory: root,
      manifest: manifestFor(rootArchive()),
      platform: 'win32',
      arch: 'x64',
      confirm: async () => {
        confirmationCalls += 1
        return true
      },
      probeSystemGitFn: async () => ({ available: true, version: VERSION }),
      verifyManagedGitInstallFn: async () => {
        verifyCalls += 1
        throw new Error('must not inspect managed Git while system Git works')
      },
      downloadManagedGitArchiveFn: async () => { throw new Error('must not download') },
      installManagedGitArchiveFn: async () => { throw new Error('must not install') },
    })
    const result = await service.repair(['C:\\runtime-bin'])
    assert.equal(result.status, 'system-git-available')
    assert.equal(result.source, 'system')
    assert.deepEqual(result.pathEntries, ['C:\\runtime-bin'])
    assert.equal(confirmationCalls, 0)
    assert.equal(verifyCalls, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('managed Git PATH helper is immutable, priority-first, and Windows-case-insensitive', () => {
  const existing = ['C:\\runtime-bin', 'C:\\Users\\Alice\\AppData\\Local\\DSH\\managed-git\\current\\CMD', 'D:\\tools']
  const result = prependManagedGitPathEntry('C:\\Users\\Alice\\AppData\\Local\\DSH\\managed-git\\current\\cmd\\git.exe', existing)
  assert.deepEqual(result, [
    'C:\\Users\\Alice\\AppData\\Local\\DSH\\managed-git\\current\\cmd',
    'C:\\runtime-bin',
    'D:\\tools',
  ])
  assert.deepEqual(existing, ['C:\\runtime-bin', 'C:\\Users\\Alice\\AppData\\Local\\DSH\\managed-git\\current\\CMD', 'D:\\tools'])
  assert.equal(Object.isFrozen(result), true)
})
