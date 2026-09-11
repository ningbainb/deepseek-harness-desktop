const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[0-9A-Za-z.-]{1,20})?$/u
export function releaseFilters(params) {
  if ([...params.keys()].some(key => !['days', 'version'].includes(key))
    || params.getAll('days').length > 1 || params.getAll('version').length > 1) return undefined
  const days = params.get('days') ?? '30'
  const version = params.get('version') ?? ''
  if (!['7', '30', '90'].includes(days) || (version && !VERSION.test(version))) return undefined
  return { days: Number(days), version }
}

export async function releaseSummary(db, filters, now = new Date()) {
  const end = now.toISOString().slice(0, 10)
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - filters.days + 1)).toISOString().slice(0, 10)
  const where = 'day BETWEEN ? AND ? AND (? = \'\' OR app_version = ?)'
  const bindings = [start, end, filters.version, filters.version]
  const [coverage, versions, events, active] = await Promise.all([
    db.prepare("SELECT started_day AS day FROM product_measurement_coverage WHERE metric = 'release-observations'").all(),
    db.prepare("SELECT app_version AS version, COUNT(DISTINCT installation_actor) AS instances FROM product_release_daily WHERE day BETWEEN ? AND ? AND event = 'app_launch' GROUP BY app_version ORDER BY instances DESC, version DESC LIMIT 50").bind(start, end).all(),
    db.prepare(`WITH observations AS (SELECT event,outcome,detail,COUNT(DISTINCT installation_actor) AS instances FROM product_release_daily WHERE ${where} GROUP BY event,outcome,detail), counts AS (SELECT event,outcome,detail,count,0 AS aggregate_only FROM product_release_daily WHERE ${where} UNION ALL SELECT event,outcome,detail,count,1 AS aggregate_only FROM analytics_rollup_events WHERE ${where} AND event != 'download_click') SELECT c.event,c.outcome,c.detail,SUM(c.count) AS count,CASE WHEN c.event = 'app_launch' OR MAX(c.aggregate_only)=0 THEN o.instances ELSE NULL END AS instances FROM counts c LEFT JOIN observations o ON c.event=o.event AND c.outcome=o.outcome AND c.detail=o.detail GROUP BY c.event,c.outcome,c.detail ORDER BY count DESC,c.event,c.outcome,c.detail LIMIT 500`).bind(...bindings,...bindings,...bindings).all(),
    db.prepare(`SELECT COUNT(DISTINCT installation_actor) AS instances FROM product_release_daily WHERE ${where} AND event = 'app_launch'`).bind(...bindings).all(),
  ])
  const rows = events.results ?? []
  const ready = rows.filter(row => row.event === 'runtime_start_result' && row.outcome === 'ready').reduce((sum, row) => sum + Number(row.count), 0)
  const failed = rows.filter(row => row.event === 'runtime_start_result' && row.outcome === 'failed').reduce((sum, row) => sum + Number(row.count), 0)
  const startedDay = coverage.results?.[0]?.day ?? null
  return {
    schema: 1, generatedAt: now.toISOString(), rangeDays: filters.days, version: filters.version,
    coverage: { startedDay, from: startedDay ? [start, startedDay].sort().at(-1) : null, to: end, partial: !startedDay || startedDay >= start, retentionDays: 90 },
    activeInstances: Number(active.results?.[0]?.instances ?? 0),
    measurement: { counts: 'hourly-weighted-aggregate', missingInstances: 'aggregate-only events do not retain per-installation observations' },
    startup: { ready, failed, denominator: ready + failed, successRate: ready + failed ? ready / (ready + failed) : null },
    versions: versions.results ?? [], events: rows,
  }
}
