import { randomUUID } from 'node:crypto'
import { DESKTOP_SURFACES } from './desktop-contract.mjs'

/** A request is successful only after the live main-frame client owner opens it. */
export function createDesktopToolNavigator({ ipcMain, surfaceRegistry, getMainWindow, getDockWindow, timeoutMs = 3000 }) {
  let pending = false
  return async tool => {
    if (tool !== 'task-board' && tool !== 'ssh') throw new TypeError('Unknown Desktop tool')
    if (pending) throw new Error('另一个工具正在打开，请稍后重试。')
    const main = getMainWindow()
    if (!main || main.isDestroyed()) throw new Error('桌面主窗口尚未就绪，请重试。')
    const id = randomUUID()
    pending = true
    try {
      await new Promise((resolve, reject) => {
        const finish = (error) => {
          clearTimeout(timer)
          ipcMain.removeListener('desktop:tool-open-result', receive)
          main.webContents.removeListener?.('destroyed', destroyed)
          if (error) reject(error)
          else resolve()
        }
        const destroyed = () => finish(new Error('桌面主窗口已关闭，工具未能打开。'))
        const receive = (event, result) => {
          if (event?.sender !== main.webContents || event.senderFrame !== main.webContents.mainFrame) return
          try {
            surfaceRegistry.assert(event.sender, DESKTOP_SURFACES.MAIN)
            const url = new URL(event.senderFrame.url)
            if (url.protocol !== 'dsh-runtime:' || url.hostname !== 'app') return
          } catch { return }
          if (!result || typeof result !== 'object' || Array.isArray(result)
            || Object.keys(result).sort().join(',') !== 'handled,id,tool'
            || result.id !== id || result.tool !== tool || typeof result.handled !== 'boolean') return
          finish(result.handled ? undefined : new Error('该工具未启用或客户端尚未就绪，请检查插件设置后重试。'))
        }
        const timer = setTimeout(() => finish(new Error('工具打开确认超时，请稍后重试。')), timeoutMs)
        ipcMain.on('desktop:tool-open-result', receive)
        main.webContents.once?.('destroyed', destroyed)
        try { main.webContents.send(`desktop:tool-open:${tool}`, { id, tool }) }
        catch (error) { finish(error) }
      })
      if (main.isDestroyed()) throw new Error('桌面主窗口已关闭，工具未能打开。')
      if (main.isMinimized()) main.restore()
      getDockWindow()?.hide()
      main.show()
      main.focus()
      return { accepted: true }
    } finally { pending = false }
  }
}
