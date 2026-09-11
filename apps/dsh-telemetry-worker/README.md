# Anonymous product analytics service

## What it does

The Worker accepts bounded Desktop event batches and the legacy official-site download-click endpoint. AnalyticsService owns all telemetry storage. Workers Analytics Engine (AE) receives event counters, model routing signals and interface activity. D1 stores hourly snapshots, unsampled failure diagnostics, launch presence/cohorts, and monthly launch/update observations. User configuration and core desktop state remain in their existing stores.

Desktop schemas 2/3/4 remain accepted. Value Mode names are normalized into five schema 5 logical events: cost_mode_enter, cost_mode_toggle, cost_mode_strategy, cost_mode_route and cost_mode_guide. Model role, result, strategy and position are parameters. Existing successful events never fall back to per-event D1 counters if AE is unavailable.

The protected administration surface retains historical data, DAU/WAU/MAU, 400-day installation counts, D1/D7/D30 retention, country/version observations, update conversion, Dock conversion, feature counts, release filtering and CSV export. Daily counts combine legacy D1 observations with new AE snapshots. Only launch instances and monthly launch/update observations continue to be persisted individually; aggregate-only event instance counts are displayed as --. Dock and guide conversion use event counts. Update conversion uses monthly anonymous observations.

## Install

Use the existing authenticated Cloudflare CLI or Wrangler account for this Worker. Deployment is a separate production action. Run from this directory after reviewing migration 0006 and the audit report.

