# dsh-user-scope

English | [中文](README.zh.md)

`@ningbainb/dsh-user-scope` is the shared host-side authority for local
profile identity, paired-device principals, Workspace grants, and
Session ownership. It is intentionally UI-free so remote access, personal
Prompt, memory, and future profile features use one authorization model.

The service listens to the official `SessionStore` lifecycle and rebuilds
ownership for already-live sessions from the public `WorkspaceRegistry`
projection; the memory plugin is not responsible for authorization writes.

Persistent state is kept below `DSH_HOME/user-scope/` in private JSON files.
Writes use the official atomic-write and file-lock SDKs. Unknown newer schema
versions fail closed and are never rewritten by this package.

## Security model

Local identity is an opaque random UUID-backed principal persisted in the
current DSH profile. A remote device receives a separate paired principal;
the client cannot select or submit its principal, owner, or grants. Remote
Session access requires an active device binding, matching owner, and the
corresponding Workspace grant when a Workspace is present. Local desktop
access remains the administrative profile view.

Local desktop workspace access also checks actual registrations in the official WorkspaceRegistry, covering session creation before workspace attachment. This applies only to the current local principal; unknown workspaces, unavailable registries and remote devices retain the existing denial rules, and remote devices still require explicit grants.
