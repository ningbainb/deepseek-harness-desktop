/**
 * Whale Song (whale-song) skin hooks — the trusted escape hatch of the v2 skin
 * contract (x-org.linxin666.skin-center/v1alpha1), reviewed and released
 * with this repository. Loading this module executes nothing; apply() owns
 * every DOM write and registers its retraction through ctx.onCleanup.
 *
 * Port of the v1 plugin effects (packages/skins/whale-song/src/client/index.ts):
 *  - favicon injection: v1 appended a <link rel="icon"> and removed it on
 *    dispose; the same semantics here, with the icon served from assets/.
 *    The v1 icon was PNG; keep type="image/png" to match the asset.
 * The v1 backdrop (art + theme scrim) is declarative in v2: it rides
 * contributes.backgroundMedia in skin.json, owned by the skin-center.
 */
export default function defineSkinHooks() {
  return {
    apply(ctx) {
      const favicon = document.createElement('link')
      favicon.rel = 'icon'
      favicon.type = 'image/png'
      favicon.href = ctx.assetBase + '/assets/whale-icon.png'
      document.head.append(favicon)
      ctx.onCleanup(() => favicon.remove())
    },
  }
}
