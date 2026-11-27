# Workspace checkpoints

English | [中文](README.zh.md)

`@ningbainb/dsh-checkpoints` records workspace file changes made during agent turns. Open **View changes** below a changed turn to inspect the patch side by side or as a unified diff. Choose individual files or the complete change set, review the effect on the current workspace, and confirm in the desktop dialog. The restore saves a separate undo checkpoint before changing files.

The Desktop profile mounts the plugin through `cordis.patch.yml`. It uses Desktop's verified bundled or managed Git when available, with an absolute system Git executable as fallback. System Git must support SHA-256 repositories. Checkpoint operations stay unavailable when a compatible executable is unavailable. Syntax highlighting is loaded when opening a text diff. A built-in text view remains available if the renderer cannot load.

Each authorized workspace uses a separate Git object store and index under `<DSH_HOME>/checkpoints/`. Checkpoints use a separate history from the project's Git branches, commits and staging area. Coverage excludes nested repositories, symbolic links, dependency and build directories, protected credential files, and files above the configured size limit. Restore applies only the reviewed paths. A change to the reviewed workspace state requires a new preview.

Capture follows explicitly registered Desktop workspaces. Restoration requires the local owner's session and workspace access, an idle workspace, and one native confirmation for the exact preview. The plugin rechecks access before each restoration write. Approved MCP App writes and ACP prompts attached to the workspace contribute checkpoints through the same local service.

See the [third-party notices](NOTICE.md) for the render dependency and reference implementations.
