## Summary

<!-- Briefly describe what changed and why. -->

## Verification

- [ ] `pnpm verify`
- [ ] Targeted desktop E2E suite(s) for UI/runtime changes (e.g. `node apps/dsh-desktop/scripts/verify-<name>.mjs`) or `pnpm desktop:regression:e2e --shard=1/4`
- [ ] `git diff --check` and no emoji characters added

## Workflow Notes

- PR CI runs fast `verify` first, then fans out installer lifecycle and 4 parallel E2E shards.
- See `CONTRIBUTING.md` and `docs/ci-and-release-testing.md` for details.
