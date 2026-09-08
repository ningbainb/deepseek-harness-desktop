# dsh-paperclip fixed-version compatibility evidence

Date: 2026-09-08.

## Locked artifact and host

The package was fetched with `npm pack dsh-paperclip@0.2.5` from the official
npm registry into an isolated temporary directory. It was not installed into a
Desktop or user profile.

| Item | Locked value |
| --- | --- |
| Package | `dsh-paperclip@0.2.5` |
| Registry tarball | `https://registry.npmjs.org/dsh-paperclip/-/dsh-paperclip-0.2.5.tgz` |
| Tarball integrity | `sha512-3do+7wwMCzd4fEzxIdC/b52MhWENOJRehgHhGD7VUfgHuNUm8AW2LjZ1I8iLzLG7vjl/7276Xc3RwcPcg9oalA==` |
| Tarball shasum | `7e03c24996e2befa99201ae7fee88e088dcf6b23` |
| Client bundle SHA-256 | `a8733a8d328ecaaf32d8546b43839041636f53b88b1b1277d25615d41e3d39e4` |
| Host bundle SHA-256 | `aeb00dea1e01229ae6eeda0c69015c741df88760a8229d65c43651876669ab5f` |
| Desktop | 3.3.0 |
| Electron | 43.4.0 |
| Embedded Node.js | 24.18.1 |
| Official DSH Runtime and client SDK | 0.1.1-rc.1 |
| Cordis | 4.0.1 |
| React | 18.3.1 |

The package's DSH peer ranges accept this Runtime tuple under Desktop's
prerelease-aware semver policy. The ordinary dependency check therefore
reported compatible before the behavior-specific evidence was applied.

## Reproduction

The published client bundle selects the first conversation scroll surface,
registers drag listeners on it, and claims every file drop before examining the
file MIME type. Its drop callback cancels the event and stops propagation, then
uploads the selected file. It has no branch that yields image files to the
native attachment preview.

The exact published bundle was loaded in Chromium with the same relevant DOM
nesting: a drop target inside the conversation scroll surface, with the native
preview represented by the delegated listener on the React root ancestor. A
PNG file drop produced:

```json
{"defaultPrevented":true,"nativePreviewDrops":0}
```

This establishes the R35 conflict without modifying official DSH source. R36
has the same title and detail in the recovery snapshot and remains a duplicate
association rather than a second implementation task.

The same package also creates a fixed Linux upload directory during host-module
evaluation and does not enforce the README's stated file-count or file-size
limits in the published client or host bundle. Those observations are retained
as audit evidence but are not used to broaden the image-drop classification.

## Disposition and verification

`apps/dsh-desktop/runtime-support/community-plugin-known-issues.json` records
the exact artifact hashes, host tuple, conflict surface, and `inspect-only`
startup action. `assessPluginCompatibility` returns
`known-native-image-drop-conflict` only for that exact tuple. Extension Dock
shows the reason and a removal or revalidation recommendation.

Startup inspection writes diagnostic evidence only. It does not remove the
package, delete bytes, or alter an enabled bundle. A future package, Desktop,
Runtime, or embedded Node version does not inherit the classification; it must
be reproduced and recorded separately. Focused compatibility, inventory, and
UI tests passed 45/45, including assertions for exact-version scoping and an
unchanged enabled profile. A clean Windows package passed its 94-package
verification, contained the evidence and evaluator modules in `app.asar`, and
completed packaged startup smoke plus preset-ingress, deferred deep-link, and
Task Board Worktree checks.
