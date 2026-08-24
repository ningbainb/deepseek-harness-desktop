# ADR-0010: Stable anonymous retention actor

## Status

Accepted

## Context

ADR-0007 deliberately limited product identities to daily and monthly rotation. That supports DAU and MAU but cannot measure D1, D7, or D30 retention. Product planning now requires those cohort metrics while continuing to exclude accounts, hardware identifiers, IP storage, raw events, and user content.

## Decision

Official Desktop builds derive a stable `installationActor` from the existing product-analytics random secret. The secret remains local. The actor is unrelated to DSH identity, provider login, machine code, hardware information, or an operating-system advertising identifier.

The ingestion protocol uses schema 3. The Worker continues accepting schema 2 from already released clients. Only schema 3 `app_launch` events write the stable actor to two bounded D1 tables: one first-seen date and one deduplicated active-day row. No API exposes actor rows or per-installation timelines.

The administration API computes mature D1, D7, and D30 cohorts. A target day is considered mature only after that UTC day has ended. Stable first-seen and active-day rows are deleted after 400 days.

## Consequences

- The product can calculate D1, D7, and D30 retention without an account system.
- The service can associate up to 400 days of launch-day presence for one pseudonymous installation, so public privacy text must disclose this explicitly.
- The actor cannot identify a person by itself, but it is a long-lived pseudonymous identifier and must not be joined to request logs, IP addresses, accounts, content, or diagnostics.
- Existing schema 2 clients continue contributing aggregate, DAU, MAU, country, version, and funnel metrics but enter retention cohorts only after upgrading.

## References

- [ADR-0007](0007-default-on-anonymous-product-metrics.md)
- [Product privacy policy](../../PRIVACY.md)
