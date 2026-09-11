import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import { _electron as electron } from 'playwright'
import electronPath from 'electron'
import { readPresetFile } from '../src/presets/preset-archive.mjs'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'

const appDir = join(import.meta.dirname, '..')
const parent = await realpath(tmpdir())
const temporary = await realpath(await mkdtemp(join(parent, 'dsh-preset-export-e2e-')))
const within = relative(parent, temporary)
assert.ok(within && !within.startsWith('..') && !isAbsolute(within))
const dshHome = join(temporary, 'dsh-home')
const userData = join(temporary, 'user-data')
const output = join(temporary, '导出目录', '当前环境.dshpreset')
const executable = process.env.DSH_DESKTOP_E2E_EXECUTABLE?.trim()
let app
let dock
try {
  await mkdir(join(dshHome, 'skills', 'review'), { recursive: true })
  await mkdir(userData)
  await writeFile(join(dshHome, 'skills', 'review', 'SKILL.md'), '---\nname: review\ndescription: Review changes\n---\nReview carefully.\n')
  await writeFile(join(dshHome, 'settings.yaml'), 'language: zh-CN\nui:\n  apiToken: synthetic-must-not-export\n')
  const version = JSON.parse(await readFile(join(appDir, 'package.json'), 'utf8')).version
  await writeFile(join(userData, 'star-prompt-state.json'), JSON.stringify({ schemaVersion: 1, shownVersions: [version] }))
  await seedPrimaryRuntimePermissionForTest({ userData })
  app = await electron.launch({ executablePath: executable || electronPath,
    args: executable ? [] : [join(appDir, 'src/main.mjs')], cwd: appDir,
    env: { ...process.env, NODE_ENV: 'test', DSH_HOME: dshHome, DSH_DESKTOP_USER_DATA: userData,
      DSH_DESKTOP_DISABLE_UPDATES: '1', DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: '1',
      DSH_DESKTOP_OPEN_EXTENSIONS: '1' } })
  const main = await app.firstWindow()
  await main.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { timeout: 120_000 })
  for (let attempt = 0; attempt < 120; attempt++) {
    dock = app.windows().find(page => page.url().includes('/extensions.html'))
    if (dock) break
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  assert.ok(dock, 'real extension Dock opens')
  dock.setDefaultTimeout(10_000)
  const errors = []
  dock.on('pageerror', error => errors.push(error.message))
  await dock.locator('#backup-tab').click()
  await dock.locator('#presets-tab').click()
  const button = dock.locator('#export-preset')
  const status = dock.locator('#preset-export-status')
  const details = dock.locator('#preset-export-details')
  const lockPath = join(dshHome, 'profiles', 'desktop', 'pnpm-lock.yaml')
  await assert.rejects(readFile(lockPath), { code: 'ENOENT' })

  // Substitute only the OS picker; production preload, IPC, manager, service and disk writes remain real.
  await app.evaluate(({ dialog }) => {
    globalThis.presetExportDialogCalls = 0
    dialog.showSaveDialog = async (_window, options) => {
      globalThis.presetExportDialogCalls++
      globalThis.presetExportDialogOptions = options
      return new Promise(resolve => { globalThis.resolvePresetExportDialog = resolve })
    }
  })
  const begin = async () => {
    await button.click()
    await dock.waitForFunction(() => document.querySelector('#preset-export-status')?.dataset.state === 'pending')
    assert.equal(await button.isDisabled(), true, 'duplicate exports are disabled')
    assert.match(await button.textContent(), /正在导出/u)
  }
  await begin()
  assert.equal(await app.evaluate(() => globalThis.presetExportDialogCalls), 1)
  assert.equal(await app.evaluate(() => globalThis.presetExportDialogOptions.buttonLabel), '保存预设')
  await app.evaluate((_electron, filePath) => globalThis.resolvePresetExportDialog({ canceled: false, filePath }), output)
  await dock.waitForFunction(() => document.querySelector('#preset-export-status')?.dataset.state === 'success')
  assert.match(await status.textContent(), /0 个社区插件，1 个技能/u)
  assert.equal(await details.isVisible(), false)
  await dock.waitForFunction(() => !document.querySelector('#export-preset')?.disabled)
  const archive = await readPresetFile(output)
  assert.deepEqual(archive.packages, [])
  assert.deepEqual(archive.settings, { language: 'zh-CN' })
  assert.equal(archive.skills.size, 1)
  const original = await readFile(output)
  await assert.rejects(readFile(lockPath), { code: 'ENOENT' })
  const toast = await dock.locator('#toast').evaluate(element => {
    const bounds = element.getBoundingClientRect()
    return { position: getComputedStyle(element).position, visible: !element.hidden,
      fits: bounds.left >= 0 && bounds.top >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight }
  })
  assert.deepEqual(toast, { position: 'fixed', visible: true, fits: true })

  await begin()
  await app.evaluate(() => globalThis.resolvePresetExportDialog({ canceled: true }))
  await dock.waitForFunction(() => document.querySelector('#preset-export-status')?.dataset.state === 'canceled')
  assert.match(await status.textContent(), /已取消导出/u)
  assert.deepEqual(await readFile(output), original)

  // Force a real filesystem failure without touching installed packages or user data.
  const blocker = join(temporary, 'not-a-directory')
  await writeFile(blocker, 'keep this file')
  await (await app.browserWindow(dock)).evaluate(window => window.setSize(680, 480))
  await begin()
  await app.evaluate((_electron, filePath) => globalThis.resolvePresetExportDialog({ canceled: false, filePath }), join(blocker, 'failed.dshpreset'))
  await dock.waitForFunction(() => document.querySelector('#preset-export-status')?.dataset.state === 'error')
  assert.match(await status.textContent(), /保存路径不可用|无法写入保存位置/u)
  assert.equal(await dock.locator('#toast').evaluate(element => {
    const bounds = element.getBoundingClientRect()
    return !element.hidden && bounds.left >= 0 && bounds.top >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight
  }), true, 'error toast fits a compact Dock')
  assert.equal(await details.isVisible(), true)
  await details.locator('summary').click()
  await dock.locator('#preset-export-error').waitFor()
  await new Promise(resolve => setTimeout(resolve, 5_000))
  assert.equal(await status.isVisible(), true, 'failure persists past the old four-second toast timeout')
  assert.deepEqual(await readFile(output), original)
  assert.equal(await readFile(blocker, 'utf8'), 'keep this file')

  await begin()
  assert.equal(await details.isVisible(), false, 'retry clears stale error details')
  await app.evaluate((_electron, filePath) => globalThis.resolvePresetExportDialog({ canceled: false, filePath }), output)
  await dock.waitForFunction(() => document.querySelector('#preset-export-status')?.dataset.state === 'success')
  assert.deepEqual((await readPresetFile(output)).settings, { language: 'zh-CN' })
  assert.equal(await app.evaluate(() => globalThis.presetExportDialogCalls), 4)
  assert.deepEqual(errors, [])
  console.log('Preset export passed: real lockless profile, validated file, visible feedback, cancellation, filesystem failure and retry')
} catch (error) {
  console.error('Preset export fixture state', await dock?.evaluate(() => ({
    state: document.querySelector('#preset-export-status')?.dataset.state,
    message: document.querySelector('#preset-export-status')?.textContent,
    error: document.querySelector('#preset-export-error')?.textContent,
  })).catch(() => undefined))
  throw error
} finally {
  await app?.close()
  await rm(temporary, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })
}
