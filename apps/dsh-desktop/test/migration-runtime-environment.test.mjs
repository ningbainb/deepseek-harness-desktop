import assert from 'node:assert/strict'
import test from 'node:test'

import { desktopRuntimeEnvironmentFor } from '../src/electron-app.mjs'

test('migration worker always disables background automation before a Runtime starts', () => {
  const credentials = { appId: 'desktop-app', appSecret: 'desktop-secret' }
  assert.deepEqual(desktopRuntimeEnvironmentFor({
    qqBotCredentials: credentials,
    backgroundAutomation: true,
    migrationWorker: false,
  }), {
    QQBOT_APPID: 'desktop-app',
    QQBOT_SECRET: 'desktop-secret',
    DSH_DESKTOP_BACKGROUND_AUTOMATION: '1',
    DSH_PERMISSION_MODE: 'workspace-write',
  })
  assert.deepEqual(desktopRuntimeEnvironmentFor({
    qqBotCredentials: credentials,
    backgroundAutomation: true,
    migrationWorker: true,
  }), {
    QQBOT_APPID: 'desktop-app',
    QQBOT_SECRET: 'desktop-secret',
    DSH_DESKTOP_BACKGROUND_AUTOMATION: '0',
    DSH_PERMISSION_MODE: 'workspace-write',
  })
})

test('the confirmed primary or isolated recovery Runtime receives full-user Agent and tool permissions', () => {
  assert.deepEqual(desktopRuntimeEnvironmentFor({
    backgroundAutomation: true,
    migrationWorker: false,
    fullUser: true,
  }), {
    QQBOT_APPID: '',
    QQBOT_SECRET: '',
    DSH_DESKTOP_BACKGROUND_AUTOMATION: '1',
    DSH_PERMISSION_MODE: 'danger-full-access',
  })

  assert.deepEqual(desktopRuntimeEnvironmentFor({
    backgroundAutomation: true,
    migrationWorker: false,
  }), {
    QQBOT_APPID: '',
    QQBOT_SECRET: '',
    DSH_DESKTOP_BACKGROUND_AUTOMATION: '1',
    DSH_PERMISSION_MODE: 'workspace-write',
  })
  assert.throws(
    () => desktopRuntimeEnvironmentFor({ fullUser: true, migrationWorker: true }),
    /migration worker cannot run with full-user permissions/u,
  )
})
