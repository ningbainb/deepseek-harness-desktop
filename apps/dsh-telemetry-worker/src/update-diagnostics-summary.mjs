export async function updateDiagnosticsSummary(db, { days = 7, version = '' } = {}, now = new Date()) {
  // Failure records expire after 30 days; never present older ranges as complete.
  const rangeDays = Math.min(days, 30)
  const end = now.toISOString().slice(0, 10)
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - rangeDays + 1)).toISOString().slice(0, 10)
  const where = "event = 'update_error' AND received_day BETWEEN ? AND ? AND (? = '' OR version = ?)"
  const bindings = [start, end, version, version]
  const [groups, recent, headline] = await Promise.all([
    db.prepare(`SELECT COALESCE(json_extract(diagnostic,'$.stage'),'unknown') AS stage, error_type AS errorType,
      COALESCE(json_extract(diagnostic,'$.error_code'),'unknown') AS errorCode, version AS sourceVersion,
      COALESCE(json_extract(diagnostic,'$.target_version'),'unknown') AS targetVersion,
      COALESCE(json_extract(diagnostic,'$.trigger'),'unknown') AS trigger, COUNT(*) AS count,
      COUNT(DISTINCT json_extract(diagnostic,'$.installation_actor')) AS observedInstances
      FROM analytics_failure WHERE ${where} GROUP BY stage,errorType,errorCode,sourceVersion,targetVersion,trigger
      ORDER BY count DESC LIMIT 100`).bind(...bindings).all(),
    db.prepare(`SELECT timestamp, version AS sourceVersion, error_type AS errorType,
      json_extract(diagnostic,'$.attempt_id') AS attemptId, json_extract(diagnostic,'$.stage') AS stage,
      json_extract(diagnostic,'$.error_code') AS errorCode, json_extract(diagnostic,'$.target_version') AS targetVersion,
      json_extract(diagnostic,'$.source') AS source, json_extract(diagnostic,'$.source_attempt') AS sourceAttempt,
      json_extract(diagnostic,'$.os') AS os FROM analytics_failure WHERE ${where} ORDER BY timestamp DESC LIMIT 50`).bind(...bindings).all(),
    db.prepare(`SELECT COUNT(*) AS failures, SUM(json_extract(diagnostic,'$.attempt_id') IS NOT NULL) AS classifiedFailures,
      COUNT(DISTINCT json_extract(diagnostic,'$.installation_actor')) AS observedInstances,
      COUNT(DISTINCT json_extract(diagnostic,'$.attempt_id')) AS failedAttempts
      FROM analytics_failure WHERE ${where}`).bind(...bindings).all(),
  ])
  return { schema: 1, rangeDays, from: start, to: end, sourceVersion: version, generatedAt: now.toISOString(),
    ...headline.results?.[0], groups: groups.results ?? [], recent: recent.results ?? [],
    definition: 'Stored failure observations; instances cover clients with diagnostics only. Not installation failure rate. Completion means target Desktop started, not Runtime readiness. Missing post-exit receipts are unknown, not failures.',
  }
}
