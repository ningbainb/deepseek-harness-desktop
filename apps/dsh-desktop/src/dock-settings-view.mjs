import { installNavigationPolicy } from './navigation-policy.mjs'
import { getWindowChromeTheme, getWindowPalette, WINDOW_CHROME_HEIGHT } from './window-chrome.mjs'
import { publishWindowMotion } from './window-motion.mjs'
import { assertDockSetting } from './dock-pages.mjs'

export { DOCK_SETTING_IDS, assertDockSetting } from './dock-pages.mjs'

/** Runs in the settings renderer; each draft is submitted at most once. */
export async function saveDockSettingsDrafts({
  document = globalThis.document,
  wait = () => new Promise(resolve => setTimeout(resolve, 100)),
  maxPolls = 300,
} = {}) {
  const states = new Map()
  const alerts = form => [...form.querySelectorAll('[role="alert"]')].map(item => item.textContent).join('\n')
  const stateFor = form => {
    if (!states.has(form)) states.set(form, { revision: 0, initialAlerts: alerts(form), attempted: false, lastDraft: undefined })
    return states.get(form)
  }
  const edited = event => {
    const form = event.target?.closest?.('[data-dock-dirty]')
    if (form) stateFor(form).revision++
  }
  const draftKey = (form, state) => JSON.stringify([
    state.revision,
    [...form.querySelectorAll('input, textarea, select')].map(control => [
      control.value, control.checked,
      control.selectedOptions ? [...control.selectedOptions].map(option => option.value) : undefined,
    ]),
  ])
  document.addEventListener('input', edited, true)
  document.addEventListener('change', edited, true)
  try {
    for (let poll = 0; poll < maxPolls; poll++) {
      const forms = [...document.querySelectorAll('[data-dock-dirty="true"]')]
      if (forms.length === 0) return true
      for (const form of forms) {
        const state = stateFor(form)
        const failure = alerts(form)
        // A previous failure may be retried once by choosing Save and close.
        // New failures, including an already-running save failing, stop here.
        if (failure && (state.attempted || failure !== state.initialAlerts)) return false
        const button = form.querySelector('[data-dock-save]')
        if (!button) return false
        if (button.disabled) continue
        const draft = draftKey(form, state)
        if (draft === state.lastDraft) continue
        state.lastDraft = draft
        state.attempted = true
        button.click()
      }
      await wait()
    }
    return !document.querySelector('[data-dock-dirty="true"]')
  } finally {
    document.removeEventListener('input', edited, true)
    document.removeEventListener('change', edited, true)
  }
}

/** Lazy, unprivileged runtime view. It shares the local user's browser session,
 * but never receives the extension-management preload or an IPC surface grant. */
