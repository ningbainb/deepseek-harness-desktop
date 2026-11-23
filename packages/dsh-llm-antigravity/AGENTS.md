# Antigravity CLI provider rules

Keep credential handling inside the official Antigravity CLI process. Use its public command and protocol surfaces. The provider must not open credential files, call Google-internal endpoints, or pass prompts as shell commands.

Treat provider-native tool traffic as a protocol failure. DSH tool calls must come from validated bridge messages and enter the standard DSH approval and execution loop.

Use the mock CLI for automated tests. Keep live smoke prompts synthetic and avoid consuming a subscription in automated tests.
