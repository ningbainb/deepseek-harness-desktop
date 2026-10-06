import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { resolveNsisCompiler } from './nsis-compiler.mjs'

const exec = promisify(execFile)
const desktop = resolve(import.meta.dirname, '..')
if (process.platform !== 'win32') throw new Error('Installer identity migration verification requires Windows')
const compiler = await resolveNsisCompiler()
const root = await mkdtemp(join(tmpdir(), 'dsh-installer-identity-'))

async function registryExists(key) {
  try {
    await exec('reg.exe', ['QUERY', `HKCU\\${key}`], { windowsHide: true })
    return true
  } catch {
    return false
  }
}

try {
  for (const scenario of ['current-custom', 'current-uninstall', 'current-registry32', 'explicit-running-copy']) {
    const directory = join(root, scenario)
    const existing = join(directory, "用户's E 盘安装")
    const fresh = join(directory, 'C-default-fixture')
    const installer = join(directory, 'fixture.exe')
    const registry = `Software\\DeepSeekHarnessDesktopTests\\identity-${process.pid}-${scenario}`
    await mkdir(join(existing, 'resources'), { recursive: true })
    await writeFile(join(existing, 'DeepSeek Harness Desktop.exe'), 'owned executable')
    await writeFile(join(existing, 'resources', 'update-shutdown-v1'), 'dsh-desktop-update-shutdown-protocol=1\n')
    const registryLocation = scenario === 'current-uninstall' ? 'CurrentUninstall' : 'CurrentInstall'
    const registered = scenario === 'explicit-running-copy' ? fresh : existing
    await exec('reg.exe', ['ADD', `HKCU\\${registry}\\${registryLocation}`, '/v', 'InstallLocation', '/t', 'REG_SZ', '/d', registered, '/f',
      scenario === 'current-registry32' ? '/reg:32' : '/reg:64'], { windowsHide: true })
    try {
      await exec(compiler.path, ['/V2', `/DBUILD_RESOURCES_DIR=${join(desktop, 'build')}`,
        `/DTEST_OUTPUT=${installer}`, `/DTEST_FRESH_INSTALL=${fresh}`, `/DTEST_REGISTRY=${registry}`,
        join(desktop, 'test', 'fixtures', 'installer-identity-migration.nsi')], { windowsHide: true, timeout: 60_000, env: compiler.env })
      await exec(installer, ['/S', ...(scenario === 'explicit-running-copy' ? [`/D=${existing}`] : [])], { windowsHide: true, timeout: 60_000 })
      assert.equal(await readFile(join(existing, 'selected-install.txt'), 'utf16le'), existing)
      await assert.rejects(stat(join(fresh, 'selected-install.txt')), { code: 'ENOENT' })
      assert.equal(await readFile(join(existing, 'DeepSeek Harness Desktop.exe'), 'utf8'), 'owned executable')
      console.log(`PASS installer directory ${scenario}`)
    } finally {
      for (const view of ['32', '64']) await exec('reg.exe', ['DELETE', `HKCU\\${registry}`, '/f', `/reg:${view}`], { windowsHide: true }).catch(() => {})
    }
  }
  for (const owned of [true, false]) {
    const label = owned ? 'owned-legacy' : 'foreign-legacy'
    const directory = join(root, label)
    const legacyInstall = join(directory, 'legacy-install')
    const freshInstall = join(directory, 'fresh-install')
    const installer = join(directory, 'fixture.exe')
    const registry = `Software\\DeepSeekHarnessDesktopTests\\identity-${process.pid}-${label}`
    await mkdir(join(legacyInstall, 'resources'), { recursive: true })
    await mkdir(freshInstall, { recursive: true })
    await writeFile(join(legacyInstall, 'DeepSeek Harness Desktop.exe'), 'legacy executable')
    if (owned) {
      await writeFile(join(legacyInstall, 'resources', 'update-shutdown-v1'), 'dsh-desktop-update-shutdown-protocol=1\n')
    }
    await exec('reg.exe', ['ADD', `HKCU\\${registry}\\LegacyInstall`, '/v', 'InstallLocation', '/t', 'REG_SZ', '/d', legacyInstall, '/f'], { windowsHide: true })
    await exec('reg.exe', ['ADD', `HKCU\\${registry}\\LegacyUninstall`, '/v', 'DisplayVersion', '/t', 'REG_SZ', '/d', '3.5.0', '/f'], { windowsHide: true })
    try {
      await exec(compiler.path, [
        '/V2', `/DBUILD_RESOURCES_DIR=${join(desktop, 'build')}`,
        `/DTEST_OUTPUT=${installer}`, `/DTEST_FRESH_INSTALL=${freshInstall}`,
        `/DTEST_REGISTRY=${registry}`,
        join(desktop, 'test', 'fixtures', 'installer-identity-migration.nsi'),
      ], { windowsHide: true, timeout: 30_000, env: compiler.env })
      await exec(installer, ['/S'], { windowsHide: true, timeout: 30_000 })
      const selected = owned ? legacyInstall : freshInstall
      assert.equal(await readFile(join(selected, 'selected-install.txt'), 'utf16le'), selected)
      await assert.rejects(stat(join(owned ? freshInstall : legacyInstall, 'selected-install.txt')), { code: 'ENOENT' })
      assert.equal(await registryExists(`${registry}\\CurrentInstall`), true)
      assert.equal(await registryExists(`${registry}\\LegacyInstall`), !owned)
      assert.equal(await registryExists(`${registry}\\LegacyUninstall`), !owned)
      console.log(`PASS installer identity ${label}: selected=${selected}`)
    } finally {
      await exec('reg.exe', ['DELETE', `HKCU\\${registry}`, '/f'], { windowsHide: true }).catch(() => {})
    }
  }
} finally {
  await rm(root, { recursive: true, force: true })
}
