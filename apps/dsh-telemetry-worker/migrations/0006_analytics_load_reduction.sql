-- PKs already cover date/month range scans used by the dashboard. Retain the
-- installation cohort and reverse-actor indexes used by retention joins.
DROP INDEX IF EXISTS product_actor_daily_event_day;
DROP INDEX IF EXISTS product_actor_daily_country_day;
DROP INDEX IF EXISTS product_actor_monthly_event_month;
DROP INDEX IF EXISTS product_actor_monthly_country_month;
DROP INDEX IF EXISTS product_release_daily_version_day;

CREATE TABLE IF NOT EXISTS analytics_daily (
  day TEXT PRIMARY KEY CHECK(length(day)=10),
  snapshot_at TEXT NOT NULL,
  data TEXT NOT NULL CHECK(json_valid(data))
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS analytics_failure (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  received_day TEXT NOT NULL,
  event TEXT NOT NULL,
  error_type TEXT NOT NULL,
  model TEXT NOT NULL,
  role TEXT NOT NULL,
  strategy TEXT NOT NULL,
  version TEXT NOT NULL
) WITHOUT ROWID;

CREATE VIEW IF NOT EXISTS analytics_rollup_events AS
SELECT d.day, d.snapshot_at, json_extract(j.value,'$.event') AS event,
  json_extract(j.value,'$.app_version') AS app_version,
  json_extract(j.value,'$.channel') AS channel,
  json_extract(j.value,'$.os_family') AS os_family,
  json_extract(j.value,'$.language') AS language,
  json_extract(j.value,'$.outcome') AS outcome,
  json_extract(j.value,'$.detail') AS detail,
  json_extract(j.value,'$.bucket') AS bucket,
  json_extract(j.value,'$.model') AS model,
  json_extract(j.value,'$.error_type') AS error_type,
  json_extract(j.value,'$.country_code') AS country_code,
  json_extract(j.value,'$.strategy') AS strategy,
  json_extract(j.value,'$.count') AS count,
  json_extract(j.value,'$.sample_interval') AS sample_interval
FROM analytics_daily d, json_each(d.data) j;

CREATE VIEW IF NOT EXISTS metric_daily_all AS
SELECT day,event,app_version,channel,os_family,language,outcome,detail,bucket,count FROM metric_daily
UNION ALL
SELECT day,event,app_version,channel,os_family,language,outcome,detail,bucket,count
FROM analytics_rollup_events WHERE event != 'download_click';

CREATE VIEW IF NOT EXISTS download_click_daily_all AS
SELECT day,country_code,release_version,source,count FROM download_click_daily
UNION ALL
SELECT day,country_code,app_version AS release_version,detail AS source,count
FROM analytics_rollup_events WHERE event = 'download_click';
