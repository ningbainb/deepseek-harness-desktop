import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { copyFile, mkdtemp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { PassThrough } from 'node:stream'
import { tmpdir } from 'node:os'
import test from 'node:test'

import { strToU8, zipSync } from 'fflate'

import {
  MANAGED_GIT_ARCHIVE_LIMITS,
  createManagedGitInstallState,
  inspectManagedGitZip,
  installManagedGitArchive,
  managedGitPaths,
  normalizeManagedGitDownloadUrl,
  normalizeManagedGitInstallState,
  normalizeManagedGitManifest,
  probeSystemGit,
  readManagedGitInstallState,
  selectManagedGitRelease,
  verifyManagedGitArchive,
  verifyManagedGitInstall,
} from '../src/managed-git.mjs'

const VERSION = '2.50.1.windows.1'
const GIT_EXECUTABLE = Buffer.from('not-a-real-executable')

function digest(value) {
  return createHash('sha256').update(value).digest('hex')
}

function portableGitZip(files = {}) {
  return Buffer.from(zipSync({
    'PortableGit/cmd/git.exe': GIT_EXECUTABLE,
    'PortableGit/mingw64/share/doc.txt': strToU8('portable git fixture'),
    ...files,
  }, { level: 0 }))
}

function releaseFor(archive, overrides = {}) {
  return {
    id: 'portable-git-2.50.1-windows-1-x64',
    platform: 'win32',
    arch: 'x64',
    version: VERSION,
    archive: {
      format: 'zip',
      url: 'https://github.com/git-for-windows/git/releases/download/v2.50.1.windows.1/portable-git.zip',
      sha256: digest(archive),
      bytes: archive.byteLength,
      rootDirectory: 'PortableGit',
    },
    git: {
      executablePath: 'cmd/git.exe',
      sha256: digest(GIT_EXECUTABLE),
      bytes: GIT_EXECUTABLE.byteLength,
    },
    ...overrides,
  }
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

function centralDirectoryOffset(buffer) {
  for (let offset = 0; offset <= buffer.length - 4; offset += 1) {
    if (buffer.readUInt32LE(offset) === 0x02014b50) return offset
  }
  throw new Error('fixture has no ZIP central directory')
}

test('managed Git manifest accepts only fully pinned HTTPS ZIP releases', () => {
  const archive = portableGitZip()
  const manifest = normalizeManagedGitManifest({
    schemaVersion: 1,
    releases: [releaseFor(archive)],
  })

  assert.equal(Object.isFrozen(manifest), true)
  assert.equal(manifest.releases[0].archive.url, 'https://github.com/git-for-windows/git/releases/download/v2.50.1.windows.1/portable-git.zip')
  assert.equal(selectManagedGitRelease(manifest, { platform: 'win32', arch: 'x64' }).id, 'portable-git-2.50.1-windows-1-x64')
  assert.equal(selectManagedGitRelease(manifest, { platform: 'linux', arch: 'x64' }), null)

  assert.throws(
    () => normalizeManagedGitManifest({ schemaVersion: 1, releases: [{ ...releaseFor(archive), note: 'not executable evidence' }] }),
    /unsupported or missing fields/u,
  )
  assert.throws(
    () => normalizeManagedGitManifest({
      schemaVersion: 1,
      releases: [releaseFor(archive, { archive: { ...releaseFor(archive).archive, sha256: 'A'.repeat(64) } })],
    }),
    /lowercase SHA-256/u,
  )
  assert.throws(
    () => normalizeManagedGitDownloadUrl('http://github.com/git-for-windows/git/releases/download/v2/a.zip'),
    /credential-free HTTPS/u,
  )
  assert.throws(
    () => normalizeManagedGitDownloadUrl('https://user:pass@github.com/git-for-windows/git/releases/download/v2/a.zip'),
    /credential-free HTTPS/u,
  )
  assert.throws(
    () => normalizeManagedGitDownloadUrl('https://example.test/a.zip'),
    /host or query/u,
  )
  assert.throws(
    () => normalizeManagedGitDownloadUrl('https://github.com/git-for-windows/%2e%2e/a.zip'),
    /path is invalid/u,
  )
})

test('system Git probe uses direct bounded spawn and classifies absence and timeout', async () => {
  const calls = []
  const available = await probeSystemGit({ spawn: successfulGitSpawn(VERSION, calls), timeoutMs: 50 })
  assert.deepEqual(available, { available: true, version: VERSION })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].executable, 'git')
  assert.deepEqual(calls[0].args, ['--version'])
  assert.equal(calls[0].options.shell, false)
  assert.equal(calls[0].options.windowsHide, true)
  assert.deepEqual(calls[0].options.stdio, ['ignore', 'pipe', 'pipe'])

  const missing = await probeSystemGit({
    spawn: () => {
      const child = new EventEmitter()
      child.stdout = new PassThrough()
      child.stderr = new PassThrough()
      child.kill = () => true
      queueMicrotask(() => {
        const error = new Error('not found')
        error.code = 'ENOENT'
        child.emit('error', error)
      })
      return child
    },
    timeoutMs: 50,
  })
  assert.deepEqual(missing, { available: false, reason: 'not-found' })

  let killed = false
  const timedOut = await probeSystemGit({
    spawn: () => {
      const child = new EventEmitter()
      child.stdout = new PassThrough()
      child.stderr = new PassThrough()
      child.kill = () => {
        killed = true
        queueMicrotask(() => child.emit('close', null, 'SIGTERM'))
        return true
      }
      return child
    },
    timeoutMs: 25,
  })
  assert.equal(killed, true)
  assert.deepEqual(timedOut, { available: false, reason: 'timeout' })
})

