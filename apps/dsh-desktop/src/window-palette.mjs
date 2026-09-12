export function normalizeWindowPalette(value) {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'object' || Array.isArray(value)) throw new TypeError('invalid window palette')
  const result = {}
  for (const key of ['background', 'foreground', 'accent', 'border']) {
    if (typeof value[key] !== 'string' || !/^#[0-9a-f]{6}$/iu.test(value[key])) throw new TypeError('invalid window palette color')
    result[key] = value[key].toLowerCase()
  }
  return result
}

/** Serialized into local window documents; fixed properties only. */
export function applyWindowPalette(document, palette) {
  const properties = {
    background: ['--dsh-desktop-chrome-bg', '--harness-bg', '--harness-bg-subtle', '--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2', '--dsw-alias-bg-layer-3'],
    foreground: ['--harness-text', '--harness-text-secondary', '--dsw-alias-label-primary', '--dsw-alias-label-secondary'],
    accent: ['--harness-accent', '--dsw-alias-brand-primary'],
    border: ['--harness-border', '--dsw-alias-border-l2'],
  }
  for (const [key, names] of Object.entries(properties)) for (const name of names) {
    if (palette) document.documentElement.style.setProperty(name, palette[key])
    else document.documentElement.style.removeProperty(name)
  }
  if (palette) document.documentElement.dataset.dshDesktopPalette = 'true'
  else delete document.documentElement.dataset.dshDesktopPalette
}
