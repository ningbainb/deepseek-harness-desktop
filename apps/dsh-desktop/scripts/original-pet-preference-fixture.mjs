const KEY = 'dsh-release-plugin-adapter.dafeiyu-visible'

/** Establish the legacy-pet scenario only in the caller's isolated test profile. */
export async function useOriginalPetForTest(page) {
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-desktop-dafeiyu-visible'))
  const origin = new URL(page.url()).origin
  const previous = await page.evaluate(key => localStorage.getItem(key), KEY)
  const select = (target, value) => target.evaluate(({ key, value }) => {
    const oldValue = localStorage.getItem(key)
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
    window.dispatchEvent(new StorageEvent('storage', { key, oldValue, newValue: value, storageArea: localStorage }))
  }, { key: KEY, value })
  await select(page, 'false')
  await page.locator('.dfy-root').waitFor({ state: 'detached' })
  return async (replacement) => {
    const target = replacement ?? (!page.isClosed() ? page : page.context().pages().find(candidate => {
      try { return !candidate.isClosed() && new URL(candidate.url()).origin === origin } catch { return false }
    }))
    if (target) await select(target, previous)
  }
}
