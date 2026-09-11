export const UPSERT_SQL = `
INSERT INTO metric_daily (
  day,
  event,
  app_version,
  channel,
  os_family,
  language,
  outcome,
  detail,
  bucket,
  count
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (
  day,
  event,
  app_version,
  channel,
  os_family,
  language,
  outcome,
  detail,
  bucket
) DO UPDATE SET count = count + excluded.count
`

export const DOWNLOAD_CLICK_UPSERT_SQL = `
INSERT INTO download_click_daily (
  day,
  country_code,
  release_version,
  source,
  count
) VALUES (?, ?, ?, ?, ?)
ON CONFLICT (
  day,
  country_code,
  release_version,
  source
) DO UPDATE SET count = count + excluded.count
`

export const DAILY_ACTOR_INSERT_SQL = `
INSERT OR IGNORE INTO product_actor_daily (
  day,
  daily_actor,
  country_code,
  app_version,
  event,
  outcome,
  detail
) VALUES (?, ?, ?, ?, ?, ?, ?)
`

export const MONTHLY_ACTOR_INSERT_SQL = `
INSERT OR IGNORE INTO product_actor_monthly (
  month,
  monthly_actor,
  country_code,
  app_version,
  event,
  outcome,
  detail
) VALUES (?, ?, ?, ?, ?, ?, ?)
`

export const INSTALLATION_FIRST_SEEN_INSERT_SQL = `
INSERT OR IGNORE INTO product_installation_first_seen (
  installation_actor,
  first_seen_day,
  first_version
) VALUES (?, ?, ?)
`

export const INSTALLATION_DAILY_INSERT_SQL = `
INSERT OR IGNORE INTO product_installation_daily (
  day,
  installation_actor
) VALUES (?, ?)
`

export const RELEASE_DAILY_INSERT_SQL = `INSERT INTO product_release_daily
  (day, installation_actor, app_version, event, outcome, detail, count) VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (day, installation_actor, app_version, event, outcome, detail) DO UPDATE SET count = count + excluded.count`
export const RELEASE_RETENTION_SQL = "DELETE FROM product_release_daily WHERE day < date('now', '-89 days')"

export const RETENTION_SQL = "DELETE FROM metric_daily WHERE day < date('now', '-400 days')"
export const DOWNLOAD_RETENTION_SQL = "DELETE FROM download_click_daily WHERE day < date('now', '-400 days')"
export const DAILY_ACTOR_RETENTION_SQL = "DELETE FROM product_actor_daily WHERE day < date('now', '-35 days')"
export const MONTHLY_ACTOR_RETENTION_SQL = "DELETE FROM product_actor_monthly WHERE month < strftime('%Y-%m', date('now', '-13 months'))"
export const INSTALLATION_FIRST_SEEN_RETENTION_SQL = "DELETE FROM product_installation_first_seen WHERE first_seen_day < date('now', '-400 days')"
export const INSTALLATION_DAILY_RETENTION_SQL = "DELETE FROM product_installation_daily WHERE day < date('now', '-400 days')"
