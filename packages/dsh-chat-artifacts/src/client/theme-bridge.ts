import { useSyncExternalStore } from 'react'

const THEME_TOKENS = {
  '--ui-bg': [['--dsw-bg', '--dsw-alias-bg-base'], '#ffffff', '#17191d'],
  '--ui-surface': [['--dsw-surface', '--dsw-alias-bg-layer-1'], '#f8fafc', '#22262c'],
  '--ui-surface-elevated': [['--dsw-surface-elevated', '--dsw-alias-bg-layer-2'], '#ffffff', '#2c3139'],
  '--ui-text': [['--dsw-text', '--dsw-alias-label-primary'], '#1f2329', '#f2f4f7'],
  '--ui-text-muted': [['--dsw-text-muted', '--dsw-alias-label-secondary'], '#667085', '#98a2b3'],
  '--ui-border': [['--dsw-border-subtle', '--dsw-alias-border-l1'], '#dce1e8', '#3e4652'],
  '--ui-accent': [['--dsw-accent', '--dsw-alias-brand-primary'], '#4f46e5', '#a5b4fc'],
  '--ui-accent-soft': [['--dsw-accent-soft', '--dsw-alias-bg-multi-select'], '#e0e7ff', '#303b60'],
  '--ui-success': [['--dsw-success', '--dsw-alias-state-success-primary'], '#15803d', '#86efac'],
  '--ui-warning': [['--dsw-warning', '--dsw-alias-state-warning-primary'], '#a16207', '#fde68a'],
  '--ui-danger': [['--dsw-danger', '--dsw-alias-state-error-primary'], '#b91c1c', '#fca5a5'],
  '--ui-radius': [['--dsw-radius-md', '--dsw-radius-lg'], '10px', '10px'],
} as const

type ThemeToken = keyof typeof THEME_TOKENS
type StyleReader = Pick<CSSStyleDeclaration, 'getPropertyValue'>
export type ArtifactTheme = {
  scheme: 'light' | 'dark'
  tokens: Readonly<Record<ThemeToken, string>>
}

const tokenNames = Object.keys(THEME_TOKENS) as ThemeToken[]

function safeThemeValue(name: ThemeToken, value: unknown): value is string {
  // Keep host values within a CSS declaration even when a stylesheet is untrusted.
  return typeof value === 'string' && value.length > 0 && value.length <= 180
    && /^[\w#(),.%+*/\s-]+$/.test(value) && !/(?:url|var|env)\s*\(|\/\*/i.test(value)
    && (typeof CSS === 'undefined' || CSS.supports(name === '--ui-radius' ? 'border-radius' : 'color', value))
}

export function readArtifactTheme(style: StyleReader | undefined, dark: boolean): ArtifactTheme {
  const tokens = {} as Record<ThemeToken, string>
  for (const name of tokenNames) {
    const [aliases, lightValue, darkValue] = THEME_TOKENS[name]
    const value = aliases.map(alias => style?.getPropertyValue(alias).trim() ?? '')
      .find(candidate => safeThemeValue(name, candidate))
    tokens[name] = value ?? (dark ? darkValue : lightValue)
  }
  return { scheme: dark ? 'dark' : 'light', tokens }
}

export function artifactThemeCss(theme: ArtifactTheme): string {
  const dark = theme.scheme === 'dark'
  const fallback = dark ? defaultDark : defaultLight
  const declarations = tokenNames.map(name => {
    const value = theme.tokens[name]
    return name + ': ' + (safeThemeValue(name, value) ? value : fallback.tokens[name]) + ';'
  })
  return ':root { color-scheme: ' + fallback.scheme + '; ' + declarations.join(' ') + ' }'
}

const defaultLight = readArtifactTheme(undefined, false)
const defaultDark = readArtifactTheme(undefined, true)
export const ARTIFACT_DEFAULT_THEME_CSS = artifactThemeCss(defaultLight)
  + '\n@media (prefers-color-scheme: dark) { ' + artifactThemeCss(defaultDark) + ' }'

let snapshot: ArtifactTheme | undefined
const listeners = new Set<() => void>()
let stopWatching: (() => void) | undefined

function sampleTheme(): ArtifactTheme {
  const body = document.body
  const style = window.getComputedStyle(body ?? document.documentElement)
  const dark = body?.hasAttribute('data-ds-dark-theme') === true || style.colorScheme === 'dark'
  return readArtifactTheme(style, dark)
}

function refreshTheme(): void {
  const next = sampleTheme()
  if (snapshot?.scheme === next.scheme && tokenNames.every(name => snapshot?.tokens[name] === next.tokens[name])) return
  snapshot = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (stopWatching === undefined) {
    let pending: number | undefined
    const schedule = () => {
      if (pending !== undefined) return
      pending = window.requestAnimationFrame(() => {
        pending = undefined
        refreshTheme()
      })
    }
    const observer = new MutationObserver(schedule)
    observer.observe(document.documentElement, { attributes: true })
    if (document.body) observer.observe(document.body, { attributes: true })
    if (document.head) observer.observe(document.head, { attributes: true, characterData: true, childList: true, subtree: true })
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', schedule)
    document.head?.addEventListener('load', schedule, true)
    stopWatching = () => {
      if (pending !== undefined) window.cancelAnimationFrame(pending)
      observer.disconnect()
      media.removeEventListener('change', schedule)
      document.head?.removeEventListener('load', schedule, true)
      snapshot = undefined
      stopWatching = undefined
    }
    refreshTheme()
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) stopWatching?.()
  }
}

function getTheme(): ArtifactTheme { return snapshot ??= sampleTheme() }
function getDefaultTheme(): ArtifactTheme { return defaultLight }
function inactiveSubscription(): () => void { return () => {} }

export function useArtifactTheme(active: boolean): ArtifactTheme {
  return useSyncExternalStore(active ? subscribe : inactiveSubscription,
    active ? getTheme : getDefaultTheme, getDefaultTheme)
}
