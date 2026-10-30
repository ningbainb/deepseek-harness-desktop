/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { DockPluginOptions, pluginOptionsKeys } from '../src/client/DockPluginOptions.tsx'
import { createPluginOptionsDirectory } from '../src/client/plugin-options-directory.ts'
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

it('opens a native settings section alongside existing row configuration and retains drafts', async () => {
  const renderSlot = vi.fn((name: string, _owner: unknown, options: { only?: string; entryKey?: string }) =>
    <input aria-label={`${name}:${options.only ?? options.entryKey}`} />)
  render(<DockPluginOptions directory={{ keys: () => ['dsh-builtin-browser#row', 'dsh-builtin-browser#section:dsh-builtin-browser'], subscribe: () => () => {} }} plugin="dsh-builtin-browser" renderSlot={renderSlot as never} t={translate} />)
  const row = await screen.findByLabelText('plugins.row.config:dsh-builtin-browser#row')
  fireEvent.change(row, { target: { value: 'unsaved' } })
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'dsh-builtin-browser#section:dsh-builtin-browser' } })
  await screen.findByLabelText('settings.section:dsh-builtin-browser')
  expect(renderSlot).toHaveBeenCalledWith('settings.section', { close: expect.any(Function) }, expect.objectContaining({ only: 'dsh-builtin-browser' }))
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'dsh-builtin-browser#row' } })
  expect((screen.getByLabelText('plugins.row.config:dsh-builtin-browser#row') as HTMLInputElement).value).toBe('unsaved')
})

it('tracks live native sections and both slot subscriptions without exposing another owner', () => {
  const entries = new Map<string, Array<{ options: { key?: string; id?: string } }>>([
    ['plugins.row.config', [{ options: { key: 'search#main' } }]],
    ['settings.section', [{ options: { id: 'prompt-pilot' } }, { options: { id: 'models' } }]],
  ])
  const listeners = new Map<string, () => void>()
  const dispose = vi.fn()
  const directory = createPluginOptionsDirectory({
    entriesOfSlot: key => entries.get(key) ?? [],
    subscribe: (key, listener) => { listeners.set(key, listener); return dispose },
  })
  expect(directory.keys()).toEqual(['search#main', '@local/dsh-prompt-pilot#section:prompt-pilot'])
  const notify = vi.fn()
  const unsubscribe = directory.subscribe(notify)
  expect([...listeners.keys()]).toEqual(['plugins.row.config', 'settings.section'])
  entries.set('settings.section', [{ options: { id: 'dsh-builtin-browser' } }])
  listeners.get('settings.section')!()
  expect(notify).toHaveBeenCalledOnce()
  expect(pluginOptionsKeys(directory.keys(), '@local/dsh-prompt-pilot')).toEqual([])
  expect(pluginOptionsKeys(directory.keys(), 'dsh-builtin-browser')).toEqual(['dsh-builtin-browser#section:dsh-builtin-browser'])
  unsubscribe()
  expect(dispose).toHaveBeenCalledTimes(2)
})