1. Confirm access to the existing Worker, database and Workers Analytics Engine on the account. Review current [AE pricing](https://developers.cloudflare.com/analytics/analytics-engine/pricing/); availability and limits depend on the account.
2. Create an account-scoped token with Account Analytics: Read and store it as the Worker secret ANALYTICS_READ_TOKEN. Do not use an expiring CLI OAuth token as a deployed secret or put credentials in files committed to Git.
3. Apply D1 migration 0006 with Wrangler: pnpm exec wrangler d1 migrations apply dsh-desktop-telemetry --remote. This creates the summary/failure tables and compatibility views and removes five redundant indexes. It does not drop historical event data.
4. Inspect the intended deployment with node scripts/deploy-with-cf.mjs --inspect. Then explicitly deploy with node scripts/deploy-with-cf.mjs --apply. The script requires the correct D1 database, the new tables/views and the analytics read secret. It preserves administrator secrets, adds the AE dataset binding and sets both cron schedules.
5. Run node scripts/deploy-with-cf.mjs --verify. Verify a real hourly rollup and the protected dashboard before distributing the schema 5 Desktop build. The verification command sends no synthetic product events.

Wrangler is an alternative deployment path: wrangler.toml declares the D1/AE bindings and schedules; supply INGEST_ENABLED=1 explicitly and preserve administrator secrets. The repository's Desktop telemetry config remains disabled for local/development/Fork builds. Official release builds obtain their endpoint through the existing DSH_TELEMETRY_ENDPOINT variable.

## Config

| Binding/variable | Purpose |
| --- | --- |
| METRICS | Existing D1 telemetry database |
| ANALYTICS | AE dataset dsh_desktop_events |
| ANALYTICS_ACCOUNT_ID | Account for the AE SQL endpoint |
| ANALYTICS_READ_TOKEN | Worker secret; Account Analytics Read |
| INGEST_ENABLED | Exactly 1 enables ingestion; otherwise valid endpoints return 204 without storage |
| ADMIN_PASSWORD_SHA256 / ADMIN_SESSION_SECRET | Existing protected dashboard credentials |

Schema 5 cost events contain the fixed product context, anonymous actor hashes, eventId, timestamp and params. The exact contract is in ../dsh-desktop/src/cost-mode-events.mjs and is bundled into the Worker deployment. Entry source is hero/header/settings or unknown for old clients; strategies are saving/balanced/stronger or unknown; roles are main/subagent; route results are started/success/failure/cancelled.

The AE blob layout is: 1 server UTC day, 2 event, 3 version, 4 channel, 5 OS, 6 language, 7 outcome, 8 detail, 9 bucket, 10 model, 11 error type, 12 country, 13 source, 14 position, 15 strategy, 16 anonymous installation actor. double1 is the event count, initially 1; index1 is the rotating daily actor (country for download clicks). Use SUM(_sample_interval * double1) for counts. Independent actor counts can use COUNT(DISTINCT blob16), but are observed lower bounds under sampling, not counts to multiply by the sampling interval.

## Operations and validation

Hourly rollups recompute the current UTC day and two preceding days. One absolute JSON snapshot per day avoids incremental retry double counting and per-dimension D1 INSERTs. Older snapshots cannot overwrite newer ones. Each snapshot has at most 4,000 groups and 1.5 MB; incomplete, oversized or failed queries leave the previous snapshot intact. The dashboard exposes the last snapshot time. Expected maximum summary writes are 75 rows/day across both cron schedules, independent of event volume within those dimensional bounds.

Run node scripts/audit-d1.mjs for a read-only schema/source audit. Optional --probe creates a uniquely named scratch table, measures actual meta.rows_written with zero/one/two indexes, and drops it in finally. Storage operations log only source and rowsWritten; failures log source without private exception contents. Audit all operation classes, including cleanup, when comparing daily write totals.

Retention cleanup shares a budget of 350 billed writes per scheduled execution across all tables. It reserves index amplification before each DELETE, accounts for actual meta.rows_written, conservatively spends the reservation when counters are unavailable, and rotates table priority hourly. The normal 25 executions budget at most 8,750 cleanup writes/day with migration 0006 indexes; manual runs, scheduler retries or new indexes change that assumption. Each statement additionally caps deletions at 150 rows (250 for failures). Targets remain 35 days for legacy daily observations, 13 months for monthly observations, 90 days for release observations, 400 days for activity/cohorts/aggregate history, and 30 days for failure diagnosis. Bursts can create cleanup backlog; adjust capacity based on measured writes, reads and storage rather than looping through an unbounded delete.

The completed implementation evidence and before/after budget are in [the audit report](../../docs/archive/2026-09-10-d1-analytics-load-reduction.md). Run the Worker Node tests, focused Desktop telemetry tests, Value Mode tests/typecheck, feature-baseline gate, release-dashboard browser check and Desktop regression before release. Confirm the production reduction using equivalent UTC intervals; local load tests are not evidence of an achieved production daily reduction.

## Security model

Ingestion accepts only fixed fields and bounded values, with at most 20 events and 16,384 bytes per batch. Desktop endpoints reject browser Origin headers; download Beacons accept only the existing official origins. Admin endpoints retain password/session validation. The public telemetry endpoint is not an authenticated or billing-grade usage meter.

Failure records retain event ID, occurrence time, received day, event name, error category, bounded model identifier, role, strategy and version. They exclude prompts, session IDs, paths, credentials and raw error messages. Old clients have unknown fields where collection was absent. Diagnostic rows have only a primary key; no timestamp/event/user/model secondary indexes are added. Retention/cohort indexes remain because the dashboard uses them.

## Known limitations

Update diagnostics use schema 6 and migration `0007_update_diagnostics.sql`. They retain fixed failure stages, codes, source/target versions and attempt correlation in the existing failure row, without new indexes. Deploy the receiving Worker before releasing clients that send schema 6. The authenticated `/admin/api/update-diagnostics` endpoint and dashboard report observed failed attempts and installation instances over at most 30 days. See [update diagnosis and local log analysis](../../docs/update-diagnostics.md) for usage and coverage limits.

All analytics is best effort. Successes are counters in AE, which may sample. Failures are not sampled by this application, but network outages, a queue filled entirely with failures, D1 quota exhaustion and storage errors can still lose records. No analytics failure can alter routing, settings, update results or application requests. The Desktop memory queue holds 200 events, prioritizes failures, uses a two-second transport timeout and a bounded shutdown flush; it does not persist or retry failed batches indefinitely.

Only a committed assistant/message settlement means successful routing. Cancellations, unfinished calls and legacy starts are excluded from the failure-rate denominator; unknown legacy strategy failures cannot imply a 100% failure rate. Guide completed/shown is an event ratio, not a cohort conversion rate. Exact per-event successful histories and per-feature instance observations are intentionally not retained in D1.

The official website currently uses direct release download links. The compatible /v1/download-clicks endpoint does not prove the current website sends events. Queries and counters are observational product signals, not completed installations or paid usage.
