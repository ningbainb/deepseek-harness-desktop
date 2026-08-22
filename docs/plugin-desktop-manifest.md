# Desktop 3.0 plugin manifest

A DSH bundle may declare Desktop compatibility under `dsh.compatibility` in its own `package.json`. This declaration is evaluated by Extension Dock before activation and gives users a reviewable explanation of a plugin's tested environment.

## Minimal declaration

```json
{
  "name": "@example/dsh-desktop-compat-example",
  "version": "0.1.0",
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "compatibility": {
      "desktop": { "range": ">=3.0.0 <4.0.0", "api": "^1.2.0" },
      "runtime": {
        "range": ">=0.1.0-rc.8 <0.2.0",
        "evidence": {
          "providerId": "dsh-cli-provider-v1",
          "runtime": "0.1.0-rc.8",
          "desktop": "3.0.0",
          "verifiedAt": "2026-08-21",
          "matrixArtifact": "apps/dsh-desktop/runtime-support/supported-runtimes.json"
        }
      },
      "capabilities": ["notifications.show"],
      "surfaces": ["main"]
    }
  }
}
```

The repository includes the same metadata as a copyable [minimal plugin fixture](examples/desktop-plugin/package.json). It is intentionally metadata-only: replace its package name, test evidence, and capability list in a real bundle rather than publishing the fixture.

## Fields

`desktop` and `runtime` accept a SemVer range string or an object with `range`. New manifests put the Contract API range in `desktop.api`; `desktopApi` is accepted only for compatibility with existing manifests. `capabilities` and `surfaces` are non-empty string lists, and each listed capability or surface must be provided by the current Desktop Host.

`runtime.evidence` is bounded public test evidence. It may contain only `providerId`, `runtime`, `desktop`, `verifiedAt`, and `matrixArtifact`. It must not contain a path to a user machine, logs, a token, a credential, raw task input, or an entitlement claim.

The package still needs a valid DSH bundle patch declaration. Peer dependency ranges and the Node engine are assessed as well, so a valid Desktop declaration cannot hide an incompatible dependency graph.

## Assessment outcomes

Extension Dock reports `compatible` only when the declared values that it assesses match the host. Mismatches are blocked. A valid DSH bundle with no usable compatibility evidence remains `unknown`; a user can explicitly review it, but it is never displayed as verified merely because it installed.

Compatibility metadata does not grant a capability, filesystem access, Native UI access, or trust. Plugin code must use the public SDK and check capabilities at runtime. The atomic profile record `desktop-plugins.lock.json` is a diagnostic snapshot, not an editable permission or authorization source.

See [Desktop plugin compatibility](desktop-plugin-compatibility.md), [SDK quickstart](sdk-quickstart.md), and [compatibility policy](compatibility-policy.md).
