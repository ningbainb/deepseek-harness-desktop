/**
 * Installer-click telemetry was retired for the 3.0 public site.
 *
 * The inert export keeps historical static tooling and any old local import
 * from failing while guaranteeing that no click can produce a network upload.
 */
export function reportInstallerDownloadClick() {
  return false
}
