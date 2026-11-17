import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'
import { prepareBrowserPreflightFixtureResources, registerBrowserPreflightFixture, assertBrowserPreflightFixtureCalled } from './fixtures/browser-preflight-resources.mjs'
const exec = promisify(execFile)
const desktop = resolve(import.meta.dirname, '..')
test('installer resource preparation runs before process cleanup and refuses a failed preflight', async () => {
 const source = await readFile(join(desktop, 'build/installer.nsh'), 'utf8')
 const body = source.slice(source.indexOf('!macro customCheckAppRunning'), source.indexOf('; Supported builder hook'))
 assert.ok(body.indexOf('installer-browser-preflight.ps1') < body.indexOf('cleanup_retry:'))
 assert.ok(body.indexOf('browser_preflight_ready:') < body.indexOf('cleanup-stale-processes.ps1" -InstallDirectory'))
 assert.match(body, /browser-component-preflight" "\$0"/u)
 assert.match(body, /StrCmp \$0 "0" browser_preflight_ready[\s\S]*?Abort\s*browser_preflight_ready:/u)
})
test('production preflight skips genuinely fresh install without requiring a Home or starting a carrier', { skip: process.platform !== 'win32' }, async t => {
 const root = await mkdtemp(join(tmpdir(), 'dsh-fresh-browser-preflight-')); t.after(() => rm(root, { recursive: true, force: true }))
 const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(desktop, 'build/installer-browser-preflight.ps1'),
 '-InstallDirectory', join(root, 'fresh-install'), '-PreflightEntry', join(root, 'missing-helper.mjs'), '-ExpectedEntrySHA256', '0'.repeat(64), '-ExpectedManifestSHA256', '0'.repeat(64)], { windowsHide: true, env: { ...process.env, DSH_HOME: join(root, 'missing-home') } })
 assert.match(stdout, /browser-preflight-skipped fresh-install/u)
})
test('controlled lifecycle resource fixture asserts old program presence and untouched isolated Home before recording exactly one call', { skip: process.platform !== 'win32' }, async t => {
 const root = await mkdtemp(join(tmpdir(), 'dsh-scoped-browser-service-')); t.after(() => rm(root, { recursive: true, force: true }))
 const workspace = join(root, "中文 scope's directory"); await mkdir(workspace)
 const resources = await prepareBrowserPreflightFixtureResources(workspace, { controlledService: true })
 const install = join(workspace, "用户's old-install"), key = 'Software\\DeepSeekHarnessDesktopTests\\controlled-browser'
 await mkdir(join(install, 'resources'), { recursive: true }); await writeFile(join(install, 'DeepSeek Harness Desktop.exe'), 'untouched-old-exe')
 await registerBrowserPreflightFixture(resources, { key, install, directory: workspace })
 const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(resources, 'installer-browser-preflight.ps1'), '-InstallDirectory', install, '-InstallRegistryKey', `${key}\\Install`]
 await exec('powershell.exe', args, { windowsHide: true })
 await assertBrowserPreflightFixtureCalled(resources, key)
 await writeFile(join(workspace, 'preflight-home-sentinel.txt'), 'changed')
 await assert.rejects(exec('powershell.exe', args, { windowsHide: true }), error => error.code === 37 && /Home changed/u.test(error.stdout))
 await assertBrowserPreflightFixtureCalled(resources, key)
 assert.equal(await readFile(join(install, 'DeepSeek Harness Desktop.exe'), 'utf8'), 'untouched-old-exe')
})
