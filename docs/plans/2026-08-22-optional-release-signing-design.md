# Optional Desktop Release Signing Design

## Context

DeepSeek Harness Desktop is an open-source community project and does not currently have a Windows code-signing certificate. The existing tag workflow nevertheless hard-requires Authenticode signing, so an otherwise verified release cannot be published. Development builds already support unsigned artifacts and the release manifest already records the signature result observed from each Windows executable.

## Decision

Official Desktop releases use automatic signing policy selection:

- If `CSC_LINK`, `WIN_CSC_LINK`, or `CSC_NAME` is configured, signing is required. Packaging, signature verification, and manifest verification fail closed unless every Windows executable has a valid signer and timestamp.
- If no certificate material is configured, the workflow may publish unsigned artifacts. Packaging and all non-signature release gates remain mandatory.
- `release-manifest.json` always records the signature state that was actually verified. Release notes must describe the same state and warn about the Windows unknown-publisher or SmartScreen prompt for unsigned builds.

This does not treat an unsigned artifact as signed and does not weaken the signed path. SHA-256 checksums, updater metadata hashes, packaged application tests, smoke tests, and manifest verification remain required for both modes.

## Workflow Shape

One PowerShell step derives a lowercase `required` output from the presence of certificate selectors. It emits only a boolean and never prints certificate or password values. All four existing release gates consume that same output so packaging, signature verification, manifest creation, and manifest verification cannot disagree about policy. After the manifest has been reverified, a separate step reads its executable signature records and appends a bilingual `valid` or `unsigned` section to the GitHub Release body.

Certificate passwords are not part of mode detection. If certificate material is configured without the required password, the workflow selects required signing and packaging fails instead of silently falling back to unsigned output.

## Verification

A source-level workflow contract test locks the automatic policy step, the shared output, and the absence of hard-coded required signing. Existing release-manifest tests continue to prove that unsigned verification is accepted only when signing is optional and that required signing rejects missing certificate material, unsigned files, invalid signers, or missing timestamps.

Before tagging, the repository must pass the full verification suite and an unsigned packaging rehearsal. After tagging, the published manifest and release notes must both report the resulting unsigned state until a certificate is configured.
