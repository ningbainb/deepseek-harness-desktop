const continueButton = { name: /^(?:继续|Continue)$/u }

export function onboardingControlsReady() {
  const controls = [...document.querySelectorAll('button')].filter(button => /^(?:继续|Continue)$/u.test(button.textContent?.trim() ?? ''))
  return controls.every(button => button.getClientRects().length === 0 || !button.disabled)
}

export async function dismissRuntimeOnboarding(page) {
  const button = page.getByRole('button', continueButton)
  await page.waitForFunction(onboardingControlsReady, undefined, { timeout: 30_000 })
  if (await button.isVisible()) {
    try {
      await button.click()
    } catch (error) {
      if (await button.isVisible()) throw error
    }
  }
  await button.waitFor({ state: 'hidden', timeout: 10_000 })
}

async function pollStartupPrompts(page, dismissDialog) {
  const starPrompt = page.locator('#dsh-desktop-star-prompt')
  for (let attempt = 0; attempt < 16; attempt += 1) {
    await page.waitForTimeout(250)
    if (await starPrompt.getAttribute('data-open').catch(() => null) === 'true') {
      await starPrompt.getByRole('button', { name: '先继续使用', exact: true }).click({ force: true })
      continue
    }
    if (await dismissDialog()) continue
    if (attempt >= 7) break
  }
}

export function dismissStartupContinuationDialogs(page) {
  return pollStartupPrompts(page, async () => {
    const dialog = page.getByRole('dialog').filter({ has: page.getByRole('button', continueButton) })
    if (!await dialog.isVisible().catch(() => false)) return false
    await dialog.getByRole('button', continueButton).last().click({ force: true })
    return true
  })
}

export function dismissKnownStartupNotices(page) {
  return pollStartupPrompts(page, async () => {
    const dialogs = page.getByRole('dialog')
    const count = await dialogs.count().catch(() => 0)
    for (let position = count - 1; position >= 0; position -= 1) {
      const dialog = dialogs.nth(position)
      if (!await dialog.isVisible().catch(() => false)) continue
      const text = await dialog.textContent().catch(() => '')
      if (!/内测声明|插件、技能和桌面核心功能在这里/u.test(text ?? '')) continue
      const button = dialog.getByRole('button', continueButton).last()
      if (await button.count().catch(() => 0)) {
        await button.click({ force: true })
        return true
      }
    }
    return false
  })
}
