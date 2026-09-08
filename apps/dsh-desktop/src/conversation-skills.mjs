export function buildSkillTrigger(name) {
  const normalized = typeof name === 'string' ? name.trim() : ''
  if (normalized === '') throw new TypeError('skill name is required')
  return `使用 ${normalized} 技能：`
}

export function normalizeConversationSkills(value, recentNames = []) {
  if (!Array.isArray(value)) return []
  const recentOrder = new Map(recentNames.map((name, index) => [String(name).toLocaleLowerCase(), index]))
  const winners = new Map()
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object' || candidate.shadowed === true) continue
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : ''
    if (name === '') continue
    const key = name.toLocaleLowerCase()
    if (winners.has(key)) continue
    winners.set(key, {
      name,
      description: typeof candidate.description === 'string' ? candidate.description.trim() : '',
      source: typeof candidate.source === 'string' ? candidate.source : '',
      recent: recentOrder.has(key),
    })
  }
  return [...winners.values()].toSorted((left, right) => {
    const leftRecent = recentOrder.get(left.name.toLocaleLowerCase())
    const rightRecent = recentOrder.get(right.name.toLocaleLowerCase())
    if (leftRecent !== undefined || rightRecent !== undefined) {
      if (leftRecent === undefined) return 1
      if (rightRecent === undefined) return -1
      return leftRecent - rightRecent
    }
    return left.name.localeCompare(right.name, 'zh-CN', { numeric: true, sensitivity: 'base' })
  })
}

export function filterConversationSkills(skills, query) {
  const needle = String(query ?? '').trim().toLocaleLowerCase()
  if (needle === '') return skills
  return skills.filter((skill) => `${skill.name}\n${skill.description}\n${skill.source}`.toLocaleLowerCase().includes(needle))
}

export function normalizeSkillDiagnostics(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => typeof item?.error === 'string' ? item.error.trim() : '')
    .filter((message, index, messages) => message !== '' && messages.indexOf(message) === index)
    .slice(0, 20)
}

function setNativeInputValue(element, value) {
  const prototype = Object.getPrototypeOf(element)
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  if (setter) setter.call(element, value)
  else element.value = value
}

export function insertSkillTrigger(textarea, name) {
  if (!textarea || textarea.readOnly || textarea.disabled) return { inserted: false }
  const trigger = buildSkillTrigger(name)
  const value = String(textarea.value ?? '')
  const start = Number.isInteger(textarea.selectionStart) ? textarea.selectionStart : value.length
  const end = Number.isInteger(textarea.selectionEnd) ? textarea.selectionEnd : start
  const before = value.slice(0, start)
  const after = value.slice(end)
  const prefix = before !== '' && !/\s$/u.test(before) ? '\n' : ''
  const suffix = after !== '' && !/^\s/u.test(after) ? '\n' : ''
  const insertion = `${prefix}${trigger}${suffix}`
  const next = `${before}${insertion}${after}`
  const caret = before.length + insertion.length
  setNativeInputValue(textarea, next)
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
  textarea.setSelectionRange?.(caret, caret)
  textarea.focus?.()
  return { inserted: true, value: next, caret }
}

