// The remote Web plugin treats the desktop-owned dsh-runtime://app origin as
// non-loopback and rewrites local calls through its paired-device channel.
// Only the private Electron pipe may map those calls back to their original
// routes. Network-facing routes and pairing policy remain unchanged.
const REMOTE_MIRRORS = ['/api', '/sidebar', '/git', '/pet']

export function desktopLocalPath(pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/remote/')) return pathname
  const original = pathname.slice('/remote'.length)
  if (REMOTE_MIRRORS.some(prefix => original === prefix || original.startsWith(`${prefix}/`))) {
    return original
  }
  return pathname
}
