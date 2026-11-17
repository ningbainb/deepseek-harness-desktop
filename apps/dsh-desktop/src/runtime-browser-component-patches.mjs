const vendor = 'dsh-builtin-browser/browser-electron'
const adapter = new URL('./runtime-browser-component.mjs', import.meta.url).href

/** Keep the vendor root/client and settings; replace only its self-host provider. */
export function adaptDesktopBrowserComponentPatches(patches) {
  const project = row => row?.name === vendor ? { ...row, name: adapter } : row
  return patches.map(row => Array.isArray(row?.insert)
    ? { ...row, insert: row.insert.map(project) }
    : project(row))
}
