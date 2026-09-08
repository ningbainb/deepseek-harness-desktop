/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ProjectDialog } from '../src/client/ProjectDialog.tsx'
import { installBrowserClose, installProjectDialog } from '../src/client/desktop-interactions.tsx'

afterEach(cleanup)
function services(items: unknown[] = []) {
  return {
    workspaces: { list: { getSnapshot: () => ({ items }) }, pickDirectory: vi.fn(async () => 'D:\\example'), create: vi.fn(async () => ({ workspaceId: 'w', path: 'D:\\example' })), rename: vi.fn(async () => ({})), connectWorkspace: vi.fn(async () => 'session') },
    sessions: { open: vi.fn() },
  }
}
it('chooses a folder, seeds its name, registers and enters a real workspace', async () => {
  const telemetry = vi.fn().mockRejectedValue(new Error('offline'))
  vi.stubGlobal('dshDesktop', { recordFeatureEvent: telemetry })
  const api = services(), close = vi.fn()
  render(<ProjectDialog services={api as never} onClose={close} />)
  expect((screen.getByRole('button', { name: '创建项目' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: /点击选择/ }))
  await waitFor(() => expect((screen.getByLabelText('项目名称') as HTMLInputElement).value).toBe('example'))
  fireEvent.change(screen.getByLabelText('项目名称'), { target: { value: '我的项目' } })
  fireEvent.click(screen.getByRole('button', { name: '创建项目' }))
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1))
  expect(api.workspaces.create).toHaveBeenCalledWith({ path: 'D:\\example' })
  expect(api.workspaces.rename).toHaveBeenCalledWith('w', '我的项目')
  expect(api.sessions.open).toHaveBeenCalledWith('session')
  expect(telemetry.mock.calls).toEqual([
    [{ feature: 'project', outcome: 'started', detail: 'create' }],
    [{ feature: 'project', outcome: 'succeeded', detail: 'create' }],
  ])
  vi.unstubAllGlobals()
})
it('keeps an edited name and opens duplicate folders without renaming them', async () => {
  const api = services([{ workspaceId: 'existing', path: 'd:/example/', title: 'Existing' }])
  render(<ProjectDialog services={api as never} onClose={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('项目名称'), { target: { value: 'Custom' } })
  fireEvent.click(screen.getByRole('button', { name: /点击选择/ }))
  await screen.findByRole('button', { name: '打开已有项目' })
  expect((screen.getByLabelText('项目名称') as HTMLInputElement).value).toBe('Custom')
  fireEvent.click(screen.getByRole('button', { name: '打开已有项目' }))
  await waitFor(() => expect(api.sessions.open).toHaveBeenCalled())
  expect(api.workspaces.create).not.toHaveBeenCalled(); expect(api.workspaces.rename).not.toHaveBeenCalled()
})
it('retains the registered workspace on a rename failure and safely retries', async () => {
  const api = services(), close = vi.fn()
  api.workspaces.rename.mockRejectedValueOnce(new Error('offline'))
  render(<ProjectDialog services={api as never} onClose={close} />)
  fireEvent.click(screen.getByRole('button', { name: /点击选择/ }))
  await waitFor(() => expect((screen.getByLabelText('项目名称') as HTMLInputElement).value).toBe('example'))
  fireEvent.click(screen.getByRole('button', { name: '创建项目' }))
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: '创建项目' }))
  await waitFor(() => expect(close).toHaveBeenCalled())
  expect(api.workspaces.create).toHaveBeenCalledTimes(1)
})
it('delegates persistent browser close to the matching tab, including multiple browsers', async () => {
  document.body.innerHTML = '<div data-dsh-panel-host><div><div><div draggable="true"><button aria-label="关闭">one</button></div><div draggable="true"><button aria-label="关闭">two</button></div></div></div><div><div><div><div><input placeholder="输入网址，例如 example.com"></div></div></div><div><div><div><input placeholder="Enter a URL, e.g. example.com"></div></div></div></div></div>'
  const actions = [...document.querySelectorAll('button')].map(button => { const fn = vi.fn(); button.addEventListener('click', fn); return fn })
  const dispose = installBrowserClose(document)
  const buttons = screen.getAllByRole('button', { name: '关闭浏览器' })
  expect(buttons).toHaveLength(2)
  fireEvent.click(buttons[1]!)
  expect(actions[0]).not.toHaveBeenCalled(); expect(actions[1]).toHaveBeenCalledTimes(1)
  dispose(); expect(document.querySelector('[data-dsh-browser-close]')).toBeNull()
  document.body.innerHTML = ''
})

it('routes the home workspace selector to the new dialog and retains existing project selection', async () => {
  const api = services([{ workspaceId: 'existing', path: 'D:/example', title: 'Existing' }])
  const pickFolder = vi.fn()
  Object.defineProperty(window, 'dshDesktop', { configurable: true, value: { pickProjectDirectory: pickFolder } })
  const trigger = document.createElement('button')
  trigger.setAttribute('aria-label', '选择工作区'); trigger.textContent = 'Existing'
  document.body.append(trigger)
  const dispose = installProjectDialog(api as never)
  try {
    fireEvent.click(trigger)
    await screen.findByRole('dialog', { name: '选择工作区' })
    fireEvent.click(screen.getByRole('button', { name: /Existing D:\/example/ }))
    fireEvent.click(screen.getByRole('button', { name: '打开已有项目' }))
    await waitFor(() => expect(api.sessions.open).toHaveBeenCalled())
    expect(api.workspaces.create).not.toHaveBeenCalled()
    expect(api.workspaces.rename).not.toHaveBeenCalled()
    expect(pickFolder).not.toHaveBeenCalled()
  } finally { dispose(); trigger.remove(); Reflect.deleteProperty(window, 'dshDesktop') }
})
