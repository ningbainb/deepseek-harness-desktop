import { describe, expect, it } from 'vitest'

import {
  DESKTOP_COMPAT_PATCHES,
  validateCompatPatchRegistry,
  type DesktopCompatPatch,
} from '../src/patch-registry.ts'

const policy = {
  today: '2026-08-21',
  testExists: () => true,
}

describe('Desktop compat patch registry', () => {
  it('contains complete 3.0 removal evidence and legacy aliases', () => {
    const normalized = validateCompatPatchRegistry(DESKTOP_COMPAT_PATCHES, policy)
    expect(normalized).toEqual(DESKTOP_COMPAT_PATCHES)
    expect(DESKTOP_COMPAT_PATCHES.map((entry) => entry.id)).toEqual([
      'queued-turn-continuation',
      'cancellation-presentation',
      'tool-call-arguments-envelope',
      'desktop-skin-profile-isolation',
    ])
    for (const entry of DESKTOP_COMPAT_PATCHES) {
      expect(entry.appliesTo).toEqual(['0.1.1-rc.1'])
      expect(entry.applicableVersions).toEqual(entry.appliesTo)
      expect(entry.owner).toBe('desktop-platform')
      expect(entry.tests).toEqual([entry.test])
      expect(entry.test).toMatch(/^packages\/dsh-desktop-compat\/tests\/.+\.spec\.ts$/u)
      expect(entry.lastVerified).toBe('2026-08-21')
    }
  })

  it('normalizes a legacy entry without discarding its public aliases', () => {
    const legacy = {
      id: 'legacy-shape',
      applicableVersions: ['0.1.0-rc.7'],
      upstreamReference: 'Desktop 2.x compatibility registry fixture',
      owner: 'desktop-platform',
      test: 'packages/dsh-desktop-compat/tests/recovery.spec.ts',
      removeWhen: 'The legacy registry shape is no longer accepted by supported Desktop releases.',
      lastVerified: '2026-08-20',
    } satisfies DesktopCompatPatch

    const [normalized] = validateCompatPatchRegistry([legacy], policy)
    expect(normalized.appliesTo).toEqual(legacy.applicableVersions)
    expect(normalized.tests).toEqual([legacy.test])
    expect(normalized.applicableVersions).toEqual(legacy.applicableVersions)
    expect(normalized.test).toBe(legacy.test)
  })

  it('rejects duplicates, ranges, missing metadata, stale entries, and missing tests', () => {
    const valid = DESKTOP_COMPAT_PATCHES[0]
    expect(() => validateCompatPatchRegistry([valid, valid], policy)).toThrow(/duplicate/u)
    expect(() => validateCompatPatchRegistry([{
      ...valid,
      id: 'range-entry',
      appliesTo: ['^0.1.0'],
      applicableVersions: undefined,
    } satisfies DesktopCompatPatch], policy)).toThrow(/exact appliesTo versions/u)
    expect(() => validateCompatPatchRegistry([{
      ...valid,
      id: 'missing-owner',
      owner: undefined,
    } satisfies DesktopCompatPatch], policy)).toThrow(/owner/u)
    expect(() => validateCompatPatchRegistry([{
      ...valid,
      id: 'missing-tests',
      tests: undefined,
      test: undefined,
    } satisfies DesktopCompatPatch], policy)).toThrow(/declare tests/u)
    expect(() => validateCompatPatchRegistry([{
      ...valid,
      id: 'stale-entry',
      lastVerified: '2026-05-21',
    } satisfies DesktopCompatPatch], policy)).toThrow(/stale/u)
    expect(() => validateCompatPatchRegistry([{
      ...valid,
      id: 'long-stale-entry',
      lastVerified: '2020-01-01',
    } satisfies DesktopCompatPatch])).toThrow(/stale/u)
    expect(() => validateCompatPatchRegistry([valid], {
      ...policy,
      testExists: () => false,
    })).toThrow(/missing test/u)
  })
})
