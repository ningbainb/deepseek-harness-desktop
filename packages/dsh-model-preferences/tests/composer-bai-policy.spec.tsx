/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { ModelSelect, type ModelSelectProps } from '../src/client/ModelSelect.tsx'
import { zh, type ModelPreferencesLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)

it('renders the pending bai default without independent promotion controls or fake catalog rows', () => {
  const state: ModelDirectoryState = {
    current: { provider: 'project-relay', model: '__bai_login_required__' },
    routable: false, status: 'ready', pending: null, error: null,
    groups: [{ id: 'custom', name: 'Custom', models: [{ id: 'actual-model', name: 'Actual Model' }] }], failures: [],
  }
  const settings = { value: { version: 1, pinnedModels: [], providerOrder: [], disabledProviders: [], recentModels: [] } }
  const props = {
    locked: false, available: true, modelSessionId: 'isolated-session',
    directory: { getSnapshot: () => state, subscribe: () => () => {} },
    settingsScope: { getSnapshot: () => settings, subscribe: () => () => {} },
    load: vi.fn(), select: vi.fn(async () => ({ ok: true })),
    t: (key: ModelPreferencesLocaleKey) => zh[key],
  } as unknown as ModelSelectProps
  const view = render(<ModelSelect {...props} />)
  expect(screen.getByText(zh['trigger.baiPending'])).toBeTruthy()
  expect(view.container.querySelector('[data-dsh-relay-connect]')).toBeNull()
  fireEvent.click(screen.getByText(zh['trigger.baiPending']))
  expect(screen.getByRole('menu')).toBeTruthy()
  expect(view.container.querySelector('[data-dsh-relay-connect]')).toBeNull()
  fireEvent.click(screen.getByRole('menuitem', { name: /模型/u }))
  expect(screen.getAllByRole('menuitemradio')).toHaveLength(1)
  expect(screen.getByRole('menuitemradio', { name: 'Actual Model' })).toBeTruthy()
})
