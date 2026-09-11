// Read-only by default; --probe creates and removes an isolated scratch table.
// Credentials remain in the installed Cloudflare CLI profile.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const account = '2bb454806328793bb1891295126e8880'
const database = 'ae704c84-608e-4b60-a16c-703ebf2c1961'
const credentials = JSON.parse(await readFile(join(process.env.APPDATA, 'xdg.config', 'cloudflare', 'config', 'default.json'), 'utf8'))
async function api(path, init = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`, {
    ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${credentials.oauth_token}` }, signal: AbortSignal.timeout(30_000),
  })
  const body = await response.json()
  if (!response.ok || body.success !== true) throw new Error(`Cloudflare HTTP ${response.status}; codes ${(body.errors ?? []).map(e => e.code).join(',')}`)
  return body.result
}
const settings = await api('/workers/scripts/dsh-desktop-telemetry/settings')
console.log(JSON.stringify({ bindings: settings.bindings.map(b => ({ name: b.name, type: b.type })), compatibilityDate: settings.compatibility_date }))
const queries = {
  schema: "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%'",
  sources: "SELECT day,event,outcome,detail,SUM(count) AS events FROM metric_daily WHERE day >= date('now','-2 days') GROUP BY day,event,outcome,detail ORDER BY day DESC,events DESC LIMIT 100",
  release: "SELECT day,event,SUM(count) AS events,COUNT(*) AS observation_rows FROM product_release_daily WHERE day >= date('now','-2 days') GROUP BY day,event ORDER BY day DESC,events DESC LIMIT 80",
  actors: "SELECT day,event,COUNT(*) AS actor_rows FROM product_actor_daily WHERE day >= date('now','-2 days') GROUP BY day,event ORDER BY day DESC,actor_rows DESC LIMIT 80",
  totals: "SELECT day,SUM(count) AS events,SUM(CASE WHEN outcome IN ('failed','failure','error') THEN count ELSE 0 END) AS failures FROM metric_daily WHERE day >= date('now','-2 days') GROUP BY day",
}
if (process.argv.includes('--probe')) {
  const table = '__analytics_write_probe_' + crypto.randomUUID().replaceAll('-', '')
  const query = sql => api(`/d1/database/${database}/query`, { method: 'POST', body: JSON.stringify({ sql }) })
  try {
    await query(`CREATE TABLE ${table} (day TEXT, actor TEXT, event TEXT, country TEXT, count INTEGER, PRIMARY KEY(day,actor,event)) WITHOUT ROWID`)
    for (const indexes of [0, 1, 2]) {
      if (indexes) await query(`CREATE INDEX ${table}_i${indexes} ON ${table} (${indexes === 1 ? 'event,day' : 'country,day'})`)
      const result = await query(`INSERT INTO ${table} VALUES ('2026-09-10','probe-${indexes}','audit','ZZ',1)`)
      console.log(JSON.stringify({ name: 'write-amplification-probe', indexes, rowsWritten: result[0].meta.rows_written }))
    }
    const result = await query(`UPDATE ${table} SET count=count+1 WHERE actor='probe-2'`)
    console.log(JSON.stringify({ name: 'counter-update-probe', indexes: 2, rowsWritten: result[0].meta.rows_written }))
  } finally { await query(`DROP TABLE IF EXISTS ${table}`) }
}
for (const [name, sql] of Object.entries(queries)) {
  const result = await api(`/d1/database/${database}/query`, { method: 'POST', body: JSON.stringify({ sql }) })
  console.log(JSON.stringify({ name, result }))
}
