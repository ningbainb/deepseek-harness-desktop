# Desktop Base Aggregate Design

## Goal and scope

`dsh-desktop-base` is the public dependency carrier for the non-official features shipped by DeepSeek Harness Desktop. Installing one package should activate the same Web UI collection, plugin market, Codex provider, and reasoning control used by the desktop distribution. Tencent QQ Bot is intentionally outside this package because its connector currently publishes as `UNLICENSED` and requires separate redistribution and branding approval. The package does not copy or rename third-party source code. It installs exact upstream npm releases and supplies one DSH bundle patch that mounts those packages by their original names.

The first release is unscoped `dsh-desktop-base@0.1.0` on `https://registry.npmjs.org/`. An unscoped name avoids publishing under the unrelated `@linxin666` identity while keeping the required `dsh-` package prefix. Dependencies are pinned to the versions already exercised by Desktop: `@linxin666/dsh-web-ui-all@0.1.15`, `dshmarket@1.3.0`, `dsh-codex-connect@0.1.0-alpha.4.5`, and `reasoning-slider@0.0.2`. A later aggregate release, rather than a floating range, controls upgrades.

## Architecture and behavior

The aggregate has no host or browser implementation of its own. Its `package.json` declares `dsh.bundle.patch`, the four exact dependencies, public npm metadata, and only the documentation and patch files included in the tarball. `cordis.patch.yml` reproduces the child bundle rows required by DSH because dependencies alone do not activate profile layers. The Web UI rows remain in their established order, followed by the market, Codex provider, and reasoning slider. Codex Connect retains its conservative defaults with web search and image tools disabled.

At install time npm resolves each original package from its original publisher. DSH reads the aggregate patch and resolves every named child from the profile dependency tree. Removal of the aggregate removes its dependency graph unless another installed package still needs a child. Existing installations should not install this aggregate alongside the same standalone bundles because duplicate Cordis ids can result. The README documents migration and the Codex-provider conflict.

Validation covers the manifest contract, exact dependency set, patch parity with `dsh-web-ui-all`, exclusion of Tencent packages, notices, tarball contents, and a clean-profile DSH composition smoke test. `THIRD_PARTY_NOTICES.md` attributes every upstream dependency and records the known `dsh-web-ui-all` license-metadata mismatch without asserting ownership.