function installConversationSkillsPage() {
  const globalKey = '__dshDesktopConversationSkillsV1'
  const existing = window[globalKey]
  if (existing?.refresh) {
    existing.refresh()
    return true
  }

  const state = {
    composer: null,
    textarea: null,
    commandButton: null,
    anchor: null,
    button: null,
    menu: null,
    search: null,
    list: null,
    status: null,
    skills: [],
    diagnostics: [],
    filtered: [],
    activeIndex: -1,
    loadedAt: 0,
    open: false,
    scheduled: false,
  }

  function recentNames() {
    try {
      const parsed = JSON.parse(localStorage.getItem('dsh-desktop:recent-skills') ?? '[]')
      return Array.isArray(parsed) ? parsed.filter((name) => typeof name === 'string').slice(0, 5) : []
    } catch {
      return []
    }
  }

  function remember(name) {
    const next = [name, ...recentNames().filter((item) => item !== name)].slice(0, 5)
    try { localStorage.setItem('dsh-desktop:recent-skills', JSON.stringify(next)) } catch { /* storage can be disabled */ }
    state.skills = normalizeConversationSkills(state.skills, next)
  }

  function showToast(message) {
    document.querySelector('#dsh-desktop-skills-toast')?.remove()
    const toast = document.createElement('div')
    toast.id = 'dsh-desktop-skills-toast'
    toast.setAttribute('role', 'status')
    toast.textContent = message
    document.body.append(toast)
    window.setTimeout(() => toast.remove(), 2600)
  }

  function closeMenu({ restoreFocus = false } = {}) {
    if (!state.menu) return
    state.open = false
    state.menu.hidden = true
    state.button?.setAttribute('aria-expanded', 'false')
    state.button?.removeAttribute('data-active')
    if (restoreFocus) state.button?.focus()
  }

  function positionMenu() {
    if (!state.open || !state.button || !state.menu) return
    const buttonBounds = state.button.getBoundingClientRect()
    const width = Math.min(360, Math.max(280, window.innerWidth - 24))
    state.menu.style.setProperty('width', `${width}px`, 'important')
    state.menu.style.setProperty('left', `${Math.min(Math.max(12, buttonBounds.left), window.innerWidth - width - 12)}px`, 'important')
    state.menu.style.visibility = 'hidden'
    state.menu.hidden = false
    const menuHeight = state.menu.getBoundingClientRect().height
    const above = buttonBounds.top - menuHeight - 8
    state.menu.style.setProperty('top', `${above >= 12 ? above : Math.min(window.innerHeight - menuHeight - 12, buttonBounds.bottom + 8)}px`, 'important')
    state.menu.style.visibility = ''
  }

  function setActive(index, focus = false) {
    const options = [...state.list.querySelectorAll('[role="option"]')]
    if (options.length === 0) {
      state.activeIndex = -1
      return
    }
    state.activeIndex = (index + options.length) % options.length
    for (const [optionIndex, option] of options.entries()) {
      const active = optionIndex === state.activeIndex
      option.setAttribute('aria-selected', String(active))
      option.toggleAttribute('data-active', active)
      option.tabIndex = active ? 0 : -1
    }
    const active = options[state.activeIndex]
    active.scrollIntoView({ block: 'nearest' })
    if (focus) active.focus()
  }

  function sourceLabel(source) {
    if (source === 'project-dsh' || source === 'project-agents') return '项目'
    if (source === 'user-dsh' || source === 'user-agents') return '用户'
    if (source === 'custom') return '自定义'
    return '技能'
  }

  function selectSkill(skill) {
    remember(skill.name)
    const result = insertSkillTrigger(state.textarea, skill.name)
    closeMenu()
    if (!result.inserted) showToast('请先选择工作区，再使用技能')
  }

  function groupLabel(text) {
    const label = document.createElement('div')
    label.className = 'dsh-desktop-skills-group'
    label.textContent = text
    return label
  }

  function render() {
    if (!state.list) return
    state.list.replaceChildren()
    state.filtered = filterConversationSkills(state.skills, state.search?.value)
    if (state.filtered.length === 0) {
      state.status.hidden = false
      state.status.textContent = state.skills.length === 0 && state.diagnostics.length > 0
        ? `有 ${state.diagnostics.length} 个技能未载入：${state.diagnostics[0]}`
        : state.skills.length === 0 ? '尚未发现已安装技能' : '没有匹配的技能'
      state.activeIndex = -1
      positionMenu()
      return
    }
    state.status.hidden = state.diagnostics.length === 0
    if (state.diagnostics.length > 0) {
      state.status.textContent = `有 ${state.diagnostics.length} 个技能未载入：${state.diagnostics[0]}`
    }
    let recentGroupAdded = false
    let allGroupAdded = false
    for (const [index, skill] of state.filtered.entries()) {
      if (skill.recent && !recentGroupAdded) {
        state.list.append(groupLabel('最近使用'))
        recentGroupAdded = true
      }
      if (!skill.recent && !allGroupAdded) {
        state.list.append(groupLabel(recentGroupAdded ? '全部技能' : '技能'))
        allGroupAdded = true
      }
      const option = document.createElement('button')
      option.type = 'button'
      option.className = 'dsh-desktop-skills-option'
      option.id = `dsh-desktop-skill-option-${index}`
      option.setAttribute('role', 'option')
      option.setAttribute('aria-selected', 'false')
      option.tabIndex = -1
      const copy = document.createElement('span')
      copy.className = 'dsh-desktop-skills-copy'
      const name = document.createElement('strong')
      name.textContent = skill.name
      copy.append(name)
      if (skill.description) {
        const description = document.createElement('small')
        description.textContent = skill.description
        copy.append(description)
      }
      const source = document.createElement('span')
      source.className = 'dsh-desktop-skills-source'
      source.textContent = sourceLabel(skill.source)
      option.append(copy, source)
      option.addEventListener('pointermove', () => setActive(index))
      option.addEventListener('click', () => selectSkill(skill))
      state.list.append(option)
    }
    setActive(0)
    positionMenu()
  }

  async function loadSkills({ force = false } = {}) {
    if (!force && state.skills.length > 0 && Date.now() - state.loadedAt < 30_000) {
      render()
      return
    }
    state.status.hidden = false
    state.status.textContent = '正在读取技能库…'
    state.list.replaceChildren()
    try {
      if (typeof window.dshDesktop?.listSkills !== 'function') throw new Error('desktop skill inventory is unavailable')
      const inventory = await window.dshDesktop.listSkills()
      state.skills = normalizeConversationSkills(inventory?.skills, recentNames())
      state.diagnostics = normalizeSkillDiagnostics(inventory?.diagnostics)
      state.loadedAt = Date.now()
      render()
    } catch (error) {
      state.status.hidden = false
      state.status.replaceChildren()
      const message = document.createElement('span')
      message.textContent = '技能库读取失败'
      const retry = document.createElement('button')
      retry.type = 'button'
      retry.textContent = '重试'
      retry.addEventListener('click', () => { void loadSkills({ force: true }) })
      state.status.append(message, retry)
      positionMenu()
      console.warn('[desktop-skills] failed to load skills:', error)
    }
  }

  function openMenu() {
    if (!state.menu || !state.button) return
    state.open = true
    state.menu.hidden = false
    state.button.setAttribute('aria-expanded', 'true')
    state.button.setAttribute('data-active', '')
    state.search.value = ''
    positionMenu()
    void loadSkills().then(() => {
      if (!state.open) return
      state.search.focus()
      positionMenu()
    })
  }

  function toggleMenu() {
    if (state.open) closeMenu({ restoreFocus: true })
    else openMenu()
  }

  function createMenu() {
    const menu = document.createElement('section')
    menu.id = 'dsh-desktop-skills-menu'
    menu.hidden = true
    menu.setAttribute('role', 'dialog')
    menu.setAttribute('aria-label', '技能库')
    const header = document.createElement('div')
    header.className = 'dsh-desktop-skills-search-wrap'
    const search = document.createElement('input')
    search.type = 'search'
    search.className = 'dsh-desktop-skills-search'
    search.placeholder = '搜索技能'
    search.setAttribute('aria-label', '搜索技能')
    search.autocomplete = 'off'
    const count = document.createElement('span')
    count.className = 'dsh-desktop-skills-count'
    count.textContent = 'Skills'
    header.append(search, count)
    const list = document.createElement('div')
    list.className = 'dsh-desktop-skills-list'
    list.id = 'dsh-desktop-skills-listbox'
    list.setAttribute('role', 'listbox')
    list.setAttribute('aria-label', '已安装技能')
    const status = document.createElement('div')
    status.className = 'dsh-desktop-skills-status'
    status.setAttribute('role', 'status')
    menu.append(header, list, status)
    search.addEventListener('input', render)
    document.body.append(menu)
    state.menu = menu
    state.search = search
    state.list = list
    state.status = status
  }

  function createButton(commandButton) {
    const anchor = document.createElement('span')
    anchor.className = 'dsh-desktop-skills-anchor'
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `${commandButton.className} dsh-desktop-skills-button`
    button.setAttribute('aria-label', '技能库')
    button.setAttribute('aria-haspopup', 'dialog')
    button.setAttribute('aria-expanded', 'false')
    button.setAttribute('aria-controls', 'dsh-desktop-skills-menu')
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    icon.setAttribute('width', '14')
    icon.setAttribute('height', '14')
    icon.setAttribute('viewBox', '0 0 16 16')
    icon.setAttribute('aria-hidden', 'true')
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', 'M8 1.4 9.55 5.05 13.2 6.6 9.55 8.15 8 11.8 6.45 8.15 2.8 6.6 6.45 5.05 8 1.4Zm4.3 8.2.75 1.75 1.75.75-1.75.75-.75 1.75-.75-1.75-1.75-.75 1.75-.75.75-1.75Z')
    path.setAttribute('fill', 'currentColor')
    icon.append(path)
    const tooltip = document.createElement('span')
    tooltip.className = 'dsh-desktop-skills-tooltip'
    tooltip.setAttribute('role', 'tooltip')
    tooltip.textContent = '技能库'
    button.append(icon)
    anchor.append(button, tooltip)
    commandButton.after(anchor)
    button.addEventListener('pointerdown', (event) => event.stopPropagation())
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      toggleMenu()
    })
    state.anchor = anchor
    state.button = button
  }

  function visibleComposer() {
    const composers = [...document.querySelectorAll('[data-composer-card="true"]')]
    return composers.findLast((element) => element.getClientRects().length > 0) ?? null
  }

  function mount() {
    state.scheduled = false
    const composer = visibleComposer()
    const commandButton = composer?.querySelector('button[aria-label="命令"]')
    const textarea = composer?.querySelector('textarea')
    if (!composer || !commandButton || !textarea) {
      if (state.composer && !state.composer.isConnected) closeMenu()
      return false
    }
    if (state.composer === composer && state.anchor?.isConnected) return true
    closeMenu()
    state.anchor?.remove()
    state.composer = composer
    state.commandButton = commandButton
    state.textarea = textarea
    createButton(commandButton)
    return true
  }

  function scheduleMount() {
    if (state.scheduled) return
    state.scheduled = true
    queueMicrotask(mount)
  }

  createMenu()
  mount()
  const observer = new MutationObserver(scheduleMount)
  observer.observe(document.body, { childList: true, subtree: true })
  const onPointerDown = (event) => {
    if (!state.open) return
    if (state.menu.contains(event.target) || state.button.contains(event.target)) return
    closeMenu()
  }
  const onKeyDown = (event) => {
    if (!state.open) return
    if (['Escape', 'ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) event.stopImmediatePropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMenu({ restoreFocus: true })
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive(state.activeIndex + 1, true)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive(state.activeIndex - 1, true)
    } else if (event.key === 'Enter' && state.activeIndex >= 0) {
      event.preventDefault()
      const option = state.list.querySelectorAll('[role="option"]')[state.activeIndex]
      option?.click()
    }
  }
  const onFocusIn = (event) => {
    if (!state.open) return
    if (state.menu.contains(event.target) || state.button.contains(event.target) || state.composer.contains(event.target)) return
    closeMenu()
  }
  const onResize = () => positionMenu()
  document.addEventListener('pointerdown', onPointerDown, true)
  document.addEventListener('keydown', onKeyDown, true)
  document.addEventListener('focusin', onFocusIn, true)
  window.addEventListener('resize', onResize)
  window.addEventListener('scroll', onResize, true)
  state.refresh = scheduleMount
  state.dispose = () => {
    observer.disconnect()
    document.removeEventListener('pointerdown', onPointerDown, true)
    document.removeEventListener('keydown', onKeyDown, true)
    document.removeEventListener('focusin', onFocusIn, true)
    window.removeEventListener('resize', onResize)
    window.removeEventListener('scroll', onResize, true)
    state.anchor?.remove()
    state.menu?.remove()
    delete window[globalKey]
  }
  window[globalKey] = state
  return true
}

