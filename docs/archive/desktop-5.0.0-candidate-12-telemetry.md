# Desktop 5.0.0 candidate 12 native telemetry families

Candidate 12 follows `63b7cbc47bb9d0960ee5af1c385ca8b61a47d4a5`. A release review found that Linux used the legacy `windows-other` fallback and that both the shared cost-event validator and deployed ingestion vocabulary lacked a Linux family. The client now emits coarse `linux`, and both validators accept it. Windows and macOS behavior, existing schemas 2 through 6, historical storage, anonymous actors and automated-run exclusion remain intact. Kernel releases, distributions and hostnames are not new dimensions.

## Verification

Windows-local protocol tests cover Windows, macOS and Linux context normalization through the actual Desktop telemetry client into the local Worker fixture, including schema 4 launch and schema 5 cost events. They verify accepted delivery, expected coarse dimensions in stored points, and rejection of free-form operating-system values. These are protocol-unit results, not native macOS/Linux application acceptance.

The targeted Desktop tests passed 24 of 24, and the Worker suite passed 47 of 47, with no failures or skips. Evidence is `release-500-telemetry-desktop-12.log` and `release-500-telemetry-worker-12.log` under `E:\DeepSeekHarnessDesktop-Build\artifacts`. The machine-readable feature baseline and bilingual release notes include the coarse Linux metric contract. Privacy documentation identifies the same system-family boundary.

## Existing production service preservation

The installed Cloudflare CLI renewed its expired OAuth session without copying credentials. The live Worker's 11 modules and deployment metadata were saved under `telemetry-500-predeploy-12`; secret values were not saved. The previous deployment was `5ee61ea6-e193-4072-a40c-cf03deecc406`. Differences from the committed source were reviewed: pending feature-event vocabulary, aggregate-only feature processing, release-health cards and bounded update-failure summary improvements. No unknown service changes were overwritten, no database migration or data deletion ran, and administrator/analytics secrets were preserved.

The reviewed source was deployed as `40d11a0a-09ef-4f28-884d-a2b73b779731` on 2026-10-03. Module-by-module verification passed for all 11 modules; ingestion remains enabled, both existing cron schedules remain configured, the login page returns 200, protected APIs return 401 without authorization, and an empty invalid batch returns 400. The verification sent zero synthetic product events. Evidence is `release-500-telemetry-backup-12-reviewed.log`, `release-500-telemetry-inspect-12.log`, `release-500-telemetry-deploy-12.log` and `release-500-telemetry-verify-12.log`.

This verifies the deployed code/configuration and security boundaries, not a legitimate production 5.0.0 event landing in analytics. Official installation resources and the exact-source native three-platform release gates still require final verification. No application tag, Release, final installer or website deployment is established by this service update.
