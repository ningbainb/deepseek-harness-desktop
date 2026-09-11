import * as sql from './analytics-sql.mjs'
import { costDimensions, isFailure, legacyCostEvent } from '../../dsh-desktop/src/cost-mode-events.mjs'
import { rollupAnalytics } from './analytics-rollup.mjs'

const HIGH_FREQUENCY = new Set(['surface_opened', 'dock_entry_impression', 'dock_nudge_shown', 'dock_nudge_dismissed', 'dock_entry_click', 'dock_opened', 'feature_dock_setting'])
export const CLEANUP_WRITE_BUDGET = 350
export function isAggregateOnly(event) { return event.name.startsWith('cost_mode_') || event.name.startsWith('value_mode_') || HIGH_FREQUENCY.has(event.name) }
const FAILURE_SQL = `INSERT OR IGNORE INTO analytics_failure (id, timestamp, received_day, event, error_type, model, role, strategy, version, diagnostic)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
export function dataPoint(event, day, country) {
  const dimensions = event.params ? costDimensions(event) : event
  const p = event.params ?? {}
  return {
    indexes: [event.dailyActor ?? country],
    blobs: [day, event.name, event.appVersion, event.channel, event.os, event.language,
      dimensions.outcome, dimensions.detail, dimensions.bucket, p.model ?? '', p.error_type ?? '', country,
      p.source ?? '', p.position ?? '', p.strategy ?? '', event.installationActor ?? '', event.update ? JSON.stringify(event.update) : ''],
    doubles: [1],
  }
}

// Only this service owns telemetry D1 mutations. There is deliberately no D1
// fallback for aggregate-only events if the Analytics Engine binding fails.
export class AnalyticsService {
  constructor(env, seams = {}) { this.env = env; this.seams = seams; this.warned = new Set() }
  now() { return typeof this.seams.now === 'function' ? this.seams.now() : new Date() }
  diagnostic(source, result) {
    try {
      const results = Array.isArray(result) ? result : [result]
      const rowsWritten = results.reduce((n, r) => n + Number(r?.meta?.rows_written ?? 0), 0)
      if (this.seams.diagnostic) this.seams.diagnostic({ source, rowsWritten })
      else if (rowsWritten) console.log(JSON.stringify({ analytics: 'd1_write', source, rowsWritten }))
    } catch { /* Diagnostics cannot re-enter analytics or break ingestion. */ }
  }
  async safe(source, action) {
    try {
      const result = await action()
      if ((Array.isArray(result) ? result : [result]).some(r => r?.success === false)) throw new Error('analytics storage rejected')
      this.diagnostic(source, result); return true
    } catch { this.warn(source); return false }
  }
  warn(source) {
    try { if (!this.warned.has(source)) { this.warned.add(source); console.warn(JSON.stringify({ analytics: 'unavailable', source })) } } catch {}
  }
  emit(point) {
    try {
      const result = this.env.ANALYTICS.writeDataPoint(point)
      // The real binding is synchronous; a rejected or stalled adaptor cannot
      // delay the independent failure writer.
      if (result?.then) void Promise.resolve(result).catch(() => this.warn('analytics-engine'))
    } catch { this.warn('analytics-engine') }
  }
  async record(events, schema) {
    return this.safe('ingest', async () => {
      const now = this.now(), day = now.toISOString().slice(0, 10), month = day.slice(0, 7)
      const country = this.seams.countryCode ?? 'ZZ'
      const db = this.env?.METRICS
      const legacy = [], failures = []
      for (const input of events) {
        const event = legacyCostEvent(input, now)
        this.emit(dataPoint(event, day, country))
        if (!isAggregateOnly(event)) legacy.push(input)
        if (isFailure(event)) failures.push(event)
      }
      // Failure storage is independent of the success/actor path and is never sampled.
      if (failures.length) await this.safe('failure', async () => db.batch(failures.map(event => {
        const p = event.params ?? {}
        const update = event.update
        const id = update ? `${update.attempt_id}:${update.stage}` : event.eventId ?? crypto.randomUUID()
        return db.prepare(FAILURE_SQL).bind(id, update?.timestamp ?? event.timestamp ?? now.toISOString(), day,
          event.name, update?.error_type ?? p.error_type ?? 'unknown', p.model ?? 'unknown', p.role ?? 'unknown', p.strategy ?? 'unknown', event.appVersion,
          update ? JSON.stringify({ ...update, installation_actor: event.installationActor, os: event.os, trigger: event.detail }) : '{}')
      })))
      if (!legacy.length) return []
      const actors = new Map(), observations = new Map(), launches = new Map()
      for (const event of legacy) {
        const actorDimensions = [country, event.appVersion, event.name, event.outcome, event.detail]
        actors.set(JSON.stringify([event.dailyActor, event.monthlyActor, ...actorDimensions]), { event, dimensions: actorDimensions })
        if (schema >= 4 && event.name === 'app_launch') {
          const values = [day, event.installationActor, event.appVersion, event.name, event.outcome, event.detail]
          const key = JSON.stringify(values), previous = observations.get(key)
          if (previous) previous.count++
          else observations.set(key, { values, count: 1 })
        }
        if (schema >= 3 && event.name === 'app_launch') launches.set(event.installationActor, event)
      }
      const statements = []
      for (const { event, dimensions } of actors.values()) if (event.name === 'app_launch' || event.name.startsWith('update_')) statements.push(
        db.prepare(sql.MONTHLY_ACTOR_INSERT_SQL).bind(month, event.monthlyActor, ...dimensions),
      )
      for (const { values } of observations.values()) statements.push(db.prepare('INSERT OR IGNORE INTO product_release_daily (day,installation_actor,app_version,event,outcome,detail,count) VALUES (?,?,?,?,?,?,?)').bind(...values, 0))
      if (observations.size) statements.push(db.prepare("INSERT OR IGNORE INTO product_measurement_coverage (metric, started_day) VALUES ('release-observations', ?)").bind(day))
      for (const event of launches.values()) statements.push(
        db.prepare(sql.INSTALLATION_FIRST_SEEN_INSERT_SQL).bind(event.installationActor, day, event.appVersion),
        db.prepare(sql.INSTALLATION_DAILY_INSERT_SQL).bind(day, event.installationActor),
      )
      return statements.length ? db.batch(statements) : []
    })
  }
  async download(value, country) {
    return this.safe('download-analytics-engine', () => this.env.ANALYTICS.writeDataPoint({
      indexes: [country], blobs: [this.now().toISOString().slice(0, 10), 'download_click', value.version, '', '', '', 'clicked', value.source, 'none', '', '', country, '', '', '', ''], doubles: [1],
    }))
  }
  async scheduled(controller = {}) {
    await this.safe('rollup', () => rollupAnalytics(this.env, { now: this.now(), fetchImpl: this.seams.fetchImpl, diagnostic: (r) => this.diagnostic('rollup', r) }))
    const cleanup = []
    for (const [name, statement] of Object.entries(sql).filter(([key]) => key.endsWith('RETENTION_SQL'))) {
      const match = statement.match(/^DELETE FROM (\w+) WHERE (.+)$/u)
      if (!match) continue
      const [, table, condition] = match
      // Existing tables use WITHOUT ROWID; selecting a bounded primary-key tuple
      // keeps cleanup valid without assuming a rowid exists.
      const keys = {
        metric_daily: 'day,event,app_version,channel,os_family,language,outcome,detail,bucket',
        download_click_daily: 'day,country_code,release_version,source',
        product_actor_daily: 'day,daily_actor,event,outcome,detail', product_actor_monthly: 'month,monthly_actor,event,outcome,detail',
        product_installation_first_seen: 'installation_actor', product_installation_daily: 'day,installation_actor',
        product_release_daily: 'day,installation_actor,app_version,event,outcome,detail',
      }[table]
      cleanup.push({ name, table, keys, condition, cap: 150,
        // Migration 0006 leaves one secondary index on each installation table.
        writeCost: table.startsWith('product_installation_') ? 2 : 1 })
    }
    cleanup.push(
      { name: 'failure-retention', table: 'analytics_failure', keys: 'id', condition: "received_day < date('now','-30 days')", cap: 250, writeCost: 1 },
      { name: 'rollup-retention', table: 'analytics_daily', keys: 'day', condition: "day < date('now','-400 days')", cap: 150, writeCost: 1 },
    )
    // A shared budget includes index amplification, even when several historical
    // tables expire together. Rotate priority hourly so backlog cannot starve a table.
    let remaining = CLEANUP_WRITE_BUDGET
    const start = Math.floor(this.now().getTime() / 3_600_000) % cleanup.length
    for (let index = 0; index < cleanup.length && remaining > 0; index++) {
      const { name, table, keys, condition, cap, writeCost } = cleanup[(start + index) % cleanup.length]
      const limit = Math.min(cap, Math.floor(remaining / writeCost))
      if (!limit) continue
      let spent = limit * writeCost
      await this.safe(name, async () => {
        const result = await this.env.METRICS.prepare(`DELETE FROM ${table} WHERE (${keys}) IN (SELECT ${keys} FROM ${table} WHERE ${condition} LIMIT ${limit})`).run()
        const measured = result?.meta?.rows_written
        // Missing counters and failed statements conservatively consume the reservation.
        if (result?.success !== false && Number.isFinite(measured) && measured >= 0) spent = measured
        return result
      })
      remaining = Math.max(0, remaining - spent)
    }
  }
}
