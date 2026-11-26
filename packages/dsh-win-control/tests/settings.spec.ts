import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultSettings, normalizeSettings } from '../src/core/settings.ts'
import { readSettings, writeSettingsAtomic } from '../src/host/settings-store.ts'

describe('dsh-win-control settings', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it('returns safe defaults and reports invalid fields when normalizing', () => {
    const defaults = defaultSettings()
    expect(defaults.bridge.screenshotScale).toBe(0.75)
    expect(defaults.plugin.lazyTools).toBe(true)
    expect(defaults.plugin.defaultGrant).toBe(false)

    const { settings, problems } = normalizeSettings({
      bridge: {
        toolCallTimeoutMs: 99999999,
        screenshotScale: 0.42,
        screenshotBackend: 'bad',
        excludeTools: ['App', 'UnknownTool', 'App'],
        disableFlash: 'yes',
      },
      plugin: {
        preferredMirror: 'invalid-mirror',
        lazyTools: 'nope',
        defaultGrant: 1,
      },
    })

    expect(settings).toEqual({
      version: 1,
      bridge: {
        toolCallTimeoutMs: 120000,
        excludeTools: ['App'],
        screenshotScale: 0.75,
        screenshotBackend: 'auto',
        disableFlash: true,
      },
      plugin: {
        preferredMirror: 'auto',
        lazyTools: true,
        defaultGrant: false,
      },
    })
    expect(problems.sort()).toEqual([
      'bridge.disableFlash',
      'bridge.excludeTools',
      'bridge.screenshotBackend',
      'bridge.screenshotScale',
      'bridge.toolCallTimeoutMs',
      'plugin.defaultGrant',
      'plugin.lazyTools',
      'plugin.preferredMirror',
    ])
  })

  it('writes and reads settings atomically', async () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-win-control-settings-'))
    dirs.push(home)

    await writeSettingsAtomic({
      bridge: {
        toolCallTimeoutMs: 60000,
        excludeTools: ['PowerShell'],
        screenshotScale: 0.5,
        screenshotBackend: 'mss',
        disableFlash: false,
      },
      plugin: {
        preferredMirror: 'ustc',
        lazyTools: false,
        defaultGrant: true,
      },
    }, home)

    const loaded = await readSettings(home)
    expect(loaded).toEqual({
      version: 1,
      bridge: {
        toolCallTimeoutMs: 60000,
        excludeTools: ['PowerShell'],
        screenshotScale: 0.5,
        screenshotBackend: 'mss',
        disableFlash: false,
      },
      plugin: {
        preferredMirror: 'ustc',
        lazyTools: false,
        defaultGrant: true,
      },
    })
  })
})
