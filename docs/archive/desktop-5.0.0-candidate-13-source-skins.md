# Desktop 5.0.0 candidate 13 source skin preparation

Candidate 12 source regression passed all 24 suites in the three-platform workflow `37150478947`; macOS arm64 and Linux x64 completed their native package and smoke gates. Windows packaging completed and real Setup acceptance was still running when this note was written. No formal tag or Release had been created.

The independent Desktop CI run `37150476814` failed on the second skin with a catalog containing only `blue-fantasy`. The published Skin Center 0.4.4 package deliberately lists only that builtin in its package manifest. Desktop's reviewed supplemental assets are restored by `after-pack.cjs`, including the catalog files whitelist. Runtime integration tests also perform that restoration. Consequently, running source regression after the complete unit suite worked, while running it first on a fresh install did not. This is an order-dependent source preparation defect, not evidence that waiting longer would fix catalog registration.

Source regression now invokes the existing hash-verified asset restoration before launching any suite, only when no packaged executable is selected. Packaged verification continues to inspect the actual packaged assets without modifying them. The helper only supplements the community Skin Center package; it does not write official DSH packages or user profiles. All 15 skin activation and geometry assertions, default restoration, official OAuth and bai recommendation assertions remain unchanged.

A clean temporary dependency fixture passed preparation, all 15 catalog whitelist entries, idempotent second preparation, preservation of an existing builtin and preservation of an official runtime sentinel. The local complete `pnpm verify` retest for candidate 12 also completed successfully: Desktop 1576 tests, 1574 passed, two pre-existing skips, zero failures; root script tests 212 passed. Earlier failures remain recorded in the candidate 12 notes rather than being erased.

Exact-source native CI, production Setup and full packaged regression are still required for the final tag. Earlier candidates and local source screenshots are not final installer evidence.
