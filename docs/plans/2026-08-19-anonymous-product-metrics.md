# Anonymous Product Metrics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add default-on anonymous product metrics to official DeepSeek Harness Desktop builds without a user-facing opt-out, persistent identifiers, raw event storage, or collection from ordinary source/Fork builds.

**Architecture:** The Electron main process validates a closed event vocabulary, batches events in memory, and sends them only when a packaged resource contains an official HTTPS endpoint. A Cloudflare Worker validates and groups each batch before atomically incrementing daily D1 aggregate rows; the service never stores raw events, client timestamps, network identifiers, content, paths, logs, or stack traces.

**Tech Stack:** Electron 43, Node.js ESM, Node test runner, Cloudflare Workers, Cloudflare D1, SQLite migrations, GitHub Actions, static HTML.

---

### Task 1: Record the architecture and privacy boundary

**Files:**
- Create: `docs/adr/0007-default-on-anonymous-product-metrics.md`
- Create: `PRIVACY.md`

**Step 1: Write the ADR**

Record the accepted decisions: default-on official builds, no application switch, no persistent identifier, no raw events, main-process-only transport, Cloudflare aggregate storage, 365-day retention, and a server-side kill switch.

**Step 2: Write the privacy policy**

List every collected category and every prohibited category, state that use indicates agreement to the disclosed processing where permitted, identify Cloudflare as the request processor, and state that only daily aggregate counts are retained.

**Step 3: Run documentation validation**

Run: `pnpm docs:check`

Expected: PASS with the new Markdown files accepted as plans/ADR/root policy artifacts.

**Step 4: Commit when authorized**

Run: `git add docs/adr/0007-default-on-anonymous-product-metrics.md PRIVACY.md docs/plans/2026-08-19-anonymous-product-metrics.md && git commit -m "docs: define anonymous product metrics"`

### Task 2: Build the aggregate Cloudflare backend

**Files:**
- Create: `apps/dsh-telemetry-worker/package.json`
- Create: `apps/dsh-telemetry-worker/wrangler.toml`
- Create: `apps/dsh-telemetry-worker/src/index.mjs`
- Create: `apps/dsh-telemetry-worker/migrations/0001_metric_daily.sql`
- Create: `apps/dsh-telemetry-worker/test/worker.test.mjs`

**Step 1: Write failing Worker tests**

Cover method rejection, disabled ingestion, body size, schema version, event count, unknown fields, invalid enums, absence of IP/user-agent reads, grouped UPSERT bindings, D1 failure containment, and scheduled retention cleanup.

**Step 2: Run the tests to verify failure**

Run: `pnpm --filter @deepseek-ai/dsh-telemetry-worker test`

Expected: FAIL because the Worker implementation does not exist.

**Step 3: Implement the Worker and migration**

Accept `POST /v1/events`, allow at most 20 events and 8192 request bytes, validate exact fields, derive the UTC day on the server, group identical dimensions, and execute prepared `INSERT ... ON CONFLICT ... DO UPDATE` statements through `D1Database.batch()`. Return `204` for accepted or intentionally disabled ingestion, `400/405/413` for invalid input, and `503` for storage errors without exposing details.

**Step 4: Implement retention**

Handle the daily scheduled event with `DELETE FROM metric_daily WHERE day < date('now', '-365 days')`.

**Step 5: Run Worker tests**

Run: `pnpm --filter @deepseek-ai/dsh-telemetry-worker test`

Expected: PASS.

**Step 6: Commit when authorized**

Run: `git add apps/dsh-telemetry-worker && git commit -m "feat(telemetry): add aggregate worker backend"`

### Task 3: Build the Electron telemetry core

**Files:**
- Create: `apps/dsh-desktop/src/telemetry-events.mjs`
- Create: `apps/dsh-desktop/src/telemetry-client.mjs`
- Create: `apps/dsh-desktop/src/telemetry-config.mjs`
- Create: `apps/dsh-desktop/build/telemetry-config.json`
- Create: `apps/dsh-desktop/test/telemetry-events.test.mjs`
- Create: `apps/dsh-desktop/test/telemetry-client.test.mjs`
- Create: `apps/dsh-desktop/test/telemetry-config.test.mjs`
- Modify: `apps/dsh-desktop/electron-builder.yml`

**Step 1: Write failing event-policy tests**

Assert the seven accepted event names, exact event-specific dimensions, bounded strings, normalized OS/language/channel values, and rejection of content-like or unknown keys.

**Step 2: Write failing client tests**

Assert in-memory-only batching, 20-event and timer flushes, two-second abort, no retry, queue clearing after send, non-blocking failures, disabled behavior, and bounded best-effort shutdown.

**Step 3: Write failing configuration tests**

Assert empty committed configuration disables telemetry, valid packaged HTTPS configuration enables it, HTTP/file/credentialed URLs fail closed, development mode stays disabled, and an explicit test environment override may supply a local endpoint only to tests.

**Step 4: Run the tests to verify failure**

Run: `pnpm --filter @deepseek-ai/dsh-desktop test -- telemetry`

Expected: FAIL because the modules do not exist.

**Step 5: Implement the core**

Keep all event data in memory, use `fetch` only from the main process, never persist a queue, expose no arbitrary event API to renderers, and copy the empty configuration into packaged resources.

**Step 6: Run the tests**

Run: `pnpm --filter @deepseek-ai/dsh-desktop test`

Expected: PASS.

**Step 7: Commit when authorized**

Run: `git add apps/dsh-desktop/src/telemetry-*.mjs apps/dsh-desktop/test/telemetry-*.test.mjs apps/dsh-desktop/build/telemetry-config.json apps/dsh-desktop/electron-builder.yml && git commit -m "feat(desktop): add anonymous telemetry core"`

