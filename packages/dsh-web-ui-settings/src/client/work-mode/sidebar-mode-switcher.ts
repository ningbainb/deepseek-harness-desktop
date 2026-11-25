import { officeAppsStore } from './office-apps-store.ts'

const STYLE_ID = 'dsh-work-mode-switcher-styles'
const HOST_ATTR = 'data-dsh-mode-switcher-host'
const SIDEBAR_SELECTOR = '[data-pane="sidebar"], [class*="sidebarCol"]'

const SWITCHER_CSS = `
[${HOST_ATTR}] {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 3px;
  padding: 3px;
  margin: 4px 0 6px;
  border-radius: var(--dsw-radius-sm, 10px);
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  grid-column: 2;
}
[${HOST_ATTR}] button[data-mode-tab] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-block-size: 30px;
  padding: 4px 8px;
  border: 0;
  border-radius: var(--dsw-radius-xs, 7px);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.14s ease, color 0.14s ease, box-shadow 0.14s ease;
}
[${HOST_ATTR}] button[data-mode-tab]:hover {
  color: var(--dsw-alias-label-primary);
}
[${HOST_ATTR}] button[data-mode-tab][aria-selected="true"] {
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}
[${HOST_ATTR}] button[data-mode-tab]:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #4d78e8);
  outline-offset: -2px;
}
[${HOST_ATTR}] [data-mode-badge] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary, #10a37f) 16%, transparent);
  color: var(--dsw-alias-state-success-primary, #10a37f);
  font-size: 10px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
[${HOST_ATTR}] [data-mode-badge][hidden] {
  display: none;
}
:root[data-dsh-experience-mode="office"] [data-dsh-tools-toggle],
:root[data-dsh-experience-mode="office"] nav[data-dsh-collapsible-tool] {
  display: none !important;
}
[data-pane="sidebar"][data-sidebar-collapsed] [${HOST_ATTR}] {
  grid-template-columns: 1fr;
  margin: 4px auto 6px;
  width: 38px;
}
[data-pane="sidebar"][data-sidebar-collapsed] [${HOST_ATTR}] [data-mode-label],
[data-pane="sidebar"][data-sidebar-collapsed] [${HOST_ATTR}] [data-mode-badge] {
  display: none;
}
[data-pane="sidebar"][data-sidebar-collapsed] [${HOST_ATTR}] button[data-mode-tab] {
  padding: 5px;
}
`

export interface SidebarModeSwitcherOptions {
  locale?: () => string
  onEnterOfficeMode?: () => void
  onEnterDevMode?: () => void
}

function createCodeSvg(doc: Document): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = doc.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '14')
  svg.setAttribute('height', '14')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.85')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  const left = doc.createElementNS(ns, 'polyline')
  left.setAttribute('points', '16 18 22 12 16 6')
  const right = doc.createElementNS(ns, 'polyline')
  right.setAttribute('points', '8 6 2 12 8 18')
  svg.append(left, right)
  return svg
}

function createWorkSvg(doc: Document): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = doc.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '14')
  svg.setAttribute('height', '14')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.85')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  const rect = doc.createElementNS(ns, 'rect')
  rect.setAttribute('x', '3')
  rect.setAttribute('y', '6')
  rect.setAttribute('width', '18')
  rect.setAttribute('height', '14')
  rect.setAttribute('rx', '2')
  const handle = doc.createElementNS(ns, 'path')
  handle.setAttribute('d', 'M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2')
  const line = doc.createElementNS(ns, 'path')
  line.setAttribute('d', 'M3 12h18')
  svg.append(rect, handle, line)
  return svg
}

