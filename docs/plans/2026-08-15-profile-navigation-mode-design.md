# Desktop Profile, Navigation, and Mode Switching Design

## Problem

Older desktop profiles may list packages that are already expanded by `@linxin666/dsh-web-ui-all`. Cordis then receives the same plugin id from the aggregate and the direct bundle. SSH and Task Board also replace the conversation column outside the shell router, so native sidebar navigation can leave a stale custom surface active. Finally, the official agent-preset header is intentionally read-only once a conversation has history.

## Design

The desktop profile owns an explicit aggregate-member set. Profile refresh removes only those members from `dsh.profile.bundles`; dependencies and installed files remain untouched, and unknown community bundles remain in order after the managed roster.

SSH and Task Board publish one document-level surface-navigation event. Opening either closes the other, while capture-phase clicks on native sidebar destinations close whichever custom surface is active. The Task Board mount also detects a replaced conversation column and remounts like SSH already does.

The mode switcher uses only public client services. Blank sessions call `agentPresets.select` directly. Non-empty sessions cannot be safely recomposed because their history can contain tool calls unavailable in another preset, so `session.create` creates a new blank session in the same workspace with the requested `agentPreset` in the same RPC. To keep the official read-only session-preset seat consistent during that transition, the switcher briefly stages the target as the official default, opens the new session, and restores the user's previous default immediately; it never rewrites the user's lasting preference.

## Verification

Regression tests cover aggregate-member migration, custom-surface mutual exclusion, native-navigation close behavior, blank-session in-place mode changes, target-preset same-workspace mode transitions for conversations with history, and restoration of the official default preset. Desktop composition must contain one `ui-mode-switcher` row and no duplicate child bundle registrations.
