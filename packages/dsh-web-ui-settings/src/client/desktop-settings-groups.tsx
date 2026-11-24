import { useId, type ReactNode } from 'react'
import { ADVANCED_MODEL_SECTION, PERSONAL_SECTION } from './desktop-native-settings.tsx'
import css from './desktop-native-settings.module.css'

export type SettingsSection = { id: string; order: number; label: string }
type Group = SettingsSection & { sections: readonly SettingsSection[] }

const definitions = [
  { id: 'general', zh: '通用', en: 'General', pages: ['general', 'data-location'] },
  { id: 'models', zh: '模型与登录', en: 'Models and sign-in', pages: ['models', 'account', 'chatgpt-auth', 'llm-antigravity', ADVANCED_MODEL_SECTION, 'dsh-usage'] },
  { id: PERSONAL_SECTION, zh: '个人偏好', en: 'Personal preferences', pages: [PERSONAL_SECTION] },
  { id: 'agent-presets', zh: '会话与 Agent', en: 'Sessions and agents', pages: ['agent-presets', 'prompt-pilot', 'agent-inbox', 'archived-sessions'] },
  { id: 'skin-center', zh: '外观', en: 'Appearance', pages: ['skin-center', 'better-sidebar'] },
  { id: 'plugins', zh: '工具与权限', en: 'Tools and permissions', pages: ['dsh-builtin-browser', 'plugins', 'release-plugin-adapter'] },
] as const

export function groupDesktopSettings(rows: readonly SettingsSection[], language: string): readonly Group[] {
  const chinese = language.toLowerCase().startsWith('zh')
  const byId = new Map(rows.map(row => [row.id, row]))
  const known = new Set<string>(definitions.flatMap(({ pages }) => [...pages]))
  const extensions = rows.filter(({ id }) => !known.has(id) && id !== 'web-ui-plugins' && id !== 'dsh-workshop')
  const labels: Readonly<Record<string, string>> = {
    models: chinese ? '供应商' : 'Providers',
    account: 'DeepSeek',
    'chatgpt-auth': chinese ? 'ChatGPT 登录' : 'ChatGPT sign-in',
    'dsh-usage': chinese ? '用量与余额' : 'Usage and balance',
    plugins: chinese ? '内置能力' : 'Built-in capabilities',
  }
  return definitions.flatMap(({ id, zh, en, pages }, order) => {
    const sections = pages.flatMap(page => {
      const row = byId.get(page)
      return row ? [{ ...row, label: labels[page] ?? row.label }] : []
    })
    if (id === 'plugins') sections.push(...extensions)
    return sections.length === 0 ? [] : [{ id, order, label: chinese ? zh : en, sections }]
  })
}

export function DesktopSettingsGroup({ group, activeId, onSelect, renderSection }: {
  group: Group
  activeId: string | undefined
  onSelect: (id: string) => boolean
  renderSection: (id: string) => ReactNode
}) {
  const prefix = useId()
  const active = group.sections.find(section => section.id === activeId) ?? group.sections[0]
  if (active === undefined) return null
  if (group.sections.length === 1) return renderSection(active.id)
  const tabId = (id: string) => `${prefix}-${id}-tab`
  const panelId = (id: string) => `${prefix}-${id}-panel`
  return <div className={css.section} data-desktop-settings-group={group.id}>
    <div className={`${css.tabs} ${css.groupTabs}`} role="tablist" aria-label={group.label}>
      {group.sections.map(({ id, label }, index) => <button key={id} type="button" id={tabId(id)} role="tab"
        data-desktop-settings-section={id}
        aria-selected={id === active.id} aria-controls={panelId(id)} tabIndex={id === active.id ? 0 : -1}
        onClick={() => { onSelect(id) }} onKeyDown={event => {
          const length = group.sections.length
          let next = index
          if (event.key === 'ArrowLeft') next = (index + length - 1) % length
          else if (event.key === 'ArrowRight') next = (index + 1) % length
          else if (event.key === 'Home') next = 0
          else if (event.key === 'End') next = length - 1
          else return
          event.preventDefault()
          const item = group.sections[next]
          if (item && onSelect(item.id)) event.currentTarget.ownerDocument.getElementById(tabId(item.id))?.focus()
        }}>{label}</button>)}
    </div>
    {group.sections.map(({ id }) => <div key={id} role="tabpanel" id={panelId(id)} aria-labelledby={tabId(id)} hidden={id !== active.id}>
      {id === active.id ? renderSection(id) : null}
    </div>)}
  </div>
}
