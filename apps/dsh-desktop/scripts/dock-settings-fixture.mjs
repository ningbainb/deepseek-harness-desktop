const localizedContexts = new WeakSet()

/** Open an existing form through the same sidebar navigation used by the user. */
export async function openDockSetting(app, mainPage, id) {
  const context = app.context()
  if (!localizedContexts.has(context)) {
    // These interaction fixtures assert Chinese copy. Set the browser language
    // before the settings view is created, independent of the runner OS locale.
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh'] })
      Object.defineProperty(navigator, 'language', { get: () => 'zh-CN' })
    })
    localizedContexts.add(context)
  }
  let dock = app.windows().find(page => page.url().includes('/extensions.html'))
  if (!dock) {
    await mainPage.getByRole('button', { name: /打开拓展坞|Open Extension Dock/u }).first().evaluate(button => button.click())
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
  await settings.waitForFunction(() => document.documentElement.lang.startsWith('zh'))
  return { dock, settings }
}
