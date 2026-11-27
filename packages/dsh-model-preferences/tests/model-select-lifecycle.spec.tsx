/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ModelSelect } from '../src/client/ModelSelect.tsx'

const READY_DIRECTORY_STATE = Object.freeze({
  current: null,
  routable: null,
  groups: [],
  failures: [],
  status: 'ready' as const,
  error: null,
})

const SETTINGS_STATE = Object.freeze({
  value: Object.freeze({
    version: 1 as const,
    pinnedModels: [],
    providerOrder: [],
    disabledProviders: [],
    recentModels: [],
  }),
  revision: 0,
  writable: true,
})

function createProps(load: () => void, modelSessionId = 'session-a') {
  return {
    locked: false,
    available: true,
    modelSessionId,
    directory: {
      subscribe: () => () => {},
      getSnapshot: () => READY_DIRECTORY_STATE,
    },
    settingsScope: {
      subscribe: () => () => {},
      getSnapshot: () => SETTINGS_STATE,
    },
    load,
    select: vi.fn(async () => ({ ok: true as const, value: undefined })),
    t: (key: string) => key,
  }
}

afterEach(() => cleanup())

describe('model selector lifecycle', () => {
  it('shows compact model names without descriptions and preserves model selection', async () => {
    const props = createProps(vi.fn())
    const state = {
      ...READY_DIRECTORY_STATE,
      current: { provider: 'deepseek', model: 'flash' },
      groups: [
        { id: 'project-relay', name: 'bai供应商', models: [
          { id: 'relay', name: 'bai 测试模型' },
        ] },
        { id: 'deepseek', name: 'DeepSeek', models: [
        { id: 'flash', name: 'DeepSeek-V41-Flash', description: 'Fast, efficient and economical' },
        { id: 'pro', name: 'DeepSeek-V4-Pro', description: 'Stronger agentic coding and reasoning' },
        ] },
      ],
    }
    const view = render(<ModelSelect {...{ ...props, directory: {
      ...props.directory, getSnapshot: () => state,
    } } as never} />)
    fireEvent.click(view.getByRole('button', { name: 'trigger.aria' }))
    fireEvent.click(view.getByRole('menuitem', { name: /menu.models/ }))
    expect(view.getByRole('group', { name: 'bai供应商' }).textContent).toContain('menu.recommended')
    expect(view.queryByText('Fast, efficient and economical')).toBeNull()
    expect(view.queryByText('Stronger agentic coding and reasoning')).toBeNull()
    expect(view.getByRole('menuitemradio', { name: 'DeepSeek-V41-Flash' }).getAttribute('aria-checked')).toBe('true')
    const pro = view.getByRole('menuitemradio', { name: 'DeepSeek-V4-Pro' })
    expect(pro.getAttribute('title')).toBe('DeepSeek-V4-Pro')
    fireEvent.click(pro)
    await waitFor(() => expect(props.select).toHaveBeenCalledWith({ provider: 'deepseek', model: 'pro' }))
    expect(view.queryByRole('menu')).toBeNull()
    expect(props.load).toHaveBeenCalledTimes(1)
  })

  it('does not reload when only the injected load callback identity changes', async () => {
    const firstLoad = vi.fn()
    const stableDirectory = createProps(firstLoad).directory
    const first = { ...createProps(firstLoad), directory: stableDirectory }
    const view = render(<ModelSelect {...first as never} />)
    await waitFor(() => expect(firstLoad).toHaveBeenCalledTimes(1))

    const replacementLoad = vi.fn()
    view.rerender(<ModelSelect {...{ ...createProps(replacementLoad), directory: stableDirectory } as never} />)
    await Promise.resolve()
    expect(firstLoad).toHaveBeenCalledTimes(1)
    expect(replacementLoad).not.toHaveBeenCalled()

    fireEvent.click(view.getByRole('button', { name: 'trigger.fallback' }))
    expect(replacementLoad).not.toHaveBeenCalled()

    const nextSessionLoad = vi.fn()
    view.rerender(<ModelSelect {...{
      ...createProps(nextSessionLoad, 'session-b'),
      directory: stableDirectory,
    } as never} />)
    await waitFor(() => expect(nextSessionLoad).toHaveBeenCalledTimes(1))
  })

  it('shows unauthenticated relay showcase entries in model menu and hides once relay models exist', async () => {
    const relayRoot = document.createElement('div')
    relayRoot.dataset.dshRelayAccessRoot = 'true'
    document.body.append(relayRoot)
    const signInSpy = vi.fn()
    document.addEventListener('dsh-relay-sign-in-required', signInSpy)

    try {
      const props = createProps(vi.fn())
      const unconfiguredState = {
        ...READY_DIRECTORY_STATE,
        groups: [{ id: 'deepseek', name: 'DeepSeek', models: [{ id: 'flash', name: 'DeepSeek-Flash' }] }],
      }
      const view = render(<ModelSelect {...{ ...props, directory: {
        ...props.directory, getSnapshot: () => unconfiguredState,
      } } as never} />)

      fireEvent.click(view.getByRole('button', { name: 'trigger.fallback' }))
      fireEvent.click(view.getByRole('menuitem', { name: /menu.models/ }))
      const showcase = view.getByRole('group', { name: 'relayShowcase.group' })
      expect(showcase.textContent).toContain('relayShowcase.claudeName')
      expect(showcase.textContent).toContain('relayShowcase.gptName')
      expect(showcase.textContent).toContain('relayShowcase.multiName')

      fireEvent.click(view.getByRole('menuitem', { name: /relayShowcase.claudeName/ }))
      expect(signInSpy).toHaveBeenCalledTimes(1)
      expect(view.queryByRole('menu')).toBeNull()

      const configuredState = {
        ...READY_DIRECTORY_STATE,
        groups: [{ id: 'project-relay', name: '聚合模型中转（bai）', models: [{ id: 'claude-sonnet-4', name: 'Claude Sonnet 4' }] }],
      }
      view.rerender(<ModelSelect {...{ ...props, directory: {
        ...props.directory, getSnapshot: () => configuredState,
      } } as never} />)
      fireEvent.click(view.getByRole('button', { name: 'trigger.fallback' }))
      fireEvent.click(view.getByRole('menuitem', { name: /menu.models/ }))
      expect(view.queryByRole('group', { name: 'relayShowcase.group' })).toBeNull()
    } finally {
      document.removeEventListener('dsh-relay-sign-in-required', signInSpy)
      relayRoot.remove()
    }
  })

  it('selects the local Gemini model in the current conversation without changing the Host model', async () => {
    let completeInitialFetch: ((response: Response) => void) | undefined
    const initialFetch = new Promise<Response>(resolve => { completeInitialFetch = resolve })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(initialFetch).mockResolvedValue(new Response(JSON.stringify({
      state: 'ready',
      harnessLlmAllowed: false,
      models: [
        { id: 'gpt-oss-120b', name: 'GPT OSS 120B' },
        { id: 'gemini-3.8-flash-low', name: 'Gemini 3.8 Flash (Low)' },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    const openSpy = vi.fn()
    document.addEventListener('dsh-antigravity-acp-open', openSpy)
    try {
      const props = { ...createProps(vi.fn()), sessionCwd: 'D:\\work\\demo' }
      const view = render(<ModelSelect {...props as never} />)
      await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('/api/dsh-antigravity-cli', { headers: { 'x-dsh-antigravity': '1' } }))
      window.dispatchEvent(new Event('dsh-antigravity-status-updated'))

      fireEvent.click(view.getByRole('button', { name: 'trigger.fallback' }))
      fireEvent.click(view.getByRole('menuitem', { name: /menu.models/ }))

      const group = await view.findByRole('group', { name: 'antigravity.group' })
      await act(async () => { completeInitialFetch?.(Response.json({ state: 'unavailable' })) })
      expect(view.getByRole('group', { name: 'antigravity.group' })).toBe(group)
      const items = [...group.querySelectorAll('[data-dsh-antigravity-model]')]
      expect(items.map(el => el.getAttribute('data-dsh-antigravity-model'))).toEqual(['gemini-3.8-flash-low', 'gpt-oss-120b'])

      fireEvent.click(items[0]!)
      expect(openSpy).toHaveBeenCalledTimes(1)
      expect((openSpy.mock.calls[0][0] as CustomEvent).detail).toEqual({
        modelId: 'gemini-3.8-flash-low',
        cwd: 'D:\\work\\demo',
        conversationId: 'session-a',
      })
      expect(props.select).not.toHaveBeenCalled()
      expect(view.queryByRole('menu')).toBeNull()
    } finally {
      document.removeEventListener('dsh-antigravity-acp-open', openSpy)
      fetchSpy.mockRestore()
    }
  })
})
