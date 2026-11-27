/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const desktop = vi.hoisted(() => ({
  dismissDockNudge: vi.fn(),
  getDockEntryState: vi.fn(),
  hasCapability: vi.fn(),
  openDesktopSurface: vi.fn(),
}))

vi.mock('@linxin666/dsh-desktop-client', () => desktop)

import {
  DesktopCollaborationEntry,
  DesktopExtensionDockEntry,
  calculateDockNudgePosition,
  installDesktopManagementRouting,
  selectWorkshopSource,
} from '../src/client/desktop-extension-dock.tsx'
import { zh } from '../src/client/locales.ts'

const t = ((key: keyof typeof zh) => zh[key]) as never

describe('Desktop experimental plugin navigation', () => {
  let openPage: (destination: string) => void
  let dispose: () => void
  let routeChange: () => void
  let connectionChange: () => void
  let activePanelId: string | null
  let generation: { id: number } | undefined
  const offPanel = vi.fn()
  const offConnection = vi.fn()
  const navigation = {
    openPlugins: vi.fn(() => { activePanelId = 'plugins'; routeChange(); return true }),
    openSettings: vi.fn(() => true),
    panelInfo: {
      getSnapshot: () => ({ activePanelId }),
      subscribe: (listener: () => void) => { routeChange = listener; return offPanel },
    },
    generation: {
      getSnapshot: () => generation,
      subscribe: (listener: () => void) => { connectionChange = listener; return offConnection },
    },
  }
  const more = vi.fn()

  function mountPanel() {
    const panel = document.createElement('section')
    panel.setAttribute('data-plugin-panel', '')
    panel.setAttribute('aria-busy', 'true')
    document.body.append(panel)
    return panel
  }

  function finishInventory(panel: HTMLElement) {
    panel.innerHTML = '<div role="tabpanel" id="plugins-installed-panel"><section data-plugin-group="extensions"><div><h3></h3><button>More</button></div></section></div>'
    panel.querySelector('button')!.addEventListener('click', more)
    panel.setAttribute('aria-busy', 'false')
  }

  beforeEach(async () => {
    vi.useFakeTimers()
    activePanelId = null
    generation = { id: 1 }
    document.body.innerHTML = '<aside data-pane="sidebar"></aside>'
    Object.assign(window, { dshDesktop: { onNativePageOpen(listener: typeof openPage) { openPage = listener } } })
    desktop.hasCapability.mockResolvedValue(true)
    dispose = installDesktopManagementRouting(document, t, navigation)
    await Promise.resolve()
  })

  afterEach(() => {
    dispose()
    document.body.replaceChildren()
    vi.useRealTimers()
  })

  it('opens More on the first render after a slow inventory without another timer tick', async () => {
    openPage('experimental-plugins')
    await vi.advanceTimersByTimeAsync(46_000)
    const panel = mountPanel()
    await Promise.resolve()
    finishInventory(panel)
    await Promise.resolve()
    expect(more).toHaveBeenCalledOnce()
    finishInventory(panel)
    await Promise.resolve()
    expect(more).toHaveBeenCalledOnce()
    expect(navigation.openPlugins).toHaveBeenCalledOnce()
    expect(offConnection).toHaveBeenCalledOnce()
  })

  it.each(['native destination', 'keyboard', 'SDK panel switch', 'disconnect', 'panel replacement', 'dispose'])(
    'cancels pending More on %s', async reason => {
      openPage('experimental-plugins')
      const panel = mountPanel()
      await Promise.resolve()
      if (reason === 'native destination') openPage('appearance')
      if (reason === 'keyboard') fireEvent.keyDown(document.body, { key: 'Tab' })
      if (reason === 'SDK panel switch') { activePanelId = 'settings'; routeChange() }
      if (reason === 'disconnect') { generation = undefined; connectionChange() }
      if (reason === 'panel replacement') panel.remove()
      if (reason === 'dispose') dispose()
      finishInventory(panel.isConnected ? panel : mountPanel())
      await vi.advanceTimersByTimeAsync(250)
      expect(more).not.toHaveBeenCalled()
      expect(offPanel).toHaveBeenCalledOnce()
      expect(offConnection).toHaveBeenCalledOnce()
    },
  )

  it('waits for the list to replace a previously open More view', async () => {
    const panel = mountPanel()
    panel.setAttribute('aria-busy', 'false')
    panel.innerHTML = '<section data-plugin-group="more"></section>'
    openPage('experimental-plugins')
    finishInventory(panel)
    await Promise.resolve()
    expect(more).toHaveBeenCalledOnce()
  })

  it('cancels a retry while the navigation service is still registering', async () => {
    navigation.openPlugins.mockReturnValueOnce(false)
    openPage('experimental-plugins')
    openPage('appearance')
    await vi.advanceTimersByTimeAsync(250)
    expect(navigation.openPlugins).toHaveBeenCalledOnce()
    expect(navigation.openSettings).toHaveBeenCalledWith('appearance')
    expect(offConnection).toHaveBeenCalledOnce()
  })

  it.each([
    '<div role="tabpanel" id="plugins-installed-panel"><p>No plugins</p></div>',
    '<div data-plugin-body><header data-plugin-bar></header><div><p>No plugins</p></div></div>',
  ])('finishes an already empty inventory without following a future refresh', async markup => {
    const panel = mountPanel()
    panel.setAttribute('aria-busy', 'false')
    panel.innerHTML = markup
    openPage('experimental-plugins')
    expect(offPanel).toHaveBeenCalledOnce()
    finishInventory(panel)
    await Promise.resolve()
    expect(more).not.toHaveBeenCalled()
  })

  it('waits for the installed tab when the previous Discover tab is empty', async () => {
    const panel = mountPanel()
    panel.setAttribute('aria-busy', 'false')
    panel.innerHTML = '<div role="tabpanel" id="plugins-discover-panel"><p>No matches</p></div>'
    openPage('experimental-plugins')
    finishInventory(panel)
    await Promise.resolve()
    expect(more).toHaveBeenCalledOnce()
  })
})

