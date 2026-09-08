# `@ningbainb/dsh-personal-prompt`

English | [中文](README.zh.md)

Owner-safe Personal Prompt profiles for DeepSeek Harness.

The package stores a versioned `personal-prompt` settings namespace and contributes one official `SystemPrompt.section` plus the matching `SystemPrompt.variable`. Effective profiles resolve in fixed order: `session` > `workspace` > `global`. The first UI exposes global and workspace profiles; session scope remains in the schema for forward compatibility.

Prompt content is user data, not a tool or policy definition. It is wrapped in a `<user_preferences>` boundary, capped at 8,000 model-visible characters, and never written to diagnostics. A missing or corrupt settings value, unknown session scope, unavailable user-scope service, or non-local session owner degrades to no Personal Prompt while the agent continues normally.

The persisted settings value follows the schema in `src/core/config.ts`. For
example, a global profile is represented as:

```json
{
  "version": 1,
  "enabled": true,
  "activeProfileId": "writing",
  "profiles": [
    {
      "id": "writing",
      "name": "Writing preference",
      "content": "Answer in concise English.",
      "enabled": true,
      "scope": "global",
      "updatedAt": 1788796800000
    }
  ]
}
```

Workspace profiles require `workspaceId`; session profiles require `sessionId`.
An omitted `version` is accepted only while reading the legacy settings shape
and is normalized to version 1 before use. Persistence uses strict version 1
validation. Resolution first chooses the most specific matching scope, then the
active profile in that scope when present, otherwise the newest enabled profile
with a stable ID tie-break. A language or style preference is model context, not
a guarantee that the selected Provider will follow it.
