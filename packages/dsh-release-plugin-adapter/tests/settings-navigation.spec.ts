import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openDesktopSurface } from '@linxin666/dsh-desktop-client'
import { openPluginSettings } from '../src/client/settings-navigation.ts'

vi.mock('@linxin666/dsh-desktop-client', () => ({ openDesktopSurface: vi.fn() }))
beforeEach(() => { vi.mocked(openDesktopSurface).mockReset(); vi.mocked(openDesktopSurface).mockResolvedValue(false) })

describe('real Desktop settings navigation', () => {
  it('uses the existing Dock inner-document events and exact vendor owner', async () => {
    const target = new EventTarget()
    const events: Array<[string, unknown]> = []
    for (const name of ['dsh:dock-plugin', 'dsh:dock-setting']) target.addEventListener(name, event => events.push([name, (event as CustomEvent).detail]))
    await openPluginSettings('@local/dsh-prompt-pilot', { location: { search: '?desktop-dock-setting=plugin-options' }, dispatchEvent: target.dispatchEvent.bind(target) })
    expect(events).toEqual([['dsh:dock-plugin', '@local/dsh-prompt-pilot'], ['dsh:dock-setting', 'plugin-options']])
  })
  it('uses the actual extension preload API when it is present', async () => {
    const destinations: unknown[] = []
    await openPluginSettings('dsh-builtin-browser', { location: { search: '' }, dispatchEvent() { throw Error('not a Dock document') },
      dshDesktop: { async selectDockSetting(id, owner) { destinations.push([id, owner]); return true } } })
    expect(destinations).toEqual([['plugin-options', 'dsh-builtin-browser']])
  })
  it('reports unavailable navigation rather than inventing a preload API', async () => {
    await expect(openPluginSettings('dsh-builtin-browser', { location: { search: '' }, dispatchEvent() { return true } })).rejects.toThrow('settings navigation unavailable')
  })
  it('opens the original vendor owner through the public Desktop client from an unprivileged native settings page', async () => {
    vi.mocked(openDesktopSurface).mockResolvedValue(true)
    await openPluginSettings('@local/dsh-prompt-pilot', { location: { search: '' }, dispatchEvent() { throw Error('not a Dock document') } })
    expect(openDesktopSurface).toHaveBeenCalledExactlyOnceWith('extensions', { setting: 'plugin-options', plugin: '@local/dsh-prompt-pilot' })
  })
  it('keeps Dock document navigation ahead of either Desktop bridge', async () => {
    const events: string[] = []
    await openPluginSettings('dsh-builtin-browser', { location: { search: '?desktop-dock-setting=plugin-options' },
      dispatchEvent(event) { events.push(event.type); return true },
      dshDesktop: { selectDockSetting() { throw Error('must use Dock navigation') } } })
    expect(events).toEqual(['dsh:dock-plugin', 'dsh:dock-setting'])
    expect(openDesktopSurface).not.toHaveBeenCalled()
  })
})
