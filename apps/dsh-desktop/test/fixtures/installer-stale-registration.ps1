param([string] $Helper, [string] $Root)
$ErrorActionPreference = 'Stop'
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($Helper, [ref] $tokens, [ref] $errors)
if ($errors.Count) { throw 'helper parse failure' }
foreach ($definition in $ast.FindAll({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] }, $false)) { Invoke-Expression $definition.Extent.Text }
Add-Type 'public class DeniedUninstallParent { public object OpenSubKey(string name) { throw new System.UnauthorizedAccessException(); } }'
if ($null -ne (Get-LegacyUninstallState ([DeniedUninstallParent]::new()) 'unrelated')) { throw 'unreadable unrelated entry was not ignored' }
$normalizedInstallDirectory = Get-NormalizedPath (Join-Path $Root 'application')
$namespace = "Software\DeepSeekHarnessDesktopTests\stale-$([Guid]::NewGuid().ToString('N'))"
$base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, [Microsoft.Win32.RegistryView]::Registry64)
try {
  $empty = $base.CreateSubKey("$namespace\Empty"); $empty.Dispose()
  $entry = [pscustomobject]@{ Hive = 'CurrentUser'; View = 'Registry64'; SubKey = "$namespace\Empty" }
  if ($null -ne (Get-RegistryState $entry)) { throw 'empty registry key is treated as installed' }
  function Invoke-UnexpectedRegistryDelete { throw 'empty tombstone triggered a registry mutation' }
  $registryExecutable = 'Invoke-UnexpectedRegistryDelete'
  Remove-RegistryEntries @($entry)
  $key = $base.OpenSubKey($entry.SubKey, $true); $key.SetValue('DisplayVersion', 'old'); $key.Dispose()
  if ($null -eq (Get-RegistryState $entry)) { throw 'nonempty unknown state was ignored' }
  $resources = New-Item -ItemType Directory -Path (Join-Path $normalizedInstallDirectory 'resources') -Force
  [IO.File]::WriteAllText((Join-Path $resources.FullName 'update-shutdown-v1'), 'owned')
  foreach ($name in @('owned', 'foreign-path', 'foreign-name', 'foreign-executable', 'conflicting-location')) {
    $key = $base.CreateSubKey("$namespace\Uninstall\$name")
    $display = if ($name -eq 'foreign-name') { 'Other Application' } else { 'DeepSeek Harness Desktop 4.0.0-rc.2' }
    $directory = if ($name -eq 'foreign-path') { Join-Path $Root 'another-install' } else { $normalizedInstallDirectory }
    $exe = if ($name -eq 'foreign-executable') { 'Other.exe' } else { 'Uninstall DeepSeek Harness Desktop.exe' }
    $key.SetValue('DisplayName', $display)
    $key.SetValue('UninstallString', ('"' + (Join-Path $directory $exe) + '" /currentuser'))
    if ($name -eq 'conflicting-location') { $key.SetValue('InstallLocation', (Join-Path $Root 'foreign')) }
    $key.Dispose()
  }
  $hive = [pscustomobject]@{ Provider = 'HKEY_CURRENT_USER'; Hive = 'CurrentUser'; Command = 'HKCU' }
  $entries = @(Get-LegacyUninstallEntries $hive 'Registry64' "$namespace\Uninstall")
  if ($entries.Count -ne 1 -or -not $entries[0].SubKey.EndsWith('\owned')) { throw 'legacy alias ownership mismatch' }
  $script:ownedEntries = $entries
  function Get-RegistryEntries { $script:ownedEntries }
  $InstallRegistryKey = "$namespace\Install"
  $UninstallRegistryKey = "$namespace\Uninstall\current"
  $transactionId = Get-TransactionId $normalizedInstallDirectory
  $transactionTemp = Get-NormalizedPath ([IO.Path]::GetTempPath())
  $legacyTransactionRoot = Join-Path $Root 'unused-legacy-journal'
  $transactionRoot = Join-Path $Root 'active-journal'
  $journalPath = Join-Path $transactionRoot 'transaction.json'
  $registryExecutable = Join-Path $env:SystemRoot 'System32\reg.exe'
  $mainExecutableName = 'DeepSeek Harness Desktop.exe'
  $appArchiveRelativePath = 'resources\app.asar'
  [IO.File]::WriteAllText((Join-Path $normalizedInstallDirectory $mainExecutableName), 'old')
  [IO.File]::WriteAllText((Join-Path $normalizedInstallDirectory $appArchiveRelativePath), 'old')
  Begin-Transaction | Out-Null
  $key = $base.OpenSubKey("$namespace\Uninstall\owned")
  if ($null -ne $key) { $key.Dispose(); throw 'old alias could still invoke new uninstaller' }
  Invoke-Rollback (Read-Journal) | Out-Null
  $key = $base.OpenSubKey("$namespace\Uninstall\owned")
  if ($null -eq $key) { throw 'rollback did not restore historical uninstall alias' }
  try { if ($key.GetValue('DisplayName') -ne 'DeepSeek Harness Desktop 4.0.0-rc.2') { throw 'rollback changed alias identity' } } finally { $key.Dispose() }
  foreach ($name in @('foreign-path', 'foreign-name', 'foreign-executable', 'conflicting-location')) {
    $key = $base.OpenSubKey("$namespace\Uninstall\$name")
    if ($null -eq $key) { throw 'foreign registration removed' }
    $key.Dispose()
  }
  Write-Output 'PASS stale-registration'
} finally {
  if ($namespace -notmatch '^Software\\DeepSeekHarnessDesktopTests\\stale-[a-f0-9]{32}$') { throw 'unsafe registry test namespace' }
  $base.DeleteSubKeyTree($namespace, $false); $base.Dispose()
}
