import { describe, it, expect, vi } from 'vitest'
import { zh, en, type ValueModeLocaleKey } from '../src/client/locales.ts'
import { apply, inject } from '../src/client/index.ts'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/u

interface RegisteredSlot {
  descriptor: {
    inject: () => Record<string, unknown>
  }
  component: unknown
}

describe('ValueMode Client Plugin & Locales', () => {
  it('has exact 100% key match between zh and en dictionaries', () => {
    const zhKeys = Object.keys(zh) as ValueModeLocaleKey[]
    const enKeys = Object.keys(en) as ValueModeLocaleKey[]

    expect(zhKeys.toSorted()).toEqual(enKeys.toSorted())
    for (const key of zhKeys) {
      expect(typeof zh[key]).toBe('string')
      expect(typeof en[key]).toBe('string')
      expect(zh[key].length).toBeGreaterThan(0)
      expect(en[key].length).toBeGreaterThan(0)
    }
  })

  it('contains zero emoji in all localization strings', () => {
    for (const [key, value] of Object.entries(zh)) {
      expect(EMOJI_REGEX.test(value), `Found emoji in zh.${key}: ${value}`).toBe(false)
    }
    for (const [key, value] of Object.entries(en)) {
      expect(EMOJI_REGEX.test(value), `Found emoji in en.${key}: ${value}`).toBe(false)
    }
  })

  it('injects settings and header surfaces without a fake composer expert button', () => {
    const registeredSlots: Record<string, RegisteredSlot> = {}
    const mockCtx = {
      effect: vi.fn((fn) => fn()),
      locale: { register: vi.fn() },
      slots: {
        inject: vi.fn((_slotName, registerFn) => { registerFn() }),
        register: vi.fn((descriptor, component) => {
          registeredSlots[descriptor.name] = { descriptor, component }
        }),
      },
      settingsScope: {
        bind: vi.fn().mockReturnValue({
          getSnapshot: () => ({ value: { enabled: false } }),
          set: vi.fn(),
        }),
      },
      get: vi.fn().mockReturnValue(undefined),
    } as unknown as ClientContext

    expect(inject).toContain('slots')
    expect(inject).toContain('locale')
    expect(inject).toContain('connection')
    expect(inject).toContain('settingsScope')

    apply(mockCtx)

    expect(mockCtx.locale.register).toHaveBeenCalledWith('value-mode', { zh, en })
    expect(registeredSlots['web-ui.plugin.item']).toBeDefined()
    expect(registeredSlots['conversation.session.header.actions']).toBeDefined()
    expect(registeredSlots['conversation.input.left']).toBeUndefined()
  })

  it('loads the host-scoped configured model catalog for both independent selectors', async () => {
    const registeredSlots: Record<string, RegisteredSlot> = {}
    const groups = [{
      id: 'deepseek-official',
      name: 'DeepSeek',
      models: [{ id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash' }],
    }]
    const failures = [{ id: 'openai', name: 'OpenAI', message: 'temporarily unavailable' }]
    const models = vi.fn().mockResolvedValue({
      result: { ok: true, value: { groups, failures } },
    })
    const mockCtx = {
      effect: vi.fn((fn) => fn()),
      locale: { register: vi.fn() },
      slots: {
        inject: vi.fn((_slotName, registerFn) => { registerFn() }),
        register: vi.fn((descriptor, component) => {
          registeredSlots[descriptor.name] = { descriptor, component }
        }),
      },
      settingsScope: {
        bind: vi.fn().mockReturnValue({
          getSnapshot: () => ({ value: { enabled: false } }),
          set: vi.fn(),
        }),
      },
      get: vi.fn((name: string) => name === 'connection' ? { api: { llm: { models } } } : undefined),
    } as unknown as ClientContext

    apply(mockCtx)

    const settingsProps = registeredSlots['web-ui.plugin.item'].descriptor.inject()
    const headerProps = registeredSlots['conversation.session.header.actions'].descriptor.inject()
    const fetchModels = settingsProps.fetchModels as () => Promise<unknown>
    expect(headerProps.fetchModels).toBe(fetchModels)
    await expect(fetchModels()).resolves.toEqual({ groups, failures })
    expect(models).toHaveBeenCalledTimes(1)
    expect(models).toHaveBeenCalledWith({})
  })

  it('surfaces a host model-catalog refusal instead of silently showing an empty list', async () => {
    const registeredSlots: Record<string, RegisteredSlot> = {}
    const models = vi.fn().mockResolvedValue({
      result: { ok: false, error: { message: '模型目录服务暂不可用' } },
    })
    const mockCtx = {
      effect: vi.fn((fn) => fn()),
      locale: { register: vi.fn() },
      slots: {
        inject: vi.fn((_slotName, registerFn) => { registerFn() }),
        register: vi.fn((descriptor, component) => {
          registeredSlots[descriptor.name] = { descriptor, component }
        }),
      },
      settingsScope: {
        bind: vi.fn().mockReturnValue({
          getSnapshot: () => ({ value: { enabled: false } }),
          set: vi.fn(),
        }),
      },
      get: vi.fn((name: string) => name === 'connection' ? { api: { llm: { models } } } : undefined),
    } as unknown as ClientContext

    apply(mockCtx)

    const settingsProps = registeredSlots['web-ui.plugin.item'].descriptor.inject()
    const fetchModels = settingsProps.fetchModels as () => Promise<unknown>
    await expect(fetchModels()).rejects.toThrow('模型目录服务暂不可用')
  })
})
