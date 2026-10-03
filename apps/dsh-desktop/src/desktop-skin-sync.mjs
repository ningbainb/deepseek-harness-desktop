import { desktopLocalPath } from './desktop-remote-path.mjs'

const ACTIVE_PATH = '/api/skin-center/v2/active'
const SKIN_ID = /^[a-z0-9][a-z0-9-]{0,79}$/u
const MAX_REQUEST_BYTES = 16384
const requestSelections = new WeakMap()

export async function preparePersistedSkinRequest(request) {
  if (request.method !== 'POST' || desktopLocalPath(new URL(request.url).pathname) !== ACTIVE_PATH) return undefined
  if (requestSelections.has(request)) return requestSelections.get(request)
  const selection = (async () => {
    let reader
    try {
      reader = request.clone().body?.getReader()
      if (!reader) return undefined
      const chunks = []
      let bytes = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value.byteLength
        if (bytes > MAX_REQUEST_BYTES) {
          void reader.cancel().catch(() => {})
          return undefined
        }
        chunks.push(value)
      }
      const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))
      if (!payload || Array.isArray(payload) || !Object.hasOwn(payload, 'active')) return undefined
      const active = payload.active
      if (!(active === null || (typeof active === 'string' && SKIN_ID.test(active)))) return undefined
      return { active }
    } catch { return undefined } finally { reader?.releaseLock() }
  })()
  requestSelections.set(request, selection)
  return selection
}

export async function syncPersistedSkinToMain({ request, response, mainWindow }) {
  if (request.method !== 'POST' || !response.ok) return false
  if (desktopLocalPath(new URL(request.url).pathname) !== ACTIVE_PATH) return false
  if (!mainWindow || mainWindow.isDestroyed?.()) return false
  const contents = mainWindow.webContents
  if (!contents || contents.isDestroyed?.() || !contents.getURL?.().startsWith('dsh-runtime://app/')) return false
  const selection = await preparePersistedSkinRequest(request)
  if (!selection) return false
  let payload
  try { payload = await response.clone().json() } catch { return false }
  const id = payload?.active
  if (payload?.ok !== true || id !== selection.active) return false
  const expression = `(async () => {
    const runtime = window.__skinRuntime;
    if (!runtime) return false;
    const id = ${JSON.stringify(id)};
    if (document.documentElement.getAttribute('data-dsh-skin') === id && !runtime.controller.getState?.().previewing) return true;
    if (id !== null && !runtime.find(id)) await runtime.refreshCatalog();
    const entry = id === null ? null : runtime.find(id);
    if (id !== null && !entry) return false;
    if (typeof runtime.controller.adopt === 'function') await runtime.controller.adopt(id, entry);
    else await runtime.controller.switchTo(id, entry);
    return document.documentElement.getAttribute('data-dsh-skin') === id;
  })()`
  try { return await contents.executeJavaScript(expression) === true } catch { return false }
}
