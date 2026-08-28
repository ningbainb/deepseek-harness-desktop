import assert from 'node:assert/strict'
import test from 'node:test'

import { desktopRuntimeEnvironmentFor } from '../src/electron-app.mjs'

test('the primary Runtime receives the requested automation and permission policy directly', () => {
  assert.deepEqual(desktopRuntimeEnvironmentFor({
    credentialEnvironment: { DEEPSEEK_API_KEY: 'legacy-key' },
    qqBotCredentials: { appId: 'desktop-app', appSecret: 'desktop-secret' },
    backgroundAutomation: true,
    fullUser: true,
  }), {
    CI: '1',
    DSH_DESKTOP_NO_INTERACTIVE: '1',
    QQBOT_DISABLE_CLI_SETUP: '1',
    DEBIAN_FRONTEND: 'noninteractive',
    DEEPSEEK_API_KEY: 'legacy-key',
    QQBOT_APPID: 'desktop-app',
    QQBOT_SECRET: 'desktop-secret',
    DSH_DESKTOP_BACKGROUND_AUTOMATION: '1',
    DSH_PERMISSION_MODE: 'danger-full-access',
  })
  assert.deepEqual(desktopRuntimeEnvironmentFor({ backgroundAutomation: false }), {
    CI: '1',
    DSH_DESKTOP_NO_INTERACTIVE: '1',
    QQBOT_DISABLE_CLI_SETUP: '1',
    DEBIAN_FRONTEND: 'noninteractive',
    QQBOT_APPID: '',
    QQBOT_SECRET: '',
    DSH_DESKTOP_BACKGROUND_AUTOMATION: '0',
    DSH_PERMISSION_MODE: 'workspace-write',
  })
})

test('permission mode rejects non-boolean fullUser values', () => {
  assert.throws(() => desktopRuntimeEnvironmentFor({ fullUser: 'yes' }), /must be a boolean/u)
})

test('credential compatibility environment rejects runtime controls and non-string values', () => {
  assert.throws(
    () => desktopRuntimeEnvironmentFor({ credentialEnvironment: { DSH_HOME: 'wrong-home' } }),
    /credential environment/u,
  )
  assert.throws(
    () => desktopRuntimeEnvironmentFor({ credentialEnvironment: { DEEPSEEK_API_KEY: 42 } }),
    /credential environment/u,
  )
})
