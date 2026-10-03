/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { BaiModelAccess } from '../src/client/BaiModelAccess.tsx'
import { zh, type ModelPreferencesLocaleKey } from '../src/client/locales.ts'

afterEach(() => { cleanup(); document.body.replaceChildren() })
const translate = (key: ModelPreferencesLocaleKey) => zh[key]

it('does not expose an inert bai entry without the companion provider bridge', () => {
  render(<BaiModelAccess t={translate} />)
  expect(screen.queryByRole('button')).toBeNull()
})

it('follows provider bridge availability without removing the native model selector', () => {
  render(<><button>Native model selector</button><BaiModelAccess t={translate} /></>)
  const bridge = document.createElement('div')
  bridge.dataset.dshRelayAccessRoot = 'true'
  document.body.append(bridge)
  act(() => { document.dispatchEvent(new Event('dsh-relay-access-changed')) })
  expect(screen.getByRole('button', { name: zh['action.bai'] }).dataset.dshRelayConnect).toBe('true')
  expect(screen.getByRole('button', { name: 'Native model selector' })).toBeTruthy()
  bridge.remove()
  act(() => { document.dispatchEvent(new Event('dsh-relay-access-changed')) })
  expect(screen.queryByRole('button', { name: zh['action.bai'] })).toBeNull()
  expect(screen.getByRole('button', { name: 'Native model selector' })).toBeTruthy()
})
