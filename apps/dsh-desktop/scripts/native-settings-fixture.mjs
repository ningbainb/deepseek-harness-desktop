export async function openNativeSettings(page) {
  const direct = page.getByRole('button', { name: /^(?:设置|Settings)$/iu }).first()
  if (await direct.count()) {
    await direct.click()
  } else {
    await page.getByRole('button', { name: /^(?:账号菜单|Account menu)$/iu }).click()
    await page.getByRole('menuitem', { name: /^(?:设置|Settings)$/iu }).click()
  }
  const dialog = page.locator('[role="dialog"].dsh-desktop-settings-window:visible').last()
  await dialog.waitFor({ state: 'visible' })
  return dialog
}
