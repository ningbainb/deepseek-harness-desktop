# `@ningbainb/dsh-personal-prompt`

English | [中文](README.zh.md)

Owner-safe Personal Prompt profiles for DeepSeek Harness.

The package stores a versioned `personal-prompt` settings namespace and contributes one official `SystemPrompt.section` plus the matching `SystemPrompt.variable`. Effective profiles resolve in fixed order: `session` > `workspace` > `global`. The first UI exposes global and workspace profiles; session scope remains in the schema for forward compatibility.

Prompt content is user data, not a tool or policy definition. It is wrapped in a `<user_preferences>` boundary, capped at 8,000 model-visible characters, and never written to diagnostics. A missing or corrupt settings value, unknown session scope, unavailable user-scope service, or non-local session owner degrades to no Personal Prompt while the agent continues normally.
