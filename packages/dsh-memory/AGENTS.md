# dsh-memory package rules

- Memory content is user data. Never include it in logs, errors, telemetry, or
  diagnostics; public errors must be generic.
- A model call may search memory or create a pending suggestion, but it must not
  persist a new memory without a user confirmation action.
- Every read and write is scoped by the `@ningbainb/dsh-user-scope` principal.
  Unknown owner, workspace, session, or a failed store must fail closed for
  reads and must not fall back to another principal's cache.
- Prompt assembly uses the official `SystemPrompt.section` plus
  `SystemPrompt.variable` contract. Memory text is data, never instructions.
- The browser half must stay free of Host imports and must use the shared
  `shared/tsdown.client.ts` bundle preset.
