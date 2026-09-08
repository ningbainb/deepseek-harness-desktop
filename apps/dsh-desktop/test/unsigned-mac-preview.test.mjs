import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { DesktopUpdateController } from '../src/updater.mjs'
import { publicUpdateStatus } from '../src/ipc.mjs'
import {
  UNSIGNED_MAC_PREVIEW_REASON,
  inspectMacCodeSignature,
  resolveUpdateAvailability,
} from '../src/unsigned-mac-preview.mjs'

const appDirectory = join(dirname(fileURLToPath(import.meta.url)), '..')

test('Windows packaged builds keep updates enabled unless explicitly disabled', () => {
  assert.deepEqual(
    resolveUpdateAvailability({ platform: 'win32', packaged: true }),
    { enabled: true, reason: null },
  )
  assert.deepEqual(
    resolveUpdateAvailability({
      platform: 'win32',
      packaged: true,
      disableRequested: true,
    }),
    { enabled: false, reason: 'explicit' },
  )
})

test('packaged unsigned macOS builds disable updates with the preview reason', () => {
  assert.deepEqual(
    resolveUpdateAvailability({
      platform: 'darwin',
      packaged: true,
      codesignVerified: false,
    }),
    { enabled: false, reason: UNSIGNED_MAC_PREVIEW_REASON },
  )
  assert.deepEqual(
    resolveUpdateAvailability({
      platform: 'darwin',
      packaged: true,
      codesignVerified: null,
    }),
    { enabled: false, reason: UNSIGNED_MAC_PREVIEW_REASON },
  )
  assert.deepEqual(
    resolveUpdateAvailability({
      platform: 'darwin',
      packaged: true,
      codesignVerified: true,
    }),
    { enabled: false, reason: 'unavailable' },
  )
  assert.deepEqual(
    resolveUpdateAvailability({ platform: 'darwin', packaged: false }),
    { enabled: false, reason: 'unavailable' },
  )
})

test('codesign verify treats a zero exit as signed and any failure as unsigned', () => {
  assert.equal(
    inspectMacCodeSignature({
      execPath: '/Applications/App.app/Contents/MacOS/App',
      spawnSyncFn: () => ({ status: 0 }),
    }),
    true,
  )
  assert.equal(
    inspectMacCodeSignature({
      execPath: '/Applications/App.app/Contents/MacOS/App',
      spawnSyncFn: () => ({ status: 1, stderr: 'code object is not signed at all' }),
    }),
    false,
  )
  assert.equal(
    inspectMacCodeSignature({
      execPath: '/Applications/App.app/Contents/MacOS/App',
      spawnSyncFn: () => { throw new Error('spawn codesign ENOENT') },
    }),
    false,
  )
  assert.equal(inspectMacCodeSignature({ execPath: '', spawnSyncFn: () => ({ status: 0 }) }), false)
})

test('manual update checks on unsigned mac preview publish the preview reason', async () => {
  const controller = new DesktopUpdateController({
    updater: null,
    getWindow: () => undefined,
    currentVersion: '3.3.0',
    enabled: false,
    unavailableReason: UNSIGNED_MAC_PREVIEW_REASON,
  })
  assert.equal(await controller.check({ manual: true }), false)
  assert.equal(controller.getStatus().phase, 'unavailable')
  assert.equal(controller.getStatus().visible, true)
  assert.equal(controller.getStatus().reason, UNSIGNED_MAC_PREVIEW_REASON)
  assert.deepEqual(publicUpdateStatus(controller.getStatus()), {
    phase: 'unavailable',
    currentVersion: '3.3.0',
    version: undefined,
    releaseName: undefined,
    releaseNotes: undefined,
    source: undefined,
    percent: undefined,
    message: undefined,
    visible: true,
    reason: UNSIGNED_MAC_PREVIEW_REASON,
  })
})

test('update surface copy names the unsigned macOS preview and install docs mention Gatekeeper paths', async () => {
  const surface = await readFile(join(appDirectory, 'src', 'update-surface.mjs'), 'utf8')
  assert.match(surface, /预览版不支持自动更新/u)
  assert.match(surface, /未签名的 macOS 预览版无法使用应用内更新/u)
  assert.match(surface, /unsigned-mac-preview/u)

  const zh = await readFile(join(appDirectory, '..', '..', 'docs', 'macos-preview.zh.md'), 'utf8')
  const en = await readFile(join(appDirectory, '..', '..', 'docs', 'macos-preview.md'), 'utf8')
  for (const text of [zh, en]) {
    assert.match(text, /xattr -dr com\.apple\.quarantine/u)
    assert.match(text, /arm64/u)
  }
  assert.match(zh, /仍要打开/u)
  assert.match(zh, /macOS 15/u)
  assert.match(zh, /右键/u)
  assert.match(en, /Open Anyway/u)
  assert.match(en, /macOS 15/u)
  assert.match(en, /Right-click/u)
})