test('managed Git archive verification streams exact size and digest evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-managed-git-hash-'))
  try {
    const archive = portableGitZip()
    const archivePath = join(root, 'portable-git.zip')
    await writeFile(archivePath, archive)
    const verified = await verifyManagedGitArchive({
      archivePath,
      expectedSha256: digest(archive),
      expectedBytes: archive.byteLength,
    })
    assert.deepEqual(verified, { archivePath, bytes: archive.byteLength, sha256: digest(archive) })
    await assert.rejects(
      verifyManagedGitArchive({ archivePath, expectedSha256: 'a'.repeat(64), expectedBytes: archive.byteLength }),
      (error) => error?.code === 'MANAGED_GIT_ARCHIVE_HASH_MISMATCH',
    )
    await assert.rejects(
      verifyManagedGitArchive({ archivePath, expectedSha256: digest(archive), expectedBytes: archive.byteLength - 1 }),
      (error) => error?.code === 'MANAGED_GIT_ARCHIVE_SIZE_MISMATCH',
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('managed Git ZIP inspection rejects traversal, duplicate Windows paths, and symlinks before extraction', () => {
  const valid = portableGitZip()
  const entries = inspectManagedGitZip(valid)
  assert.equal(entries.some((entry) => entry.name === 'PortableGit/cmd/git.exe' && !entry.directory), true)

  const traversal = Buffer.from(zipSync({ 'PortableGit/../outside.txt': strToU8('outside') }))
  assert.throws(() => inspectManagedGitZip(traversal), /traversal/u)

  const duplicateWindowsPath = Buffer.from(zipSync({
    'PortableGit/cmd/git.exe': strToU8('one'),
    'PortableGit/CMD/GIT.EXE': strToU8('two'),
  }))
  assert.throws(() => inspectManagedGitZip(duplicateWindowsPath), /duplicate entry/u)

  const reservedWindowsPath = Buffer.from(zipSync({ 'PortableGit/CON/git.exe': strToU8('unsafe') }))
  assert.throws(() => inspectManagedGitZip(reservedWindowsPath), /reserved Windows device name/u)

  const symlink = Buffer.from(valid)
  const central = centralDirectoryOffset(symlink)
  symlink.writeUInt16LE(0x0314, central + 4)
  symlink.writeUInt32LE(0xa1ff0000, central + 38)
  assert.throws(() => inspectManagedGitZip(symlink), /symbolic link or special file/u)

  assert.throws(
    () => inspectManagedGitZip(valid, { ...MANAGED_GIT_ARCHIVE_LIMITS, totalBytes: 1 }),
    /total size limit/u,
  )
})

test('managed Git state is release-bound and cannot claim a different artifact', () => {
  const archive = portableGitZip()
  const release = releaseFor(archive)
  const state = createManagedGitInstallState(release, { now: () => new Date('2026-08-21T00:00:00.000Z') })
  assert.equal(state.installedAt, '2026-08-21T00:00:00.000Z')
  assert.equal(normalizeManagedGitInstallState(state, { release }), state)
  assert.throws(
    () => normalizeManagedGitInstallState(state, { release: releaseFor(Buffer.from('different archive')) }),
    /does not match/u,
  )
})

test('managed Git installs only after staged archive and post-extract version verification, retaining a previous install', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-managed-git-install-'))
  try {
    const userDataDirectory = join(root, 'user-data')
    const archive = portableGitZip()
    const archivePath = join(root, 'portable-git.zip')
    const release = releaseFor(archive)
    const paths = managedGitPaths(userDataDirectory)
    await writeFile(archivePath, archive)
    await mkdir(paths.installDirectory, { recursive: true })
    await writeFile(join(paths.installDirectory, 'legacy.txt'), 'preserve me')

    const calls = []
    const installed = await installManagedGitArchive({
      userDataDirectory,
      archivePath,
      release,
      spawn: successfulGitSpawn(VERSION, calls),
      now: () => new Date('2026-08-21T01:02:03.000Z'),
      timeoutMs: 50,
    })
    assert.equal(installed.executablePath, join(paths.installDirectory, 'cmd', 'git.exe'))
    assert.equal(calls.length, 1)
    assert.notEqual(calls[0].executable, installed.executablePath)
    assert.notEqual(installed.previousInstallDirectory, null)
    assert.equal(await readFile(join(installed.previousInstallDirectory, 'legacy.txt'), 'utf8'), 'preserve me')
    assert.equal((await readFile(installed.executablePath)).toString('utf8'), 'not-a-real-executable')

    const state = await readManagedGitInstallState({ userDataDirectory, release })
    assert.equal(state.installedAt, '2026-08-21T01:02:03.000Z')
    const verified = await verifyManagedGitInstall({
      userDataDirectory,
      release,
      spawn: successfulGitSpawn(),
      timeoutMs: 50,
    })
    assert.equal(verified.version, VERSION)
    assert.equal((await stat(verified.executablePath)).isFile(), true)
    await writeFile(installed.executablePath, 'tampered')
    await assert.rejects(
      verifyManagedGitInstall({
        userDataDirectory,
        release,
        spawn: successfulGitSpawn(),
        timeoutMs: 50,
      }),
      (error) => error?.code === 'MANAGED_GIT_INSTALL_INVALID',
    )

    const rootEntries = await readdir(paths.rootDirectory)
    assert.equal(rootEntries.some((entry) => entry.startsWith('.stage-')), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('managed Git leaves current absent when post-extract Git identity verification fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-managed-git-reject-'))
  try {
    const userDataDirectory = join(root, 'user-data')
    const archive = portableGitZip()
    const archivePath = join(root, 'portable-git.zip')
    const paths = managedGitPaths(userDataDirectory)
    await writeFile(archivePath, archive)
    await assert.rejects(
      installManagedGitArchive({
        userDataDirectory,
        archivePath,
        release: releaseFor(archive),
        spawn: successfulGitSpawn('2.49.0.windows.1'),
        timeoutMs: 50,
      }),
      (error) => error?.code === 'MANAGED_GIT_POST_INSTALL_VERIFICATION_FAILED',
    )
    await assert.rejects(stat(paths.installDirectory), /ENOENT/u)
    const rootEntries = await readdir(paths.rootDirectory)
    assert.equal(rootEntries.some((entry) => entry.startsWith('.stage-')), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('managed Git restores the prior directory when the final atomic activation rename fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-managed-git-swap-'))
  try {
    const userDataDirectory = join(root, 'user-data')
    const archive = portableGitZip()
    const archivePath = join(root, 'portable-git.zip')
    const paths = managedGitPaths(userDataDirectory)
    await writeFile(archivePath, archive)
    await mkdir(paths.installDirectory, { recursive: true })
    await writeFile(join(paths.installDirectory, 'legacy.txt'), 'restore me')
    let activationRenameAttempts = 0
    const fileSystem = {
      mkdir,
      mkdtemp,
      copyFile,
      readFile,
      writeFile,
      stat,
      rename: async (source, destination) => {
        if (source.includes('.stage-') && basename(source) === 'current' && destination === paths.installDirectory) {
          activationRenameAttempts += 1
          const error = new Error('simulated activation lock')
          error.code = 'EACCES'
          throw error
        }
        return rename(source, destination)
      },
      rm,
    }
    await assert.rejects(
      installManagedGitArchive({
        userDataDirectory,
        archivePath,
        release: releaseFor(archive),
        fs: fileSystem,
        spawn: successfulGitSpawn(),
        timeoutMs: 50,
      }),
      (error) => error?.code === 'MANAGED_GIT_ATOMIC_SWAP_FAILED',
    )
    assert.equal(activationRenameAttempts, 5)
    assert.equal(await readFile(join(paths.installDirectory, 'legacy.txt'), 'utf8'), 'restore me')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('managed Git retries a transient Windows activation lock before publishing current', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-managed-git-swap-retry-'))
  try {
    const userDataDirectory = join(root, 'user-data')
    const archive = portableGitZip()
    const archivePath = join(root, 'portable-git.zip')
    const paths = managedGitPaths(userDataDirectory)
    await writeFile(archivePath, archive)
    let activationRenameAttempts = 0
    const fileSystem = {
      mkdir,
      mkdtemp,
      copyFile,
      readFile,
      writeFile,
      stat,
      rename: async (source, destination) => {
        if (source.includes('.stage-') && basename(source) === 'current' && destination === paths.installDirectory) {
          activationRenameAttempts += 1
          if (activationRenameAttempts < 3) {
            const error = new Error('simulated transient scanner lock')
            error.code = 'EPERM'
            throw error
          }
        }
        return rename(source, destination)
      },
      rm,
    }
    const installed = await installManagedGitArchive({
      userDataDirectory,
      archivePath,
      release: releaseFor(archive),
      fs: fileSystem,
      spawn: successfulGitSpawn(),
      timeoutMs: 50,
    })
    assert.equal(activationRenameAttempts, 3)
    assert.equal(await readFile(installed.executablePath, 'utf8'), 'not-a-real-executable')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('system Git probe accepts the vendor suffix that stock macOS reports', async () => {
  // Apple's git ships with the Xcode Command Line Tools, so this is what a
  // stock macOS prints. Rejecting it made every such machine look like it had
  // no system Git at all.
  const apple = await probeSystemGit({ spawn: successfulGitSpawn('2.50.1 (Apple Git-155)'), timeoutMs: 50 })
  assert.deepEqual(apple, { available: true, version: '2.50.1' })

  // The suffix must never leak into the reported version.
  assert.equal(apple.version.includes('Apple'), false)
})

test('system Git probe keeps accepting the versions Windows and Linux report', async () => {
  const mingit = await probeSystemGit({ spawn: successfulGitSpawn('2.55.0.windows.5'), timeoutMs: 50 })
  assert.deepEqual(mingit, { available: true, version: '2.55.0.windows.5' })

  const linux = await probeSystemGit({ spawn: successfulGitSpawn('2.43.0'), timeoutMs: 50 })
  assert.deepEqual(linux, { available: true, version: '2.43.0' })

  const homebrew = await probeSystemGit({ spawn: successfulGitSpawn('2.51.0'), timeoutMs: 50 })
  assert.deepEqual(homebrew, { available: true, version: '2.51.0' })
})

test('system Git probe still rejects output the version suffix must not rescue', async () => {
  // A malformed version is not made valid by having a suffix after it.
  const malformed = await probeSystemGit({ spawn: successfulGitSpawn('2.50.1-evil (Apple Git-155)'), timeoutMs: 50 })
  assert.deepEqual(malformed, { available: false, reason: 'invalid-version-output' })

  // Without separating whitespace the suffix is not a suffix, and the token as
  // a whole is not a version.
  const glued = await probeSystemGit({ spawn: successfulGitSpawn('2.50.1(Apple Git-155)'), timeoutMs: 50 })
  assert.deepEqual(glued, { available: false, reason: 'invalid-version-output' })

  const empty = await probeSystemGit({ spawn: successfulGitSpawn(''), timeoutMs: 50 })
  assert.deepEqual(empty, { available: false, reason: 'invalid-version-output' })
})
