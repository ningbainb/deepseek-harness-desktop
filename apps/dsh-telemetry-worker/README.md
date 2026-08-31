# Anonymous product metrics service

This Cloudflare Worker accepts only the fixed Desktop product-event schema and official-site download-click schema. It writes aggregate event counts, rotating daily and monthly actor rows, and bounded stable anonymous installation activity and cohort rows to D1 so the administration surface can report DAU, WAU, rolling 30-day MAU, the 400-day installation total, monthly-observed country and version counts, in-app update conversion, Extension Dock conversion, D1/D7/D30 retention, session-duration buckets, and Value Mode selection, onboarding, enablement, strategy, and controller/subagent route counts. It does not persist raw events, client timestamps, IP addresses, user agents, request headers, content, paths, logs, package names, model names, local secrets, accounts, machine codes, hardware identifiers, token counts, or error text. Download clicks store only the UTC day, Cloudflare-provided two-letter country code, release version, fixed website position, and count.

## Metric definitions

- Active activity is an accepted schema 3 `app_launch` event. The client supplies an HMAC-derived `installationActor`; D1 stores only the 64-character pseudonymous value and a day presence row.
- DAU is the distinct installation-actor count for the current server UTC day. WAU is the distinct count across the current day and six preceding UTC days. MAU is the distinct count across the current day and 29 preceding UTC days. Duplicate launches on the same day are removed by the D1 primary key.
- The dashboard trend fills every requested UTC day, including zero-activity days. Its MAU trend is a per-day rolling 30-day distinct count rather than a calendar-month count.
- The installation total counts first-seen installation actors retained in the current 400-day window. It is not a lifetime account-user count; multiple devices count separately, and deleting or resetting local analytics state creates a new anonymous installation identity.
- Country, version, and funnel breakdowns continue to use the bounded monthly observation actor table so historical schema 2 data remains available. These segment totals are independent observations and do not need to sum to the stable-actor MAU.

## One-time deployment

1. Log in to the Cloudflare account with Wrangler:

   ```powershell
   pnpm dlx wrangler@latest login --device
   ```

2. Create the free D1 database:

   ```powershell
   pnpm dlx wrangler@latest d1 create dsh-desktop-telemetry --binding METRICS --location apac --update-config=false
   ```

3. Copy the returned database ID into `wrangler.toml`, replacing `REPLACE_WITH_D1_DATABASE_ID`.

4. Apply the aggregate-only schema:

   ```powershell
   pnpm dlx wrangler@latest d1 migrations apply dsh-desktop-telemetry --remote
   ```

5. Deploy with ingestion enabled:

   ```powershell
   pnpm dlx wrangler@latest deploy --var INGEST_ENABLED:1
   ```

6. In the GitHub repository, create the Actions repository variable `DSH_TELEMETRY_ENDPOINT` with the deployed URL ending exactly in `/v1/events`, for example `https://dsh-desktop-telemetry.example.workers.dev/v1/events`.

The official `desktop-v*` release workflow fails if this variable is absent or not a credential-free HTTPS `/v1/events` URL. The committed Desktop configuration remains empty, so local, development, test, source, and Fork builds do not upload to the official service.

The official website sends form-encoded Beacons to `/v1/download-clicks` only from the exact Origins `https://1521003.xyz`, `https://www.1521003.xyz`, and `https://ningbainb.github.io`. Installer links remain direct GitHub Release links, so missing or failed telemetry never delays or blocks a download.

## Operations

Run a bounded aggregate query without exposing individual requests:

```powershell
pnpm dlx wrangler@latest d1 execute dsh-desktop-telemetry --remote --command "SELECT day, event, outcome, detail, SUM(count) AS total FROM metric_daily WHERE day >= date('now', '-30 days') GROUP BY day, event, outcome, detail ORDER BY day DESC, event"
```

Query official-site download clicks by day and country:

```powershell
pnpm dlx wrangler@latest d1 execute dsh-desktop-telemetry --remote --command "SELECT day, country_code, release_version, source, SUM(count) AS total FROM download_click_daily WHERE day >= date('now', '-30 days') GROUP BY day, country_code, release_version, source ORDER BY day DESC, total DESC"
```

Emergency stop, followed by a normal deploy:

```powershell
pnpm dlx wrangler@latest deploy --var INGEST_ENABLED:0
```

Re-enable ingestion only after resolving the incident. The scheduled Worker job deletes daily actor rows after 35 days, monthly actor rows after 13 months, and stable installation activity, retention-cohort, and aggregate trend rows after 400 days.