export function installSidebarModeSwitcher(
  doc: Document,
  options: SidebarModeSwitcherOptions = {},
): () => void {
  if (!doc?.body || !doc?.head) return () => {}

  officeAppsStore.syncExperienceModeFromStorage()

  let style = doc.getElementById(STYLE_ID)
  if (!style) {
    style = doc.createElement('style')
    style.id = STYLE_ID
    style.textContent = SWITCHER_CSS
    doc.head.appendChild(style)
  }

  const host = doc.createElement('div')
  host.setAttribute(HOST_ATTR, 'true')
  host.setAttribute('role', 'tablist')

  const devBtn = doc.createElement('button')
  devBtn.type = 'button'
  devBtn.setAttribute('role', 'tab')
  devBtn.setAttribute('data-mode-tab', 'dev')
  const devLabel = doc.createElement('span')
  devLabel.setAttribute('data-mode-label', '')
  devBtn.append(createCodeSvg(doc), devLabel)

  const officeBtn = doc.createElement('button')
  officeBtn.type = 'button'
  officeBtn.setAttribute('role', 'tab')
  officeBtn.setAttribute('data-mode-tab', 'office')
  const officeLabel = doc.createElement('span')
  officeLabel.setAttribute('data-mode-label', '')
  const officeBadge = doc.createElement('span')
  officeBadge.setAttribute('data-mode-badge', '')
  officeBadge.hidden = true
  officeBtn.append(createWorkSvg(doc), officeLabel, officeBadge)

  host.append(devBtn, officeBtn)

  let disposed = false
  let frame: number | undefined
  let sidebar: Element | null = null

  const isEnglish = (): boolean => {
    const loc = options.locale?.() || doc.documentElement.lang || 'zh'
    return loc.toLowerCase().startsWith('en')
  }

  const syncLabelsAndSelection = (): void => {
    const en = isEnglish()
    const snap = officeAppsStore.getSnapshot()
    const inOffice = snap.experienceMode === 'office'
    const connectedCount = snap.snapshot?.connectedCount ?? 0

    host.setAttribute('aria-label', en ? 'Experience mode' : '使用模式切换')
    const devText = en ? 'Pro' : '专业模式'
    const officeText = en ? 'Office' : '办公模式'
    if (devLabel.textContent !== devText) devLabel.textContent = devText
    if (officeLabel.textContent !== officeText) officeLabel.textContent = officeText
    devBtn.title = en ? 'Full developer & agent tools' : '完整开发与全能工具模式（含办公能力）'
    officeBtn.title = en ? 'Simplified daily office mode' : '极简办公模式（聚焦办公任务与文档协作）'
    devBtn.setAttribute('aria-selected', String(!inOffice))
    officeBtn.setAttribute('aria-selected', String(inOffice))
    officeBadge.hidden = connectedCount <= 0
    const badgeText = connectedCount > 0 ? String(connectedCount) : ''
    if (officeBadge.textContent !== badgeText) officeBadge.textContent = badgeText
  }

  devBtn.addEventListener('click', () => {
    officeAppsStore.setExperienceMode('dev')
    syncLabelsAndSelection()
    options.onEnterDevMode?.()
  })

  officeBtn.addEventListener('click', () => {
    officeAppsStore.setExperienceMode('office')
    officeAppsStore.ensureLoaded()
    syncLabelsAndSelection()
    options.onEnterOfficeMode?.()
  })

  const mountOrSync = (): void => {
    frame = undefined
    if (disposed) return
    if (!sidebar?.isConnected) sidebar = doc.querySelector(SIDEBAR_SELECTOR)
    if (!sidebar) return

    const newSessionBtn = [...sidebar.querySelectorAll<HTMLButtonElement>('button')].find((btn) =>
      !host.contains(btn) && /^(?:新会话|新对话|New chat|New session)$/iu.test(btn.textContent?.trim() ?? ''),
    )
    const toolsToggle = sidebar.querySelector('[data-dsh-tools-toggle]')
    const workspaces = sidebar.querySelector('[data-slot="sidebar.workspaces"]')
    const anchor = newSessionBtn ?? toolsToggle ?? workspaces

    if (anchor && anchor.parentElement) {
      const parent = anchor.parentElement
      if (newSessionBtn) {
        if (newSessionBtn.nextElementSibling !== host) newSessionBtn.after(host)
      } else if (host.parentElement !== parent || host.nextElementSibling !== anchor) {
        parent.insertBefore(host, anchor)
      }
    }
    syncLabelsAndSelection()
  }

  const schedule = (): void => {
    if (disposed || frame !== undefined) return
    if (typeof requestAnimationFrame === 'function') {
      frame = requestAnimationFrame(mountOrSync)
    } else {
      mountOrSync()
    }
  }

  const unsubscribeStore = officeAppsStore.subscribe(() => {
    syncLabelsAndSelection()
  })
  const observer = new MutationObserver(records => {
    const currentSidebar = sidebar
    if (currentSidebar?.isConnected) {
      if (records.some(({ target }) => currentSidebar.contains(target) && !host.contains(target))) schedule()
      return
    }
    if (currentSidebar || records.some(({ addedNodes }) => Array.from(addedNodes).some(node => {
      if (node.nodeType !== Node.ELEMENT_NODE) return false
      const element = node as Element
      return element.matches(SIDEBAR_SELECTOR) || element.querySelector(SIDEBAR_SELECTOR) !== null
    }))) schedule()
  })
  const localeObserver = new MutationObserver(syncLabelsAndSelection)
  mountOrSync()
  observer.observe(doc.documentElement, { childList: true, subtree: true })
  localeObserver.observe(doc.documentElement, { attributes: true, attributeFilter: ['lang'] })

  return () => {
    disposed = true
    if (frame !== undefined && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(frame)
    }
    unsubscribeStore()
    observer.disconnect()
    localeObserver.disconnect()
    host.remove()
  }
}
