export const SIDEBAR_TOOLS_CSS = `
[data-dsh-tool-host][data-dsh-tools-collapsed="true"] > [data-dsh-collapsible-tool] {
  display: none !important;
}
[data-dsh-tool-host] > nav[data-dsh-collapsible-tool] {
  flex-shrink: 1;
  min-block-size: 0;
  max-block-size: min(25vh, 180px);
  overflow-y: auto;
  overscroll-behavior: contain;
}
[data-dsh-tool-host] > [data-dsh-workspace-region] {
  flex: 1 1 min(160px, 25vh);
  min-block-size: min(120px, 20vh);
}
[data-dsh-tools-toggle] {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  inline-size: 100%;
  min-block-size: 30px;
  padding: 4px 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, inherit);
  font: inherit;
  font-size: 12px;
  text-align: start;
  cursor: pointer;
}
[data-dsh-tools-toggle]::before { content: "+"; inline-size: 18px; text-align: center; }
[data-dsh-tools-toggle][aria-expanded="true"]::before { content: "-"; }
[data-dsh-tools-toggle]:hover { background: var(--dsw-alias-interactive-bg-hover, #80808018); }
[data-dsh-tools-toggle]:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #4d78e8); outline-offset: -2px; }
[data-pane="sidebar"][data-sidebar-collapsed] [data-dsh-tools-toggle] { inline-size: 36px; padding-inline: 0; justify-content: center; align-self: center; }
[data-pane="sidebar"][data-sidebar-collapsed] [data-dsh-tools-toggle] span { display: none; }
`

export function installSidebarTools() {
  globalThis.dshSidebarToolsController?.dispose()
  const key = 'dsh-desktop-sidebar-tools-v1'
  const readState = () => {
    try { return localStorage.getItem(key) !== 'expanded' } catch { return true }
  }
  let collapsed = readState()
  let sidebar, root, region, frame, disposed = false, nextId = 0
  const rows = new Set()
  const ownedIds = new Map()
  const button = document.createElement('button')
  button.type = 'button'
  button.setAttribute('data-dsh-tools-toggle', '')
  const label = document.createElement('span')
  button.append(label)
  const release = () => {
    button.remove()
    for (const row of rows) row.removeAttribute('data-dsh-collapsible-tool')
    for (const [row, id] of ownedIds) if (row.id === id) row.removeAttribute('id')
    rows.clear()
    ownedIds.clear()
    root?.removeAttribute('data-dsh-tool-host')
    root?.removeAttribute('data-dsh-tools-collapsed')
    region?.removeAttribute('data-dsh-workspace-region')
    root = undefined
    region = undefined
  }
  const sync = () => {
    frame = undefined
    if (disposed) return
    sidebar = document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]')
    const nativePanels = sidebar?.querySelector('nav[aria-label="全局面板"], nav[aria-label="Global panels"]')
      ?? sidebar?.querySelector('[data-slot="sidebar.panellist"]')?.closest('nav')
    const nextRoot = nativePanels?.parentElement
      ?? sidebar?.querySelector('[class*="logoRow"]')?.parentElement
    if (nextRoot !== root) { release(); root = nextRoot }
    if (!root) return
    const targets = [...root.children].filter(child => child === nativePanels || child.matches(
      '[data-dsh-taskboard-entry], [data-dsh-ssh-entry], [data-dsh-aionui-entry], [data-dsh-gitgraph-entry]',
    ))
    for (const row of rows) {
      if (!targets.includes(row)) {
        row.removeAttribute('data-dsh-collapsible-tool')
        if (ownedIds.get(row) === row.id) row.removeAttribute('id')
        ownedIds.delete(row)
        rows.delete(row)
      }
    }
    if (!targets.length) { release(); return }
    root.setAttribute('data-dsh-tool-host', '')
    for (const row of targets) {
      row.setAttribute('data-dsh-collapsible-tool', '')
      rows.add(row)
      if (!row.id) {
        row.id = `dsh-sidebar-tools-${nextId++}`
        ownedIds.set(row, row.id)
      }
    }
    const nextRegion = [...root.children].find(child => child.querySelector('[data-slot="sidebar.workspaces"]'))
    if (region !== nextRegion) {
      region?.removeAttribute('data-dsh-workspace-region')
      region = nextRegion
      region?.setAttribute('data-dsh-workspace-region', '')
    }
    const chinese = nativePanels?.getAttribute('aria-label') === '全局面板'
      || document.documentElement.lang.toLowerCase().startsWith('zh')
    const name = collapsed ? (chinese ? '展开工具' : 'Expand tools') : (chinese ? '收起工具' : 'Collapse tools')
    const count = targets.reduce((total, row) => total + (row.matches('nav') ? row.querySelectorAll('button').length : 1), 0)
    const text = `${name} (${count})`
    if (label.textContent !== text) label.textContent = text
    button.setAttribute('aria-label', name)
    button.title = name
    button.setAttribute('aria-expanded', String(!collapsed))
    button.setAttribute('aria-controls', targets.map(row => row.id).join(' '))
    if (collapsed && targets.some(row => row.contains(document.activeElement))) button.focus()
    root.setAttribute('data-dsh-tools-collapsed', String(collapsed))
    if (button.parentElement !== root || button.nextElementSibling !== targets[0]) root.insertBefore(button, targets[0])
  }
  const schedule = () => { if (!disposed && frame === undefined) frame = requestAnimationFrame(sync) }
  const observer = new MutationObserver(records => {
    if (!sidebar?.isConnected || (root && !root.isConnected) || records.some(record =>
      record.target === root || record.target.contains(sidebar)
      || (!root && sidebar.contains(record.target))
      || (record.target.matches?.('nav') && sidebar.contains(record.target))
      || [...record.addedNodes, ...record.removedNodes].some(node => node.contains(sidebar)))) schedule()
  })
  observer.observe(document, { childList: true, subtree: true })
  const localeObserver = new MutationObserver(schedule)
  localeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
  const toggle = () => {
    collapsed = !collapsed
    try { localStorage.setItem(key, collapsed ? 'collapsed' : 'expanded') } catch {}
    sync()
  }
  const storage = event => { if (event.key === key) { collapsed = readState(); schedule() } }
  const dispose = () => {
    disposed = true
    if (frame !== undefined) cancelAnimationFrame(frame)
    observer.disconnect()
    localeObserver.disconnect()
    button.removeEventListener('click', toggle)
    globalThis.removeEventListener('storage', storage)
    globalThis.removeEventListener('pagehide', dispose)
    release()
    if (globalThis.dshSidebarToolsController?.dispose === dispose) delete globalThis.dshSidebarToolsController
  }
  button.addEventListener('click', toggle)
  globalThis.addEventListener('storage', storage)
  globalThis.addEventListener('pagehide', dispose)
  globalThis.dshSidebarToolsController = { dispose }
  sync()
  return true
}

export const SIDEBAR_TOOLS_SCRIPT = `(${installSidebarTools.toString()})()`
