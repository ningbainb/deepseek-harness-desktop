-- Keep failure detail on the existing row; no extra insert or secondary index.
ALTER TABLE analytics_failure ADD COLUMN diagnostic TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(diagnostic));
