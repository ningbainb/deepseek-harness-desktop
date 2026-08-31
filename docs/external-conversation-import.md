# External Conversation Import (V2)

## 1. Architecture Overview

DeepSeek Harness provides an external conversation import subsystem that scans, extracts, redacts, and reconstructs full conversational history from external AI programming assistants (Codex and Claude Code) into legitimate DeepSeek Harness workspaces and sessions.

The architecture consists of the following components:

- **Adapters (CodexAdapter, ClaudeCodeAdapter)**:
  - Discover local session logs and projects in standard user directories (~/.codex/sessions, ~/.codex/archived_sessions, and ~/.claude/projects).
  - Parse multiline and streaming JSONL logs while filtering out internal reasoning, world state, and telemetry.
  - Extract user messages, assistant messages, tool calls, tool results, and system contexts into the canonical ExternalConversationV2 model.
  - Automatically redact API keys, tokens, bearer headers, and private credentials.

- **Transcript Import Protocol (transcript-protocol.mjs)**:
  - Defines the schema and transaction model for historical event transformation.
  - Converts ExternalConversationV2 events into canonical DeepSeek Harness SessionEvent structures (turn/start, user/message, step/start, tool/call, tool/result, assistant/message, step/end, turn/end, session/end-seed).
  - Tags every historical event with { imported: true, historical: true, executable: false, importId, sourceKind, sourceEventId } to prevent unintentional re-execution.

- **Project Matcher (project-matcher.mjs)**:
  - Resolves canonical directory paths, Git repository roots, and commit revisions.
  - Compares original paths with current workspaces with four-tier priority:
    1. Exact canonical physical directory match;
    2. Git repository root match (including the common case where the source
       recorded an umbrella/launch directory above the currently opened repo);
    3. Git remote URL match;
    4. Explicit user directory selection.
  - Explicitly halts import when project directory is invalid or non-existent instead of creating corrupted workspaces.

- **Session Bridge (session-bridge.mjs)**:
  - Coordinates workspace creation/connection and session instantiation using official runtime interfaces (hostContext.workspaces, hostContext.sessions).
  - Injects historical seed events during session initialization.
  - Never directly mutates internal SQLite databases or generates fake fallback session identifiers.

- **Import Ledger Store (ledger.mjs)**:
  - Persists atomic import records with compound keys.
  - Guarantees idempotency and session reuse when source files have not changed.
  - Tracks import transaction lifecycles (in_progress, succeeded, failed) and supports resumption.

- **Folder-level batch workflow**:
  - The handoff window can use the native directory picker to select an arbitrary
    Claude Code data folder (normally `.claude`) and/or Codex data folder
    (normally `.codex`; live, legacy rollout, and `archived_sessions` trees are
    all included). The selected roots are retained in the main process and
    become the only additional safe-path boundaries for that import.
  - A batch preview groups every discovered source project by its recorded
    `cwd`, shows the target DSH path, and asks for a current directory only when
    the original folder no longer exists. Existing DSH workspaces at the same
    canonical path are reused; otherwise the official workspace registry creates
    one workspace.
  - Confirming a batch creates one independent DSH session per source session.
    The ledger makes retries idempotent, and per-session progress lets the UI
    continue after an individual file fails. Failed rows can be retried without
    re-importing successful rows.

---

## 2. ExternalConversationV2 Data Model

Canonical JSON Schema Structure:
- schemaVersion: external-conversation-v2
- source: { kind, sessionId, sourceFile, sourceFingerprint, importedAt }
- project: { displayName, originalCwd, gitRoot, gitBranch, gitRevision }
- conversation: { title, startedAt, endedAt, eventCount, visibleMessageCount, toolCallCount }
- events: Array of TranscriptEvent items:
  - eventId: Deterministic SHA-256 hash derived from sourceSessionId + sequence + sourceEventId
  - sequence: 1-indexed strictly monotonic positive integer
  - type: message | tool_call | tool_result | system
  - role: user | assistant | tool | system
  - content: Redacted text content (for message/system)
  - toolName, toolCallId, toolArgs: Function/tool metadata (for tool_call)
  - toolResult, toolStatus: Execution result and status (for tool_result)
  - historical: true
  - executable: false
  - timestampQuality: exact | inferred
  - sourceTimestamp: Epoch millisecond timestamp
  - sourceEventId: Original record identifier from source file

---

## 3. Security and Safety Boundaries

1. **No Historical Execution**:
   All imported tool calls and results are strictly tagged with historical: true and executable: false. The DeepSeek Harness runtime treats them as static conversation surface history and will not re-execute shell commands or file writes.

2. **No Reasoning Leakage**:
   Hidden chain-of-thought, internal reasoning traces, rollout telemetry, and world states from external engines are excluded during parsing and never imported into the DSH session surface.

3. **Strict Path Validation**:
   Path traversal attempts and non-existent directories are blocked. The system will prompt the user to pick an existing valid directory before any session creation can proceed.

4. **Credential Redaction**:
   All message contents, tool arguments, error messages, and command outputs pass through the regex-based Redactor pipeline, masking API keys (OpenAI, Anthropic, DeepSeek, GitHub tokens, AWS keys, Bearer tokens, private certificates).

5. **No Direct SQLite Mutation**:
   All workspace and session creation happens via public runtime service APIs (sessions.create, workspaces.create) or constructor seed options. Direct SQLite modifications are disallowed to ensure database consistency.

6. **Source folders are read-only**:
   Batch scanning and import only read files below the selected source roots;
   no source transcript, index, or configuration file is modified. Symlinks that
   resolve outside an approved root remain blocked by `assertSafePath`.

---

## 4. Runtime Compatibility and Known Capabilities

- **Seeded Session Instantiation**:
  The DeepSeek Harness session runtime (@deepseek-ai/dsh-session) accepts { seed: readonly SessionEvent[] } in CreateSessionOptions. All events before session/end-seed are seamlessly rendered on the user interface as historical turns.

- **Standalone Desktop Execution**:
  When running in host desktop mode, DSHSessionBridge invokes host Cordis context services to create workspaces and initialize seeded sessions. When host context is not connected, the bridge returns an explicit capability error without inventing fake session IDs.
