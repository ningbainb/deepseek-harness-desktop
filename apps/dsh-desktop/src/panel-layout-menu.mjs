/**
 * Serialized into the Desktop renderer. Relocate only the pinned community
 * panel controls; invoke their existing React handlers so tabs, terminal
 * processes and per-session state keep their original owner. No SDK internals
 * or React trees are modified. Unknown hosts keep their original controls.
 */
export function installPanelLayoutMenu({ document, window, chrome, closeMenus }) {
  const menu = chrome.querySelector('.dsh-window-chrome-tools [role="menu"]')
  const trigger = chrome.querySelector('.dsh-window-chrome-tools > button')
  if (!menu || !trigger) return () => {}
  const marker = 'data-dsh-desktop-layout-relocated'
  const nativeSelector = '[data-sidebar-right-expand], [data-sidebar-right-toggle], [data-aionui-sidebar-return-button]'
  const clusterSelector = '[data-dsh-panel-host] > [class*="toggleCluster"]'
  const bottomSelector = '[data-dsh-bottom-toggle]'
  const explorerSelector = '.aionui-floating-expand'
  const watchedSelector = `${nativeSelector}, [data-dsh-panel-host], ${bottomSelector}, ${explorerSelector}, [data-aionui-explorer-col]`
  const labels = {
    bottom: ['展开底部面板', '折叠底部面板', 'Expand bottom panel', 'Collapse bottom panel'],
    right: ['展开侧边栏', '折叠侧边栏', 'Expand sidebar', 'Collapse sidebar'],
  }
  const style = document.createElement('style')
  style.dataset.dshPanelLayoutStyle = 'true'
  style.textContent = `[${marker}="true"] { display: none !important; }
    #dsh-desktop-window-chrome .dsh-layout-group { border-top: 1px solid var(--dsw-alias-border-l2, #80808040); margin-top: 5px; padding-top: 5px; }
    #dsh-desktop-window-chrome .dsh-layout-heading { padding: 5px 10px; font-size: 11px; opacity: .65; }
    #dsh-desktop-window-chrome .dsh-layout-group[hidden] { display: none; }
    #dsh-desktop-window-chrome .dsh-layout-group button[hidden] { display: none; }
    #dsh-desktop-window-chrome .dsh-layout-group button:disabled { opacity: .5; cursor: default; }`
  const group = document.createElement('div')
  group.className = 'dsh-layout-group'
  group.setAttribute('role', 'group')
  group.setAttribute('aria-label', '布局 / Layout')
  group.hidden = true
  const heading = document.createElement('div')
  heading.className = 'dsh-layout-heading'
  heading.textContent = '布局 / Layout'
  group.append(heading)
  const entries = new Map()
  let disposed = false, scheduled = 0
  const owned = new Set()
  const setText = (node, text) => { if (node.textContent !== text) node.textContent = text }
  const setAttribute = (node, key, value) => { if (node.getAttribute(key) !== value) node.setAttribute(key, value) }
  for (const [kind, title] of [['bottom', '底部工具面板 / Bottom Tools'], ['right', '兼容侧栏 / Compatibility Sidebar']]) {
    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'dsh-window-chrome-menu-item'
    item.dataset.dshLayoutAction = kind
    item.setAttribute('role', 'menuitemcheckbox')
    item.setAttribute('aria-label', title)
    const label = document.createElement('span')
    label.textContent = title
    const status = document.createElement('span')
    status.className = 'dsh-window-chrome-menu-shortcut'
    status.setAttribute('aria-hidden', 'true')
    item.append(label, status)
    const entry = { item, status, original: null }
    entries.set(kind, entry)
    item.addEventListener('click', () => {
      // Resolve again: a session switch may have replaced the original node
      // between the menu opening and this click.
      sync()
      if (!entry.original?.isConnected || entry.original.disabled || item.hidden || group.hidden) return
      closeMenus({ restoreFocus: true })
      entry.original.click()
      schedule()
    })
    group.append(item)
  }
  menu.append(group)
  document.head.append(style)

  function restore() {
    for (const cluster of owned) cluster.removeAttribute(marker)
    owned.clear()
  }
  function sync() {
    if (disposed) return
    if (!chrome.isConnected || !group.isConnected || !style.isConnected) { dispose(); return }
    const clusters = [...document.querySelectorAll(clusterSelector)]
    let match
    // Exactly one current-session workbench and a native replacement are
    // required. Fail open on ambiguous/updated markup or unsupported locales.
    if (clusters.length === 1 && document.querySelector(nativeSelector)) {
      const cluster = clusters[0]
      const buttons = [...cluster.querySelectorAll('button')]
      const found = new Map()
      for (const button of buttons) {
        const label = button.getAttribute('aria-label')
        const kind = Object.keys(labels).find(key => labels[key].includes(label))
        if (!kind || found.has(kind)) { found.clear(); break }
        found.set(kind, button)
      }
      if (found.has('right') && found.size === buttons.length) match = { cluster, found }
    }
    // Sidebar 0.19 registers its bottom toggle in the session header. The
    // preserved AionUI explorer still owns the compatibility-side toggle.
    if (!match && clusters.length === 0 && document.querySelector(nativeSelector)) {
      const bottoms = [...document.querySelectorAll(bottomSelector)]
      if (bottoms.length === 1 && labels.bottom.includes(bottoms[0].getAttribute('aria-label'))) {
        const found = new Map([['bottom', bottoms[0]]])
        const explorers = [...document.querySelectorAll(explorerSelector)]
        if (explorers.length === 1) found.set('right', explorers[0])
        match = { cluster: bottoms[0], found }
      }
    }
    for (const cluster of owned) {
      if (cluster !== match?.cluster) { cluster.removeAttribute(marker); owned.delete(cluster) }
    }
    group.hidden = !match
    for (const [kind, entry] of entries) {
      const original = match?.found.get(kind)
      entry.original = original ?? null
      entry.item.hidden = !original
      entry.item.disabled = !original || original.disabled
      const index = labels[kind].indexOf(original?.getAttribute('aria-label'))
      const open = kind === 'right' && original?.matches(explorerSelector)
        ? document.querySelector('[data-aionui-explorer-col]')?.getAttribute('data-aionui-visible') === 'true'
        : index === 1 || index === 3
      setAttribute(entry.item, 'aria-checked', String(open))
      setText(entry.status, open ? '已展开 / Open' : '已收起 / Closed')
    }
    if (match) {
      if (match.cluster.contains(document.activeElement)) trigger.focus()
      owned.add(match.cluster)
      setAttribute(match.cluster, marker, 'true')
    }
  }
  function schedule() {
    if (!disposed && !scheduled) scheduled = window.requestAnimationFrame(() => { scheduled = 0; sync() })
  }
  const relevant = node => node.nodeType === 1 &&
    (node.matches(watchedSelector) || node.querySelector(watchedSelector))
  const observer = new window.MutationObserver(records => {
    if (!chrome.isConnected || !group.isConnected || !style.isConnected) { dispose(); return }
    // Ignore conversation text/streaming mutations and our own menu updates.
    if (records.some(record => record.target.nodeType === 1 && record.target.closest(`${clusterSelector}, ${bottomSelector}, ${explorerSelector}, [data-aionui-explorer-col]`) ||
      [...record.addedNodes, ...record.removedNodes].some(relevant))) schedule()
  })
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-label', 'disabled', 'aria-pressed', 'data-aionui-visible'] })
  const onKey = event => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const items = [...menu.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]')]
      .filter(item => !item.disabled && !item.hidden && !item.closest('[hidden]'))
    if (!items.length) return
    event.preventDefault()
    const index = items.indexOf(document.activeElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length
    items[next].focus()
  }
  const onOpen = () => sync()
  const onPageHide = event => { if (!event.persisted) dispose() }
  menu.addEventListener('keydown', onKey)
  trigger.addEventListener('click', onOpen)
  window.addEventListener('pagehide', onPageHide)
  function dispose() {
    if (disposed) return
    disposed = true
    observer.disconnect()
    if (scheduled) window.cancelAnimationFrame(scheduled)
    restore()
    group.remove()
    style.remove()
    menu.removeEventListener('keydown', onKey)
    trigger.removeEventListener('click', onOpen)
    window.removeEventListener('pagehide', onPageHide)
  }
  sync()
  return dispose
}
