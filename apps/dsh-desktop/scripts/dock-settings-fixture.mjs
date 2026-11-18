const localizedContexts = new WeakSet()

/** Use the visible Desktop entry and More tools group, without forced input. */
export async function openDockTools(app, mainPage) {
  // Tool navigation hides the Dock after focusing the existing main window.
  // Clicking its canonical entry also restores that retained Dock on reentry.
  await mainPage.getByRole('button', { name: /打开拓展坞|Open Extension Dock/u }).click()
  let dock = app.windows().find(page => page.url().includes('/extensions.html'))
  if (!dock) {
    for (let attempt = 0; attempt < 120 && !dock; attempt++) {
      dock = app.windows().find(page => page.url().includes('/extensions.html'))
      if (!dock) await new Promise(resolve => setTimeout(resolve, 250))
    }
  }
  if (!dock) throw new Error('Extension Dock did not open')
  await dock.locator('[role="tab"].active').first().waitFor({ state: 'visible', timeout: 60_000 })
  await dock.locator('.settings-sidebar > nav:not([data-tab-group]) [data-group="more-tools"]').click()
  await dock.locator('#task-board-tool').waitFor({ state: 'visible' })
  await dock.locator('#ssh-tool').waitFor({ state: 'visible' })
  return dock
}

/** Reach retained destinations through their visible group using normal input. */
export async function visitDockDestination(dock, id) {
  const tab = dock.locator(`#${id}`)
  const primaryId = await tab.evaluate(element => [...element.ownerDocument.querySelectorAll('.settings-sidebar > nav:not([data-tab-group]) [data-group]')]
    .find(candidate => candidate.dataset.group === element.dataset.group)?.id)
  if (!primaryId) throw new Error(`Dock destination ${id} has no primary group`)
  if (primaryId !== id) await dock.locator(`#${primaryId}`).click()
  await tab.scrollIntoViewIfNeeded()
  await tab.click()
  await dock.locator(`#${id}.active`).waitFor({ timeout: 60_000 })
}

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

/** Open a retained embedded form for lifecycle and persistence probes. */
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
  // The HTML can be visible before extensions.mjs binds tab clicks and
  // activates the initial panel. Wait for that binding to complete.
  await dock.locator('[role="tab"].active').first().waitFor({ timeout: 60_000 })
  const groupRoot = id === 'skill-market' ? 'skills' : ['agent-team', 'shared-browser'].includes(id) ? 'control-center'
    : ['value-mode', 'personal-prompt', 'memory', 'describe-image', 'usage', 'sessions'].includes(id) ? 'models'
      : id === 'particle-theme' ? 'appearance' : id === 'plugin-options' ? 'plugins-hub' : undefined
  if (groupRoot) await dock.locator(`#${groupRoot}-tab`).click()
  const tabId = `${id === 'memory' ? 'personal-prompt' : id === 'models' ? 'models-page' : id}-tab`
  const tab = dock.locator(`#${tabId}`)
  if (await tab.getAttribute('data-native-page')) {
    await dock.evaluate(id => window.dshDesktop.selectDockSetting(id), id)
  } else {
    await tab.click()
    await dock.locator(`#${tabId}.active`).waitFor({ timeout: 5_000 })
  }
  let settings
  for (let attempt = 0; attempt < 120; attempt++) {
    settings = app.windows().find(page => page.url().includes('desktop-dock-setting='))
    if (settings) break
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  if (!settings) {
    const state = await dock.evaluate(() => ({
      active: [...document.querySelectorAll('[role="tab"].active')].map(item => item.id),
      message: document.querySelector('#dock-settings-state')?.textContent,
      messageHidden: document.querySelector('#dock-settings-state')?.hidden,
      retryHidden: document.querySelector('#dock-settings-retry')?.hidden,
    })).catch(() => ({ unavailable: true }))
    throw new Error(`Dock settings view did not open: ${JSON.stringify({ id, state, windows: app.windows().map(page => page.url()) })}`)
  }
  if (id === 'memory') await settings.locator('#memory-tab').click()
  if (id === 'personal-prompt') await settings.locator('#personal-prompt-tab').click()
  try {
    await settings.locator(`[data-dsh-dock-settings="${id}"]`).waitFor({ timeout: 60_000 })
  } catch (error) {
    const state = await settings.evaluate(() => ({
      url: location.href,
      body: document.body?.innerText?.slice(0, 1200),
      selected: document.querySelector('[data-dsh-dock-settings]')?.getAttribute('data-dsh-dock-settings'),
    })).catch(() => ({ url: settings.url(), body: '(renderer unavailable)' }))
    const shell = await dock.evaluate(() => ({
      activeTab: document.querySelector('[role="tab"].active')?.id,
      message: document.querySelector('#dock-settings-state')?.textContent,
      messageHidden: document.querySelector('#dock-settings-state')?.hidden,
      retryHidden: document.querySelector('#dock-settings-retry')?.hidden,
    })).catch(() => ({ unavailable: true }))
    throw new Error(`Dock settings ${id} did not render: ${JSON.stringify({ state, shell })}`, { cause: error })
  }
  // WebContentsViews can be background-throttled when the host window loses
  // focus on CI. Use timer polling instead of requestAnimationFrame polling.
  await settings.waitForFunction(() => document.documentElement.lang.startsWith('zh'), undefined, { polling: 100, timeout: 60_000 })
  return { dock, settings }
}
