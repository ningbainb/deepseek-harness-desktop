/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
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
    select: vi.fn(async () => true),
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
      groups: [{ id: 'deepseek', name: 'DeepSeek', models: [
        { id: 'flash', name: 'DeepSeek-V41-Flash', description: 'Fast, efficient and economical' },
        { id: 'pro', name: 'DeepSeek-V4-Pro', description: 'Stronger agentic coding and reasoning' },
      ] }],
    }
    const view = render(<ModelSelect {...{ ...props, directory: {
      ...props.directory, getSnapshot: () => state,
    } } as never} />)
    fireEvent.click(view.getByRole('button', { name: 'trigger.aria' }))
    fireEvent.click(view.getByRole('menuitem', { name: /menu.models/ }))
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
})
