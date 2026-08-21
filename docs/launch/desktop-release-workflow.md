# DeepSeek Harness Desktop 3.0 release preparation and handoff

This is the current 3.0.0 maintainer preparation and handoff guide. It describes the repository contracts and verification evidence for a possible release; it does not authorize a commit, push, tag, GitHub Release change, deployment, or external announcement. A maintainer with explicit authority must make each external-state decision separately.

## Sources of truth

The Desktop version is `apps/dsh-desktop/package.json`; the root `package.json` must agree. The checked-in bilingual release body is [release notes](release-notes.md). Public compatibility, Runtime, migration, privacy, and signing claims must agree with the [Desktop guide](../desktop.md), [compatibility policy](../compatibility-policy.md), [Runtime support policy](../runtime-support-policy.md), [upgrade and rollback guide](../upgrade-and-rollback.md), and [privacy policy](../../PRIVACY.md).

The 3.0 line uses the existing Desktop Release workflow as an automated verifier and artifact publisher when an authorized maintainer triggers it. Do not describe an unverified local build as a published or signed release; use the same Release's `release-manifest.json` to determine each asset's actual signature state.

## Channel contract

| Channel | Existing tag shape | Package-version rule | Updater metadata | User behavior |
| --- | --- | --- | --- | --- |
| Stable | `desktop-vX.Y.Z` | Exactly matches a final Desktop version | `latest.yml` | Default channel; final releases only; no automatic downgrade |
| Beta | `desktop-beta-vX.Y.Z-prerelease` | Exactly matches a prerelease Desktop version | `beta.yml` | Explicitly selected; prereleases only; no automatic downgrade |

The workflow rejects a tag whose version does not exactly match the Desktop package. Stable and Beta remain distinct: a Beta release must not change Stable's `latest` feed, and selection of either channel never permits an automatic downgrade.

## Preparation boundary

Before proposing a release, a maintainer should establish the current version, working-tree state, intended channel, and source revision through read-only inspection. The handoff must state any unrelated dirty files rather than silently absorbing them into a release proposal.

The release body must identify the channel, supported upgrade range, migration limitations, Runtime policy, rollback guidance, known risks, and user verification material. It must not promise browser-localStorage recovery beyond the explicit-confirmation, preserved-origin v1 bridge, infer an asset's signature from a local build, or imply that telemetry uploads are enabled.

Desktop 3.0 uses default-off telemetry. The release workflow verifies that the default telemetry endpoint is empty. Diagnostics are user-initiated, privacy-redacted local JSON/ZIP exports; neither the product nor public website automatically sends installer-click telemetry.

## Minimum verification evidence

Run the repository checks appropriate to the proposed change before asking an authorized maintainer to act. The normal complete gate is `pnpm verify`. When a focused documentation or website change is under review, record the exact targeted checks as well:

```text
pnpm docs:check
pnpm release:notes:check
pnpm website:check
pnpm test:scripts
```

For a packaging candidate, the existing Desktop Release workflow additionally verifies the Runtime Provider end-to-end path, packages the selected updater channel, runs packaged directory-picker, embedded-terminal, window-chrome, cleared-profile, migration, and update-shutdown checks, verifies the package and smoke behavior, verifies Authenticode state, writes `SHA256SUMS.txt`, and writes then verifies `release-manifest.json`. These are release gates, not evidence that a local build is publishable.

Official Desktop tag releases always require signing. Missing certificate material, an invalid signature, or a missing valid timestamp causes the release workflow to fail before publication. An unsigned local or source build remains allowed for development, but it must not be distributed as an official release. The manifest records the actual `valid`, `unsigned`, or `not-applicable` state per artifact.

## Migration and recovery language

The supported migration matrix covers Desktop 2.3 through 2.7 and classifies a plan as `safe`, `needs-confirmation`, or `blocked`. Recognized Task Store v2/v3 state is detected, validated, and included in the allowlisted snapshot/journal boundary; this is not a claim that every transition has already completed automatically.

Legacy 2.3 browser-localStorage task state is `needs-confirmation`, and its scan does not reveal browser contents or task/run counts. After confirmation, a supported v1 value from the preserved same-origin key is read by a hidden CSP/no-scheduler/no-permission probe, copied only into an empty v3 Host ledger, and verified by task count/fingerprint while the original browser value remains intact. An unknown, missing, or changed origin blocks the copy and retains recovery/rollback guidance. Release notes and support handoffs must retain those limitations and direct users to the [upgrade and rollback guide](../upgrade-and-rollback.md).

The bounded global-state snapshot and atomic journal can support resume and rollback for their allowlisted scope; they do not copy project files or user content. Do not present recovery as a universal rollback or as permission to remove a user's independent backup.

## Artifact and publication review

An authorized publication review must compare the intended channel with the actual updater metadata and confirm that the release body is the bilingual [release notes](release-notes.md). It must inspect the exact published installer, `SHA256SUMS.txt`, `release-manifest.json`, and the relevant updater metadata from the same Release.

The installer hash is the baseline integrity check. The manifest must agree with the artifact names, sizes, hashes, channel, Runtime/Schema information, and actual signature state. A signature is an additional trust layer, so an installer must not be called signed solely because signing infrastructure exists.

If a gate fails, the version/channel facts disagree, or public assets already exist, stop and obtain an explicit maintainer decision. Do not overwrite, retag, force-push, delete, or otherwise mutate public history as a consequence of this document.

## Handoff template

Use the following facts in a handoff, replacing placeholders with observed evidence:

```text
Scope: Desktop <version>, proposed <stable|beta> channel; no external publication action taken.
Version evidence: root package.json = <value>; apps/dsh-desktop/package.json = <value>.
Checks: <exact command> — <pass/fail>; <exact command> — <pass/fail>.
Release-body review: bilingual 3.0 notes, Runtime policy, migration limitation, rollback guidance, default-off telemetry, and manifest/signature wording reviewed.
Artifacts: <none produced locally | local candidate paths>; no local result is described as published or signed.
Open risks: <dirty files, failed gate, legacy-data limitation, signing requirement, or none>.
Required next authority: <explicit maintainer decision for any commit, push, tag, Release change, deployment, or announcement>.
```

This preserves the distinction between verification work in the repository and an external release decision, while keeping Stable/Beta, privacy, signing, migration, and rollback claims reviewable for the 3.0 line.
