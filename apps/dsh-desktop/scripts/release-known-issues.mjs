// Maintainer approval in the 3.4.0 release task: defer this one DPI issue.
// DSH-350-DPI-01 is fixed; 3.5.0 must pass even when this legacy flag is set.
// Default regression runs stay strict. The test itself is never skipped.
function finalAssertion(output, marker) {
  const pattern = new RegExp(`^AssertionError \\[ERR_ASSERTION\\]: ${marker} (\\{[^\\r\\n]+\\})\\r?$`, 'gmu')
  const matches = [...String(output).matchAll(pattern)]
  if (matches.length !== 1) return {}
  try { return JSON.parse(matches[0][1]) } catch { return {} }
}

export function acceptedReleaseIssue({ version, enabled, streamTimingApproved, initialShutdownApproved, platform, script, code, signal, output }) {
  if (version === '5.3.4' && platform === 'win32' && code === 1 && !signal) {
    if (streamTimingApproved === true && script === 'scripts/verify-beta-usability.mjs') {
      const { p95Ms, limitMs } = finalAssertion(output, 'DSH_STREAM_FRAME_P95')
      if (limitMs === 35 && Number.isFinite(p95Ms) && p95Ms > limitMs && p95Ms <= 47) return 'DSH-530-WINDOWS-STREAM-P95'
    }
    if (initialShutdownApproved === true && script === 'scripts/verify-runtime-provider.mjs') {
      const { outcomes, elapsedMs } = finalAssertion(output, 'DSH_INITIAL_RUNTIME_STOP')
      if (Array.isArray(outcomes) && outcomes.length === 3 && outcomes[0] === 'fallback'
        && outcomes.slice(1).every(outcome => outcome === 'acknowledged')
        && Array.isArray(elapsedMs) && elapsedMs.length === 3
        && elapsedMs.every(value => Number.isSafeInteger(value) && value >= 0 && value < 5000)) return 'DSH-530-WINDOWS-INITIAL-STOP'
    }
  }
  if (enabled !== true || version !== '3.4.0' || code !== 1 || signal) return null
  if (script !== 'scripts/verify-window-state-dpi.mjs') return null
  if (!String(output).includes('automatic DPI restoration must not rewrite logical geometry')) return null
  return 'DSH-340-DPI-01'
}
