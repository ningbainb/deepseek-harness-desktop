const localizedContexts = new WeakSet()

export async function useChineseFixtureLocale(app) {
  const context = app.context()
  if (!localizedContexts.has(context)) {
    // These interaction fixtures assert Chinese copy. Set the browser language
    // before the settings view is created, independent of the runner OS locale.
    await context.addInitScript(() => {
      // Electron can replay init scripts in an already-localized document.
      // Keep the fixture idempotent, and do not redefine an immutable owner.
      for (const [key, value] of [['languages', ['zh-CN', 'zh']], ['language', 'zh-CN']]) {
        if (Object.getOwnPropertyDescriptor(navigator, key)?.configurable === false) continue
        Object.defineProperty(navigator, key, { configurable: true, get: () => value })
      }
    })
    localizedContexts.add(context)
  }
}

/** Open an existing form through the same sidebar navigation used by the user. */
export async function openDockSetting(app, mainPage, id) {
  await useChineseFixtureLocale(app)
  let dock = app.windows().find(page => page.url().includes('/extensions.html'))
  if (!dock) {
    const dockEntry = mainPage.getByRole('button', { name: /打开拓展坞|Open Extension Dock/u }).first()
    const entryReady = await dockEntry.waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true)
      .catch(() => false)
    if (entryReady) {
      await dockEntry.evaluate(button => button.click())
    } else {
      // Late packaged regressions can reload the Runtime after a settings test,
      // leaving plugin-owned sidebar actions temporarily unmounted. The setting
      // fixture is not a sidebar-discovery assertion, so use the same allowlisted
      // preload bridge as the Tools menu while the dedicated discovery E2E keeps
      // validating the visible entry.
      const opened = await mainPage.evaluate(async () => {
        const bridge = window.dshDesktop
        if (typeof bridge?.openExtensionDock !== 'function') return false
        const result = await bridge.openExtensionDock()
        return result?.opened === true
      })
      if (!opened) throw new Error('Extension Dock entry and Desktop bridge are both unavailable')
    }
    for (let attempt = 0; attempt < 120; attempt++) {
      dock = app.windows().find(page => page.url().includes('/extensions.html'))
      if (dock) break
      await new Promise(resolve => setTimeout(resolve, 250))
    }
  }
  if (!dock) throw new Error('Dock window did not open')
  await dock.locator(`#${id === 'memory' ? 'personal-prompt' : id}-tab`).click()
  let settings
  for (let attempt = 0; attempt < 120; attempt++) {
    settings = app.windows().find(page => page.url().includes('desktop-dock-setting='))
    if (settings) break
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  if (!settings) throw new Error('Dock settings view did not open')
  if (id === 'memory') await settings.locator('#memory-tab').click()
  if (id === 'personal-prompt') await settings.locator('#personal-prompt-tab').click()
  await settings.locator(`[data-dsh-dock-settings="${id}"]`).waitFor({ timeout: 60_000 })
  // WebContentsViews can be background-throttled when the host window loses
  // focus on CI. Use timer polling instead of requestAnimationFrame polling.
  await settings.waitForFunction(() => document.documentElement.lang.startsWith('zh'), undefined, { polling: 100, timeout: 60_000 })
  return { dock, settings }
}
