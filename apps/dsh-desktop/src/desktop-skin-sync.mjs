import { desktopLocalPath } from './desktop-remote-path.mjs'

const ACTIVE_PATH = '/api/skin-center/v2/active'
const SKIN_ID = /^[a-z0-9][a-z0-9-]{0,79}$/u

// Electron's private scheme does not deliver BroadcastChannel messages
// between the main window and Dock WebContentsView. Mirror only a successful
// persisted selection; previews never POST to this endpoint.
export async function syncPersistedSkinToMain({ request, response, mainWindow }) {
  if (request.method !== 'POST' || !response.ok) return false
  if (desktopLocalPath(new URL(request.url).pathname) !== ACTIVE_PATH) return false
  if (!mainWindow || mainWindow.isDestroyed?.()) return false
  const contents = mainWindow.webContents
  if (!contents || contents.isDestroyed?.() || !contents.getURL?.().startsWith('dsh-runtime://app/')) return false
  let payload
  try { payload = await response.clone().json() } catch { return false }
  const id = payload?.active
  if (payload?.ok !== true || !(id === null || (typeof id === 'string' && SKIN_ID.test(id)))) return false
  const expression = `(async () => {
    const runtime = window.__skinRuntime;
    if (!runtime) return false;
    const id = ${JSON.stringify(id)};
    if (document.documentElement.getAttribute('data-dsh-skin') === id) return true;
    if (id !== null && !runtime.find(id)) await runtime.refreshCatalog();
    const entry = id === null ? null : runtime.find(id);
    if (id !== null && !entry) return false;
    if (typeof runtime.controller.adopt === 'function') await runtime.controller.adopt(id, entry);
    else await runtime.controller.switchTo(id, entry);
    return document.documentElement.getAttribute('data-dsh-skin') === id;
  })()`
  try { return await contents.executeJavaScript(expression) === true } catch { return false }
}
