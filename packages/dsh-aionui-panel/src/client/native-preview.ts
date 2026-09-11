import type { ISidebarRight } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { detectContentType } from './fileType.ts'

const NATIVE_PREVIEW_TYPES = new Set(['markdown', 'html', 'pdf', 'image', 'code', 'text'])

/** Encode the documented session-file resource address; never broaden a tree path. */
export function nativePreviewAddress(sessionId: string, path: string): string | undefined {
  const normalized = path.replace(/\\/g, '/').replace(/^(?:\.\/)+/u, '')
  if (!sessionId || !normalized || normalized.startsWith('/') || /^[a-z]:/iu.test(normalized)
    || normalized.split('/').some(part => part === '..' || part === '.') || normalized.includes('\u0000')) return undefined
  return `dsh-resource://file/session/${encodeURIComponent(sessionId)}/${normalized.split('/').map(encodeURIComponent).join('/')}`
}

/** Common previews use the official sidebar; specialized editors stay in Desktop. */
export function openNativePreview(options: {
  sidebar?: Pick<ISidebarRight, 'openResource'>
  registry?: { claim(address: string): unknown }
  sessionId?: string
  currentRoot?: string
}, root: string, path: string): boolean {
  if (!options.sidebar || !options.registry || !options.sessionId || options.currentRoot !== root
    || !NATIVE_PREVIEW_TYPES.has(detectContentType(path))) return false
  const address = nativePreviewAddress(options.sessionId, path)
  if (!address) return false
  try {
    if (!options.registry.claim(address)) return false
    options.sidebar.openResource(address)
    return true
  } catch {
    // No mounted native seat or registered reader: retain a functional preview.
    return false
  }
}
