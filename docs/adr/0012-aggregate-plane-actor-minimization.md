# ADR 0012: Aggregate-plane actor minimization

Status: Accepted

Date: 2026-09-12

## Context

The telemetry service needs two different measurement properties. Product-event volumes must remain inexpensive and tolerant of Analytics Engine sampling. DAU, WAU, MAU, installation cohorts, and retention must remain exact within their documented retention windows. Using an installation actor in every high-frequency aggregate point is unnecessary for the first requirement and creates a sampling index that does not match the dashboard queries.

## Decision

- Analytics Engine stores only bounded aggregate dimensions. `index1` is the server-derived country code, `blob16` is reserved and empty, and no daily, monthly, or stable actor hash is written to the aggregate plane.
- Event totals use `SUM(_sample_interval * double1)`. They are observational weighted counts, not billing records or exact user histories.
- Exact UTC DAU, rolling 7-day WAU, rolling 30-day MAU, installation counts, and D1/D7/D30 retention remain in the bounded D1 `app_launch` presence and cohort tables.
- Monthly anonymous observations remain only where the release, country, version, and update views require monthly instance deduplication.
- The stable installation actor remains in update-failure rows only to count observed affected installations over a maximum 30-day window. The row stores fixed stages and categories, never raw errors, paths, prompts, credentials, or content.
- The admin summary contract advances to schema 6 and exposes explicit time windows, prior non-overlapping comparisons, stickiness ratios, coverage age, DAU trend, and rolling-MAU trend.

## Consequences

High-frequency event aggregation no longer carries an actor identifier and its sampling index matches a coarse query dimension. Exact active-instance metrics continue to come from unsampled launch presence rather than attempting to recover distinct users from sampled aggregates. No Desktop wire-schema migration is required for this storage-only minimization; the Worker must still be deployed before schema 6 clients so update diagnostics are accepted.

Analytics failure remains isolated from product behavior. A missing or delayed aggregate cannot fail routing, startup, settings, update, or plugin operations.
