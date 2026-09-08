# G01.3 packaged SSH relaunch evidence

Date: 2026-09-08.

## Scope

This record closes the locally executable SSH portion of G01.3. It verifies the
shipped Windows application rather than a browser-only component test. The
driver starts the repository's real `ssh2` protocol test server on
`127.0.0.1`, creates the host through the packaged GUI, exercises the WebSocket
PTY, exits the whole application, and repeats the connection from persisted
configuration.

The fixture uses an isolated OS home, Desktop user-data directory, DSH Home,
and agents directory. Its fixed test credential is never printed. No external
host, user account, or production credential is contacted.

## Packaged acceptance path

`apps/dsh-desktop/scripts/verify-packaged-ssh.mjs` performed this sequence
against `dist/win-unpacked/DeepSeek Harness Desktop.exe`:

1. Started an embedded password-authenticated SSH server bound only to
   `127.0.0.1`.
2. Started a clean packaged Desktop profile and waited for the injected
   `[data-dsh-ssh-entry]` surface.
3. Opened the SSH panel and confirmed that its BrowserWindow set did not
   change.
4. Created a host through the visible host form and completed the connection
   test.
5. Opened the SSH terminal, sent `__DSH_SSH_FIRST__`, and observed the same
   marker in the xterm output.
6. Closed the entire application and verified that the host entry existed at
   the isolated `~/.dsh/dsh-ssh.json` with the expected public fields and a
   non-empty password-auth record.
7. Relaunched with the same isolated directories, found the host without
   recreating it, opened a fresh SSH transport, sent `__DSH_SSH_SECOND__`, and
   observed the echoed marker.

The final run passed. The server observed at least two independent transports,
so the second result was not a surviving renderer or connection from the first
application process.

## Supporting gates

- `dsh-ssh` typecheck passed.
- `dsh-ssh` passed 102 tests; one external real-sshd SFTP case remains skipped
  on Windows. The embedded server covers password and key authentication,
  commands, PTY, tunnel transport, connection isolation, and failure paths.
- The package build declaration pass completed. The ordinary tsdown invocation
  then hit the already-recorded missing optional `unrun` loader; invoking the
  same shared `shared/tsdown.client.ts` configuration with tsdown's native
  config loader completed both host and client bundles without installing a
  dependency or changing the lockfile for this work.
- The new packaged check is available as `pnpm --dir apps/dsh-desktop
  test:ssh:e2e` and is included in the full Desktop regression list.

## Boundary

This is real SSH protocol and PTY evidence over loopback, not an assertion
about a particular external server, firewall, VPN, jump host, or production
credential. The separate packaged PowerShell terminal check remains the
evidence for hidden Windows console subprocess behavior. Together the two
checks cover the G01.3 distinction between hidden child processes and visible
embedded terminal surfaces.
