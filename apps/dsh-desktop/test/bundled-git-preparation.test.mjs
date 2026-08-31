import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { prepareBundledManagedGit } from '../scripts/prepare-bundled-git.mjs'

const FIXTURE_RELEASE = Object.freeze({
  id: 'mingit-fixture-1.0.0-windows.1-x64',
  platform: 'win32',
  arch: 'x64',
  version: '1.0.0.windows.1',
  archive: Object.freeze({
    format: 'zip',
    url: 'https://github.com/git-for-windows/git/releases/download/v1.0.0.windows.1/MinGit-fixture-64-bit.zip',
    sha256: '1'.repeat(64),
    bytes: 32,
    rootDirectory: '.',
  }),
  git: Object.freeze({
    executablePath: 'cmd/git.exe',
    sha256: '2'.repeat(64),
    bytes: 16,
  }),
})

const FIXTURE_MANIFEST = Object.freeze({ schemaVersion: 1, releases: [FIXTURE_RELEASE] })

test('bundled Git build preparation reuses a verified generated resource without downloading', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-bundled-git-reuse-'))
  try {
    const buildDirectory = join(root, 'build')
    const outputDirectory = join(buildDirectory, 'bundled-managed-git')
    const executablePath = join(outputDirectory, 'managed-git', 'current', 'cmd', 'git.exe')
    let downloadCalls = 0
    const result = await prepareBundledManagedGit({
      buildDirectory,
      outputDirectory,
      manifest: FIXTURE_MANIFEST,
      platform: 'win32',
      arch: 'x64',
      verifyInstallFn: async () => ({ executablePath, version: FIXTURE_RELEASE.version }),
      downloadArchiveFn: async () => {
        downloadCalls += 1
        throw new Error('a verified resource must not be downloaded again')
      },
    })
    assert.equal(result.status, 'reused')
    assert.equal(result.executablePath, executablePath)
    assert.equal(downloadCalls, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('bundled Git build preparation replaces invalid generated output and cleans download staging', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-bundled-git-prepare-'))
  try {
    const buildDirectory = join(root, 'build')
    const outputDirectory = join(buildDirectory, 'bundled-managed-git')
    const executablePath = join(outputDirectory, 'managed-git', 'current', 'cmd', 'git.exe')
    await mkdir(outputDirectory, { recursive: true })
    await writeFile(join(outputDirectory, 'stale.txt'), 'replace me')
    let verifyCalls = 0
    const result = await prepareBundledManagedGit({
      buildDirectory,
      outputDirectory,
      manifest: FIXTURE_MANIFEST,
      platform: 'win32',
      arch: 'x64',
      verifyInstallFn: async () => {
        verifyCalls += 1
        if (verifyCalls === 1) throw new Error('invalid generated bundle')
        return { executablePath, version: FIXTURE_RELEASE.version }
      },
      downloadArchiveFn: async ({ destinationDirectory }) => {
        const archivePath = join(destinationDirectory, 'archive.zip')
        await writeFile(archivePath, 'fixture archive')
        return { archivePath }
      },
      installArchiveFn: async ({ userDataDirectory, archivePath, release }) => {
        assert.equal(userDataDirectory, outputDirectory)
        assert.equal(await readFile(archivePath, 'utf8'), 'fixture archive')
        assert.equal(release.id, FIXTURE_RELEASE.id)
        await mkdir(join(userDataDirectory, 'managed-git', 'current', 'cmd'), { recursive: true })
        await writeFile(executablePath, 'fixture git')
        return { executablePath }
      },
    })
    assert.equal(result.status, 'prepared')
    assert.equal(await readFile(executablePath, 'utf8'), 'fixture git')
    assert.deepEqual((await readdir(buildDirectory)).filter((entry) => entry.startsWith('.bundled-git-download-')), [])
    await assert.rejects(readFile(join(outputDirectory, 'stale.txt')), /ENOENT/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('bundled Git output cannot escape its generated build directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-bundled-git-path-'))
  try {
    await assert.rejects(
      prepareBundledManagedGit({
        buildDirectory: join(root, 'build'),
        outputDirectory: resolve(root, 'outside'),
        manifest: FIXTURE_MANIFEST,
        platform: 'win32',
        arch: 'x64',
      }),
      /must stay inside/u,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Desktop package commands and extra resources require the prepared bundled Git tree', async () => {
  const appDirectory = resolve(fileURLToPath(new URL('..', import.meta.url)))
  const manifest = JSON.parse(await readFile(join(appDirectory, 'package.json'), 'utf8'))
  const packaging = await readFile(join(appDirectory, 'electron-builder.yml'), 'utf8')
  assert.equal(manifest.scripts['prepare:bundled-git'], 'node scripts/prepare-bundled-git.mjs')
  assert.match(manifest.scripts['pack:dir'], /^pnpm prepare:bundled-git && /u)
  assert.equal(manifest.scripts['pack:win'], 'node scripts/package-win.mjs')
  const packageWin = await readFile(join(appDirectory, 'scripts', 'package-win.mjs'), 'utf8')
  assert.ok(packageWin.includes('prepareReleaseDirectory()'))
  assert.match(packageWin, /prepare:bundled-git/u)
  assert.match(packageWin, /--assert-signing/u)
  assert.match(packaging, /from: build\/bundled-managed-git\/managed-git\/current\s+to: managed-git\/current/u)
})
