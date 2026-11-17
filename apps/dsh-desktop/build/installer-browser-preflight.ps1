param(
  [Parameter(Mandatory = $true)][string] $InstallDirectory,
  [Parameter(Mandatory = $true)][string] $PreflightEntry,
  [Parameter(Mandatory = $true)][string] $ExpectedEntrySHA256,
  [Parameter(Mandatory = $true)][string] $ExpectedManifestSHA256,
  [string] $InstallRegistryKey = '',
  [string] $UninstallRegistryKey = '',
  [int] $InstallerProcessId = 0
)
$ErrorActionPreference = 'Stop'
function Assert-PlainPath([string] $path) {
  $ancestor = [IO.Path]::GetFullPath($path)
  while ($ancestor) {
    if (Test-Path -LiteralPath $ancestor) {
      $item = Get-Item -LiteralPath $ancestor -Force
      if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'browser preflight path contains a link' }
    }
    $ancestor = [IO.Path]::GetDirectoryName($ancestor)
  }
}
function File-Digest([string] $path) {
  $stream = [IO.File]::OpenRead($path); $hash = [Security.Cryptography.SHA256]::Create()
  try { ([BitConverter]::ToString($hash.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
  finally { $hash.Dispose(); $stream.Dispose() }
}
function Quote-Argument([string] $value) {
  if ($value.Contains('"') -or $value.EndsWith('\')) { throw 'invalid browser preflight argument' }
  '"' + $value + '"'
}
try {
  # Match the install roots the existing cleanup phase may stop/move, without changing registry or files.
  $roots = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  [void] $roots.Add([IO.Path]::GetFullPath($InstallDirectory))
  foreach ($hive in @('HKEY_CURRENT_USER', 'HKEY_LOCAL_MACHINE')) {
    foreach ($key in @($InstallRegistryKey, $UninstallRegistryKey)) {
      if (-not $key) { continue }
      $state = Get-ItemProperty -LiteralPath "Registry::$hive\$key" -ErrorAction SilentlyContinue
      if ($state.InstallLocation -and [IO.Path]::IsPathRooted($state.InstallLocation)) { [void] $roots.Add([IO.Path]::GetFullPath($state.InstallLocation)) }
      if ($state.UninstallString -match '^\s*"([^"]+Uninstall DeepSeek Harness Desktop\.exe)"') { [void] $roots.Add([IO.Path]::GetDirectoryName($Matches[1])) }
    }
  }
  $existing = @($roots | Where-Object { Test-Path -LiteralPath (Join-Path $_ 'DeepSeek Harness Desktop.exe') -PathType Leaf })
  if (-not $existing.Count) { Write-Output 'browser-preflight-skipped fresh-install'; exit 0 }
  foreach ($root in $existing) {
    Assert-PlainPath $root
    if (-not (Test-Path -LiteralPath (Join-Path $root 'resources\update-shutdown-v1') -PathType Leaf)) { throw 'browser preflight cannot verify existing desktop install identity' }
  }
  Assert-PlainPath $PreflightEntry
  $manifest = Join-Path ([IO.Path]::GetDirectoryName([IO.Path]::GetDirectoryName($PreflightEntry))) 'runtime-support\browser-component.json'
  Assert-PlainPath $manifest
  if ($ExpectedEntrySHA256 -cnotmatch '^[a-f0-9]{64}$' -or $ExpectedManifestSHA256 -cnotmatch '^[a-f0-9]{64}$' -or
      (File-Digest $PreflightEntry) -cne $ExpectedEntrySHA256 -or (File-Digest $manifest) -cne $ExpectedManifestSHA256) { throw 'browser preflight helper integrity mismatch' }
  $desktopHome = $env:DSH_HOME
  if (-not $desktopHome) {
    $userData = if ($env:DSH_DESKTOP_USER_DATA) { $env:DSH_DESKTOP_USER_DATA } else { Join-Path $env:APPDATA 'DeepSeek Harness Desktop' }
    if (-not [IO.Path]::IsPathRooted($userData)) { throw 'browser preflight userData must be absolute' }
    Assert-PlainPath $userData
    $location = Join-Path $userData 'desktop-data-location.json'
    if (Test-Path -LiteralPath $location) {
      Assert-PlainPath $location
      try { $saved = Get-Content -LiteralPath $location -Raw -Encoding UTF8 | ConvertFrom-Json } catch { throw 'invalid persisted browser preflight Home location' }
      if ($saved.schemaVersion -ne 1 -or $saved.owner -cne 'deepseek-harness-community-desktop' -or $saved.home -isnot [string]) { throw 'invalid persisted browser preflight Home location' }
      $desktopHome = $saved.home
    } else { $desktopHome = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.dsh-community' }
  }
  if (-not [IO.Path]::IsPathRooted($desktopHome)) { throw 'browser preflight Home must be absolute' }
  Assert-PlainPath $desktopHome
  $desktopHome = [IO.Path]::GetFullPath($desktopHome).TrimEnd([char[]]@('\', '/'))
  $resourcePaths = @($desktopHome)
  if ($env:DSH_DESKTOP_BROWSER_COMPONENT_ROOT) { $resourcePaths += $env:DSH_DESKTOP_BROWSER_COMPONENT_ROOT }
  if ($env:DSH_DESKTOP_BROWSER_COMPONENT_CACHE) { $resourcePaths += $env:DSH_DESKTOP_BROWSER_COMPONENT_CACHE }
  foreach ($resource in $resourcePaths) {
    if (-not [IO.Path]::IsPathRooted($resource)) { throw 'browser component override must be absolute' }
    $candidate = [IO.Path]::GetFullPath($resource).TrimEnd([char[]]@('\', '/'))
    Assert-PlainPath $candidate
    foreach ($root in $existing) {
      $program = $root.TrimEnd([char[]]@('\', '/'))
      if ($candidate.Equals($program, [StringComparison]::OrdinalIgnoreCase) -or
          $candidate.StartsWith($program + '\', [StringComparison]::OrdinalIgnoreCase) -or
          $program.StartsWith($candidate + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'browser preflight Home/resources overlap the old program directory' }
    }
  }
  # The Node helper validates the profile contract before writing only component/cache resources.
  $carrier = Join-Path $existing[0] 'DeepSeek Harness Desktop.exe'
  Assert-PlainPath $carrier
  $start = [Diagnostics.ProcessStartInfo]::new()
  $start.FileName = $carrier
  $arguments = @((Quote-Argument $PreflightEntry), (Quote-Argument ("--home=" + $desktopHome)))
  if ($InstallerProcessId -gt 0) { $arguments += "--parent-pid=$InstallerProcessId" }
  $start.Arguments = $arguments -join ' '
  $start.WorkingDirectory = [IO.Path]::GetDirectoryName($PreflightEntry)
  $start.UseShellExecute = $false; $start.CreateNoWindow = $true
  $start.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
  $start.RedirectStandardOutput = $true; $start.RedirectStandardError = $true
  $start.EnvironmentVariables['ELECTRON_RUN_AS_NODE'] = '1'
  $start.EnvironmentVariables.Remove('NODE_OPTIONS'); $start.EnvironmentVariables.Remove('NODE_PATH')
  $process = [Diagnostics.Process]::new(); $process.StartInfo = $start
  try {
    [void] $process.Start()
    $stdout = $process.StandardOutput.ReadToEndAsync(); $stderr = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    Write-Output $stdout.Result
    if ($process.ExitCode -ne 0) { throw "browser component preparation failed before changing old installation: $($stderr.Result)" }
  } finally { $process.Dispose() }
  Write-Output 'browser-preflight-validated-before-shutdown'
  exit 0
} catch {
  Write-Output "browser-preflight-failed: $($_.Exception.Message). Existing program and profile have not been replaced. Verify DSH_HOME points to the existing desktop Home and retry."
  exit 37
}
