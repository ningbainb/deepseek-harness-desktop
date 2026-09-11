param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Begin', 'Commit', 'Rollback', 'Cleanup')]
  [string] $Mode,

  [Parameter(Mandatory = $true)]
  [string] $InstallDirectory,

  [string] $InstallRegistryKey = '',

  [string] $UninstallRegistryKey = '',

  [string] $CleanupTransactionDirectory = ''
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
    [pscustomobject]@{ Provider = 'HKEY_CURRENT_USER'; Command = 'HKCU' },
    [pscustomobject]@{ Provider = 'HKEY_LOCAL_MACHINE'; Command = 'HKLM' }
  )) {
    foreach ($key in @($InstallRegistryKey, $UninstallRegistryKey)) {
      if ([string]::IsNullOrWhiteSpace($key)) {
        continue
      }
      $entries.Add([pscustomobject]@{
        ProviderPath = "Registry::$($hive.Provider)\$key"
        CommandPath = "$($hive.Command)\$key"
      })
    }
  }
  $entries
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

function Remove-RegistryEntries([object[]] $entries) {
  foreach ($entry in $entries) {
    Remove-Item -LiteralPath ([string] $entry.providerPath) -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Invoke-RegistryImport([string] $exportPath) {
  & $registryExecutable IMPORT $exportPath | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "registry import failed with exit code $LASTEXITCODE`: $exportPath"
  }
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

  if ($hasBackup -and -not [bool] $journal.targetExisted -and
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
      Remove-Item -LiteralPath $install.Root -Recurse -Force -ErrorAction Stop
    }
    [System.IO.Directory]::Move($install.Backup, $install.Root)
    Write-Output "upgrade-install-restored root=$($install.Root)"
  }

  Remove-RegistryEntries @($journal.registry)
  foreach ($entry in @($journal.registry | Where-Object { [bool] $_.present })) {
    $exportPath = Join-Path $transactionRoot ([string] $entry.exportFile)
    if (-not (Test-Path -LiteralPath $exportPath -PathType Leaf)) {
      throw "registry backup is missing: $exportPath"
    }
    Invoke-RegistryImport $exportPath
  }

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

  foreach ($entry in $registryEntries) {
    $state = Get-ItemProperty -LiteralPath $entry.ProviderPath -ErrorAction SilentlyContinue
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

  $presentRegistryCount = @($registryEntries | Where-Object {
    Test-Path -LiteralPath $_.ProviderPath
  }).Count
  if ($installPlans.Count -eq 0 -and $presentRegistryCount -eq 0) {
    Write-Output 'upgrade-transaction-not-required'
    return
  }

  [System.IO.Directory]::CreateDirectory($transactionRoot) | Out-Null
  $registryJournal = [System.Collections.Generic.List[object]]::new()
  for ($index = 0; $index -lt $registryEntries.Count; $index += 1) {
    $entry = $registryEntries[$index]
    $present = Test-Path -LiteralPath $entry.ProviderPath
    $exportFile = "registry-$index.reg"
    if ($present) {
      $exportPath = Join-Path $transactionRoot $exportFile
      & $registryExecutable EXPORT $entry.CommandPath $exportPath /y | Out-Null
      if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $exportPath -PathType Leaf)) {
        throw "registry export failed: $($entry.CommandPath)"
      }
    }
    $registryJournal.Add([pscustomobject]@{
      providerPath = $entry.ProviderPath
      commandPath = $entry.CommandPath
      present = $present
      exportFile = $exportFile
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
  }
  Write-Journal $journal

  try {
    foreach ($rawInstall in $installPlans) {
      $install = Assert-InstallBackup $rawInstall
      [System.IO.Directory]::Move($install.Root, $install.Backup)
      Write-Output "upgrade-install-staged root=$($install.Root)"
    }
    Remove-RegistryEntries @($registryJournal)
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

function Commit-Transaction {
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
  'Commit' { Commit-Transaction }
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
