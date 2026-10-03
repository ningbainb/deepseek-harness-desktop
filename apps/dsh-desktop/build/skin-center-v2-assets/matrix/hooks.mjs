/**
 * Matrix (matrix) skin hooks — the trusted escape hatch of the v2 skin
 * contract (x-org.linxin666.skin-center/v1alpha1), reviewed and released
 * with this repository. Loading this module executes nothing; apply() owns
 * every DOM write and registers its retraction through ctx.onCleanup.
 *
 * Port of the v1 plugin effects (packages/skins/matrix/src/client/index.ts):
 *  - forced dark theme: the skin is a night-use theme; v1 pinned
 *    body[data-ds-dark-theme] and re-pinned it through a MutationObserver
 *    (guarded so the pin only holds while the skin is mounted). The v1
 *    guard read the v1 scoping attribute; the activation-local flag below
 *    plays the same role in v2.
 *  - digital rain: a low-opacity full-viewport canvas. v1 stacked it at
 *    z-index 2147483000 (above every overlay), so it mounts on
 *    document.body exactly as v1 did rather than on a decoration layer
 *    (the layers deliberately paint below the official overlay band).
 *    The visual parameters (glyph set, speed, colors, opacity, 50ms frame
 *    throttle, 2x bitmap cap) are preserved verbatim.
 * The stylesheet scoping is loader-owned (html[data-dsh-skin="matrix"]);
 * the v1 body attribute is never written by v2 skins.
 */

/** Katakana + ASCII glyphs for the digital rain (classic Matrix flavor). */
const GLYPHS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEF'

/** Bitmap density cap: the rain is a low-opacity ambience layer, so beyond 2x
 * the extra pixels are invisible — cap to keep the fill cost bounded. */
const DPR_CAP = 2

/**
 * Mount the low-opacity digital-rain overlay. Returns a disposer, or null
 * when the environment prefers reduced motion / has no canvas support.
 */
function mountRain() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null
  const canvas = document.createElement('canvas')
  canvas.dataset.plugin = 'dsh-matrix-skin'
  canvas.setAttribute('aria-hidden', 'true')
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2147483000;opacity:.10'
  document.body.appendChild(canvas)
  const g = canvas.getContext('2d')
  if (!g) {
    canvas.remove()
    return null
  }
  const FONT = '16px Menlo,Consolas,monospace'
  let cols = []
  let raf = 0
  let last = 0
  /** Bitmap scale for the current display density, capped at DPR_CAP. */
  const scale = () => Math.min(window.devicePixelRatio || 1, DPR_CAP)
  const resize = () => {
    const s = scale()
    canvas.width = Math.round(window.innerWidth * s)
    canvas.height = Math.round(window.innerHeight * s)
    // All drawing coordinates below stay in CSS pixels; the transform maps
    // them onto the denser bitmap.
    g.setTransform(s, 0, 0, s, 0, 0)
    const n = Math.max(1, Math.floor(window.innerWidth / 18))
    cols = []
    for (let i = 0; i < n; i++) {
      cols.push({ y: Math.random() * -window.innerHeight, speed: 0.5 + Math.random() * 1.3, chars: [] })
    }
  }
  const frame = (t) => {
    raf = 0
    if (document.hidden) return
    if (t - last < 50) {
      raf = requestAnimationFrame(frame)
      return
    }
    last = t
    g.fillStyle = 'rgba(4,8,5,0.14)'
    g.fillRect(0, 0, window.innerWidth, window.innerHeight)
    g.font = FONT
    cols.forEach((c, i) => {
      c.y += c.speed * 16
      if (c.y > window.innerHeight + 40) {
        c.y = -40
        c.chars = []
      }
      c.chars.unshift(GLYPHS[(Math.random() * GLYPHS.length) | 0])
      if (c.chars.length > 14) c.chars.pop()
      const x = i * 18
      for (let j = 0; j < c.chars.length; j++) {
        g.fillStyle = j === 0 ? 'rgba(190,255,215,0.95)' : `rgba(0,230,118,${0.9 - j * 0.05})`
        g.fillText(c.chars[j], x, c.y - j * 16)
      }
    })
    raf = requestAnimationFrame(frame)
  }
  resize()
  window.addEventListener('resize', resize)
  raf = requestAnimationFrame(frame)
  return () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', resize)
    canvas.remove()
  }
}

export default function defineSkinHooks() {
  return {
    apply(ctx) {
      const body = document.body
      if (!body) return
      // Force the dark-theme flag (night-use feature) and keep it pinned
      // while this activation lives, exactly like v1.
      let mounted = true
      const prevDark = body.dataset.dsDarkTheme
      body.dataset.dsDarkTheme = ''
      const attrObs = new MutationObserver(() => {
        // Only force the dark flag while the skin itself is mounted: a skin
        // switch retracts the skin for the session, and the observer must
        // stay inert for that retraction to stick — otherwise it would
        // re-add the dark flag the moment a light preview flips it.
        if (!mounted) return
        if (body.dataset.dsDarkTheme === undefined) body.dataset.dsDarkTheme = ''
      })
      attrObs.observe(body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
      let disposeRain = null
      try {
        disposeRain = mountRain()
      } catch {
        disposeRain = null
      }
      ctx.onCleanup(() => {
        mounted = false
        attrObs.disconnect()
        if (prevDark === undefined) delete body.dataset.dsDarkTheme
        else body.dataset.dsDarkTheme = prevDark
        if (disposeRain) disposeRain()
      })
    },
  }
}
