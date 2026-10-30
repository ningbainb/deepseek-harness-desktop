import type { PluginOptionsDirectory } from './DockPluginOptions.tsx'

// These packages publish native settings sections rather than plugin row forms.
// Advertise only live entries; unloading a plugin must remove its settings too.
const SECTION_OWNERS: Readonly<Record<string, string>> = {
  'prompt-pilot': '@local/dsh-prompt-pilot',
  'dsh-builtin-browser': 'dsh-builtin-browser',
  'release-plugin-adapter': '@linxin666/dsh-release-plugin-adapter',
}

export function nativePluginSettingsSection(key: string): string | undefined {
  return Object.entries(SECTION_OWNERS).find(([id, owner]) => key === `${owner}#section:${id}`)?.[0]
}

interface SettingsRegistry {
  entriesOfSlot(name: string): readonly { options: { key?: string; id?: string } }[]
  subscribe(name: string, listener: () => void): () => void
}

export function createPluginOptionsDirectory(slots: SettingsRegistry): PluginOptionsDirectory {
  return {
    keys: () => [
      ...slots.entriesOfSlot('plugins.row.config').flatMap(entry => typeof entry.options.key === 'string' ? [entry.options.key] : []),
      ...slots.entriesOfSlot('settings.section').flatMap(entry => {
        const id = entry.options.id
        const owner = id && Object.hasOwn(SECTION_OWNERS, id) ? SECTION_OWNERS[id] : undefined
        return owner ? [`${owner}#section:${id}`] : []
      }),
    ],
    subscribe(listener) {
      const disposeRows = slots.subscribe('plugins.row.config', listener)
      let disposeSections: () => void
      try { disposeSections = slots.subscribe('settings.section', listener) }
      catch (error) { disposeRows(); throw error }
      return () => { disposeSections(); disposeRows() }
    },
  }
}
