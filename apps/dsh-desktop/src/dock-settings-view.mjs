import { installNavigationPolicy } from './navigation-policy.mjs'
import { getWindowChromeTheme, WINDOW_CHROME_HEIGHT } from './window-chrome.mjs'
import { publishWindowMotion } from './window-motion.mjs'

export const DOCK_SETTING_IDS = Object.freeze(['relay', 'value-mode', 'personal-prompt', 'memory', 'particle-theme', 'describe-image'])

export function assertDockSetting(id) {
  if (id !== null && !DOCK_SETTING_IDS.includes(id)) throw new TypeError('unknown Dock settings page')
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
          type: 'question', title: '保存未完成的编辑', message: '个人偏好中有尚未保存的修改。',
          buttons: ['保存并关闭', '返回编辑', '放弃并关闭'], defaultId: 1, cancelId: 1, noLink: true,
        })
        if (response === 1) return
        if (response === 0) {
          const saved = await inspect(`(async () => {
            const forms = [...document.querySelectorAll('[data-dock-dirty="true"]')];
            for (const form of forms) form.querySelector('[data-dock-save]')?.click();
            for (let attempt = 0; attempt < 300; attempt++) {
              await new Promise(resolve => setTimeout(resolve, 100));
              if (!document.querySelector('[data-dock-dirty="true"]')) return true;
              if (forms.some(form => form.querySelector('[role="alert"]'))) return false;
            }
            return false;
          })()`, 32000)
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
    syncTheme: nextTheme => {
      theme = nextTheme
      view?.setBackgroundColor?.(theme === 'dark' ? '#0a141b' : '#ffffff')
      if (view && !view.webContents.isDestroyed()) void view.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('dsh:dock-theme', { detail: ${JSON.stringify(theme)} }))`).catch(() => {})
    },
  }
}
