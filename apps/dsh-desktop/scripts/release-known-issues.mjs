// Maintainer approval in the 3.4.0 release task: defer this one DPI issue.
// Default regression runs stay strict. The test itself is never skipped.
export function acceptedReleaseIssue({ version, enabled, script, code, signal, output }) {
  if (enabled !== true || version !== '3.4.0' || code !== 1 || signal) return null
  if (script !== 'scripts/verify-window-state-dpi.mjs') return null
  if (!String(output).includes('automatic DPI restoration must not rewrite logical geometry')) return null
  return 'DSH-340-DPI-01'
}
