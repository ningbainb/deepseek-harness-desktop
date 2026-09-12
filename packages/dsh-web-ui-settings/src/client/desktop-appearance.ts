export interface DesktopPalette { background: string; foreground: string; accent: string; border: string }
type Appearance = { theme: 'dark' | 'light'; palette: DesktopPalette | null }

export function opaqueColor(value: string): string | undefined {
  const hex = value.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1]
  if (hex) return '#' + (hex.length === 3 ? [...hex].map(c => c + c).join('') : hex).toLowerCase()
  const rgb = value.trim().match(/^rgba?\(\s*(\d+(?:\.\d+)?)[, ]+\s*(\d+(?:\.\d+)?)[, ]+\s*(\d+(?:\.\d+)?)(?:\s*[,/]\s*(1(?:\.0+)?))?\s*\)$/i)
  if (!rgb) return undefined
  return '#' + rgb.slice(1, 4).map(c => Math.min(255, Math.max(0, Math.round(Number(c)))).toString(16).padStart(2, '0')).join('')
}

/** Native title bars are opaque. Blend translucent skin tokens over their surface. */
export function surfaceColor(value: string, background: string): string {
  const opaque = opaqueColor(value)
  if (opaque) return opaque
  const hex = value.trim().match(/^#([\da-f]{4}|[\da-f]{8})$/i)?.[1]
  const rgba = value.trim().match(/^rgba?\(\s*(\d+(?:\.\d+)?)[, ]+\s*(\d+(?:\.\d+)?)[, ]+\s*(\d+(?:\.\d+)?)\s*[,/]\s*(0(?:\.\d+)?|1(?:\.0+)?|\.\d+)\s*\)$/i)
  let channels: number[], alpha: number
  if (hex) {
    const expanded = hex.length === 4 ? [...hex].map(c => c + c).join('') : hex
    channels = [0, 2, 4].map(index => parseInt(expanded.slice(index, index + 2), 16))
    alpha = parseInt(expanded.slice(6), 16) / 255
  } else if (rgba) {
    channels = rgba.slice(1, 4).map(Number)
    alpha = Number(rgba[4])
  } else return background
  return '#' + channels.map((channel, index) => {
    const base = parseInt(background.slice(1 + index * 2, 3 + index * 2), 16)
    return Math.round(Math.min(255, channel) * alpha + base * (1 - alpha)).toString(16).padStart(2, '0')
  }).join('')
}

/** Synchronize declarative colors only; skin scripts receive no desktop authority. */
export function installDesktopAppearance(window: Window): () => void {
  const { document } = window
  const desktop = (window as Window & { dshDesktop?: { setWindowChromeTheme?: (theme: string, palette: DesktopPalette | null) => Promise<unknown> } }).dshDesktop
  let previous = '', timer: ReturnType<typeof setTimeout> | undefined
  const apply = (value: Appearance) => {
    if (!value || !['dark', 'light'].includes(value.theme)) return
    if (value.palette && !['background', 'foreground', 'accent', 'border'].every(key => /^#[\da-f]{6}$/i.test(value.palette![key as keyof DesktopPalette]))) return
    const style = document.documentElement.style
    if (value.palette) style.setProperty('--dsh-desktop-chrome-bg', value.palette.background)
    else style.removeProperty('--dsh-desktop-chrome-bg')
    window.dispatchEvent(new CustomEvent('dsh:dock-palette', { detail: value.palette }))
    void desktop?.setWindowChromeTheme?.(value.theme, value.palette)?.catch(() => {})
  }
  const sample = () => {
    timer = undefined
    const root = document.documentElement
    const style = window.getComputedStyle(document.body)
    const token = (name: string, fallback: string) => surfaceColor(style.getPropertyValue(name), fallback)
    const skin = root.getAttribute('data-dsh-skin')
    const dark = document.body.hasAttribute('data-ds-dark-theme') || style.colorScheme === 'dark'
    const base = opaqueColor(style.backgroundColor) ?? opaqueColor(window.getComputedStyle(root).backgroundColor) ?? (dark ? '#071117' : '#f7f8fa')
    const background = token('--dsw-alias-bg-layer-1', base)
    const value: Appearance = { theme: dark ? 'dark' : 'light', palette: skin && skin !== 'official' ? {
      background,
      foreground: token('--dsw-alias-label-primary', dark ? '#d9edf4' : '#1f2937'),
      accent: token('--dsw-alias-brand-primary', '#416bd4'),
      border: token('--dsw-alias-border-l2', background),
    } : null }
    const key = JSON.stringify(value)
    if (key === previous) return
    previous = key
    apply(value)
  }
  const schedule = () => { if (!timer) timer = setTimeout(sample, 80) }
  const observer = new MutationObserver(schedule)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-dsh-skin', 'style', 'class'] })
  observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
  document.addEventListener('load', schedule, true)
  schedule()
  return () => { clearTimeout(timer); observer.disconnect(); document.removeEventListener('load', schedule, true) }
}
