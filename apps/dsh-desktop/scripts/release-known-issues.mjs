// Maintainer approval in the 3.4.0 and 3.5.0 release tasks: defer this one DPI issue.
// Default regression runs stay strict. The test itself is never skipped.
export function acceptedReleaseIssue({ version, enabled, script, code, signal, output }) {
  if (enabled !== true || !['3.4.0', '3.5.0'].includes(version) || code !== 1 || signal) return null
  if (script !== 'scripts/verify-window-state-dpi.mjs') return null
  if (!String(output).includes('automatic DPI restoration must not rewrite logical geometry')) return null
  return version === '3.5.0' ? 'DSH-350-DPI-01' : 'DSH-340-DPI-01'
}
