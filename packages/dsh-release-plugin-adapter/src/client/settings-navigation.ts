import { openDesktopSurface } from '@linxin666/dsh-desktop-client'

type Owner = '@local/dsh-prompt-pilot' | 'dsh-builtin-browser'
interface NavigationTarget {
  location: { search: string }
  dispatchEvent(event: Event): boolean
  dshDesktop?: { selectDockSetting?(id: string, owner: string): Promise<unknown> }
}

/** Prefer Dock document navigation, then use the existing narrow Desktop contract. */
export async function openPluginSettings(owner: Owner, target: NavigationTarget): Promise<void> {
  if (owner !== '@local/dsh-prompt-pilot' && owner !== 'dsh-builtin-browser') throw new Error('invalid settings owner')
  if (new URLSearchParams(target.location.search).has('desktop-dock-setting')) {
    target.dispatchEvent(new CustomEvent('dsh:dock-plugin', { detail: owner }))
    target.dispatchEvent(new CustomEvent('dsh:dock-setting', { detail: 'plugin-options' }))
    return
  }
  if (typeof target.dshDesktop?.selectDockSetting === 'function') {
    const result = await target.dshDesktop.selectDockSetting('plugin-options', owner)
    if (result === false) throw new Error('settings navigation unavailable')
    return
  }
  if (!await openDesktopSurface('extensions', { setting: 'plugin-options', plugin: owner })) throw new Error('settings navigation unavailable')
}
