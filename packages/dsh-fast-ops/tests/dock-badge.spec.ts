import { describe, expect, it } from 'vitest'
import { apply, FastOpsDockBadge, formatCompactTokens, summarizeFastOpsBadge } from '../src/client/index.ts'
import { en, zh } from '../src/client/locales.ts'

describe('FastOpsDockBadge & client registration', () => {
  it('formats compact token units consistently', () => {
    expect(formatCompactTokens(0)).toBe('0')
    expect(formatCompactTokens(-5)).toBe('0')
    expect(formatCompactTokens(Number.NaN)).toBe('0')
    expect(formatCompactTokens(840)).toBe('840')
    expect(formatCompactTokens(14_800)).toBe('14.8K')
    expect(formatCompactTokens(1_250_000)).toBe('1.25M')
    expect(formatCompactTokens(2_400_000_000)).toBe('2.4B')
  })

  it('summarizes standby, token savings, batch reads, and ops cleanly in zh and en', () => {
    const tZh = (key: keyof typeof zh) => zh[key]
    const tEn = (key: keyof typeof en) => en[key]

    expect(summarizeFastOpsBadge({}, tZh)).toEqual({
      active: false,
      totalSaved: 0,
      label: 'nbfast 省流已就绪',
    })
    expect(summarizeFastOpsBadge({}, tEn)).toEqual({
      active: false,
      totalSaved: 0,
      label: 'nbfast ready',
    })

    expect(summarizeFastOpsBadge({ denoiseTokensSaved: 8420, spillTokensSaved: 6380, filesReadInBatches: 18 }, tZh)).toEqual({
      active: true,
      totalSaved: 14800,
      label: 'nbfast 省 ~14.8K · 批读 18 文件',
    })
    expect(summarizeFastOpsBadge({ denoiseTokensSaved: 8420, spillTokensSaved: 6380, filesReadInBatches: 18 }, tEn)).toEqual({
      active: true,
      totalSaved: 14800,
      label: 'nbfast saved ~14.8K · read 18 files',
    })

    expect(summarizeFastOpsBadge({ spillTokensSaved: 3200 }, tZh).label).toBe('nbfast 省 ~3.2K tok')
    expect(summarizeFastOpsBadge({ filesReadInBatches: 6 }, tZh).label).toBe('nbfast 批读 6 文件')
    expect(summarizeFastOpsBadge({ astCalls: 3, cacheSpills: 2 }, tZh).label).toBe('nbfast 加速 5 次')
    expect(summarizeFastOpsBadge({ astCalls: 3, cacheSpills: 2 }, tEn).label).toBe('nbfast 5 ops')
  })

  it('keeps bilingual zh/en locale dictionaries complete without emojis', () => {
    const zhKeys = Object.keys(zh).sort()
    const enKeys = Object.keys(en).sort()
    expect(enKeys).toEqual(zhKeys)
    const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
    for (const key of zhKeys as Array<keyof typeof zh>) {
      expect(zh[key].length).toBeGreaterThan(0)
      expect(en[key].length).toBeGreaterThan(0)
      expect(emojiRe.test(zh[key])).toBe(false)
      expect(emojiRe.test(en[key])).toBe(false)
    }
  })

  it('registers both the settings card and the composer dock badge', () => {
    const slotsInjected: string[] = []
    const registrations: Array<{ name: string; id: string; order: number; locale?: string; component: unknown }> = []
    const ctx = {
      get: (name: string) => {
        if (name === 'locale') return { register: () => () => {} }
        if (name === 'slots') {
          return {
            inject: (slot: string, factory: () => () => void) => {
              slotsInjected.push(slot)
              factory()
              return () => {}
            },
            register: (spec: { name: string; id: string; order: number; locale?: string }, component: unknown) => {
              registrations.push({ ...spec, component })
              return () => {}
            },
          }
        }
        return undefined
      },
      effect: (cb: () => () => void) => cb(),
    }

    apply(ctx as never)
    expect(slotsInjected).toEqual(['web-ui.plugin.item', 'conversation.composer.dock'])
    expect(registrations).toEqual([
      expect.objectContaining({ name: 'web-ui.plugin.item', id: 'fast-ops', order: 117, locale: 'fast-ops' }),
      expect.objectContaining({
        name: 'conversation.composer.dock',
        id: 'fast-ops-dock',
        order: 105,
        locale: 'fast-ops',
        component: FastOpsDockBadge,
      }),
    ])
  })
})
