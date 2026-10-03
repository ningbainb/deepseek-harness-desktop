export function onboardingControlsReady() {
  const controls = [...document.querySelectorAll('button')].filter(button => /^(?:继续|Continue)$/u.test(button.textContent?.trim() ?? ''))
  return controls.every(button => button.getClientRects().length === 0 || !button.disabled)
}

export async function dismissRuntimeOnboarding(page) {
  const button = page.getByRole('button', { name: /^(?:继续|Continue)$/u })
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
