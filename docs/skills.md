# Desktop skills

DeepSeek Harness Desktop discovers local Agent Skills and exposes them in Extension Dock and the composer Skills menu. The implementation contract is [extensions/skills.mjs](../apps/dsh-desktop/src/extensions/skills.mjs); the external compatibility reference is the [Agent Skills specification](https://agentskills.io/specification).

## Minimal skill

Create a real directory named `review-notes` with this `SKILL.md` file:

```markdown
---
name: review-notes
description: Review meeting notes and extract decisions and follow-up work. Use when the user asks to review notes.
---

# Instructions

Read the notes, separate decisions from proposals, and list owners only when the source names them.
```

The current Desktop parser requires YAML frontmatter, a `name` made of lowercase ASCII letters, digits, and single hyphen separators, and a non-empty string `description`. A Chinese description such as `description: 整理会议纪要并提取待办` is valid.

Examples rejected by the current parser include `name: ReviewNotes`, `name: -review`, `name: review--notes`, a missing frontmatter block, and an empty `description`. The Skills inventory displays the rejection reason; correct the named file and rescan.

## Discovery roots and precedence

Desktop scans roots from highest to lowest precedence:

| Order | Source label | Directory |
| --- | --- | --- |
| 1 | `project-dsh` | `<project>/.dsh/skills` |
| 2 | `project-agents` | `<project>/.agents/skills` |
| 3 | `custom` | Configured custom skill directories, in configuration order |
| 4 | `user-dsh` | `<DSH_HOME>/skills`, normally `~/.dsh/skills` |
| 5 | `user-agents` | `<DSH_AGENTS_HOME>/skills`, or `~/.agents/skills` when the variable is unset |

Each real child directory is expected to contain `SKILL.md`; a top-level Markdown file is also accepted as a legacy candidate. If multiple valid entries declare the same `name`, the first root in the table wins and lower-precedence copies are reported as shadowed. Rename the duplicate or remove it from the lower-precedence root to make that copy active.

## Import and symbolic links

Use Extension Dock to select and import the real directory that directly contains `SKILL.md`. Import validates the complete bundle, copies it into `<DSH_HOME>/skills/<name>`, and refuses to overwrite an existing destination.

Discovery does not follow a top-level file, directory junction, or symbolic link in a skill root; the inventory reports that the link was ignored. Copy or import the content into a real child directory instead. Import separately rejects a symbolic link anywhere inside the selected bundle because following it would make the copied content and size boundary ambiguous. These are two distinct checks: discovery ignores linked candidates, while import rejects linked bundle content.

## Specification compatibility

The Agent Skills specification additionally requires `name` to be at most 64 characters and equal the parent directory name, limits `description` to 1024 characters, and defines optional metadata fields. Desktop does not currently enforce those length, directory-name, or optional-field constraints. Authors should follow them for portability, but Desktop keeps existing locally valid skills readable until a compatibility migration is designed; the UI does not claim that current acceptance proves full specification conformance.

## Diagnostics

The inventory reports unreadable roots, missing `SKILL.md`, invalid frontmatter, ignored links, and duplicate-name shadowing. The main composer receives only bounded error summaries and not local diagnostic paths. A visible skill with a valid entry remains usable when another candidate fails; fix the reported candidate and reopen or refresh the inventory to rescan.
