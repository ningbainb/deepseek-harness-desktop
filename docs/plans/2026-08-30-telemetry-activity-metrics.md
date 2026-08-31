# Telemetry activity metrics design

## Goal

Make desktop activity metrics deterministic, deduplicated, and explicit about their anonymous installation-instance scope.

## Accepted model

- An active instance is an accepted schema 3 `app_launch` event. The client-provided `installationActor` is a stable HMAC-derived pseudonym for one local installation; it is not an account identifier.
- The Worker assigns the UTC day from its receive time. The daily table primary key `(day, installation_actor)` removes duplicate launches and repeated batches for the same instance on the same day.
- DAU counts distinct stable installation actors on the current UTC day. WAU counts the current day plus six preceding UTC days. MAU counts the current day plus 29 preceding UTC days.
- Daily trends are generated with a recursive date CTE so missing activity days return zero. The MAU trend is calculated separately for every day as a rolling 30-day distinct count, not as a calendar-month count.
- The installation total counts first-seen stable installation actors in the retained 400-day window. It is intentionally not presented as a lifetime account-user count; multiple devices and reset local identities count separately.

## Compatibility and privacy

The existing monthly actor table remains the source for country, version, and funnel breakdowns so historical schema 2 data remains usable. Those segment counts are independent monthly observations and are not used for DAU, WAU, MAU, or the installation total. No raw events, IP addresses, account IDs, machine identifiers, hardware identifiers, or client timestamps are added.

## Verification

The Worker test suite covers the headline query, zero-filled daily dates, rolling MAU distinctness, the 400-day boundary, the admin API schema, and the existing ingestion and retention behavior. A dry-run and live deployment use the existing D1 binding without a migration because the required stable installation tables already exist.
