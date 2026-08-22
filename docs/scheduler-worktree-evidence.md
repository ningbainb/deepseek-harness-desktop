# Scheduler, worktree, and evidence safety

Task Board 3.0 runs durable automation through a constrained sequence: an opted-in background scheduler admits one run, a dedicated Git worktree isolates it, the Runtime Provider binds the session to that worktree, and a bounded Evidence record preserves the review facts.

## Execution sequence

1. Background automation starts only after the user enables it; a fully exited Desktop does not claim to run scheduled work.
2. Scheduler admission writes the durable running record before invoking an agent and uses a lease and execution key to prevent duplicate browser or Host execution.
3. Worktree execution creates or finds the selected worktree, registers that workspace with the Runtime Provider, creates a session, and verifies that the session CWD equals the worktree path.
4. Completion, failure, cancellation, and recovery create or update a bounded Evidence record with identifiers, revisions, changed-file metadata, diff source, provider capability evidence, and an audit summary.
5. Review owns merge, cleanup, or follow-up. Cancellation and recovery retain a worktree for review rather than silently deleting user changes.

## Boundaries

The scheduler is not a general shell runner and browser admission is not an authority to overwrite Host-owned execution. A missing provider capability, changed CWD, lost session, or missing registered worktree produces a blocked or cancelled review state instead of an automatic retry that creates a second run.

Evidence is a review record, not a transcript. It intentionally does not retain prompts, session history, assistant answers, tool results, credentials, or arbitrary unknown fields. Evidence shows what can be safely reviewed without turning the Task Board store into a copy of private project conversation content.

## Related guides

Use [background mode and scheduler](background-and-scheduler.md) for opt-in lifecycle and misfire behavior, [worktrees](worktrees.md) for isolation and cleanup rules, [task runs and evidence](task-runs-and-evidence.md) for the evidence model, and [Task Board v3](task-board-v3.md) for persistence and migration behavior.
