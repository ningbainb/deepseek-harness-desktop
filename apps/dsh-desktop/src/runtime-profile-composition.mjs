export function installDesktopProfileComposition(ctx, { rootUrl, compose, prepare }) {
  return ctx.on('loader/patch-context', (entry, next) => {
    const { name, config } = entry.options
    if (name !== 'cordis:include' || config?.path !== rootUrl) return next()
    const patches = compose()
    if (!Array.isArray(patches)) throw new TypeError('Desktop profile composition must return a synchronous patch array')
    const prepared = prepare(patches)
    if (!Array.isArray(prepared)) throw new TypeError('Desktop profile preparation must return a synchronous patch array')
    entry.options.config = { ...config, patches: prepared }
    return next()
  })
}
