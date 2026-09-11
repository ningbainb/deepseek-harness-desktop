import { classifyUpdateError, validUpdateDiagnostic } from './update-diagnostics.mjs'

// Reads existing logs locally. Reports fixed categories, never raw log contents.
export function analyzeUpdateLog(text) {
  const failures = [], attempts = new Set(), completed = new Set()
  let stage = 'unknown', version = 'unknown', target = 'unknown', attempt = 'legacy-unknown', sequence = 0, hasStructured = false, pendingStructuredCheck = false
  let migrationBlocks = 0
  for (const [index, line] of String(text).split(/\r?\n/u).entries()) {
    if (line.includes('[migration] pre-bootstrap migration repair required')) migrationBlocks++
    const marker = line.indexOf('[update-diagnostic] ')
    if (marker >= 0) {
      try {
        const { phase, ...diagnostic } = JSON.parse(line.slice(marker + 20))
        if (!validUpdateDiagnostic(diagnostic)) continue
        hasStructured = true
        pendingStructuredCheck = phase === 'checking'
        attempts.add(diagnostic.attempt_id)
        if (phase === 'completed') completed.add(diagnostic.attempt_id)
        if (phase === 'error') failures.push({ ...diagnostic, line: index + 1, evidence: 'structured' })
      } catch { /* Incomplete or unrelated lines are not diagnostic evidence. */ }
      continue
    }
    const checking = line.match(/\[updater\] checking from (\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/u)
    if (checking) {
      version = checking[1]; target = 'unknown'; stage = 'check'; attempt = `legacy-${++sequence}`; hasStructured = pendingStructuredCheck; pendingStructuredCheck = false
      continue
    }
    const available = line.match(/\[updater\] version (\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?) is available/u)
    if (available) { target = available[1]; stage = 'download'; continue }
    if (/\[updater\] version .+ downloaded/u.test(line) || /\[updater\] .+ is up to date/u.test(line)) { stage = 'unknown'; continue }
    if (!line.includes('[updater]') || hasStructured || /retrying another source|switching to fallback/u.test(line)) continue
    const error = classifyUpdateError(line.slice(line.indexOf('[updater]') + 9).trim())
    if (error.error_type === 'unknown' || error.error_type === 'none') continue
    const inferredStage = error.error_type === 'prepare_timeout' ? 'prepare' : error.error_type === 'launch_timeout' ? 'install'
      : stage === 'download' && ['checksum', 'signature'].includes(error.error_type) ? 'verify' : stage
    failures.push({ attempt_id: attempt, stage: inferredStage, ...error, source_version: version, target_version: target, line: index + 1, evidence: 'inferred-from-legacy-log' })
  }
  const unique = [...new Map(failures.map(row => [`${row.attempt_id}:${row.stage}:${row.error_code}`, row])).values()]
  const groups = new Map()
  for (const row of unique) { const key = `${row.stage}:${row.error_type}:${row.source_version}:${row.target_version}`; const group = groups.get(key); if (group) group.count++; else groups.set(key, { stage: row.stage, errorType: row.error_type, sourceVersion: row.source_version, targetVersion: row.target_version, count: 1 }) }
  return { schema: 1, failedAttempts: new Set(unique.map(row => row.attempt_id)).size, observedStructuredAttempts: attempts.size, completedDesktopStarts: completed.size,
    migrationBlocks, groups: [...groups.values()], failures: unique,
    limitation: 'One supplied log only. Legacy stages are inferred and unknown errors may be unclassified. Missing completion is unknown. A Desktop start does not prove Runtime readiness. Counts are not unique people or installation failure rate.' }
}