export const CONVERSATION_SKILLS_CSS = `
.dsh-desktop-skills-anchor {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.dsh-desktop-skills-button[data-active] {
  color: var(--dsw-alias-label-primary, #111827) !important;
  background: var(--dsw-alias-bg-hover, #ebeff2) !important;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dsw-alias-label-caption, #64748b) 18%, transparent);
}

.dsh-desktop-skills-button:focus-visible {
  outline: 2px solid var(--dsw-alias-accent-primary, #4d78e8) !important;
  outline-offset: 2px;
}

.dsh-desktop-skills-tooltip {
  position: absolute;
  z-index: 2147483647;
  bottom: calc(100% + 7px);
  left: 50%;
  width: max-content;
  padding: 4px 7px;
  border-radius: 6px;
  color: #fff;
  background: rgba(15, 17, 21, 0.9);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
  font: 11px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, 2px);
  transition: opacity 120ms ease, transform 120ms ease;
}

.dsh-desktop-skills-anchor:hover .dsh-desktop-skills-tooltip,
.dsh-desktop-skills-button:focus-visible + .dsh-desktop-skills-tooltip {
  opacity: 1;
  transform: translate(-50%, 0);
}

#dsh-desktop-skills-menu {
  position: fixed;
  z-index: 2147483600;
  right: auto !important;
  bottom: auto !important;
  box-sizing: border-box;
  height: auto !important;
  min-height: 0 !important;
  max-height: 320px !important;
  padding: 0 !important;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--dsw-alias-label-caption, #64748b) 18%, transparent);
  border-radius: 14px;
  color: var(--dsw-alias-label-primary, #0f1115);
  background: color-mix(in srgb, var(--dsw-alias-bg-base, #ffffff) 97%, transparent);
  box-shadow: 0 0 1px rgba(0, 0, 0, 0.2), 0 12px 32px rgba(0, 0, 0, 0.14);
  -webkit-backdrop-filter: blur(22px) saturate(135%);
  backdrop-filter: blur(22px) saturate(135%);
  color-scheme: light dark;
  font: 12px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}

#dsh-desktop-skills-menu[hidden] { display: none !important; }

.dsh-desktop-skills-search-wrap {
  position: sticky;
  z-index: 2;
  top: 0;
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 9px;
  border-bottom: 1px solid color-mix(in srgb, var(--dsw-alias-label-caption, #64748b) 12%, transparent);
  background: inherit;
}

.dsh-desktop-skills-search {
  box-sizing: border-box;
  min-width: 0;
  height: 32px;
  flex: 1;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--dsw-alias-label-caption, #64748b) 18%, transparent);
  border-radius: 10px;
  outline: none;
  color: inherit;
  background: color-mix(in srgb, var(--dsw-alias-bg-base, #ffffff) 82%, var(--dsw-alias-bg-hover, #f3f4f6));
  font: inherit;
}

.dsh-desktop-skills-search:focus {
  border-color: var(--dsw-alias-accent-primary, #4d78e8);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-accent-primary, #4d78e8) 16%, transparent);
}

.dsh-desktop-skills-count {
  flex: none;
  color: var(--dsw-alias-label-caption, #6b7280);
  font-size: 10px;
}

.dsh-desktop-skills-list {
  max-height: 260px;
  padding: 5px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-color: color-mix(in srgb, var(--dsw-alias-label-caption, #64748b) 28%, transparent) transparent;
  scrollbar-width: thin;
}

.dsh-desktop-skills-group {
  padding: 7px 8px 4px;
  color: var(--dsw-alias-label-caption, #6b7280);
  font-size: 10px;
  font-weight: 500;
}

.dsh-desktop-skills-option {
  display: flex;
  box-sizing: border-box;
  width: 100%;
  min-height: 42px;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 6px 9px;
  border: 0;
  border-radius: 9px;
  outline: none;
  color: inherit;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.dsh-desktop-skills-option:hover,
.dsh-desktop-skills-option[data-active] {
  background: var(--dsw-alias-bg-hover, #ebeff2);
}

.dsh-desktop-skills-option:focus-visible {
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--dsw-alias-accent-primary, #4d78e8) 56%, transparent);
}

.dsh-desktop-skills-copy {
  display: grid;
  min-width: 0;
  gap: 1px;
}

.dsh-desktop-skills-copy strong {
  overflow: hidden;
  font-size: 12px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsh-desktop-skills-copy small {
  overflow: hidden;
  color: var(--dsw-alias-label-caption, #6b7280);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsh-desktop-skills-source {
  flex: none;
  padding: 1px 6px;
  border: 1px solid color-mix(in srgb, var(--dsw-alias-label-caption, #64748b) 16%, transparent);
  border-radius: 7px;
  color: var(--dsw-alias-label-caption, #6b7280);
  font-size: 9px;
}

.dsh-desktop-skills-status {
  display: flex;
  min-height: 70px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px;
  color: var(--dsw-alias-label-caption, #6b7280);
  text-align: center;
}

.dsh-desktop-skills-status[hidden] { display: none; }
.dsh-desktop-skills-status button {
  height: 28px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--dsw-alias-label-caption, #64748b) 20%, transparent);
  border-radius: 14px;
  color: inherit;
  background: transparent;
  cursor: pointer;
}

#dsh-desktop-skills-toast {
  position: fixed;
  z-index: 2147483647;
  right: 24px;
  bottom: 24px;
  padding: 9px 12px;
  border: 1px solid color-mix(in srgb, var(--dsw-alias-label-caption, #64748b) 20%, transparent);
  border-radius: 10px;
  color: var(--dsw-alias-label-primary, #0f1115);
  background: var(--dsw-alias-bg-base, #ffffff);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.14);
  font: 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
}

@media (prefers-color-scheme: dark) {
  #dsh-desktop-skills-menu {
    color: var(--dsw-alias-label-primary, #f3f4f6);
    background: color-mix(in srgb, var(--dsw-alias-bg-base, #17191d) 96%, transparent);
    box-shadow: 0 0 1px rgba(255, 255, 255, 0.12), 0 16px 36px rgba(0, 0, 0, 0.4);
  }
}

@media (prefers-reduced-motion: reduce) {
  .dsh-desktop-skills-tooltip { transition: none; }
}
`

export const CONVERSATION_SKILLS_SCRIPT = `(() => {
${buildSkillTrigger.toString()}
${normalizeConversationSkills.toString()}
${filterConversationSkills.toString()}
${normalizeSkillDiagnostics.toString()}
${setNativeInputValue.toString()}
${insertSkillTrigger.toString()}
return (${installConversationSkillsPage.toString()})()
})()`

export async function applyConversationSkills(webContents) {
  if (!webContents || webContents.isDestroyed?.()) return false
  await webContents.insertCSS(CONVERSATION_SKILLS_CSS, { cssOrigin: 'author' })
  await webContents.executeJavaScript(CONVERSATION_SKILLS_SCRIPT)
  return true
}

export function installConversationSkills({ browserWindow, onError = () => {} }) {
  const { webContents } = browserWindow
  const apply = () => {
    void applyConversationSkills(webContents).catch(onError)
  }
  webContents.on('did-finish-load', apply)
  return () => webContents.removeListener('did-finish-load', apply)
}
