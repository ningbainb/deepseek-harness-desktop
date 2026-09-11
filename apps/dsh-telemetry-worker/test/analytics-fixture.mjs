import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { rollupAnalytics } from '../src/analytics-rollup.mjs'

export function aggregatePoints(points, day) {
  const keys = ['event','app_version','channel','os_family','language','outcome','detail','bucket','model','error_type','country_code','source','position','strategy']
  const groups = new Map()
  for (const point of points.filter(p => p.blobs[0] === day)) {
    const dimensions = point.blobs.slice(1,15), key = JSON.stringify(dimensions)
    const previous = groups.get(key)
    if (previous) previous.count += point.doubles[0]
    else groups.set(key, { ...Object.fromEntries(keys.map((key,i) => [key,dimensions[i]])), count: point.doubles[0], sample_interval: 1 })
  }
  return [...groups.values()]
}
export function database() {
  const db = new DatabaseSync(':memory:'), mutations = [], points = []
  const dir = new URL('../migrations/', import.meta.url)
  for (const file of readdirSync(dir).filter(file => file.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(file, dir), 'utf8'))
  const wrapper = {
    analytics: { writeDataPoint: point => points.push(point) },
    prepare(sql) {
      let args = []
      const statement = {
        bind(...values) { args = values; return statement },
        async all() { return { results: db.prepare(sql).all(...args) } },
        async run() { const result = db.prepare(sql).run(...args); mutations.push({sql,changes:result.changes}); return {success:true,meta:{rows_written:Number(result.changes)}} },
      }
      return statement
    },
    async batch(statements) { db.exec('BEGIN'); try { const result=[]; for(const s of statements) result.push(await s.run()); db.exec('COMMIT'); return result } catch(e) { db.exec('ROLLBACK'); throw e } },
    async flush(day = '2026-09-09', time = '12:00:00.000Z') {
      await rollupAnalytics({ METRICS: wrapper, ANALYTICS_ACCOUNT_ID:'a'.repeat(32), ANALYTICS_READ_TOKEN:'test-only' }, {
        now:new Date(`${day}T${time}`), fetchImpl: async (_url, init) => new Response(JSON.stringify({data:aggregatePoints(points,init.body.match(/blob1 = '([^']+)'/u)[1])})),
      })
    },
  }
  return { db, wrapper, points, mutations }
}
