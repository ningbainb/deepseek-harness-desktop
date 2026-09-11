import { CONVERSATION_RENDERING_CSS, CONVERSATION_RENDERING_SCRIPT } from './conversation-rendering.mjs'

export const CONVERSATION_POLISH_CSS = CONVERSATION_RENDERING_CSS + `
[data-variant="think"] > [data-open] > [data-disclosure-row] {
  position: sticky;
  z-index: 20;
  inset-block-start: 8px;
  margin-inline: -8px;
  padding-inline: 8px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--dsw-alias-bg-base, #ffffff) 92%, transparent);
  box-shadow: 0 1px 0 color-mix(in srgb, var(--dsw-alias-label-caption, #64748b) 22%, transparent);
  -webkit-backdrop-filter: blur(12px) saturate(125%);
  backdrop-filter: blur(12px) saturate(125%);
}

@media (prefers-contrast: more) {
  [data-variant="think"] > [data-open] > [data-disclosure-row] {
    background: var(--dsw-alias-bg-base, #ffffff);
    box-shadow: 0 1px 0 var(--dsw-alias-label-caption, #64748b);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
}
`

export async function applyConversationPolish(webContents) {
  if (!webContents || webContents.isDestroyed?.()) return false
  await webContents.insertCSS(CONVERSATION_POLISH_CSS, { cssOrigin: 'author' })
  if (webContents.isDestroyed?.()) return false
  await webContents.executeJavaScript(CONVERSATION_RENDERING_SCRIPT)
  return true
}

export function installConversationPolish({ browserWindow, onError = () => {} }) {
  const { webContents } = browserWindow
  const apply = () => {
    void applyConversationPolish(webContents).catch(onError)
  }
  webContents.on('did-finish-load', apply)
  return () => {
    webContents.removeListener('did-finish-load', apply)
    if (!webContents.isDestroyed?.()) void webContents.executeJavaScript('globalThis.dshConversationRenderingController?.dispose()').catch(onError)
  }
}
