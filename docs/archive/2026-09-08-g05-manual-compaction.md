# G05.4 manual compaction recovery evidence

Date: 2026-09-08.

## Scope

The Desktop base profile already mounts the official
`@deepseek-ai/dsh-compaction-basic` engine and
`@deepseek-ai/dsh-command-compact` command. This work adds behavioral evidence
for the G05.4 recovery contract instead of treating package presence or a
documentation paragraph as proof that compaction is safe.

The focused test imports only published official NPM SDK packages. It does not
copy or modify DeepSeek Harness source, edit a persisted Session database, or
simulate compaction by deleting messages.

## Transaction scenario

`apps/dsh-desktop/test/manual-compaction.test.mjs` composes the official Cordis
Context, SessionStore, TokenMeter, BasicCompactionEngine, and compaction
contract. Its Session contains two completed turns and a model-visible tool
call/result pair. Large deterministic text blocks ensure the replacement
checkpoint is measurably smaller than the selected history.

The scenario then verifies:

1. The cut after the tool-call message is unbalanced and the cut after its
   result is balanced before compaction.
2. The first manual summary attempt fails deliberately. The engine reports
   `ManualCompactionError` with code `summary`, closes the failed attempt in the
   append-only log, leaves the visible surface unchanged, and preserves every
   original event byte-for-byte.
3. A second `compactNow` call succeeds without rebuilding the Session. Its
   shadowed sequence list contains both the tool call and its result, but not
   the retained recent tail.
4. The replacement message has official compact-checkpoint provenance, every
   remaining surface cut is tool-pairing balanced, and all original source
   events remain readable at their original sequence numbers.
5. A third user/assistant turn appends successfully after compaction and appears
   at the end of the derived message history.

## Command feedback

The same test registers the official `/compact` command contribution and checks
the user-facing outcomes for invalid arguments, no compactable history,
successful replacement, retryable summary failure, a busy agent, and caller
cancellation. The successful response cites the summary event sequence; the
summary-failure response states that the conversation is unchanged and the
attempt remains in the Session log.

Together with the existing Desktop profile test, this covers both halves of the
entry point: the command is mounted in the common profile and its public engine
and feedback contracts execute as documented.

## Dependency and resource record

Desktop now declares direct ownership of the exact official packages exercised
by this acceptance: `@deepseek-ai/cordis@4.0.1` plus
`@deepseek-ai/dsh-command-compact`, `@deepseek-ai/dsh-compaction-basic`, and
`@deepseek-ai/dsh-token-meter` at `0.1.1-rc.1`. These exact versions were
already present transitively in the lockfile and virtual store through the
official base bundle. The install recorded zero downloads and no lifecycle
scripts ran, so this adds no new package version or external implementation.

The official compaction packages are MIT licensed. Desktop continues to use
their public exports and does not vendor their implementation.

## Result and remaining boundary

Both focused Node tests passed. They establish deterministic failure, retry,
tool-pair integrity, append-only history retention, continuation, and command
feedback without requiring a production model credential.

A credentialed Provider acceptance is still needed to judge the semantic
quality of a real generated summary. This test deliberately does not claim that
an LLM summary is lossless; it proves that the official transaction keeps the
source log and exposes a recoverable failure when summarization is unusable.