beforeEach(() => {
  desktop.getDockEntryState.mockResolvedValue({ available: true, showNudge: true })
  desktop.hasCapability.mockResolvedValue(true)
  desktop.dismissDockNudge.mockResolvedValue(true)
  desktop.openDesktopSurface.mockResolvedValue(true)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  delete (window as unknown as { dshDesktop?: unknown }).dshDesktop
})

it('keeps Workshop navigation pending until its listing is ready and retries each transient read once', () => {
  const url = 'https://example.test/workshop.json'
  const face = { hooks: { discover: { getSnapshot: vi.fn() } }, select: vi.fn(), reload: vi.fn(), retry: vi.fn() }
  const retried = { sources: false, listing: false }
  const read = () => selectWorkshopSource(face, url, retried)
  face.hooks.discover.getSnapshot.mockReturnValue({ status: 'error' })
  expect(read()).toBe(false)
  expect(read()).toBe(false)
  expect(face.reload).toHaveBeenCalledOnce()
  face.hooks.discover.getSnapshot.mockReturnValue({ status: 'ready', indexes: [] })
  expect(read()).toBe(false)
  expect(face.select).not.toHaveBeenCalled()
  const ready = { status: 'ready', indexes: [{ url }], selected: 'https://example.test/custom.json' }
  face.hooks.discover.getSnapshot.mockReturnValue(ready)
  expect(read()).toBe(false)
  expect(face.select).toHaveBeenCalledWith(url)
  const selected = { ...ready, selected: url }
  face.hooks.discover.getSnapshot.mockReturnValue({ ...selected, listing: { url, status: 'error', failure: 'fetch' } })
  expect(read()).toBe(false)
  expect(read()).toBe(false)
  expect(face.retry).toHaveBeenCalledOnce()
  face.hooks.discover.getSnapshot.mockReturnValue({ ...selected, listing: { url, status: 'ready' } })
  expect(read()).toBe(true)
})