### Task 4: Instrument product events

**Files:**
- Modify: `apps/dsh-desktop/src/electron-app.mjs`
- Modify: `apps/dsh-desktop/src/ipc.mjs`
- Modify: `apps/dsh-desktop/src/menu.mjs`
- Modify: `apps/dsh-desktop/src/extensions/plugins.mjs`
- Modify: `apps/dsh-desktop/src/updater.mjs`
- Modify: relevant tests under `apps/dsh-desktop/test/`

**Step 1: Write failing integration tests**

Assert one `app_launch` event, one terminal `runtime_start_result` per attempt, bounded recovery actions, allowed surface-open events, update phase transitions, extension operation type/result without package names, and duration-bucket shutdown.

**Step 2: Run focused tests to verify failure**

Run: `pnpm --filter @deepseek-ai/dsh-desktop test`

Expected: FAIL on missing telemetry seams.

**Step 3: Add injected telemetry seams**

Pass narrow `recordProductEvent(name, dimensions)` functions into existing components. Do not import or call the DSH session telemetry packages, do not observe conversation records, and do not pass raw errors.

**Step 4: Run desktop tests**

Run: `pnpm --filter @deepseek-ai/dsh-desktop test`

Expected: PASS.

**Step 5: Commit when authorized**

Run: `git add apps/dsh-desktop/src apps/dsh-desktop/test && git commit -m "feat(desktop): instrument anonymous product events"`

### Task 5: Publish privacy and official-build configuration

**Files:**
- Create: `website/privacy.html`
- Modify: `website/index.html`
- Modify: `apps/dsh-desktop/src/community-links.mjs`
- Modify: `apps/dsh-desktop/src/menu.mjs`
- Modify: `apps/dsh-desktop/src/window-chrome.mjs`
- Modify: `.github/workflows/desktop-release.yml`
- Modify: website/menu/window tests

**Step 1: Write failing navigation and website tests**

Require an application Help-menu privacy entry, a visible title-bar Help entry, an official privacy URL, a website footer link, a standalone policy page, and release-time configuration generation from the `DSH_TELEMETRY_ENDPOINT` repository variable.

**Step 2: Run focused tests to verify failure**

Run: `pnpm --filter @deepseek-ai/dsh-desktop test && pnpm website:check`

Expected: FAIL because the privacy surfaces do not exist.

**Step 3: Implement the surfaces**

Open the hosted privacy page externally from desktop Help surfaces, publish matching website policy copy, and have only `desktop-release.yml` replace the committed empty packaged configuration. Fail the official release when the endpoint variable is absent or invalid.

**Step 4: Run focused tests**

Run: `pnpm --filter @deepseek-ai/dsh-desktop test && pnpm website:check && pnpm docs:check`

Expected: PASS.

**Step 5: Commit when authorized**

Run: `git add website apps/dsh-desktop/src .github/workflows/desktop-release.yml && git commit -m "docs: publish desktop privacy policy"`

### Task 6: Full verification and release evidence

**Files:**
- Modify only files required to fix discovered regressions.

**Step 1: Run targeted telemetry tests**

Run: `pnpm --filter @deepseek-ai/dsh-telemetry-worker test && pnpm --filter @deepseek-ai/dsh-desktop test`

Expected: PASS.

**Step 2: Run repository consistency gates**

Run: `pnpm website:check && pnpm docs:check && pnpm test:scripts`

Expected: PASS.

**Step 3: Run the full repository gate**

Run: `pnpm verify`

Expected: PASS. If unrelated pre-existing failures remain, record the exact command and failure without modifying unrelated user work.

**Step 4: Inspect the final diff**

Run: `git diff --check && git status --short && git diff -- apps/dsh-desktop apps/dsh-telemetry-worker website PRIVACY.md docs/adr docs/plans .github/workflows/desktop-release.yml`

Expected: no whitespace errors, no emoji, no sensitive payload fields, and no unrelated tracked-file changes.

**Step 5: Commit when authorized**

Run: `git add <only implementation files> && git commit -m "feat: add default-on anonymous product metrics"`

### Task 7: Add non-blocking website download geography

**Files:**
- Create: `apps/dsh-telemetry-worker/migrations/0002_download_click_daily.sql`
- Create: `website/download-telemetry.mjs`
- Create: `scripts/download-telemetry.test.mjs`
- Modify: `apps/dsh-telemetry-worker/src/index.mjs`
- Modify: `apps/dsh-telemetry-worker/test/worker.test.mjs`
- Modify: `website/index.html`
- Modify: `website/script.js`
- Modify: `PRIVACY.md`
- Modify: `website/privacy.html`

**Step 1: Write failing protocol tests**

Require `POST /v1/download-clicks` to accept only form-encoded beacons from the canonical GitHub Pages origin, validate an exact schema/version/source vocabulary, derive a two-letter country code from Cloudflare request metadata, and write only daily aggregate counts.

**Step 2: Implement the aggregate backend**

Create a `download_click_daily` table keyed by UTC day, country code, release version, and one of four fixed website positions. Do not store IP addresses, cities, request headers, raw events, client timestamps, referrers, or user identifiers. Apply the existing 365-day retention policy to this table.

**Step 3: Implement non-blocking website reporting**

Keep every installer `href` pointed directly at GitHub. On a trusted official-site click, call `navigator.sendBeacon()` with a small `URLSearchParams` body and never cancel, delay, or replace navigation. Ignore missing browser support, rejected beacons, and synchronous errors.

**Step 4: Update disclosure and verification**

Disclose approximate country-level download-click aggregation and distinguish it from completed GitHub downloads. Run Worker tests, website script tests, website validation, documentation validation, and the repository verification gate before deployment.
