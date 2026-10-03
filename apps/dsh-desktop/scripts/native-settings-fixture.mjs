export async function openNativeSettings(page) {
  const direct = page.getByRole('button', { name: /^(?:设置|Settings)$/iu }).filter({ visible: true }).first()
  const account = page.getByRole('button', { name: /^(?:账号菜单|Account menu)$/iu }).filter({ visible: true }).first()
  await direct.or(account).first().waitFor({ state: 'visible' })
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
