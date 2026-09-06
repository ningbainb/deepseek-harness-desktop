# Package Notes

- This package owns Personal Prompt profile validation, durable settings wiring, and the official `SystemPrompt` section/variable contribution.
- Prompt content is user data. Never include profile names, IDs, or content in logs, errors, or test output.
- Do not import from a DeepSeek Harness checkout. Use only the published SDK contracts and `@ningbainb/dsh-user-scope` for ownership checks.
- Keep the first UI limited to `global` and `workspace` profiles; retain `session` in the storage schema for forward compatibility.
