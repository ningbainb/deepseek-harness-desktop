param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Begin', 'ValidatePayload', 'PreparePayload', 'PromotePayload', 'Commit', 'Rollback', 'Cleanup')]
  [string] $Mode,

  [Parameter(Mandatory = $true)]
  [string] $InstallDirectory,

  [string] $InstallRegistryKey = '',

  [string] $UninstallRegistryKey = '',

  [string] $CleanupTransactionDirectory = '',
  [string] $InstallerExecutable = '',
  [string] $InstallerStoreFile = '',
  [string] $RuntimeManifestSHA256 = '',
  [long] $PayloadArchiveBytes = 0,
  [long] $PayloadInstalledBytes = 0,
  [switch] $CompleteRuntimePayload
)

$ErrorActionPreference = 'Stop'
$mainExecutableName = 'DeepSeek Harness Desktop.exe'
$appArchiveRelativePath = 'resources\app.asar'
$upgradeMarkerRelativePath = 'resources\installer-upgrade-v3'
$upgradeMarkerValue = 'dsh-desktop-installer-upgrade=3'

function Get-NormalizedPath([string] $path) {
  if ([string]::IsNullOrWhiteSpace($path)) {
    throw 'install path is empty'
  }
  $normalized = [System.IO.Path]::GetFullPath($path).TrimEnd([char[]]@('\', '/'))
  $volumeRoot = [System.IO.Path]::GetPathRoot($normalized).TrimEnd([char[]]@('\', '/'))
  if ([string]::IsNullOrWhiteSpace($normalized) -or $normalized -eq $volumeRoot) {
    throw "unsafe install path: $path"
  }
  $normalized
}

function Get-TransactionId([string] $normalizedInstallDirectory) {
  $material = "$normalizedInstallDirectory`n$InstallRegistryKey`n$UninstallRegistryKey"
  $hash = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = $hash.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($material))
    (-join ($bytes | ForEach-Object { $_.ToString('x2') })).Substring(0, 24)
  } finally {
    $hash.Dispose()
  }
}

$normalizedInstallDirectory = Get-NormalizedPath $InstallDirectory
$transactionId = Get-TransactionId $normalizedInstallDirectory
$transactionTemp = Get-NormalizedPath ([System.IO.Path]::GetTempPath())
$legacyTransactionRoot = Join-Path $transactionTemp "dsh-desktop-installer-transaction-$transactionId"
# Old asynchronous helpers only know the legacy path. Never reuse it for a new
# rollback journal, even if an old helper wakes after the next upgrade begins.
$activeTransactionRoot = Join-Path $transactionTemp "dsh-desktop-installer-active-$transactionId"
$cleanupPrefix = "dsh-desktop-installer-cleanup-$transactionId-"
$transactionRoot = $activeTransactionRoot
if (-not [string]::IsNullOrWhiteSpace($CleanupTransactionDirectory)) {
  $candidate = Get-NormalizedPath $CleanupTransactionDirectory
  if ($Mode -cne 'Cleanup' -or
      -not ([System.IO.Path]::GetDirectoryName($candidate)).Equals($transactionTemp, [StringComparison]::OrdinalIgnoreCase) -or
      [System.IO.Path]::GetFileName($candidate) -notmatch ('^' + [regex]::Escape($cleanupPrefix) + '[a-f0-9]{32}$')) {
    throw 'installer cleanup directory is outside its isolated queue'
  }
  if ((Test-Path -LiteralPath $candidate) -and
      ((Get-Item -LiteralPath $candidate -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'installer cleanup directory cannot be a link'
  }
  $transactionRoot = $candidate
}
$journalPath = Join-Path $transactionRoot 'transaction.json'
$registryExecutable = Join-Path $env:SystemRoot 'System32\reg.exe'

function Write-Journal([object] $journal) {
  [System.IO.Directory]::CreateDirectory($transactionRoot) | Out-Null
  $temporaryPath = Join-Path $transactionRoot "transaction-$([System.Guid]::NewGuid().ToString('N')).tmp"
  $json = $journal | ConvertTo-Json -Depth 8
  [System.IO.File]::WriteAllText($temporaryPath, "$json`n", [System.Text.UTF8Encoding]::new($false))
  if (Test-Path -LiteralPath $journalPath -PathType Leaf) {
    $backupPath = Join-Path $transactionRoot 'transaction.previous.json'
    Remove-Item -LiteralPath $backupPath -Force -ErrorAction SilentlyContinue
    [System.IO.File]::Replace($temporaryPath, $journalPath, $backupPath, $true)
    Remove-Item -LiteralPath $backupPath -Force -ErrorAction SilentlyContinue
  } else {
    [System.IO.File]::Move($temporaryPath, $journalPath)
  }
}

function Read-Journal {
  if (-not (Test-Path -LiteralPath $journalPath -PathType Leaf)) {
    return $null
  }
  $journal = Get-Content -LiteralPath $journalPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ([int64] $journal.schemaVersion -ne 1) {
    throw 'unsupported installer transaction journal schema'
  }
  if ($journal.transactionId -cne $transactionId) {
    throw 'installer transaction journal id mismatch'
  }
  if (-not ([string] $journal.installDirectory).Equals(
    $normalizedInstallDirectory,
    [System.StringComparison]::OrdinalIgnoreCase
  )) {
    throw 'installer transaction journal install path mismatch'
  }
  $journal
}

function Get-RegistryEntries {
  $entries = [System.Collections.Generic.List[object]]::new()
  foreach ($hive in @(
    [pscustomobject]@{ Provider = 'HKEY_CURRENT_USER'; Hive = 'CurrentUser'; Command = 'HKCU'; Views = @('Default') },
    [pscustomobject]@{
      Provider = 'HKEY_LOCAL_MACHINE'
      Hive = 'LocalMachine'
      Command = 'HKLM'
      Views = $(if ([Environment]::Is64BitOperatingSystem) { @('Registry64', 'Registry32') } else { @('Default') })
    }
  )) {
    foreach ($key in @($InstallRegistryKey, $UninstallRegistryKey)) {
      if ([string]::IsNullOrWhiteSpace($key)) {
        continue
      }
      foreach ($view in $hive.Views) {
        $entries.Add([pscustomobject]@{
          ProviderPath = "Registry::$($hive.Provider)\$key"
          CommandPath = "$($hive.Command)\$key"
          Hive = $hive.Hive
          SubKey = $key
          View = $view
          ViewOption = switch ($view) {
            'Registry64' { '/reg:64' }
            'Registry32' { '/reg:32' }
            default { '' }
          }
        })
      }
    }
    foreach ($view in $hive.Views) {
      foreach ($legacy in @(Get-LegacyUninstallEntries $hive $view)) {
        if (-not ($entries | Where-Object { $_.Hive -eq $legacy.Hive -and $_.View -eq $legacy.View -and $_.SubKey -eq $legacy.SubKey })) {
          $entries.Add($legacy)
        }
      }
    }
  }
  $entries
}

function Get-LegacyUninstallState([object] $parent, [string] $name) {
  $key = $null
  try {
    $key = $parent.OpenSubKey($name)
    if ($null -eq $key) { return $null }
    return [pscustomobject]@{
      DisplayName = $key.GetValue('DisplayName')
      InstallLocation = $key.GetValue('InstallLocation')
      UninstallString = $key.GetValue('UninstallString')
    }
  } catch [System.UnauthorizedAccessException] {
    # Unrelated applications may protect their entries. Discovery has not
    # established ownership; snapshot and removal of owned entries stay strict.
    return $null
  } catch [System.Security.SecurityException] {
    return $null
  } finally { if ($null -ne $key) { $key.Dispose() } }
}

function Get-LegacyUninstallEntries([object] $hive, [string] $view, [string] $uninstallRoot = 'Software\Microsoft\Windows\CurrentVersion\Uninstall') {
  # A product label alone is not ownership. Retire aliases only when their
  # exact uninstaller points at this target and our private marker is present.
  if (-not (Test-Path -LiteralPath (Join-Path $normalizedInstallDirectory 'resources\update-shutdown-v1') -PathType Leaf)) { return }
  $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey(
    [Enum]::Parse([Microsoft.Win32.RegistryHive], $hive.Hive),
    [Enum]::Parse([Microsoft.Win32.RegistryView], $view))
  try {
    $parent = $base.OpenSubKey($uninstallRoot)
    if ($null -eq $parent) { return }
    try {
      foreach ($name in $parent.GetSubKeyNames()) {
        $state = Get-LegacyUninstallState $parent $name
        if ($null -eq $state) { continue }
        $displayName = [string] $state.DisplayName
        $uninstall = [string] $state.UninstallString
        if ($displayName -notmatch '^DeepSeek Harness Desktop(?: \d[\w.\-]*)?$' -or
            $uninstall -notmatch '^\s*"[^"]+\\Uninstall DeepSeek Harness Desktop\.exe"(?:\s|$)') { continue }
        if (-not (Test-TargetRegistration $state)) { continue }
        $subKey = "$uninstallRoot\$name"
        [pscustomobject]@{
          ProviderPath = "Registry::$($hive.Provider)\$subKey"
          CommandPath = "$($hive.Command)\$subKey"
          Hive = $hive.Hive; SubKey = $subKey; View = $view
          ViewOption = switch ($view) { 'Registry64' { '/reg:64' }; 'Registry32' { '/reg:32' }; default { '' } }
        }
      }
    } finally { $parent.Dispose() }
  } finally { $base.Dispose() }
}

function Get-RegistryState([object] $entry) {
  if ([string]::IsNullOrWhiteSpace([string] $entry.View)) {
    # Journals written by older installers used the process-default view.
    try {
      $legacyKey = Get-Item -LiteralPath ([string] $entry.ProviderPath) -ErrorAction Stop
      try { if ($legacyKey.ValueCount -eq 0 -and $legacyKey.SubKeyCount -eq 0) { return $null } }
      finally { $legacyKey.Dispose() }
      return Get-ItemProperty -LiteralPath ([string] $entry.ProviderPath) -ErrorAction Stop
    } catch [System.Management.Automation.ItemNotFoundException] {
      return $null
    }
  }
  $hive = [Enum]::Parse([Microsoft.Win32.RegistryHive], [string] $entry.Hive)
  $view = [Enum]::Parse([Microsoft.Win32.RegistryView], [string] $entry.View)
  $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey($hive, $view)
  try {
    $key = $base.OpenSubKey([string] $entry.SubKey)
    if ($null -eq $key) { return $null }
    try {
      # An empty inaccessible HKLM tombstone cannot launch an old uninstaller.
      # Leave it untouched rather than requiring elevation for a per-user setup.
      if ($key.ValueCount -eq 0 -and $key.SubKeyCount -eq 0) { return $null }
      return [pscustomobject]@{
        InstallLocation = $key.GetValue('InstallLocation')
        UninstallString = $key.GetValue('UninstallString')
      }
    } finally { $key.Dispose() }
  } finally { $base.Dispose() }
}

function Get-UninstallerDirectory([string] $uninstallString) {
  if ([string]::IsNullOrWhiteSpace($uninstallString)) {
    return $null
  }
  $match = [System.Text.RegularExpressions.Regex]::Match($uninstallString, '^\s*"([^"]+)"')
  $uninstallerPath = if ($match.Success) {
    $match.Groups[1].Value
  } else {
    ($uninstallString -split '\s+', 2)[0]
  }
  try {
    [System.IO.Path]::GetDirectoryName([System.IO.Path]::GetFullPath($uninstallerPath))
  } catch {
    $null
  }
}

function Test-ProductInstall([string] $root) {
  (Test-Path -LiteralPath (Join-Path $root $mainExecutableName) -PathType Leaf) -and
    (Test-Path -LiteralPath (Join-Path $root $appArchiveRelativePath) -PathType Leaf)
}

function Get-LegacyScopedInstall {
  if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) { return }
  $root = Join-Path $env:LOCALAPPDATA 'Programs\@deepseek-aidsh-desktop\DeepSeek Harness Desktop'
  $marker = Join-Path $root 'resources\app-update.yml'
  if (-not (Test-ProductInstall $root) -or -not (Test-Path -LiteralPath $marker -PathType Leaf)) { return }
  try {
    foreach ($path in @($marker, (Join-Path $root $mainExecutableName), (Join-Path $root $appArchiveRelativePath))) {
      Assert-PlainPayloadPath $path
    }
    $configuration = [IO.File]::ReadAllText($marker)
    if ($configuration -cnotmatch '(?m)^updaterCacheDirName:[ \t]*(?:''@deepseek-aidsh-desktop-updater''|"@deepseek-aidsh-desktop-updater"|@deepseek-aidsh-desktop-updater)[ \t]*\r?$') { return }
    Assert-PlainPayloadTree $root
  } catch {
    Write-Verbose 'upgrade-legacy-scoped-install-skipped reason=identity-or-tree-unverified'
    return
  }
  Get-NormalizedPath $root
}

function Assert-InstallBackup([object] $install) {
  $root = Get-NormalizedPath ([string] $install.root)
  $backup = Get-NormalizedPath ([string] $install.backup)
  $rootParent = [System.IO.Path]::GetDirectoryName($root)
  $backupParent = [System.IO.Path]::GetDirectoryName($backup)
  if (-not $rootParent.Equals($backupParent, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "installer backup is not beside its install root: $backup"
  }
  if (-not [System.IO.Path]::GetFileName($backup).StartsWith(
    ".dsh-desktop-update-old-$transactionId-",
    [System.StringComparison]::OrdinalIgnoreCase
  )) {
    throw "installer backup name is invalid: $backup"
  }
  [pscustomobject]@{ Root = $root; Backup = $backup }
}

function Remove-RegistryEntries([object[]] $entries, [object] $journal = $null) {
  foreach ($entry in $entries) {
    if ($null -ne (Get-RegistryState $entry)) {
      if ($null -ne $journal) {
        $entry.removalState = 'pending'
        Write-Journal $journal
      }
      # Do not fall through to the legacy uninstaller with stale registration.
      $arguments = @('DELETE', [string] $entry.commandPath, '/f')
      if (-not [string]::IsNullOrWhiteSpace([string] $entry.viewOption)) { $arguments += [string] $entry.viewOption }
      & $registryExecutable @arguments | Out-Null
      if ($LASTEXITCODE -ne 0 -or $null -ne (Get-RegistryState $entry)) {
        throw "previous install registration is still present: $($entry.commandPath) $($entry.viewOption)"
      }
      if ($null -ne $journal) {
        $entry.removalState = 'removed'
        Write-Journal $journal
      }
    }
  }
}

function Move-InstallToBackup([object] $install) {
  $wait = [Diagnostics.Stopwatch]::StartNew()
  while ($true) {
    try {
      [System.IO.Directory]::Move($install.Root, $install.Backup)
      return
    } catch {
      $failure = $_.Exception
      while ($null -ne $failure.InnerException) { $failure = $failure.InnerException }
      $win32Code = $failure.HResult -band 0xffff
      # File probes miss directory handles and nested DLLs. Only sharing/lock
      # violations are transient; permissions and other failures stop promptly.
      if ($win32Code -notin @(32, 33) -or $wait.ElapsedMilliseconds -ge 5000) {
        throw "upgrade-directory-stage-failed code=$win32Code root=$($install.Root): $($failure.Message)"
      }
      Write-Output "upgrade-directory-stage-retry code=$win32Code"
      Start-Sleep -Milliseconds 200
    }
  }
}

function Invoke-RegistryImport([string] $exportPath, [object] $entry) {
  $arguments = @('IMPORT', $exportPath)
  if (-not [string]::IsNullOrWhiteSpace([string] $entry.viewOption)) { $arguments += [string] $entry.viewOption }
  & $registryExecutable @arguments | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "registry import failed with exit code $LASTEXITCODE`: $exportPath"
  }
}

function Test-RegistryBackupMatches([object] $entry, [string] $exportPath) {
  $currentPath = "$exportPath.current.reg"
  try {
    $arguments = @('EXPORT', [string] $entry.commandPath, $currentPath, '/y')
    if (-not [string]::IsNullOrWhiteSpace([string] $entry.viewOption)) { $arguments += [string] $entry.viewOption }
    & $registryExecutable @arguments | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "registry comparison failed: $($entry.commandPath)" }
    [IO.File]::ReadAllText($currentPath) -ceq [IO.File]::ReadAllText($exportPath)
  } finally {
    Remove-Item -LiteralPath $currentPath -Force -ErrorAction SilentlyContinue
  }
}

function Test-TargetRegistration([object] $state) {
  $paths = @([string] $state.InstallLocation, (Get-UninstallerDirectory ([string] $state.UninstallString)))
  $matched = $false
  foreach ($path in $paths) {
    if ([string]::IsNullOrWhiteSpace($path)) { continue }
    try { $normalized = Get-NormalizedPath $path } catch { return $false }
    if (-not $normalized.Equals($normalizedInstallDirectory, [StringComparison]::OrdinalIgnoreCase)) { return $false }
    $matched = $true
  }
  $matched
}

function Restore-RegistryEntries([object] $journal) {
  $failures = [System.Collections.Generic.List[string]]::new()
  foreach ($entry in @($journal.registry)) {
    $tracked = $null -ne $entry.PSObject.Properties['removalState']
    if ($tracked -and $entry.removalState -eq 'restored') { continue }
    if ($tracked -and [bool] $entry.present -and $entry.removalState -eq 'none') { continue }
    if ($tracked -and -not [bool] $entry.present -and -not [bool] $journal.registryPrepared) { continue }
    try {
      $exportPath = Join-Path $transactionRoot ([string] $entry.exportFile)
      if ([bool] $entry.present -and -not (Test-Path -LiteralPath $exportPath -PathType Leaf)) {
        throw "registry backup is missing: $exportPath"
      }
      $state = Get-RegistryState $entry
      if ($null -ne $state) {
        $matchesBackup = [bool] $entry.present -and (Test-RegistryBackupMatches $entry $exportPath)
        if (-not $matchesBackup) {
          if (-not (Test-TargetRegistration $state)) {
            if ([bool] $entry.present) { throw "registry recovery conflict: $($entry.commandPath)" }
            continue
          }
          Remove-RegistryEntries @($entry)
        }
      } else {
        $matchesBackup = $false
      }
      if ([bool] $entry.present -and -not $matchesBackup) { Invoke-RegistryImport $exportPath $entry }
      $entry | Add-Member -NotePropertyName removalState -NotePropertyValue 'restored' -Force
      Write-Journal $journal
    } catch {
      $failures.Add("$($entry.commandPath) $($entry.viewOption): $($_.Exception.Message)")
    }
  }
  if ($failures.Count -ne 0) { throw "registry recovery incomplete: $($failures -join '; ')" }
}

function Remove-TransactionRootIfEmpty {
  if (Test-Path -LiteralPath $transactionRoot -PathType Container) {
    try {
      Remove-Item -LiteralPath $transactionRoot -Recurse -Force -ErrorAction Stop
    } catch {
      if (Test-Path -LiteralPath $transactionRoot -PathType Container) {
        throw
      }
    }
  }
}

function Complete-CommittedTransaction([object] $journal) {
  Remove-PayloadStage $journal
  if ($journal.payload.promotion -ceq 'directory') {
    $receipt = Get-PromotedDirectoryReceipt $journal
    Assert-PlainPayloadPath $receipt
    if (Test-PromotedDirectoryReceipt $journal $receipt) { [IO.File]::Delete($receipt) }
  }
  $retained = [System.Collections.Generic.List[string]]::new()
  foreach ($rawInstall in @($journal.installs)) {
    $install = Assert-InstallBackup $rawInstall
    if (Test-Path -LiteralPath $install.Backup -PathType Container) {
      try {
        Remove-Item -LiteralPath $install.Backup -Recurse -Force -ErrorAction Stop
      } catch {
        if (Test-Path -LiteralPath $install.Backup -PathType Container) {
          $retained.Add($install.Backup)
        }
      }
    }
  }
  if ($retained.Count -eq 0) {
    Remove-TransactionRootIfEmpty
    Write-Output 'upgrade-transaction-committed'
  } else {
    Write-Output "upgrade-transaction-backup-retained paths=$($retained -join '|')"
  }
}

function ConvertTo-PowerShellLiteral([string] $value) {
  "'$($value.Replace("'", "''"))'"
}

function Start-DeferredCommittedCleanup([object] $journal, [string] $cleanupDirectory) {
  if ($journal.state -cne 'committed') {
    throw 'deferred installer cleanup requires a committed transaction'
  }
  try {
    $cleanupScript = Join-Path $cleanupDirectory 'cleanup-committed.ps1'
    [System.IO.File]::Copy($PSCommandPath, $cleanupScript, $true)
    $powershellExecutable = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $command = @(
      '&',
      (ConvertTo-PowerShellLiteral $cleanupScript),
      '-Mode Cleanup',
      '-InstallDirectory',
      (ConvertTo-PowerShellLiteral $normalizedInstallDirectory),
      '-InstallRegistryKey',
      (ConvertTo-PowerShellLiteral $InstallRegistryKey),
      '-UninstallRegistryKey',
      (ConvertTo-PowerShellLiteral $UninstallRegistryKey),
      '-CleanupTransactionDirectory',
      (ConvertTo-PowerShellLiteral $cleanupDirectory)
    ) -join ' '
    $encodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
    Start-Process -FilePath $powershellExecutable -ArgumentList @(
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      $encodedCommand
    ) -WindowStyle Hidden | Out-Null
    Write-Output 'upgrade-transaction-cleanup-deferred'
  } catch {
    # The new install is already committed and valid. Retain the journal and
    # backup in the isolated queue; cleanup cannot block the next upgrade.
    Write-Output "upgrade-transaction-backup-retained reason=deferred-cleanup-start-failed"
  }
}

function Retire-CommittedTransaction([object] $journal) {
  if ($journal.state -cne 'committed') { throw 'only a committed transaction may enter the cleanup queue' }
  if (-not (Test-ProductInstall $normalizedInstallDirectory)) {
    throw 'committed installation is missing; retained backup requires recovery'
  }
  foreach ($install in @($journal.installs)) { Assert-InstallBackup $install | Out-Null }
  $queueDirectory = Join-Path $transactionTemp "$cleanupPrefix$([Guid]::NewGuid().ToString('N'))"
  # Move only the validated journal directory, not the possibly locked backup.
  [IO.Directory]::Move($transactionRoot, $queueDirectory)
  Write-Output 'upgrade-transaction-backup-queued'
  Start-DeferredCommittedCleanup $journal $queueDirectory
}

function Resolve-LegacyTransaction {
  if (-not (Test-Path -LiteralPath (Join-Path $legacyTransactionRoot 'transaction.json') -PathType Leaf)) { return }
  $savedRoot = $script:transactionRoot
  $savedJournal = $script:journalPath
  try {
    $script:transactionRoot = $legacyTransactionRoot
    $script:journalPath = Join-Path $legacyTransactionRoot 'transaction.json'
    $legacy = Read-Journal
    if ($null -ne $legacy) {
      if ($legacy.state -ceq 'committed') { Retire-CommittedTransaction $legacy }
      else { Invoke-Rollback $legacy }
    }
  } finally {
    $script:transactionRoot = $savedRoot
    $script:journalPath = $savedJournal
  }
}

function Invoke-Rollback([object] $journal) {
  if ($journal.state -eq 'committed') {
    Retire-CommittedTransaction $journal
    return
  }

  $installs = @($journal.installs | ForEach-Object { Assert-InstallBackup $_ })
  $hasBackup = $false
  foreach ($install in $installs) {
    if (Test-Path -LiteralPath $install.Backup -PathType Container) {
      $hasBackup = $true
      if (-not (Test-ProductInstall $install.Backup)) {
        throw "installer backup is incomplete: $($install.Backup)"
      }
    }
  }

  Restore-TargetPayload $journal
  if ($null -ne $journal.payload -and $journal.payload.promotion) {
    # Persist the completed reversal before restoring the previous app or
    # deleting staged files. A later retry must not treat old files as payload.
    $journal.payload.promotion = ''
    $journal.payload.entries = @()
    Write-Journal $journal
  }

  $freshOwnedTarget = $false
  if (-not $hasBackup -and -not [bool] $journal.targetExisted -and (Test-ProductInstall $normalizedInstallDirectory)) {
    $marker = Join-Path $normalizedInstallDirectory $upgradeMarkerRelativePath
    $freshOwnedTarget = (Test-Path -LiteralPath $marker -PathType Leaf) -and
      (Get-Content -LiteralPath $marker -Raw -Encoding UTF8).Trim() -ceq $upgradeMarkerValue
  }
  if ($null -eq $journal.payload -and ($hasBackup -or $freshOwnedTarget) -and -not [bool] $journal.targetExisted -and
    (Test-Path -LiteralPath $normalizedInstallDirectory -PathType Container)) {
    $targetIsRestoreRoot = $installs | Where-Object {
      $_.Root.Equals($normalizedInstallDirectory, [System.StringComparison]::OrdinalIgnoreCase)
    } | Select-Object -First 1
    if ($null -eq $targetIsRestoreRoot) {
      Remove-Item -LiteralPath $normalizedInstallDirectory -Recurse -Force -ErrorAction Stop
    }
  }

  foreach ($install in $installs) {
    if (-not (Test-Path -LiteralPath $install.Backup -PathType Container)) {
      continue
    }
    if (Test-Path -LiteralPath $install.Root) {
      if ($null -ne $journal.payload -and $install.Root.Equals($normalizedInstallDirectory, [StringComparison]::OrdinalIgnoreCase)) {
        Assert-PlainPayloadPath $install.Root
        # The journaled payload has already been removed. Keep any unrelated
        # files and leave the previous app available in its validated backup.
        [IO.Directory]::Delete($install.Root, $false)
      } else {
        Remove-Item -LiteralPath $install.Root -Recurse -Force -ErrorAction Stop
      }
    }
    [System.IO.Directory]::Move($install.Backup, $install.Root)
    Write-Output "upgrade-install-restored root=$($install.Root)"
  }

  Restore-RegistryEntries $journal

  Remove-PayloadStage $journal
  Remove-TransactionRootIfEmpty
  Write-Output 'upgrade-transaction-rolled-back'
}

function Begin-Transaction {
  Resolve-LegacyTransaction
  $existingJournal = Read-Journal
  if ($null -ne $existingJournal) {
    if ($existingJournal.state -eq 'committed') {
      Retire-CommittedTransaction $existingJournal
    } else {
      Invoke-Rollback $existingJournal
    }
  }

  $targetExisted = Test-Path -LiteralPath $normalizedInstallDirectory
  $registryEntries = @(Get-RegistryEntries)
  $roots = [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::OrdinalIgnoreCase
  )
  [void] $roots.Add($normalizedInstallDirectory)
  $legacyScopedInstall = Get-LegacyScopedInstall
  if ($legacyScopedInstall) { [void] $roots.Add($legacyScopedInstall) }

  foreach ($entry in $registryEntries) {
    $state = Get-RegistryState $entry
    if ($null -eq $state) {
      continue
    }
    if (-not [string]::IsNullOrWhiteSpace([string] $state.InstallLocation)) {
      try { [void] $roots.Add((Get-NormalizedPath ([string] $state.InstallLocation))) } catch {}
    }
    $uninstallerDirectory = Get-UninstallerDirectory ([string] $state.UninstallString)
    if (-not [string]::IsNullOrWhiteSpace($uninstallerDirectory)) {
      try { [void] $roots.Add((Get-NormalizedPath $uninstallerDirectory)) } catch {}
    }
  }

  $installPlans = @($roots | Where-Object { Test-ProductInstall $_ } | ForEach-Object {
    $parent = [System.IO.Path]::GetDirectoryName($_)
    [pscustomobject]@{
      root = $_
      backup = Join-Path $parent ".dsh-desktop-update-old-$transactionId-$([System.Guid]::NewGuid().ToString('N'))"
    }
  })
  Assert-InstallerDataSeparate (@($normalizedInstallDirectory) + @($installPlans | ForEach-Object { $_.root }))

  $presentRegistryCount = @($registryEntries | Where-Object {
    $null -ne (Get-RegistryState $_)
  }).Count
  # Fresh installations also need a journal so failed restoration cannot leave
  # an owned partial application registered as successfully installed.

  [System.IO.Directory]::CreateDirectory($transactionRoot) | Out-Null
  $registryJournal = [System.Collections.Generic.List[object]]::new()
  for ($index = 0; $index -lt $registryEntries.Count; $index += 1) {
    $entry = $registryEntries[$index]
    $present = $null -ne (Get-RegistryState $entry)
    $exportFile = "registry-$index.reg"
    if ($present) {
      $exportPath = Join-Path $transactionRoot $exportFile
      $arguments = @('EXPORT', [string] $entry.CommandPath, $exportPath, '/y')
      if ($entry.ViewOption -ne '') { $arguments += $entry.ViewOption }
      & $registryExecutable @arguments | Out-Null
      if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $exportPath -PathType Leaf)) {
        throw "registry export failed: $($entry.CommandPath)"
      }
    }
    $registryJournal.Add([pscustomobject]@{
      providerPath = $entry.ProviderPath
      commandPath = $entry.CommandPath
      hive = $entry.Hive
      subKey = $entry.SubKey
      view = $entry.View
      viewOption = $entry.ViewOption
      present = $present
      exportFile = $exportFile
      removalState = 'none'
    })
  }

  $journal = [pscustomobject]@{
    schemaVersion = 1
    transactionId = $transactionId
    state = 'prepared'
    installDirectory = $normalizedInstallDirectory
    targetExisted = $targetExisted
    installs = $installPlans
    registry = @($registryJournal)
    registryPrepared = $false
  }
  Write-Journal $journal

  try {
    # Clear every registration the native NSIS uninstall pass could read
    # before the corresponding executable leaves its original path.
    Remove-RegistryEntries -entries @($registryJournal) -journal $journal
    $journal.registryPrepared = $true
    Write-Journal $journal
    foreach ($rawInstall in $installPlans) {
      $install = Assert-InstallBackup $rawInstall
      Move-InstallToBackup $install
      Write-Output "upgrade-install-staged root=$($install.Root)"
    }
    Write-Output 'upgrade-transaction-prepared'
  } catch {
    $beginError = $_.Exception
    try {
      Invoke-Rollback $journal
    } catch {
      throw "upgrade transaction begin failed: $($beginError.Message); rollback failed: $($_.Exception.Message)"
    }
    throw $beginError
  }
}

