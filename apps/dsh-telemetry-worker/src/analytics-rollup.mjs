const DATASET = 'dsh_desktop_events'
export function rollupQuery(day) {
  if (!/^\d{4}-\d\d-\d\d$/u.test(day)) throw new TypeError('invalid rollup day')
  return `SELECT blob2 AS event, blob3 AS app_version, blob4 AS channel, blob5 AS os_family, blob6 AS language,
    blob7 AS outcome, blob8 AS detail, blob9 AS bucket, blob10 AS model, blob11 AS error_type, blob12 AS country_code,
    blob13 AS source, blob14 AS position, blob15 AS strategy,
    SUM(_sample_interval * double1) AS count, MAX(_sample_interval) AS sample_interval
    FROM ${DATASET} WHERE blob1 = '${day}' AND timestamp >= toDateTime('${day} 00:00:00')
    GROUP BY event,app_version,channel,os_family,language,outcome,detail,bucket,model,error_type,country_code,source,position,strategy
    LIMIT 4001 FORMAT JSON`
}
export async function rollupAnalytics(env, { now = new Date(), fetchImpl = fetch, diagnostic = () => {} } = {}) {
  if (!/^[a-f0-9]{32}$/u.test(env.ANALYTICS_ACCOUNT_ID ?? '') || !env.ANALYTICS_READ_TOKEN) throw new Error('analytics rollup credentials unavailable')
  // Recompute whole UTC days. Absolute snapshots are idempotent on retries;
  // yesterday and the preceding day cover delayed AE ingestion across midnight.
  for (let offset = 0; offset < 3; offset++) {
    const day = new Date(now.getTime() - offset * 86_400_000).toISOString().slice(0, 10)
    const result = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${env.ANALYTICS_ACCOUNT_ID}/analytics_engine/sql`, {
      method: 'POST', headers: { authorization: `Bearer ${env.ANALYTICS_READ_TOKEN}`, 'content-type': 'text/plain' },
      body: rollupQuery(day), signal: AbortSignal.timeout(10_000),
    })
    if (!result.ok) throw new Error('analytics query unavailable')
    const body = await result.json(), rows = body.data
    if (!Array.isArray(rows) || rows.length > 4000 || body.rows_before_limit_at_least > 4000) throw new Error('analytics rollup incomplete')
    for (const row of rows) if (!Number.isFinite(Number(row.count)) || Number(row.count) < 0 || !Number.isFinite(Number(row.sample_interval)) || Number(row.sample_interval) < 1) throw new Error('invalid analytics rollup')
    const json = JSON.stringify(rows)
    if (new TextEncoder().encode(json).byteLength > 1_500_000) throw new Error('analytics rollup too large')
    // Empty queries must not erase previously observed data during an AE outage.
    if (!rows.length) continue
    const written = await env.METRICS.prepare(`INSERT INTO analytics_daily (day, snapshot_at, data) VALUES (?, ?, ?)
      ON CONFLICT(day) DO UPDATE SET snapshot_at=excluded.snapshot_at, data=excluded.data
      WHERE excluded.snapshot_at > analytics_daily.snapshot_at`).bind(day, now.toISOString(), json).run()
    diagnostic(written)
  }
}