export function createDockSettingsView({ WebContentsView, window, mainWindow, getRuntimeOrigin, dialog, openExternal = () => {}, closeCheckTimeoutMs = 1500, navigationTimeoutMs = 25000 }) {
  let view
  let selected = null
  let origin
  let ready
  let documentReady = false
  let navigation = 0
  let allowClose = false
  let checkingClose = false
  let theme = getWindowChromeTheme(window)
  let palette = getWindowPalette(mainWindow)
  let lastBounds
  const bounded = (operation, timeoutMs, message) => {
    let timer
    return Promise.race([
      operation,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeoutMs) }),
    ]).finally(() => clearTimeout(timer))
  }
  const inspect = (script, timeoutMs = closeCheckTimeoutMs) => bounded(view.webContents.executeJavaScript(script), timeoutMs, 'settings inspection timed out')
  const checkClose = event => {
    if (allowClose || !view || view.webContents.isDestroyed() || !dialog) return
    event.preventDefault()
    if (checkingClose) return
    checkingClose = true
    void (async () => {
      const dirty = await inspect('Boolean(document.querySelector(\'[data-dock-dirty="true"]\'))')
      if (dirty) {
        const { response } = await dialog.showMessageBox(window, {
          type: 'question', title: '保存未完成的编辑', message: '设置中有尚未保存的修改。',
          buttons: ['保存并关闭', '返回编辑', '放弃并关闭'], defaultId: 1, cancelId: 1, noLink: true,
        })
        if (response === 1) return
        if (response === 0) {
          const saved = await inspect(`(${saveDockSettingsDrafts.toString()})()`, 32000)
          if (!saved) {
            await dialog.showMessageBox(window, { type: 'warning', message: '修改未能全部保存，请返回对应设置检查后重试。' })
            return
          }
        }
      }
      allowClose = true
      window.close()
    })().catch(async () => {
      if (window.isDestroyed()) return
      const { response } = await dialog.showMessageBox(window, {
        type: 'warning', message: '暂时无法确认编辑状态。关闭可能丢失未保存的修改。',
        buttons: ['返回编辑', '仍然关闭'], defaultId: 0, cancelId: 0, noLink: true,
      })
      if (response === 1) { allowClose = true; window.close() }
    }).catch(() => {}).finally(() => { checkingClose = false })
  }
  window.on('close', checkClose)
  const layout = () => {
    if (!view || window.isDestroyed() || window.isMinimized?.()) return
    const [width, height] = window.getContentSize()
    const sidebar = width <= 900 ? 160 : 176
    const bounds = { x: sidebar, y: WINDOW_CHROME_HEIGHT, width: Math.max(1, width - sidebar), height: Math.max(1, height - WINDOW_CHROME_HEIGHT) }
    if (lastBounds && Object.keys(bounds).every(key => bounds[key] === lastBounds[key])) return
    lastBounds = bounds
    view.setBounds(bounds)
  }
  const minimize = () => view?.setVisible(false)
  const restore = () => {
    layout()
    if (view && selected !== null && !view.webContents.isDestroyed()) view.setVisible(true)
  }
  window.on('minimize', minimize)
  window.on('restore', restore)
  const select = async (id, request) => {
    assertDockSetting(id)
    selected = id
    if (id === null) { view?.setVisible(false); return }
    const runtimeOrigin = getRuntimeOrigin()
    if (!runtimeOrigin) throw new Error('运行时尚未就绪，请启动后重试。')
    // Keep a warm form visible while React changes tabs; its draft stays mounted.
    if (!documentReady || origin !== runtimeOrigin) view?.setVisible(false)
    if (!view) {
      view = new WebContentsView({ webPreferences: {
        session: mainWindow.webContents.session,
        contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true,
      } })
      view.setVisible(false)
      window.contentView.addChildView(view)
      view.setBackgroundColor?.(theme === 'dark' ? '#0a141b' : '#ffffff')
      installNavigationPolicy({ webContents: view.webContents, getRuntimeOrigin, openExternal })
      view.webContents.on('will-redirect', (event, url) => {
        if (new URL(url).origin !== getRuntimeOrigin()) event.preventDefault()
      })
      window.on('resize', layout)
    }
    if (origin !== runtimeOrigin) {
      origin = runtimeOrigin
      documentReady = false
      const url = new URL(runtimeOrigin)
      url.searchParams.set('desktop-dock-setting', id)
      url.searchParams.set('desktop-dock-theme', theme)
      ready = view.webContents.loadURL(url.href).catch(error => {
        if (window.isDestroyed() || !view || view.webContents.isDestroyed()) return
        throw error
      })
    }
    await bounded(ready, navigationTimeoutMs, '设置页面加载超时，请重试。')
    if (request !== navigation || window.isDestroyed()) return
    // Wait for the slot-mounted form, not only the runtime's HTML response.
    await inspect(`new Promise((resolve, reject) => {
      const started = Date.now();
      const request = ${request};
      window.__dshDockSelection = request;
      let dispatched = false;
      const check = () => {
        if (window.__dshDockSelection !== request) { resolve(false); return; }
        if (document.querySelector('[data-dsh-dock-settings]')) {
          if (!dispatched) {
            dispatched = true;
            window.dispatchEvent(new CustomEvent('dsh:dock-setting', { detail: ${JSON.stringify(id)} }));
            window.dispatchEvent(new CustomEvent('dsh:dock-theme', { detail: ${JSON.stringify(theme)} }));
            window.dispatchEvent(new CustomEvent('dsh:dock-palette', { detail: ${JSON.stringify(palette)} }));
          }
          if (document.querySelector('[data-dsh-dock-settings]').getAttribute('data-dsh-dock-settings') === ${JSON.stringify(id)}) { resolve(true); return; }
        }
        if (Date.now() - started > 20000) reject(new Error('设置页面加载超时，请重试。'));
        else setTimeout(check, dispatched ? 16 : 100);
      }; check();
    })`, navigationTimeoutMs)
    if (request !== navigation || window.isDestroyed()) return
    documentReady = true
    layout()
    view.setVisible(!window.isMinimized?.())
  }
  window.once('closed', () => {
    navigation++
    selected = null
    window.removeListener('resize', layout)
    window.removeListener('minimize', minimize)
    window.removeListener('restore', restore)
    window.removeListener('close', checkClose)
    if (view && !view.webContents.isDestroyed()) view.webContents.close()
    view = undefined
  })
  return {
    setInteracting: active => publishWindowMotion(view?.webContents, active),
    select: async id => {
      const request = ++navigation
      try { await select(id, request) } catch (error) {
        if (request !== navigation || window.isDestroyed()) return
        origin = undefined
        documentReady = false
        // Expose the Dock shell's retry message instead of an obsolete opaque form.
        if (view && !view.webContents.isDestroyed()) view.setVisible(false)
        throw error
      }
    },
    syncPalette: value => {
      palette = value
      if (view && !view.webContents.isDestroyed()) void view.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('dsh:dock-palette', { detail: ${JSON.stringify(palette)} }))`).catch(() => {})
    },
    syncTheme: nextTheme => {
      theme = nextTheme
      view?.setBackgroundColor?.(theme === 'dark' ? '#0a141b' : '#ffffff')
      if (view && !view.webContents.isDestroyed()) void view.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('dsh:dock-theme', { detail: ${JSON.stringify(theme)} }))`).catch(() => {})
    },
  }
}
