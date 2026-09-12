# Direct-start Home fixtures

These fixtures are privacy-safe, structurally reduced Desktop Home snapshots.
Each version is derived from the profile shape produced by its release commit;
the only session content is a deterministic marker created for this test.

The repository does not contain local `desktop-v2.3.0` through
`desktop-v3.0.1` Git tags. `provenance.json` therefore records the exact
release commit instead of inventing a tag. The 3.4.0 fixture records its real
`desktop-v3.4.0` tag and release commit. Every checked-in text fixture is
covered by a SHA-256 entry.

The matrix materializer writes the descriptor into the paths used by the
packaged application, adds the test-only session probe bundle, and starts the
application without UI automation. The probe proves that the full `desktop`
Runtime loaded the same Home and read the existing session marker.

No real conversation, project file, credential, API key, machine path, or
model output is included.

The 3.3.0 and 3.4.0 descriptors retain the complete default bundle names from
`createDesktopProfileManifest()` / `BUILTIN_BUNDLES` at their recorded source
commits. The matrix also checks that none of these enabled bundles is silently
dropped. These are reconstructed profile contracts, not installed images or
genuine user conversation migrations. Real installer overlay, rollback and
complete historical-conversation recovery require separate tests.
