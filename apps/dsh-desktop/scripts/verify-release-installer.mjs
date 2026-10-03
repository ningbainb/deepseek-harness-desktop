import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep, win32 } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import { runPackagedDesktop } from './packaged-smoke-runner.mjs'

const require = createRequire(import.meta.url)
const builderRequire = createRequire(require.resolve('electron-builder/package.json'))
const asar = builderRequire('@electron/asar')

export function assertDisposableInstallerRunner(platform, env) {
  if (platform !== 'win32' || env.GITHUB_ACTIONS !== 'true' || !env.RUNNER_TEMP || !win32.isAbsolute(env.RUNNER_TEMP)) {
    throw new Error('Real Setup acceptance requires a disposable GitHub Windows Runner with an absolute RUNNER_TEMP')
  }
}

export function installerChecksum(bytes, sums, file) {
  const rows = sums.split(/\r?\n/u).map(row => /^([a-f0-9]{64})\s+\*?(.+)$/iu.exec(row)).filter(Boolean)
  const matches = rows.filter(row => row[2] === file)
  assert.equal(matches.length, 1, 'one exact installer checksum is required')
  const digest = createHash('sha256').update(bytes).digest('hex')
  assert.equal(digest, matches[0][1].toLowerCase(), 'downloaded installer must match its release receipt')
  return digest
}

async function main() {
  assertDisposableInstallerRunner(process.platform, process.env)
  const previousDirectory = resolve(process.env.DSH_DESKTOP_PREVIOUS_RELEASE_DIRECTORY)
  const previousVersion = '4.3.0'
  const appDirectory = resolve(import.meta.dirname, '..')
  const version = JSON.parse(await readFile(join(appDirectory, 'package.json'), 'utf8')).version
  const previousName = `DeepSeek-Harness-Desktop-Setup-${previousVersion}-x64.exe`
  const previousInstaller = join(previousDirectory, previousName)
  const previousDigest = installerChecksum(await readFile(previousInstaller), await readFile(join(previousDirectory, 'SHA256SUMS.txt'), 'utf8'), previousName)
  const currentInstaller = join(appDirectory, 'dist', `DeepSeek-Harness-Desktop-Setup-${version}-x64.exe`)
  const root = await mkdtemp(join(resolve(process.env.RUNNER_TEMP), 'dsh-real-setup-'))
  const evidence = { version, previousVersion, previousDigest, root, results: [] }
  const execute = promisify(execFile)
  const installDirectory = join(root, '安装目录')
  const executable = join(installDirectory, 'DeepSeek Harness Desktop.exe')
  const uninstall = join(installDirectory, 'Uninstall DeepSeek Harness Desktop.exe')
  const contained = relative(resolve(process.env.RUNNER_TEMP), installDirectory)
  assert.ok(contained && contained !== '..' && !contained.startsWith(`..${sep}`) && !isAbsolute(contained))
  const install = async (installer, expectedVersion) => {
    await execute(installer, ['/S', `/D=${installDirectory}`], { windowsHide: true, timeout: 600_000 })
    const archive = join(installDirectory, 'resources', 'app.asar')
    asar.uncache(archive)
    const manifest = JSON.parse(asar.extractFile(archive, 'package.json').toString('utf8'))
    assert.equal(manifest.version, expectedVersion, 'the production Setup installed the expected application')
    await access(executable)
    await access(uninstall)
  }
  try {
    for (const scenario of ['fresh', 'previous-release-upgrade']) {
      const userData = join(root, scenario, 'user-data')
      const dshHome = join(root, scenario, 'dsh-home')
      await mkdir(userData, { recursive: true })
      const sentinel = join(userData, 'installation-data-sentinel.json')
      const original = Buffer.from(JSON.stringify({ scenario, marker: 'preserve-installed-user-data' }))
      await writeFile(sentinel, original, { flag: 'wx' })
      if (scenario === 'previous-release-upgrade') {
        await install(previousInstaller, previousVersion)
        await runPackagedDesktop({ appPath: executable, userData, dshHome, requireStartupTimings: false })
      }
      await install(currentInstaller, version)
      assert.deepEqual(await readFile(sentinel), original, 'Setup preserves data outside the application directory')
      const first = await runPackagedDesktop({ appPath: executable, userData, dshHome, requireStartupTimings: false })
      const profile = join(dshHome, 'profiles', 'desktop', 'package.json')
      const profileBytes = await readFile(profile)
      await install(currentInstaller, version)
      assert.deepEqual(await readFile(profile), profileBytes, 'overlay Setup preserves the existing runtime Profile byte-for-byte')
      assert.deepEqual(await readFile(sentinel), original)
      const second = await runPackagedDesktop({ appPath: executable, userData, dshHome, requireStartupTimings: false })
      evidence.results.push({ scenario, firstStartMs: first.elapsedMs, secondStartMs: second.elapsedMs, profilePreserved: true })
      await execute(uninstall, ['/S'], { windowsHide: true, timeout: 180_000 })
      const uninstallDeadline = Date.now() + 90_000
      let removed = false
      while (Date.now() < uninstallDeadline) {
        removed = await access(executable).then(() => false, error => {
          if (error.code === 'ENOENT') return true
          throw error
        })
        if (removed) break
        await delay(250)
      }
      assert.equal(removed, true, 'the real uninstaller finishes before the next installation scenario')
      assert.deepEqual(await readFile(sentinel), original, 'uninstall preserves the isolated user data')
      console.log(`PASS real production Setup: ${scenario}, overlay reinstall and installed relaunch`)
    }
  } finally {
    await writeFile(join(root, 'evidence.json'), JSON.stringify(evidence, null, 2))
    console.log(`Real Setup evidence: ${root}`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) await main()
