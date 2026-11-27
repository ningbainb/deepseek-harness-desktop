import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultSettings, normalizeSettings } from '../src/core/settings.ts'
import { readSettings, writeSettingsAtomic } from '../src/host/settings-store.ts'

describe('dsh-fast-ops settings', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it('clamps numeric bounds and validates booleans', () => {
    const defaults = defaultSettings()
    expect(defaults.enabled).toBe(true)
    expect(defaults.lazySpecializedTools).toBe(true)
    expect(defaults.maxInlineBytes).toBe(16384)

    const { settings, problems } = normalizeSettings({
      enabled: 'nope',
      lazySpecializedTools: false,
      batchingGuidance: 123,
      maxInlineBytes: 999999,
      resultCacheTtlMs: 10,
      maxCachedRefs: 9999,
    })

    expect(settings).toEqual({
      version: 1,
      enabled: true,
      lazySpecializedTools: false,
      batchingGuidance: true,
      maxInlineBytes: 65536,
      resultCacheTtlMs: 60000,
      maxCachedRefs: 512,
      denoise: { enabled: true, git: true, test: true, build: true },
    })
    expect(problems.sort()).toEqual([
      'batchingGuidance',
      'enabled',
      'maxCachedRefs',
      'maxInlineBytes',
      'resultCacheTtlMs',
    ])
  })

  it('persists settings atomically and reads them back', async () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-fast-ops-settings-'))
    dirs.push(home)

    await writeSettingsAtomic({
      enabled: false,
      lazySpecializedTools: false,
      batchingGuidance: false,
      maxInlineBytes: 32768,
      resultCacheTtlMs: 900000,
      maxCachedRefs: 64,
      denoise: { enabled: false, git: true, test: false, build: true },
    }, home)

    expect(await readSettings(home)).toEqual({
      version: 1,
      enabled: false,
      lazySpecializedTools: false,
      batchingGuidance: false,
      maxInlineBytes: 32768,
      resultCacheTtlMs: 900000,
      maxCachedRefs: 64,
      denoise: { enabled: false, git: true, test: false, build: true },
    })
  })
})
