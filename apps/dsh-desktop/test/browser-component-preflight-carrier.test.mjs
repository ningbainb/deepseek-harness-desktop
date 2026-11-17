import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, access, link, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { zipSync, strToU8 } from 'fflate'
import { prepareBrowserComponentPreflight } from '../scripts/prepare-browser-component-preflight.mjs'
const exec = promisify(execFile)
const sha = value => createHash('sha256').update(value).digest('hex')
const desktop = resolve(import.meta.dirname, '..')
const carrier = process.env.DSH_RELEASED_BROWSER_CARRIER || join(desktop, 'node_modules/electron/dist/electron.exe')
test('the released Electron carrier runs the standalone helper without desktop startup or daily Home access', { skip: process.platform !== 'win32', timeout: 60000 }, async t => {
 const root = await mkdtemp(join(tmpdir(), 'dsh-standalone-preflight-'))
 t.after(() => rm(root, { recursive: true, force: true }))
 const built = await prepareBrowserComponentPreflight({ outputDirectory: join(root, 'helper') })
 const home = join(root, 'isolated-home'), userdata = join(root, 'isolated-userdata'), cache = join(root, 'cache'), components = join(root, 'components')
 await mkdir(join(home, 'profiles/desktop'), { recursive: true })
 const profile = JSON.stringify({ name: 'dsh-profile-desktop', dsh: { profile: { bundles: [] } } })
 await writeFile(join(home, 'profiles/desktop/package.json'), profile)
 const environment = { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '', NODE_PATH: '', DSH_HOME: home,
  DSH_DESKTOP_USER_DATA: userdata, USERPROFILE: join(root, 'isolated-account'), APPDATA: join(root, 'isolated-appdata'),
  DSH_DESKTOP_BROWSER_COMPONENT_ROOT: components, DSH_DESKTOP_BROWSER_COMPONENT_CACHE: cache }
 const carrierHash = async () => { const hash = createHash('sha256'); for await (const chunk of createReadStream(carrier)) hash.update(chunk); return hash.digest('hex') }
 const originalCarrierHash = await carrierHash()
 const run = (args, nodeFlags = []) => exec(carrier, [...nodeFlags, built.entryPath, ...args], { windowsHide: true, timeout: 30000, env: environment, cwd: root })
 const probe = JSON.parse((await run(['--probe'])).stdout.trim())
 assert.equal(probe.electron, '44.7.0'); assert.equal(probe.runAsNode, true)
 assert.ok(probe.node)
 const archive = zipSync({ 'electron.exe': strToU8('isolated-browser-executable'), version: strToU8('44.7.0') })
 const archivePath = join(root, 'fixture.zip'); await writeFile(archivePath, archive)
 const manifest = { schemaVersion: 1, artifacts: [{ version: '44.7.0', platform: 'win32', arch: 'x64', size: archive.length, sha256: sha(archive),
  url: 'https://github.com/electron/electron/releases/download/v44.7.0/isolated-fixture.zip', executable: 'electron.exe', required: ['electron.exe', 'version'] }] }
 await writeFile(built.manifestPath, JSON.stringify(manifest))
 const result = await run([`--home=${home}`, `--archive=${archivePath}`])
 assert.match(result.stdout, /"phase":"ready"/u)
 assert.equal(await readFile(join(components, '44.7.0-win32-x64/electron.exe'), 'utf8'), 'isolated-browser-executable')
 assert.equal(await readFile(join(home, 'profiles/desktop/package.json'), 'utf8'), profile)
 await assert.rejects(access(userdata), { code: 'ENOENT' })
 await assert.rejects(access(environment.APPDATA), { code: 'ENOENT' })
 await assert.rejects(run([`--home=${home}`, `--parent-pid=2147483646`]), /cancelled or exited/u)
 environment.DSH_DESKTOP_BROWSER_COMPONENT_ROOT = join(root, 'bad-archive-components')
 const badArchive = join(root, 'damaged.zip'); await writeFile(badArchive, Buffer.alloc(archive.length))
 await assert.rejects(run([`--home=${home}`, `--archive=${badArchive}`]), /SHA256 mismatch/u)
 const offline = join(root, 'offline.mjs'); await writeFile(offline, "globalThis.fetch = async () => { throw Error('isolated network unavailable') }")
 // Use a new component root so the known-good activation cannot mask a failed download.
 const savedComponentRoot = environment.DSH_DESKTOP_BROWSER_COMPONENT_ROOT
 environment.DSH_DESKTOP_BROWSER_COMPONENT_ROOT = join(root, 'offline-components')
 await assert.rejects(run([`--home=${home}`], ['--import', pathToFileURL(offline).href]), /isolated network unavailable/u)
 environment.DSH_DESKTOP_BROWSER_COMPONENT_ROOT = savedComponentRoot
 await assert.rejects(run([`--home=${join(root, 'missing-home')}`]), /Home cannot be located/u)
 assert.equal(await carrierHash(), originalCarrierHash, 'all preflight failures leave the released executable intact')
 assert.equal(await readFile(join(home, 'profiles/desktop/package.json'), 'utf8'), profile)
 // The production PowerShell wrapper also uses the real carrier, in an isolated install tree.
 const install = join(root, 'isolated-old-install')
 await mkdir(join(install, 'resources'), { recursive: true })
 for (const item of await readdir(dirname(carrier), { withFileTypes: true })) {
   if (!item.isFile() || !/\.(?:exe|dll|bin|dat)$/iu.test(item.name)) continue
   const target = join(install, item.name === carrier.split(/[\\/]/u).at(-1) ? 'DeepSeek Harness Desktop.exe' : item.name)
   await link(join(dirname(carrier), item.name), target).catch(async error => { if (error.code !== 'EXDEV') throw error; await copyFile(join(dirname(carrier), item.name), target) })
 }
 await writeFile(join(install, 'resources/update-shutdown-v1'), 'dsh-desktop-update-shutdown-protocol=1')
 await writeFile(join(home, 'profiles/desktop/cordis.patch.yml'), '- id: browser-electron\n  disabled: true\n')
 const psArguments = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(desktop, 'build/installer-browser-preflight.ps1'),
  '-InstallDirectory', install, '-PreflightEntry', built.entryPath, '-ExpectedEntrySHA256', sha(await readFile(built.entryPath)), '-ExpectedManifestSHA256', sha(await readFile(built.manifestPath))]
 const wrapped = await exec('powershell.exe', psArguments, { windowsHide: true, timeout: 30000, env: environment })
 assert.match(wrapped.stdout, /browser-preflight-validated-before-shutdown/u)
 const savedUserData = join(root, 'persisted-userdata'); await mkdir(savedUserData)
 await writeFile(join(savedUserData, 'desktop-data-location.json'), JSON.stringify({ schemaVersion: 1, owner: 'deepseek-harness-community-desktop', home }))
 const persistedEnvironment = { ...environment, DSH_HOME: '', DSH_DESKTOP_USER_DATA: savedUserData }
 assert.match((await exec('powershell.exe', psArguments, { windowsHide: true, timeout: 30000, env: persistedEnvironment })).stdout, /browser-preflight-validated-before-shutdown/u)
 await writeFile(join(savedUserData, 'desktop-data-location.json'), '{"schemaVersion":1,"owner":"foreign","home":"ignored"}')
 await assert.rejects(exec('powershell.exe', psArguments, { windowsHide: true, timeout: 30000, env: persistedEnvironment }), error => error.code === 37 && /invalid persisted/u.test(error.stdout))
 assert.equal(await carrierHash(), originalCarrierHash)
 const source = await readFile(built.entryPath, 'utf8')
 assert.doesNotMatch(source, /^import[^\n]+from ['"](?:fflate|yaml)['"]/mu, 'all non-builtin runtime dependencies are bundled')
 console.log(JSON.stringify({ evidence: 'released-electron-node-carrier', carrier, ...probe, isolatedHome: home, desktopStarted: false }))
})
