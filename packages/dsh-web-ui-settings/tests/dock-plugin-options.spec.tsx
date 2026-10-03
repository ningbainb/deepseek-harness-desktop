/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { DockPluginOptions, pluginOptionsKeys } from '../src/client/DockPluginOptions.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const translate: PropsLocale<'web-ui-plugins'>['t'] = key => zh[key as keyof typeof zh] ?? key

it('selects only the exact package row configuration keys without prefix collisions', () => {
  expect(pluginOptionsKeys(['dsh-free-search#web-search-free', 'dsh-free-search-pro#other', 'dsh-free-search#web-search-free', 'bad'], 'dsh-free-search'))
    .toEqual(['dsh-free-search#web-search-free'])
  expect(pluginOptionsKeys(['@author/search#main'], '@author/search')).toEqual(['@author/search#main'])
})

it('dispatches the original plugin page through the official keyed slot contract', async () => {
  const renderSlot = vi.fn(() => <button>插件自己的保存按钮</button>)
  render(<DockPluginOptions directory={{ keys: () => ['dsh-free-search#web-search-free'], subscribe: () => () => {} }} plugin="dsh-free-search" renderSlot={renderSlot as never} t={translate} />)
  await screen.findByRole('button', { name: '插件自己的保存按钮' })
  expect(renderSlot).toHaveBeenCalledWith('plugins.row.config', { view: 'page' }, expect.objectContaining({ entryKey: 'dsh-free-search#web-search-free' }))
})

it('keeps drafts mounted when switching between registered plugin configuration pages', async () => {
  render(<DockPluginOptions directory={{ keys: () => ['search#first', 'search#second'], subscribe: () => () => {} }} plugin="search" renderSlot={((_name: string, _owner: unknown, options: { entryKey: string }) => <input aria-label={options.entryKey} />) as never} t={translate} />)
  const first = await screen.findByLabelText('search#first')
  fireEvent.change(first, { target: { value: 'draft' } })
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'search#second' } })
  await screen.findByLabelText('search#second')
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'search#first' } })
  expect((screen.getByLabelText('search#first') as HTMLInputElement).value).toBe('draft')
})

it('follows late registrations and removes disposed pages without stale authority', async () => {
  let keys: string[] = []
  let notify: () => void = () => {}
  const unsubscribe = vi.fn()
  const directory = { keys: () => keys, subscribe: (listener: () => void) => { notify = listener; return unsubscribe } }
  const view = render(<DockPluginOptions directory={directory} plugin="search" renderSlot={(() => <button>原生配置</button>) as never} t={translate} />)
  expect(screen.getByRole('status').textContent).toContain(zh.pluginOptionsUnavailable)
  act(() => { keys = ['search#entry']; notify() })
  await screen.findByRole('button', { name: '原生配置' })
  act(() => { keys = []; notify() })
  expect(screen.queryByRole('button', { name: '原生配置' })).toBeNull()
  view.unmount()
  expect(unsubscribe).toHaveBeenCalledOnce()
})

it('shows an explicit unavailable state instead of another package configuration', () => {
  const renderSlot = vi.fn()
  render(<DockPluginOptions directory={{ keys: () => ['other#entry'], subscribe: () => () => {} }} plugin="search" renderSlot={renderSlot as never} t={translate} />)
  expect(screen.getByRole('status').textContent).toBe(zh.pluginOptionsUnavailable)
  expect(renderSlot).not.toHaveBeenCalled()
})
