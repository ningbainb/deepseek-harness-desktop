CREATE TABLE IF NOT EXISTS product_installation_first_seen (
  installation_actor TEXT PRIMARY KEY CHECK (length(installation_actor) = 64),
  first_seen_day TEXT NOT NULL CHECK (length(first_seen_day) = 10),
  first_version TEXT NOT NULL
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS product_installation_first_seen_day
ON product_installation_first_seen (first_seen_day);

CREATE TABLE IF NOT EXISTS product_installation_daily (
  day TEXT NOT NULL CHECK (length(day) = 10),
  installation_actor TEXT NOT NULL CHECK (length(installation_actor) = 64),
  PRIMARY KEY (day, installation_actor)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS product_installation_daily_actor_day
ON product_installation_daily (installation_actor, day);
