param(
  [switch] $PreflightOnly,
  [string] $ConfirmDisposableMachine = '',
  [string] $OldInstaller = '',
  [string] $OldSha256 = '',
  [string] $OldVersion = '3.3.0',
  [string] $NewInstaller = '',
  [string] $NewSha256 = '',
  [string] $NewVersion = '3.4.0',
  [string] $SessionFixtureDirectory = ''
)

# Execute only in a disposable Windows VM/test machine. A different /D path
# does NOT isolate NSIS uninstall keys, shortcuts or protocol associations.
# This does not inject failures or claim rollback / conversation UI acceptance.
$ErrorActionPreference = 'Stop'
function Read-ProductRegistrations {
  foreach ($base in @(
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'
  )) {
    if (Test-Path -LiteralPath $base) {
      Get-ChildItem -LiteralPath $base | ForEach-Object {
        $entry = Get-ItemProperty -LiteralPath $_.PSPath
        if ($entry.DisplayName -like '*DeepSeek Harness Desktop*') { $entry }
      }
    }
  }
}
$existing = @(Read-ProductRegistrations)
$defaultHomeExists = Test-Path -LiteralPath (Join-Path $env:USERPROFILE '.dsh')
$active = @(Get-Process -Name 'DeepSeek Harness Desktop' -ErrorAction SilentlyContinue)
$preflight = [ordered]@{
  machine = $env:COMPUTERNAME
  existingInstallCount = $existing.Count
  defaultHomeExists = $defaultHomeExists
  activeApplicationCount = $active.Count
  readyForDisposableTest = ($existing.Count -eq 0 -and -not $defaultHomeExists -and $active.Count -eq 0)
}
if ($PreflightOnly) { $preflight | ConvertTo-Json; exit 0 }
if ($ConfirmDisposableMachine -cne $env:COMPUTERNAME -or [string]::IsNullOrWhiteSpace($ConfirmDisposableMachine)) {
  throw 'Refusing installation: explicitly confirm the disposable Windows machine name.'
}
if (-not $preflight.readyForDisposableTest) { throw 'Refusing installation: this account has DSH data, an installation or a running app. Use a clean disposable VM.' }
function Verified-Installer([string] $path, [string] $expected) {
  if ($expected -notmatch '^[a-fA-F0-9]{64}$') { throw 'An independently verified installer SHA256 is required.' }
  $resolved = (Resolve-Path -LiteralPath $path).ProviderPath
  if ([IO.Path]::GetExtension($resolved) -ine '.exe') { throw 'Expected an actual Windows installer executable.' }
  if ((Get-FileHash -LiteralPath $resolved -Algorithm SHA256).Hash -ine $expected) { throw 'Installer hash mismatch.' }
  return $resolved
}
$oldPath = Verified-Installer $OldInstaller $OldSha256
$newPath = Verified-Installer $NewInstaller $NewSha256
$fixture = (Resolve-Path -LiteralPath $SessionFixtureDirectory).ProviderPath
if (-not (Test-Path -LiteralPath $fixture -PathType Container)) { throw 'Provide a session-directory fixture, not a live Home.' }
$fixtureFiles = @(Get-ChildItem -LiteralPath $fixture -Recurse -File)
if ($fixtureFiles.Count -eq 0) { throw 'An empty fixture cannot prove conversation-file preservation.' }
if (-not ($fixtureFiles | Where-Object Name -Match '^session(?:\.v\d+)?\.jsonl(?:\.zstd)?$')) { throw 'The fixture must contain an actual session log; an arbitrary sentinel file is not conversation evidence.' }
if (@(Get-Item -LiteralPath $fixture; Get-ChildItem -LiteralPath $fixture -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Where({ $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) {
  throw 'Fixture links are not allowed.'
}
$root = Join-Path ([IO.Path]::GetTempPath()) ('dsh-real-overlay-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
$install = Join-Path $root "用户's Desktop"
$isolatedHome = Join-Path $root 'dsh-home'
$sessions = Join-Path $isolatedHome 'sessions'
$testTemp = Join-Path $root '张律师 临时'
New-Item -ItemType Directory -Path $sessions, $testTemp | Out-Null
$reportPath = Join-Path $root 'overlay-result.json'
$report = [ordered]@{ complete = $false; installerOverlayPassed = $false; conversationUiVerified = $false; rollbackVerified = $false; oldVersion = $OldVersion; newVersion = $NewVersion; steps = @(); remaining = @('Open the retained conversation in the new UI', 'Production-installer failure and rollback scenario') }
function Save-Report { $report | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $reportPath -Encoding UTF8 }
function Run-Installer([string] $path, [string] $label) {
  $started = [Diagnostics.Stopwatch]::StartNew()
  $process = Start-Process -FilePath $path -ArgumentList @('/S', "/D=$install") -WindowStyle Hidden -PassThru
  if (-not $process.WaitForExit(600000)) { throw "$label exceeded ten minutes; installer left untouched for diagnosis. Do not delete the test directory." }
  $process.Refresh()
  $report.steps += [ordered]@{ stage = $label; exitCode = $process.ExitCode; durationMs = $started.ElapsedMilliseconds }
  Save-Report
  if ($process.ExitCode -ne 0) { throw "$label installer failed: $($process.ExitCode)" }
}
function Assert-Installed([string] $expectedVersion) {
  $exe = Join-Path $install 'DeepSeek Harness Desktop.exe'
  $archive = Join-Path $install 'resources\app.asar'
  if (-not (Test-Path -LiteralPath $exe) -or -not (Test-Path -LiteralPath $archive)) { throw 'Installed payload is incomplete.' }
  $version = (Get-Item -LiteralPath $exe).VersionInfo.ProductVersion
  if ($version -ne $expectedVersion -and $version -ne "$expectedVersion.0") { throw "Unexpected installed executable version: $version" }
  $registrations = @(Read-ProductRegistrations | Where-Object {
    $_.InstallLocation -and [IO.Path]::GetFullPath($_.InstallLocation).TrimEnd('\') -ieq $install.TrimEnd('\')
  })
  if ($registrations.Count -ne 1 -or $registrations[0].DisplayVersion -ne $expectedVersion) { throw 'Uninstall registration did not match the installed version and directory.' }
  return (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
}
$savedEnvironment = @{}
foreach ($name in @('TEMP', 'TMP', 'DSH_HOME', 'DSH_DESKTOP_USER_DATA', 'DSH_DESKTOP_DISABLE_UPDATES', 'DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION')) {
  $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
try {
  $env:TEMP = $testTemp; $env:TMP = $testTemp
  $env:DSH_HOME = $isolatedHome
  $env:DSH_DESKTOP_USER_DATA = Join-Path $root 'user-data'
  $env:DSH_DESKTOP_DISABLE_UPDATES = '1'
  $env:DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION = '1'
  Run-Installer $oldPath 'old-install'
  $report.oldArchiveSha256 = Assert-Installed $OldVersion
  $hashes = @{}
  foreach ($file in $fixtureFiles) {
    $relative = $file.FullName.Substring($fixture.TrimEnd('\').Length).TrimStart('\')
    $destination = Join-Path $sessions $relative
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $destination
    $hashes[$relative] = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash
  }
  Run-Installer $newPath 'full-overlay'
  $report.newArchiveSha256 = Assert-Installed $NewVersion
  if ($report.oldArchiveSha256 -eq $report.newArchiveSha256) { throw 'The archive was not replaced.' }
  foreach ($relative in $hashes.Keys) {
    if ((Get-FileHash -LiteralPath (Join-Path $sessions $relative) -Algorithm SHA256).Hash -ne $hashes[$relative]) { throw 'A retained session file changed during installation.' }
    if ((Get-FileHash -LiteralPath (Join-Path $fixture $relative) -Algorithm SHA256).Hash -ne $hashes[$relative]) { throw 'The source fixture changed.' }
  }
  $report.retainedSessionFileCount = $hashes.Count
  $report.installerOverlayPassed = $true
  Write-Output 'Actual old-to-new installer overlay passed; UI recovery and rollback are NOT yet verified.'
} catch {
  $report.failure = $_.Exception.Message
  throw
} finally {
  Save-Report
  foreach ($name in $savedEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process') }
  Write-Output "Evidence retained: $reportPath"
  # No automatic uninstall, directory deletion, registration repair or restart.
}