function Get-InstallerFileSHA256([string] $path) {
  # Avoid PowerShell module auto-loading in minimal installer environments.
  $stream = [IO.File]::OpenRead($path)
  $hash = [Security.Cryptography.SHA256]::Create()
  try { ([BitConverter]::ToString($hash.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
  finally { $hash.Dispose(); $stream.Dispose() }
}

function Assert-PlainPayloadPath([string] $path) {
  $ancestor = [IO.Path]::GetFullPath($path)
  while ($ancestor) {
    try {
      if ([IO.File]::GetAttributes($ancestor) -band [IO.FileAttributes]::ReparsePoint) {
        throw "installer payload path contains a link: $ancestor"
      }
    } catch [IO.FileNotFoundException] {} catch [IO.DirectoryNotFoundException] {}
    $ancestor = [IO.Path]::GetDirectoryName($ancestor)
  }
}

function Assert-PlainPayloadTree([string] $path) {
  Assert-PlainPayloadPath $path
  $pending = [Collections.Generic.Stack[IO.DirectoryInfo]]::new()
  # Staging adds a transaction name before the package's longest paths.
  # Windows PowerShell must walk them even when LongPathsEnabled is off.
  $pending.Push([IO.DirectoryInfo]::new("\\?\$path"))
  while ($pending.Count -gt 0) {
    foreach ($entry in $pending.Pop().EnumerateFileSystemInfos()) {
      if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw "installer payload tree contains a link: $($entry.FullName)"
      }
      if ($entry -is [IO.DirectoryInfo]) { $pending.Push($entry) }
    }
  }
}

function Save-TargetVolumeInstaller {
  if ($InstallerStoreFile -cnotmatch '^[a-zA-Z0-9@_-][a-zA-Z0-9@._-]+\\installer\.exe$') {
    throw 'invalid installer cache relative path'
  }
  $source = [IO.Path]::GetFullPath($InstallerExecutable)
  if (-not [IO.File]::Exists($source) -or [IO.Path]::GetExtension($source) -ine '.exe') {
    throw 'installer cache source is not an executable file'
  }
  # Keep the downloaded updater out of the program directory that Begin moves.
  $destination = Join-Path "$normalizedInstallDirectory.dsh-desktop-updates" $InstallerStoreFile
  Assert-PlainPayloadPath $destination
  $directory = [IO.Path]::GetDirectoryName($destination)
  $blockMap = Join-Path $directory 'current.blockmap'
  Assert-PlainPayloadPath $blockMap
  [IO.Directory]::CreateDirectory($directory) | Out-Null
  $temporary = Join-Path $directory ("installer-" + [Guid]::NewGuid().ToString('N') + '.tmp')
  $previous = "$temporary.previous"
  try {
    [IO.File]::Copy($source, $temporary, $false)
    if ([IO.File]::Exists($destination)) {
      [IO.File]::Replace($temporary, $destination, $previous, $true)
    } else {
      [IO.File]::Move($temporary, $destination)
    }
    # The updater may still have a block map for the previous manually installed base.
    [IO.File]::Delete($blockMap)
    $bytes = [IO.FileInfo]::new($destination).Length
    Write-Output "destination=target-volume bytes=$bytes path=$destination"
  } finally {
    [IO.File]::Delete($temporary)
    [IO.File]::Delete($previous)
  }
}

function Get-PayloadStage([object] $journal) {
  if ($null -eq $journal.payload) { return }
  $token = [string] $journal.payload.token
  if ($token -cnotmatch '^[a-f0-9]{32}$') { throw 'invalid installer payload staging token' }
  Join-Path ([IO.Path]::GetDirectoryName($normalizedInstallDirectory)) ".dsh-desktop-payload-$token"
}

function Assert-PayloadStageOwner([object] $journal, [string] $stage) {
  $receipt = Join-Path $stage 'owner'
  Assert-PlainPayloadPath $receipt
  if (-not [IO.File]::Exists($receipt) -or ([IO.FileInfo]::new($receipt)).Length -ne 57 -or
      [IO.File]::ReadAllText($receipt) -cne "${transactionId}:$($journal.payload.token)") {
    throw 'installer payload staging ownership does not match the transaction'
  }
}

function Write-PayloadReceipt([string] $path, [string] $token) {
  $bytes = [Text.Encoding]::ASCII.GetBytes($token)
  $stream = [IO.File]::Open($path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
}

function Resolve-ExistingDataLinks([string] $path) {
  $current = [IO.Path]::GetFullPath($path)
  $visited = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  while ($visited.Count -lt 32 -and $visited.Add($current)) {
    $next = $null
    for ($ancestor = $current; $ancestor; $ancestor = [IO.Path]::GetDirectoryName($ancestor)) {
      try { $attributes = [IO.File]::GetAttributes($ancestor) }
      catch [IO.FileNotFoundException] { continue }
      catch [IO.DirectoryNotFoundException] { continue }
      if (-not ($attributes -band [IO.FileAttributes]::ReparsePoint)) { continue }
      $item = Get-Item -LiteralPath $ancestor -Force
      if ($item.LinkType -notin @('Junction', 'SymbolicLink')) { continue }
      $targets = @($item.Target)
      if ($targets.Count -ne 1 -or -not $targets[0]) { throw 'installer cannot resolve the configured data directory link' }
      $target = [string] $targets[0]
      if (-not [IO.Path]::IsPathRooted($target)) {
        $target = [IO.Path]::Combine([IO.Path]::GetDirectoryName($ancestor), $target)
      }
      $suffix = $current.Substring($ancestor.Length).TrimStart([char[]]@('\', '/'))
      $next = [IO.Path]::GetFullPath([IO.Path]::Combine($target, $suffix))
      break
    }
    if ($null -eq $next) { return $current.TrimEnd([char[]]@('\', '/')) }
    $current = $next
  }
  throw 'installer cannot resolve the configured data directory links'
}

function Assert-InstallerDataSeparate([string[]] $programDirectories) {
  $userData = if ($env:DSH_DESKTOP_USER_DATA) { $env:DSH_DESKTOP_USER_DATA } else { Join-Path $env:APPDATA 'DeepSeek Harness Desktop' }
  $desktopDataHome = $env:DSH_HOME
  if (-not $desktopDataHome) {
    $desktopDataHome = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.dsh-community'
    $location = Join-Path $userData 'desktop-data-location.json'
    if ([IO.File]::Exists($location)) {
      if ([IO.File]::GetAttributes($location) -band [IO.FileAttributes]::ReparsePoint) {
        throw 'installer cannot verify a linked Desktop data location file'
      }
      $saved = [IO.File]::ReadAllText($location, [Text.Encoding]::UTF8) | ConvertFrom-Json
      if ($saved.schemaVersion -ne 1 -or $saved.owner -cne 'deepseek-harness-community-desktop' -or $saved.home -isnot [string]) {
        throw 'installer payload cannot verify the persisted Desktop data directory'
      }
      $desktopDataHome = $saved.home
    }
  }
  $protectedPaths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($path in @($desktopDataHome, $userData, $env:DSH_DESKTOP_BROWSER_COMPONENT_ROOT, $env:DSH_DESKTOP_BROWSER_COMPONENT_CACHE)) {
    if (-not $path) { continue }
    [void] $protectedPaths.Add([IO.Path]::GetFullPath($path).TrimEnd([char[]]@('\', '/')))
    [void] $protectedPaths.Add((Resolve-ExistingDataLinks $path))
  }
  foreach ($program in $programDirectories | Select-Object -Unique) {
    Assert-PlainPayloadPath $program
    foreach ($protectedPath in $protectedPaths) {
      if ($protectedPath.Equals($program, [StringComparison]::OrdinalIgnoreCase) -or
          $protectedPath.StartsWith($program + '\', [StringComparison]::OrdinalIgnoreCase) -or
          $program.StartsWith($protectedPath + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'installer program directory overlaps a configured data directory'
      }
    }
  }
}

function Assert-TargetPayloadAvailable([switch] $RecoverInterrupted) {
  Assert-InstallerDataSeparate @($normalizedInstallDirectory)
  if ([IO.File]::Exists($normalizedInstallDirectory)) { throw 'installer payload target is a file' }
  $volumeRoot = [IO.Path]::GetPathRoot($normalizedInstallDirectory)
  if ($volumeRoot -notmatch '^[a-zA-Z]:\\$') { throw 'target payload requires a local Windows drive' }
  if ($PayloadArchiveBytes -le 0 -or $PayloadInstalledBytes -le 0) { throw 'invalid installer payload size' }
  if ($RecoverInterrupted) {
    # A previous Setup process can leave the old app in its backup and an
    # owned partial archive taking up the same volume. Recover it before the
    # space gate, so it cannot keep the user from retrying the installation.
    $pending = Read-Journal
    if ($null -ne $pending.payload -and $pending.state -ceq 'prepared') { Invoke-Rollback $pending }
  }
  # The staged archive and unpacked files coexist. Add headroom for filesystem
  # allocation overhead and the uninstaller written after promotion.
  $required = [decimal] $PayloadArchiveBytes + $PayloadInstalledBytes + 134217728
  if ([IO.DriveInfo]::new($volumeRoot).AvailableFreeSpace -lt $required) {
    throw "target volume requires $required free bytes for the installer payload"
  }
}

function Prepare-TargetPayload {
  Assert-TargetPayloadAvailable
  $journal = Read-Journal
  if ($null -eq $journal -or $journal.state -cne 'prepared' -or $null -ne $journal.payload) {
    throw 'target payload staging requires an active upgrade transaction without a payload'
  }
  $token = [Guid]::NewGuid().ToString('N')
  $journal | Add-Member -NotePropertyName payload -NotePropertyValue ([pscustomobject]@{
    token = $token; promotion = ''; entries = @()
  })
  $stage = Get-PayloadStage $journal
  Assert-PlainPayloadPath $stage
  if (Test-Path -LiteralPath $stage) { throw 'installer payload staging path is already in use' }
  Write-Journal $journal
  New-Item -Path $stage -ItemType Directory -ErrorAction Stop | Out-Null
  Assert-PlainPayloadPath $stage
  Write-PayloadReceipt (Join-Path $stage 'owner') "${transactionId}:$token"
  New-Item -Path (Join-Path $stage 'files') -ItemType Directory -ErrorAction Stop | Out-Null
  [Console]::Write($token)
}

function Get-PromotedDirectoryReceipt([object] $journal) {
  Join-Path $normalizedInstallDirectory ".dsh-desktop-payload-$($journal.payload.token).owner"
}

function Test-PromotedDirectoryReceipt([object] $journal, [string] $receipt) {
  [IO.File]::Exists($receipt) -and ([IO.FileInfo]::new($receipt)).Length -eq 32 -and
    [IO.File]::ReadAllText($receipt) -ceq $journal.payload.token
}

function Promote-TargetPayload {
  $journal = Read-Journal
  $stage = Get-PayloadStage $journal
  if (-not $stage -or $journal.state -cne 'prepared' -or $journal.payload.promotion -ne '') {
    throw 'target payload is not ready for promotion'
  }
  Assert-PayloadStageOwner $journal $stage
  Assert-PlainPayloadPath $normalizedInstallDirectory
  $files = Join-Path $stage 'files'
  Assert-PlainPayloadTree $files
  Assert-CompleteRuntimePayload $files
  $upgradeMarker = Join-Path $files $upgradeMarkerRelativePath
  if (-not [IO.File]::Exists($upgradeMarker) -or [IO.File]::ReadAllText($upgradeMarker).Trim() -cne $upgradeMarkerValue) {
    throw 'staged payload upgrade marker is invalid'
  }
  $entries = @([IO.DirectoryInfo]::new($files).EnumerateFileSystemInfos())
  foreach ($entry in $entries) {
    if (Test-Path -LiteralPath (Join-Path $normalizedInstallDirectory $entry.Name)) {
      throw "payload target already contains $($entry.Name)"
    }
  }
  [IO.File]::Delete((Join-Path $stage 'application.7z'))
  $journal.payload.entries = @($entries | ForEach-Object { $_.Name })
  $existing = [IO.Directory]::Exists($normalizedInstallDirectory)
  if (-not $existing -or @([IO.DirectoryInfo]::new($normalizedInstallDirectory).EnumerateFileSystemInfos()).Count -eq 0) {
    $journal.payload.promotion = 'directory'
    Write-Journal $journal
    Write-PayloadReceipt (Join-Path $files ([IO.Path]::GetFileName((Get-PromotedDirectoryReceipt $journal)))) $journal.payload.token
    if ($existing) { [IO.Directory]::Delete($normalizedInstallDirectory, $false) }
    [IO.Directory]::Move($files, $normalizedInstallDirectory)
  } else {
    # Preserve unrelated destination entries, including hidden files. Move
    # only the collision-free top-level payload entries on the same volume.
    $journal.payload.promotion = 'entries'
    Write-Journal $journal
    foreach ($entry in $entries) {
      $destination = Join-Path $normalizedInstallDirectory $entry.Name
      if ($entry -is [IO.DirectoryInfo]) { [IO.Directory]::Move($entry.FullName, $destination) }
      else { [IO.File]::Move($entry.FullName, $destination) }
    }
  }
  Write-Output "payload-promoted mode=$($journal.payload.promotion)"
}

function Restore-TargetPayload([object] $journal) {
  $stage = Get-PayloadStage $journal
  if (-not $stage -or -not (Test-Path -LiteralPath $stage)) { return }
  Assert-PayloadStageOwner $journal $stage
  Assert-PlainPayloadPath $normalizedInstallDirectory
  $files = Join-Path $stage 'files'
  $promotion = $journal.payload.promotion
  $receipt = Get-PromotedDirectoryReceipt $journal
  Assert-PlainPayloadPath $receipt
  $receiptValid = Test-PromotedDirectoryReceipt $journal $receipt
  if ($promotion -cnotin @('', 'directory', 'entries')) { throw 'invalid installer payload promotion mode' }
  if ($promotion -ceq 'entries' -or ($promotion -ceq 'directory' -and $receiptValid)) {
    Assert-PlainPayloadPath $files
    [IO.Directory]::CreateDirectory($files) | Out-Null
    foreach ($name in @($journal.payload.entries)) {
      if ($name -isnot [string] -or $name -in @('', '.', '..') -or $name -match '[\\/:]') {
        throw 'invalid installer payload journal entry'
      }
      $stagedPath = Join-Path $files $name
      $installedPath = Join-Path $normalizedInstallDirectory $name
      Assert-PlainPayloadPath $stagedPath
      Assert-PlainPayloadPath $installedPath
      if (-not (Test-Path -LiteralPath $stagedPath)) {
        if ([IO.Directory]::Exists($installedPath)) { [IO.Directory]::Move($installedPath, $stagedPath) }
        elseif ([IO.File]::Exists($installedPath)) { [IO.File]::Move($installedPath, $stagedPath) }
      }
    }
    if ($receiptValid) { [IO.File]::Delete($receipt) }
  }
  if ($promotion -ceq 'directory' -and [bool] $journal.targetExisted -and -not [IO.Directory]::Exists($normalizedInstallDirectory)) {
    [IO.Directory]::CreateDirectory($normalizedInstallDirectory) | Out-Null
  } elseif (-not [bool] $journal.targetExisted -and [IO.Directory]::Exists($normalizedInstallDirectory) -and
      @([IO.DirectoryInfo]::new($normalizedInstallDirectory).EnumerateFileSystemInfos()).Count -eq 0) {
    [IO.Directory]::Delete($normalizedInstallDirectory, $false)
  }
}

function Remove-PayloadStage([object] $journal) {
  $stage = Get-PayloadStage $journal
  if (-not $stage -or -not (Test-Path -LiteralPath $stage)) { return }
  Assert-PayloadStageOwner $journal $stage
  Assert-PlainPayloadTree $stage
  [IO.Directory]::Delete("\\?\$stage", $true)
}

function Assert-CompleteRuntimePayload([string] $payloadRoot = $normalizedInstallDirectory) {
  if ($RuntimeManifestSHA256 -cnotmatch '^[a-f0-9]{64}$') { throw 'invalid complete runtime manifest digest' }
  $assertNoLinks = {
    param([string] $path)
    $ancestor = [IO.Path]::GetFullPath($path)
    while ($ancestor) {
      $item = Get-Item -LiteralPath $ancestor -Force -ErrorAction Stop
      if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'complete runtime path contains a link' }
      $ancestor = [IO.Path]::GetDirectoryName($ancestor)
    }
  }
  $metadata = Join-Path $payloadRoot 'resources\runtime-reconstruction\manifest.json'
  if (-not (Test-Path -LiteralPath $metadata -PathType Leaf)) { throw 'complete runtime manifest is missing' }
  & $assertNoLinks $metadata
  if ((Get-Item -LiteralPath $metadata).Length -gt 262144 -or
      (Get-InstallerFileSHA256 $metadata) -cne $RuntimeManifestSHA256) {
    throw 'complete runtime manifest integrity mismatch'
  }
  try { $manifest = Get-Content -LiteralPath $metadata -Raw -Encoding UTF8 | ConvertFrom-Json }
  catch { throw 'invalid complete runtime manifest' }
  $files = @($manifest.completeFiles)
  $prefix = 'resources/app.asar.unpacked/node_modules/electron/'
  $required = @('dist/electron.exe', 'package.json')
  $external = $manifest.schemaVersion -eq 2
  if ($external) {
    if ($manifest.schemaVersion -isnot [int] -or $manifest.payloadKind -cne 'external-browser' -or
        $manifest.electronVersion -cne '44.7.0' -or $files.Count -ne 4) { throw 'invalid complete runtime manifest' }
    $required = @(
      'DeepSeek Harness Desktop.exe',
      'resources/app.asar',
      'resources/app.asar.unpacked/package.json',
      'resources/app.asar.unpacked/runtime-support/browser-component.json'
    )
  } elseif ($manifest.schemaVersion -ne 1 -or $files.Count -lt 2 -or $files.Count -gt 19) {
    throw 'invalid complete runtime manifest'
  }
  $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($file in $files) {
    $relative = [string] $file.target
    if ($external) {
      if ($file.target -isnot [string] -or $required -cnotcontains $relative -or
          ($file.size -isnot [int] -and $file.size -isnot [long]) -or $file.size -lt 0) {
        throw 'invalid complete runtime target'
      }
    } elseif (-not $relative.StartsWith($prefix, [StringComparison]::Ordinal) -or
        $relative -notmatch '^resources/app\.asar\.unpacked/node_modules/electron/(?:package\.json|dist/[a-zA-Z0-9_.\-]+|dist/locales/[a-zA-Z0-9_\-]+\.pak)$') {
      throw 'invalid complete runtime target'
    }
    if (-not $seen.Add($relative) -or $file.sha256 -cnotmatch '^[a-f0-9]{64}$') { throw 'invalid complete runtime target' }
    $path = Join-Path $payloadRoot $relative
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "complete runtime payload is missing: $relative" }
    & $assertNoLinks $path
    if ((Get-Item -LiteralPath $path).Length -ne $file.size -or (Get-InstallerFileSHA256 $path) -cne $file.sha256) {
      throw "complete runtime file integrity mismatch: $relative"
    }
  }
  foreach ($relative in $required) {
    $target = if ($external) { $relative } else { $prefix + $relative }
    if (-not $seen.Contains($target)) { throw "complete runtime payload is missing: $relative" }
  }
  Write-Output 'runtime-complete-payload-validated'
}

function Commit-Transaction {
  # Restoration is required even for fresh installs without an upgrade journal.
  # A failure here propagates to NSIS's existing commit rollback path.
  if ($CompleteRuntimePayload) {
    Assert-CompleteRuntimePayload
  } else {
    & (Join-Path $PSScriptRoot 'installer-runtime-restore.ps1') -InstallDirectory $normalizedInstallDirectory -ExpectedManifestSHA256 $RuntimeManifestSHA256
  }
  $journal = Read-Journal
  if ($null -eq $journal) {
    Write-Output 'upgrade-transaction-not-required'
    return
  }
  if ($journal.state -eq 'committed') {
    Retire-CommittedTransaction $journal
    return
  }
  if (-not (Test-ProductInstall $normalizedInstallDirectory)) {
    throw "new install is incomplete: $normalizedInstallDirectory"
  }
  $markerPath = Join-Path $normalizedInstallDirectory $upgradeMarkerRelativePath
  if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) {
    throw 'new install upgrade marker is missing'
  }
  $marker = Get-Content -LiteralPath $markerPath -Raw -Encoding UTF8 -ErrorAction Stop
  if ($marker.Trim() -cne $upgradeMarkerValue) {
    throw 'new install upgrade marker is invalid'
  }
  $journal.state = 'committed'
  Write-Journal $journal
  try { Retire-CommittedTransaction $journal } catch {
    # The commit is durable. Do not report an installation failure for a
    # journal move blocked by a scanner; Begin can retry it without data loss.
    Write-Output 'upgrade-transaction-backup-retained reason=cleanup-queue-unavailable'
  }
}

function Invoke-QueuedCleanup {
  # Manual/next-maintenance cleanup only enumerates this installation's queue.
  $directories = @(Get-ChildItem -LiteralPath $transactionTemp -Directory -Force |
    Where-Object { $_.Name -match ('^' + [regex]::Escape($cleanupPrefix) + '[a-f0-9]{32}$') })
  foreach ($directory in $directories) {
    & $PSCommandPath -Mode Cleanup -InstallDirectory $normalizedInstallDirectory `
      -InstallRegistryKey $InstallRegistryKey -UninstallRegistryKey $UninstallRegistryKey `
      -CleanupTransactionDirectory $directory.FullName
  }
}

# Serialize readers/writers of the same journal. Queue workers have a different
# mutex from active upgrades, so a slow backup deletion cannot hold up Begin.
$mutexId = Get-TransactionId $transactionRoot
$mutex = [Threading.Mutex]::new($false, "Local\DSHInstaller-$mutexId")
$ownsMutex = $false
try {
  try { $ownsMutex = $mutex.WaitOne(5000) } catch [Threading.AbandonedMutexException] { $ownsMutex = $true }
  if (-not $ownsMutex) { throw 'installer transaction is busy; retry after the other installer finishes' }
switch ($Mode) {
  'Begin' { Begin-Transaction }
  'ValidatePayload' { Assert-TargetPayloadAvailable -RecoverInterrupted }
  'PreparePayload' { Prepare-TargetPayload }
  'PromotePayload' { Promote-TargetPayload }
  'Commit' {
    Commit-Transaction
    if ($InstallerExecutable -or $InstallerStoreFile) {
      # The transaction is durable. A failed optional cache cannot trigger rollback.
      $cacheTiming = [Diagnostics.Stopwatch]::StartNew()
      try {
        $cacheDetail = Save-TargetVolumeInstaller
        Write-Output "installer-cache code=0 elapsed_ms=$($cacheTiming.ElapsedMilliseconds) $cacheDetail"
      } catch {
        Write-Output "installer-cache code=1 elapsed_ms=$($cacheTiming.ElapsedMilliseconds) $($_.Exception.Message)"
      }
    }
  }
  'Rollback' {
    $journal = Read-Journal
    if ($null -eq $journal) {
      Write-Output 'upgrade-transaction-not-required'
    } else {
      Invoke-Rollback $journal
    }
  }
  'Cleanup' {
    if ([string]::IsNullOrWhiteSpace($CleanupTransactionDirectory)) { Invoke-QueuedCleanup }
    $journal = Read-Journal
    if ($null -eq $journal) {
      Write-Output 'upgrade-transaction-not-required'
    } elseif ($journal.state -cne 'committed') {
      throw 'installer cleanup refused an uncommitted transaction'
    } else {
      Complete-CommittedTransaction $journal
    }
  }
}
} finally {
  if ($ownsMutex) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
