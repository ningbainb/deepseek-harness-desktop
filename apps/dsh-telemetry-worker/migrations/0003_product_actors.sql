CREATE TABLE IF NOT EXISTS product_actor_daily (
  day TEXT NOT NULL CHECK (length(day) = 10),
  daily_actor TEXT NOT NULL CHECK (length(daily_actor) = 64),
  country_code TEXT NOT NULL CHECK (length(country_code) = 2),
  app_version TEXT NOT NULL,
  event TEXT NOT NULL,
  outcome TEXT NOT NULL,
  detail TEXT NOT NULL,
  PRIMARY KEY (day, daily_actor, event, outcome, detail)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS product_actor_daily_event_day
ON product_actor_daily (event, day);

CREATE INDEX IF NOT EXISTS product_actor_daily_country_day
ON product_actor_daily (country_code, day);

CREATE TABLE IF NOT EXISTS product_actor_monthly (
  month TEXT NOT NULL CHECK (length(month) = 7),
  monthly_actor TEXT NOT NULL CHECK (length(monthly_actor) = 64),
  country_code TEXT NOT NULL CHECK (length(country_code) = 2),
  app_version TEXT NOT NULL,
  event TEXT NOT NULL,
  outcome TEXT NOT NULL,
  detail TEXT NOT NULL,
  PRIMARY KEY (month, monthly_actor, event, outcome, detail)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS product_actor_monthly_event_month
ON product_actor_monthly (event, month);

CREATE INDEX IF NOT EXISTS product_actor_monthly_country_month
ON product_actor_monthly (country_code, month);
