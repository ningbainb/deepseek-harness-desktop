/**
 * Reviewed Git for Windows release metadata.
 *
 * Source: the official `Filename | SHA-256` table published in the
 * git-for-windows/git v2.55.0.windows.5 release notes, reviewed on
 * 2026-08-21. These archive checksums are intentionally copied from that
 * release table, not from a GitHub API asset-digest field. The cmd/git.exe
 * SHA-256 and byte counts were measured from the exact downloaded ZIP after
 * it matched the official release-table checksum.
 *
 * The MinGit ZIPs intentionally have no enclosing directory. `.` is the
 * explicit archive-root sentinel accepted by managed-git.mjs; it is never a
 * filesystem path and extraction remains rooted in Desktop-owned staging.
 */
export const MANAGED_GIT_MANIFEST = {
  schemaVersion: 1,
  releases: [
    {
      id: 'mingit-2.55.0-windows.5-x64',
      platform: 'win32',
      arch: 'x64',
      version: '2.55.0.windows.5',
      archive: {
        format: 'zip',
        url: 'https://github.com/git-for-windows/git/releases/download/v2.55.0.windows.5/MinGit-2.55.0.5-64-bit.zip',
        sha256: '56d7b226b7693196cfc71fef26568f536c4a021ab6c37ff2db4287bed908e96e',
        bytes: 38_989_688,
        rootDirectory: '.',
      },
      git: {
        executablePath: 'cmd/git.exe',
        sha256: '78211c7ed73988da93a6d8a33d47ec6187f464d7ea2a9a00c182bbd7a1ecf30f',
        bytes: 43_352,
      },
    },
    {
      id: 'mingit-2.55.0-windows.5-arm64',
      platform: 'win32',
      arch: 'arm64',
      version: '2.55.0.windows.5',
      archive: {
        format: 'zip',
        url: 'https://github.com/git-for-windows/git/releases/download/v2.55.0.windows.5/MinGit-2.55.0.5-arm64.zip',
        sha256: '05843f9d6e60306c3ab886799e2c67200caab921571f10512df3493049179ddb',
        bytes: 37_650_057,
        rootDirectory: '.',
      },
      git: {
        executablePath: 'cmd/git.exe',
        sha256: '84cef31be1641a8177a354f433e6511c6bb33cade924997dd5321e72367a184f',
        bytes: 43_208,
      },
    },
  ],
}
