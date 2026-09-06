# dsh-user-scope package rules

- This is a host-only shared service. Keep identity, authorization, and
  persistence logic independent from UI packages.
- Use opaque random principal identifiers. Never derive an identifier from a
  username, email address, workspace path, or machine name.
- Persistent documents are user-private. All writes go through
  `@deepseek-ai/dsh-atomic-write` and `withFileLock`; an unknown newer schema
  version must fail closed and must never be overwritten.
- The service is the shared authority for later remote isolation, personal
  prompt, and memory features. Do not duplicate ownership rules in those
  consumers.
