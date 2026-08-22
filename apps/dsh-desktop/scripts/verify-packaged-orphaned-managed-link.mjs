import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { DESKTOP_REPAIR_BUNDLE } from '../src/profile.mjs'
import {
  materializeDirectStartFixture,
  verifyPackagedDirectStart,
} from './direct-start-matrix-runner.mjs'
import { runPackagedDesktop } from './packaged-smoke-runner.mjs'

const appPath = resolve(process.env.DSH_DESKTOP_E2E_EXECUTABLE
  ?? join('dist', 'win-unpacked', 'DeepSeek Harness Desktop.exe'))
const temporary = await mkdtemp(join(tmpdir(), 'dsh-packaged-orphaned-link-'))

try {
  const layout = await materializeDirectStartFixture({ root: temporary, version: '2.7' })
  const legacyPackageRoot = join(temporary, 'previous-build', 'desktop-repair')
  const repairTarget = join(layout.profileDir, 'node_modules', ...DESKTOP_REPAIR_BUNDLE.split('/'))
  const manifestPath = join(layout.profileDir, 'package.json')

  await mkdir(legacyPackageRoot, { recursive: true })
  await writeFile(join(legacyPackageRoot, 'package.json'), `${JSON.stringify({
    name: DESKTOP_REPAIR_BUNDLE,
    version: '0.1.0',
  }, null, 2)}\n`)
  await mkdir(dirname(repairTarget), { recursive: true })
  await symlink(legacyPackageRoot, repairTarget, process.platform === 'win32' ? 'junction' : 'dir')

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.dependencies[DESKTOP_REPAIR_BUNDLE] = `link:${legacyPackageRoot.replaceAll('\\', '/')}`
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  await assert.rejects(
    access(join(layout.profileDir, '.dsh-desktop-links.json')),
    error => error?.code === 'ENOENT',
  )

  const result = await runPackagedDesktop({
    appPath,
    userData: layout.userData,
    dshHome: layout.dshHome,
    requireStartupTimings: false,
  })
  await verifyPackagedDirectStart(layout, result)
  assert.doesNotMatch(result.runtimeLog, /\[startup\] direct-state=repairing/u)

  const packagedRepairRoot = resolve(
    appPath,
    '..',
    'resources',
    'app.asar.unpacked',
    'node_modules',
    ...DESKTOP_REPAIR_BUNDLE.split('/'),
  )
  assert.equal(await realpath(repairTarget), await realpath(packagedRepairRoot))
  const managedLinks = JSON.parse(await readFile(join(layout.profileDir, '.dsh-desktop-links.json'), 'utf8'))
  assert.deepEqual(managedLinks[DESKTOP_REPAIR_BUNDLE], {
    mode: 'link',
    source: packagedRepairRoot,
  })

  console.log('verified packaged orphaned Desktop link adoption reaches ready-full without repair state')
} finally {
  await rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
}
