/** Tool availability never waives a required native Windows assertion. */
export function windowsInstallerTestOptions(platform = process.platform) {
  return { skip: platform === 'win32' ? false : 'Windows-only: requires Win32 processes/registry, Windows PowerShell or NSIS' }
}
