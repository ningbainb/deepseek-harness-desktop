CREATE TABLE IF NOT EXISTS product_release_daily (
  day TEXT NOT NULL CHECK (length(day) = 10),
  installation_actor TEXT NOT NULL CHECK (length(installation_actor) = 64),
  app_version TEXT NOT NULL,
  event TEXT NOT NULL,
  outcome TEXT NOT NULL,
  detail TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (day, installation_actor, app_version, event, outcome, detail)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS product_release_daily_version_day
ON product_release_daily (app_version, day);

CREATE TABLE IF NOT EXISTS product_measurement_coverage (
  metric TEXT PRIMARY KEY,
  started_day TEXT NOT NULL CHECK (length(started_day) = 10)
) WITHOUT ROWID;