describe('Desktop Extension Dock entry', () => {
  it('ignores streamed chat changes and restores routing after sidebar replacement', async () => {
    document.body.innerHTML = '<aside data-pane="sidebar"><button aria-label="插件">插件</button><button data-dsh-balance-entry><span data-dsh-balance-amount></span></button></aside><main data-pane="conversation"></main>'
    const dispose = installDesktopManagementRouting(document, t)
    await waitFor(() => expect(screen.getByRole('button', { name: '插件' }).dataset.dshDesktopManagementEntry).toBe('plugins'))
    const sidebar = document.querySelector<HTMLElement>('[data-pane="sidebar"]')!
    const conversation = document.querySelector<HTMLElement>('main')!
    const amount = document.querySelector<HTMLElement>('[data-dsh-balance-amount]')!
    const query = vi.spyOn(document, 'querySelector')
    const sidebarQuery = vi.spyOn(sidebar, 'querySelectorAll')
    for (let index = 0; index < 20; index++) {
      conversation.textContent = `chunk ${index}`
      amount.textContent = `${index}.00`
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    expect(query).not.toHaveBeenCalled()
    expect(sidebarQuery).not.toHaveBeenCalled()
    query.mockRestore()
    sidebarQuery.mockRestore()
    const replacement = document.createElement('aside')
    replacement.dataset.pane = 'sidebar'
    replacement.innerHTML = '<button aria-label="插件">插件</button><button data-dsh-skill-explorer-entry>技能中心</button>'
    sidebar.replaceWith(replacement)
    const plugin = screen.getByRole('button', { name: '插件' })
    await waitFor(() => expect(plugin.dataset.dshDesktopManagementEntry).toBe('plugins'))
    fireEvent.click(plugin)
    await waitFor(() => expect(desktop.openDesktopSurface).toHaveBeenCalledWith('extensions', { tab: 'plugins' }))
    dispose()
    expect(plugin.dataset.dshDesktopManagementEntry).toBeUndefined()
  })

  it('routes the current public skill-explorer entry without removing its native marker', async () => {
    document.body.innerHTML = '<aside data-pane="sidebar"><button aria-label="技能中心"><span data-dsh-panel-entry="skill-explorer">技能中心</span></button></aside>'
    const dispose = installDesktopManagementRouting(document, t)
    const skill = screen.getByRole('button', { name: '技能中心' })
    await waitFor(() => expect(skill.dataset.dshDesktopManagementEntry).toBe('skills'))
    expect(skill.hasAttribute('data-dsh-skill-explorer-entry')).toBe(true)
    fireEvent.click(skill)
    await waitFor(() => expect(desktop.openDesktopSurface).toHaveBeenCalledWith('extensions', { tab: 'skills' }))
    expect(skill.querySelector('[data-dsh-panel-entry="skill-explorer"]')).not.toBeNull()
    dispose()
    expect(skill.dataset.dshDesktopManagementEntry).toBeUndefined()
    expect(skill.hasAttribute('data-dsh-skill-explorer-entry')).toBe(false)
  })

  it('opens the same Dock management pages from the main sidebar', async () => {
    document.body.innerHTML = '<aside data-pane="sidebar"><button aria-label="插件">插件</button><button data-dsh-skill-explorer-entry aria-label="技能中心">技能中心</button></aside>'
    const dispose = installDesktopManagementRouting(document, t)
    const plugin = screen.getByRole('button', { name: '插件' })
    const skill = screen.getByRole('button', { name: '技能中心' })
    await waitFor(() => expect(plugin.dataset.dshDesktopManagementEntry).toBe('plugins'))
    expect(skill.dataset.dshDesktopManagementEntry).toBe('skills')

    fireEvent.click(plugin)
    await waitFor(() => expect(desktop.openDesktopSurface).toHaveBeenCalledWith('extensions', { tab: 'plugins' }))
    fireEvent.click(skill)
    await waitFor(() => expect(desktop.openDesktopSurface).toHaveBeenCalledWith('extensions', { tab: 'skills' }))
    expect(desktop.openDesktopSurface).toHaveBeenCalledTimes(2)
    dispose()
    expect(plugin.dataset.dshDesktopManagementEntry).toBeUndefined()
  })

  it('keeps Dock as the list entry while reopening one plugin native configuration page', async () => {
    let request: ((value: { name: string }) => void) | undefined
    const unsubscribe = vi.fn()
    ;(window as unknown as { dshDesktop: unknown }).dshDesktop = {
      onPluginSettingsOpen(listener: (value: { name: string }) => void) {
        request = listener
        return unsubscribe
      },
    }
    document.body.innerHTML = '<aside data-pane="sidebar"><button aria-label="插件">插件</button></aside>'
    const nativeEntry = screen.getByRole('button', { name: '插件' })
    let nativePageOpens = 0
    nativeEntry.addEventListener('click', () => {
      nativePageOpens++
      const card = document.createElement('article')
      card.dataset.pluginPackage = 'dsh-free-search'
      const open = document.createElement('button')
      open.setAttribute('aria-label', '查看 dsh-free-search')
      open.addEventListener('click', () => {
        const detail = document.createElement('section')
        detail.dataset.pluginDetail = 'dsh-free-search'
        document.body.append(detail)
      })
      card.append(open)
      document.body.append(card)
    })
    const dispose = installDesktopManagementRouting(document, t)
    await waitFor(() => expect(nativeEntry.dataset.dshDesktopManagementEntry).toBe('plugins'))

    request?.({ name: 'dsh-free-search' })
    await waitFor(() => expect(document.querySelector('[data-plugin-detail="dsh-free-search"]')).not.toBeNull())
    expect(nativePageOpens).toBe(1)
    expect(desktop.openDesktopSurface).not.toHaveBeenCalled()
    dispose()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('shows a collaboration shortcut only on Desktop and deep-links to the unified page', async () => {
    render(<DesktopCollaborationEntry wide={true} t={t} />)
    const trigger = await screen.findByRole('button', { name: '模型协作' })
    expect(trigger.textContent).toContain('模型协作')
    fireEvent.click(trigger)
    await waitFor(() => expect(desktop.openDesktopSurface).toHaveBeenCalledWith('extensions', { setting: 'value-mode' }))

    cleanup()
    desktop.hasCapability.mockResolvedValueOnce(false)
    render(<DesktopCollaborationEntry wide={false} t={t} />)
    await waitFor(() => expect(screen.queryByRole('button', { name: '模型协作' })).toBeNull())
  })

  it('keeps the collaboration shortcut accessible when the sidebar is collapsed', async () => {
    render(<DesktopCollaborationEntry wide={false} t={t} />)
    const trigger = await screen.findByRole('button', { name: '模型协作' })
    expect(trigger.getAttribute('title')).toBe('模型协作')
    expect(trigger.textContent).toBe('')
  })
  it('stays absent on ordinary Web hosts', async () => {
    desktop.getDockEntryState.mockResolvedValue({ available: false, reason: 'unavailable' })
    render(<DesktopExtensionDockEntry wide={true} t={t} />)
    await waitFor(() => expect(desktop.getDockEntryState).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('button', { name: '打开拓展坞' })).toBeNull()
  })

  it('shows the shared brand icon and full label without clipping in the wide sidebar', async () => {
    const { container } = render(<DesktopExtensionDockEntry wide={true} t={t} />)
    const trigger = await screen.findByRole('button', { name: '打开拓展坞' })
    expect(trigger.textContent).toContain('打开拓展坞')
    expect(trigger.parentElement?.hasAttribute('data-dsh-extension-dock-entry')).toBe(true)
    const icon = container.querySelector('img[aria-hidden="true"]')
    expect(icon?.getAttribute('src')).toMatch(/^data:image\/png;base64,/u)
    expect(icon?.getAttribute('width')).toBe('20')
  })

  it('keeps the brand icon inside the collapsed sidebar safe area', async () => {
    const { container } = render(<DesktopExtensionDockEntry wide={false} t={t} />)
    const trigger = await screen.findByRole('button', { name: '打开拓展坞' })
    expect(trigger.textContent).toBe('')
    const icon = container.querySelector('img[aria-hidden="true"]')
    expect(icon?.getAttribute('width')).toBe('22')
    expect(trigger.getAttribute('title')).toBe('打开拓展坞')
  })

  it('shows the exact lightweight first-three-launch message and closes without blocking', async () => {
    render(<DesktopExtensionDockEntry wide={true} t={t} />)
    const copy = await screen.findByText('插件、技能和桌面核心功能在这里')
    expect(copy.parentElement?.parentElement).toBe(document.body)
    fireEvent.click(screen.getByRole('button', { name: '关闭拓展坞提示' }))
    expect(screen.queryByText('插件、技能和桌面核心功能在这里')).toBeNull()
    expect(desktop.dismissDockNudge).toHaveBeenCalledWith('close')
  })

  it('lets the first-run hint body pass pointer input to neighboring footer controls while its dismiss button remains interactive', async () => {
    render(<DesktopExtensionDockEntry wide={true} t={t} />)
    const copy = await screen.findByText('插件、技能和桌面核心功能在这里')
    const hint = screen.getByRole('status')
    const dismiss = screen.getByRole('button', { name: '关闭拓展坞提示' })
    const source = readFileSync(resolve('src/client/web-ui-settings.module.css'), 'utf8')
    const style = document.createElement('style')
    // Apply the real declarations to the rendered elements: CSS modules are
    // transformed in production, while jsdom has no native pointer hit testing.
    style.textContent = ['dockNudge', 'dockNudgeClose'].map(name => {
      const declarations = source.match(new RegExp(`\\.${name}\\s*\\{([^}]+)\\}`))?.[1]
      expect(declarations).toBeTruthy()
      return `.${name} { ${declarations} }`
    }).join('\n')
    hint.classList.add('dockNudge')
    dismiss.classList.add('dockNudgeClose')
    document.head.append(style)
    try {
      expect(getComputedStyle(hint).pointerEvents).toBe('none')
      expect(getComputedStyle(copy).pointerEvents).toBe('none')
      expect(getComputedStyle(dismiss).pointerEvents).toBe('auto')
      fireEvent.click(dismiss)
      expect(screen.queryByRole('status')).toBeNull()
      expect(desktop.dismissDockNudge).toHaveBeenCalledWith('close')
    } finally { style.remove() }
  })

  it('clamps the portaled hint inside a narrow viewport while pointing at the trigger', () => {
    expect(calculateDockNudgePosition({
      trigger: { left: -8, top: 580, width: 36 },
      viewportWidth: 240,
      viewportHeight: 640,
    })).toEqual({ left: 12, bottom: 70, arrowLeft: 14 })
  })

  it('dismisses with Escape and keeps keyboard focus untouched', async () => {
    render(<DesktopExtensionDockEntry wide={false} t={t} />)
    await screen.findByText('插件、技能和桌面核心功能在这里')
    const trigger = screen.getByRole('button', { name: '打开拓展坞' })
    trigger.focus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('插件、技能和桌面核心功能在这里')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(desktop.dismissDockNudge).toHaveBeenCalledWith('escape')
  })

  it('opens the Dock in one click and reports only a local failure message when unavailable', async () => {
    render(<DesktopExtensionDockEntry wide={true} t={t} />)
    const trigger = await screen.findByRole('button', { name: '打开拓展坞' })
    fireEvent.click(trigger)
    await waitFor(() => expect(desktop.openDesktopSurface).toHaveBeenCalledWith('extensions'))
    expect(desktop.openDesktopSurface).toHaveBeenCalledTimes(1)
    expect(desktop.dismissDockNudge).toHaveBeenCalledWith('clicked')
    expect(screen.queryByText('插件、技能和桌面核心功能在这里')).toBeNull()

    desktop.openDesktopSurface.mockResolvedValueOnce(false)
    fireEvent.click(trigger)
    expect((await screen.findByRole('alert')).textContent).toBe('拓展坞未能打开，请从工具菜单重试。')
  })
})
