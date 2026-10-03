/**
 * Dragon Heir (dragon-heir) skin hooks — the trusted escape hatch of the
 * v2 skin contract (x-org.linxin666.skin-center/v1alpha1), reviewed and
 * released with this repository. Loading this module executes nothing;
 * apply() owns every DOM write and registers its retraction through
 * ctx.onCleanup.
 *
 * Port of the v1 plugin effects
 * (packages/skins/dragon-heir/src/client/index.ts):
 *  - themed artwork: v1 swapped the backdrop art (LIGHT_ART 不屈龙魂 /
 *    DARK_ART 万里长城) and a brightness/contrast lift on every theme
 *    flip. v2 paints the backdrop declaratively through
 *    contributes.backgroundMedia, but the manifest can only name one
 *    artwork per variant and has no filter slot — so these hooks correct
 *    the background layer in place: swap the painted image to
 *    assets/dark-art.webp on the dark theme and apply the v1 filter lift
 *    to the layer (art + scrim), exactly like the v1 filtered backdrop
 *    element. When the skin-center suppresses manifest media (wallpaper
 *    priority) the layer is empty and the correction no-ops.
 *  - themed favicon: the 龙 seal, vermilion by day (LIGHT_ICON) and gold
 *    by night (DARK_ICON), swapped on the same theme flips; kept as inline
 *    SVG data URIs exactly as v1 carried them.
 * Theme flips are tracked with a MutationObserver on
 * body[data-ds-dark-theme] — the same ground truth v1 watched.
 */

/** Both artworks are moody dark paintings; lift them hard so the subject
 *  reads clearly through the frosted surfaces (light theme lifts hardest,
 *  dark theme keeps some dusk). */
const FILTER_LIGHT = 'brightness(1.5) contrast(1.22) saturate(1.08)'
const FILTER_DARK = 'brightness(1.42) contrast(1.2) saturate(1.1)'

const svgUri = (svg) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`

/** 朱砂 seal favicon — vermilion block, cream 龙 glyph (light theme). */
const LIGHT_ICON = svgUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">' +
  '<rect x="3" y="3" width="42" height="42" rx="9" fill="#c3272b"/>' +
  '<rect x="6" y="6" width="36" height="36" rx="7" fill="none" stroke="#fdf8ee" stroke-opacity="0.55" stroke-width="1.5"/>' +
  '<text x="24" y="34" font-size="28" text-anchor="middle" font-family="Kaiti, KaiTi, STKaiti, serif" fill="#fdf8ee">龙</text>' +
  '</svg>',
)

/** 鎏金 seal favicon — gold block, dark-red 龙 glyph (dark theme). */
const DARK_ICON = svgUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">' +
  '<rect x="3" y="3" width="42" height="42" rx="9" fill="#c8a24a"/>' +
  '<rect x="6" y="6" width="36" height="36" rx="7" fill="none" stroke="#3a0d0b" stroke-opacity="0.5" stroke-width="1.5"/>' +
  '<text x="24" y="34" font-size="28" text-anchor="middle" font-family="Kaiti, KaiTi, STKaiti, serif" fill="#3a0d0b">龙</text>' +
  '</svg>',
)

export default function defineSkinHooks() {
  return {
    apply(ctx) {
      const body = document.body

      const favicon = document.createElement('link')
      favicon.rel = 'icon'
      favicon.type = 'image/svg+xml'
      document.head.append(favicon)

      const setSurface = () => {
        const dark = ctx.theme.get() === 'dark'
        // Correct the declaratively painted background media: the manifest
        // names the light artwork for both variants (the v1 dark artwork
        // ships as assets/dark-art.webp) and has no slot for the v1
        // brightness/contrast lift.
        const img = ctx.layers.background.querySelector('img')
        if (img !== null) {
          const art = dark ? 'assets/dark-art.webp' : 'assets/light-art.webp'
          const src = `${ctx.assetBase}/${art}`
          if (img.getAttribute('src') !== src) img.setAttribute('src', src)
          ctx.layers.background.style.filter = dark ? FILTER_DARK : FILTER_LIGHT
        }
        favicon.href = dark ? DARK_ICON : LIGHT_ICON
      }
      setSurface()

      // Swap art, lift and seal live when the base theme system flips
      // dark/light (the same body attribute v1 observed).
      const observer = new MutationObserver(setSurface)
      observer.observe(body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })

      ctx.onCleanup(() => {
        observer.disconnect()
        // The layer element survives the activation; drop the lift. The
        // painted media itself is activation scope — the controller
        // retracts it.
        ctx.layers.background.style.removeProperty('filter')
        favicon.remove()
      })
    },
  }
}
