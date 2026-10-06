export async function expandSidebarTools(page) {
  const toggle = page.locator('[data-dsh-tools-toggle]')
  if (await toggle.count() && await toggle.getAttribute('aria-expanded') === 'false') {
    await toggle.click()
  }
}
