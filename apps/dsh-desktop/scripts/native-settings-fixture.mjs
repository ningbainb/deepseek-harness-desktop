export function nativeSettingsContent(dialog) {
  const navigation = dialog.querySelector(':scope > nav')
  const content = dialog.lastElementChild
  if (!navigation || content?.tagName !== 'DIV') throw new Error('settings content is unavailable')
  const children = [...dialog.children]
  const currentSettings = dialog.getAttribute('data-shortcut-modal') === 'settings'
  if (children.length === 2 && children[0] === navigation) return content
  if (currentSettings && children.length === 4 && children[1] === navigation
    && children[2].tagName === 'DIV') return content
  throw new Error('settings content is unavailable')
}

// Playwright serializes callbacks without module closures. Include this pure
// DOM selector explicitly so every measurement and scroll action uses the same
// actual content column in both current four-child and legacy two-child shells.
export function evaluateNativeSettings(locator, callback, { handle = false } = {}) {
  const evaluate = new Function('element', `return (${callback.toString()})(element, (${nativeSettingsContent.toString()}))`)
  return handle ? locator.evaluateHandle(evaluate) : locator.evaluate(evaluate)
}

export async function openNativeSettings(page) {
  const direct = page.getByRole('button', { name: /^(?:设置|Settings)$/iu }).filter({ visible: true }).first()
  const account = page.getByRole('button', { name: /^(?:账号菜单|Account menu)$/iu }).filter({ visible: true }).first()
  const sidebar = page.getByRole('button', { name: /^(?:打开侧边栏|Open sidebar)$/iu }).filter({ visible: true }).first()
  const entry = direct.or(account).first()
  await entry.or(sidebar).first().waitFor({ state: 'visible' })
  if (!await direct.isVisible() && !await account.isVisible()) {
    await sidebar.click()
    await entry.waitFor({ state: 'visible' })
  }
  if (await direct.isVisible()) {
    await direct.click()
  } else {
    await account.click()
    await page.getByRole('menuitem', { name: /^(?:设置|Settings)$/iu }).click()
  }
  const dialog = page.locator('[role="dialog"].dsh-desktop-settings-window:visible').last()
  await dialog.waitFor({ state: 'visible' })
  return dialog
}
