param([string] $Helper, [string] $Root, [string] $Scenario)

$ErrorActionPreference = 'Stop'
$parseTokens = $null
$parseErrors = $null
$syntax = [Management.Automation.Language.Parser]::ParseFile($Helper, [ref] $parseTokens, [ref] $parseErrors)
if ($parseErrors.Count -ne 0) { throw 'production helper does not parse' }
foreach ($definition in $syntax.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] }, $false)) {
  Invoke-Expression $definition.Extent.Text
}
$script:productionRegistryState = ${function:Get-RegistryState}
$normalizedInstallDirectory = Get-NormalizedPath (Join-Path $Root 'application')
$namespace = "Software\DeepSeekHarnessDesktopTests\rollback-$([Guid]::NewGuid().ToString('N'))"
$InstallRegistryKey = "$namespace\UserInstall"
$UninstallRegistryKey = "$namespace\UserUninstall"
$transactionId = Get-TransactionId $normalizedInstallDirectory
$transactionTemp = Get-NormalizedPath ([IO.Path]::GetTempPath())
$legacyTransactionRoot = Join-Path $transactionTemp "dsh-desktop-installer-transaction-$transactionId"
$transactionRoot = Join-Path $transactionTemp "dsh-desktop-installer-active-$transactionId"
$journalPath = Join-Path $transactionRoot 'transaction.json'
$mainExecutableName = 'DeepSeek Harness Desktop.exe'
$appArchiveRelativePath = 'resources\app.asar'
$script:realRegistryExecutable = Join-Path $env:SystemRoot 'System32\reg.exe'
$registryExecutable = 'Invoke-FixtureRegistry'
$script:deleteStarted = $false
$script:readDenied = $false
$script:machineDeleted = $false
$script:entries = @(
  [pscustomobject]@{ SubKey = "$namespace\UserInstall"; View = 'Registry64'; ViewOption = '/reg:64' },
  [pscustomobject]@{ SubKey = "$namespace\UserUninstall"; View = 'Registry64'; ViewOption = '/reg:64' },
  [pscustomobject]@{ SubKey = "$namespace\Machine64"; View = 'Registry64'; ViewOption = '/reg:64' },
  [pscustomobject]@{ SubKey = "$namespace\Machine32"; View = 'Registry32'; ViewOption = '/reg:32' },
  [pscustomobject]@{ SubKey = "$namespace\Absent"; View = 'Registry64'; ViewOption = '/reg:64' }
)
foreach ($entry in $script:entries) {
  $entry | Add-Member Hive 'CurrentUser'
  $entry | Add-Member CommandPath "HKCU\$($entry.SubKey)"
  $entry | Add-Member ProviderPath "Registry::HKEY_CURRENT_USER\$($entry.SubKey)"
}
function Get-RegistryEntries { $script:entries }
function Get-RegistryState([object] $entry) {
  if ($entry.SubKey.EndsWith('\Machine64')) {
    if ($Scenario -eq 'snapshot-read-denied' -or
      ($Scenario -eq 'read-before-delete-denied' -and $script:deleteStarted) -or
      ($Scenario -eq 'read-after-delete-denied' -and $script:machineDeleted -and $script:readDenied)) {
      throw [UnauthorizedAccessException]::new('fixture registry read denied')
    }
  }
  & $script:productionRegistryState $entry
}
function Invoke-FixtureRegistry {
  param([Parameter(ValueFromRemainingArguments = $true)][object[]] $RegistryArguments)
  $ErrorActionPreference = 'Continue'
  if ($RegistryArguments[0] -eq 'IMPORT') {
    $importPath = [IO.Path]::GetFullPath([string] $RegistryArguments[1])
    if (-not $importPath.StartsWith("$transactionRoot\", [StringComparison]::OrdinalIgnoreCase)) { throw 'fixture refused a non-isolated registry import' }
    & $script:realRegistryExecutable @RegistryArguments 2>&1 | Out-Null
    $global:LASTEXITCODE = $LASTEXITCODE
    return
  }
  if ([string] $RegistryArguments[1] -notlike "HKCU\$namespace\*") { throw 'fixture refused a non-isolated registry path' }
  if ($RegistryArguments[0] -eq 'DELETE') {
    $script:deleteStarted = $true
    if ([string] $RegistryArguments[1] -like '*\Machine64') {
      if ($Scenario -eq 'delete-denied') { $global:LASTEXITCODE = 5; return }
      if ($Scenario -eq 'delete-throws') { throw [UnauthorizedAccessException]::new('fixture registry delete denied') }
      & $script:realRegistryExecutable @RegistryArguments | Out-Null
      $global:LASTEXITCODE = $LASTEXITCODE
      $script:machineDeleted = $true
      if ($Scenario -eq 'read-after-delete-denied') { $script:readDenied = $true }
      if ($Scenario -eq 'delete-then-error') { $global:LASTEXITCODE = 5 }
      return
    }
  }
  & $script:realRegistryExecutable @RegistryArguments 2>&1 | Out-Null
  $global:LASTEXITCODE = $LASTEXITCODE
}
function Assert-Equal($actual, $expected, [string] $message) {
  if ($actual -cne $expected) { throw "$message expected=[$expected] actual=[$actual]" }
}
function Set-FixtureRegistration($entry, [string] $location, [string] $version) {
  & $script:realRegistryExecutable ADD $entry.CommandPath /v InstallLocation /t REG_SZ /d $location /f $entry.ViewOption | Out-Null
  & $script:realRegistryExecutable ADD $entry.CommandPath /v DisplayVersion /t REG_SZ /d $version /f $entry.ViewOption | Out-Null
  & $script:realRegistryExecutable ADD "$($entry.CommandPath)\Child" /v Sentinel /t REG_SZ /d 'preserve-subtree' /f $entry.ViewOption | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'fixture seed failed' }
}
function Read-FixtureVersion($entry) {
  $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, [Enum]::Parse([Microsoft.Win32.RegistryView], $entry.View))
  try {
    $key = $base.OpenSubKey($entry.SubKey)
    if ($null -eq $key) { return $null }
    try {
      $child = $key.OpenSubKey('Child')
      try { Assert-Equal ($child.GetValue('Sentinel')) 'preserve-subtree' 'registration subtree lost' } finally { $child.Dispose() }
      $key.GetValue('DisplayVersion')
    } finally { $key.Dispose() }
  } finally { $base.Dispose() }
}
try {
  foreach ($entry in $script:entries | Select-Object -First 4) {
    Set-FixtureRegistration $entry $normalizedInstallDirectory 'old'
    $originalPath = Join-Path $Root "$([IO.Path]::GetFileName($entry.SubKey)).original.reg"
    & $script:realRegistryExecutable EXPORT $entry.CommandPath $originalPath /y $entry.ViewOption | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'original registry snapshot failed' }
  }
  $beginFailure = $null
  try { Begin-Transaction } catch { $beginFailure = $_.Exception.Message }
  if ($Scenario -in @('delete-denied', 'delete-throws', 'delete-then-error', 'read-before-delete-denied', 'read-after-delete-denied', 'snapshot-read-denied')) {
    if ([string]::IsNullOrEmpty($beginFailure)) { throw 'fault injection did not stop Begin' }
    foreach ($entry in $script:entries | Select-Object -First 2) {
      Assert-Equal (Read-FixtureVersion $entry) 'old' 'HKCU was not restored after registry failure'
    }
    if ($Scenario -eq 'read-after-delete-denied') {
      if (-not [IO.File]::Exists($journalPath)) { throw 'unresolved registry recovery journal was lost' }
      $script:readDenied = $false
      Invoke-Rollback (Read-Journal)
    }
  } else {
    if ($null -ne $beginFailure) { throw $beginFailure }
    $journal = Read-Journal
    if ($Scenario -eq 'foreign-replacement') {
      Set-FixtureRegistration $script:entries[0] (Join-Path $Root 'foreign-application') 'foreign'
      $rollbackFailure = $null
      try { Invoke-Rollback $journal } catch { $rollbackFailure = $_.Exception.Message }
      if ([string]::IsNullOrEmpty($rollbackFailure)) { throw 'foreign registry conflict was silently accepted' }
      Assert-Equal (Read-FixtureVersion $script:entries[0]) 'foreign' 'foreign replacement was deleted'
      Assert-Equal (Read-FixtureVersion $script:entries[1]) 'old' 'one conflict blocked other registry restoration'
      if (-not [IO.File]::Exists($journalPath)) { throw 'conflicting rollback journal was lost' }
      & $script:realRegistryExecutable DELETE $script:entries[0].CommandPath /f /reg:64 | Out-Null
      Invoke-Rollback (Read-Journal)
    } else {
      $location = if ($Scenario -eq 'absent-owned') { $normalizedInstallDirectory } else { Join-Path $Root 'foreign-application' }
      Set-FixtureRegistration $script:entries[4] $location 'foreign'
      Invoke-Rollback $journal
      Assert-Equal (Read-FixtureVersion $script:entries[4]) $(if ($Scenario -eq 'absent-owned') { $null } else { 'foreign' }) 'absent-entry ownership was not respected'
    }
  }
  foreach ($entry in $script:entries | Select-Object -First 4) {
    Assert-Equal (Read-FixtureVersion $entry) 'old' 'original registration was not restored exactly'
    $originalPath = Join-Path $Root "$([IO.Path]::GetFileName($entry.SubKey)).original.reg"
    $restoredPath = Join-Path $Root "$([IO.Path]::GetFileName($entry.SubKey)).restored.reg"
    & $script:realRegistryExecutable EXPORT $entry.CommandPath $restoredPath /y $entry.ViewOption | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'restored registry snapshot failed' }
    Assert-Equal ([Convert]::ToBase64String([IO.File]::ReadAllBytes($restoredPath))) ([Convert]::ToBase64String([IO.File]::ReadAllBytes($originalPath))) 'registry snapshot changed'
  }
  Write-Output "PASS $Scenario"
} finally {
  if ($namespace -notmatch '^Software\\DeepSeekHarnessDesktopTests\\rollback-[a-f0-9]{32}$') { throw 'unsafe fixture cleanup namespace' }
  foreach ($view in @('/reg:64', '/reg:32')) {
    if (Test-Path -LiteralPath "Registry::HKEY_CURRENT_USER\$namespace") {
      & $script:realRegistryExecutable DELETE "HKCU\$namespace" /f $view | Out-Null
    }
  }
}
