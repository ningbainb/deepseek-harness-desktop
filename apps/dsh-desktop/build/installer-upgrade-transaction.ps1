param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Begin', 'Commit', 'Rollback')]
  [string] $Mode,

  [Parameter(Mandatory = $true)]
  [string] $InstallDirectory,

  [string] $InstallRegistryKey = '',

  [string] $UninstallRegistryKey = ''
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
$transactionRoot = Join-Path ([System.IO.Path]::GetTempPath()) "dsh-desktop-installer-transaction-$transactionId"
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
    Remove-Item -LiteralPath $transactionRoot -Recurse -Force -ErrorAction Stop
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
        $retained.Add($install.Backup)
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

function Invoke-Rollback([object] $journal) {
  if ($journal.state -eq 'committed') {
    Complete-CommittedTransaction $journal
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
  $existingJournal = Read-Journal
  if ($null -ne $existingJournal) {
    if ($existingJournal.state -eq 'committed') {
      Complete-CommittedTransaction $existingJournal
      if (Test-Path -LiteralPath $journalPath -PathType Leaf) {
        throw 'previous committed installer backup still requires cleanup'
      }
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
    Complete-CommittedTransaction $journal
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
  Complete-CommittedTransaction $journal
}

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
}
